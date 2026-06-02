const { BASE_URL, headers, ok, err, preflight } = require("./config");

const PAIEMENTS_TABLE = "tblgoPGS5jbhWwXQl";

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();

  try {
    const { userId } = event.queryStringParameters || {};
    if (!userId) return err("userId requis", 400);

    const params = new URLSearchParams({
      maxRecords: "100",
      "sort[0][field]": "Date du paiement",
      "sort[0][direction]": "desc",
      filterByFormula: `AND({User ID}="${userId}",{N° Facture}!="")`,
    });

    const res = await fetch(`${BASE_URL}/${PAIEMENTS_TABLE}?${params}`, { headers });
    const data = await res.json();
    if (data.error) return err(data.error.message || "Airtable error");

    const factures = (data.records || []).map((r) => {
      const f = r.fields || {};
      return {
        id: r.id,
        numFacture: f["N° Facture"] || "",
        factureUrl: f["Facture URL"] || "",
        montant: f.Montant || 0,
        date: f["Date du paiement"] || "",
        statut: f.Statut || "",
        plan: f.Plan || "",
        periode: f.Période || "",
      };
    });

    return ok({ factures });
  } catch (e) {
    return err(e.message);
  }
};
