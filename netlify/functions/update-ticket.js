const { BASE_URL, headers, ok, err, preflight } = require("./config");

/**
 * POST — met à jour un ticket Support
 * Body : { id, statut?, message? }
 *   - message.text : ajouté à "Conversation" (JSON array) avec role "client"
 *   - statut       : mis à jour dans "Statut"
 *
 * Flux :
 *   GET record → lire "Conversation" → parser → push → PATCH
 */
exports.handler = async function(event, context) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Méthode non autorisée", 405);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch(e) { return err("JSON invalide", 400); }

  const { id, statut, message } = body;
  if (!id) return err("Champ id obligatoire", 400);

  console.log("[update-ticket] id:", id, "| statut:", statut, "| message:", message && message.text ? message.text.slice(0, 50) : null);

  try {
    const patchFields = {};

    /* Append client message to Conversation JSON array */
    if (message && message.text) {
      const getRes = await fetch(`${BASE_URL}/Support/${id}`, { headers });
      if (!getRes.ok) {
        const text = await getRes.text();
        console.error("[update-ticket] GET error:", getRes.status, text);
        return err(`Airtable GET ${getRes.status}`, 502);
      }
      const record = await getRes.json();
      const raw = record.fields && record.fields["Conversation"];

      let conversation = [];
      try { conversation = raw ? JSON.parse(raw) : []; } catch(e) { conversation = []; }

      conversation.push({
        role:    "client",
        message: message.text,
        date:    new Date().toISOString(),
      });

      patchFields["Conversation"] = JSON.stringify(conversation);
      console.log("[update-ticket] Conversation length now:", conversation.length);
    }

    if (statut) patchFields["Statut"] = statut;

    if (Object.keys(patchFields).length === 0) return ok({ ok: true, noChange: true });

    const patchRes = await fetch(`${BASE_URL}/Support/${id}`, {
      method:  "PATCH",
      headers,
      body:    JSON.stringify({ fields: patchFields, typecast: true }),
    });

    if (!patchRes.ok) {
      const text = await patchRes.text();
      console.error("[update-ticket] PATCH error:", patchRes.status, text);
      return err(`Airtable PATCH ${patchRes.status}`, 502);
    }

    console.log("[update-ticket] PATCH OK pour", id);
    return ok({ ok: true });
  } catch (e) {
    console.error("[update-ticket] Exception:", e.message, e.stack);
    return err(e.message);
  }
};
