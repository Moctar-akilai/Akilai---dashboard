const { BASE_URL, headers, ok, err, preflight } = require("./config");

exports.handler = async function(event, context) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Méthode non autorisée", 405);

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (parseErr) {
    return err("JSON invalide", 400);
  }

  const email = (body.email || "").trim().toLowerCase();
  console.log("[auth-login] Email reçu :", JSON.stringify(email));
  if (!email) return err("Email requis", 400);

  try {
    const formula = `LOWER({Email})="${email}"`;
    console.log("[auth-login] Formule de filtre :", formula);

    const res = await fetch(
      `${BASE_URL}/Clients?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1`,
      { headers }
    );

    console.log("[auth-login] Statut réponse Airtable :", res.status);

    if (!res.ok) {
      const text = await res.text();
      console.error("[auth-login] Erreur Airtable :", res.status, text);
      return err("Airtable " + res.status, 502);
    }

    const data = await res.json();
    console.log("[auth-login] Nombre de records retournés :", data.records ? data.records.length : 0);

    const record = data.records && data.records[0];

    if (!record) {
      console.log("[auth-login] Aucun record trouvé pour cet email.");
      return ok({ ok: false, message: "Email non reconnu. Contactez AkilAI." });
    }

    console.log("[auth-login] Record trouvé — ID :", record.id);
    console.log("[auth-login] Champs du record :", JSON.stringify(record.fields));

    const f = record.fields;
    return ok({
      ok:       true,
      clientId: record.id,
      nom:      f.Entreprise || f.Nom || "Client",
      plan:     f.Plan       || "",
    });
  } catch (e) {
    console.error("[auth-login] Exception :", e.message);
    console.error("[auth-login] Stack :", e.stack);
    return err(e.message);
  }
};
