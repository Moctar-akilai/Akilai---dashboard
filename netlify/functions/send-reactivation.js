const { BASE_URL, headers, ok, err, preflight, corsHeaders } = require("./config");
const { verifyAdminToken, unauthorized } = require("./admin-utils");

const CLIENTS_TABLE = "tble0g9eMTjAfw6OO";
const AUTOMATIONS_TABLE = "tble4KroqvA1JodJs";

const { reactivation: reactivationTpl } = require("./email-templates");
const { getEmailCorps } = require("./email-config");

async function sendReactivationEmail(email, nom, prochainPaiement, plan) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
  if (!RESEND_API_KEY) return;
  const corps = await getEmailCorps("reactivation").catch(() => null);
  const tpl = reactivationTpl({ nom, plan, dateProchainPaiement: prochainPaiement, corps });

  const _rReact = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({ from: "AkilAI <noreply@akilai.fr>", to: email, subject: tpl.subject, html: tpl.html }),
  });
  const _dReact = await _rReact.json();
  console.log('[email] send-reactivation statut:', _dReact.id || _dReact.error || _dReact.message);
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (!verifyAdminToken(event)) return unauthorized();
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { clientId, email, nom, prochainPaiement, historiqueRelances } = JSON.parse(event.body || "{}");
    if (!clientId) return err("clientId requis", 400);

    // 1. PATCH client statut → Actif
    const clientRes = await fetch(`${BASE_URL}/${CLIENTS_TABLE}/${clientId}`, {
      method: "PATCH", headers,
      body: JSON.stringify({ fields: { Statut: "Actif" } }),
    });
    if (!clientRes.ok) {
      const t = await clientRes.text();
      return err(`Airtable client ${clientRes.status}: ${t}`, 502);
    }

    // 2. PATCH automations → Actif
    let autoOffset = null;
    do {
      const p = new URLSearchParams({ maxRecords: "100", filterByFormula: `{User ID}="${email}"` });
      if (autoOffset) p.set("offset", autoOffset);
      const ar = await fetch(`${BASE_URL}/${AUTOMATIONS_TABLE}?${p}`, { headers });
      const ad = await ar.json();
      if (ad.records?.length) {
        await Promise.all(ad.records.map(r =>
          fetch(`${BASE_URL}/${AUTOMATIONS_TABLE}/${r.id}`, {
            method: "PATCH", headers, body: JSON.stringify({ fields: { Statut: "Actif" } }),
          })
        ));
      }
      autoOffset = ad.offset || null;
    } while (autoOffset);

    // 3. Log reactivation history
    const hist = JSON.parse(historiqueRelances || "[]");
    hist.unshift({ type: "Réactivation", date: new Date().toISOString().split("T")[0], statut: "Envoyé" });
    await fetch(`${BASE_URL}/${CLIENTS_TABLE}/${clientId}`, {
      method: "PATCH", headers,
      body: JSON.stringify({ fields: { "Historique relances": JSON.stringify(hist) } }),
    });

    // 4. Send email
    sendReactivationEmail(email, nom, prochainPaiement).catch(() => {});

    return ok({ ok: true });
  } catch (e) {
    return err(e.message);
  }
};
