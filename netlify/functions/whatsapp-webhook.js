const BASE_ID          = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_KEY     = process.env.AIRTABLE_API_KEY || "";
const CLIENTS_TABLE    = "tble0g9eMTjAfw6OO";
const HISTORIQUE_TABLE = "tblxXBGjv6iZU41XY";

const airtableHeaders = {
  Authorization:  `Bearer ${AIRTABLE_KEY}`,
  "Content-Type": "application/json",
};

async function repondreWhatsApp(to, from, message) {
  const TWILIO_SID   = process.env.TWILIO_ACCOUNT_SID;
  const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;

  console.log("[whatsapp] envoi réponse vers:", to);
  console.log("[whatsapp] depuis:", from);
  console.log("[whatsapp] TWILIO_SID présent:", !!TWILIO_SID);
  console.log("[whatsapp] TWILIO_TOKEN présent:", !!TWILIO_TOKEN);

  try {
    const twilioRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
      {
        method:  "POST",
        headers: {
          Authorization:  "Basic " + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To:   `whatsapp:${to}`,
          From: `whatsapp:${from}`,
          Body: message,
        }),
      }
    );
    console.log("[whatsapp] Twilio status:", twilioRes.status);
    const twilioData = await twilioRes.json();
    console.log("[whatsapp] Twilio response:", JSON.stringify(twilioData).substring(0, 300));
  } catch (e) {
    console.error("[whatsapp] erreur envoi Twilio:", e.message);
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "text/xml" },
    body: "<Response></Response>",
  };
}

async function transcrireAudio(mediaUrl, langue) {
  const TWILIO_SID   = process.env.TWILIO_ACCOUNT_SID;
  const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;

  /* Télécharger le fichier audio depuis Twilio (auth requise) */
  const audioRes = await fetch(mediaUrl, {
    headers: {
      Authorization: "Basic " + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString("base64"),
    },
  });

  if (!audioRes.ok) {
    console.error("[whatsapp] erreur téléchargement audio:", audioRes.status);
    return null;
  }

  const audioBuffer = await audioRes.arrayBuffer();
  console.log("[whatsapp] audio téléchargé:", audioBuffer.byteLength, "bytes");

  /* Envoyer à Whisper — FormData natif Node.js 18+ */
  const langMap = { Français: "fr", English: "en", Español: "es", Portugais: "pt", Arabe: "ar" };
  const formData = new FormData();
  formData.append("file", new Blob([audioBuffer], { type: "audio/ogg" }), "audio.ogg");
  formData.append("model", "whisper-1");
  formData.append("language", langMap[langue] || "fr");

  const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method:  "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body:    formData,
  });

  console.log("[whatsapp] Whisper status:", whisperRes.status);
  const whisperData = await whisperRes.json();
  console.log("[whatsapp] transcription:", whisperData.text);
  return whisperData.text || null;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { "Access-Control-Allow-Origin": "*" }, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: { "Content-Type": "text/xml" }, body: "<Response></Response>" };
  }

  try {
    const params       = new URLSearchParams(event.body || "");
    const from         = params.get("From") || "";
    const to           = params.get("To")   || "";
    const numeroClient = from.replace("whatsapp:", "");
    const numeroTwilio = to.replace("whatsapp:", "");
    const numMedia     = params.get("NumMedia") || "0";
    const mediaUrl     = params.get("MediaUrl0") || "";
    const mediaType    = params.get("MediaContentType0") || "";

    console.log("[whatsapp] message de:", numeroClient);
    console.log("[whatsapp] vers:", numeroTwilio);
    console.log("[whatsapp] numMedia:", numMedia, "| mediaType:", mediaType);
    if (mediaUrl) console.log("[whatsapp] mediaUrl:", mediaUrl);

    /* Identifier le client AkilAI par numéro Twilio */
    const clientRes  = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}?filterByFormula=${encodeURIComponent(`{WhatsApp Numero Twilio}="${numeroTwilio}"`)}&maxRecords=1`,
      { headers: airtableHeaders }
    );
    const clientData = await clientRes.json();
    const client     = clientData.records?.[0];

    if (!client) {
      console.error("[whatsapp] client non trouvé pour:", numeroTwilio);
      return repondreWhatsApp(
        numeroClient, numeroTwilio,
        "Bonjour, je suis l'assistant AkilAI. Comment puis-je vous aider ?"
      );
    }

    const userId       = client.fields["User ID"]                || "";
    const prompt       = client.fields["WhatsApp Prompt"]        || "Tu es un assistant WhatsApp professionnel et aidant.";
    const nomAssistant = client.fields["WhatsApp Nom Assistant"] || "Akil";
    const langue       = client.fields["WhatsApp Langue"]        || "Français";
    const tonalite     = client.fields["WhatsApp Tonalite"]      || "Professionnel";

    /* ── Gestion message vocal ── */
    let messageEntrant = params.get("Body") || "";
    let isVocalMessage = false;
    let transcription  = "";

    if (parseInt(numMedia) > 0 && mediaUrl && mediaType.startsWith("audio/")) {
      isVocalMessage = true;
      console.log("[whatsapp] message vocal détecté");

      try {
        transcription = await transcrireAudio(mediaUrl, langue);
      } catch (e) {
        console.error("[whatsapp] erreur transcription:", e.message);
        transcription = null;
      }

      if (!transcription) {
        return repondreWhatsApp(
          numeroClient, numeroTwilio,
          "J'ai reçu votre message vocal mais je n'ai pas pu le transcrire. Pouvez-vous réécrire votre demande en texte ?"
        );
      }

      messageEntrant = transcription;
    } else {
      console.log("[whatsapp] contenu:", messageEntrant.substring(0, 200));
    }

    /* Récupérer l'historique de conversation */
    let historique = {};
    try {
      historique = JSON.parse(client.fields["WhatsApp Historique"] || "{}");
    } catch(e) { historique = {}; }

    const conversationKey = numeroClient.replace("+", "").replace(/\s/g, "");
    const messages        = historique[conversationKey] || [];
    if (messages.length > 20) messages.splice(0, messages.length - 20);

    /* Appeler GPT-4o */
    const systemPrompt = `${prompt}

