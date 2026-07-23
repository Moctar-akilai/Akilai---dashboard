/**
 * setup-calendly-webhook.js
 * Enregistre le webhook Calendly via l'API (à appeler une seule fois).
 * POST /.netlify/functions/setup-calendly-webhook
 *
 * Bouton "Configurer webhook" dans Paramètres → Calendly du back-office.
 */

const { preflight, corsHeaders } = require("./config");

const WEBHOOK_URL = "https://portal-akilai.netlify.app/.netlify/functions/calendly-webhook";

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Méthode non autorisée" }) };
  }

  const CALENDLY_API_KEY = process.env.CALENDLY_API_KEY || "";
  if (!CALENDLY_API_KEY) {
    return {
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "CALENDLY_API_KEY non configuré", missingKey: true }),
    };
  }

  const calHeaders = {
    Authorization: `Bearer ${CALENDLY_API_KEY}`,
    "Content-Type": "application/json",
  };

  try {
    // 1. Récupérer l'URI organisation depuis /users/me
    const meRes  = await fetch("https://api.calendly.com/users/me", { headers: calHeaders });
    if (!meRes.ok) {
      const text = await meRes.text();
      console.error("[setup-calendly-webhook] /users/me error:", meRes.status, text);
      return { statusCode: 502, headers: corsHeaders, body: JSON.stringify({ error: `Calendly ${meRes.status}: ${text}` }) };
    }
    const meData  = await meRes.json();
    const orgUri  = meData.resource?.current_organization || "";
    const userUri = meData.resource?.uri                  || "";

    if (!orgUri) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Impossible de récupérer l'URI organisation Calendly" }) };
    }

    console.log("[setup-calendly-webhook] orgUri:", orgUri);

    // 2. Lister les webhooks existants pour éviter les doublons
    const listParams = new URLSearchParams({ organization: orgUri, scope: "organization" });
    const listRes    = await fetch(`https://api.calendly.com/webhook_subscriptions?${listParams}`, { headers: calHeaders });
    const listData   = await listRes.json();
    const existing   = (listData.collection || []).find(w => w.callback_url === WEBHOOK_URL);

    if (existing) {
      console.log("[setup-calendly-webhook] Webhook déjà configuré:", existing.uri);
      return {
        statusCode: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ ok: true, alreadyExists: true, webhookUri: existing.uri, webhookUrl: WEBHOOK_URL }),
      };
    }

    // 3. Créer le webhook
    const createRes  = await fetch("https://api.calendly.com/webhook_subscriptions", {
      method:  "POST",
      headers: calHeaders,
      body:    JSON.stringify({
        url:          WEBHOOK_URL,
        events:       ["invitee.created", "invitee.canceled"],
        organization: orgUri,
        user:         userUri,
        scope:        "organization",
      }),
    });

    console.log("[setup-calendly-webhook] Create webhook status:", createRes.status);

    const createData = await createRes.json();
    if (!createRes.ok) {
      console.error("[setup-calendly-webhook] Create error:", JSON.stringify(createData));
      return {
        statusCode: 502,
        headers: corsHeaders,
        body: JSON.stringify({ error: createData.message || `Calendly ${createRes.status}`, details: createData }),
      };
    }

    console.log("[setup-calendly-webhook] Webhook créé:", createData.resource?.uri);
    return {
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        ok:         true,
        created:    true,
        webhookUri: createData.resource?.uri || "",
        webhookUrl: WEBHOOK_URL,
      }),
    };
  } catch (e) {
    console.error("[setup-calendly-webhook] Exception:", e.message);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: e.message }) };
  }
};
