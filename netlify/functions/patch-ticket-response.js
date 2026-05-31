const { BASE_URL, headers, ok, err, preflight } = require("./config");

/**
 * POST — appelé par Make pour ajouter la réponse AkilAI dans "Conversation"
 * Body : { id, message }
 *   - id      : record ID du ticket (ex. recXXX)
 *   - message : texte de la réponse support
 *
 * Flux :
 *   GET record → lire "Conversation" → parser → push role "support" → PATCH
 */
exports.handler = async function(event, context) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Méthode non autorisée", 405);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch(e) { return err("JSON invalide", 400); }

  const { id, message } = body;
  if (!id)      return err("Champ id obligatoire", 400);
  if (!message) return err("Champ message obligatoire", 400);

  console.log("[patch-ticket-response] id:", id, "| message:", String(message).slice(0, 80));

  try {
    const getRes = await fetch(`${BASE_URL}/Support/${id}`, { headers });
    if (!getRes.ok) {
      const text = await getRes.text();
      console.error("[patch-ticket-response] GET error:", getRes.status, text);
      return err(`Airtable GET ${getRes.status}`, 502);
    }

    const record = await getRes.json();
    const raw = record.fields && record.fields["Conversation"];

    let conversation = [];
    try { conversation = raw ? JSON.parse(raw) : []; } catch(e) { conversation = []; }

    conversation.push({
      role:    "support",
      message: message,
      date:    new Date().toISOString(),
    });

    const patchRes = await fetch(`${BASE_URL}/Support/${id}`, {
      method:  "PATCH",
      headers,
      body:    JSON.stringify({ fields: { "Conversation": JSON.stringify(conversation) } }),
    });

    if (!patchRes.ok) {
      const text = await patchRes.text();
      console.error("[patch-ticket-response] PATCH error:", patchRes.status, text);
      return err(`Airtable PATCH ${patchRes.status}`, 502);
    }

    console.log("[patch-ticket-response] OK — Conversation length:", conversation.length);
    return ok({ ok: true, conversationLength: conversation.length });
  } catch (e) {
    console.error("[patch-ticket-response] Exception:", e.message, e.stack);
    return err(e.message);
  }
};
