const { BASE_URL, headers, ok, err, preflight } = require("./config");
const { sendEmail, buildConfirmationEmail }    = require("./resend-email");

/**
 * POST /.netlify/functions/create-booking
 * Body : { salonId, prestationId, dateHeure (ISO), nomClient, telephoneClient }
 * Actions :
 *   1. Vérifie Offre RDV active
 *   2. Re-vérifie que le créneau est toujours libre (race condition)
 *   3. Écrit dans Airtable Rendez-vous
 *   4. Crée l'événement Google Calendar du salon (fire-and-forget)
 *   5. Envoie un SMS de confirmation Twilio (fire-and-forget)
 */
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Méthode non autorisée", 405);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch(e) { return err("JSON invalide", 400); }

  const { salonId, prestationId, dateHeure, nomClient, telephoneClient, emailClient } = body;
  if (!salonId || !prestationId || !dateHeure || !nomClient || !telephoneClient || !emailClient) {
    return err("Champs requis : salonId, prestationId, dateHeure, nomClient, telephoneClient, emailClient", 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClient)) {
    return err("Format email invalide", 400);
  }

  const slotStart = new Date(dateHeure);
  if (isNaN(slotStart.getTime())) return err("dateHeure invalide", 400);

  try {
    // 1. Fetch salon + prestation en parallèle
    const [salonRes, prestRes] = await Promise.all([
      fetch(`${BASE_URL}/Salons/${salonId}`, { headers }),
      fetch(`${BASE_URL}/Prestations/${prestationId}`, { headers }),
    ]);
    if (!salonRes.ok) return err("Salon introuvable", 404);
    if (!prestRes.ok) return err("Prestation introuvable", 404);
    const sf = (await salonRes.json()).fields || {};
    const pf = (await prestRes.json()).fields || {};
    const dureeMin  = pf["Durée"] || sf["Durée par défaut prestation"] || 30;
    const slotEnd   = new Date(slotStart.getTime() + dureeMin * 60000);

    // 2. Vérifie Offre RDV active
    if (sf["User ID"]) {
      const formula = encodeURIComponent(`{User ID}="${sf["User ID"]}"`);
      const cRes = await fetch(`${BASE_URL}/Clients?filterByFormula=${formula}&maxRecords=1`, { headers });
      const cd = cRes.ok ? await cRes.json() : { records: [] };
      if (!cd.records?.[0]?.fields?.["Offre RDV active"]) return err("Salon non disponible", 403);
    }

    // 3. Re-vérifie que le créneau est libre (protection race condition)
    const rdvFormula = encodeURIComponent(
      `AND({Statut}!="Annulé",IS_AFTER({Date/Heure},"${new Date(slotStart.getTime() - 3 * 3600000).toISOString()}"),IS_BEFORE({Date/Heure},"${new Date(slotEnd.getTime() + 3 * 3600000).toISOString()}"))`
    );
    const rdvRes = await fetch(`${BASE_URL}/Rendez-vous?filterByFormula=${rdvFormula}`, { headers });
    const rdvData = rdvRes.ok ? await rdvRes.json() : { records: [] };

    const conflict = (rdvData.records || [])
      .filter(r => (r.fields.Salon || []).includes(salonId) && r.fields["Date/Heure"])
      .some(r => {
        const s = new Date(r.fields["Date/Heure"]);
        const e = new Date(s.getTime() + dureeMin * 60000);
        return slotStart < e && slotEnd > s;
      });
    if (conflict) return err("Ce créneau vient d'être réservé. Veuillez en choisir un autre.", 409);

    // 4. Génère un token unique pour la gestion autonome du RDV
    const token = require("crypto").randomUUID();

    // 5. Crée le RDV dans Airtable
    const createRes = await fetch(`${BASE_URL}/Rendez-vous`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        fields: {
          "Client final - Nom":       nomClient,
          "Client final - Téléphone": telephoneClient,
          "Email client":             emailClient,
          "Salon":          [salonId],
          "Prestation":     [prestationId],
          "Date/Heure":     slotStart.toISOString(),
          "Statut":         "Confirmé",
          "Token gestion":  token,
        },
        typecast: true,
      }),
    });
    if (!createRes.ok) {
      const t = await createRes.text();
      console.error("[create-booking] Airtable error:", t);
      return err("Impossible de créer le rendez-vous", 502);
    }
    const rdv = await createRes.json();
    console.log("[create-booking] RDV créé:", rdv.id);

    // Lien de gestion autonome
    const baseUrl   = process.env.URL || "https://portal-akilai.netlify.app";
    const gestionUrl = `${baseUrl}/gerer-rdv.html?token=${token}`;

    // 6. Google Calendar (fire-and-forget)
    if (sf["Lien Google Calendar"] && sf["User ID"]) {
      createCalendarEvent(sf, pf, slotStart, slotEnd, nomClient, telephoneClient)
        .catch(e => console.error("[create-booking] Google Calendar:", e.message));
    }

    const nomSalon    = sf["Nom salon"]  || "le salon";
    const adresseSalon = sf["Adresse"]  || "";
    const prestNom    = pf.Nom           || "votre RDV";

    const dateStr = slotStart.toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long", timeZone:"Europe/Paris" });
    const timeStr = slotStart.toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit", hour12:false, timeZone:"Europe/Paris" });

    // 7. Email de confirmation (fire-and-forget)
    const { html, text } = buildConfirmationEmail({ nomClient, prestationNom: prestNom, dateStr, timeStr, nomSalon, adresseSalon, gestionUrl });
    sendEmail({ to: emailClient, subject: `Confirmation de votre RDV chez ${nomSalon}`, html, text })
      .catch(e => console.error("[create-booking] Email:", e.message));

    // 8. SMS de confirmation avec lien de gestion (fire-and-forget)
    sendConfirmationSMS(nomClient, prestNom, slotStart, nomSalon, telephoneClient, gestionUrl)
      .catch(e => console.error("[create-booking] SMS:", e.message));

    return ok({ ok: true, rdvId: rdv.id, token });
  } catch (e) {
    console.error("[create-booking] Exception:", e.message);
    return err(e.message);
  }
};

