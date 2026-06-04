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

function buildSlots(busyList, dayStart, dayEnd, durationMin) {
  const slots = [];
  const dur   = (durationMin || 30) * 60 * 1000;
  const step  = dur;
  const WORK_START = 8 * 60;  // 08:00
  const WORK_END   = 19 * 60; // 19:00

  let cursor = new Date(dayStart);
  // Align to work hours start
  if (cursor.getUTCHours() * 60 + cursor.getUTCMinutes() < WORK_START) {
    cursor = new Date(cursor);
    cursor.setUTCHours(Math.floor(WORK_START / 60), WORK_START % 60, 0, 0);
  }

  const end = new Date(dayEnd);

  while (cursor.getTime() + dur <= Math.min(end.getTime(), new Date(dayStart).setUTCHours(WORK_END / 60 | 0, WORK_END % 60, 0, 0))) {
    const slotEnd = new Date(cursor.getTime() + dur);
    const overlap = busyList.some(b => {
      const bs = new Date(b.start).getTime();
      const be = new Date(b.end).getTime();
      return cursor.getTime() < be && slotEnd.getTime() > bs;
    });
    if (!overlap) {
      slots.push({
        start: cursor.toISOString().replace("Z", "+00:00"),
        end:   slotEnd.toISOString().replace("Z", "+00:00"),
      });
    }
    cursor = new Date(cursor.getTime() + step);
  }
  return slots;
}

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Method Not Allowed", 405);

  try {
    const body     = JSON.parse(event.body || "{}");
    console.log("[vapi-tool-check-availability] body:", JSON.stringify(body).substring(0, 2000));
    const vapiMsg  = body.message || body;
    const toolCall = vapiMsg.toolCallList?.[0] || vapiMsg.toolCalls?.[0];
    const args     = toolCall?.function?.arguments || body.arguments || body;
    const call     = vapiMsg.call || body.call || {};
    const userId   =
      args.userId ||
      call?.assistantOverrides?.metadata?.userId ||
      call?.assistant?.metadata?.userId ||
      call?.metadata?.userId ||
      vapiMsg.metadata?.userId ||
      body.userId || "";
    const date   = args.date || body.date || "";
    console.log("[vapi-tool-check-availability] userId:", userId, "| args:", JSON.stringify(args));
    const duration = parseInt(args.duration || body.duration || "30");

    if (!userId) return err("userId requis", 400);
    if (!date)   return err("date requise", 400);

    const searchUrl = `${BASE_URL}/Clients?filterByFormula=${encodeURIComponent(`{User ID}="${userId}"`)}&maxRecords=1`;
    const clientRes  = await fetch(searchUrl, { headers: airtableHeaders });
    const clientData = await clientRes.json();
    if (!clientData.records?.length) return err("Client introuvable", 404);

    const record       = clientData.records[0];
    const recordId     = record.id;
    const fields       = record.fields;
    let   accessToken  = fields["Google Access Token"]  || "";
    const refreshToken = fields["Google Refresh Token"] || "";
    const calendarId   = fields["Google Calendar ID"]   || "primary";

    if (!accessToken && !refreshToken) {
      return ok({ available: false, slots: [], message: "Google Calendar non connecté." });
    }

    const dayStart = new Date(date + "T00:00:00Z").toISOString();
    const dayEnd   = new Date(date + "T23:59:59Z").toISOString();

    const params = new URLSearchParams({
      timeMin:      dayStart,
      timeMax:      dayEnd,
      singleEvents: "true",
      orderBy:      "startTime",
      maxResults:   "100",
    });

    let gcalRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (gcalRes.status === 401 && refreshToken) {
      const newToken = await refreshGoogleToken(recordId, refreshToken);
      if (!newToken) return err("Impossible de rafraîchir le token Google", 502);
      accessToken = newToken;
      gcalRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
    }

    if (!gcalRes.ok) {
      const t = await gcalRes.text();
      console.error("[vapi-tool-check-availability] Google API error:", gcalRes.status, t);
      return err(`Google API ${gcalRes.status}`, 502);
    }

    const gcalData = await gcalRes.json();
    const busy = (gcalData.items || [])
      .filter(e => e.status !== "cancelled" && e.start?.dateTime)
      .map(e => ({ start: e.start.dateTime, end: e.end.dateTime }));

    const slots = buildSlots(busy, dayStart, dayEnd, duration);

    const dateLabel = new Date(date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

    let message;
    if (slots.length === 0) {
      message = `Aucun créneau disponible le ${dateLabel}.`;
    } else {
      const slotLabels = slots.slice(0, 6).map(s => {
        const t = new Date(s.start);
        return `${t.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}`;
      });
      message = `Créneaux disponibles le ${dateLabel} : ${slotLabels.join(", ")}.`;
    }

    return ok({ available: slots.length > 0, slots: slots.slice(0, 10), message });
  } catch (e) {
    console.error("[vapi-tool-check-availability] Exception:", e.message);
    return err(e.message);
  }
};
