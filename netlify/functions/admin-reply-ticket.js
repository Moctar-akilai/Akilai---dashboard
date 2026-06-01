const { BASE_URL, headers, ok, err, preflight, corsHeaders } = require("./config");
const { verifyAdminToken, unauthorized } = require("./admin-utils");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (!verifyAdminToken(event)) return unauthorized();
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { ticketId, message } = JSON.parse(event.body || "{}");
    if (!ticketId || !message) return err("ticketId and message are required");

    // 1. GET current ticket
    const getRes = await fetch(`${BASE_URL}/Support/${ticketId}`, { headers });
    const ticket = await getRes.json();

    if (ticket.error) return err(ticket.error.message || "Ticket not found");

    const f = ticket.fields || {};
    let conversation = [];
    try {
      conversation = JSON.parse(f.Conversation || "[]");
    } catch (e) {
      conversation = [];
    }

    // 2. Append support reply
    conversation.push({
      role: "support",
      message,
      date: new Date().toISOString(),
    });

    // 3. PATCH ticket with updated conversation
    const patchRes = await fetch(`${BASE_URL}/Support/${ticketId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        fields: {
          Conversation: JSON.stringify(conversation),
          Statut: "En cours",
        },
      }),
    });
    const patchData = await patchRes.json();

    if (patchData.error) return err(patchData.error.message || "Airtable error");

    return ok({ ok: true });
  } catch (e) {
    return err(e.message);
  }
};
