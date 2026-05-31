const { BASE_URL, headers, ok, err, preflight } = require("./config");

exports.handler = async function(event, context) {
  if (event.httpMethod === "OPTIONS") return preflight();

  try {
    const email  = (event.queryStringParameters && event.queryStringParameters.email) || null;
    console.log("[get-tickets] Email reçu :", email);

    const params = new URLSearchParams({
      "sort[0][field]":     "DateCreation",
      "sort[0][direction]": "desc",
    });
    if (email) params.set("filterByFormula", `{User ID}="${email}"`);

    const res = await fetch(`${BASE_URL}/Support?${params}`, { headers });
    console.log("[get-tickets] Statut Airtable :", res.status);

    if (!res.ok) {
      const text = await res.text();
      console.error("[get-tickets] Erreur Airtable :", res.status, text);
      return err(`Airtable ${res.status}`, 502);
    }

    const data    = await res.json();
    const records = data.records || [];
    console.log("[get-tickets] Nb records :", records.length);

    const tickets = records.map((r, i) => {
      const f = r.fields;
      let messages = [];
      try { messages = f.Messages ? JSON.parse(f.Messages) : []; } catch(e) {}

      return {
        id:        r.id,
        _seq:      `T-${String(i + 1).padStart(3, "0")}`,
        sujet:     f.Sujet     || "Sans sujet",
        client_id: f["User ID"] || null,
        priorite:  f.Priorite  || "Normale",
        categorie: f.Categorie || "Autre",
        statut:    f.Statut    || "Ouvert",
        date:      f.DateCreation ? f.DateCreation.split("T")[0] : new Date().toISOString().split("T")[0],
        messages,
      };
    });

    return ok({ tickets });
  } catch (e) {
    console.error("[get-tickets] Exception :", e.message, e.stack);
    return err(e.message);
  }
};
