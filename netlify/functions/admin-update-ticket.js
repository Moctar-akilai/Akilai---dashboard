const { BASE_URL, headers, ok, err, preflight, corsHeaders } = require("./config");
const { verifyAdminToken, unauthorized } = require("./admin-utils");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (!verifyAdminToken(event)) return unauthorized();
  if (event.httpMethod !== "PATCH") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { id, statut, priorite } = JSON.parse(event.body || "{}");
    if (!id) return err("id requis", 400);

    const fields = {};
    if (statut) fields["Statut"] = statut;
    if (priorite) fields["Priorité"] = priorite;
    if (!Object.keys(fields).length) return ok({ ok: true, noChange: true });

    const patchRes = await fetch(`${BASE_URL}/Support/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ fields }),
    });
    const data = await patchRes.json();
    if (data.error) return err(data.error.message || "Airtable error");

    return ok({ ok: true });
  } catch (e) {
    return err(e.message);
  }
};
