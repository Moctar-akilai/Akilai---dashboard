const { BASE_URL, headers, ok, err, preflight } = require("./config");

/**
 * GET /.netlify/functions/get-rdv-config?email=xxx
 * Retourne la config RDV du salon du client connecté :
 *   - Infos salon (tous les champs config)
 *   - Toutes les prestations du salon (y compris non réservables)
 */
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();

  const email = (event.queryStringParameters || {}).email;
  if (!email) return err("email requis", 400);

  try {
    // Trouve le salon du client
    const formula  = encodeURIComponent(`{User ID}="${email}"`);
    const salonRes = await fetch(`${BASE_URL}/Salons?filterByFormula=${formula}&maxRecords=1`, { headers });
    const salonData = salonRes.ok ? await salonRes.json() : { records: [] };
    const salonRec  = salonData.records?.[0] || null;

    if (!salonRec) return ok({ salon: null, prestations: [] });

    const sf = salonRec.fields || {};
    const salon = {
      id:            salonRec.id,
      nom:           sf["Nom salon"]                    || "",
      adresse:       sf["Adresse"]                      || "",
      horaires:      sf["Horaires ouverture"]           || "{}",
      whatsapp:      sf["Numéro WhatsApp"]              || "",
      lienAvis:      sf["Lien avis Google"]             || "",
      canal:         sf["Canal feedback"]               || "SMS",
      dureeDefaut:   sf["Durée par défaut prestation"]  || 30,
    };

    // Toutes les prestations du salon (CRUD → pas de filtre réservable ici)
    const prestRes = await fetch(`${BASE_URL}/Prestations`, { headers });
    const prestData = prestRes.ok ? await prestRes.json() : { records: [] };
    const prestations = (prestData.records || [])
      .filter(r => (r.fields.Salon || []).includes(salonRec.id))
      .map(r => ({
        id:               r.id,
        nom:              r.fields.Nom                     || "",
        description:      r.fields.Description             || "",
        duree:            r.fields["Durée"]                || salon.dureeDefaut,
        prix:             r.fields.Prix                    ?? null,
        categorie:        r.fields["Catégorie"]            || "",
        reservableEnLigne: r.fields["Réservable en ligne"] || false,
      }));

    return ok({ salon, prestations });
  } catch (e) {
    console.error("[get-rdv-config]", e.message);
    return err(e.message);
  }
};
