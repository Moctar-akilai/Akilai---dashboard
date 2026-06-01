const { BASE_URL, headers, ok, err, preflight, corsHeaders } = require("./config");
const { verifyAdminToken, unauthorized } = require("./admin-utils");

const TABLE_ID = "tblgoPGS5jbhWwXQl";

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (!verifyAdminToken(event)) return unauthorized();
  if (event.httpMethod !== "POST" && event.httpMethod !== "PATCH") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { id, statut, montant } = JSON.parse(event.body || "{}");
    if (!id) return err("id requis", 400);

    const fields = {};
    if (statut !== undefined) fields.Statut = statut;
    if (montant !== undefined) fields.Montant = Number(montant);

    if (!Object.keys(fields).length) return err("Aucun champ à modifier", 400);

    const res = await fetch(`${BASE_URL}/${TABLE_ID}/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ fields }),
    });
    const data = await res.json();
    if (data.error) return err(data.error.message || "Airtable error");

    return ok({ ok: true });
  } catch (e) {
    return err(e.message);
  }
};
