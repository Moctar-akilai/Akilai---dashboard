const { BASE_URL, headers, ok, err, preflight } = require("./config");

/**
 * GET /.netlify/functions/get-rdv-by-token?token=xxx
 * Retourne le RDV correspondant au token (sans authentification).
 * Le token est stocké dans le champ "Token gestion" du RDV.
 */
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();

  const token = (event.queryStringParameters || {}).token;
  if (!token) return err("token requis", 400);

  try {
    const formula = encodeURIComponent(`{Token gestion}="${token}"`);
    const res = await fetch(`${BASE_URL}/Rendez-vous?filterByFormula=${formula}&maxRecords=1`, { headers });
    if (!res.ok) return err("Erreur Airtable", 502);
    const data = await res.json();
    const rdv = data.records?.[0];
    if (!rdv) return err("RDV introuvable ou lien invalide", 404);

    const f = rdv.fields;
    const salonId      = (f.Salon || [])[0]      || null;
    const prestationId = (f.Prestation || [])[0] || null;

    // Fetch salon + prestation en parallèle pour les noms
    const [salonRes, prestRes] = await Promise.all([
      salonId      ? fetch(`${BASE_URL}/Salons/${salonId}`,            { headers }) : Promise.resolve(null),
      prestationId ? fetch(`${BASE_URL}/Prestations/${prestationId}`,  { headers }) : Promise.resolve(null),
    ]);

    const salonNom      = salonRes?.ok      ? ((await salonRes.json()).fields?.["Nom salon"] || "") : "";
    const prestationNom = prestRes?.ok      ? ((await prestRes.json()).fields?.Nom            || "") : "";

    return ok({
      rdv: {
        id:             rdv.id,
        statut:         f.Statut         || "Confirmé",
        dateHeure:      f["Date/Heure"]  || null,
        nomClient:      f["Client final - Nom"]       || "",
        telephoneClient: f["Client final - Téléphone"] || "",
        salonId,
        salonNom,
        prestationId,
        prestationNom,
      },
    });
  } catch (e) {
    console.error("[get-rdv-by-token]", e.message);
    return err(e.message);
  }
};
