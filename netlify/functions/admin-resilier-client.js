const { BASE_URL, headers, ok, err, preflight, corsHeaders } = require("./config");
const { verifyAdminToken, unauthorized } = require("./admin-utils");
const { resiliationClient, resiliationAdmin } = require("./email-templates");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (!verifyAdminToken(event)) return unauthorized();
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { id, raison, commentaire, entreprise, nom, email, plan, montant, notes } = JSON.parse(event.body || "{}");
    if (!id || !raison) return err("id et raison requis", 400);

    const dateResiliation = new Date().toLocaleDateString("fr-FR");

    // 1. PATCH Airtable : Statut = Résilié + note horodatée
    const newNotes = (notes || "") + (notes ? "\n" : "") + `[${dateResiliation}] Résilié — ${raison}${commentaire ? " : " + commentaire : ""}`;
    const patch = await fetch(`${BASE_URL}/tble0g9eMTjAfw6OO/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ fields: { Statut: "Résilié", Notes: newNotes }, typecast: true }),
    });
    const patchData = await patch.json();
    if (patchData.error) return err(patchData.error.message || "Airtable error");

    const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";

    if (RESEND_API_KEY) {
      // 2. Email au client
      if (email) {
        const tplClient = resiliationClient({ nom: entreprise || nom || email, plan, dateResiliation, raison });
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
          body: JSON.stringify({
            from: "AkilAI <noreply@akilai.fr>",
            to: email,
            subject: tplClient.subject,
            html: tplClient.html,
          }),
        }).catch(e => console.error("[resilier] email client error:", e.message));
      }

      // 3. Email admin
      if (ADMIN_EMAIL) {
        const tplAdmin = resiliationAdmin({ entreprise, nom, email, plan, montant, raison, commentaire, date: dateResiliation });
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
          body: JSON.stringify({
            from: "AkilAI <noreply@akilai.fr>",
            to: ADMIN_EMAIL,
            subject: tplAdmin.subject,
            html: tplAdmin.html,
          }),
        }).catch(e => console.error("[resilier] email admin error:", e.message));
      }
    }

    console.log(`[resilier] Client ${id} résilié — raison: ${raison}`);
    return ok({ ok: true, notes: newNotes });
  } catch (e) {
    console.error("[resilier] Exception:", e.message);
    return err(e.message);
  }
};
