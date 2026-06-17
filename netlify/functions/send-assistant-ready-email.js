const { ok, err, preflight } = require("./config");

const FROM          = "Mohamed d'AkilAI <mohamed.diop@akilai.fr>";
const BCC           = "mohamed.diop@akilai.fr";
const DASHBOARD_URL = "https://portal-akilai.netlify.app";
const LOGO_URL      = "https://portal-akilai.netlify.app/logo.png";

/* ── SVG icons ─────────────────────────────────────────────────── */
const ICON_PHONE = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#70B2DE" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.17h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6.08 6.08l1.1-1.1a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;

const ICON_WHATSAPP = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#25d366" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;

const ICON_BOLT = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;

const ICON_CHECK = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

function iconBox(svgContent, bg) {
  return `<div style="width:38px;height:38px;border-radius:10px;background:${bg};display:inline-flex;align-items:center;justify-content:center;vertical-align:middle">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:38px;height:38px"><tr><td align="center" valign="middle">${svgContent}</td></tr></table>
  </div>`;
}

function buildHtml({ clientName, assistantType, vapiPhoneNumber, whatsappNumber }) {
  const prenom  = (clientName || "").split(" ")[0] || "là";
  const isVocal = assistantType === "Vocal" || assistantType === "Combo";
  const isWA    = assistantType === "WhatsApp" || assistantType === "Combo";

  const testRows = [];

  if (isVocal && vapiPhoneNumber) {
    testRows.push(`
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px">
        <tr>
          <td width="50" valign="middle">${iconBox(ICON_PHONE, "rgba(112,178,222,0.12)")}</td>
          <td style="padding-left:14px">
            <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:1px">Test vocal</p>
            <p style="margin:0;font-size:17px;font-weight:700;color:#70B2DE;letter-spacing:0.3px">${vapiPhoneNumber}</p>
            <p style="margin:2px 0 0;font-size:12px;color:#475569">Appelez ce numéro pour tester votre assistant</p>
          </td>
        </tr>
      </table>`);
  }

  if (isWA && whatsappNumber) {
    testRows.push(`
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:4px">
        <tr>
          <td width="50" valign="middle">${iconBox(ICON_WHATSAPP, "rgba(37,211,102,0.10)")}</td>
          <td style="padding-left:14px">
            <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:1px">Test WhatsApp</p>
            <p style="margin:0;font-size:17px;font-weight:700;color:#25d366;letter-spacing:0.3px">${whatsappNumber}</p>
            <p style="margin:2px 0 0;font-size:12px;color:#475569">Envoyez un message à ce numéro</p>
          </td>
        </tr>
      </table>`);
  }

  const testSection = testRows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
          style="background:rgba(255,255,255,0.03);border:1px solid rgba(112,178,222,0.15);border-radius:12px;margin:0 0 36px">
         <tr><td style="padding:24px">
           <p style="margin:0 0 20px;font-size:11px;font-weight:600;color:#475569;letter-spacing:1.2px;text-transform:uppercase">
             Vos accès de test
           </p>
           ${testRows.join("")}
         </td></tr>
       </table>`
    : `<p style="margin:0 0 36px;font-size:14px;color:#64748b">
         Connectez-vous à votre espace pour retrouver vos informations de test.
       </p>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Votre assistant est configuré</title>
</head>
<body style="margin:0;padding:0;background:#07070f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#07070f;min-height:100vh">
<tr><td align="center" style="padding:48px 16px">

  <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px">

    <!-- LOGO -->
    <tr><td align="center" style="padding-bottom:32px">
      <a href="https://akilai.fr" style="text-decoration:none">
        <img src="${LOGO_URL}" alt="AkilAI" width="180" height="auto"
             style="display:block;height:auto;border:0;max-width:180px" />
      </a>
    </td></tr>

    <!-- CARD -->
    <tr><td style="background:#0e0e1a;border-radius:16px;border:1px solid rgba(112,178,222,0.18);overflow:hidden">

      <!-- ACCENT BAR -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="height:4px;background:linear-gradient(90deg,#3b82f6,#70B2DE,#a855f7)"></td></tr>
      </table>

      <!-- BODY -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:48px 48px 16px">

          <!-- Badge configuré -->
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
            <tr><td style="background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.25);border-radius:100px;padding:6px 14px">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td valign="middle" style="padding-right:6px">${ICON_CHECK}</td>
                  <td valign="middle" style="font-size:12px;font-weight:600;color:#22c55e;letter-spacing:0.5px">CONFIGURÉ</td>
                </tr>
              </table>
            </td></tr>
          </table>

          <!-- Title with bolt icon -->
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:16px">
            <tr>
              <td valign="middle" style="padding-right:10px">${iconBox(ICON_BOLT, "rgba(255,255,255,0.06)")}</td>
              <td valign="middle">
                <h1 style="margin:0;font-size:26px;font-weight:700;color:#ffffff;line-height:1.2">Votre assistant est prêt</h1>
              </td>
            </tr>
          </table>

          <p style="margin:0 0 32px;font-size:15px;color:#94a3b8;line-height:1.7">
            Bonjour ${prenom},<br><br>
            Votre assistant virtuel est opérationnel. Vous pouvez dès maintenant le tester.
          </p>

          ${testSection}

          <!-- CTA -->
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 40px">
            <tr><td style="border-radius:10px;background:#70B2DE">
              <a href="${DASHBOARD_URL}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#070714;text-decoration:none;letter-spacing:0.2px;border-radius:10px">
                Accéder à mon dashboard →
              </a>
            </td></tr>
          </table>

          <p style="margin:0;font-size:13px;color:#475569;line-height:1.6">
            Vous constatez quelque chose à ajuster ? Répondez à cet email, je m'en occupe rapidement.
          </p>
        </td></tr>
      </table>

      <!-- FOOTER CARD -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:24px 48px;border-top:1px solid rgba(112,178,222,0.1)">
          <p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#cbd5e1">Mohamed Diop</p>
          <p style="margin:0;font-size:12px;color:#475569">
            Fondateur &middot; <a href="https://akilai.fr" style="color:#70B2DE;text-decoration:none">AkilAI</a>
          </p>
        </td></tr>
      </table>

    </td></tr><!-- /CARD -->

    <!-- FOOTER EMAIL -->
    <tr><td align="center" style="padding-top:32px">
      <p style="margin:0;font-size:11px;color:#334155;line-height:1.6">
        AkilAI · Toulouse, France<br>
        <a href="https://akilai.fr" style="color:#475569;text-decoration:none">akilai.fr</a>
      </p>
    </td></tr>

  </table>
</td></tr>
</table>
</body>
</html>`;
}

async function sendAssistantReadyEmail({ clientName, clientEmail, assistantType, vapiPhoneNumber, whatsappNumber }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY non configurée");
  if (!clientEmail) throw new Error("clientEmail manquant");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from:    FROM,
      to:      [clientEmail],
      bcc:     [BCC],
      subject: "Votre assistant est configuré — testez-le maintenant",
      html:    buildHtml({ clientName, assistantType, vapiPhoneNumber, whatsappNumber }),
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Resend ${res.status}: ${t}`);
  }
  return res.json();
}

exports.sendAssistantReadyEmail = sendAssistantReadyEmail;

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("POST requis", 405);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch(e) { return err("JSON invalide", 400); }

  const { clientName, clientEmail, assistantType, vapiPhoneNumber, whatsappNumber } = body;
  if (!clientEmail) return err("clientEmail obligatoire", 400);

  try {
    const result = await sendAssistantReadyEmail({ clientName, clientEmail, assistantType, vapiPhoneNumber, whatsappNumber });
    console.log("[send-assistant-ready-email] Envoyé à", clientEmail, "| id:", result.id);
    return ok({ ok: true, email_id: result.id });
  } catch(e) {
    console.error("[send-assistant-ready-email] Erreur:", e.message);
    return err(e.message);
  }
};
