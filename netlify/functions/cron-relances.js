/**
 * Scheduled: every day at 09:00 UTC
 * Detects J-7 / J-3 / J+1 clients and sends relance emails.
 * J+1: suspends client + all automations automatically.
 */
const { BASE_URL, headers } = require("./config");

const CLIENTS_TABLE = "tble0g9eMTjAfw6OO";
const AUTOMATIONS_TABLE = "tble4KroqvA1JodJs";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const LIEN_PAIEMENT = process.env.LIEN_PAIEMENT || "";

async function sendEmail(to, subject, html) {
  if (!RESEND_API_KEY) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({ from: "AkilAI <noreply@akilai.fr>", to, subject, html }),
    });
  } catch (e) {
    console.error("[cron-relances] sendEmail error:", e.message);
  }
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

async function patchClient(id, fields) {
  return fetch(`${BASE_URL}/${CLIENTS_TABLE}/${id}`, {
    method: "PATCH", headers, body: JSON.stringify({ fields }),
  });
}

async function suspendAutomations(email) {
  let offset = null;
  do {
    const p = new URLSearchParams({ maxRecords: "100", filterByFormula: `{User ID}="${email}"` });
    if (offset) p.set("offset", offset);
    const r = await fetch(`${BASE_URL}/${AUTOMATIONS_TABLE}?${p}`, { headers });
    const d = await r.json();
    if (d.records?.length) {
      await Promise.all(d.records.map(rec =>
        fetch(`${BASE_URL}/${AUTOMATIONS_TABLE}/${rec.id}`, {
          method: "PATCH", headers, body: JSON.stringify({ fields: { Statut: "Inactif" } }),
        })
      ));
    }
    offset = d.offset || null;
  } while (offset);
}

function appendRelance(existing, type) {
  let hist = [];
  try { hist = JSON.parse(existing || "[]"); } catch (e) { hist = []; }
  hist.unshift({ type, date: new Date().toISOString().split("T")[0], statut: "Envoyé" });
  return JSON.stringify(hist);
}

function emailJ7(nom, plan, dateStr, montant) {
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f4f4f7;margin:0;padding:40px 0">
<table width="600" align="center" style="background:#fff;border-radius:8px;overflow:hidden">
  <tr><td style="background:#0f172a;padding:28px 40px;text-align:center"><h1 style="color:#fff;margin:0;font-size:22px">AkilAI</h1></td></tr>
  <tr><td style="padding:36px 40px">
    <h2 style="color:#0f172a;margin:0 0 12px">Votre abonnement expire dans 7 jours</h2>
    <p style="color:#374151;font-size:15px;line-height:1.6">Bonjour <strong>${nom}</strong>,</p>
    <p style="color:#374151;font-size:15px;line-height:1.6">
      Votre abonnement <strong>${plan}</strong> expire le <strong>${fmtDate(dateStr)}</strong>.<br/>
      Montant : <strong>${montant} €/mois</strong>
    </p>
    ${LIEN_PAIEMENT ? `<p><a href="${LIEN_PAIEMENT}" style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">Renouveler mon abonnement</a></p>` : ""}
    <p style="color:#374151;font-size:14px">L'équipe AkilAI</p>
  </td></tr>
</table></body></html>`;
}

function emailJ3(nom, plan, dateStr, montant) {
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f4f4f7;margin:0;padding:40px 0">
<table width="600" align="center" style="background:#fff;border-radius:8px;overflow:hidden">
  <tr><td style="background:#0f172a;padding:28px 40px;text-align:center"><h1 style="color:#fff;margin:0;font-size:22px">AkilAI</h1></td></tr>
  <tr><td style="padding:36px 40px">
    <h2 style="color:#f59e0b;margin:0 0 12px">⚠️ Votre abonnement expire dans 3 jours</h2>
    <p style="color:#374151;font-size:15px;line-height:1.6">Bonjour <strong>${nom}</strong>,</p>
    <p style="color:#374151;font-size:15px;line-height:1.6">
      Rappel urgent — votre abonnement <strong>${plan}</strong> expire le <strong>${fmtDate(dateStr)}</strong>.<br/>
      Sans renouvellement, vos automatisations seront <strong>suspendues automatiquement</strong>.<br/>
      Montant : <strong>${montant} €/mois</strong>
    </p>
    ${LIEN_PAIEMENT ? `<p><a href="${LIEN_PAIEMENT}" style="background:#f59e0b;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">Renouveler maintenant</a></p>` : ""}
    <p style="color:#374151;font-size:14px">L'équipe AkilAI</p>
  </td></tr>
</table></body></html>`;
}

