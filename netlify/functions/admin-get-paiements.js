const { BASE_URL, headers, ok, err, preflight, corsHeaders } = require("./config");
const { verifyAdminToken, unauthorized } = require("./admin-utils");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (!verifyAdminToken(event)) return unauthorized();

  try {
    let allRecords = [];
    let offset = null;

    do {
      const params = new URLSearchParams({ maxRecords: "100" });
      if (offset) params.set("offset", offset);

      const res = await fetch(`${BASE_URL}/Paiements?${params.toString()}`, { headers });
      const data = await res.json();

      if (data.records) {
        allRecords = allRecords.concat(data.records);
      }
      offset = data.offset || null;
    } while (offset);

    const paiements = allRecords.map((r) => {
      const f = r.fields || {};
      return {
        id: r.id,
        client: f.Client || f["User ID"] || "",
        montant: f.Montant || 0,
        plan: f.Plan || "",
        statut: f.Statut || "En attente",
        date: f.Date || r.createdTime,
        methode: f.Methode || f.Méthode || "",
        userId: f["User ID"] || "",
      };
    });

    return ok({ paiements });
  } catch (e) {
    return err(e.message);
  }
};
