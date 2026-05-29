const { BASE_URL, headers, ok, err, preflight } = require("./config");
const { requireAuth, filterByClient } = require("./auth");

/**
 * GET /Clients → retourne uniquement les données du client authentifié.
 */
exports.handler = async (event, context) => {
  if (event.httpMethod === "OPTIONS") return preflight();

  const auth = requireAuth(event, context);
  if (auth.error) return auth.error;
  const { clientId } = auth;

  try {
    const filter = filterByClient(clientId);
    const res    = await fetch(`${BASE_URL}/Clients?${filter}&view=Grid%20view`, { headers });
    if (!res.ok) return err(`Airtable ${res.status}`);

    const data    = await res.json();
    const records = data.records || [];

    const clients = records.map((r, i) => {
      const f = r.fields;
      let notes = [];
      try { notes = f.Notes ? JSON.parse(f.Notes) : []; } catch { notes = f.Notes ? [f.Notes] : []; }

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
    return err(e.message);
  }
};
