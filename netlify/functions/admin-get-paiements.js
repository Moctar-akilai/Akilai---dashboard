const { BASE_URL, headers, ok, err, preflight, corsHeaders } = require("./config");
const { verifyAdminToken, unauthorized } = require("./admin-utils");

const TABLE_ID = "tblgoPGS5jbhWwXQl";

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (!verifyAdminToken(event)) return unauthorized();

  try {
    const { userId } = event.queryStringParameters || {};
    let allRecords = [];
    let offset = null;

    do {
      const params = new URLSearchParams({
        maxRecords: "200",
        "sort[0][field]": "Date du paiement",
        "sort[0][direction]": "desc",
      });
      if (userId) params.set("filterByFormula", `{User ID}="${userId}"`);
      if (offset) params.set("offset", offset);

      const res = await fetch(`${BASE_URL}/${TABLE_ID}?${params.toString()}`, { headers });
      const data = await res.json();
      if (data.error) return err(data.error.message || "Airtable error");
      if (data.records) allRecords = allRecords.concat(data.records);
      offset = data.offset || null;
    } while (offset);

    const paiements = allRecords.map((r) => {
      const f = r.fields || {};
      return {
        id: r.id,
        name: f.Name || "",
        clientRecordId: (f.Clients || [])[0] || null,
        clientNom: (f["Nom (from Clients)"] || [])[0] || "",
        montant: f.Montant || 0,
        date: f["Date du paiement"] || "",
        statut: f.Statut || "En attente",
        plan: f.Plan || "",
        periode: f.Période || "",
        reference: f["Stripe payment ID"] || "",
        userId: f["User ID"] || "",
        email: (f.Email || [])[0] || "",
        createdAt: r.createdTime,
      };
    });

    return ok({ paiements });
  } catch (e) {
    return err(e.message);
  }
};
