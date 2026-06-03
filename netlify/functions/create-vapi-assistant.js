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

  console.log("[create-vapi-assistant] clientId:", clientId, "nom:", nomAssistant, "voiceId:", voiceId, "langue:", langue);

  /* Lire le record client depuis Airtable (VapiAssistantId + Numéro Vapi) */
  let existingAssistantId = null;
  let vapiPhoneNumberId   = null;
  let clientEmail         = "";
  if (clientId) {
    try {
      const clientRes = await fetch(`${BASE_URL}/Clients/${clientId}`, { headers });
      if (clientRes.ok) {
        const clientData    = await clientRes.json();
        existingAssistantId = clientData.fields?.VapiAssistantId  || null;
        vapiPhoneNumberId   = clientData.fields?.["Numéro Vapi"]  || null;
        clientEmail         = clientData.fields?.Email            || clientData.fields?.["User ID"] || "";
        console.log("[create-vapi-assistant] VapiAssistantId existant :", existingAssistantId || "aucun");
        console.log("[create-vapi-assistant] Numéro Vapi (phoneNumberId) :", vapiPhoneNumberId || "aucun");
        console.log("[create-vapi-assistant] clientEmail :", clientEmail || "inconnu");
      }
    } catch (e) {
      console.warn("[create-vapi-assistant] Airtable fetch client:", e.message);
    }
  }

  const WEBHOOK_URL = `${process.env.URL || "https://portal-akilai.netlify.app"}/.netlify/functions/vapi-webhook`;

  /* Payload Vapi — structure officielle */
  const vapiPayload = {
    name: nomAssistant,
    serverUrl: WEBHOOK_URL,
    model: {
      provider: "openai",
      model:    "gpt-4o",
      messages: [
        { role: "system", content: promptSysteme || "" },
      ],
    },
    voice: {
      provider: "11labs",
      voiceId:  voiceId || "21m00Tcm4TlvDq8ikWAM",
    },
    language: langue,
  };

  const vapiHeaders = {
    Authorization:  `Bearer ${vapiKey}`,
    "Content-Type": "application/json",
  };

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

      /* Sauvegarder l'ID dans Airtable */
      if (clientId && assistantId) {
        const patchRes = await fetch(`${BASE_URL}/Clients/${clientId}`, {
          method: "PATCH",
          headers,
          body:   JSON.stringify({ fields: { VapiAssistantId: assistantId } }),
        });
        console.log("[create-vapi-assistant] Airtable PATCH VapiAssistantId status:", patchRes.status);
      }

    } else {
      /* UPDATE */
      assistantId = existingAssistantId;
      console.log("[create-vapi-assistant] PATCH /assistant/" + assistantId);

      const updateRes = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
        method:  "PATCH",
        headers: vapiHeaders,
        body:    JSON.stringify(vapiPayload),
      });

      console.log("[create-vapi-assistant] Vapi UPDATE status:", updateRes.status);

      if (!updateRes.ok) {
        const text = await updateRes.text();
        console.error("[create-vapi-assistant] Vapi UPDATE error:", text);
        return err(`Vapi API ${updateRes.status}: ${text}`, 502);
      }
    }

    /* ── Assigner le numéro de téléphone Vapi à l'assistant ── */
    let phoneAssigned = false;
    if (vapiPhoneNumberId && assistantId) {
      try {
        console.log("[create-vapi-assistant] PATCH /phone-number/" + vapiPhoneNumberId + " → assistantId:", assistantId);
        const webhookUrl = `${process.env.URL || "https://portal-akilai.netlify.app"}/.netlify/functions/vapi-webhook`;
        const phoneRes = await fetch(`https://api.vapi.ai/phone-number/${vapiPhoneNumberId}`, {
          method:  "PATCH",
          headers: vapiHeaders,
          body:    JSON.stringify({
            assistantId,
            serverUrl: webhookUrl,
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
    } else {
      console.warn("[create-vapi-assistant] Aucun numéro Vapi configuré pour ce client — assignation ignorée");
    }

    return ok({ ok: true, assistantId, created, phoneAssigned, hasPhone: !!vapiPhoneNumberId });
  } catch (e) {
    console.error("[create-vapi-assistant] Exception:", e.message);
    return err(e.message);
  }
};
