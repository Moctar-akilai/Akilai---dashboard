const { BASE_URL, headers, ok, err, preflight, corsHeaders } = require("./config");
const { verifyAdminToken, unauthorized } = require("./admin-utils");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();

  const tokenOk = verifyAdminToken(event);
  console.log("[admin-update-client] Token reçu:", !!(event.headers && (event.headers.authorization || event.headers.Authorization)));
  console.log("[admin-update-client] Token valide:", tokenOk);
  if (!tokenOk) return unauthorized();

  if (event.httpMethod !== "POST" && event.httpMethod !== "PATCH") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { id, fields } = body;
    console.log("[admin-update-client] id reçu:", id);
    console.log("[admin-update-client] fields reçus:", JSON.stringify(fields));

    if (!id || !fields) return err("id and fields are required", 400);

    const url = `${BASE_URL}/tble0g9eMTjAfw6OO/${id}`;
    console.log("[admin-update-client] URL Airtable:", url);

    const res = await fetch(url, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ fields }),
    });

    console.log("[admin-update-client] Statut Airtable:", res.status);

    if (!res.ok) {
      const text = await res.text();
      console.error("[admin-update-client] Erreur Airtable:", text);
      return err(`Airtable ${res.status}: ${text}`, 502);
    }

    const data = await res.json();
    console.log("[admin-update-client] Réponse Airtable:", JSON.stringify(data).slice(0, 200));

    if (data.error) return err(data.error.message || "Airtable error");

    return ok({ ok: true, id: data.id });
  } catch (e) {
    console.error("[admin-update-client] Exception:", e.message);
    return err(e.message);
  }
};
