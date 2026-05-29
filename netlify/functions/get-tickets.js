const { BASE_URL, headers, ok, err, preflight } = require("./config");
const { requireAuth, filterByClient } = require("./auth");

/**
 * GET /Support → tableau tickets[] filtrés par client authentifié.
 */
exports.handler = async (event, context) => {
  if (event.httpMethod === "OPTIONS") return preflight();

  const auth = requireAuth(event, context);
  if (auth.error) return auth.error;
  const { clientId } = auth;

  try {
    const filter = filterByClient(clientId);
    const params = new URLSearchParams({
      "sort[0][field]":     "DateCreation",
      "sort[0][direction]": "desc",
    });

    const res = await fetch(`${BASE_URL}/Support?${filter}&${params}`, { headers });
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
        sujet:     f.Sujet     || "Sans sujet",
        client_id: f.ClientId  || null,
        priorite:  f.Priorite  || "Normale",
        categorie: f.Categorie || "Autre",
        statut:    f.Statut    || "Ouvert",
        date:      f.DateCreation ? f.DateCreation.split("T")[0] : new Date().toISOString().split("T")[0],
        messages,
      };
    });

    return ok({ tickets });
  } catch (e) {
    return err(e.message);
  }
};
