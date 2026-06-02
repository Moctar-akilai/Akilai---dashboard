const { ok, err, preflight, corsHeaders } = require("./config");
const { verifyAdminToken, unauthorized } = require("./admin-utils");
const { relanceJ7, relanceJ3 } = require("./email-templates");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (!verifyAdminToken(event)) return unauthorized();
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { email, nom, dateEcheance, montant, lienPaiement, type } = JSON.parse(event.body || "{}");
    if (!email) return err("email is required");

    const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
    if (!RESEND_API_KEY) return err("RESEND_API_KEY not configured");

    const tpl = type === "J-3"
      ? relanceJ3({ nom, montant, dateEcheance, lienPaiement })
      : relanceJ7({ nom, montant, dateEcheance, lienPaiement });

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({ from: "AkilAI <noreply@akilai.fr>", to: email, subject: tpl.subject, html: tpl.html }),
    });

    const data = await res.json();
    console.log('[email] send-relance statut:', data.id || data.error || data.message);
    if (!res.ok) return err(data.message || "Resend error");

    return ok({ ok: true });
  } catch (e) {
    return err(e.message);
  }
};
