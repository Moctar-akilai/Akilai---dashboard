const { BASE_URL, headers: airtableHeaders, ok, err, preflight } = require("./config");

async function refreshGoogleToken(recordId, refreshToken) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type:    "refresh_token",
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.access_token) return null;
  await fetch(`${BASE_URL}/Clients/${recordId}`, {
    method: "PATCH",
    headers: airtableHeaders,
    body: JSON.stringify({ fields: { "Google Access Token": data.access_token } }),
  });
  return data.access_token;
}

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "DELETE" && event.httpMethod !== "POST") return err("Method Not Allowed", 405);

  try {
    const { userId, eventId } = JSON.parse(event.body || "{}");
    if (!userId || !eventId) return err("userId et eventId requis", 400);

    const searchUrl = `${BASE_URL}/Clients?filterByFormula=${encodeURIComponent(`{User ID}="${userId}"`)}&maxRecords=1`;
    const clientRes = await fetch(searchUrl, { headers: airtableHeaders });
    const clientData = await clientRes.json();
    if (!clientData.records || clientData.records.length === 0) return err("Client introuvable", 404);

    const record       = clientData.records[0];
    const recordId     = record.id;
    const fields       = record.fields;
    let   accessToken  = fields["Google Access Token"];
    const refreshToken = fields["Google Refresh Token"];
    const calendarId   = fields["Google Calendar ID"] || "primary";

    let delRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (delRes.status === 401 && refreshToken) {
      const newToken = await refreshGoogleToken(recordId, refreshToken);
      if (!newToken) return err("Impossible de rafraîchir le token Google", 502);
      accessToken = newToken;
      delRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }
      );
    }

    if (!delRes.ok && delRes.status !== 204) {
      const t = await delRes.text();
      return err(`Google API ${delRes.status}: ${t}`, 502);
    }

    return ok({ success: true });
  } catch (e) {
    console.error("[delete-google-calendar-event] Exception:", e.message);
    return err(e.message);
  }
};
