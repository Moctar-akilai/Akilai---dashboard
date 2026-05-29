/**
 * Génère un email HTML aux couleurs AkilAI.
 * @param {{ sujet, titre, corps, cta_label?, cta_url?, badge?, badge_color? }} opts
 * @returns {{ subject: string, html: string, text: string }}
 */
function buildEmail({ sujet, titre, corps, cta_label, cta_url, badge, badge_color = "#70B2DE" }) {
  const badgeHtml = badge
    ? `<span style="display:inline-block;background:${badge_color};color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;margin-bottom:16px">${badge}</span>`
    : "";

  const ctaHtml = cta_label && cta_url
    ? `<div style="margin-top:24px">
         <a href="${cta_url}" style="display:inline-block;background:#70B2DE;color:#0a0a0a;font-weight:700;font-size:14px;padding:12px 24px;border-radius:10px;text-decoration:none">${cta_label}</a>
       </div>`
    : "";

  const corpsHtml = Array.isArray(corps)
    ? corps.map(line => `<p style="margin:0 0 10px;color:#cccccc;font-size:14px;line-height:1.6">${line}</p>`).join("")
    : `<p style="margin:0;color:#cccccc;font-size:14px;line-height:1.6">${corps}</p>`;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#111111;border:1px solid #222;border-radius:16px;overflow:hidden;max-width:560px;width:100%">

        <!-- Header -->
        <tr>
          <td style="background:#111111;padding:24px 32px;border-bottom:1px solid #222">
            <span style="font-size:20px;font-weight:800;color:#ffffff;letter-spacing:-0.5px">
              Akil<span style="color:#70B2DE">AI</span>
            </span>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px">
            ${badgeHtml}
            <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#ffffff;line-height:1.3">${titre}</h1>
            ${corpsHtml}
            ${ctaHtml}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #222;background:#0d0d0d">
            <p style="margin:0;font-size:12px;color:#555">
              AkilAI — Automatisation intelligente &nbsp;·&nbsp;
              <a href="https://akilai.fr" style="color:#70B2DE;text-decoration:none">akilai.fr</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  /* Version texte brut */
  const text = `${titre}\n\n${Array.isArray(corps) ? corps.join("\n") : corps}${cta_url ? `\n\n${cta_label} : ${cta_url}` : ""}\n\n— AkilAI`;

  return { subject: sujet, html, text };
}

/**
 * Envoie l'email via Resend.
 * @param {{ to, from?, ...emailOpts }} opts
 */
async function sendEmail({ to, from, ...emailOpts }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY manquant");

  const { subject, html, text } = buildEmail(emailOpts);

  const res = await fetch("https://api.resend.com/emails", {
    method:  "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from:    from || "AkilAI <noreply@akilai.fr>",
      to:      Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend ${res.status}: ${err}`);
  }

  return res.json();
}

module.exports = { buildEmail, sendEmail };
