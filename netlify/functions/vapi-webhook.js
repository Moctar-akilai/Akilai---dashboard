const { preflight, corsHeaders } = require("./config");

const HISTORIQUE_TABLE  = "tblxXBGjv6iZU41XY";
const AUTOMATIONS_TABLE = "tble4KroqvA1JodJs";
const CLIENTS_TABLE     = "tble0g9eMTjAfw6OO";

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

  // ── Logs de diagnostic complets ──
  console.log("[vapi-webhook] PAYLOAD COMPLET:", JSON.stringify(body).substring(0, 3000));
  console.log("[vapi-webhook] MESSAGE KEYS:", Object.keys(message).join(", "));
  if (message.call) {
    console.log("[vapi-webhook] CALL KEYS:", Object.keys(message.call).join(", "));
  }
  console.log("[vapi-webhook] type:", msgType);

  // ── assistant-request : lookup pré-appel pour accueil personnalisé immédiat ──
  if (msgType === "assistant-request") {
    const phoneNumberId = message.call?.phoneNumberId || message.phoneNumberId || "";
    const callerNumber  = message.call?.customer?.number || message.customer?.number || "";
    console.log("[vapi-webhook] assistant-request | phoneNumberId:", phoneNumberId, "| callerNumber:", callerNumber);

    // Fallback sans personnalisation si données insuffisantes
    const fallbackResponse = (assistantId) => ({
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify(assistantId ? { assistantId } : {}),
    });

    if (!phoneNumberId) {
      console.warn("[vapi-webhook] assistant-request sans phoneNumberId — fallback");
      return fallbackResponse(null);
    }

    try {
      // STEP 1 — Trouver le client propriétaire du numéro Vapi (lookup par phoneNumberId)
      const ownerFormula = encodeURIComponent(`{Numéro Vapi}="${phoneNumberId}"`);
      const ownerUrl     = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${CLIENTS_TABLE}?filterByFormula=${ownerFormula}&maxRecords=1`;

      // STEP 2 — Lookup appelant en parallèle (optimisation : on ne peut chercher qu'avec userId connu après step 1)
      const ownerRes  = await fetch(ownerUrl, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
      const ownerData = await ownerRes.json();
      const ownerRecord = ownerData.records?.[0];

      if (!ownerRecord) {
        console.warn("[vapi-webhook] aucun client trouvé pour phoneNumberId:", phoneNumberId);
        return fallbackResponse(null);
      }

      const ownerFields  = ownerRecord.fields;
      const assistantId  = ownerFields.VapiAssistantId || "";
      const userId       = ownerFields["User ID"] || ownerFields.Email || "";
      const nomAssistant = ownerFields.NomAssistant || "votre assistant";

      console.log("[vapi-webhook] client owner:", userId, "| assistantId:", assistantId);

      if (!assistantId) {
        console.warn("[vapi-webhook] VapiAssistantId vide pour ce numéro");
        return fallbackResponse(null);
      }

      // STEP 2 — Chercher l'appelant dans les contacts du client
      let firstMessage;
      let callerPrefix = "";

      if (callerNumber && userId) {
        const callerFormula = encodeURIComponent(`AND({User ID}="${userId}",{Numéro}="${callerNumber}")`);
        const callerUrl     = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/tblmBABwZaL2HTSx6?filterByFormula=${callerFormula}&maxRecords=1`;
        const callerRes     = await fetch(callerUrl, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
        const callerData    = await callerRes.json();
        const callerRecord  = callerData.records?.[0];

        if (callerRecord) {
          const cf      = callerRecord.fields;
          const prenom  = cf["Prénom"] || cf["Nom"] || "";
          const nom     = cf["Nom"]    || "";
          const contexte = cf["Contexte"] || "";
          const nb      = Number(cf["Nb appels"] || 0);
          const dernier = cf["Derniere Interaction"] || cf["Dernier appel"] || null;
          const dernierFr = dernier
            ? new Date(dernier).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })
            : null;

          console.log("[vapi-webhook] appelant connu:", prenom, nom, "| nb appels:", nb);

          firstMessage = prenom
            ? `Bonjour ${prenom}, je suis ravi de vous retrouver. Comment puis-je vous aider ?`
            : `Bonjour, je suis ravi de vous retrouver. Comment puis-je vous aider ?`;

          callerPrefix  = `APPELANT IDENTIFIÉ : ${[prenom, nom].filter(Boolean).join(" ")} (numéro : ${callerNumber}).`;
          if (nb > 0)      callerPrefix += ` ${nb} interaction(s) précédente(s).`;
          if (dernierFr)   callerPrefix += ` Dernier contact : ${dernierFr}.`;
          if (contexte)    callerPrefix += ` Contexte : ${contexte}`;
          callerPrefix += `\nNe pas redemander le nom de cet appelant. Enchaîner directement avec sa demande.\n\n`;
        } else {
          console.log("[vapi-webhook] appelant inconnu:", callerNumber);
          firstMessage  = `Bonjour, ${nomAssistant} à votre service. Comment puis-je vous aider ?`;
          callerPrefix  = `APPELANT INCONNU (numéro : ${callerNumber || "masqué"}). Demander le nom poliment en début d'appel.\n\n`;
        }
      } else {
        firstMessage = `Bonjour, ${nomAssistant} à votre service. Comment puis-je vous aider ?`;
      }

      // STEP 3 — Retourner assistantId + overrides
      const assistantOverrides = {
        firstMessage,
        ...(callerPrefix && {
          model: {
            messages: [{ role: "system", content: callerPrefix }],
          },
        }),
      };

      console.log("[vapi-webhook] assistant-request → assistantId:", assistantId, "| firstMessage:", firstMessage);

      return {
        statusCode: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ assistantId, assistantOverrides }),
      };
    } catch (e) {
      console.error("[vapi-webhook] assistant-request erreur:", e.message);
      return fallbackResponse(null);
    }
  }

  if (msgType !== "end-of-call-report") {
    console.log("[vapi-webhook] événement ignoré:", msgType);
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true, ignored: true }) };
  }

  const call = message.call || {};
  if (!call.id) {
    console.error("[vapi-webhook] pas de call.id dans le body");
    return { statusCode: 400, headers: corsHeaders, body: "No call data" };
  }

  // ── Extraction selon structure réelle confirmée ──
  const callId      = call.id;
  const assistantId = call.assistantId || "";
  const cout        = message.cost        || call.cost        || 0;
  const endedReason = message.endedReason || call.endedReason || "";

  // Transcription
  const transcription = message.transcript || message.artifact?.transcript || "";

  // Durée
  const duree = Math.round(
    message.durationSeconds ||
    (message.durationMs ? message.durationMs / 1000 : 0) ||
    call.duration           || 0
  );

  // Résumé
  const resume = message.analysis?.summary || message.summary || "";

  // Statut : "true" → Succès, tout autre valeur → Échec
  const statut = message.analysis?.successEvaluation === "true" ? "Succès" : "Échec";

  // Enregistrement
  const enregistrement = message.artifact?.recordingUrl || message.recordingUrl || "";

  // Numéro client
  const numeroClient = message.call?.customer?.number || message.customer?.number || "";

  // Metadata → userId/clientId
  const metadata = message.assistant?.metadata || {};
  let userId   = metadata.userId   || "";
  let clientId = metadata.clientId || "";

  // Fallback : chercher le client par VapiAssistantId si userId vide
  let clientFields = {};
  if (!userId && assistantId) {
    try {
      const searchUrl  = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${CLIENTS_TABLE}?filterByFormula={VapiAssistantId}="${assistantId}"&maxRecords=1`;
      const searchRes  = await fetch(searchUrl, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
      const searchData = await searchRes.json();
      if (searchData.records?.length > 0) {
        const client = searchData.records[0];
        userId       = client.fields["User ID"] || client.fields["Email"] || "";
        clientId     = client.id;
        clientFields = client.fields;
        console.log("[vapi-webhook] client trouvé par assistantId:", userId);
      }
    } catch (e) {
      console.warn("[vapi-webhook] lookup client par assistantId échec:", e.message);
    }
  }

  // Charger les champs client si on a userId mais pas encore clientFields
  if (userId && !clientFields["Google Connected"] && !clientFields["Notion Connected"]) {
    try {
      const cUrl  = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${CLIENTS_TABLE}?filterByFormula={User ID}="${userId}"&maxRecords=1`;
      const cRes  = await fetch(cUrl, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
      const cData = await cRes.json();
      if (cData.records?.length > 0) {
        clientId     = clientId || cData.records[0].id;
        clientFields = cData.records[0].fields;
      }
    } catch (e) {
      console.warn("[vapi-webhook] lookup client par userId échec:", e.message);
    }
  }

  console.log("[vapi-webhook] userId final:", userId);
  console.log("[vapi-webhook] clientId final:", clientId);
  console.log("[vapi-webhook] durée:", duree);
  console.log("[vapi-webhook] transcript length:", transcription.length);
  console.log("[vapi-webhook] statut:", statut, "| enregistrement:", enregistrement ? "oui" : "non");

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

    // ── Google Calendar : détecter RDV dans la transcription ──
    const transcriptLower = transcription.toLowerCase();
    const rdvDetecte =
      transcriptLower.includes("rendez-vous") ||
      transcriptLower.includes("rdv") ||
      transcriptLower.includes("appointment");

    if (rdvDetecte && clientFields["Google Connected"]) {
      console.log("[vapi-webhook] RDV détecté + Google Calendar connecté — création événement…");
      try {
        await fetch(
          `${process.env.URL || "https://portal-akilai.netlify.app"}/.netlify/functions/google-calendar-create-event`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId,
              titre:       `RDV — ${numeroClient || userId}`,
              description: resume || "",
              dateDebut:   new Date(Date.now() + 86400000).toISOString(),
              dateFin:     new Date(Date.now() + 86400000 + 3600000).toISOString(),
              inviteEmail: "",
            }),
          }
        );
        console.log("[vapi-webhook] RDV créé dans Google Calendar");
      } catch (calErr) {
        console.error("[vapi-webhook] Erreur création RDV Google Calendar:", calErr.message);
      }
    }

    // ── Mémoire contextuelle — mettre à jour le contexte contact ──
    if (numeroClient && userId) {
      try {
        await fetch(`${process.env.URL || "https://portal-akilai.netlify.app"}/.netlify/functions/update-contact-context`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            userId,
            numero: numeroClient,
            resume: resume || transcription.substring(0, 300),
            canal:  "Vocal",
          }),
        });
        console.log("[vapi-webhook] contexte contact mis à jour");
      } catch (ctxErr) {
        console.error("[vapi-webhook] Erreur update contexte:", ctxErr.message);
      }
    }

    // ── CRM Router — mettre à jour le contact ──
    if (numeroClient) {
      try {
        await fetch(`${process.env.URL || "https://portal-akilai.netlify.app"}/.netlify/functions/crm-router`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            contactData: { numero: numeroClient, nom: "", source: "Appel vocal" },
            callData:    { date: new Date().toISOString(), duree, resume, statut, transcript: transcription.substring(0, 500) },
          }),
        });
        console.log("[vapi-webhook] CRM mis à jour");
      } catch (crmErr) {
        console.error("[vapi-webhook] Erreur CRM Router:", crmErr.message);
      }
    }

    // ── Notion — créer fiche après chaque appel ──
    if (clientFields["Notion Connected"] && userId) {
      try {
        await fetch(
          `${process.env.URL || "https://portal-akilai.netlify.app"}/.netlify/functions/notion-create-page`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId,
              titre:   `Appel — ${numeroClient || "Inconnu"} — ${new Date().toLocaleDateString("fr-FR")}`,
              contenu: resume || transcription.substring(0, 500),
              metadata: { duree, statut, numeroClient },
            }),
          }
        );
        console.log("[vapi-webhook] fiche Notion créée");
      } catch (notionErr) {
        console.error("[vapi-webhook] Erreur création fiche Notion:", notionErr.message);
      }
    }

    // ── Calendly — log du lien (envoi SMS à implémenter) ──
    if (clientFields["Calendly Connected"] && numeroClient) {
      console.log("[vapi-webhook] lien Calendly à envoyer:", clientFields["Calendly Link"]);
      // TODO: envoyer SMS avec lien Calendly via Twilio
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
