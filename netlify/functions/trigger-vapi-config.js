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

  /* Mapping langue → code transcriber */
  const LANG_MAP = {
    "fr": "fr", "fr-FR": "fr",
    "en": "en", "en-US": "en",
    "es": "es", "ar": "ar", "pt": "pt",
  };
  const transcriberLang = LANG_MAP[langue] || "fr";

  /* voix peut être un ElevenLabs voice_id direct ou une clé legacy (ignorée) */
  const resolvedVoiceId = voix && voix.length > 10 ? voix : "21m00Tcm4TlvDq8ikWAM";

  const vapiPayload = {
    name: nomAssistant,

    transcriber: {
      provider: "deepgram",
      model:    "nova-3",
      language: transcriberLang,
    },

    model: {
      provider:    "groq",
      model:       "llama-3.3-70b-versatile",
      messages:    [{ role: "system", content: promptSysteme || "" }],
      temperature: 0.7,
    },

    voice: {
      provider:                 "11labs",
      model:                    "eleven_flash_v2_5",
      voiceId:                  resolvedVoiceId,
      stability:                0.4,
      similarityBoost:          0.75,
      speed:                    0.95,
      style:                    0.3,
      optimizeStreamingLatency: 4,
      useSpeakerBoost:          false,
      autoMode:                 true,
    },

    startSpeakingPlan: {
      waitSeconds:            0.4,
      onPunctuationSeconds:   0.1,
      onNoPunctuationSeconds: 0.8,
      onNumberSeconds:        0.3,
      smartEndpointingPlan:   { provider: "vapi" },
    },

    stopSpeakingPlan: {
      numWords:               3,
      voiceSeconds:           0.1,
      backOffSeconds:         0.5,
      acknowledgementPhrases: [
        "hmm", "oui", "d'accord", "je vois",
        "bien sûr", "exactement", "ok", "très bien",
      ],
    },

    silenceTimeoutSeconds: 20,
    maxDurationSeconds:    600,
    backgroundSound:       "off",
    endCallMessage:        "Au revoir, bonne journée !",
    endCallPhrases:        ["au revoir", "bonne journée", "merci de votre appel", "à bientôt"],
    voicemailMessage:      "Bonjour, merci de nous rappeler. À bientôt !",
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
