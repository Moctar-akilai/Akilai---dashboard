const { BASE_URL, headers, ok, err, preflight } = require("./config");
const { requireAuth, filterByClient } = require("./auth");

/**
 * GET /Automatisations → tableau automations[] filtrés par client authentifié.
 */
exports.handler = async (event, context) => {
  if (event.httpMethod === "OPTIONS") return preflight();

  const auth = requireAuth(event);
  if (auth.error) return auth.error;
  const { clientId } = auth;

  try {
    const filter = filterByClient(clientId);
    const res    = await fetch(`${BASE_URL}/Automatisations?${filter}&view=Grid%20view`, { headers });
    if (!res.ok) return err(`Airtable ${res.status}`);

    const data    = await res.json();
    const records = data.records || [];

    const automations = records.map((r, i) => {
      const f = r.fields;
      let jours = [1,2,3,4,5];
      try { jours = f.JoursProgrammes ? JSON.parse(f.JoursProgrammes) : jours; } catch {}

      return {
        id:             r.id,
        _seq:           i + 1,
        nom:            f.Nom            || "Automation sans nom",
        type:           f.Type           || "Voix",
        statut:         f.Statut         || "Actif",
        derniere_exec:  f.DerniereExec   || null,
        prochaine_exec: f.ProchaineExec  || null,
        client_id:      f.ClientId       || null,
        makeScenarioId: f.MakeScenarioId || null,
        schedule: {
          jours,
          heure:      f.HeureProgrammee || "08:00",
          recurrence: f.Recurrence      || "quotidien",
        },
      };
    });

    return ok({ automations });
  } catch (e) {
    return err(e.message);
  }
};
