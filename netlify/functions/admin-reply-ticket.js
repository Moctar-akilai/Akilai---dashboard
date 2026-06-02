const { BASE_URL, headers, ok, err, preflight, corsHeaders } = require("./config");
const { verifyAdminToken, unauthorized } = require("./admin-utils");
const { ticketResolu: ticketResoluTpl, nouvelleReponseTicket } = require("./email-templates");
const { getEmailCorps } = require("./email-config");

async function sendTicketResolvedEmail(email, nom, numTicket, sujet, reponseAkilai) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
  if (!RESEND_API_KEY || !email) return;
  const corps = await getEmailCorps('ticketResolu').catch(() => null);
  const tpl = ticketResoluTpl({ nom, numTicket, sujet, reponseAkilai, dateResolution: new Date().toLocaleDateString('fr-FR'), corps });
  const _r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({ from: "AkilAI <noreply@akilai.fr>", to: email, subject: tpl.subject, html: tpl.html }),
  });
  const _d = await _r.json();
  console.log('[email] admin-reply-ticket statut:', _d.id || _d.error || _d.message);
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (!verifyAdminToken(event)) return unauthorized();
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { ticketId, message, resoudre } = JSON.parse(event.body || "{}");
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

    // 3. PATCH ticket with updated conversation + optional resolve
    const newStatut = resoudre ? "Résolu" : "En cours";
    const patchFields = { Conversation: JSON.stringify(conversation), Statut: newStatut };
    if (resoudre) patchFields["Réponse Akilai"] = message;
    if (resoudre) patchFields["Date résolution"] = new Date().toISOString().split("T")[0];

    const patchRes = await fetch(`${BASE_URL}/Support/${ticketId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ fields: patchFields }),
    });
    const patchData = await patchRes.json();

    if (patchData.error) return err(patchData.error.message || "Airtable error");

    // 4. Send email to client on every support reply
    const clientEmail = (f["E-mail"] || [])[0] || f["User ID"] || "";
    const clientNom   = (f["Nom (from Client)"] || [])[0] || "";
    const numTicket   = f["N° Ticket"] || ticketId;
    const sujet       = f["Sujet"] || "";

    if (resoudre) {
      sendTicketResolvedEmail(clientEmail, clientNom, numTicket, sujet, message).catch(() => {});
    } else if (clientEmail) {
      // Réponse simple (pas de résolution) → email "nouvelle réponse"
      const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
      if (RESEND_API_KEY) {
        const tpl = nouvelleReponseTicket({ nom: clientNom || clientEmail, numTicket, sujet, reponse: message });
        fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
          body: JSON.stringify({ from: "AkilAI <noreply@akilai.fr>", to: clientEmail, subject: tpl.subject, html: tpl.html }),
        }).then(r => r.json()).then(d => console.log('[email] reply ticket:', d.id || d.error)).catch(() => {});
      }
    }

    return ok({ ok: true, statut: newStatut });
  } catch (e) {
    return err(e.message);
  }
};
