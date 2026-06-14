const { BASE_URL, headers: airtableHeaders, preflight } = require("./config");

/* Cache token en mémoire (50 min) */
const tokenCache = {};

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
  /* Fire-and-forget save */
  fetch(`${BASE_URL}/Clients/${recordId}`, {
    method: "PATCH",
    headers: airtableHeaders,
    body: JSON.stringify({ fields: { "Google Access Token": data.access_token } }),
  }).catch(() => {});
  return data.access_token;
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
    const duration   = parseInt(args.duration || body.duration || event.headers?.["x-duree-rdv"] || "30");

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
    const tokenFields = ["Google Access Token", "Google Refresh Token", "Google Calendar ID", "Capacite Creneau", "Duree RDV", "Heure Ouverture", "Heure Fermeture"]
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

    /* Paramètres RDV — headers en priorité (plus récents), puis Airtable */
    const capacite   = parseInt(event.headers?.["x-capacite"])        || Number(fields["Capacite Creneau"]) || 1;
    const dureeMin   = parseInt(event.headers?.["x-duree-rdv"])       || Number(fields["Duree RDV"])        || duration || 30;
    const heureOuv   = event.headers?.["x-heure-ouverture"]          || fields["Heure Ouverture"]           || "08:00";
    const heureFerm  = event.headers?.["x-heure-fermeture"]          || fields["Heure Fermeture"]           || "19:00";

    /* Token avec cache mémoire */
    let accessToken = tokenCache[userId]?.token && Date.now() < tokenCache[userId]?.expiry
      ? tokenCache[userId].token
      : storedToken;

    if (!accessToken && !refreshToken) return vapiError("Google Calendar non connecté.");

    console.log("[check-availability] étape 2: token cached:", !!tokenCache[userId], "| capacite:", capacite, "| duree:", dureeMin, "| horaires:", heureOuv, "-", heureFerm);

    /* Détecter l'offset Europe/Paris (CET +01:00 ou CEST +02:00) */
    const parisFormatter = new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      timeZoneName: "shortOffset",
      year: "numeric",
    });
    const parisOffsetRaw = parisFormatter.formatToParts(new Date(`${date}T12:00:00Z`))
      .find(p => p.type === "timeZoneName")?.value || "UTC+2";
    /* "UTC+2" → "+02:00", "UTC+1" → "+01:00" */
    const parisOffset = parisOffsetRaw.replace("UTC", "").replace(/^([+-])(\d)$/, "$1$20:00").replace(/^([+-]\d{2})$/, "$1:00");

    const dayStart = `${date}T00:00:00${parisOffset}`;
    const dayEnd   = `${date}T23:59:59${parisOffset}`;

    console.log("[check-availability] Paris offset:", parisOffset, "| timeMin:", dayStart);

    const params = new URLSearchParams({
      timeMin:      dayStart,
      timeMax:      dayEnd,
      singleEvents: "true",
      orderBy:      "startTime",
      maxResults:   "250",
      timeZone:     "Europe/Paris",
    });

    console.log("[check-availability] étape 3: appel Google Calendar API");
    let gcalRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    console.log("[check-availability] étape 4: status Google:", gcalRes.status);

    if (gcalRes.status === 401 && refreshToken) {
      console.log("[check-availability] token expiré → refresh");
      delete tokenCache[userId];
      const newToken = await refreshGoogleToken(recordId, refreshToken);
      if (!newToken) return vapiError("Impossible de rafraîchir le token Google.");
      accessToken = newToken;
      tokenCache[userId] = { token: newToken, expiry: Date.now() + 50 * 60 * 1000 };
      gcalRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
    } else if (gcalRes.ok && !tokenCache[userId]) {
      /* Mettre en cache le token après un succès sans cache */
      tokenCache[userId] = { token: accessToken, expiry: Date.now() + 50 * 60 * 1000 };
    }

    if (!gcalRes.ok) {
      const t = await gcalRes.text();
      console.error("[check-availability] Google API error:", gcalRes.status, t);
      return vapiError(`Erreur Google Calendar ${gcalRes.status}.`);
    }

    const gcalData = await gcalRes.json();
    const events   = gcalData.items || [];
    console.log("[check-availability] étape 5: nb events:", events.length);
    console.log("[check-availability] events reçus:", JSON.stringify(
      events.map(e => ({ titre: e.summary, debut: e.start?.dateTime || e.start?.date, fin: e.end?.dateTime || e.end?.date }))
    ));

    /* ── Générer les créneaux en heure Europe/Paris ── */
    const [startH, startM] = heureOuv.split(":").map(Number);
    const [endH,   endM]   = heureFerm.split(":").map(Number);
    const startMinutes     = startH * 60 + startM;
    const endMinutes       = endH   * 60 + endM;

    const availableSlots = [];
    for (let m = startMinutes; m + dureeMin <= endMinutes; m += dureeMin) {
      const hh  = Math.floor(m / 60).toString().padStart(2, "0");
      const mm  = (m % 60).toString().padStart(2, "0");
      /* Créneau exprimé en heure Paris (avec offset détecté) */
      const slotStart = new Date(`${date}T${hh}:${mm}:00${parisOffset}`);
      const slotEnd   = new Date(slotStart.getTime() + dureeMin * 60000);

      /* Compter les RDV existants qui chevauchent ce créneau */
      const overlapping = events.filter(ev => {
        const evStart = new Date(ev.start?.dateTime || ev.start?.date);
        const evEnd   = new Date(ev.end?.dateTime   || ev.end?.date);
        return ev.status !== "cancelled" && evStart < slotEnd && evEnd > slotStart;
      });

      if (overlapping.length < capacite) {
        const remaining = capacite - overlapping.length;
        if (capacite === 1) {
          availableSlots.push(`${hh}:${mm}`);
        } else {
          availableSlots.push(`${hh}:${mm} (${remaining} place${remaining > 1 ? "s" : ""} restante${remaining > 1 ? "s" : ""})`);
        }
      }
    }

    const dateLabel = new Date(date + "T12:00:00Z").toLocaleDateString("fr-FR", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });

    let resultText;
    if (availableSlots.length === 0) {
      resultText = `Aucun créneau disponible le ${dateLabel}. Voulez-vous que je vérifie une autre date ?`;
    } else {
      const shown = availableSlots.slice(0, 6);
      resultText = `Créneaux disponibles le ${dateLabel} : ${shown.join(", ")}.`;
      if (availableSlots.length > 6) {
        resultText += ` Et ${availableSlots.length - 6} autres créneaux.`;
      }
    }

    console.log("[check-availability] résultat:", resultText);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results: [{ toolCallId, result: resultText }] }),
    };

  } catch (e) {
    console.error("[check-availability] ERREUR:", e.message, e.stack);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results: [{ toolCallId: "tool-call-1", result: "Erreur lors de la vérification: " + e.message }] }),
    };
  }
};
