const { ok, err, preflight } = require("./config");

const FROM          = "Mohamed d'AkilAI <mohamed.diop@akilai.fr>";
const BCC           = "mohamed.diop@akilai.fr";
const DASHBOARD_URL = "https://portal-akilai.netlify.app";
const LOGO_URL      = "https://portal-akilai.netlify.app/logo.png";

/* ── SVG icons ─────────────────────────────────────────────────── */
const ICON_SETTINGS = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#70B2DE" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;

const ICON_BOLT = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#70B2DE" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;

const ICON_CHART = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#70B2DE" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`;

const ICON_ROCKET = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>`;

function iconBox(svgContent, bg = "rgba(112,178,222,0.12)") {
  return `<div style="width:36px;height:36px;border-radius:10px;background:${bg};display:inline-flex;align-items:center;justify-content:center;vertical-align:middle">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:36px;height:36px"><tr><td align="center" valign="middle">${svgContent}</td></tr></table>
  </div>`;
}

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

          <!-- Title with SVG rocket -->
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:8px">
            <tr>
              <td valign="middle" style="padding-right:10px">${iconBox(ICON_ROCKET, "rgba(255,255,255,0.06)")}</td>
              <td valign="middle">
                <h1 style="margin:0;font-size:26px;font-weight:700;color:#ffffff;line-height:1.2">Votre espace est prêt</h1>
              </td>
            </tr>
          </table>

          <p style="margin:0 0 32px;font-size:15px;color:#94a3b8;line-height:1.7">
            Bonjour ${prenom},<br><br>
            Bienvenue chez AkilAI. Votre espace est configuré et prêt à être utilisé.
          </p>

          <!-- CTA -->
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 40px">
            <tr><td style="border-radius:10px;background:#70B2DE">
              <a href="${cta}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#070714;text-decoration:none;letter-spacing:0.2px;border-radius:10px">
                Accéder à mon espace →
              </a>
            </td></tr>
          </table>

          <!-- DIVIDER -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px">
            <tr><td style="height:1px;background:rgba(112,178,222,0.1)"></td></tr>
          </table>

          <p style="margin:0 0 20px;font-size:12px;font-weight:600;color:#475569;letter-spacing:1.2px;text-transform:uppercase">
            Ce que vous pouvez faire maintenant
          </p>

          <!-- STEP 1 -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px">
            <tr>
              <td width="44" valign="top" style="padding-top:2px">${iconBox(ICON_SETTINGS)}</td>
              <td style="padding-left:14px">
                <p style="margin:0 0 3px;font-size:14px;font-weight:600;color:#e2e8f0">Configurez votre assistant</p>
                <p style="margin:0;font-size:13px;color:#64748b;line-height:1.5">Personnalisez la voix, le ton et le script selon votre activité.</p>
              </td>
            </tr>
          </table>

          <!-- STEP 2 -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px">
            <tr>
              <td width="44" valign="top" style="padding-top:2px">${iconBox(ICON_BOLT)}</td>
              <td style="padding-left:14px">
                <p style="margin:0 0 3px;font-size:14px;font-weight:600;color:#e2e8f0">Testez-le en temps réel</p>
                <p style="margin:0;font-size:13px;color:#64748b;line-height:1.5">Appelez ou envoyez un message pour entendre votre assistant en action.</p>
              </td>
            </tr>
          </table>

          <!-- STEP 3 -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:40px">
            <tr>
              <td width="44" valign="top" style="padding-top:2px">${iconBox(ICON_CHART)}</td>
              <td style="padding-left:14px">
                <p style="margin:0 0 3px;font-size:14px;font-weight:600;color:#e2e8f0">Suivez vos performances</p>
                <p style="margin:0;font-size:13px;color:#64748b;line-height:1.5">Consultez l'historique des appels, les transcriptions et les KPIs.</p>
              </td>
            </tr>
          </table>

          <p style="margin:0;font-size:13px;color:#475569;line-height:1.6">
            Une question ? Répondez directement à cet email — je lis tout personnellement.
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
