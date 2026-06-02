/**
 * vapi-webhook.js
 * Reçoit les événements webhook Vapi (end-of-call-report).
 * PATCH le record Historique correspondant pour ajouter "Vapi Call ID"
 * afin de permettre la lecture audio authentifiée via get-vapi-recording.
 *
 * Configurer dans Vapi Dashboard → Assistants → Server URL :
 *   https://{votre-site}.netlify.app/.netlify/functions/vapi-webhook
 */

const { BASE_URL, headers, preflight, corsHeaders } = require("./config");
const HISTORIQUE_TABLE = "tblxXBGjv6iZU41XY";

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: "Method not allowed" };
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) {
    return { statusCode: 400, headers: corsHeaders, body: "JSON invalide" };
  }

  const msgType = body.message?.type || body.type || "";
  console.log("[vapi-webhook] type:", msgType);

  // On ne traite que end-of-call-report
  if (msgType !== "end-of-call-report") {
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true, ignored: true }) };
  }

  const call = body.message?.call || body.call || {};
  const callId = call.id || body.message?.callId || "";
  if (!callId) {
    console.warn("[vapi-webhook] callId absent");
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true, ignored: true }) };
  }

  // Récupérer le userId depuis les metadata de l'appel
  const metadata = call.metadata || body.message?.metadata || {};
  const userId = metadata.userId || metadata.user_id || call.assistantId || "";

  console.log("[vapi-webhook] callId:", callId, "userId:", userId);

  try {
    // Chercher le record Historique créé aujourd'hui pour ce userId
    // (Make crée le record juste après la fin d'appel)
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

    let filterFormula = `AND({Type}="Voix",OR(DATESTR({Date de creation})="${today}",DATESTR({Date de creation})="${yesterday}"))`;
    if (userId) {
      filterFormula = `AND({User ID}="${userId}",{Type}="Voix",OR(DATESTR({Date de creation})="${today}",DATESTR({Date de creation})="${yesterday}"))`;
    }

    const params = new URLSearchParams({
      filterByFormula: filterFormula,
      "sort[0][field]": "Date de creation",
      "sort[0][direction]": "desc",
      maxRecords: "5",
    });

    const searchRes = await fetch(`${BASE_URL}/${HISTORIQUE_TABLE}?${params}`, { headers });
    const searchData = await searchRes.json();
    const records = searchData.records || [];

    console.log("[vapi-webhook] records trouvés:", records.length);

    // Trouver le record sans Vapi Call ID (le plus récent)
    const target = records.find(r => !r.fields["Vapi Call ID"]);

    if (!target) {
      console.warn("[vapi-webhook] aucun record Historique à patcher pour callId:", callId);
      // Pas d'erreur — Make n'a peut-être pas encore créé le record, on ignore
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true, patched: false }) };
    }

    // PATCH le record avec le callId
    const patchRes = await fetch(`${BASE_URL}/${HISTORIQUE_TABLE}/${target.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ fields: { "Vapi Call ID": callId } }),
    });
    const patchData = await patchRes.json();

    if (patchData.error) {
      console.error("[vapi-webhook] Airtable patch error:", patchData.error.message);
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: false, error: patchData.error.message }) };
    }

    console.log("[vapi-webhook] Patché record", target.id, "avec callId:", callId);
    return {
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, patched: true, recordId: target.id }),
    };
  } catch (e) {
    console.error("[vapi-webhook] Exception:", e.message);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: e.message }) };
  }
};
