const { BASE_URL, headers, ok, err, preflight } = require("./config");

const CONTACTS_TABLE = "tblmBABwZaL2HTSx6";

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") return preflight();

  try {
    const { userId, numero } = event.queryStringParameters || {};
    if (!userId) return err("userId requis", 400);
    if (!numero) return err("numero requis", 400);

    const formula = encodeURIComponent(
      `AND({User ID}="${userId}",{Numéro}="${numero}")`
    );
    const res  = await fetch(`${BASE_URL}/${CONTACTS_TABLE}?filterByFormula=${formula}&maxRecords=1`, { headers });
    const data = await res.json();
    const record = data.records?.[0];

    if (!record) {
      return ok({ found: false });
    }

    const f = record.fields;
    let preferences = {};
    try { preferences = JSON.parse(f["Preferences"] || "{}"); } catch(e) {}

    return ok({
      found:           true,
      id:              record.id,
      nom:             f["Nom"]                  || "",
      prenom:          f["Prénom"]               || "",
      email:           f["Email"]                || "",
      nbInteractions:  Number(f["Nb appels"])    || 0,
      dernierContact:  f["Derniere Interaction"] || f["Dernier appel"] || null,
      contexte:        f["Contexte"]             || "",
      preferences,
    });
  } catch (e) {
    console.error("[get-contact-context] Exception:", e.message);
    return err(e.message);
  }
};
