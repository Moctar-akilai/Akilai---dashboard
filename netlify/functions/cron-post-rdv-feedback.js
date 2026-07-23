/**
 * cron-post-rdv-feedback.js — Message de feedback post-RDV avec lien avis Google.
 * Schedule : toutes les 2h → "0 */2 * * *"
 *
 * Cible : RDV avec Statut="Terminé", Feedback envoyé=false,
 *         Date/Heure passée depuis 1 à 3h (fenêtre glissante).
 * Action : SMS et/ou WhatsApp avec lien avis Google du salon,
 *          puis coche Feedback envoyé=true.
 *
 * Anti-sursollicitation : si le client figure dans "Clients finaux"
 * avec Statut relance="Relancé" ET Dernière visite ancienne (> 6 sem.),
 * on saute le feedback — cela indique qu'une relance a été envoyée
 * très récemment au même client.
 */
const { BASE_URL, headers } = require("./config");
const { sendRdvMessage }    = require("./twilio-rdv");

const SIX_WEEKS_MS = 42 * 86400000;

exports.handler = async () => {
  console.log("[cron-post-rdv-feedback] START", new Date().toISOString());
  let sent = 0, skipped = 0, errors = 0;

  try {
    const now          = new Date();
    // Fenêtre : RDV dont la Date/Heure est entre (now - 3h) et (now - 1h)
    // Couvre les prestations de 30 min à ~2h : le message part 1-2.5h après la fin
    const windowStart  = new Date(now.getTime() - 3 * 3600000);
    const windowEnd    = new Date(now.getTime() - 1 * 3600000);

    const formula = encodeURIComponent(
      `AND({Statut}="Terminé",{Feedback envoyé}=FALSE(),` +
      `IS_AFTER({Date/Heure},"${windowStart.toISOString()}"),` +
      `IS_BEFORE({Date/Heure},"${windowEnd.toISOString()}"))`
    );
    const rdvRes = await fetch(`${BASE_URL}/Rendez-vous?filterByFormula=${formula}`, { headers });
    if (!rdvRes.ok) throw new Error(`Airtable RDV ${rdvRes.status}: ${await rdvRes.text()}`);
    const rdvs = (await rdvRes.json()).records || [];
    console.log(`[cron-post-rdv-feedback] ${rdvs.length} RDV Terminés éligibles`);

    // Cache salons
    const salonCache = {};
    async function getSalon(salonId) {
      if (!salonCache[salonId]) {
        const r = await fetch(`${BASE_URL}/Salons/${salonId}`, { headers });
        salonCache[salonId] = r.ok ? (await r.json()).fields || {} : {};
      }
      return salonCache[salonId];
    }

    for (const rdv of rdvs) {
      const f       = rdv.fields;
      const tel     = f["Client final - Téléphone"];
      const nom     = f["Client final - Nom"] || "";
      const prenom  = nom.split(" ")[0] || nom;
      const salonId = (f.Salon || [])[0];

      if (!tel || !salonId) { skipped++; continue; }

      const sf       = await getSalon(salonId);
      const nomSalon = sf["Nom salon"] || "votre salon";
      const canal    = sf["Canal feedback"] || "SMS";
      const lienAvis = sf["Lien avis Google"] || "";

      // ── Anti-sursollicitation ─────────────────────────────────────
      // Si ce client a été relancé très récemment (statut "Relancé" +
      // Dernière visite ancienne dans Clients finaux), on n'envoie pas.
      try {
        const cfFormula = encodeURIComponent(
          `AND({Téléphone}="${tel}",{Statut relance}="Relancé")`
        );
        const cfRes = await fetch(
          `${BASE_URL}/Clients finaux?filterByFormula=${cfFormula}&maxRecords=1`,
          { headers }
        );
        if (cfRes.ok) {
          const cfData = await cfRes.json();
          const cfRec  = cfData.records?.[0];
          if (cfRec) {
            const derniereVisite = cfRec.fields["Dernière visite"];
            const visiteDate     = derniereVisite ? new Date(derniereVisite) : null;
            // Dernière visite > 6 semaines = la relance est probablement récente
            if (!visiteDate || (now.getTime() - visiteDate.getTime()) > SIX_WEEKS_MS) {
              console.log(`[cron-post-rdv-feedback] Skip ${tel} — relance récente détectée`);
              skipped++;
              continue;
            }
          }
        }
      } catch (e) {
        console.warn("[cron-post-rdv-feedback] Vérif anti-sursollicitation échouée:", e.message);
        // En cas d'erreur sur la vérification, on continue quand même
      }
      // ─────────────────────────────────────────────────────────────

      const messageParts = [
        `Bonjour ${prenom}, comment s'est passé votre RDV chez ${nomSalon} aujourd'hui ?`,
        `Si vous avez apprécié, un avis Google nous aiderait beaucoup 🙏`,
      ];
      if (lienAvis) messageParts.push(lienAvis);
      const message = messageParts.join(" ");

      try {
        await sendRdvMessage(tel, message, canal);
        await fetch(`${BASE_URL}/Rendez-vous/${rdv.id}`, {
          method: "PATCH", headers,
          body: JSON.stringify({ fields: { "Feedback envoyé": true } }),
        });
        sent++;
        console.log(`[cron-post-rdv-feedback] ✓ ${tel} — ${nomSalon}`);
      } catch (e) {
        errors++;
        console.error(`[cron-post-rdv-feedback] ✗ ${tel}:`, e.message);
      }
    }

    const summary = `${sent} feedbacks envoyés, ${skipped} ignorés, ${errors} erreurs`;
    console.log("[cron-post-rdv-feedback] DONE —", summary);
    return { statusCode: 200, body: summary };
  } catch (e) {
    console.error("[cron-post-rdv-feedback] FATAL:", e.message);
    return { statusCode: 500, body: e.message };
  }
};
