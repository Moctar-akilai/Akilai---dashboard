const { BASE_URL, headers, ok, err, preflight } = require("./config");

const LEADS_TABLE = "tblXJoVNtimnvGRBl";

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Méthode non autorisée", 405);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) { return err("JSON invalide", 400); }

  const fields = {};
  if (body.nom)              fields["Nom"]                   = body.nom;
  if (body.prenom)           fields["Prénom"]                = body.prenom;
  if (body.entreprise)       fields["Entreprise"]            = body.entreprise;
  if (body.email)            fields["Email"]                 = body.email;
  if (body.telephone)        fields["Téléphone"]             = body.telephone;
  if (body.source)           fields["Source"]                = body.source;
  if (body.statut)           fields["Statut"]                = body.statut;
  if (body.pays)             fields["Pays"]                  = body.pays;
  if (body.secteur)          fields["Secteur"]               = body.secteur;
  if (body.notes)            fields["Notes"]                 = body.notes;
  if (body.montantEstime)    fields["Montant estimé"]        = Number(body.montantEstime);
  if (body.lienRdv)          fields["Lien RDV Calendly"]     = body.lienRdv;
  fields["Date entrée"] = body.dateEntree || new Date().toISOString().split("T")[0];

  try {
    const res  = await fetch(`${BASE_URL}/${LEADS_TABLE}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ fields }),
    });
    const data = await res.json();
    if (data.error) return err(data.error.message, 400);
    return ok({ id: data.id, fields: data.fields });
  } catch (e) {
    console.error("[admin-create-lead] Exception:", e.message);
    return err(e.message);
  }
};
