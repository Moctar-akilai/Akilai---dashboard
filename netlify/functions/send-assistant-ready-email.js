const { ok, err, preflight } = require("./config");

const FROM          = "Mohamed d'AkilAI <mohamed.diop@akilai.fr>";
const BCC           = "mohamed.diop@akilai.fr";
const DASHBOARD_URL = "https://portal-akilai.netlify.app";

function buildHtml({ clientName, assistantType, vapiPhoneNumber, whatsappNumber }) {
  const prenom  = (clientName || "").split(" ")[0] || "là";
  const isVocal = assistantType === "Vocal" || assistantType === "Combo";
  const isWA    = assistantType === "WhatsApp" || assistantType === "Combo";

  const testBlocks = [];
  if (isVocal && vapiPhoneNumber) {
    testBlocks.push(`
      <tr>
        <td style="padding:16px 20px;background:rgba(112,178,222,0.06);border:1px solid rgba(112,178,222,0.15);border-radius:8px">
          <p style="margin:0 0 6px;font-size:13px;color:#9ca3af;font-weight:500">📞 &nbsp;TEST VOCAL</p>
          <p style="margin:0;font-size:15px;color:#e5e7eb">Appelez ce numéro pour tester : <strong style="color:#70B2DE">${vapiPhoneNumber}</strong></p>
        </td>
      </tr>`);
  }
  if (isWA && whatsappNumber) {
    testBlocks.push(`
      <tr>
        <td style="padding:16px 20px;background:rgba(112,178,222,0.06);border:1px solid rgba(112,178,222,0.15);border-radius:8px">
          <p style="margin:0 0 6px;font-size:13px;color:#9ca3af;font-weight:500">💬 &nbsp;TEST WHATSAPP</p>
          <p style="margin:0;font-size:15px;color:#e5e7eb">Envoyez un message WhatsApp à : <strong style="color:#70B2DE">${whatsappNumber}</strong></p>
        </td>
      </tr>`);
  }

  const testSection = testBlocks.length
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 40px;border-spacing:0 10px">
        ${testBlocks.join('<tr><td style="height:10px"></td></tr>')}
       </table>`
    : `<p style="margin:0 0 40px;font-size:14px;color:#9ca3af">Connectez-vous à votre espace pour retrouver vos informations de test.</p>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Votre assistant est configuré</title>
</head>
<body style="margin:0;padding:0;background:#030305;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#ffffff">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#030305;padding:40px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#0d0d14;border-radius:12px;overflow:hidden;border:1px solid rgba(112,178,222,0.2)">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#0d0d14 0%,#111827 100%);padding:40px 48px 32px;text-align:center;border-bottom:1px solid rgba(112,178,222,0.15)">
          <div style="display:inline-block;background:rgba(112,178,222,0.1);border:1px solid rgba(112,178,222,0.3);border-radius:8px;padding:8px 20px;margin-bottom:24px">
            <span style="color:#70B2DE;font-size:14px;font-weight:600;letter-spacing:2px">AKILAI</span>
          </div>
          <h1 style="margin:0;font-size:28px;font-weight:700;color:#ffffff;line-height:1.3">Votre assistant est configuré ✅</h1>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:40px 48px">
          <p style="margin:0 0 24px;font-size:16px;color:#e5e7eb;line-height:1.6">Bonjour ${prenom},</p>
          <p style="margin:0 0 32px;font-size:16px;color:#9ca3af;line-height:1.7">
            Votre assistant virtuel est prêt. Testez-le maintenant&nbsp;:
          </p>

          ${testSection}

          <!-- CTA -->
          <div style="text-align:center;margin:0 0 40px">
            <a href="${DASHBOARD_URL}" style="display:inline-block;background:#70B2DE;color:#030305;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;letter-spacing:0.3px">
              Accéder à mon dashboard
            </a>
          </div>

          <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.6">
            Vous constatez quelque chose à ajuster ? Répondez à cet email, je m'en occupe rapidement.
          </p>
        </td></tr>

        <!-- Footer -->
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
