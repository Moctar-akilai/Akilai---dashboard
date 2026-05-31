const { BASE_URL, headers, ok, err, preflight } = require("./config");

exports.handler = async function(event, context) {
  if (event.httpMethod === "OPTIONS") return preflight();

  try {
    const email  = (event.queryStringParameters && event.queryStringParameters.email) || null;
    console.log("[get-tickets] Email reçu :", email);

    /* "Date création" est un champ createdTime → tri natif Airtable */
    const params = new URLSearchParams({
      "sort[0][field]":     "Date création",
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

    const tickets = records.map(function(r, i) {
      const f = r.fields;

      /* Conversation : JSON stocké dans le champ Conversation */
      let messages = [];
      try { messages = f.Conversation ? JSON.parse(f.Conversation) : []; } catch(e) {
        messages = f.Conversation ? [{ role: "client", text: f.Conversation }] : [];
      }

      /* Date création : champ createdTime Airtable */
      const dateRaw = f["Date création"] || null;
      const date    = dateRaw ? dateRaw.split("T")[0] : new Date().toISOString().split("T")[0];

      return {
        id:        r.id,
        _seq:      `T-${String(f["N° Ticket"] || (i + 1)).padStart(3, "0")}`,
        sujet:     f.Sujet        || f.Name || "Sans sujet",
        client_id: f["User ID"]   || null,
        priorite:  f["Priorité"]  || "Normale",
        categorie: "Support",
        statut:    f.Statut       || "Ouvert",
        date,
        messages,
        reponse:   f["Réponse Akilai"] || null,
        message_init: f.Message   || null,
      };
    });

    return ok({ tickets });
  } catch (e) {
    console.error("[get-tickets] Exception :", e.message, e.stack);
    return err(e.message);
  }
};
