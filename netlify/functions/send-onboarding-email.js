const { ok, err, preflight } = require("./config");

const FROM          = "Mohamed d'AkilAI <mohamed.diop@akilai.fr>";
const BCC           = "mohamed.diop@akilai.fr";
const DASHBOARD_URL = "https://portal-akilai.netlify.app";
const LOGO_URL      = "https://portal-akilai.netlify.app/logo.png";

/* Numbered badge — rendu parfait dans tous les clients email y compris Outlook */
function numBadge(n) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="display:inline-table">
    <tr><td width="32" height="32" bgcolor="#162035" align="center" valign="middle"
        style="background:#162035;color:#70B2DE;font-size:12px;font-weight:700;
               font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
               border:1px solid rgba(112,178,222,0.25)">
      0${n}
    </td></tr>
  </table>`;
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
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#07070f" style="background:#07070f">
<tr><td align="center" style="padding:48px 16px">

  <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px">

    <!-- LOGO -->
    <tr><td align="center" style="padding-bottom:32px">
      <a href="https://akilai.fr" style="text-decoration:none;display:block">
        <img src="${LOGO_URL}" alt="AkilAI" width="180" height="auto"
             style="display:block;border:0;max-width:180px;height:auto" />
      </a>
    </td></tr>

    <!-- CARD -->
    <tr><td bgcolor="#0e0e1a" style="background:#0e0e1a;border-radius:16px;border:1px solid rgba(112,178,222,0.18)">

      <!-- ACCENT BAR top -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td width="33%" height="4" bgcolor="#3b82f6" style="background:#3b82f6;font-size:0;line-height:0">&nbsp;</td>
          <td width="34%" height="4" bgcolor="#70B2DE" style="background:#70B2DE;font-size:0;line-height:0">&nbsp;</td>
          <td width="33%" height="4" bgcolor="#a855f7" style="background:#a855f7;font-size:0;line-height:0">&nbsp;</td>
        </tr>
      </table>

      <!-- BODY -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:48px 48px 16px">

          <h1 style="margin:0 0 8px;font-size:26px;font-weight:700;color:#ffffff;line-height:1.3">
            Votre espace est pret
          </h1>

          <p style="margin:0 0 32px;font-size:15px;color:#94a3b8;line-height:1.7">
            Bonjour ${prenom},<br><br>
            Bienvenue chez AkilAI. Votre espace est configure et pret a etre utilise.
          </p>

          <!-- CTA -->
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 40px">
            <tr><td bgcolor="#70B2DE" style="background:#70B2DE;border-radius:10px">
              <a href="${cta}"
                 style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;
                        color:#070714;text-decoration:none;letter-spacing:0.2px">
                Acceder a mon espace &rarr;
              </a>
            </td></tr>
          </table>

          <!-- DIVIDER -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px">
            <tr><td height="1" bgcolor="rgba(112,178,222,0.1)" style="background:rgba(112,178,222,0.1);font-size:0;line-height:0">&nbsp;</td></tr>
          </table>

          <p style="margin:0 0 24px;font-size:11px;font-weight:600;color:#475569;letter-spacing:1.5px;text-transform:uppercase">
            Ce que vous pouvez faire maintenant
          </p>

          <!-- STEP 1 -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px">
            <tr>
              <td width="36" valign="top" style="padding-top:2px">
                ${numBadge(1)}
              </td>
              <td style="padding-left:16px;border-left:2px solid #70B2DE">
                <p style="margin:0 0 3px;font-size:14px;font-weight:600;color:#e2e8f0;padding-left:12px">Configurez votre assistant</p>
                <p style="margin:0;font-size:13px;color:#64748b;line-height:1.5;padding-left:12px">Personnalisez la voix, le ton et le script selon votre activite.</p>
              </td>
            </tr>
          </table>

          <!-- STEP 2 -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px">
            <tr>
              <td width="36" valign="top" style="padding-top:2px">
                ${numBadge(2)}
              </td>
              <td style="padding-left:16px;border-left:2px solid #70B2DE">
                <p style="margin:0 0 3px;font-size:14px;font-weight:600;color:#e2e8f0;padding-left:12px">Testez-le en temps reel</p>
                <p style="margin:0;font-size:13px;color:#64748b;line-height:1.5;padding-left:12px">Appelez ou envoyez un message pour entendre votre assistant en action.</p>
              </td>
            </tr>
          </table>

          <!-- STEP 3 -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:40px">
            <tr>
              <td width="36" valign="top" style="padding-top:2px">
                ${numBadge(3)}
              </td>
              <td style="padding-left:16px;border-left:2px solid #70B2DE">
                <p style="margin:0 0 3px;font-size:14px;font-weight:600;color:#e2e8f0;padding-left:12px">Suivez vos performances</p>
                <p style="margin:0;font-size:13px;color:#64748b;line-height:1.5;padding-left:12px">Consultez l'historique des appels, les transcriptions et les KPIs.</p>
              </td>
            </tr>
          </table>

          <p style="margin:0;font-size:13px;color:#475569;line-height:1.6">
            Une question ? Repondez directement a cet email, je lis tout personnellement.
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

    <!-- FOOTER -->
    <tr><td align="center" style="padding-top:32px">
      <p style="margin:0;font-size:11px;color:#334155;line-height:1.6">
        AkilAI &middot; Toulouse, France &middot;
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
  if (!apiKey) throw new Error("RESEND_API_KEY non configuree");
  if (!clientEmail) throw new Error("clientEmail manquant");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from:    FROM,
      to:      [clientEmail],
      bcc:     [BCC],
      subject: "Bienvenue chez AkilAI — votre espace est pret",
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
    console.log("[send-onboarding-email] Envoye a", clientEmail, "| id:", result.id);
    return ok({ ok: true, email_id: result.id });
  } catch(e) {
    console.error("[send-onboarding-email] Erreur:", e.message);
    return err(e.message);
  }
};
