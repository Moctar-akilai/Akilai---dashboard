const { BASE_URL, headers, ok, err, preflight } = require("./config");

/**
 * POST /Support — crée un ticket
 * Body : { sujet, description, priorite, categorie, email, statut? }
 * email = adresse email du client — stockée dans le champ texte "User ID"
 */
exports.handler = async function(event, context) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Méthode non autorisée", 405);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return err("JSON invalide", 400); }

  const { sujet, description, priorite, categorie, email, statut = "Ouvert" } = body;
  if (!sujet) return err("Le champ sujet est obligatoire", 400);

  const now = new Date().toISOString();
  const messagesInit = description
    ? JSON.stringify([{ auteur: "Client", role: "client", text: description, heure: now }])
    : "[]";

  const fields = {
    Sujet:        sujet,
    Priorite:     priorite  || "Normale",
    Categorie:    categorie || "Autre",
    Statut:       statut,
    DateCreation: now,
    Messages:     messagesInit,
  };
  if (email) fields["User ID"] = email;

  try {
    const res = await fetch(`${BASE_URL}/Support`, {
      method: "POST",
      headers,
      body:   JSON.stringify({ fields }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Airtable POST ticket error:", res.status, text);
      return err(`Airtable ${res.status}`, 502);
    }

    const data   = await res.json();
    const record = {
      id:        data.id,
      _seq:      data.id,
      sujet:     data.fields.Sujet,
      client_id: data.fields["User ID"] || null,
      priorite:  data.fields.Priorite,
      categorie: data.fields.Categorie,
      statut:    data.fields.Statut,
      date:      now.split("T")[0],
      messages:  description
        ? [{ auteur: "Client", role: "client", text: description, heure: now }]
        : [],
    };

    /* Fire-and-forget notification email */
    fetch(`${process.env.URL || ""}/.netlify/functions/notify-new-ticket`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ ticket: record, email }),
    }).catch(() => {});

    return ok({ ok: true, ticket: record });
  } catch (e) {
    return err(e.message);
  }
};
