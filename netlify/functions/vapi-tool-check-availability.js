const { BASE_URL, headers: airtableHeaders, preflight } = require("./config");

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
  if (cursor.getUTCHours() * 60 + cursor.getUTCMinutes() < WORK_START) {
    cursor = new Date(cursor);
    cursor.setUTCHours(Math.floor(WORK_START / 60), WORK_START % 60, 0, 0);
  }

  while (cursor.getTime() + dur <= Math.min(new Date(dayEnd).getTime(), new Date(dayStart).setUTCHours(WORK_END / 60 | 0, WORK_END % 60, 0, 0))) {
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
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  try {
    const body      = JSON.parse(event.body || "{}");
    const vapiMsg   = body.message || body;
    const toolCall  = vapiMsg.toolCallList?.[0] || vapiMsg.toolCalls?.[0];
    const toolCallId = toolCall?.id || "tool-call-1";
    const args      = toolCall?.function?.arguments || body.arguments || body;
    const userId    =
      event.headers?.["x-user-id"] ||
      event.headers?.["X-User-Id"] ||
      args.userId ||
      body.userId || "";
    const duration  = parseInt(args.duration || body.duration || "30");

    /* Corriger l'année si dans le passé */
    let date = args.date || body.date || "";
    if (date) {
      const dateObj = new Date(date);
      const now     = new Date();
      if (dateObj < now) {
        dateObj.setFullYear(now.getFullYear());
        if (dateObj < now) dateObj.setFullYear(now.getFullYear() + 1);
        date = dateObj.toISOString().split("T")[0];
        console.log("[check-availability] date corrigée:", date);
      }
    }

    console.log("[check-availability] userId:", userId, "| date:", date, "| duration:", duration);

    const vapiError = (msg) => ({
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results: [{ toolCallId, result: msg }] }),
    });

    if (!userId) return vapiError("Erreur: userId manquant.");
    if (!date)   return vapiError("Erreur: date manquante.");

    console.log("[check-availability] étape 1: recherche client Airtable");
    const searchUrl  = `${BASE_URL}/Clients?filterByFormula=${encodeURIComponent(`{User ID}="${userId}"`)}&maxRecords=1`;
    const clientRes  = await fetch(searchUrl, { headers: airtableHeaders });
    const clientData = await clientRes.json();
    if (!clientData.records?.length) return vapiError("Client introuvable.");

    const record       = clientData.records[0];
    const recordId     = record.id;
    const fields       = record.fields;
    let   accessToken  = fields["Google Access Token"]  || "";
    const refreshToken = fields["Google Refresh Token"] || "";
    const calendarId   = fields["Google Calendar ID"]   || "primary";

    console.log("[check-availability] étape 2: token récupéré:", !!accessToken, "| refreshToken:", !!refreshToken);

    if (!accessToken && !refreshToken) {
      return vapiError("Google Calendar non connecté.");
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

    console.log("[check-availability] étape 3: appel Google Calendar API");
    let gcalRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    console.log("[check-availability] étape 4: status Google:", gcalRes.status);

    if (gcalRes.status === 401 && refreshToken) {
      console.log("[check-availability] token expiré → refresh");
      const newToken = await refreshGoogleToken(recordId, refreshToken);
      if (!newToken) return vapiError("Impossible de rafraîchir le token Google.");
      accessToken = newToken;
      gcalRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      console.log("[check-availability] après refresh, status Google:", gcalRes.status);
    }

    if (!gcalRes.ok) {
      const t = await gcalRes.text();
      console.error("[check-availability] Google API error:", gcalRes.status, t);
      return vapiError(`Erreur Google Calendar ${gcalRes.status}.`);
    }

    const gcalData = await gcalRes.json();
    const busy = (gcalData.items || [])
      .filter(e => e.status !== "cancelled" && e.start?.dateTime)
      .map(e => ({ start: e.start.dateTime, end: e.end.dateTime }));

    console.log("[check-availability] étape 5: nb events:", busy.length);

    const slots     = buildSlots(busy, dayStart, dayEnd, duration);
    const dateLabel = new Date(date + "T12:00:00Z").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

    let resultText;
    if (slots.length === 0) {
      resultText = `Aucun créneau disponible le ${dateLabel}.`;
    } else {
      const slotLabels = slots.slice(0, 6).map(s => {
        const t = new Date(s.start);
        return t.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
      });
      resultText = `Créneaux disponibles le ${dateLabel} : ${slotLabels.join(", ")}.`;
    }

    console.log("[check-availability] résultat:", resultText);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        results: [{ toolCallId, result: resultText }],
      }),
    };

  } catch (e) {
    console.error("[check-availability] ERREUR:", e.message, e.stack);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        results: [{ toolCallId: "tool-call-1", result: "Erreur lors de la vérification: " + e.message }],
      }),
    };
  }
};
