const { sendEmail }           = require("./email-template");
const { BASE_URL, headers, ok, err } = require("./config");

/**
 * Rapport hebdomadaire — Netlify Scheduled Function.
 * Cron : "0 8 * * 1" (lundi 8h UTC)
 *
 * Agrège depuis Airtable :
 *   - Appels de la semaine (Historique, Type=Voix, DateHeure > J-7)
 *   - Messages WA (Type=WhatsApp)
 *   - Tickets traités (Support, Statut=Résolu|Fermé, DateCreation > J-7)
 *   - Revenus (Paiements, DatePaiement > J-7)
 * Compare avec la semaine précédente (J-14 → J-7).
 */
exports.handler = async (event) => {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return err("ADMIN_EMAIL non configuré", 500);

  try {
    const now      = new Date();
    const cutoff7  = new Date(now); cutoff7.setDate(now.getDate() - 7);
    const cutoff14 = new Date(now); cutoff14.setDate(now.getDate() - 14);

    const iso7  = cutoff7.toISOString();
    const iso14 = cutoff14.toISOString();

    /* ---- Fetch Historique ---- */
    const histThis = await fetchFiltered("Historique",
      `IS_AFTER({DateHeure}, "${iso7}")`,
      ["Type", "DateHeure", "Duree"]);
    const histPrev = await fetchFiltered("Historique",
      `AND(IS_AFTER({DateHeure}, "${iso14}"), IS_BEFORE({DateHeure}, "${iso7}"))`,
      ["Type", "DateHeure", "Duree"]);

    const appelsThis = histThis.filter(r => (r.fields.Type||"").toLowerCase() !== "whatsapp").length;
    const appelsPrev = histPrev.filter(r => (r.fields.Type||"").toLowerCase() !== "whatsapp").length;
    const waThis     = histThis.filter(r => (r.fields.Type||"").toLowerCase() === "whatsapp").length;
    const waPrev     = histPrev.filter(r => (r.fields.Type||"").toLowerCase() === "whatsapp").length;

    /* ---- Fetch Tickets traités ---- */
    const tktThis = await fetchFiltered("Support",
      `AND(IS_AFTER({DateCreation}, "${iso7}"), OR({Statut}="Résolu",{Statut}="Fermé"))`,
      ["Statut"]);
    const tktPrev = await fetchFiltered("Support",
      `AND(IS_AFTER({DateCreation}, "${iso14}"), IS_BEFORE({DateCreation}, "${iso7}"), OR({Statut}="Résolu",{Statut}="Fermé"))`,
      ["Statut"]);

    /* ---- Fetch Revenus ---- */
    const payThis = await fetchFiltered("Paiements",
      `IS_AFTER({DatePaiement}, "${iso7}")`, ["Montant"]);
    const payPrev = await fetchFiltered("Paiements",
      `AND(IS_AFTER({DatePaiement}, "${iso14}"), IS_BEFORE({DatePaiement}, "${iso7}"))`, ["Montant"]);

    const revThis = payThis.reduce((s, r) => s + (Number(r.fields.Montant) || 0), 0);
    const revPrev = payPrev.reduce((s, r) => s + (Number(r.fields.Montant) || 0), 0);

    /* ---- Formatage ---- */
    const diff = (cur, prev) => {
      if (!prev) return "";
      const p = Math.round((cur - prev) / prev * 100);
      return p >= 0 ? `<span style="color:#22c55e">+${p}%</span>` : `<span style="color:#ef4444">${p}%</span>`;
    };

    const semaine = `${cutoff7.toLocaleDateString("fr-FR")} → ${now.toLocaleDateString("fr-FR")}`;

    const tableau = `
<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:16px">
  <thead>
    <tr style="border-bottom:1px solid #333">
      <th style="text-align:left;padding:8px 0;color:#888;font-weight:600">Métrique</th>
      <th style="text-align:right;padding:8px 0;color:#888;font-weight:600">Cette semaine</th>
      <th style="text-align:right;padding:8px 0;color:#888;font-weight:600">Sem. précédente</th>
      <th style="text-align:right;padding:8px 0;color:#888;font-weight:600">Évolution</th>
    </tr>
  </thead>
  <tbody>
    ${row("Appels vocaux",     appelsThis, appelsPrev, diff(appelsThis, appelsPrev))}
    ${row("Messages WhatsApp", waThis,     waPrev,     diff(waThis,     waPrev))}
    ${row("Tickets traités",   tktThis.length, tktPrev.length, diff(tktThis.length, tktPrev.length))}
    ${row("Revenus (€)",       revThis.toLocaleString("fr-FR"), revPrev.toLocaleString("fr-FR"), diff(revThis, revPrev))}
  </tbody>
</table>`;

    const dashUrl = process.env.URL || "https://votre-dashboard.netlify.app";

    await sendEmail({
      to:    adminEmail,
      sujet: `📊 Rapport hebdomadaire AkilAI — ${semaine}`,
      titre: `Rapport de la semaine`,
      corps: [
        `<strong>Période :</strong> ${semaine}`,
        tableau,
      ],
      cta_label: "Voir le dashboard →",
      cta_url:   dashUrl,
    });

    return ok({ ok: true, semaine });
  } catch (e) {
    console.error("[notify-weekly-report]", e.message);
    return err(e.message);
  }
};

async function fetchFiltered(table, formula, fields) {
  const params = new URLSearchParams({
    filterByFormula: formula,
    ...Object.fromEntries(fields.map((f, i) => [`fields[${i}]`, f])),
  });
  const res  = await fetch(`${BASE_URL}/${table}?${params}`, { headers });
  const data = res.ok ? await res.json() : { records: [] };
  return data.records || [];
}

function row(label, cur, prev, evol) {
  return `<tr style="border-bottom:1px solid #222">
    <td style="padding:8px 0;color:#ccc">${label}</td>
    <td style="text-align:right;padding:8px 0;color:#fff;font-weight:600">${cur}</td>
    <td style="text-align:right;padding:8px 0;color:#666">${prev}</td>
    <td style="text-align:right;padding:8px 0">${evol}</td>
  </tr>`;
}
