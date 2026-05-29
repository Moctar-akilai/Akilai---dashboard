const { BASE_URL, headers, ok, err, preflight } = require("./config");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Méthode non autorisée", 405);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return err("JSON invalide", 400); }

  const email = (body.email || "").trim().toLowerCase();
  if (!email) return err("Email requis", 400);

  try {
    const formula = encodeURIComponent(`LOWER({Email})="${email}"`);
    const res  = await fetch(`${BASE_URL}/Clients?filterByFormula=${formula}&maxRecords=1`, { headers });

    if (!res.ok) {
      const text = await res.text();
      console.error("[auth-login] Airtable error:", res.status, text);
      return err(`Airtable ${res.status}`, 502);
    }

    const data    = await res.json();
    const record  = data.records?.[0];

    if (!record) {
      return ok({ ok: false, message: "Email non reconnu. Contactez AkilAI." });
    }

    const f = record.fields;
    return ok({
      ok:       true,
      clientId: record.id,
      nom:      f.Entreprise || f.Nom || "Client",
      plan:     f.Plan       || "",
    });
  } catch (e) {
    console.error("[auth-login] Exception:", e.message, e.stack);
    return err(e.message);
  }
};
