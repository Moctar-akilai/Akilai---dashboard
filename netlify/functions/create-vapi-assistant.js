const { BASE_URL, headers, ok, err, preflight } = require("./config");

exports.handler = async function(event, context) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Méthode non autorisée", 405);

  const vapiKey = process.env.VAPI_API_KEY;
  if (!vapiKey) return err("VAPI_API_KEY non configuré", 500);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch(e) { return err("JSON invalide", 400); }

  const {
    clientId,
    nomAssistant  = "Assistant",
    voiceId,
    langue        = "fr",
    promptSysteme = "",
    vitesseParole = 1.0,
    silenceMax    = 8,
    interruptions = true,
  } = body;

  let existingAssistantId = null;
  if (clientId) {
    try {
      const clientRes = await fetch(`${BASE_URL}/Clients/${clientId}`, { headers });
      if (clientRes.ok) {
        const clientData = await clientRes.json();
        existingAssistantId = clientData.fields?.VapiAssistantId || null;
      }
    } catch (e) {
      console.warn("[create-vapi-assistant] Airtable fetch:", e.message);
    }
  }

  const LANG_MAP = { "fr":"fr", "fr-FR":"fr", "en":"en", "en-US":"en", "es":"es", "ar":"ar", "pt":"pt" };
  const transcriberLang = LANG_MAP[langue] || "fr";

  const vapiPayload = {
    name: nomAssistant,
    voice: {
      provider: "11labs",
      voiceId:  voiceId || "21m00Tcm4TlvDq8ikWAM",
      speed:    parseFloat(vitesseParole) || 1.0,
    },
    model: {
      provider:     "openai",
      model:        "gpt-4o-mini",
      systemPrompt: promptSysteme,
    },
    transcriber: {
      provider: "deepgram",
      language: transcriberLang,
    },
    silenceTimeoutSeconds:      parseInt(silenceMax) || 8,
    backgroundDenoisingEnabled: true,
    endCallOnSilence:           !interruptions,
  };

  try {
    let assistantId;
    let created = false;

    if (!existingAssistantId) {
      const createRes = await fetch("https://api.vapi.ai/assistant", {
        method:  "POST",
        headers: { Authorization: `Bearer ${vapiKey}`, "Content-Type": "application/json" },
        body:    JSON.stringify(vapiPayload),
      });

      if (!createRes.ok) {
        const text = await createRes.text();
        return err(`Vapi API ${createRes.status}: ${text}`, 502);
      }

      const createData = await createRes.json();
      assistantId      = createData.id;
      created          = true;

      if (clientId) {
        await fetch(`${BASE_URL}/Clients/${clientId}`, {
          method: "PATCH", headers,
          body:   JSON.stringify({ fields: { VapiAssistantId: assistantId } }),
        }).catch(e => console.warn("[create-vapi-assistant] Airtable PATCH:", e.message));
      }
    } else {
      assistantId = existingAssistantId;

      const updateRes = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
        method:  "PATCH",
        headers: { Authorization: `Bearer ${vapiKey}`, "Content-Type": "application/json" },
        body:    JSON.stringify(vapiPayload),
      });

      if (!updateRes.ok) {
        const text = await updateRes.text();
        return err(`Vapi API ${updateRes.status}: ${text}`, 502);
      }
    }

    return ok({ ok: true, assistantId, created, voiceId: voiceId || null });
  } catch (e) {
    console.error("[create-vapi-assistant]", e.message);
    return err(e.message);
  }
};
