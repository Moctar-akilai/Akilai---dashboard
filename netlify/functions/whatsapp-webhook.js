const BASE_ID      = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_KEY = process.env.AIRTABLE_API_KEY || "";
const BASE         = BASE_ID;
const CLIENTS_TABLE = "tble0g9eMTjAfw6OO";
const HISTORIQUE_TABLE = "tblxXBGjv6iZU41XY";

const airtableHeaders = {
  Authorization:  `Bearer ${AIRTABLE_KEY}`,
  "Content-Type": "application/json",
};

async function repondreWhatsApp(to, from, message) {
  const TWILIO_SID   = process.env.TWILIO_ACCOUNT_SID;
  const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;

  try {
    await fetch(
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
  } catch (e) {
    console.error("[whatsapp] erreur envoi Twilio:", e.message);
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "text/xml" },
    body: "<Response></Response>",
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { "Access-Control-Allow-Origin": "*" }, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: { "Content-Type": "text/xml" }, body: "<Response></Response>" };
  }

  try {
    const params          = new URLSearchParams(event.body || "");
    const messageEntrant  = params.get("Body")  || "";
    const from            = params.get("From")  || "";
    const to              = params.get("To")    || "";
    const numeroClient    = from.replace("whatsapp:", "");
    const numeroTwilio    = to.replace("whatsapp:", "");

    console.log("[whatsapp] message de:", numeroClient);
    console.log("[whatsapp] vers:", numeroTwilio);
    console.log("[whatsapp] contenu:", messageEntrant.substring(0, 200));

    /* Identifier le client AkilAI par numéro Twilio */
    const clientRes  = await fetch(
      `https://api.airtable.com/v0/${BASE}/${CLIENTS_TABLE}?filterByFormula=${encodeURIComponent(`{WhatsApp Numero Twilio}="${numeroTwilio}"`)}&maxRecords=1`,
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

    const userId       = client.fields["User ID"]                 || "";
    const prompt       = client.fields["WhatsApp Prompt"]         || "Tu es un assistant WhatsApp professionnel et aidant.";
    const nomAssistant = client.fields["WhatsApp Nom Assistant"]  || "Akil";
    const langue       = client.fields["WhatsApp Langue"]         || "Français";
    const tonalite     = client.fields["WhatsApp Tonalite"]       || "Professionnel";

    /* Récupérer l'historique de conversation */
    let historique = {};
    try {
      historique = JSON.parse(client.fields["WhatsApp Historique"] || "{}");
    } catch(e) { historique = {}; }

    const conversationKey = numeroClient.replace("+", "").replace(/\s/g, "");
    const messages        = historique[conversationKey] || [];

    /* Garder les 20 derniers messages (10 échanges) */
    if (messages.length > 20) messages.splice(0, messages.length - 20);

    /* Appeler GPT-4o */
    const systemPrompt = `${prompt}

Tu t'appelles ${nomAssistant}.
Tu communiques en ${langue}.
Ton style de communication : ${tonalite}.
Tu réponds via WhatsApp — sois concis (2-3 phrases max).
Ne jamais envoyer de longs paragraphes.
Utilise des émojis avec modération.`;

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model:      "gpt-4o",
        messages:   [
          { role: "system", content: systemPrompt },
          ...messages,
          { role: "user", content: messageEntrant },
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
    messages.push({ role: "user",      content: messageEntrant });
    messages.push({ role: "assistant", content: reponse });
    historique[conversationKey] = messages;

    fetch(
      `https://api.airtable.com/v0/${BASE}/${CLIENTS_TABLE}/${client.id}`,
      {
        method:  "PATCH",
        headers: airtableHeaders,
        body:    JSON.stringify({ fields: { "WhatsApp Historique": JSON.stringify(historique) } }),
      }
    ).catch(e => console.error("[whatsapp] erreur historique:", e.message));

    /* Enregistrer dans Airtable Historique */
    fetch(
      `https://api.airtable.com/v0/${BASE}/${HISTORIQUE_TABLE}`,
      {
        method:  "POST",
        headers: airtableHeaders,
        body:    JSON.stringify({
          records: [{
            fields: {
              "Titre":          `WhatsApp — ${numeroClient}`,
              "Type":           "Whatsapp",
              "Canal":          "WhatsApp",
              "Statut":         "Succès",
              "User ID":        userId,
              "Numéro client":  numeroClient,
              "Message entrant": messageEntrant,
              "Détails":        reponse,
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
