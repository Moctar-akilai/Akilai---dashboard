const { BASE_URL, headers, ok, err, preflight } = require("./config");

/**
 * PATCH /Automatisations/{id}
 * Body : { id, statut }   (id = Airtable record ID ou numérique local)
 *
 * Appelée par le toggle On/Off du dashboard.
 * Retourne { ok: true, statut } ou { ok: false, error }.
 */
exports.handler = async function(event, context) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Méthode non autorisée", 405);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch(e) { return err("JSON invalide", 400); }

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
    const newStatut = data.fields?.Statut || statut;

    /* Fire-and-forget email si statut = Erreur (séquence 5D) */
    if (newStatut === "Erreur") {
      const autoData = { id, nom: data.fields?.Nom || id, type: data.fields?.Type,
                         derniere_exec: data.fields?.DerniereExec, prochaine_exec: data.fields?.ProchaineExec };
      fetch(`${process.env.URL || ""}/.netlify/functions/notify-automation-error`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ automation: autoData }),
      }).catch(() => {});
    }

    return ok({ ok: true, statut: newStatut });
  } catch (e) {
    return err(e.message);
  }
};
