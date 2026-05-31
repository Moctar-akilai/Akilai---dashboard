const { ok, err, preflight } = require("./config");

/**
 * POST — Met à jour l'assistant Vapi en temps réel depuis la config Voix & IA.
 *
 * Body : {
 *   voix          : string  (ex: "chloe", "thomas")
 *   promptSysteme : string
 *   vitesseParole : number
 *   silenceMax    : number
 *   interruptions : boolean
 *   nomAssistant  : string
 *   langue        : string
 * }
 *
 * Appel : PATCH https://api.vapi.ai/assistant/{VAPI_ASSISTANT_ID}
 *   Body : {
 *     name   : nomAssistant,
 *     voice  : { provider: "azure"|"11labs", voiceId: voix },
 *     model  : { provider: "openai", model: "gpt-4o", systemPrompt },
 *     transcriber : { language: langue },
 *     silenceTimeoutSeconds : silenceMax,
 *     backgroundDenoisingEnabled: true,
 *   }
 *
 * Variables d'env requises : VAPI_API_KEY, VAPI_ASSISTANT_ID
 */
exports.handler = async function(event, context) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Méthode non autorisée", 405);

  const vapiKey         = process.env.VAPI_API_KEY;
  const vapiAssistantId = process.env.VAPI_ASSISTANT_ID;

  if (!vapiKey)         return err("VAPI_API_KEY non configuré", 500);
  if (!vapiAssistantId) return err("VAPI_ASSISTANT_ID non configuré", 500);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch(e) { return err("JSON invalide", 400); }

  const {
    voix,
    promptSysteme,
    vitesseParole = 1.0,
    silenceMax    = 3,
    interruptions = true,
    nomAssistant  = "Sophie",
    langue        = "fr-FR",
  } = body;

  /* Mapping voix → provider Vapi */
  const VOICE_PROVIDER_MAP = {
    chloe:  { provider: "azure",  voiceId: "fr-FR-DeniseNeural"  },
    thomas: { provider: "azure",  voiceId: "fr-FR-HenriNeural"   },
    sofia:  { provider: "azure",  voiceId: "es-ES-ElviraNeural"  },
    james:  { provider: "azure",  voiceId: "en-US-GuyNeural"     },
    amina:  { provider: "azure",  voiceId: "ar-SA-ZariyahNeural" },
  };
  const voiceConfig = VOICE_PROVIDER_MAP[voix] || { provider: "azure", voiceId: "fr-FR-DeniseNeural" };

  /* Mapping langue → code transcriber */
  const LANG_MAP = {
    "fr": "fr", "fr-FR": "fr",
    "en": "en", "en-US": "en",
    "es": "es", "ar": "ar", "pt": "pt",
  };
  const transcriberLang = LANG_MAP[langue] || "fr";

  const vapiPayload = {
    name:  nomAssistant,
    voice: {
      provider: voiceConfig.provider,
      voiceId:  voiceConfig.voiceId,
      speed:    parseFloat(vitesseParole) || 1.0,
    },
    model: {
      provider:     "openai",
      model:        "gpt-4o-mini",
      systemPrompt: promptSysteme || "",
    },
    transcriber: {
      provider: "deepgram",
      language: transcriberLang,
    },
    silenceTimeoutSeconds:      parseInt(silenceMax) || 3,
    backgroundDenoisingEnabled: true,
    endCallOnSilence:           !interruptions,
  };

  try {
    const res = await fetch(
      `https://api.vapi.ai/assistant/${vapiAssistantId}`,
      {
        method:  "PATCH",
        headers: {
          Authorization:  `Bearer ${vapiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(vapiPayload),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      console.error("[trigger-vapi-config] Vapi API error:", res.status, text);
      return err(`Vapi API ${res.status}: ${text}`, 502);
    }

    const data = await res.json();
    return ok({
      ok:           true,
      assistantId:  vapiAssistantId,
      voiceApplied: voiceConfig,
      vapiResponse: { id: data.id, name: data.name },
    });
  } catch (e) {
    console.error("[trigger-vapi-config]", e.message);
    return err(e.message);
  }
};
