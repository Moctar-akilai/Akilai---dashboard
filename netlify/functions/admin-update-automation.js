const { BASE_URL, headers, ok, err, preflight, corsHeaders } = require("./config");
const { verifyAdminToken, unauthorized } = require("./admin-utils");

const MAKE_BASE = "https://eu1.make.com/api/v2";

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (!verifyAdminToken(event)) return unauthorized();
  if (event.httpMethod !== "POST" && event.httpMethod !== "PATCH") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { id, statut } = JSON.parse(event.body || "{}");
    if (!id || !statut) return err("id et statut requis", 400);

    // 1. GET record to fetch Make scenario ID
    const getRes = await fetch(`${BASE_URL}/tble4KroqvA1JodJs/${id}`, { headers });
    if (!getRes.ok) return err(`Airtable GET ${getRes.status}`, 502);
    const record = await getRes.json();
    if (record.error) return err(record.error.message || "Airtable error");
    const scenarioId = record.fields?.["Make scenario ID"];

    // 2. PATCH Airtable statut
    const patchRes = await fetch(`${BASE_URL}/tble4KroqvA1JodJs/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ fields: { Statut: statut } }),
    });
    if (!patchRes.ok) {
      const text = await patchRes.text();
      return err(`Airtable PATCH ${patchRes.status}: ${text}`, 502);
    }
    const patchData = await patchRes.json();
    if (patchData.error) return err(patchData.error.message || "Airtable error");
    console.log("[admin-update-automation] Airtable mis à jour:", id, "→", statut);

    // 3. Sync Make si scenarioId présent
    let makeUpdated = false;
    if (scenarioId) {
      const MAKE_API_KEY = process.env.MAKE_API_KEY || "";
      if (MAKE_API_KEY) {
        const endpoint = statut === "Actif" ? "start" : "stop";
        const makeRes = await fetch(`${MAKE_BASE}/scenarios/${scenarioId}/${endpoint}`, {
          method: "POST",
          headers: { Authorization: `Token ${MAKE_API_KEY}`, "Content-Type": "application/json" },
        });
        const makeText = await makeRes.text();
        console.log(`[admin-update-automation] Make ${endpoint} scenarioId=${scenarioId} → ${makeRes.status}: ${makeText.substring(0, 200)}`);
        makeUpdated = makeRes.ok;
      }
    } else {
      console.warn("[admin-update-automation] Pas de 'Make scenario ID' pour", id);
    }

    return ok({ ok: true, statut: patchData.fields?.Statut || statut, makeUpdated });
  } catch (e) {
    console.error("[admin-update-automation] Exception:", e.message);
    return err(e.message);
  }
};
