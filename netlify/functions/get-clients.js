const { BASE_URL, headers, ok, err, preflight } = require("./config");

exports.handler = async function(event, context) {
  if (event.httpMethod === "OPTIONS") return preflight();

  try {
    const email  = (event.queryStringParameters && event.queryStringParameters.email) || null;
    console.log("[get-clients] Email reçu :", email);

    const params = new URLSearchParams();
    if (email) {
      params.set("filterByFormula", `LOWER({Email})="${email.toLowerCase()}"`);
    }

    const url = `${BASE_URL}/Clients?${params}`;
    console.log("[get-clients] URL appelée :", url.replace(BASE_URL, "[BASE_URL]"));

    const res = await fetch(url, { headers });
    console.log("[get-clients] Statut Airtable :", res.status);

    if (!res.ok) {
      const text = await res.text();
      console.error("[get-clients] Erreur Airtable :", res.status, text);
      return err(`Airtable ${res.status}`, 502);
    }

    const data    = await res.json();
    const records = data.records || [];
    console.log("[get-clients] Nb clients trouvés :", records.length);

    if (records.length > 0) {
      console.log("[get-clients] Champs bruts :", JSON.stringify(records[0].fields));
    }

    const clients = records.map(function(r, i) {
      const f = r.fields;
      let notes = [];
      try { notes = f.Notes ? JSON.parse(f.Notes) : []; } catch(e) { notes = f.Notes ? [f.Notes] : []; }

      return {
        id:               r.id,
        _seq:             i + 1,
        nom:              f.Nom              || "",
        secteur:          f.Secteur          || "Autre",
        statut:           f.Statut           || "Actif",
        plan:             f.Plan             || "Starter",
        date_debut:       f.DateDebut        || new Date().toISOString().split("T")[0],
        revenus_mensuels: Number(f.RevenusMensuels) || 0,
        email:            f.Email            || "",
        telephone:        f.Telephone        || "",
        tags:             Array.isArray(f.Tags) ? f.Tags : (f.Tags ? [f.Tags] : []),
        vapiAssistantId:  f.VapiAssistantId  || null,
        notes,
      };
    });

    return ok({ clients });
  } catch (e) {
    console.error("[get-clients] Exception :", e.message, e.stack);
    return err(e.message);
  }
};
