const { BASE_URL, headers: airtableHeaders, ok, err, preflight } = require("./config");

async function refreshMicrosoftToken() {} // placeholder not used here

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

  try {
    const p     = event.queryStringParameters || {};
    const userId = p.userId || "";
    const start  = p.start  || "";
    const end    = p.end    || "";
    if (!userId) return err("userId requis", 400);

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

    if (!accessToken && !refreshToken) return err("Google non connecté", 400);

    const params = new URLSearchParams({
      timeMin: start || new Date(Date.now() - 30 * 86400000).toISOString(),
      timeMax: end   || new Date(Date.now() + 60 * 86400000).toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    });

    let eventsRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (eventsRes.status === 401 && refreshToken) {
      const newToken = await refreshGoogleToken(recordId, refreshToken);
      if (!newToken) return err("Impossible de rafraîchir le token Google", 502);
      accessToken = newToken;
      eventsRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
    }

    if (!eventsRes.ok) {
      const t = await eventsRes.text();
      console.error("[get-google-calendar-events] API error:", eventsRes.status, t);
      return err(`Google API ${eventsRes.status}`, 502);
    }

    const data = await eventsRes.json();
    const colorMap = {
      "1": "#7986CB", "2": "#33B679", "3": "#8E24AA", "4": "#E67C73",
      "5": "#F6BF26", "6": "#F4511E", "7": "#039BE5", "8": "#616161",
      "9": "#3F51B5", "10": "#0B8043", "11": "#D50000",
    };

    const events = (data.items || [])
      .filter(e => e.status !== "cancelled")
      .map(e => ({
        id:    e.id,
        title: e.summary || "(Sans titre)",
        start: e.start.dateTime || e.start.date,
        end:   e.end.dateTime   || e.end.date,
        color: e.colorId ? colorMap[e.colorId] : "#70B2DE",
        extendedProps: {
          description: e.description || "",
          location:    e.location    || "",
          meetLink:    e.hangoutLink || "",
          attendees:   (e.attendees || []).map(a => a.email),
          googleId:    e.id,
        },
      }));

    return ok({ events });
  } catch (e) {
    console.error("[get-google-calendar-events] Exception:", e.message);
    return err(e.message);
  }
};
