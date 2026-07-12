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
    nomAssistant    = "Assistant",
    voiceId,
    langue          = "fr",
    promptSysteme   = "",
    firstMessage    = "",
    vitesseParole   = 1.0,
    silenceMax      = 8,
    interruptions   = true,
    capaciteCreneau: bodyCapacite,
    dureeRDV:        bodyDuree,
    heureOuverture:  bodyHeureOuv,
    heureFermeture:  bodyHeureFerm,
  } = body;

  console.log("[create-vapi-assistant] clientId:", clientId, "nom:", nomAssistant, "voiceId:", voiceId, "langue:", langue);

  /* Lire le record client depuis Airtable (VapiAssistantId + Numéro Vapi) */
  let existingAssistantId = null;
  let vapiPhoneNumberId   = null;
  let clientEmail         = "";
  let clientFields        = {};
  if (clientId) {
    try {
      const clientRes = await fetch(`${BASE_URL}/Clients/${clientId}`, { headers });
      if (clientRes.ok) {
        const clientData    = await clientRes.json();
        clientFields        = clientData.fields || {};
        existingAssistantId = clientFields.VapiAssistantId  || null;
        vapiPhoneNumberId   = clientFields["Numéro Vapi"]   || null;
        clientEmail         = clientFields.Email             || clientFields["User ID"] || "";
        console.log("[create-vapi-assistant] capacite:", clientFields["Capacite Creneau"], "duree:", clientFields["Duree RDV"]);
        console.log("[create-vapi-assistant] VapiAssistantId existant :", existingAssistantId || "aucun");
        console.log("[create-vapi-assistant] Numéro Vapi (phoneNumberId) :", vapiPhoneNumberId || "aucun");
        console.log("[create-vapi-assistant] clientEmail :", clientEmail || "inconnu");
      }
    } catch (e) {
      console.warn("[create-vapi-assistant] Airtable fetch client:", e.message);
    }
  }

  const SERVER_URL    = process.env.URL || "https://portal-akilai.netlify.app";
  const WEBHOOK_URL   = `${SERVER_URL}/.netlify/functions/vapi-webhook`;
  const TOOLS_BASE    = `${SERVER_URL}/.netlify/functions`;
  /* Body values (from frontend form) take priority over Airtable stored values */
  const capaciteCreneau = String(bodyCapacite   || clientFields["Capacite Creneau"] || 1);
  const dureeRDV        = String(bodyDuree      || clientFields["Duree RDV"]        || 30);
  const heureOuverture  = bodyHeureOuv  || clientFields["Heure Ouverture"] || "08:00";
  const heureFermeture  = bodyHeureFerm || clientFields["Heure Fermeture"] || "19:00";
  const toolHeaders     = {
    "X-User-Id":          clientEmail,
    "X-Client-Id":        clientId || "",
    "X-Capacite":         capaciteCreneau,
    "X-Duree-RDV":        dureeRDV,
    "X-Heure-Ouverture":  heureOuverture,
    "X-Heure-Fermeture":  heureFermeture,
  };

  /* ── Construire les tools dynamiquement selon les intégrations ── */
  const tools = [];

  if (clientFields["Google Connected"]) {
    tools.push({
      type: "function",
      function: {
        name: "check_availability",
        description: "Vérifie les créneaux disponibles dans l'agenda Google Calendar du client pour une date donnée. Utiliser AVANT de proposer un créneau.",
        parameters: {
          type: "object",
          properties: {
            date:     { type: "string", description: "La date souhaitée au format YYYY-MM-DD" },
            duration: { type: "number", description: "Durée du RDV en minutes (défaut : 30)" },
          },
          required: ["date"],
        },
      },
      server: { url: `${TOOLS_BASE}/vapi-tool-check-availability`, timeoutSeconds: 20, headers: toolHeaders },
    });

    tools.push({
      type: "function",
      function: {
        name: "create_appointment",
        description: "Crée un rendez-vous dans l'agenda Google Calendar du client une fois que le patient a confirmé le créneau.",
        parameters: {
          type: "object",
          properties: {
            titre:        { type: "string", description: "Titre du rendez-vous" },
            dateDebut:    { type: "string", description: "Date et heure de début au format ISO 8601" },
            dateFin:      { type: "string", description: "Date et heure de fin au format ISO 8601" },
            nomPatient:   { type: "string", description: "Nom complet du patient/client" },
            emailPatient: { type: "string", description: "Email du patient (optionnel)" },
            telephone:    { type: "string", description: "Numéro de téléphone du patient" },
          },
          required: ["dateDebut", "dateFin", "nomPatient"],
        },
      },
      server: { url: `${TOOLS_BASE}/vapi-tool-create-appointment`, timeoutSeconds: 20, headers: toolHeaders },
    });
  }

  if (clientFields["Calendly Connected"] && clientFields["Calendly Link"]) {
    tools.push({
      type: "function",
      function: {
        name: "get_calendly_slots",
        description: "Récupère les créneaux disponibles sur Calendly et renvoie le lien de prise de rendez-vous.",
        parameters: {
          type: "object",
          properties: {
            date: { type: "string", description: "La date souhaitée au format YYYY-MM-DD" },
          },
          required: ["date"],
        },
      },
      server: { url: `${TOOLS_BASE}/vapi-tool-get-calendly-slots`, timeoutSeconds: 20, headers: toolHeaders },
    });
  }

  // SMS Twilio — toujours disponible
  tools.push({
    type: "function",
    function: {
      name: "send_sms",
      description: "Envoie un SMS au patient après l'appel (confirmation RDV, lien Calendly, etc.).",
      parameters: {
        type: "object",
        properties: {
          to:      { type: "string", description: "Numéro de téléphone destinataire (format international)" },
          message: { type: "string", description: "Contenu du SMS (max 160 caractères)" },
        },
        required: ["to", "message"],
      },
    },
    server: { url: `${TOOLS_BASE}/vapi-tool-send-sms`, timeoutSeconds: 20, headers: toolHeaders },
  });

  // CRM — toujours disponible
  tools.push({
    type: "function",
    function: {
      name: "create_contact",
      description: "Enregistre les informations du patient/prospect dans le CRM après l'appel.",
      parameters: {
        type: "object",
        properties: {
          nom:       { type: "string", description: "Nom de famille" },
          prenom:    { type: "string", description: "Prénom" },
          telephone: { type: "string", description: "Numéro de téléphone" },
          email:     { type: "string", description: "Adresse email" },
          resume:    { type: "string", description: "Résumé de l'appel" },
        },
        required: ["telephone"],
      },
    },
    server: { url: `${TOOLS_BASE}/vapi-tool-create-contact`, timeoutSeconds: 20, headers: toolHeaders },
  });

  console.log("[create-vapi-assistant] tools construits :", tools.map(t => t.function.name));

  /* ── Règle tools injectée dans le prompt système ── */
  const toolInstructions = `\n\n# Règle tools\n- Ne rappelle aucun tool déjà utilisé dans le même appel.\n- Exécute tous les tools en silence.`;

  const VOCAL_FORMAT = `# Format de réponse vocale
Tu t'exprimes toujours à l'oral, en français, avec des phrases courtes et naturelles comme dans une vraie conversation téléphonique.
- Maximum 2-3 phrases par réponse
- Jamais de listes, jamais de tirets dans tes réponses
- Jamais de symboles comme €, %, / — toujours en toutes lettres
- Jamais de bonjour deux fois dans le même appel
- Ne jamais mentionner les technologies utilisées (Vapi, ElevenLabs, OpenAI...)

# Comportement général
- Écoute avant de répondre
- Pose une question à la fois
- Si tu ne sais pas répondre, propose de transférer ou de rappeler
- Termine toujours l'appel poliment

# Tools
- Exécute chaque tool directement et en silence.
- ABSOLUMENT INTERDIT de prononcer 'un instant', 'une seconde', 'je vérifie', 'attends', 'laissez-moi chercher' ou toute phrase d'attente avant, pendant ou après un tool call.
- Zéro annonce verbale. Le tool s'exécute, tu continues la conversation.

`;
  const promptComplet = VOCAL_FORMAT + (promptSysteme || "") + toolInstructions;

  /* Payload Vapi — structure officielle */
  const vapiPayload = {
    name:      nomAssistant,
    serverUrl: WEBHOOK_URL,
    metadata: {
      userId:   clientEmail,
      clientId: clientId || "",
    },

    transcriber: {
      provider:    "deepgram",
      model:       "nova-3",
      language:    langue || "fr",
      smartFormat: false,
    },

    model: {
      provider:    "groq",
      model:       "llama-3.3-70b-versatile",
      messages:    [{ role: "system", content: promptComplet }],
      temperature: 0.7,
      tools,
    },

    voice: {
      provider:                 "11labs",
      model:                    "eleven_flash_v2_5",
      voiceId:                  voiceId || "21m00Tcm4TlvDq8ikWAM",
      stability:                0.4,
      similarityBoost:          0.75,
      speed:                    1.15,
      style:                    0.3,
      optimizeStreamingLatency: 4,
      useSpeakerBoost:          false,
      autoMode:                 true,
    },

    startSpeakingPlan: {
      waitSeconds:          0.2,
      smartEndpointingPlan: { provider: "vapi" },
    },

    stopSpeakingPlan: {
      numWords:               1,
      voiceSeconds:           0.1,
      acknowledgementPhrases: [
        "hmm", "oui", "d'accord", "je vois",
        "bien sûr", "exactement", "ok", "très bien",
      ],
    },

    firstMessage: firstMessage || "Bonjour, un instant...",

    analysisPlan: {
      summaryPrompt: "Rédige un résumé concis de cet appel en français. Mentionne l'objet de l'appel, les informations clés échangées et l'issue (RDV pris, question résolue, rappel demandé, etc.). Maximum 3 phrases.",
      structuredDataPrompt: "Extrais les données structurées de cet appel en français.",
      successEvaluationPrompt: "L'appel est un succès si l'appelant a obtenu une réponse à sa demande ou a pris un RDV. Réponds uniquement par 'true' ou 'false'.",
    },

    silenceTimeoutSeconds: 20,
    maxDurationSeconds:    600,
    backgroundSound:       "off",
    endCallMessage:        "Au revoir, bonne journée !",
    endCallPhrases:        ["au revoir", "bonne journée", "merci de votre appel", "à bientôt"],
    voicemailMessage:      "Bonjour, merci de nous rappeler. À bientôt !",

    language: langue,
  };

  const vapiHeaders = {
    Authorization:  `Bearer ${vapiKey}`,
    "Content-Type": "application/json",
  };

  console.log("[create-vapi-assistant] vapiPayload complet:", JSON.stringify({
    name:        vapiPayload.name,
    transcriber: vapiPayload.transcriber,
    model:       { provider: vapiPayload.model.provider, model: vapiPayload.model.model, temperature: vapiPayload.model.temperature, tools: vapiPayload.model.tools?.length },
    voice:       vapiPayload.voice,
    startSpeakingPlan:     vapiPayload.startSpeakingPlan,
    stopSpeakingPlan:      { numWords: vapiPayload.stopSpeakingPlan?.numWords },
    silenceTimeoutSeconds: vapiPayload.silenceTimeoutSeconds,
    endCallPhrases:        vapiPayload.endCallPhrases,
  }));

  try {
    let assistantId;
    let created = false;

    if (!existingAssistantId) {
      /* CREATE */
      console.log("[create-vapi-assistant] POST /assistant");
      const createRes = await fetch("https://api.vapi.ai/assistant", {
        method:  "POST",
        headers: vapiHeaders,
        body:    JSON.stringify(vapiPayload),
      });

      console.log("[create-vapi-assistant] Vapi CREATE status:", createRes.status);

      if (!createRes.ok) {
        const text = await createRes.text();
        console.error("[create-vapi-assistant] Vapi CREATE error:", text);
        return err(`Vapi API ${createRes.status}: ${text}`, 502);
      }

      const createData = await createRes.json();
      assistantId      = createData.id;
      created          = true;
      console.log("[create-vapi-assistant] Assistant créé, id:", assistantId);

      /* Sauvegarder l'ID + config voix dans Airtable */
      if (clientId && assistantId) {
        const airtableFields = { VapiAssistantId: assistantId };
        if (nomAssistant  !== undefined) airtableFields.NomAssistant       = nomAssistant;
        if (langue        !== undefined) airtableFields.Langue             = langue;
        if (promptSysteme !== undefined) airtableFields.PromptSysteme      = promptSysteme;
        if (vitesseParole !== undefined) airtableFields.VitesseParole      = Number(vitesseParole);
        airtableFields["Capacite Creneau"] = Number(capaciteCreneau) || 1;
        airtableFields["Duree RDV"]        = Number(dureeRDV)        || 30;
        airtableFields["Heure Ouverture"]  = heureOuverture;
        airtableFields["Heure Fermeture"]  = heureFermeture;
        const patchRes = await fetch(`${BASE_URL}/Clients/${clientId}`, {
          method: "PATCH",
          headers,
          body:   JSON.stringify({ fields: airtableFields }),
        });
        console.log("[create-vapi-assistant] Airtable PATCH Clients status:", patchRes.status, "| fields:", Object.keys(airtableFields).join(", "));
      }

    } else {
      /* UPDATE — aussi sauvegarder la config voix */
      assistantId = existingAssistantId;
      console.log("[create-vapi-assistant] PATCH /assistant/" + assistantId);

      const updateRes = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
        method:  "PATCH",
        headers: vapiHeaders,
        body:    JSON.stringify(vapiPayload),
      });

      console.log("[create-vapi-assistant] Vapi UPDATE status:", updateRes.status);

      if (updateRes.status === 404) {
        /* Assistant supprimé dans Vapi → fallback CREATE */
        console.log("[create-vapi-assistant] assistant introuvable dans Vapi (404) → fallback CREATE");
        const fallbackRes = await fetch("https://api.vapi.ai/assistant", {
          method:  "POST",
          headers: vapiHeaders,
          body:    JSON.stringify(vapiPayload),
        });
        console.log("[create-vapi-assistant] Vapi fallback CREATE status:", fallbackRes.status);
        if (!fallbackRes.ok) {
          const text = await fallbackRes.text();
          console.error("[create-vapi-assistant] Vapi fallback CREATE error:", text);
          return err(`Vapi API ${fallbackRes.status}: ${text}`, 502);
        }
        const fallbackData = await fallbackRes.json();
        assistantId = fallbackData.id;
        created     = true;
        console.log("[create-vapi-assistant] nouvel assistantId (fallback):", assistantId);
      } else if (!updateRes.ok) {
        const text = await updateRes.text();
        console.error("[create-vapi-assistant] Vapi UPDATE error:", text);
        return err(`Vapi API ${updateRes.status}: ${text}`, 502);
      }

      /* Sauvegarder la config voix (et le nouvel ID si fallback) dans Airtable */
      if (clientId) {
        const updateFields = { VapiAssistantId: assistantId };
        if (nomAssistant  !== undefined) updateFields.NomAssistant       = nomAssistant;
        if (langue        !== undefined) updateFields.Langue             = langue;
        if (promptSysteme !== undefined) updateFields.PromptSysteme      = promptSysteme;
        if (vitesseParole !== undefined) updateFields.VitesseParole      = Number(vitesseParole);
        updateFields["Capacite Creneau"] = Number(capaciteCreneau) || 1;
        updateFields["Duree RDV"]        = Number(dureeRDV)        || 30;
        updateFields["Heure Ouverture"]  = heureOuverture;
        updateFields["Heure Fermeture"]  = heureFermeture;
        const patchRes = await fetch(`${BASE_URL}/Clients/${clientId}`, {
          method: "PATCH",
          headers,
          body:   JSON.stringify({ fields: updateFields }),
        });
        console.log("[create-vapi-assistant] Airtable PATCH Clients (update) status:", patchRes.status, "| fields:", Object.keys(updateFields).join(", "));
      }
    }

    /* ── Assigner le numéro de téléphone Vapi à l'assistant ── */
    let phoneAssigned = false;
    if (vapiPhoneNumberId && assistantId) {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(vapiPhoneNumberId);
      if (!isUUID) {
        console.warn("[create-vapi-assistant] phoneNumberId invalide (pas un UUID), skip PATCH phone-number:", vapiPhoneNumberId);
      } else {
        try {
          console.log("[create-vapi-assistant] PATCH /phone-number/" + vapiPhoneNumberId + " → assistantId:", assistantId);
          const webhookUrl = `${process.env.URL || "https://portal-akilai.netlify.app"}/.netlify/functions/vapi-webhook`;
          const phoneRes = await fetch(`https://api.vapi.ai/phone-number/${vapiPhoneNumberId}`, {
            method:  "PATCH",
            headers: vapiHeaders,
            body:    JSON.stringify({
              assistantId: null,
              serverUrl:   webhookUrl,
              metadata: {
                userId:   clientEmail,
                clientId: clientId || "",
              },
            }),
          });
          console.log("[create-vapi-assistant] Vapi phone-number PATCH status:", phoneRes.status);
          if (phoneRes.ok) {
            phoneAssigned = true;
          } else {
            const text = await phoneRes.text();
            console.warn("[create-vapi-assistant] Vapi phone-number PATCH error:", phoneRes.status, text);
          }
        } catch (e) {
          console.warn("[create-vapi-assistant] phone-number PATCH exception:", e.message);
        }
      }
    } else {
      console.warn("[create-vapi-assistant] Aucun numéro Vapi configuré pour ce client — assignation ignorée");
    }

    /* ── Créer / mettre à jour le record Automatisations ── */
    try {
      const AUTOMATIONS_TABLE = "Automatisations";
      const userId = clientEmail;
      console.log("[create-vapi] userId pour automatisation:", userId || "(vide — clientEmail manquant)");

      if (userId && assistantId) {
        console.log("[create-vapi] recherche automatisation existante...");
        const searchFormula = encodeURIComponent(`AND({User ID}="${userId}",{Type}="Vocal")`);
        const autoSearchRes  = await fetch(`${BASE_URL}/${AUTOMATIONS_TABLE}?filterByFormula=${searchFormula}&maxRecords=1`, { headers });
        const autoSearchData = autoSearchRes.ok ? await autoSearchRes.json() : { records: [] };
        const records        = autoSearchData.records || [];
        const existing       = records[0];
        console.log("[create-vapi] nb automatisations trouvées:", records.length, "| searchRes.status:", autoSearchRes.status);

        console.log("[create-vapi] action:", existing ? "PATCH" : "POST");

        if (existing) {
          const patchBody = {
            fields: {
              "Nom":             nomAssistant || "Assistant Vocal",
              "Statut":          "Actif",
              "VapiAssistantId": assistantId,
            },
            typecast: true,
          };
          console.log("[create-vapi] PATCH body:", JSON.stringify(patchBody).substring(0, 500));
          const patchAuto = await fetch(`${BASE_URL}/${AUTOMATIONS_TABLE}/${existing.id}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify(patchBody),
          });
          console.log("[create-vapi] PATCH status:", patchAuto.status);
          const patchText = await patchAuto.text();
          console.log("[create-vapi] résultat automatisation:", patchText.substring(0, 500));
        } else {
          const postBody = {
            fields: {
              "Nom":             nomAssistant || "Assistant Vocal",
              "Type":            "Vocal",
              "Statut":          "Actif",
              "User ID":         userId,
              "Description":     `Assistant vocal IA — ${langue || "fr"}`,
              "VapiAssistantId": assistantId,
            },
            typecast: true,
          };
          console.log("[create-vapi] POST body:", JSON.stringify(postBody).substring(0, 500));
          const createAuto = await fetch(`${BASE_URL}/${AUTOMATIONS_TABLE}`, {
            method: "POST",
            headers,
            body: JSON.stringify(postBody),
          });
          console.log("[create-vapi] POST status:", createAuto.status);
          const postText = await createAuto.text();
          console.log("[create-vapi] POST response:", postText.substring(0, 500));
        }
      } else {
        console.warn("[create-vapi] automatisation ignorée — userId:", userId || "(vide)", "| assistantId:", assistantId || "(vide)");
      }
    } catch (e2) {
      console.warn("[create-vapi-assistant] automatisation sync error:", e2.message);
    }

    return ok({ ok: true, assistantId, created, phoneAssigned, hasPhone: !!vapiPhoneNumberId, tools: tools.map(t => t.function.name) });
  } catch (e) {
    console.error("[create-vapi-assistant] Exception:", e.message);
    return err(e.message);
  }
};
