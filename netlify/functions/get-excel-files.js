const { BASE_URL, headers: airtableHeaders, ok, err, preflight } = require("./config");

const BASE_SITE = process.env.URL || "https://portal-akilai.netlify.app";

async function refreshMicrosoftToken(recordId, refreshToken) {
  const clientId     = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const tenant       = process.env.MICROSOFT_TENANT_ID || "common";

  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id:     clientId,
      client_secret: clientSecret,
      grant_type:    "refresh_token",
      scope:         "Files.ReadWrite offline_access",
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.access_token) return null;

  // Update token in Airtable
  await fetch(`${BASE_URL}/Clients/${recordId}`, {
    method: "PATCH",
    headers: airtableHeaders,
    body: JSON.stringify({ fields: { "Microsoft Access Token": data.access_token } }),
  });

  return data.access_token;
}

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") return preflight();

  try {
    const userId = (event.queryStringParameters && event.queryStringParameters.userId) || "";
    if (!userId) return err("userId requis", 400);

    const searchUrl = `${BASE_URL}/Clients?filterByFormula=${encodeURIComponent(`{User ID}="${userId}"`)}&maxRecords=1`;
    const clientRes = await fetch(searchUrl, { headers: airtableHeaders });
    const clientData = await clientRes.json();

    if (!clientData.records || clientData.records.length === 0) return err("Client introuvable", 404);

    const record       = clientData.records[0];
    const recordId     = record.id;
    const fields       = record.fields;
    let   accessToken  = fields["Microsoft Access Token"];
    const refreshToken = fields["Microsoft Refresh Token"];

    if (!accessToken && !refreshToken) return err("Microsoft non connecté", 400);

    // Search Excel files in OneDrive
    let filesRes = await fetch(
      "https://graph.microsoft.com/v1.0/me/drive/root/search(q='.xlsx')?$select=id,name,webUrl&$top=20",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    // Refresh and retry on 401
    if (filesRes.status === 401 && refreshToken) {
      const newToken = await refreshMicrosoftToken(recordId, refreshToken);
      if (!newToken) return err("Impossible de rafraîchir le token Microsoft", 502);
      accessToken = newToken;
      filesRes = await fetch(
        "https://graph.microsoft.com/v1.0/me/drive/root/search(q='.xlsx')?$select=id,name,webUrl&$top=20",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
    }

    if (!filesRes.ok) {
      const t = await filesRes.text();
      console.error("[get-excel-files] Graph API error:", filesRes.status, t);
      return err(`Graph API ${filesRes.status}`, 502);
    }

    const data  = await filesRes.json();
    const files = (data.value || []).map(f => ({ id: f.id, name: f.name, webUrl: f.webUrl }));
    return ok({ files });
  } catch (e) {
    console.error("[get-excel-files] Exception:", e.message);
    return err(e.message);
  }
};
