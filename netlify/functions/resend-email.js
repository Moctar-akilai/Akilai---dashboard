/**
 * resend-email.js — Helper d'envoi d'email via l'API Resend.
 *
 * Env vars requises :
 *   RESEND_API_KEY    — clé API Resend (ex: re_xxxxxxxxxxxx)
 *   RESEND_FROM       — adresse expéditeur vérifiée sur Resend (ex: noreply@votredomaine.com)
 *
 * Usage :
 *   const { sendEmail } = require("./resend-email");
 *   await sendEmail({ to, subject, html });
 */

async function sendEmail({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from   = process.env.RESEND_FROM || "AkilAI <noreply@akilai.fr>";

  if (!apiKey) {
    console.warn("[resend-email] RESEND_API_KEY non configuré — email ignoré");
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html, text }),
  });

  const d = await res.json();
  if (!res.ok) throw new Error(`Resend ${res.status}: ${d.message || JSON.stringify(d)}`);
  console.log("[resend-email] Envoyé:", d.id, "→", to);
  return d;
}

// ── Template confirmation RDV ─────────────────────────────────────────────────

function buildConfirmationEmail({ nomClient, prestationNom, dateStr, timeStr, nomSalon, adresseSalon, gestionUrl }) {
  const prenom = nomClient.split(" ")[0] || nomClient;

  const adresseHtml = adresseSalon
    ? `<tr><td style="padding:6px 0;color:#6b7280;font-size:14px">Adresse</td><td style="padding:6px 0;font-size:14px;font-weight:500">${esc(adresseSalon)}</td></tr>`
    : "";

  const gestionHtml = gestionUrl
    ? `<div style="margin-top:28px;padding:16px;background:#f5f3ff;border-radius:10px;text-align:center">
        <p style="margin:0 0 12px;font-size:14px;color:#4b5563">Besoin de modifier ou d'annuler votre RDV ?</p>
        <a href="${esc(gestionUrl)}" style="display:inline-block;padding:10px 22px;background:#6366f1;color:#ffffff;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">Gérer mon rendez-vous</a>
      </div>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">

        <!-- Logo -->
        <tr><td style="padding-bottom:24px;text-align:center">
          <span style="font-size:24px;font-weight:800;color:#6366f1;letter-spacing:-.5px">AkilAI</span>
        </td></tr>

        <!-- Card principale -->
        <tr><td style="background:#ffffff;border-radius:16px;padding:32px;box-shadow:0 2px 16px rgba(0,0,0,.08)">

          <p style="margin:0 0 6px;font-size:22px;font-weight:700;color:#111827">RDV confirmé ✅</p>
          <p style="margin:0 0 24px;font-size:15px;color:#6b7280">Bonjour ${esc(prenom)}, votre rendez-vous est enregistré.</p>

          <!-- Récapitulatif -->
          <table width="100%" cellpadding="0" cellspacing="0"
                 style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;border-spacing:0;margin-bottom:8px">
            <tr>
              <td style="padding:6px 0;color:#6b7280;font-size:14px;width:110px">Salon</td>
              <td style="padding:6px 0;font-size:14px;font-weight:600;color:#111827">${esc(nomSalon)}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#6b7280;font-size:14px">Prestation</td>
              <td style="padding:6px 0;font-size:14px;font-weight:500">${esc(prestationNom)}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#6b7280;font-size:14px">Date</td>
              <td style="padding:6px 0;font-size:14px;font-weight:500">${esc(dateStr)}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#6b7280;font-size:14px">Heure</td>
              <td style="padding:6px 0;font-size:15px;font-weight:700;color:#6366f1">${esc(timeStr)}</td>
            </tr>
            ${adresseHtml}
          </table>

          ${gestionHtml}

        </td></tr>

        <!-- Footer -->
        <tr><td style="padding-top:20px;text-align:center;font-size:12px;color:#9ca3af">
          Cet email a été envoyé automatiquement par AkilAI. Ne pas répondre à cet email.
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `Bonjour ${prenom},\n\nVotre RDV "${prestationNom}" le ${dateStr} à ${timeStr} chez ${nomSalon} est confirmé.\n${adresseSalon ? "Adresse : " + adresseSalon + "\n" : ""}${gestionUrl ? "\nAnnuler ou modifier : " + gestionUrl : ""}\n\nÀ bientôt !`;

  return { html, text };
}

// ── Template rappel J-1 ───────────────────────────────────────────────────────

function buildRappelEmail({ nomClient, prestationNom, timeStr, nomSalon, adresseSalon, gestionUrl }) {
  const prenom = nomClient.split(" ")[0] || nomClient;

  const adresseHtml = adresseSalon
    ? `<p style="margin:8px 0 0;font-size:14px;color:#6b7280">📍 ${esc(adresseSalon)}</p>`
    : "";

  const gestionHtml = gestionUrl
    ? `<p style="margin:20px 0 0;font-size:14px;color:#6b7280">Besoin de modifier ou d'annuler ? <a href="${esc(gestionUrl)}" style="color:#6366f1;font-weight:600">Gérer mon rendez-vous</a></p>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
        <tr><td style="padding-bottom:24px;text-align:center">
          <span style="font-size:24px;font-weight:800;color:#6366f1;letter-spacing:-.5px">AkilAI</span>
        </td></tr>
        <tr><td style="background:#ffffff;border-radius:16px;padding:32px;box-shadow:0 2px 16px rgba(0,0,0,.08)">
          <p style="margin:0 0 6px;font-size:22px;font-weight:700;color:#111827">Rappel — demain à ${esc(timeStr)} 🗓️</p>
          <p style="margin:0 0 20px;font-size:15px;color:#6b7280">Bonjour ${esc(prenom)}, on vous rappelle votre RDV de demain.</p>
          <p style="margin:0;font-size:16px;font-weight:600;color:#111827">${esc(prestationNom)}</p>
          <p style="margin:4px 0 0;font-size:14px;color:#6b7280">chez <strong>${esc(nomSalon)}</strong></p>
          ${adresseHtml}
          ${gestionHtml}
        </td></tr>
        <tr><td style="padding-top:20px;text-align:center;font-size:12px;color:#9ca3af">AkilAI — Cet email est un rappel automatique.</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `Bonjour ${prenom}, rappel de votre RDV "${prestationNom}" demain à ${timeStr} chez ${nomSalon}.${adresseSalon ? "\nAdresse : " + adresseSalon : ""}${gestionUrl ? "\nGérer : " + gestionUrl : ""}`;
  return { html, text };
}