// ── Google Calendar ──────────────────────────────────────────────────────────

async function createCalendarEvent(sf, pf, start, end, nomClient, tel) {
  const userId = sf["User ID"];

  // Récupère les tokens OAuth du client lié
  const formula = encodeURIComponent(`{User ID}="${userId}"`);
  const cRes = await fetch(`${BASE_URL}/Clients?filterByFormula=${formula}&maxRecords=1`, { headers });
  if (!cRes.ok) throw new Error("Client introuvable");
  const cd = await cRes.json();
  const client = cd.records?.[0];
  if (!client?.fields?.["Google Access Token"]) throw new Error("Google Access Token manquant");
  const cf = client.fields;

  const calId = sf["Lien Google Calendar"] || cf["Google Calendar ID"] || "primary";
  let token = cf["Google Access Token"];

  // Tentative avec le token existant
  let calRes = await postCalendarEvent(token, calId, pf, start, end, nomClient, tel);

  // Refresh si expiration 401
  if (calRes.status === 401 && cf["Google Refresh Token"]) {
    console.log("[create-booking] Token Google expiré, rafraîchissement…");
    token = await refreshGoogleToken(cf["Google Refresh Token"]);
    // Sauvegarde le nouveau token (fire-and-forget)
    fetch(`${BASE_URL}/Clients/${client.id}`, {
      method: "PATCH", headers,
      body: JSON.stringify({ fields: { "Google Access Token": token } }),
    }).catch(() => {});
    calRes = await postCalendarEvent(token, calId, pf, start, end, nomClient, tel);
  }

  if (!calRes.ok) {
    const t = await calRes.text();
    throw new Error(`Google Calendar ${calRes.status}: ${t.substring(0, 200)}`);
  }
  console.log("[create-booking] Événement Google Calendar créé");
}

async function postCalendarEvent(token, calId, pf, start, end, nomClient, tel) {
  return fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary:     `${pf.Nom || "RDV"} — ${nomClient}`,
        description: `Client : ${nomClient}\nTél. : ${tel}\nPrestation : ${pf.Nom || ""}\nDurée : ${pf["Durée"] || 30} min`,
        start: { dateTime: start.toISOString(), timeZone: "Europe/Paris" },
        end:   { dateTime: end.toISOString(),   timeZone: "Europe/Paris" },
      }),
    }
  );
}

async function refreshGoogleToken(refreshToken) {
  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET non configurés");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      refresh_token: refreshToken, grant_type: "refresh_token",
    }),
  });
  const d = await res.json();
  if (!d.access_token) throw new Error("Refresh token invalide");
  return d.access_token;
}

// ── Twilio SMS ───────────────────────────────────────────────────────────────

async function sendConfirmationSMS(nomClient, prestation, dateHeure, nomSalon, to, gestionUrl) {
  const sid  = process.env.TWILIO_ACCOUNT_SID;
  const auth = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !auth || !from) {
    console.warn("[create-booking] Twilio non configuré — SMS ignoré");
    return;
  }

  const prenom  = nomClient.split(" ")[0];
  const dateStr = dateHeure.toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris",
  });
  const timeStr = dateHeure.toLocaleTimeString("fr-FR", {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Paris",
  });
  const gestionLine = gestionUrl ? `\nAnnuler ou modifier : ${gestionUrl}` : "";
  const message = `Bonjour ${prenom}, votre RDV "${prestation}" est confirmé le ${dateStr} à ${timeStr} chez ${nomSalon}. À bientôt !${gestionLine}`;

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${auth}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ From: from, To: to, Body: message }),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${d.message}`);
  console.log("[create-booking] SMS envoyé:", d.sid);
}
