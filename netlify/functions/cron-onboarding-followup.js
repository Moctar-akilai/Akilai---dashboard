/**
 * cron-onboarding-followup.js
 * Schedule: "0 9 * * *" — tous les jours à 9h UTC
 *
 * Pour chaque client actif créé hier (J+1) qui n'a pas encore d'historique,
 * envoie un email de relance "Avez-vous testé votre assistant ?".
 */

const BASE_ID             = process.env.AIRTABLE_BASE_ID;
const CLIENTS_TABLE       = "tble0g9eMTjAfw6OO";
const HISTORIQUE_TABLE    = "tblxXBGjv6iZU41XY";
const AIRTABLE_BASE_URL   = `https://api.airtable.com/v0/${BASE_ID}`;

const FROM          = "Mohamed d'AkilAI <mohamed.diop@akilai.fr>";
const BCC           = "mohamed.diop@akilai.fr";
const CALENDLY_LINK = "https://calendly.com/mohamed-akilai";
const DASHBOARD_URL = "https://portal-akilai.netlify.app";

function airtableHeaders() {
  return {
    Authorization:  `Bearer ${process.env.AIRTABLE_API_KEY}`,
    "Content-Type": "application/json",
  };
}

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0]; // "YYYY-MM-DD"
}

async function getClientsCreatedYesterday(date) {
  const formula = encodeURIComponent(
    `AND({Statut}="Actif",{Date inscription}="${date}")`
  );
  const res = await fetch(
    `${AIRTABLE_BASE_URL}/${CLIENTS_TABLE}?filterByFormula=${formula}&fields[]=Nom&fields[]=Email&fields[]=AssistantType&fields[]=VapiPhoneNumber&fields[]=WhatsAppNumber`,
    { headers: airtableHeaders() }
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Airtable clients ${res.status}: ${t}`);
  }
  const data = await res.json();
  return data.records || [];
}

async function hasHistorique(userId) {
  if (!userId) return false;
  const formula = encodeURIComponent(`{User ID}="${userId}"`);
  const res = await fetch(
    `${AIRTABLE_BASE_URL}/${HISTORIQUE_TABLE}?filterByFormula=${formula}&maxRecords=1&fields[]=Email`,
    { headers: airtableHeaders() }
  );
  if (!res.ok) return false;
  const data = await res.json();
  return (data.records || []).length > 0;
}

function buildHtml({ clientName, assistantType, vapiPhoneNumber, whatsappNumber }) {
  const prenom  = (clientName || "").split(" ")[0] || "là";
  const isVocal = assistantType === "Vocal" || assistantType === "Combo";
  const isWA    = assistantType === "WhatsApp" || assistantType === "Combo";

  const rappels = [];
  if (isVocal && vapiPhoneNumber) {
    rappels.push(`<p style="margin:6px 0;font-size:14px;color:#e5e7eb">📞 Votre numéro vocal : <strong style="color:#70B2DE">${vapiPhoneNumber}</strong></p>`);
  }
  if (isWA && whatsappNumber) {
    rappels.push(`<p style="margin:6px 0;font-size:14px;color:#e5e7eb">💬 Votre numéro WhatsApp : <strong style="color:#70B2DE">${whatsappNumber}</strong></p>`);
  }

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Avez-vous testé votre assistant ?</title>
</head>
<body style="margin:0;padding:0;background:#030305;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#ffffff">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#030305;padding:40px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#0d0d14;border-radius:12px;overflow:hidden;border:1px solid rgba(112,178,222,0.2)">

        <tr><td style="background:linear-gradient(135deg,#0d0d14 0%,#111827 100%);padding:40px 48px 32px;text-align:center;border-bottom:1px solid rgba(112,178,222,0.15)">
          <div style="display:inline-block;background:rgba(112,178,222,0.1);border:1px solid rgba(112,178,222,0.3);border-radius:8px;padding:8px 20px;margin-bottom:24px">
            <span style="color:#70B2DE;font-size:14px;font-weight:600;letter-spacing:2px">AKILAI</span>
          </div>
          <h1 style="margin:0;font-size:26px;font-weight:700;color:#ffffff;line-height:1.3">Avez-vous testé votre assistant ?</h1>
        </td></tr>

        <tr><td style="padding:40px 48px">
          <p style="margin:0 0 20px;font-size:16px;color:#e5e7eb;line-height:1.6">Bonjour ${prenom},</p>
          <p style="margin:0 0 28px;font-size:15px;color:#9ca3af;line-height:1.7">
            Votre assistant est configuré mais n'a pas encore reçu de contact.
          </p>

          ${rappels.length ? `
          <div style="background:rgba(112,178,222,0.06);border:1px solid rgba(112,178,222,0.15);border-radius:8px;padding:20px 24px;margin:0 0 32px">
            <p style="margin:0 0 10px;font-size:13px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:1px">Vos accès pour tester</p>
            ${rappels.join("")}
          </div>` : ""}

          <p style="margin:0 0 32px;font-size:15px;color:#9ca3af;line-height:1.7">
            Besoin d'aide pour démarrer ? Planifiez 15 minutes avec moi, je vous guide en direct.
          </p>

          <div style="text-align:center;margin:0 0 40px">
            <a href="${CALENDLY_LINK}" style="display:inline-block;background:#70B2DE;color:#030305;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;letter-spacing:0.3px">
              Réserver un appel
            </a>
          </div>

          <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.6">
            Votre dashboard : <a href="${DASHBOARD_URL}" style="color:#70B2DE;text-decoration:none">${DASHBOARD_URL}</a>
          </p>
        </td></tr>

        <tr><td style="padding:24px 48px;border-top:1px solid rgba(112,178,222,0.1);text-align:center">
          <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#e5e7eb">Mohamed</p>
          <p style="margin:0;font-size:12px;color:#6b7280">Fondateur &middot; <a href="https://akilai.fr" style="color:#70B2DE;text-decoration:none">AkilAI</a></p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendFollowupEmail({ clientName, clientEmail, assistantType, vapiPhoneNumber, whatsappNumber }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY non configurée");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from:    FROM,
      to:      [clientEmail],
      bcc:     [BCC],
      subject: "Avez-vous testé votre assistant ?",
      html:    buildHtml({ clientName, assistantType, vapiPhoneNumber, whatsappNumber }),
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Resend ${res.status}: ${t}`);
  }
  return res.json();
}

