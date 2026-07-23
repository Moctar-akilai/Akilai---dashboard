/**
 * cron-reminder-rdv.js — Rappels J-1 pour les RDV du lendemain.
 * Schedule : 1x/jour à 08:00 UTC (10h Paris été, 9h hiver).
 *
 * Cible : Rendez-vous avec Statut="Confirmé", Rappel envoyé=false,
 *         Date/Heure dans la journée de demain (heure Paris).
 * Action : SMS et/ou WhatsApp selon "Canal feedback" du salon,
 *          puis coche Rappel envoyé=true.
 */
const { BASE_URL, headers }              = require("./config");
const { sendRdvMessage }                 = require("./twilio-rdv");
const { sendEmail, buildRappelEmail }    = require("./resend-email");

const PARIS_TZ = "Europe/Paris";

function parisDateString(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PARIS_TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

function parisToUTC(dateStr, timeStr) {
  const probe      = new Date(`${dateStr}T${timeStr}:00.000Z`);
  const fp         = new Intl.DateTimeFormat("en-CA", {
    timeZone: PARIS_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(probe);
  const g          = t => fp.find(p => p.type === t)?.value ?? "00";
  const h          = g("hour") === "24" ? "00" : g("hour");
  const parisAsUTC = new Date(`${g("year")}-${g("month")}-${g("day")}T${h}:${g("minute")}:${g("second")}.000Z`);
  return new Date(probe.getTime() - (parisAsUTC.getTime() - probe.getTime()));
}

function formatHeure(date) {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: PARIS_TZ, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date);
}

exports.handler = async () => {
  console.log("[cron-reminder-rdv] START", new Date().toISOString());
  let sent = 0, skipped = 0, errors = 0;

  try {
    // Fenêtre = journée de demain en heure Paris
    const now           = new Date();
    const tomorrowStr   = parisDateString(new Date(now.getTime() + 86400000));
    const windowStart   = parisToUTC(tomorrowStr, "00:00");
    const windowEnd     = parisToUTC(tomorrowStr, "23:59");

    const formula = encodeURIComponent(
      `AND({Statut}="Confirmé",{Rappel envoyé}=FALSE(),` +
      `IS_AFTER({Date/Heure},"${windowStart.toISOString()}"),` +
      `IS_BEFORE({Date/Heure},"${windowEnd.toISOString()}"))`
    );
    const rdvRes = await fetch(`${BASE_URL}/Rendez-vous?filterByFormula=${formula}`, { headers });
    if (!rdvRes.ok) throw new Error(`Airtable RDV ${rdvRes.status}: ${await rdvRes.text()}`);
    const rdvs = (await rdvRes.json()).records || [];
    console.log(`[cron-reminder-rdv] ${rdvs.length} RDV à rappeler (${tomorrowStr})`);

    for (const rdv of rdvs) {
      const f       = rdv.fields;
      const tel     = f["Client final - Téléphone"];
      const nom     = f["Client final - Nom"] || "";
      const prenom  = nom.split(" ")[0] || nom;
      const salonId = (f.Salon || [])[0];
      const prestId = (f.Prestation || [])[0];

      if (!tel || !salonId) { skipped++; continue; }

      // Fetch salon + prestation en parallèle
      const [salonRes, prestRes] = await Promise.all([
        fetch(`${BASE_URL}/Salons/${salonId}`, { headers }),
        prestId ? fetch(`${BASE_URL}/Prestations/${prestId}`, { headers }) : Promise.resolve(null),
      ]);
      const sf = salonRes.ok ? (await salonRes.json()).fields || {} : {};
      const pf = (prestRes?.ok) ? (await prestRes.json()).fields || {} : {};

      const heure        = f["Date/Heure"] ? formatHeure(new Date(f["Date/Heure"])) : "?";
      const prestationNom = pf.Nom || "";
      const prestation    = prestationNom ? ` "${prestationNom}"` : "";
      const nomSalon      = sf["Nom salon"]  || "votre salon";
      const adresseSalon  = sf["Adresse"]    || "";
      const canal         = sf["Canal feedback"] || "SMS";
      const email         = f["Email client"] || "";
      const token         = f["Token gestion"] || "";
      const baseUrl       = process.env.URL || "https://portal-akilai.netlify.app";
      const gestionUrl    = token ? `${baseUrl}/gerer-rdv.html?token=${token}` : "";

      const smsMessage = `Bonjour ${prenom}, rappel de votre RDV${prestation} demain à ${heure} chez ${nomSalon}. À bientôt !${gestionUrl ? "\nModifier/annuler : " + gestionUrl : ""}`;

      try {
        await sendRdvMessage(tel, smsMessage, canal);

        if (email) {
          const { html, text } = buildRappelEmail({ nomClient: nom, prestationNom, timeStr: heure, nomSalon, adresseSalon, gestionUrl });
          sendEmail({ to: email, subject: `Rappel — votre RDV demain à ${heure} chez ${nomSalon}`, html, text })
            .catch(e => console.warn(`[cron-reminder-rdv] Email ${email}:`, e.message));
        }

        await fetch(`${BASE_URL}/Rendez-vous/${rdv.id}`, {
          method: "PATCH", headers,
          body: JSON.stringify({ fields: { "Rappel envoyé": true } }),
        });
        sent++;
        console.log(`[cron-reminder-rdv] ✓ ${tel} — ${nomSalon}`);
      } catch (e) {
        errors++;
        console.error(`[cron-reminder-rdv] ✗ ${tel}:`, e.message);
      }
    }

    const summary = `${sent} rappels envoyés, ${skipped} ignorés, ${errors} erreurs`;
    console.log("[cron-reminder-rdv] DONE —", summary);
    return { statusCode: 200, body: summary };
  } catch (e) {
    console.error("[cron-reminder-rdv] FATAL:", e.message);
    return { statusCode: 500, body: e.message };
  }
};
