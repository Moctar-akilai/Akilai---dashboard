const { BASE_URL, headers, ok, err, preflight } = require("./config");

const LEADS_TABLE = "tblXJoVNtimnvGRBl";

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Méthode non autorisée", 405);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) { return err("JSON invalide", 400); }

  const { id, ...rest } = body;
  if (!id) return err("id requis", 400);

  const fields = {};
  if (rest.nom            !== undefined) fields["Nom"]                   = rest.nom;
  if (rest.prenom         !== undefined) fields["Prénom"]                = rest.prenom;
  if (rest.entreprise     !== undefined) fields["Entreprise"]            = rest.entreprise;
  if (rest.email          !== undefined) fields["Email"]                 = rest.email;
  if (rest.telephone      !== undefined) fields["Téléphone"]             = rest.telephone;
  if (rest.source         !== undefined) fields["Source"]                = rest.source;
  if (rest.statut         !== undefined) fields["Statut"]                = rest.statut;
  if (rest.pays           !== undefined) fields["Pays"]                  = rest.pays;
  if (rest.secteur        !== undefined) fields["Secteur"]               = rest.secteur;
  if (rest.notes          !== undefined) fields["Notes"]                 = rest.notes;
  if (rest.raisonPerte    !== undefined) fields["Raison perte"]          = rest.raisonPerte;
  if (rest.montantEstime  !== undefined) fields["Montant estimé"]        = Number(rest.montantEstime) || 0;
  if (rest.lienRdv        !== undefined) fields["Lien RDV Calendly"]     = rest.lienRdv;
  if (rest.dateDerniereAction !== undefined) fields["Date dernière action"] = rest.dateDerniereAction;
  if (rest.converti       !== undefined) fields["Converti"]              = !!rest.converti;

  // Auto-update date dernière action
  fields["Date dernière action"] = new Date().toISOString().split("T")[0];

  try {
    const res  = await fetch(`${BASE_URL}/${LEADS_TABLE}/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ fields, typecast: true }),
    });
    const data = await res.json();
    if (data.error) return err(data.error.message, 400);
    return ok({ id: data.id, fields: data.fields });
  } catch (e) {
    console.error("[admin-update-lead] Exception:", e.message);
    return err(e.message);
  }
};
