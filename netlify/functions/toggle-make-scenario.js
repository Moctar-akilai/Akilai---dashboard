const { BASE_URL, headers, ok, err, preflight } = require("./config");

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Méthode non autorisée", 405);

  const MAKE_API_KEY = process.env.MAKE_API_KEY;
  if (!MAKE_API_KEY) return err("MAKE_API_KEY non configuré", 500);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch(e) { return err("JSON invalide", 400); }

  const { id, statut } = body;
  if (!id || !statut) return err("Champs manquants : id, statut", 400);

  try {
    // 1. Récupérer "Make scenario ID" depuis Airtable
    const airtableRes = await fetch(`${BASE_URL}/Automatisations/${id}`, { headers });
    if (!airtableRes.ok) return err(`Airtable ${airtableRes.status}`, 502);

    const airtableData = await airtableRes.json();
    const scenarioId = airtableData.fields?.["Make scenario ID"];

    if (!scenarioId) {
      console.warn(`[toggle-make-scenario] Pas de "Make scenario ID" pour l'automation ${id}`);
      return ok({ ok: true, skipped: true, reason: "no_scenario_id" });
    }

    // 2. /start ou /stop selon statut
    const endpoint = statut === "Actif" ? "start" : "stop";
    const makeRes = await fetch(
      `https://eu1.make.com/api/v2/scenarios/${scenarioId}/${endpoint}`,
      {
        method: "POST",
        headers: { Authorization: `Token ${MAKE_API_KEY}`, "Content-Type": "application/json" },
      }
    );

    const makeText = await makeRes.text();
    console.log(`[toggle-make-scenario] ${endpoint} scenarioId=${scenarioId} → ${makeRes.status}: ${makeText.substring(0, 200)}`);

    if (!makeRes.ok) {
      console.error("[toggle-make-scenario] Make API error:", makeRes.status, makeText);
      return err(`Make API ${makeRes.status}: ${makeText}`, 502);
    }

    return ok({ ok: true, scenarioId, isEnabled: statut === "Actif" });
  } catch (e) {
    console.error("[toggle-make-scenario]", e.message);
    return err(e.message);
  }
};
