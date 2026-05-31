const { BASE_URL, headers, ok, err, preflight } = require("./config");

/**
 * POST — PATCH /Automatisations/{id}
 * Body : { id, jours, heure, recurrence }
 *   jours      : number[] ex [1,2,3,4,5]
 *   heure      : "HH:MM"
 *   recurrence : "quotidien"|"hebdo"|"mensuel"
 */
exports.handler = async function(event, context) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Méthode non autorisée", 405);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch(e) { return err("JSON invalide", 400); }

  const { id, jours, heure, recurrence } = body;
  if (!id) return err("Champ id obligatoire", 400);

  try {
    const res = await fetch(`${BASE_URL}/Automatisations/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        fields: {
          JoursProgrammes: JSON.stringify(jours || []),
          HeureProgrammee: heure      || "08:00",
          Recurrence:      recurrence || "quotidien",
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Airtable save-programmation error:", res.status, text);
      return err(`Airtable ${res.status}`, 502);
    }

    return ok({ ok: true });
  } catch (e) {
    return err(e.message);
  }
};
