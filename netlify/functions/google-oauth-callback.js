const { BASE_URL, headers: airtableHeaders, corsHeaders } = require("./config");

exports.handler = async function(event) {
  const params       = event.queryStringParameters || {};
  const code         = params.code;
  const userId       = params.state ? decodeURIComponent(params.state) : null;
  const errorParam   = params.error;

  if (errorParam || !code || !userId) {
    return { statusCode: 302, headers: { Location: "https://portal-akilai.netlify.app?google=error" }, body: "" };
  }

  try {
    const clientId     = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri  = "https://portal-akilai.netlify.app/.netlify/functions/google-oauth-callback";

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  redirectUri,
        grant_type:    "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const t = await tokenRes.text();
      console.error("[google-oauth-callback] Erreur token:", tokenRes.status, t);
      return { statusCode: 302, headers: { Location: "https://portal-akilai.netlify.app?google=error" }, body: "" };
    }

    const { access_token, refresh_token } = await tokenRes.json();

    // Find client record by User ID
    const searchUrl = `${BASE_URL}/Clients?filterByFormula=${encodeURIComponent(`{User ID}="${userId}"`)}`;
    const clientRes = await fetch(searchUrl, { headers: airtableHeaders });
    const clientData = await clientRes.json();

    if (!clientData.records || clientData.records.length === 0) {
      console.error("[google-oauth-callback] Client introuvable pour userId:", userId);
      return { statusCode: 302, headers: { Location: "https://portal-akilai.netlify.app?google=error" }, body: "" };
    }

    const recordId = clientData.records[0].id;

    // PATCH Airtable — tokens partagés pour Calendar + Sheets
    const patchRes = await fetch(`${BASE_URL}/Clients/${recordId}`, {
      method: "PATCH",
      headers: airtableHeaders,
      body: JSON.stringify({
        fields: {
          "Google Access Token":    access_token,
          "Google Refresh Token":   refresh_token || "",
          "Google Connected":       true,
          "Google Calendar ID":     "primary",
          "Google Sheets Connected": true,
        },
      }),
    });

    if (!patchRes.ok) {
      const t = await patchRes.text();
      console.error("[google-oauth-callback] Erreur PATCH Airtable:", patchRes.status, t);
    }

    return {
      statusCode: 302,
      headers: { Location: "https://portal-akilai.netlify.app?google=connected" },
      body: "",
    };
  } catch (e) {
    console.error("[google-oauth-callback] Exception:", e.message);
    return { statusCode: 302, headers: { Location: "https://portal-akilai.netlify.app?google=error" }, body: "" };
  }
};
