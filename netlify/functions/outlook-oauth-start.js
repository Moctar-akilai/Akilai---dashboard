const { corsHeaders, preflight } = require("./config");

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") return preflight();

  const userId = (event.queryStringParameters && event.queryStringParameters.userId) || "";
  if (!userId) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "userId requis" }) };
  }

  const clientId    = process.env.MICROSOFT_CLIENT_ID;
  const tenant      = process.env.MICROSOFT_TENANT_ID || "common";
  const redirectUri = "https://portal-akilai.netlify.app/.netlify/functions/outlook-oauth-callback";
  const scope       = "Mail.Send offline_access User.Read";

  const authUrl =
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize` +
    "?client_id="      + encodeURIComponent(clientId) +
    "&response_type=code" +
    "&redirect_uri="   + encodeURIComponent(redirectUri) +
    "&scope="          + encodeURIComponent(scope) +
    "&state="          + encodeURIComponent(userId) +
    "&response_mode=query";

  return {
    statusCode: 302,
    headers: { ...corsHeaders, Location: authUrl },
    body: "",
  };
};
