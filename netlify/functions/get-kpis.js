const { BASE_URL, headers, ok, err, preflight } = require("./config");
const { requireAuth, filterByClient } = require("./auth");

/**
 * Agrège les KPIs depuis Airtable pour le client authentifié.
 * Query param : ?days=7|30|90 (défaut 30)
 */
exports.handler = async (event, context) => {
  if (event.httpMethod === "OPTIONS") return preflight();

  const auth = requireAuth(event, context);
  if (auth.error) return auth.error;
  const { clientId } = auth;

  try {
    const days      = parseInt(event.queryStringParameters?.days || "30", 10);
    const cutoff    = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffISO = cutoff.toISOString();

    /* Filtre date pour Historique */
    const dateExtra = `IS_AFTER({DateHeure},"${cutoffISO}")`;

    /* Fetch Historique (appels + WA) filtré par client + date */
    const histFilter = filterByClient(clientId, dateExtra);
    const histRes    = await fetch(
      `${BASE_URL}/Historique?${histFilter}&fields[]=Type&fields[]=DateHeure&fields[]=Duree&fields[]=Statut`,
      { headers }
    );
    const histData = histRes.ok ? await histRes.json() : { records: [] };
    const histRecs = histData.records || [];

    /* Fetch Paiements filtrés par client */
    const payFilter = filterByClient(clientId);
    const payRes    = await fetch(
      `${BASE_URL}/Paiements?${payFilter}&fields[]=Montant&fields[]=DatePaiement`,
      { headers }
    );
    const payData = payRes.ok ? await payRes.json() : { records: [] };
    const payRecs = payData.records || [];

    /* Fetch tickets ouverts filtrés par client */
    const tktFilter = filterByClient(clientId, `OR({Statut}="Ouvert",{Statut}="En cours")`);
    const tktRes    = await fetch(
      `${BASE_URL}/Support?${tktFilter}&fields[]=Statut`,
      { headers }
    );
    const tktData = tktRes.ok ? await tktRes.json() : { records: [] };

    /* Agrégation */
    const appelsRecs = histRecs.filter(r => (r.fields.Type || "").toLowerCase() !== "whatsapp");
    const waRecs     = histRecs.filter(r => (r.fields.Type || "").toLowerCase() === "whatsapp");

    const durees = appelsRecs
      .map(r => r.fields.Duree || "0:00")
      .map(d => { const [m, s] = d.split(":").map(Number); return (m || 0) * 60 + (s || 0); });
    const avgSec       = durees.length ? Math.round(durees.reduce((a, b) => a + b, 0) / durees.length) : 0;
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
