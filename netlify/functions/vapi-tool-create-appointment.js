const { BASE_URL, headers: airtableHeaders, preflight } = require("./config");
const { getTermeContact } = require("./notify-rdv");

/* Cache token en mémoire (50 min) */
const tokenCache = {};

async function getAccessToken(userId, recordId, storedToken, refreshToken) {
  const cached = tokenCache[userId];
  if (cached && cached.token && Date.now() < cached.expiry) {
    return cached.token;
  }
  let token = storedToken;
  if (!token && refreshToken) {
    token = await refreshGoogleToken(recordId, refreshToken);
  } else if (token && refreshToken) {
    token = storedToken;
  }
  if (token) {
    tokenCache[userId] = { token, expiry: Date.now() + 50 * 60 * 1000 };
  }
  return token;
}

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
  fetch(`${BASE_URL}/Clients/${recordId}`, {
    method: "PATCH",
    headers: airtableHeaders,
    body: JSON.stringify({ fields: { "Google Access Token": data.access_token } }),
  }).catch(() => {});
  return data.access_token;
}

/* Retire le suffixe 'Z' si présent pour que Google Calendar
   interprète l'heure comme heure locale Paris (via timeZone field)
   et non UTC. Ex: "2026-06-20T12:30:00Z" → "2026-06-20T12:30:00" */
function stripUtcZ(dt) {
  if (!dt) return dt;
  return dt.endsWith("Z") ? dt.slice(0, -1) : dt;
}

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  try {
    const body       = JSON.parse(event.body || "{}");
    const vapiMsg    = body.message || body;
    const toolCall   = vapiMsg.toolCallList?.[0] || vapiMsg.toolCalls?.[0];
    const toolCallId = toolCall?.id || "tool-call-1";
    const args       = toolCall?.function?.arguments || body.arguments || body;
    const userId     =
      event.headers?.["x-user-id"] ||
      event.headers?.["X-User-Id"] ||
      args.userId ||
      body.userId || "";
    console.log("[vapi-tool-create-appointment] userId:", userId, "| args:", JSON.stringify(args));

    const vapiError = (msg) => ({
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results: [{ toolCallId, result: msg }] }),
    });

    const titre        = args.titre        || body.titre        || "";
    const rawDebut     = args.dateDebut    || body.dateDebut    || "";
    const rawFin       = args.dateFin      || body.dateFin      || "";
    const nomPatient   = args.nomPatient   || body.nomPatient   || "";
    const emailPatient = args.emailPatient || body.emailPatient || "";
    const telephone    = args.telephone    || body.telephone    || "";

    /* Strip 'Z' so Google Calendar applies timeZone: Europe/Paris correctly */
    const dateDebut = stripUtcZ(rawDebut);
    const dateFin   = stripUtcZ(rawFin);

    console.log("[vapi-tool-create-appointment] dateDebut brut:", rawDebut, "→ utilisé:", dateDebut);

    if (!userId)    return vapiError("Erreur: userId manquant.");
    if (!dateDebut) return vapiError("Erreur: dateDebut manquante.");
    if (!dateFin)   return vapiError("Erreur: dateFin manquante.");

    const tokenFields = ["Google Access Token", "Google Refresh Token", "Google Calendar ID", "Secteur", "Email"]
      .map(f => `fields[]=${encodeURIComponent(f)}`).join("&");
    const searchUrl  = `${BASE_URL}/Clients?filterByFormula=${encodeURIComponent(`{User ID}="${userId}"`)}&maxRecords=1&${tokenFields}`;
    const clientRes  = await fetch(searchUrl, { headers: airtableHeaders });
    const clientData = await clientRes.json();
    if (!clientData.records?.length) return vapiError("Client introuvable.");

    const record       = clientData.records[0];
    const recordId     = record.id;
    const fields       = record.fields;
    const storedToken  = fields["Google Access Token"]  || "";
    const refreshToken = fields["Google Refresh Token"] || "";
    const calendarId   = fields["Google Calendar ID"]   || "primary";
    const secteur      = fields["Secteur"]              || "";
    const clientEmail  = fields["Email"]                || "";
    const terme        = getTermeContact(secteur);

    if (!storedToken && !refreshToken) return vapiError("Google Calendar non connecté.");

    let accessToken = await getAccessToken(userId, recordId, storedToken, refreshToken);
    if (!accessToken) return vapiError("Impossible d'obtenir un token Google.");

    const eventBody = {
      summary:     titre || `RDV — ${nomPatient}`,
      description: `${terme} : ${nomPatient}${telephone ? `\nTél : ${telephone}` : ""}`,
      start:       { dateTime: dateDebut, timeZone: "Europe/Paris" },
      end:         { dateTime: dateFin,   timeZone: "Europe/Paris" },
    };
    if (emailPatient) eventBody.attendees = [{ email: emailPatient }];

    const createGcalEvent = async (token) =>
      fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(eventBody),
        }
      );

    let calRes = await createGcalEvent(accessToken);

    if (calRes.status === 401 && refreshToken) {
      delete tokenCache[userId];
      const newToken = await refreshGoogleToken(recordId, refreshToken);
      if (!newToken) return vapiError("Impossible de rafraîchir le token Google.");
      accessToken = newToken;
      tokenCache[userId] = { token: newToken, expiry: Date.now() + 50 * 60 * 1000 };
      calRes = await createGcalEvent(accessToken);
    }

    if (!calRes.ok) {
      const t = await calRes.text();
      console.error("[vapi-tool-create-appointment] Google API error:", calRes.status, t);
      return vapiError(`Erreur Google Calendar ${calRes.status}.`);
    }

    const calEvent = await calRes.json();

    /* Affichage en heure de Paris */
    const dateObj  = new Date(dateDebut + (dateDebut.includes("+") ? "" : "+02:00"));
    const dateFmt  = dateObj.toLocaleDateString("fr-FR", {
      weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris",
    });
    const heureFmt = dateObj.toLocaleTimeString("fr-FR", {
      hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris",
    });
    const resultText = `RDV confirmé le ${dateFmt} à ${heureFmt} pour ${nomPatient}.`;

    /* Notification email — fire-and-forget */
    const serverUrl = process.env.URL || "https://portal-akilai.netlify.app";
    fetch(`${serverUrl}/.netlify/functions/notify-rdv`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        nomPatient,
        date:        dateFmt,
        heure:       heureFmt,
        titre,
        telephone,
        secteur,
        clientEmail,
        eventLink:   calEvent.htmlLink || "",
      }),
    }).catch(e => console.warn("[vapi-tool-create-appointment] notify-rdv error:", e.message));

    console.log("[vapi-tool-create-appointment] résultat:", resultText);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results: [{ toolCallId, result: resultText }] }),
    };
  } catch (e) {
    console.error("[vapi-tool-create-appointment] ERREUR:", e.message, e.stack);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results: [{ toolCallId: "tool-call-1", result: "Erreur: " + e.message }] }),
    };
  }
};
