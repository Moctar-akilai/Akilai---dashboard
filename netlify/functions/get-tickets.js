const { BASE_URL, headers, ok, err, preflight } = require("./config");

/**
 * GET /Support → tableau tickets[] mappé
 * Champs Airtable : Sujet, ClientId, Priorite, Categorie, Statut,
 *   DateCreation, Messages (JSON stringifié)
 */
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();

  try {
    const params = new URLSearchParams({
      "sort[0][field]":     "DateCreation",
      "sort[0][direction]": "desc",
    });

    const res = await fetch(`${BASE_URL}/Support?${params}`, { headers });
    if (!res.ok) return err(`Airtable ${res.status}`);

    const data    = await res.json();
    const records = data.records || [];

    const tickets = records.map((r, i) => {
      const f = r.fields;
      let messages = [];
      try { messages = f.Messages ? JSON.parse(f.Messages) : []; } catch {}

      return {
        id:        r.id,
        _seq:      `T-${String(i + 1).padStart(3, "0")}`,
        sujet:     f.Sujet      || "Sans sujet",
        client_id: f.ClientId   || null,
        priorite:  f.Priorite   || "Normale",
        categorie: f.Categorie  || "Autre",
        statut:    f.Statut     || "Ouvert",
        date:      f.DateCreation ? f.DateCreation.split("T")[0] : new Date().toISOString().split("T")[0],
        messages,
      };
    });

    return ok({ tickets });
  } catch (e) {
    return err(e.message);
  }
};
