const { ok, err, preflight } = require("./config");

const FROM         = "Mohamed d'AkilAI <mohamed.diop@akilai.fr>";
const BCC          = "mohamed.diop@akilai.fr";
const DASHBOARD_URL = "https://portal-akilai.netlify.app";

function buildHtml({ clientName, dashboardUrl }) {
  const prenom = (clientName || "").split(" ")[0] || "là";
  const cta    = dashboardUrl || DASHBOARD_URL;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bienvenue chez AkilAI</title>
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
          <h1 style="margin:0;font-size:28px;font-weight:700;color:#ffffff;line-height:1.3">Votre espace est prêt 🎉</h1>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:40px 48px">
          <p style="margin:0 0 24px;font-size:16px;color:#e5e7eb;line-height:1.6">Bonjour ${prenom},</p>
          <p style="margin:0 0 32px;font-size:16px;color:#9ca3af;line-height:1.7">
            Votre espace AkilAI est prêt. Voici vos accès :
          </p>

          <!-- CTA -->
          <div style="text-align:center;margin:0 0 40px">
            <a href="${cta}" style="display:inline-block;background:#70B2DE;color:#030305;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;letter-spacing:0.3px">
              Accéder à mon espace
            </a>
          </div>

          <!-- Bullets -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 40px">
            <tr>
              <td style="padding:14px 16px;background:rgba(112,178,222,0.06);border:1px solid rgba(112,178,222,0.12);border-radius:8px;margin-bottom:10px;display:block">
                <span style="color:#70B2DE;font-weight:600;font-size:14px">⚙️ &nbsp;Configurez votre assistant</span>
                <p style="margin:4px 0 0;color:#9ca3af;font-size:13px;line-height:1.5">Personnalisez la voix, le ton et le script selon votre activité.</p>
              </td>
            </tr>
            <tr><td style="height:10px"></td></tr>
            <tr>
              <td style="padding:14px 16px;background:rgba(112,178,222,0.06);border:1px solid rgba(112,178,222,0.12);border-radius:8px">
                <span style="color:#70B2DE;font-weight:600;font-size:14px">🎙️ &nbsp;Testez-le en temps réel</span>
                <p style="margin:4px 0 0;color:#9ca3af;font-size:13px;line-height:1.5">Appelez ou envoyez un message pour entendre votre assistant en action.</p>
              </td>
            </tr>
            <tr><td style="height:10px"></td></tr>
            <tr>
              <td style="padding:14px 16px;background:rgba(112,178,222,0.06);border:1px solid rgba(112,178,222,0.12);border-radius:8px">
                <span style="color:#70B2DE;font-weight:600;font-size:14px">📊 &nbsp;Suivez vos performances</span>
                <p style="margin:4px 0 0;color:#9ca3af;font-size:13px;line-height:1.5">Consultez l'historique des appels, les transcriptions et les KPIs.</p>
              </td>
            </tr>
          </table>

          <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.6">
            Une question ? Répondez à cet email, je lis tout personnellement.
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

async function sendOnboardingEmail({ clientName, clientEmail, dashboardUrl }) {
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
      subject: "Bienvenue chez AkilAI — votre espace est prêt",
      html:    buildHtml({ clientName, dashboardUrl }),
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Resend ${res.status}: ${t}`);
  }
  return res.json();
}

exports.sendOnboardingEmail = sendOnboardingEmail;

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("POST requis", 405);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch(e) { return err("JSON invalide", 400); }

  const { clientName, clientEmail, dashboardUrl } = body;
  if (!clientEmail) return err("clientEmail obligatoire", 400);

  try {
    const result = await sendOnboardingEmail({ clientName, clientEmail, dashboardUrl });
    console.log("[send-onboarding-email] Envoyé à", clientEmail, "| id:", result.id);
    return ok({ ok: true, email_id: result.id });
  } catch(e) {
    console.error("[send-onboarding-email] Erreur:", e.message);
    return err(e.message);
  }
};
