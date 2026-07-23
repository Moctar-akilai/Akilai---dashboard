const { BASE_URL, headers, ok, err, preflight, corsHeaders } = require("./config");
const { verifyAdminToken, unauthorized } = require("./admin-utils");

const TABLE_ID = "tblgoPGS5jbhWwXQl";

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (!verifyAdminToken(event)) return unauthorized();

  try {
    const { userId, clientRecordId } = event.queryStringParameters || {};
    console.log("[get-paiements] userId reçu:", userId);
    console.log("[get-paiements] clientRecordId reçu:", clientRecordId);

    let allRecords = [];
    let offset = null;

    // Build filter: OR by User ID (email) and/or Clients linked record
    let filterByFormula = null;
    if (userId && clientRecordId) {
      filterByFormula = `OR({User ID}="${userId}",FIND("${clientRecordId}",ARRAYJOIN({Clients})))`;
    } else if (userId) {
      filterByFormula = `{User ID}="${userId}"`;
    } else if (clientRecordId) {
      filterByFormula = `FIND("${clientRecordId}",ARRAYJOIN({Clients}))`;
    }
    console.log("[get-paiements] filterByFormula:", filterByFormula);

    do {
      const params = new URLSearchParams({
        maxRecords: "200",
        "sort[0][field]": "Date du paiement",
        "sort[0][direction]": "desc",
      });
      if (filterByFormula) params.set("filterByFormula", filterByFormula);
      if (offset) params.set("offset", offset);

      const res = await fetch(`${BASE_URL}/${TABLE_ID}?${params.toString()}`, { headers });
      console.log("[get-paiements] Statut Airtable:", res.status);
      const data = await res.json();
      if (data.error) {
        console.error("[get-paiements] Erreur Airtable:", data.error.message);
        return err(data.error.message || "Airtable error");
      }
      if (data.records) allRecords = allRecords.concat(data.records);
      offset = data.offset || null;
    } while (offset);

    console.log("[get-paiements] Nb paiements:", allRecords.length);
    if (allRecords[0]) {
      console.log("[get-paiements] Field keys:", JSON.stringify(Object.keys(allRecords[0].fields)));
      console.log("[get-paiements] Premier record:", JSON.stringify(allRecords[0].fields).substring(0, 300));
    }

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
        numFacture: f["N° Facture"] || f["N° Facture"] || f["No Facture"] || "",
        factureUrl: f["Facture URL"] || "",
        typePaiement: f["Type paiement"] || "",
        createdAt: r.createdTime,
      };
    });

    return ok({ paiements });
  } catch (e) {
    console.error("[get-paiements] Exception:", e.message);
    return err(e.message);
  }
};
