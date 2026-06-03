const { BASE_URL, headers, ok, err, preflight } = require("./config");

const CONTACTS_TABLE = "tblmBABwZaL2HTSx6";

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") return preflight();

  try {
    const userId = (event.queryStringParameters && event.queryStringParameters.userId) || null;
    if (!userId) return err("userId requis", 400);

    const formula = encodeURIComponent(`{User ID}="${userId}"`);
    const url = `${BASE_URL}/${CONTACTS_TABLE}?filterByFormula=${formula}&sort[0][field]=Dernier%20appel&sort[0][direction]=desc`;

    const res  = await fetch(url, { headers });
    if (!res.ok) {
      const t = await res.text();
      console.error("[get-contacts] Airtable error:", res.status, t);
      return err(`Airtable ${res.status}`, 502);
    }

    const data    = await res.json();
    const records = data.records || [];

    const contacts = records.map(r => {
      const f = r.fields;
      return {
        id:           r.id,
        nom:          f.Nom          || "",
        prenom:       f["Prénom"]    || "",
        numero:       f["Numéro"]    || "",
        email:        f.Email        || "",
        statut:       f.Statut       || "Prospect",
        nbAppels:     f["Nb appels"] || 0,
        dernierAppel: f["Dernier appel"] || null,
        notes:        f.Notes        || "",
        source:       f.Source       || "Manuel",
        dateCreation: f["Date création"] || null,
      };
    });

    return ok({ contacts });
  } catch (e) {
    console.error("[get-contacts] Exception:", e.message);
    return err(e.message);
  }
};
