const { BASE_URL, headers, ok, err, preflight } = require("./config");

/**
 * PATCH /Support/{id}
 * Body : { id, statut?, priorite?, message? }
 *   - message : { auteur, role, text } — ajouté au fil JSON
 *   - statut / priorite : champs directs
 *
 * Déclenche notify-ticket-reply si un message support est ajouté (séquence 5C).
 */
exports.handler = async function(event, context) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Méthode non autorisée", 405);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch(e) { return err("JSON invalide", 400); }

  const { id, statut, priorite, message } = body;
  if (!id) return err("Champ id obligatoire", 400);

  try {
    /* Récupérer l'enregistrement existant pour lire le fil de messages */
    const getRes = await fetch(`${BASE_URL}/Support/${id}`, { headers });
    if (!getRes.ok) return err(`Impossible de lire le ticket : ${getRes.status}`, 502);
    const existing = await getRes.json();

    let messages = [];
    try { messages = existing.fields.Messages ? JSON.parse(existing.fields.Messages) : []; }
    catch { messages = []; }

    const patchFields = {};

    if (message) {
      const entry = {
        auteur: message.auteur || "Support AkilAI",
        role:   message.role   || "support",
        text:   message.text,
        heure:  new Date().toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit" }),
      };
      messages.push(entry);
      patchFields.Messages = JSON.stringify(messages);
    }

    if (statut)   patchFields.Statut   = statut;
    if (priorite) patchFields.Priorite = priorite;

    if (Object.keys(patchFields).length === 0) return ok({ ok: true, noChange: true });

    const res = await fetch(`${BASE_URL}/Support/${id}`, {
      method:  "PATCH",
      headers,
      body:    JSON.stringify({ fields: patchFields }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Airtable PATCH ticket error:", res.status, text);
      return err(`Airtable ${res.status}`, 502);
    }

    /* Fire-and-forget email si réponse support */
    if (message && message.role === "support") {
      fetch(`${process.env.URL || ""}/.netlify/functions/notify-ticket-reply`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ ticketId: id, message, email: existing.fields["User ID"] || null }),
      }).catch(() => {});
    }

    return ok({ ok: true, messages });
  } catch (e) {
    return err(e.message);
  }
};
