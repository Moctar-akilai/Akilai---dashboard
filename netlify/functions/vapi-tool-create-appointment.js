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
  if (event.httpMethod !== "POST") return err("Method Not Allowed", 405);

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
    const dateDebut    = args.dateDebut    || body.dateDebut    || "";
    const dateFin      = args.dateFin      || body.dateFin      || "";
    const nomPatient   = args.nomPatient   || body.nomPatient   || "";
    const emailPatient = args.emailPatient || body.emailPatient || "";
    const telephone    = args.telephone    || body.telephone    || "";

    if (!userId)    return vapiError("Erreur: userId manquant.");
    if (!dateDebut) return vapiError("Erreur: dateDebut manquante.");
    if (!dateFin)   return vapiError("Erreur: dateFin manquante.");

    const searchUrl = `${BASE_URL}/Clients?filterByFormula=${encodeURIComponent(`{User ID}="${userId}"`)}&maxRecords=1`;
    const clientRes  = await fetch(searchUrl, { headers: airtableHeaders });
    const clientData = await clientRes.json();
    if (!clientData.records?.length) return vapiError("Client introuvable.");

    const record       = clientData.records[0];
    const recordId     = record.id;
    const fields       = record.fields;
    let   accessToken  = fields["Google Access Token"]  || "";
    const refreshToken = fields["Google Refresh Token"] || "";
    const calendarId   = fields["Google Calendar ID"]   || "primary";

    if (!accessToken && !refreshToken) return vapiError("Google Calendar non connecté.");

    const eventBody = {
      summary:     titre || `RDV — ${nomPatient}`,
      description: `Patient : ${nomPatient}${telephone ? `\nTél : ${telephone}` : ""}`,
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
      const newToken = await refreshGoogleToken(recordId, refreshToken);
      if (!newToken) return err("Impossible de rafraîchir le token Google", 502);
      accessToken = newToken;
      calRes = await createGcalEvent(accessToken);
    }

    if (!calRes.ok) {
      const t = await calRes.text();
      console.error("[vapi-tool-create-appointment] Google API error:", calRes.status, t);
      return vapiError(`Erreur Google Calendar ${calRes.status}.`);
    }

    const calendarEvent = await calRes.json();

    const dateObj  = new Date(dateDebut);
    const dateFmt  = dateObj.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
    const heureFmt = dateObj.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
    const resultText = `RDV confirmé le ${dateFmt} à ${heureFmt} pour ${nomPatient}.`;

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
