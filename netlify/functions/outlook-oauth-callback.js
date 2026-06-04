const { BASE_URL, headers: airtableHeaders } = require("./config");

exports.handler = async function(event) {
  const params     = event.queryStringParameters || {};
  const code       = params.code;
  const userId     = params.state ? decodeURIComponent(params.state) : null;
  const errorParam = params.error;

  if (errorParam || !code || !userId) {
    return { statusCode: 302, headers: { Location: "https://portal-akilai.netlify.app?outlook=error" }, body: "" };
  }

  try {
    const clientId     = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    const tenant       = process.env.MICROSOFT_TENANT_ID || "common";
    const redirectUri  = "https://portal-akilai.netlify.app/.netlify/functions/outlook-oauth-callback";

    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  redirectUri,
        grant_type:    "authorization_code",
        scope:         "Mail.Send offline_access User.Read",
      }),
    });

    if (!tokenRes.ok) {
      console.error("[outlook-oauth-callback] Erreur token:", tokenRes.status, await tokenRes.text());
      return { statusCode: 302, headers: { Location: "https://portal-akilai.netlify.app?outlook=error" }, body: "" };
    }

    const { access_token, refresh_token } = await tokenRes.json();

    const searchUrl = `${BASE_URL}/Clients?filterByFormula=${encodeURIComponent(`{User ID}="${userId}"`)}&maxRecords=1`;
    const clientRes = await fetch(searchUrl, { headers: airtableHeaders });
    const clientData = await clientRes.json();

    if (!clientData.records || clientData.records.length === 0) {
      return { statusCode: 302, headers: { Location: "https://portal-akilai.netlify.app?outlook=error" }, body: "" };
    }

    const recordId = clientData.records[0].id;
    await fetch(`${BASE_URL}/Clients/${recordId}`, {
      method: "PATCH",
      headers: airtableHeaders,
      body: JSON.stringify({
        fields: {
          "Outlook Access Token":  access_token,
          "Outlook Refresh Token": refresh_token || "",
          "Outlook Connected":     true,
        },
      }),
    });

    return { statusCode: 302, headers: { Location: "https://portal-akilai.netlify.app?outlook=connected" }, body: "" };
  } catch (e) {
    console.error("[outlook-oauth-callback] Exception:", e.message);
    return { statusCode: 302, headers: { Location: "https://portal-akilai.netlify.app?outlook=error" }, body: "" };
  }
};
