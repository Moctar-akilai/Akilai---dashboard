const { BASE_URL, headers, ok, err, preflight, corsHeaders } = require("./config");
const { verifyAdminToken, unauthorized } = require("./admin-utils");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (!verifyAdminToken(event)) return unauthorized();
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { id, fields } = JSON.parse(event.body || "{}");
    if (!id || !fields) return err("id and fields are required");

    const res = await fetch(`${BASE_URL}/Clients/${id}`, {
      method: "PATCH",
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
