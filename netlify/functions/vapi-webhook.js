const { BASE_URL, headers: airtableHeaders, corsHeaders, preflight } = require("./config");

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  try {
    const payload = JSON.parse(event.body || "{}");
    const { userId, transcript, resume, numeroClient } = payload;

    console.log("[vapi-webhook] Payload reçu, userId:", userId);

    if (!userId) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "userId requis" }) };
    }

    // Fetch client data
    const searchUrl = `${BASE_URL}/Clients?filterByFormula=${encodeURIComponent(`{User ID}="${userId}"`)}`;
    const clientRes = await fetch(searchUrl, { headers: airtableHeaders });
    const clientData = await clientRes.json();
    const clientRecord = clientData.records && clientData.records[0];
    const clientFields = clientRecord ? clientRecord.fields : {};

    const googleConnected = clientFields["Google Connected"] || false;

    // Create Historique record
    const historiqueBody = {
      fields: {
        "User ID":      userId,
        "Transcript":   transcript || "",
        "Résumé":       resume     || "",
        "Numéro":       numeroClient || "",
        "Date":         new Date().toISOString(),
      },
    };

    const histRes = await fetch(`${BASE_URL}/Historique`, {
      method: "POST",
      headers: airtableHeaders,
      body: JSON.stringify(historiqueBody),
    });

    if (!histRes.ok) {
      const t = await histRes.text();
      console.error("[vapi-webhook] Erreur création Historique:", histRes.status, t);
    } else {
      console.log("[vapi-webhook] Historique créé");
    }

    // Detect RDV keywords and create Google Calendar event
    const transcriptLower = (transcript || "").toLowerCase();
    const rdvDetecte =
      transcriptLower.includes("rendez-vous") ||
      transcriptLower.includes("rdv") ||
      transcriptLower.includes("appointment");

    if (rdvDetecte && googleConnected) {
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
        console.error("[vapi-webhook] Erreur création RDV:", calErr.message);
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ ok: true }),
    };
  } catch (e) {
    console.error("[vapi-webhook] Exception:", e.message, e.stack);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: e.message }) };
  }
};
