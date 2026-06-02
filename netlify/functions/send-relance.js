const { ok, err, preflight, corsHeaders } = require("./config");
const { verifyAdminToken, unauthorized } = require("./admin-utils");
const { relanceJ7, relanceJ3 } = require("./email-templates");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (!verifyAdminToken(event)) return unauthorized();
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { email, nom, dateEcheance, montant, lienPaiement, type } = JSON.parse(event.body || "{}");
    if (!email) return err("email is required");

    const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
    if (!RESEND_API_KEY) return err("RESEND_API_KEY not configured");

    const tpl = type === "J-3"
      ? relanceJ3({ nom, montant, dateEcheance, lienPaiement })
      : relanceJ7({ nom, montant, dateEcheance, lienPaiement });

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({ from: "AkilAI <noreply@akilai.fr>", to: email, subject: tpl.subject, html: tpl.html }),
    });

    const data = await res.json();
    console.log('[email] send-relance statut:', data.id || data.error || data.message);
    if (!res.ok) return err(data.message || "Resend error");

    return ok({ ok: true });
  } catch (e) {
    return err(e.message);
  }
};

    const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Rappel abonnement AkilAI</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:#0f172a;padding:32px 40px;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:24px;letter-spacing:1px;">AkilAI</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h2 style="color:#0f172a;margin:0 0 16px;">Rappel — Votre abonnement expire bientôt</h2>
              <p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 16px;">
                Bonjour <strong>${nom}</strong>,
              </p>
              <p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 16px;">
                Nous vous informons que votre abonnement AkilAI arrive à échéance le <strong>${dateEcheance}</strong>.
              </p>
              <p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 24px;">
                Montant à régler : <strong>${montant}</strong>
              </p>
              ${lienPaiement ? `
              <table cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
                <tr>
                  <td style="background:#6366f1;border-radius:6px;padding:14px 28px;">
                    <a href="${lienPaiement}" style="color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;">
                      Renouveler mon abonnement
                    </a>
                  </td>
                </tr>
              </table>
              ` : ""}
              <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 8px;">
                Si vous avez des questions, n'hésitez pas à nous contacter via votre espace client.
              </p>
              <p style="color:#374151;font-size:15px;line-height:1.6;margin:0;">
                Merci de votre confiance,<br/>
                <strong>L'équipe AkilAI</strong>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="color:#9ca3af;font-size:13px;margin:0;">
                © ${new Date().getFullYear()} AkilAI — Tous droits réservés
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "AkilAI <noreply@akilai.fr>",
        to: email,
        subject: "Rappel — Votre abonnement AkilAI expire bientôt",
        html,
      }),
    });

    const data = await res.json();
    console.log('[email] send-relance statut:', data.id || data.error || data.message);
    if (!res.ok) return err(data.message || "Resend error");

    return ok({ ok: true });
  } catch (e) {
    return err(e.message);
  }
};