// ── Template feedback post-RDV ────────────────────────────────────────────────

function buildFeedbackEmail({ nomClient, nomSalon, lienAvis }) {
  const prenom = nomClient.split(" ")[0] || nomClient;

  const avisHtml = lienAvis
    ? `<div style="margin-top:24px;text-align:center">
        <a href="${esc(lienAvis)}" style="display:inline-block;padding:12px 26px;background:#6366f1;color:#ffffff;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600">⭐ Laisser un avis Google</a>
      </div>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
        <tr><td style="padding-bottom:24px;text-align:center">
          <span style="font-size:24px;font-weight:800;color:#6366f1;letter-spacing:-.5px">AkilAI</span>
        </td></tr>
        <tr><td style="background:#ffffff;border-radius:16px;padding:32px;box-shadow:0 2px 16px rgba(0,0,0,.08)">
          <p style="margin:0 0 6px;font-size:22px;font-weight:700;color:#111827">Comment s'est passé votre visite ? 💬</p>
          <p style="margin:0 0 20px;font-size:15px;color:#6b7280">
            Bonjour ${esc(prenom)}, nous espérons que votre RDV chez <strong>${esc(nomSalon)}</strong> s'est bien passé.
          </p>
          <p style="margin:0;font-size:14px;color:#4b5563">Si vous avez apprécié notre service, un avis Google nous aiderait beaucoup à nous faire connaître. Cela ne prend que 30 secondes !</p>
          ${avisHtml}
        </td></tr>
        <tr><td style="padding-top:20px;text-align:center;font-size:12px;color:#9ca3af">AkilAI — Merci de votre confiance !</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `Bonjour ${prenom}, merci de votre visite chez ${nomSalon} !${lienAvis ? "\n\nVotre avis nous aiderait : " + lienAvis : ""}`;
  return { html, text };
}

function esc(str) {
  return String(str || "").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

module.exports = { sendEmail, buildConfirmationEmail, buildRappelEmail, buildFeedbackEmail };
