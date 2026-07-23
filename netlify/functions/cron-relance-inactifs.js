/**
 * cron-relance-inactifs.js — Relance des clients inactifs depuis 6+ semaines.
 * Schedule : 1x/semaine le lundi à 09:00 UTC.
 *
 * Cible : table "Clients finaux" avec Dernière visite > 6 semaines
 *         ET Statut relance ≠ "Relancé" ET ≠ "Perdu".
 * Action : SMS et/ou WhatsApp avec lien de réservation,
 *          puis met Statut relance = "Relancé".
 */
const { BASE_URL, headers } = require("./config");
const { sendRdvMessage }    = require("./twilio-rdv");

const BOOKING_BASE = process.env.URL
  ? `${process.env.URL}/booking.html`
  : "https://portal-akilai.netlify.app/booking.html";

exports.handler = async () => {
  console.log("[cron-relance-inactifs] START", new Date().toISOString());
  let sent = 0, skipped = 0, errors = 0;

  try {
    // 6 semaines = 42 jours
    const sixWeeksAgo = new Date(Date.now() - 42 * 86400000);
    const cutoffDate  = sixWeeksAgo.toISOString().split("T")[0]; // YYYY-MM-DD

    const formula = encodeURIComponent(
      `AND({Statut relance}!="Relancé",{Statut relance}!="Perdu",` +
      `{Dernière visite}!="",IS_BEFORE({Dernière visite},"${cutoffDate}"))`
    );

    // Pagination — Airtable limite à 100 records par page
    let allClients = [];
    let offset = null;
    do {
      const params = new URLSearchParams({ filterByFormula: decodeURIComponent(formula), maxRecords: "100" });
      if (offset) params.set("offset", offset);
      const res = await fetch(`${BASE_URL}/Clients finaux?${params}`, { headers });
      if (!res.ok) throw new Error(`Airtable Clients finaux ${res.status}: ${await res.text()}`);
      const data = await res.json();
      allClients = allClients.concat(data.records || []);
      offset = data.offset || null;
    } while (offset);

    console.log(`[cron-relance-inactifs] ${allClients.length} clients inactifs à relancer`);

    // Charge les salons une seule fois (optimisation : évite N appels répétés)
    const salonCache = {};
    async function getSalon(salonId) {
      if (!salonId) return {};
      if (!salonCache[salonId]) {
        const r = await fetch(`${BASE_URL}/Salons/${salonId}`, { headers });
        salonCache[salonId] = r.ok ? (await r.json()).fields || {} : {};
      }
      return salonCache[salonId];
    }

    for (const rec of allClients) {
      const f       = rec.fields;
      const tel     = f.Téléphone;
      const nom     = f.Nom || "";
      const prenom  = nom.split(" ")[0] || nom;
      const salonId = (f.Salon || [])[0];

      if (!tel || !salonId) { skipped++; continue; }

      const sf       = await getSalon(salonId);
      const nomSalon = sf["Nom salon"] || "votre salon";
      const canal    = sf["Canal feedback"] || "SMS";
      const lienRdv  = `${BOOKING_BASE}?salon=${salonId}`;

      const message = `Bonjour ${prenom}, ça fait un moment qu'on ne vous a pas vu(e) chez ${nomSalon} ! Réservez votre prochain RDV ici : ${lienRdv}`;

      try {
        await sendRdvMessage(tel, message, canal);
        await fetch(`${BASE_URL}/Clients finaux/${rec.id}`, {
          method: "PATCH", headers,
          body: JSON.stringify({ fields: { "Statut relance": "Relancé" } }),
        });
        sent++;
        console.log(`[cron-relance-inactifs] ✓ ${tel} — ${nomSalon}`);
      } catch (e) {
        errors++;
        console.error(`[cron-relance-inactifs] ✗ ${tel}:`, e.message);
      }
    }

    const summary = `${sent} relances envoyées, ${skipped} ignorés, ${errors} erreurs`;
    console.log("[cron-relance-inactifs] DONE —", summary);
    return { statusCode: 200, body: summary };
  } catch (e) {
    console.error("[cron-relance-inactifs] FATAL:", e.message);
    return { statusCode: 500, body: e.message };
  }
};
