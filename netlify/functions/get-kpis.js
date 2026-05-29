const { BASE_URL, headers, ok, err, preflight } = require("./config");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();

  try {
    const days      = parseInt(event.queryStringParameters?.days || "30", 10);
    const clientId  = event.queryStringParameters?.clientId || null;
    const cutoff    = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffISO = cutoff.toISOString();

    const dateFilter   = `IS_AFTER({DateHeure},"${cutoffISO}")`;
    const clientFilter = clientId ? `{ClientId}="${clientId}"` : null;
    const histFormula  = clientFilter ? `AND(${dateFilter},${clientFilter})` : dateFilter;

    const histParams = new URLSearchParams({
      filterByFormula: histFormula,
      "fields[]":      "Type",
    });
    histParams.append("fields[]", "DateHeure");
    histParams.append("fields[]", "Duree");
    histParams.append("fields[]", "Statut");

    const histRes  = await fetch(`${BASE_URL}/Historique?${histParams}`, { headers });
    const histData = histRes.ok ? await histRes.json() : { records: [] };
    const histRecs = histData.records || [];

    const payParams = new URLSearchParams();
    payParams.append("fields[]", "Montant");
    payParams.append("fields[]", "DatePaiement");

    const payRes  = await fetch(`${BASE_URL}/Paiements?${payParams}`, { headers });
    const payData = payRes.ok ? await payRes.json() : { records: [] };
    const payRecs = payData.records || [];

    const tktParams = new URLSearchParams({
      filterByFormula: `OR({Statut}="Ouvert",{Statut}="En cours")`,
      "fields[]":      "Statut",
    });

    const tktRes  = await fetch(`${BASE_URL}/Support?${tktParams}`, { headers });
    const tktData = tktRes.ok ? await tktRes.json() : { records: [] };

    const appelsRecs = histRecs.filter(r => (r.fields.Type || "").toLowerCase() !== "whatsapp");
    const waRecs     = histRecs.filter(r => (r.fields.Type || "").toLowerCase() === "whatsapp");

    const durees = appelsRecs
      .map(r => r.fields.Duree || "0:00")
      .map(d => { const [m, s] = d.split(":").map(Number); return (m || 0) * 60 + (s || 0); });
    const avgSec        = durees.length ? Math.round(durees.reduce((a, b) => a + b, 0) / durees.length) : 0;
    const duree_moyenne = `${Math.floor(avgSec / 60)}m ${String(avgSec % 60).padStart(2, "0")}s`;

    const revParMois = Array(12).fill(0);
    const now        = new Date();
    payRecs.forEach(r => {
      const d = r.fields.DatePaiement ? new Date(r.fields.DatePaiement) : null;
      if (!d) return;
      const diff = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
      if (diff >= 0 && diff < 12) revParMois[11 - diff] += Number(r.fields.Montant) || 0;
    });

    const appelsParJour = buildDailySeries(appelsRecs, days);
    const waParJour     = buildDailySeries(waRecs,     days);

    const taux_escalade = appelsRecs.length
      ? Math.round((tktData.records?.length || 0) / appelsRecs.length * 100 * 10) / 10
      : 0;

    return ok({
      kpis: {
        appels_par_jour:      appelsParJour,
        messages_wa_par_jour: waParJour,
        revenus_par_mois:     revParMois.map(v => Math.round(v)),
        objectif_mensuel:     revParMois.map(() => 7000),
        duree_moyenne,
        taux_escalade,
        satisfaction:         4.7,
        revenus_mois:         revParMois[11] || 0,
        tickets_ouverts:      tktData.records?.length || 0,
        total_appels:         appelsRecs.length,
        total_wa:             waRecs.length,
      }
    });
  } catch (e) {
    return err(e.message);
  }
};

function buildDailySeries(records, days) {
  const series = Array(days).fill(0);
  const now    = new Date();
  records.forEach(r => {
    const d = r.fields.DateHeure ? new Date(r.fields.DateHeure) : null;
    if (!d) return;
    const diffDays = Math.floor((now - d) / 86400000);
    if (diffDays >= 0 && diffDays < days) series[days - 1 - diffDays]++;
  });
  return series;
}
