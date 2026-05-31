const { BASE_URL, headers, ok, err, preflight } = require("./config");

/**
 * POST — crée un ticket dans la table Support (tbl42Bo0bb6BRfavB)
 * Body : { sujet, description, email, automationId? }
 * Champs Airtable réels : Sujet, Message, Priorité, Statut, User ID,
 *   Automatisation concernée (multipleRecordLinks)
 */
exports.handler = async function(event, context) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Méthode non autorisée", 405);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch(e) { return err("JSON invalide", 400); }

  const { sujet, description, email, automationId } = body;
  if (!sujet) return err("Le champ sujet est obligatoire", 400);

  console.log("[create-ticket] sujet:", sujet, "| email:", email, "| autoId:", automationId);

  const fields = {
    Sujet:   sujet,
    Statut:  "Ouvert",
  };
  if (description)  fields["Message"]  = description;
  if (email)        fields["User ID"]  = email;
  if (automationId) fields["Automatisation concernée"] = [automationId];

  try {
    const res = await fetch(`${BASE_URL}/Support`, {
      method:  "POST",
      headers,
      body:    JSON.stringify({ fields }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[create-ticket] Airtable error:", res.status, text);
      return err(`Airtable ${res.status}`, 502);
    }

    const data = await res.json();
    console.log("[create-ticket] Créé — ID:", data.id);

    const record = {
      id:        data.id,
      _seq:      `T-${String(data.fields["N° Ticket"] || data.id).padStart(3, "0")}`,
      sujet:     data.fields.Sujet          || sujet,
      client_id: data.fields["User ID"]     || null,
      priorite:  "Normale",
      categorie: "Support",
      statut:    data.fields.Statut         || "Ouvert",
      date:      new Date().toISOString().split("T")[0],
      message_init: description             || null,
      messages:  [],
    };

    /* Fire-and-forget notification */
    fetch(`${process.env.URL || ""}/.netlify/functions/notify-new-ticket`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ ticket: record, email }),
    }).catch(function() {});

    return ok({ ok: true, ticket: record });
  } catch (e) {
    console.error("[create-ticket] Exception:", e.message, e.stack);
    return err(e.message);
  }
};
