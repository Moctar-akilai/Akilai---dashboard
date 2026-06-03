const { BASE_URL, headers: airtableHeaders, ok, err, preflight } = require("./config");

async function refreshAccessToken(recordId, refreshToken) {
  const res = await fetch(
    `${process.env.URL || "https://portal-akilai.netlify.app"}/.netlify/functions/google-refresh-token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recordId, refreshToken }),
    }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token || null;
}

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") return preflight();

  try {
    const { userId, titre, description, dateDebut, dateFin, inviteEmail } = JSON.parse(event.body || "{}");
    if (!userId) return err("userId requis", 400);

    // Fetch client from Airtable
    const searchUrl = `${BASE_URL}/Clients?filterByFormula=${encodeURIComponent(`{User ID}="${userId}"`)}`;
    const clientRes = await fetch(searchUrl, { headers: airtableHeaders });
    const clientData = await clientRes.json();

    if (!clientData.records || clientData.records.length === 0) {
      return err("Client introuvable", 404);
    }

    const record       = clientData.records[0];
    const recordId     = record.id;
    const fields       = record.fields;
    let accessToken    = fields["Google Access Token"];
    const refreshToken = fields["Google Refresh Token"];
    const calendarId   = fields["Google Calendar ID"] || "primary";

    if (!accessToken && !refreshToken) {
      return err("Google Calendar non connecté pour ce client", 400);
    }

    // Build event body
    const eventBody = {
      summary:     titre || "RDV AkilAI",
      description: description || "",
      start: { dateTime: dateDebut, timeZone: "Europe/Paris" },
      end:   { dateTime: dateFin,   timeZone: "Europe/Paris" },
    };
    if (inviteEmail) {
      eventBody.attendees = [{ email: inviteEmail }];
      eventBody.sendUpdates = "all";
    }

    // Try creating the event
    let calRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(eventBody),
      }
    );

    // If 401 — refresh and retry once
    if (calRes.status === 401 && refreshToken) {
      console.log("[google-calendar-create-event] Token expiré, rafraîchissement…");
      const newToken = await refreshAccessToken(recordId, refreshToken);
      if (!newToken) return err("Impossible de rafraîchir le token Google", 502);
      accessToken = newToken;

      calRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(eventBody),
        }
      );
    }

    if (!calRes.ok) {
      const t = await calRes.text();
      console.error("[google-calendar-create-event] Erreur Calendar API:", calRes.status, t);
      return err(`Calendar API ${calRes.status}`, 502);
    }

    const event = await calRes.json();
    return ok({ success: true, eventId: event.id, eventLink: event.htmlLink });
  } catch (e) {
    console.error("[google-calendar-create-event] Exception:", e.message);
    return err(e.message);
  }
};
