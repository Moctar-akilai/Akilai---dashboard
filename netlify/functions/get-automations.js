const { BASE_URL, headers, ok, err, preflight } = require("./config");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();

  try {
    const res = await fetch(`${BASE_URL}/Automatisations?view=Grid%20view`, { headers });
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
