const { BASE_URL, headers, ok, err, preflight } = require("./config");

/**
 * GET /Clients → tableau clients[] mappé vers la structure du dashboard
 * Champs Airtable attendus : Nom, Secteur, Statut, Plan, DateDebut,
 *   RevenusMensuels, Email, Telephone, Tags (multiselect), Notes (long text JSON)
 */
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();

  try {
    const res  = await fetch(`${BASE_URL}/Clients?view=Grid%20view`, { headers });
    if (!res.ok) return err(`Airtable ${res.status}`);

    const data    = await res.json();
    const records = data.records || [];

    const clients = records.map((r, i) => {
      const f = r.fields;
      let notes = [];
      try { notes = f.Notes ? JSON.parse(f.Notes) : []; } catch { notes = f.Notes ? [f.Notes] : []; }

      return {
        id:               r.id,           // ID Airtable (string recXXX)
        _seq:             i + 1,          // index local pour compatibilité
        nom:              f.Nom              || "",
        secteur:          f.Secteur          || "Autre",
        statut:           f.Statut           || "Actif",
        plan:             f.Plan             || "Starter",
        date_debut:       f.DateDebut        || new Date().toISOString().split("T")[0],
        revenus_mensuels: Number(f.RevenusMensuels) || 0,
        email:            f.Email            || "",
        telephone:        f.Telephone        || "",
        tags:             Array.isArray(f.Tags) ? f.Tags : (f.Tags ? [f.Tags] : []),
        notes,
      };
    });

    return ok({ clients });
  } catch (e) {
    return err(e.message);
  }
};
