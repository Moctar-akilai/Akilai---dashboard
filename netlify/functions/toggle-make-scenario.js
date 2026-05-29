const { BASE_URL, headers, ok, err, preflight } = require("./config");

/**
 * POST — Active ou désactive un scénario Make directement via l'API Make.
 *
 * Body : { id, statut }
 *   id     : ID Airtable de l'automation (récupère MakeScenarioId depuis Airtable)
 *   statut : "Actif" | "Inactif"
 *
 * Flux :
 *   1. GET /Automatisations/{id} → lire MakeScenarioId
 *   2. PATCH https://eu1.make.com/api/v2/scenarios/{scenarioId}
 *      Body : { "isEnabled": true/false }
 *   3. Retourne { ok: true } ou { ok: false, error }
 *
 * Variables d'env requises : MAKE_API_KEY
 */
exports.handler = async function(event, context) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Méthode non autorisée", 405);

  const makeApiKey = process.env.MAKE_API_KEY;
  if (!makeApiKey) return err("MAKE_API_KEY non configuré", 500);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return err("JSON invalide", 400); }

  const { id, statut } = body;
  if (!id || !statut) return err("Champs manquants : id, statut", 400);

  try {
    /* 1. Récupérer MakeScenarioId depuis Airtable */
    const airtableRes  = await fetch(`${BASE_URL}/Automatisations/${id}`, { headers });
    if (!airtableRes.ok) return err(`Airtable ${airtableRes.status}`, 502);

    const airtableData = await airtableRes.json();
    const scenarioId   = airtableData.fields?.MakeScenarioId;

    if (!scenarioId) {
      console.warn(`[toggle-make-scenario] Pas de MakeScenarioId pour l'automation ${id}`);
      return ok({ ok: true, skipped: true, reason: "no_scenario_id" });
    }

    /* 2. Appel API Make */
    const isEnabled = statut === "Actif";
    const makeRes   = await fetch(
      `https://eu1.make.com/api/v2/scenarios/${scenarioId}`,
      {
        method:  "PATCH",
        headers: {
          Authorization:  `Token ${makeApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isEnabled }),
      }
    );

    if (!makeRes.ok) {
      const text = await makeRes.text();
      console.error("[toggle-make-scenario] Make API error:", makeRes.status, text);
      return err(`Make API ${makeRes.status}: ${text}`, 502);
    }

    const makeData = await makeRes.json();
    return ok({
      ok:          true,
      scenarioId,
      isEnabled,
      makeResponse: makeData,
    });
  } catch (e) {
    console.error("[toggle-make-scenario]", e.message);
    return err(e.message);
  }
};
