const { BASE_URL, headers, ok, err, preflight, corsHeaders } = require("./config");
const { verifyAdminToken, unauthorized } = require("./admin-utils");

const CLIENTS_TABLE = "tble0g9eMTjAfw6OO";
const AUTOMATIONS_TABLE = "tble4KroqvA1JodJs";

async function sendSuspensionEmail(email, nom, plan, lienPaiement = "") {
  const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
  if (!RESEND_API_KEY) return;
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
  <tr><td style="background:#0f172a;padding:32px 40px;text-align:center;"><h1 style="color:#fff;margin:0;font-size:24px;">AkilAI</h1></td></tr>
  <tr><td style="padding:40px;">
    <h2 style="color:#dc2626;margin:0 0 16px;">🔴 Votre compte AkilAI a été suspendu</h2>
    <p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 16px;">Bonjour <strong>${nom}</strong>,</p>
    <p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 16px;">
      Votre abonnement <strong>${plan}</strong> n'a pas été renouvelé à échéance.<br/>
      Vos automatisations ont été <strong>désactivées automatiquement</strong>.
    </p>
    <p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 24px;">
      Pour réactiver votre compte, réglez votre situation au plus vite :
    </p>
    ${lienPaiement ? `<table cellpadding="0" cellspacing="0" style="margin:0 0 32px;"><tr><td style="background:#dc2626;border-radius:6px;padding:14px 28px;"><a href="${lienPaiement}" style="color:#fff;text-decoration:none;font-size:16px;font-weight:bold;">Régulariser mon abonnement</a></td></tr></table>` : ""}
    <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 8px;">
      Une fois le paiement effectué, contactez-nous pour la réactivation immédiate.
    </p>
    <p style="color:#374151;font-size:15px;line-height:1.6;margin:0;">L'équipe AkilAI</p>
  </td></tr>
  <tr><td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
    <p style="color:#9ca3af;font-size:13px;margin:0;">© ${new Date().getFullYear()} AkilAI — Tous droits réservés</p>
  </td></tr>
</table></td></tr></table></body></html>`;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({ from: "AkilAI <noreply@akilai.fr>", to: email, subject: "🔴 Votre compte AkilAI a été suspendu", html }),
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (!verifyAdminToken(event)) return unauthorized();
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { clientId, email, nom, plan, lienPaiement, historiqueRelances } = JSON.parse(event.body || "{}");
    if (!clientId) return err("clientId requis", 400);

    // 1. PATCH client statut → Suspendu
    const clientRes = await fetch(`${BASE_URL}/${CLIENTS_TABLE}/${clientId}`, {
      method: "PATCH", headers,
      body: JSON.stringify({ fields: { Statut: "Suspendu" } }),
    });
    if (!clientRes.ok) {
      const t = await clientRes.text();
      return err(`Airtable client ${clientRes.status}: ${t}`, 502);
    }

    // 2. PATCH automations → Inactif
    let autoOffset = null;
    do {
      const p = new URLSearchParams({ maxRecords: "100", filterByFormula: `{User ID}="${email}"` });
      if (autoOffset) p.set("offset", autoOffset);
      const ar = await fetch(`${BASE_URL}/${AUTOMATIONS_TABLE}?${p}`, { headers });
      const ad = await ar.json();
      if (ad.records?.length) {
        await Promise.all(ad.records.map(r =>
          fetch(`${BASE_URL}/${AUTOMATIONS_TABLE}/${r.id}`, {
            method: "PATCH", headers, body: JSON.stringify({ fields: { Statut: "Inactif" } }),
          })
        ));
      }
      autoOffset = ad.offset || null;
    } while (autoOffset);

    // 3. Log relance history
    const hist = JSON.parse(historiqueRelances || "[]");
    hist.unshift({ type: "J+1-suspension", date: new Date().toISOString().split("T")[0], statut: "Envoyé" });
    await fetch(`${BASE_URL}/${CLIENTS_TABLE}/${clientId}`, {
      method: "PATCH", headers,
      body: JSON.stringify({ fields: { "Historique relances": JSON.stringify(hist) } }),
    });

    // 4. Send email (fire-and-forget)
    sendSuspensionEmail(email, nom, plan, lienPaiement).catch(() => {});

    return ok({ ok: true });
  } catch (e) {
    return err(e.message);
  }
};
