const { BASE_URL, headers, ok, err, preflight } = require("./config");

/**
 * POST — Crée ou met à jour l'assistant Vapi d'un client.
 *
 * Body : {
 *   clientId      : string  (Airtable record ID du client)
 *   nomAssistant  : string
 *   voiceId       : string  (ElevenLabs voice_id)
 *   langue        : string  (ex: "fr")
 *   promptSysteme : string
 *   tonalite      : string
 *   vitesseParole : number
 *   silenceMax    : number
 *   interruptions : boolean
 * }
 *
 * Flux :
 *   1. GET /Clients/{clientId} → lire VapiAssistantId
 *   2a. Si pas d'ID : POST https://api.vapi.ai/assistant → créer
 *       → PATCH /Clients/{clientId} avec VapiAssistantId retourné
 *   2b. Si ID existant : PATCH https://api.vapi.ai/assistant/{id} → mettre à jour
 *
 * Variables d'env requises : VAPI_API_KEY
 */
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Méthode non autorisée", 405);

  const vapiKey = process.env.VAPI_API_KEY;
  if (!vapiKey) return err("VAPI_API_KEY non configuré", 500);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return err("JSON invalide", 400); }

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

  if (!clientId) return err("clientId requis", 400);

  /* 1. Récupérer VapiAssistantId depuis Airtable */
  let existingAssistantId = null;
  try {
    const clientRes  = await fetch(`${BASE_URL}/Clients/${clientId}`, { headers });
    if (!clientRes.ok) return err(`Airtable ${clientRes.status}`, 502);
    const clientData = await clientRes.json();
    existingAssistantId = clientData.fields?.VapiAssistantId || null;
  } catch (e) {
    console.error("[create-vapi-assistant] Airtable read error:", e.message);
    return err(e.message);
  }

  /* Payload Vapi */
  const LANG_MAP = {
    "fr": "fr", "fr-FR": "fr",
    "en": "en", "en-US": "en",
    "es": "es", "ar": "ar", "pt": "pt",
  };
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
      /* 2a. Créer un nouvel assistant */
      const createRes = await fetch("https://api.vapi.ai/assistant", {
        method:  "POST",
        headers: {
          Authorization:  `Bearer ${vapiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(vapiPayload),
      });

      if (!createRes.ok) {
        const text = await createRes.text();
        console.error("[create-vapi-assistant] Vapi create error:", createRes.status, text);
        return err(`Vapi API ${createRes.status}: ${text}`, 502);
      }

      const createData = await createRes.json();
      assistantId = createData.id;
      created = true;

      /* Sauvegarder VapiAssistantId dans Airtable */
      const patchRes = await fetch(`${BASE_URL}/Clients/${clientId}`, {
        method:  "PATCH",
        headers,
        body: JSON.stringify({ fields: { VapiAssistantId: assistantId } }),
      });
      if (!patchRes.ok) {
        const text = await patchRes.text();
        console.warn("[create-vapi-assistant] Airtable PATCH warning:", patchRes.status, text);
      }
    } else {
      /* 2b. Mettre à jour l'assistant existant */
      assistantId = existingAssistantId;

      const updateRes = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
        method:  "PATCH",
        headers: {
          Authorization:  `Bearer ${vapiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(vapiPayload),
      });

      if (!updateRes.ok) {
        const text = await updateRes.text();
        console.error("[create-vapi-assistant] Vapi update error:", updateRes.status, text);
        return err(`Vapi API ${updateRes.status}: ${text}`, 502);
      }
    }

    return ok({
      ok:          true,
      assistantId,
      created,
      voiceId:     voiceId || null,
    });
  } catch (e) {
    console.error("[create-vapi-assistant]", e.message);
    return err(e.message);
  }
};
