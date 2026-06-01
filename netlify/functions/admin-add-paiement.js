const { BASE_URL, headers, ok, err, preflight, corsHeaders } = require("./config");
const { verifyAdminToken, unauthorized } = require("./admin-utils");

const TABLE_ID = "tblgoPGS5jbhWwXQl";

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (!verifyAdminToken(event)) return unauthorized();
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { clientRecordId, userId, date, montant, plan, periode, reference, statut } = JSON.parse(event.body || "{}");
    if (!montant || !date) return err("montant et date requis", 400);

    const fields = {
      Montant: Number(montant),
      "Date du paiement": date,
      Statut: statut || "Payé",
      "User ID": userId || "",
    };
    if (clientRecordId) fields.Clients = [clientRecordId];
    if (plan) fields.Plan = plan;
    if (periode) fields.Période = periode;
    if (reference) fields["Stripe payment ID"] = reference;

    // Auto-generate Name
    const month = new Date(date).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    fields.Name = `Paiement ${month}`;

    const res = await fetch(`${BASE_URL}/${TABLE_ID}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ fields }),
    });
    const data = await res.json();
    if (data.error) return err(data.error.message || "Airtable error");

    return ok({ ok: true, id: data.id });
  } catch (e) {
    return err(e.message);
  }
};
