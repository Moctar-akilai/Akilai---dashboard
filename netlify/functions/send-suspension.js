const { BASE_URL, headers, ok, err, preflight, corsHeaders } = require("./config");
const { verifyAdminToken, unauthorized } = require("./admin-utils");

const CLIENTS_TABLE = "tble0g9eMTjAfw6OO";
const AUTOMATIONS_TABLE = "tble4KroqvA1JodJs";

const { suspension: suspensionTpl } = require("./email-templates");
const { getEmailCorps } = require("./email-config");

async function sendSuspensionEmail(email, nom, plan, lienPaiement = "") {
  const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
  if (!RESEND_API_KEY) return;
  const corps = await getEmailCorps('suspension').catch(() => null);
  const tpl = suspensionTpl({ nom, plan, lienPaiement, corps });

  const _rSusp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({ from: "AkilAI <noreply@akilai.fr>", to: email, subject: tpl.subject, html: tpl.html }),
  });
  const _dSusp = await _rSusp.json();
  console.log('[email] send-suspension statut:', _dSusp.id || _dSusp.error || _dSusp.message);
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
