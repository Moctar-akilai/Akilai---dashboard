const { BASE_URL, headers, ok, err, preflight } = require("./config");

/**
 * GET /.netlify/functions/get-salon-info?salonId=recXXX
 * Retourne les infos du salon + ses prestations.
 * Vérifie que l'offre RDV est active (champ "Offre RDV active" sur Clients).
 */
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();

  const salonId = (event.queryStringParameters || {}).salonId;
  if (!salonId) return err("salonId requis", 400);

  try {
    // 1. Fetch salon
    const salonRes = await fetch(`${BASE_URL}/Salons/${salonId}`, { headers });
    if (salonRes.status === 404) return err("Salon introuvable", 404);
    if (!salonRes.ok) return err("Erreur Airtable", 502);
    const sf = (await salonRes.json()).fields || {};

    // 2. Vérifie Offre RDV active via le client lié (User ID)
    if (!sf["User ID"]) return err("Salon mal configuré", 500);
    const formula = encodeURIComponent(`{User ID}="${sf["User ID"]}"`);
    const cRes = await fetch(`${BASE_URL}/Clients?filterByFormula=${formula}&maxRecords=1`, { headers });
    const cd = cRes.ok ? await cRes.json() : { records: [] };
    if (!cd.records?.[0]?.fields?.["Offre RDV active"]) {
      return err("Ce salon n'a pas activé la réservation en ligne.", 403);
    }

    // 3. Fetch prestations et filtre sur ce salon (linked field → filtre JS)
    const prestRes = await fetch(`${BASE_URL}/Prestations`, { headers });
    const pd = prestRes.ok ? await prestRes.json() : { records: [] };
    const prestations = (pd.records || [])
      .filter(r => (r.fields.Salon || []).includes(salonId) && r.fields["Réservable en ligne"])
      .map(r => ({
        id:          r.id,
        nom:         r.fields.Nom           || "",
        description: r.fields.Description   || "",
        duree:       r.fields["Durée"]      || sf["Durée par défaut prestation"] || 30,
        prix:        r.fields.Prix          ?? null,
        categorie:   r.fields["Catégorie"]  || "",
      }));

    return ok({
      salon: {
        id:          salonId,
        nom:         sf["Nom salon"]                   || "",
        adresse:     sf["Adresse"]                     || "",
        dureeDefaut: sf["Durée par défaut prestation"] || 30,
      },
      prestations,
    });
  } catch (e) {
    console.error("[get-salon-info]", e.message);
    return err(e.message);
  }
};