function emailSuspension(nom, plan) {
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f4f4f7;margin:0;padding:40px 0">
<table width="600" align="center" style="background:#fff;border-radius:8px;overflow:hidden">
  <tr><td style="background:#0f172a;padding:28px 40px;text-align:center"><h1 style="color:#fff;margin:0;font-size:22px">AkilAI</h1></td></tr>
  <tr><td style="padding:36px 40px">
    <h2 style="color:#dc2626;margin:0 0 12px">🔴 Votre compte AkilAI a été suspendu</h2>
    <p style="color:#374151;font-size:15px;line-height:1.6">Bonjour <strong>${nom}</strong>,</p>
    <p style="color:#374151;font-size:15px;line-height:1.6">
      Votre abonnement <strong>${plan}</strong> n'a pas été renouvelé.<br/>
      Vos automatisations ont été désactivées.
    </p>
    ${LIEN_PAIEMENT ? `<p><a href="${LIEN_PAIEMENT}" style="background:#dc2626;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">Régulariser mon abonnement</a></p>` : ""}
    <p style="color:#374151;font-size:14px">Une fois le paiement effectué, contactez-nous pour la réactivation.<br/>L'équipe AkilAI</p>
  </td></tr>
</table></body></html>`;
}

exports.handler = async () => {
  console.log("[cron-relances] START", new Date().toISOString());
  try {
    // Fetch all active clients
    let allClients = [];
    let offset = null;
    do {
      const p = new URLSearchParams({ maxRecords: "100", filterByFormula: `{Statut}="Actif"` });
      if (offset) p.set("offset", offset);
      const r = await fetch(`${BASE_URL}/${CLIENTS_TABLE}?${p}`, { headers });
      const d = await r.json();
      if (d.records) allClients = allClients.concat(d.records);
      offset = d.offset || null;
    } while (offset);

    const today = new Date(); today.setHours(0, 0, 0, 0);

    for (const r of allClients) {
      const f = r.fields || {};
      const email = f.Email || "";
      const nom = f.Nom || f.Entreprise || email;
      const plan = f.Plan || "";
      const dateStr = f["Date prochain paiement"] || "";
      const montantMensuel = f["Montant mensuel"] || 0;
      if (!dateStr || !email) continue;

      const echeance = new Date(dateStr); echeance.setHours(0, 0, 0, 0);
      const days = Math.round((echeance - today) / 86400000);

      if (days === 7) {
        console.log(`[cron-relances] J-7 → ${email}`);
        await sendEmail(email, "Votre abonnement AkilAI expire dans 7 jours", emailJ7(nom, plan, dateStr, montantMensuel));
        await patchClient(r.id, { "Historique relances": appendRelance(f["Historique relances"], "J-7") });

      } else if (days === 3) {
        console.log(`[cron-relances] J-3 → ${email}`);
        await sendEmail(email, "⚠️ Votre abonnement AkilAI expire dans 3 jours", emailJ3(nom, plan, dateStr, montantMensuel));
        await patchClient(r.id, { "Historique relances": appendRelance(f["Historique relances"], "J-3") });

      } else if (days < 0) {
        console.log(`[cron-relances] J+1 suspension → ${email}`);
        // Suspend client
        await patchClient(r.id, {
          Statut: "Suspendu",
          "Historique relances": appendRelance(f["Historique relances"], "J+1-suspension"),
        });
        // Suspend automations
        await suspendAutomations(email);
        // Send suspension email
        await sendEmail(email, "🔴 Votre compte AkilAI a été suspendu", emailSuspension(nom, plan));
      }
    }

    console.log("[cron-relances] DONE");
    return { statusCode: 200, body: "OK" };
  } catch (e) {
    console.error("[cron-relances] ERROR:", e.message);
    return { statusCode: 500, body: e.message };
  }
};
