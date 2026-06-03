const { BASE_URL, headers: airtableHeaders, corsHeaders } = require("./config");

exports.handler = async function(event) {
  const params     = event.queryStringParameters || {};
  const code       = params.code;
  const userId     = params.state ? decodeURIComponent(params.state) : null;
  const errorParam = params.error;

  if (errorParam || !code || !userId) {
    console.error("[microsoft-oauth-callback] Paramètres manquants:", { errorParam, hasCode: !!code, userId });
    return { statusCode: 302, headers: { Location: "https://portal-akilai.netlify.app?microsoft=error" }, body: "" };
  }

  try {
    const clientId     = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    const tenant       = process.env.MICROSOFT_TENANT_ID || "common";
    const redirectUri  = "https://portal-akilai.netlify.app/.netlify/functions/microsoft-oauth-callback";

    // Exchange code for tokens
    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  redirectUri,
        grant_type:    "authorization_code",
        scope:         "Files.ReadWrite offline_access User.Read",
      }),
    });

    if (!tokenRes.ok) {
      const t = await tokenRes.text();
      console.error("[microsoft-oauth-callback] Erreur token:", tokenRes.status, t);
      return { statusCode: 302, headers: { Location: "https://portal-akilai.netlify.app?microsoft=error" }, body: "" };
    }

    const { access_token, refresh_token } = await tokenRes.json();

    // Find client record
    const searchUrl = `${BASE_URL}/Clients?filterByFormula=${encodeURIComponent(`{User ID}="${userId}"`)}&maxRecords=1`;
    const clientRes = await fetch(searchUrl, { headers: airtableHeaders });
    const clientData = await clientRes.json();

    if (!clientData.records || clientData.records.length === 0) {
      console.error("[microsoft-oauth-callback] Client introuvable:", userId);
      return { statusCode: 302, headers: { Location: "https://portal-akilai.netlify.app?microsoft=error" }, body: "" };
    }

    const recordId = clientData.records[0].id;

    await fetch(`${BASE_URL}/Clients/${recordId}`, {
      method: "PATCH",
      headers: airtableHeaders,
      body: JSON.stringify({
        fields: {
          "Microsoft Access Token":  access_token,
          "Microsoft Refresh Token": refresh_token || "",
          "Microsoft Connected":     true,
        },
      }),
    });

    return {
      statusCode: 302,
      headers: { Location: "https://portal-akilai.netlify.app?microsoft=connected" },
      body: "",
    };
  } catch (e) {
    console.error("[microsoft-oauth-callback] Exception:", e.message);
    return { statusCode: 302, headers: { Location: "https://portal-akilai.netlify.app?microsoft=error" }, body: "" };
  }
};
