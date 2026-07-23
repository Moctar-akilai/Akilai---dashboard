const { BASE_URL, headers, ok, err, preflight } = require("./config");

/**
 * GET /.netlify/functions/get-rdv-agenda?email=xxx
 * Retourne les RDV du salon lié au client connecté.
 * Plage : -30 jours à +14 jours. Stats par statut sur toute la plage.
 */
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();

  const email = (event.queryStringParameters || {}).email;
  if (!email) return err("email requis", 400);

  try {
    // 1. Salon lié au client (User ID = email)
    const salonFormula = encodeURIComponent(`{User ID}="${email}"`);
    const salonRes = await fetch(`${BASE_URL}/Salons?filterByFormula=${salonFormula}&maxRecords=1`, { headers });
    const salonData = salonRes.ok ? await salonRes.json() : { records: [] };
    const salon = salonData.records?.[0];
    if (!salon) return ok({ salonId: null, salonNom: null, rdvs: [], stats: {} });

    const salonId  = salon.id;
    const salonNom = salon.fields["Nom salon"] || "";

    // 2. Fetch prestations + RDV en parallèle
    const now  = new Date();
    const from = new Date(now.getTime() - 30 * 86400000);
    const to   = new Date(now.getTime() + 15 * 86400000);
    const rdvFormula = encodeURIComponent(
      `AND(IS_AFTER({Date/Heure},"${from.toISOString()}"),IS_BEFORE({Date/Heure},"${to.toISOString()}"))`
    );
    const [prestRes, rdvRes] = await Promise.all([
      fetch(`${BASE_URL}/Prestations`, { headers }),
      fetch(
        `${BASE_URL}/Rendez-vous?filterByFormula=${rdvFormula}&sort[0][field]=Date%2FHeure&sort[0][direction]=asc`,
        { headers }
      ),
    ]);

    // Map prestationId → nom
    const prestMap = {};
    if (prestRes.ok) {
      const pd = await prestRes.json();
      for (const r of pd.records || []) {
        if ((r.fields.Salon || []).includes(salonId)) {
          prestMap[r.id] = r.fields.Nom || "";
        }
      }
    }

    // 3. Filtre RDV par salonId en JS (linked field)
    const rdvData = rdvRes.ok ? await rdvRes.json() : { records: [] };
    const rdvs = (rdvData.records || [])
      .filter(r => (r.fields.Salon || []).includes(salonId))
      .map(r => ({
        id:         r.id,
        nom:        r.fields["Client final - Nom"]       || "",
        telephone:  r.fields["Client final - Téléphone"] || "",
        dateHeure:  r.fields["Date/Heure"]               || null,
        statut:     r.fields.Statut                      || "Confirmé",
        prestation: prestMap[r.fields.Prestation?.[0]]   || "",
      }));

    // 4. Stats par statut sur toute la plage
    const stats = { "Confirmé": 0, "Annulé": 0, "Terminé": 0, "No-show": 0 };
    for (const r of rdvs) {
      if (r.statut in stats) stats[r.statut]++;
    }

    return ok({ salonId, salonNom, rdvs, stats });
  } catch (e) {
    console.error("[get-rdv-agenda]", e.message);
    return err(e.message);
  }
};
