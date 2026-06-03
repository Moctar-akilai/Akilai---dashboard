const { BASE_URL, headers, ok, err, preflight } = require("./config");

const CONTACTS_TABLE = "tblmBABwZaL2HTSx6";

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Method Not Allowed", 405);

  try {
    const { userId, nom, prenom, numero, email, statut, source, notes } = JSON.parse(event.body || "{}");
    if (!userId) return err("userId requis", 400);

    const today = new Date().toISOString().split("T")[0];

    // Check if contact already exists by numéro + userId
    if (numero) {
      const formula = encodeURIComponent(`AND({User ID}="${userId}",{Numéro}="${numero}")`);
      const checkRes  = await fetch(`${BASE_URL}/${CONTACTS_TABLE}?filterByFormula=${formula}&maxRecords=1`, { headers });
      const checkData = await checkRes.json();

      if (checkData.records && checkData.records.length > 0) {
        // Contact exists → PATCH: incrément Nb appels + Dernier appel
        const existing = checkData.records[0];
        const currentCount = Number(existing.fields["Nb appels"] || 0);

        const patchRes = await fetch(`${BASE_URL}/${CONTACTS_TABLE}/${existing.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            fields: {
              "Nb appels":     currentCount + 1,
              "Dernier appel": today,
              ...(notes ? { Notes: notes } : {}),
            },
          }),
        });
        const patchData = await patchRes.json();
        return ok({ success: true, action: "updated", id: existing.id, record: patchData });
      }
    }

    // Create new contact
    const fields = {
      "Nom":            nom     || "",
      "Prénom":         prenom  || "",
      "Numéro":         numero  || "",
      "Email":          email   || "",
      "Statut":         statut  || "Prospect",
      "User ID":        userId,
      "Nb appels":      1,
      "Dernier appel":  today,
      "Source":         source  || "Manuel",
      "Date création":  new Date().toISOString(),
    };
    if (notes) fields.Notes = notes;

    const createRes  = await fetch(`${BASE_URL}/${CONTACTS_TABLE}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ fields }),
    });
    const createData = await createRes.json();

    if (!createRes.ok) {
      console.error("[create-contact] Airtable error:", JSON.stringify(createData));
      return err(`Airtable ${createRes.status}`, 502);
    }

    return ok({ success: true, action: "created", id: createData.id, record: createData });
  } catch (e) {
    console.error("[create-contact] Exception:", e.message);
    return err(e.message);
  }
};
