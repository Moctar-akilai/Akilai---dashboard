const { BASE_URL, headers, ok, err, preflight, corsHeaders } = require("./config");
const { verifyAdminToken, unauthorized } = require("./admin-utils");

// Allowed field names (whitelist for safety)
const ALLOWED = new Set([
  "Tarifs Plans", "Infos Agence", "Templates Emails",
  "Seuil Vapi", "Admins Secondaires",
  "Delai Ticket Alerte", "Bandeau Suspension", "Horaire Support",
  "Finance",
]);

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (!verifyAdminToken(event)) return unauthorized();
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { champ, valeur, recordId } = JSON.parse(event.body || "{}");
    if (!champ) return err("champ requis", 400);
    if (!ALLOWED.has(champ)) return err(`Champ non autorisé: ${champ}`, 400);

    const fieldValue = typeof valeur === "object" ? JSON.stringify(valeur) : valeur;

    // Get or find the config record
    let rid = recordId;
    if (!rid) {
      const listRes = await fetch(`${BASE_URL}/Configurations?maxRecords=1`, { headers });
      const listData = await listRes.json();
      rid = listData.records?.[0]?.id || null;
    }

    let res;
    if (rid) {
      res = await fetch(`${BASE_URL}/Configurations/${rid}`, {
        method: "PATCH", headers,
        body: JSON.stringify({ fields: { [champ]: fieldValue } }),
      });
    } else {
      res = await fetch(`${BASE_URL}/Configurations`, {
        method: "POST", headers,
        body: JSON.stringify({ fields: { [champ]: fieldValue } }),
      });
    }

    const data = await res.json();
    if (data.error) return err(data.error.message || "Airtable error");
    return ok({ ok: true, id: data.id });
  } catch (e) {
    return err(e.message);
  }
};