exports.handler = async function() {
  const date = yesterday();
  console.log(`[cron-onboarding-followup] Démarrage — vérification clients du ${date}`);

  let clients;
  try {
    clients = await getClientsCreatedYesterday(date);
  } catch(e) {
    console.error("[cron-onboarding-followup] Erreur récupération clients:", e.message);
    return { statusCode: 500, body: e.message };
  }

  console.log(`[cron-onboarding-followup] ${clients.length} client(s) créé(s) hier`);

  let sent = 0, skipped = 0;

  for (const record of clients) {
    const f             = record.fields || {};
    const clientEmail   = f["Email"]           || "";
    const clientName    = f["Nom"]             || "";
    const assistantType = f["AssistantType"]   || "";
    const vapiPhone     = f["VapiPhoneNumber"] || "";
    const waNumber      = f["WhatsAppNumber"]  || "";

    if (!clientEmail) { skipped++; continue; }

    try {
      const active = await hasHistorique(clientEmail);
      if (active) {
        console.log(`[cron-onboarding-followup] ${clientEmail} — a déjà de l'historique → ignoré`);
        skipped++;
        continue;
      }

      await sendFollowupEmail({
        clientName,
        clientEmail,
        assistantType,
        vapiPhoneNumber: vapiPhone,
        whatsappNumber:  waNumber,
      });
      console.log(`[cron-onboarding-followup] Email envoyé à ${clientEmail}`);
      sent++;
    } catch(e) {
      console.error(`[cron-onboarding-followup] Erreur pour ${clientEmail}:`, e.message);
      skipped++;
    }
  }

  console.log(`[cron-onboarding-followup] Terminé — envoyés: ${sent}, ignorés: ${skipped}`);
  return { statusCode: 200, body: JSON.stringify({ ok: true, sent, skipped, date }) };
};
