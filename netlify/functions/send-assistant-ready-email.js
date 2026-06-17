const { ok, err, preflight } = require("./config");

const FROM          = "Mohamed d'AkilAI <mohamed.diop@akilai.fr>";
const BCC           = "mohamed.diop@akilai.fr";
const DASHBOARD_URL = "https://portal-akilai.netlify.app";
const LOGO_URL      = "https://portal-akilai.netlify.app/logo.png";

function buildHtml({ clientName, assistantType, vapiPhoneNumber, whatsappNumber }) {
  const prenom  = (clientName || "").split(" ")[0] || "la";
  const isVocal = assistantType === "Vocal" || assistantType === "Combo";
  const isWA    = assistantType === "WhatsApp" || assistantType === "Combo";

  const testRows = [];

  if (isVocal && vapiPhoneNumber) {
    testRows.push(`
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px">
        <tr>
          <td width="4" bgcolor="#70B2DE" style="background:#70B2DE;font-size:0;line-height:0">&nbsp;</td>
          <td style="padding:14px 16px;background:rgba(112,178,222,0.06)">
            <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#70B2DE;
                      text-transform:uppercase;letter-spacing:1.2px">TEST VOCAL</p>
            <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:0.5px">${vapiPhoneNumber}</p>
            <p style="margin:4px 0 0;font-size:12px;color:#64748b">Appelez ce numero pour tester votre assistant</p>
          </td>
        </tr>
      </table>`);
  }

  if (isWA && whatsappNumber) {
    testRows.push(`
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:4px">
        <tr>
          <td width="4" bgcolor="#25d366" style="background:#25d366;font-size:0;line-height:0">&nbsp;</td>
          <td style="padding:14px 16px;background:rgba(37,211,102,0.06)">
            <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#25d366;
                      text-transform:uppercase;letter-spacing:1.2px">TEST WHATSAPP</p>
            <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:0.5px">${whatsappNumber}</p>
            <p style="margin:4px 0 0;font-size:12px;color:#64748b">Envoyez un message a ce numero</p>
          </td>
        </tr>
      </table>`);
  }

  const testSection = testRows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
            style="margin:0 0 36px;border:1px solid rgba(112,178,222,0.15);border-radius:10px;overflow:hidden">
         <tr><td style="padding:20px 20px 4px">
           <p style="margin:0 0 16px;font-size:11px;font-weight:600;color:#475569;
                     letter-spacing:1.5px;text-transform:uppercase">Vos acces de test</p>
           ${testRows.join("")}
         </td></tr>
       </table>`
    : `<p style="margin:0 0 36px;font-size:14px;color:#64748b">
         Connectez-vous a votre espace pour retrouver vos informations de test.
       </p>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Votre assistant est configure</title>
</head>
<body style="margin:0;padding:0;background:#07070f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#07070f" style="background:#07070f">
<tr><td align="center" style="padding:48px 16px">

  <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px">

    <!-- LOGO -->
    <tr><td align="center" style="padding-bottom:32px">
      <a href="https://akilai.fr" style="text-decoration:none;display:block">
        <img src="${LOGO_URL}" alt="AkilAI" width="260" height="auto"
             style="display:block;border:0;max-width:260px;height:auto" />
      </a>
    </td></tr>

    <!-- CARD -->
    <tr><td bgcolor="#0e0e1a" style="background:#0e0e1a;border-radius:16px;border:1px solid rgba(112,178,222,0.18)">

      <!-- ACCENT BAR -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td width="33%" height="4" bgcolor="#3b82f6" style="background:#3b82f6;font-size:0;line-height:0">&nbsp;</td>
          <td width="34%" height="4" bgcolor="#70B2DE" style="background:#70B2DE;font-size:0;line-height:0">&nbsp;</td>
          <td width="33%" height="4" bgcolor="#a855f7" style="background:#a855f7;font-size:0;line-height:0">&nbsp;</td>
        </tr>
      </table>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:48px 48px 16px">

          <!-- Badge CONFIGURE -->
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
            <tr><td bgcolor="#0d2818"
                    style="background:#0d2818;border:1px solid rgba(34,197,94,0.3);
                           border-radius:100px;padding:6px 16px">
              <p style="margin:0;font-size:12px;font-weight:700;color:#22c55e;letter-spacing:1px">
                &#10003;&nbsp; CONFIGURE
              </p>
            </td></tr>
          </table>

          <h1 style="margin:0 0 16px;font-size:26px;font-weight:700;color:#ffffff;line-height:1.3">
            Votre assistant est pret
          </h1>

          <p style="margin:0 0 32px;font-size:15px;color:#94a3b8;line-height:1.7">
            Bonjour ${prenom},<br><br>
            Votre assistant virtuel est operationnel. Vous pouvez des maintenant le tester.
          </p>

          ${testSection}

          <!-- CTA -->
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 40px">
            <tr><td bgcolor="#70B2DE" style="background:#70B2DE;border-radius:10px">
              <a href="${DASHBOARD_URL}"
                 style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;
                        color:#070714;text-decoration:none;letter-spacing:0.2px">
                Acceder a mon dashboard &rarr;
              </a>
            </td></tr>
          </table>

          <p style="margin:0;font-size:13px;color:#475569;line-height:1.6">
            Vous constatez quelque chose a ajuster ? Repondez a cet email, je m'en occupe rapidement.
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

async function sendAssistantReadyEmail({ clientName, clientEmail, assistantType, vapiPhoneNumber, whatsappNumber }) {
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
      subject: "Votre assistant est configure — testez-le maintenant",
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
    console.log("[send-assistant-ready-email] Envoye a", clientEmail, "| id:", result.id);
    return ok({ ok: true, email_id: result.id });
  } catch(e) {
    console.error("[send-assistant-ready-email] Erreur:", e.message);
    return err(e.message);
  }
};
