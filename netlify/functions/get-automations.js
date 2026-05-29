const { BASE_URL, headers, ok, err, preflight } = require("./config");

exports.handler = async function(event, context) {
  if (event.httpMethod === "OPTIONS") return preflight();

  try {
    const email = (event.queryStringParameters && event.queryStringParameters.email) || null;
    console.log("[get-automations] Email reçu :", email);

    const params = new URLSearchParams({ "view": "Grid view" });

    if (email) {
      const formula = `{User ID}="${email}"`;
      console.log("[get-automations] Formule :", formula);
      params.set("filterByFormula", formula);
    } else {
      console.log("[get-automations] Pas d'email — retour de toutes les automations");
    }

    const url = `${BASE_URL}/Automatisations?${params}`;
    console.log("[get-automations] URL appelée :", url.replace(BASE_URL, "[BASE_URL]"));

    const res = await fetch(url, { headers });
    console.log("[get-automations] Statut Airtable :", res.status);

    if (!res.ok) {
      const text = await res.text();
      console.error("[get-automations] Erreur Airtable :", res.status, text);
      return err("Airtable " + res.status);
    }

    const data    = await res.json();
    const records = data.records || [];
    console.log("[get-automations] Nb automations trouvées :", records.length);

    if (records.length > 0) {
      console.log("[get-automations] Champs du premier record :", JSON.stringify(records[0].fields));
    }

    const automations = records.map(function(r, i) {
      const f = r.fields;
      let jours = [1,2,3,4,5];
      try { jours = f.JoursProgrammes ? JSON.parse(f.JoursProgrammes) : jours; } catch(e) {}

      return {
        id:             r.id,
        _seq:           i + 1,
        nom:            f.Nom            || "Automation sans nom",
        type:           f.Type           || "Voix",
        statut:         f.Statut         || "Actif",
        derniere_exec:  f.DerniereExec   || null,
        prochaine_exec: f.ProchaineExec  || null,
        client_id:      (f["User ID"] || [])[0] || null,
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
    console.error("[get-automations] Exception :", e.message, e.stack);
    return err(e.message);
  }
};
