const { BASE_URL, headers, ok, err, preflight } = require("./config");

/**
 * PATCH /Automatisations/{id}
 * Body : { id, statut }   (id = Airtable record ID ou numérique local)
 *
 * Appelée par le toggle On/Off du dashboard.
 * Retourne { ok: true, statut } ou { ok: false, error }.
 */
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Méthode non autorisée", 405);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return err("JSON invalide", 400); }

  const { id, statut } = body;
  if (!id || !statut) return err("Champs manquants : id, statut", 400);

  try {
    const res = await fetch(`${BASE_URL}/Automatisations/${id}`, {
      method:  "PATCH",
      headers,
      body: JSON.stringify({ fields: { Statut: statut } }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Airtable PATCH automation error:", res.status, text);
      return err(`Airtable ${res.status}`, 502);
    }

    const data = await res.json();
    return ok({ ok: true, statut: data.fields?.Statut || statut });
  } catch (e) {
    return err(e.message);
  }
};
