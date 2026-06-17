const { ok, err, preflight } = require("./config");

const FROM          = "Mohamed d'AkilAI <mohamed.diop@akilai.fr>";
const BCC           = "mohamed.diop@akilai.fr";
const DASHBOARD_URL = "https://portal-akilai.netlify.app";
const LOGO_URL      = "https://portal-akilai.netlify.app/logo.png";

function buildHtml({ clientName, assistantType, vapiPhoneNumber, whatsappNumber }) {
  const prenom  = (clientName || "").split(" ")[0] || "là";
  const isVocal = assistantType === "Vocal" || assistantType === "Combo";
  const isWA    = assistantType === "WhatsApp" || assistantType === "Combo";

  const testBlocks = [];

  if (isVocal && vapiPhoneNumber) {
    testBlocks.push(`
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px">
        <tr>
          <td width="44" valign="middle">
            <div style="width:36px;height:36px;border-radius:8px;background:rgba(112,178,222,0.12);text-align:center;line-height:36px;font-size:18px">📲</div>
          </td>
          <td style="padding-left:14px">
            <p style="margin:0 0 2px;font-size:13px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px">Test vocal</p>
            <p style="margin:0;font-size:16px;font-weight:700;color:#70B2DE">${vapiPhoneNumber}</p>
            <p style="margin:2px 0 0;font-size:12px;color:#475569">Appelez ce numéro pour tester votre assistant</p>
          </td>
        </tr>
      </table>`);
  }

  if (isWA && whatsappNumber) {
    testBlocks.push(`
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px">
        <tr>
          <td width="44" valign="middle">
            <div style="width:36px;height:36px;border-radius:8px;background:rgba(37,211,102,0.12);text-align:center;line-height:36px;font-size:18px">💬</div>
          </td>
          <td style="padding-left:14px">
            <p style="margin:0 0 2px;font-size:13px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px">Test WhatsApp</p>
            <p style="margin:0;font-size:16px;font-weight:700;color:#25d366">${whatsappNumber}</p>
            <p style="margin:2px 0 0;font-size:12px;color:#475569">Envoyez un message WhatsApp à ce numéro</p>
          </td>
        </tr>
      </table>`);
  }

  const testSection = testBlocks.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
          style="background:rgba(255,255,255,0.03);border:1px solid rgba(112,178,222,0.15);border-radius:12px;margin:0 0 36px">
         <tr><td style="padding:24px 24px 12px">
           <p style="margin:0 0 20px;font-size:13px;font-weight:600;color:#64748b;letter-spacing:1px;text-transform:uppercase">
             Vos accès de test
           </p>
           ${testBlocks.join("")}
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

          <!-- Checkmark badge -->
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
            <tr><td style="background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.25);border-radius:100px;padding:6px 14px">
              <span style="font-size:12px;font-weight:600;color:#22c55e;letter-spacing:0.5px">✓ &nbsp;CONFIGURÉ</span>
            </td></tr>
          </table>

          <h1 style="margin:0 0 16px;font-size:26px;font-weight:700;color:#ffffff;line-height:1.3">
            Votre assistant est prêt ⚡
          </h1>
          <p style="margin:0 0 36px;font-size:15px;color:#94a3b8;line-height:1.7">
            Bonjour ${prenom},<br><br>
            Votre assistant virtuel est configuré et opérationnel. Vous pouvez dès maintenant le tester.
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
