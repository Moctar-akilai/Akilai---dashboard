const { BASE_URL, headers: airtableHeaders, ok, err, preflight } = require("./config");

async function refreshOutlookToken(recordId, refreshToken) {
  const res = await fetch(`https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID || "common"}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id:     process.env.MICROSOFT_CLIENT_ID,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET,
      grant_type:    "refresh_token",
      scope:         "Mail.Send offline_access",
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.access_token) return null;
  await fetch(`${BASE_URL}/Clients/${recordId}`, {
    method: "PATCH",
    headers: airtableHeaders,
    body: JSON.stringify({ fields: { "Outlook Access Token": data.access_token } }),
  });
  return data.access_token;
}

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Method Not Allowed", 405);

  try {
    const { userId, to, subject, body: emailBody } = JSON.parse(event.body || "{}");
    if (!userId || !to || !subject) return err("userId, to et subject requis", 400);

    const searchUrl = `${BASE_URL}/Clients?filterByFormula=${encodeURIComponent(`{User ID}="${userId}"`)}&maxRecords=1`;
    const clientRes = await fetch(searchUrl, { headers: airtableHeaders });
    const clientData = await clientRes.json();
    if (!clientData.records?.length) return err("Client introuvable", 404);

    const record       = clientData.records[0];
    const recordId     = record.id;
    const fields       = record.fields;
    let   accessToken  = fields["Outlook Access Token"];
    const refreshToken = fields["Outlook Refresh Token"];

    if (!accessToken && !refreshToken) return err("Outlook non connecté", 400);

    const payload = {
      message: {
        subject,
        body: { contentType: "HTML", content: emailBody || "" },
        toRecipients: [{ emailAddress: { address: to } }],
      },
    };

    let sendRes = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (sendRes.status === 401 && refreshToken) {
      const newToken = await refreshOutlookToken(recordId, refreshToken);
      if (!newToken) return err("Impossible de rafraîchir le token Outlook", 502);
      accessToken = newToken;
      sendRes = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

    if (!sendRes.ok && sendRes.status !== 202 && sendRes.status !== 204) {
      const t = await sendRes.text();
      console.error("[send-outlook-email] Graph error:", sendRes.status, t);
      return err(`Graph API ${sendRes.status}`, 502);
    }

    return ok({ success: true });
  } catch (e) {
    console.error("[send-outlook-email] Exception:", e.message);
    return err(e.message);
  }
};
