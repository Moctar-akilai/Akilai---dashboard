const { preflight, corsHeaders } = require("./config");

const HISTORIQUE_TABLE  = "tblxXBGjv6iZU41XY";
const AUTOMATIONS_TABLE = "tble4KroqvA1JodJs";

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: "Method not allowed" };
  }

  const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    console.error("[vapi-webhook] AIRTABLE_API_KEY ou AIRTABLE_BASE_ID non configuré");
    return { statusCode: 500, headers: corsHeaders, body: "Airtable non configuré" };
  }

  const airtableHeaders = {
    Authorization:  `Bearer ${AIRTABLE_API_KEY}`,
    "Content-Type": "application/json",
  };

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) {
    return { statusCode: 400, headers: corsHeaders, body: "JSON invalide" };
  }

  const message = body.message || body;
  const msgType = message.type || "";
  console.log("[vapi-webhook] type:", msgType);
  console.log("[vapi-webhook] body complet:", JSON.stringify(body).substring(0, 2000));

  if (msgType !== "end-of-call-report") {
    console.log("[vapi-webhook] événement ignoré:", msgType);
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true, ignored: true }) };
  }

  const call = message.call || {};
  if (!call.id) {
    console.error("[vapi-webhook] pas de call.id dans le body");
    return { statusCode: 400, headers: corsHeaders, body: "No call data" };
  }

  const callId      = call.id;
  const cout        = message.cost        || call.cost        || 0;
  const endedReason = message.endedReason || call.endedReason || "";

  // Métadonnées : chercher dans tous les emplacements possibles
  const metadata =
    message.assistant?.metadata            ||
    message.assistantOverrides?.metadata   ||
    call.assistantOverrides?.metadata      ||
    call.assistant?.metadata               || {};
  const userId   = metadata.userId   || "";
  const clientId = metadata.clientId || "";

  // Numéro client
  const numeroClient = message.customer?.number || call.customer?.number || "";

  // Transcription : message.artifact en priorité
  const transcription =
    message.artifact?.transcript ||
    message.transcript            ||
    call.transcript               || "";

  // Durée
  let duree = Math.round(message.durationSeconds || message.artifact?.duration || call.duration || 0);
  if (!duree && (call.startedAt || message.startedAt) && (call.endedAt || message.endedAt)) {
    duree = Math.round(
      (new Date(call.endedAt || message.endedAt) - new Date(call.startedAt || message.startedAt)) / 1000
    );
  }

  // Résumé
  const resume =
    message.analysis?.summary ||
    message.summary            ||
    call.analysis?.summary     ||
    call.summary               || "";

  // Enregistrement
  const enregistrement =
    message.artifact?.recordingUrl ||
    message.recordingUrl            ||
    call.recordingUrl               || "";

  // Statut
  const successEval = message.analysis?.successEvaluation ?? call.analysis?.successEvaluation;
  const statut = successEval === "false" ? "Échec" : "Succès";

  // Debug logs
  console.log("[vapi-webhook] callId:", callId);
  console.log("[vapi-webhook] userId:", userId, "| clientId:", clientId);
  console.log("[vapi-webhook] durée calculée:", duree, "| statut:", statut);
  console.log("[vapi-webhook] call keys:", Object.keys(call).join(", "));
  console.log("[vapi-webhook] message keys:", Object.keys(message).join(", "));
  console.log("[vapi-webhook] analysis:", JSON.stringify(message.analysis || call.analysis));
  console.log("[vapi-webhook] metadata:", JSON.stringify(metadata));
  console.log("[vapi-webhook] artifact keys:", Object.keys(message.artifact || {}).join(", "));

  const fields = {
    "Titre":               `Appel vocal — ${numeroClient || "Inconnu"}`,
    "Type":                "Voix",
    "Canal":               "Vocal",
    "Statut":              statut,
    "User ID":             userId,
    "Numéro client":       numeroClient,
    "Durée":               duree,
    "Transcription":       transcription,
    "Résumé":              resume,
    "Enregistrement audio": enregistrement,
    "Vapi Call ID":        callId,
    "Détails":             `Coût: $${cout}${endedReason ? " | Fin: " + endedReason : ""}`,
  };

  if (clientId) fields["Client"] = [clientId];

  try {
    // ── Créer le record Historique ──
    const histRes  = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${HISTORIQUE_TABLE}`, {
      method: "POST",
      headers: airtableHeaders,
      body: JSON.stringify({ records: [{ fields }], typecast: true }),
    });
    const histData = await histRes.json();

    if (!histRes.ok) {
      console.error("[vapi-webhook] Airtable Historique error:", JSON.stringify(histData));
      return { statusCode: 500, headers: corsHeaders, body: "Airtable error" };
    }

    const recordId = histData.records[0].id;
    console.log("[vapi-webhook] record créé:", recordId);

    // ── Incrémenter "Appels traités" sur l'automatisation ──
    if (userId) {
      try {
        const autoUrl  = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AUTOMATIONS_TABLE}?filterByFormula={User ID}="${userId}"&maxRecords=1`;
        const autoRes  = await fetch(autoUrl, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
        const autoData = await autoRes.json();

        if (autoData.records?.length > 0) {
          const auto  = autoData.records[0];
          const count = Number(auto.fields["Appels traités"] || 0);
          await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AUTOMATIONS_TABLE}/${auto.id}`, {
            method: "PATCH",
            headers: airtableHeaders,
            body: JSON.stringify({ fields: { "Appels traités": count + 1 } }),
          });
          console.log("[vapi-webhook] compteur Appels traités:", count + 1);
        }
      } catch (e) {
        console.warn("[vapi-webhook] compteur auto échec (non bloquant):", e.message);
      }
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, recordId }),
    };
  } catch (err) {
    console.error("[vapi-webhook] erreur:", err.message);
    return { statusCode: 500, headers: corsHeaders, body: err.message };
  }
};
