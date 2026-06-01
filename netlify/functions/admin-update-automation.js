const { BASE_URL, headers, ok, err, preflight, corsHeaders } = require("./config");
const { verifyAdminToken, unauthorized } = require("./admin-utils");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (!verifyAdminToken(event)) return unauthorized();
  if (event.httpMethod !== "POST" && event.httpMethod !== "PATCH") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { id, statut } = JSON.parse(event.body || "{}");
    console.log("[admin-update-automation] id:", id, "statut:", statut);
    if (!id || !statut) return err("id et statut requis", 400);

    const res = await fetch(`${BASE_URL}/tble4KroqvA1JodJs/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ fields: { Statut: statut } }),
    });
    console.log("[admin-update-automation] Statut Airtable:", res.status);

    if (!res.ok) {
      const text = await res.text();
      console.error("[admin-update-automation] Erreur:", text);
      return err(`Airtable ${res.status}: ${text}`, 502);
    }
    const data = await res.json();
    if (data.error) return err(data.error.message || "Airtable error");

    return ok({ ok: true, statut: data.fields?.Statut || statut });
  } catch (e) {
    console.error("[admin-update-automation] Exception:", e.message);
    return err(e.message);
  }
};