Tu t'appelles ${nomAssistant}.
Tu communiques en ${langue}.
Ton style de communication : ${tonalite}.
Tu réponds via WhatsApp — sois concis (2-3 phrases max).
Ne jamais envoyer de longs paragraphes.
Utilise des émojis avec modération.`;

    const userContent = isVocalMessage
      ? `L'utilisateur a envoyé un message vocal : ${transcription}`
      : messageEntrant;

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model:       "gpt-4o",
        messages:    [
          { role: "system", content: systemPrompt },
          ...messages,
          { role: "user", content: userContent },
        ],
        max_tokens:  300,
        temperature: 0.7,
      }),
    });

    const openaiData = await openaiRes.json();
    const reponse    = openaiData.choices?.[0]?.message?.content
      || "Je suis désolé, je n'ai pas pu traiter votre message.";

    console.log("[whatsapp] réponse GPT:", reponse.substring(0, 100));

    /* Mettre à jour l'historique */
    messages.push({ role: "user",      content: userContent });
    messages.push({ role: "assistant", content: reponse });
    historique[conversationKey] = messages;

    fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}/${client.id}`,
      {
        method:  "PATCH",
        headers: airtableHeaders,
        body:    JSON.stringify({ fields: { "WhatsApp Historique": JSON.stringify(historique) } }),
      }
    ).catch(e => console.error("[whatsapp] erreur historique:", e.message));

    /* Enregistrer dans Airtable Historique */
    const messageLog = isVocalMessage ? `[Vocal] ${transcription}` : messageEntrant;
    const detailsLog = isVocalMessage
      ? `Transcription Whisper: ${transcription}\nRéponse: ${reponse}`
      : reponse;

    fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${HISTORIQUE_TABLE}`,
      {
        method:  "POST",
        headers: airtableHeaders,
        body:    JSON.stringify({
          records: [{
            fields: {
              "Titre":           `WhatsApp — ${numeroClient}`,
              "Type":            "Whatsapp",
              "Canal":           "WhatsApp",
              "Statut":          "Succès",
              "User ID":         userId,
              "Numéro client":   numeroClient,
              "Message entrant": messageLog,
              "Détails":         detailsLog,
            },
          }],
          typecast: true,
        }),
      }
    ).catch(e => console.error("[whatsapp] erreur historique airtable:", e.message));

    /* Mettre à jour le CRM */
    const serverUrl = process.env.URL || "https://portal-akilai.netlify.app";
    fetch(`${serverUrl}/.netlify/functions/crm-router`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        userId,
        contactData: { numero: numeroClient, source: "WhatsApp" },
        callData:    { date: new Date().toISOString(), resume: messageEntrant.substring(0, 200), statut: "Succès" },
      }),
    }).catch(e => console.error("[whatsapp] erreur CRM:", e.message));

    return repondreWhatsApp(numeroClient, numeroTwilio, reponse);

  } catch (e) {
    console.error("[whatsapp] ERREUR:", e.message, e.stack);
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/xml" },
      body: "<Response></Response>",
    };
  }
};
