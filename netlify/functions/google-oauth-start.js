const { corsHeaders, preflight } = require("./config");

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") return preflight();

  const params = event.queryStringParameters || {};
  const userId = params.userId || "";
  if (!userId) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "userId requis" }) };
  }

  const clientId    = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = "https://portal-akilai.netlify.app/.netlify/functions/google-oauth-callback";

  // Combine Calendar + Sheets scopes in a single OAuth flow
  const scope = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/spreadsheets",
  ].join(" ");

  const authUrl =
    "https://accounts.google.com/o/oauth2/v2/auth" +
    "?client_id="      + encodeURIComponent(clientId) +
    "&redirect_uri="   + encodeURIComponent(redirectUri) +
    "&response_type=code" +
    "&scope="          + encodeURIComponent(scope) +
    "&access_type=offline" +
    "&prompt=consent" +
    "&state="          + encodeURIComponent(userId);

  return {
    statusCode: 302,
    headers: { ...corsHeaders, Location: authUrl },
    body: "",
  };
};
