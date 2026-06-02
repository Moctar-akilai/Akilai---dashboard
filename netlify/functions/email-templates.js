const YEAR = new Date().getFullYear();

function renderCorps(text) {
  return text.split('\n').filter(l => l.trim()).map(l => TEXT(l)).join('');
}

const BASE = (headerBg, headerTitle, headerSub, body) => `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${headerTitle}</title>
</head>
<body style="margin:0;padding:0;background-color:#0f0f0f;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f;padding:40px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#1a1a1a;border-radius:12px;overflow:hidden;border:1px solid #2a2a2a;">
      <!-- Logo header -->
      <tr><td style="background-color:#0f0f0f;text-align:center;padding:32px 40px 24px 40px;">
        <img src="https://portal-akilai.netlify.app/logo.png" alt="AkilAI" width="260" style="display:inline-block;max-width:260px;height:auto;"/>
      </td></tr>
      <!-- Colour band -->
      <tr><td style="background-color:${headerBg};text-align:center;padding:16px 40px;font-size:16px;font-weight:600;color:#ffffff;letter-spacing:0.5px;">
        ${headerSub}
      </td></tr>
      <!-- Body -->
      <tr><td style="padding:40px;">
        ${body}
      </td></tr>
      <!-- Footer -->
      <tr><td style="background:#111111;padding:24px 40px;text-align:center;border-top:1px solid #2a2a2a;">
        <p style="color:#a0a0a0;font-size:12px;margin:0 0 6px;">© ${YEAR} AkilAI — Tous droits réservés</p>
        <p style="color:#a0a0a0;font-size:12px;margin:0 0 6px;">akilai.fr | bonjour@akilai.fr</p>
        <p style="color:#555555;font-size:11px;margin:0;">Vous recevez cet email car vous êtes client AkilAI</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

const INFO_BLOCK = (rows, borderColor = '#70B2DE', bgColor = '#252525') =>
  `<table width="100%" cellpadding="0" cellspacing="0" style="background:${bgColor};border-left:4px solid ${borderColor};border-radius:0 8px 8px 0;padding:16px 20px;margin:20px 0;">
    ${rows.map(([label, value]) =>
      `<tr><td style="color:#a0a0a0;font-size:13px;padding:4px 0;">${label}</td>
           <td style="color:#ffffff;font-size:13px;font-weight:600;padding:4px 0;text-align:right;">${value}</td></tr>`
    ).join('')}
  </table>`;

const CTA = (text, url, bg = '#70B2DE') =>
  `<table cellpadding="0" cellspacing="0" style="margin:28px auto;">
    <tr><td style="background:${bg};border-radius:8px;padding:14px 32px;text-align:center;">
      <a href="${url}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">${text}</a>
    </td></tr>
  </table>`;

const GREETING = (nom) =>
  `<p style="color:#ffffff;font-size:16px;font-weight:600;margin:0 0 16px;">Bonjour ${nom},</p>`;

const TEXT = (content, muted = false) =>
  `<p style="color:${muted ? '#a0a0a0' : '#e0e0e0'};font-size:15px;line-height:1.7;margin:0 0 14px;">${content}</p>`;

const DIVIDER = `<hr style="border:none;border-top:1px solid #2a2a2a;margin:24px 0;"/>`;

const SIGNATURE = `<p style="color:#a0a0a0;font-size:14px;line-height:1.6;margin:20px 0 0;">Cordialement,<br/><strong style="color:#70B2DE;">L'équipe AkilAI</strong></p>`;

// ─── 1. Bienvenue ────────────────────────────────────────────────────────────
function bienvenue({ nom, plan, dateInscription, email, corps, dashboardUrl = 'https://portal-akilai.netlify.app' }) {
  const mainText = corps ? renderCorps(corps)
    : TEXT('Votre compte AkilAI est activé et prêt à l\'emploi. Nous sommes ravis de vous accueillir !')
    + TEXT('Accédez à votre dashboard pour configurer vos automatisations et paramétrer votre assistant vocal.')
    + TEXT('Une question ? Notre équipe est disponible via le support de votre dashboard.', true);
  const body = `
    ${GREETING(nom)}
    ${mainText}
    ${INFO_BLOCK([
      ['Plan souscrit', plan || '—'],
      ["Date d'activation", dateInscription || new Date().toLocaleDateString('fr-FR')],
      ['Email de connexion', email || '—'],
    ])}
    ${CTA('Accéder à mon dashboard', dashboardUrl)}
    ${DIVIDER}
    ${SIGNATURE}`;
  return {
    subject: `Bienvenue chez AkilAI, ${nom} 🎉`,
    html: BASE('#70B2DE', 'Bienvenue', 'Bienvenue dans votre espace AkilAI', body),
  };
}

// ─── 2. Relance J-7 ──────────────────────────────────────────────────────────
function relanceJ7({ nom, plan, montant, dateEcheance, lienPaiement, corps }) {
  const mainText = corps ? renderCorps(corps)
    : TEXT('Pour continuer à bénéficier de vos automatisations sans interruption, renouvelez votre abonnement avant la date d\'échéance.');
  const body = `
    ${GREETING(nom)}
    <div style="text-align:center;margin:16px 0 24px;">
      <div style="display:inline-block;background:rgba(245,158,11,0.15);border:2px solid #f59e0b;border-radius:12px;padding:12px 24px;">
        <span style="color:#f59e0b;font-size:36px;font-weight:700;">7</span>
        <span style="color:#f59e0b;font-size:16px;font-weight:600;margin-left:6px;">jours restants</span>
      </div>
    </div>
    ${mainText}
    ${INFO_BLOCK([
      ['Plan', plan || '—'],
      ['Montant', `${montant || '—'} €/mois`],
      ["Date d'échéance", dateEcheance || '—'],
    ], '#f59e0b', '#252515')}
    ${lienPaiement ? CTA('Renouveler mon abonnement', lienPaiement, '#f59e0b') : ''}
    ${DIVIDER}
    ${TEXT('Besoin d\'aide ? Contactez-nous à <a href="mailto:bonjour@akilai.fr" style="color:#70B2DE;">bonjour@akilai.fr</a>', true)}
    ${SIGNATURE}`;
  return {
    subject: `Votre abonnement AkilAI expire dans 7 jours`,
    html: BASE('#f59e0b', 'Rappel de renouvellement', 'Rappel de renouvellement', body),
  };
}

// ─── 3. Relance J-3 ──────────────────────────────────────────────────────────
function relanceJ3({ nom, plan, montant, dateEcheance, lienPaiement, corps }) {
  const mainText = corps ? renderCorps(corps)
    : TEXT('Sans renouvellement d\'ici le <strong style="color:#ef4444;">' + (dateEcheance || '—') + '</strong>, vos automatisations seront automatiquement suspendues.');
  const body = `
    ${GREETING(nom)}
    <div style="text-align:center;margin:16px 0 24px;">
      <div style="display:inline-block;background:rgba(239,68,68,0.15);border:2px solid #ef4444;border-radius:12px;padding:12px 24px;">
        <span style="color:#ef4444;font-size:36px;font-weight:700;">3</span>
        <span style="color:#ef4444;font-size:16px;font-weight:600;margin-left:6px;">jours restants</span>
      </div>
    </div>
    ${mainText}
    ${INFO_BLOCK([
      ['Plan', plan || '—'],
      ['Montant', `${montant || '—'} €/mois`],
      ["Date d'échéance", dateEcheance || '—'],
    ], '#ef4444', '#2a1515')}
    ${lienPaiement ? CTA('Renouveler maintenant', lienPaiement, '#ef4444') : ''}
    ${DIVIDER}
    ${TEXT('Besoin d\'aide ? Contactez-nous à <a href="mailto:bonjour@akilai.fr" style="color:#70B2DE;">bonjour@akilai.fr</a>', true)}
    ${SIGNATURE}`;
  return {
    subject: `⚠️ Plus que 3 jours pour renouveler votre abonnement AkilAI`,
    html: BASE('#ef4444', 'Renouvellement urgent', 'Renouvellement urgent', body),
  };
}

// ─── 4. Suspension ────────────────────────────────────────────────────────────
function suspension({ nom, plan, dateSuspension, lienPaiement, corps }) {
  const ds = dateSuspension || new Date().toLocaleDateString('fr-FR');
  const mainText = corps ? renderCorps(corps)
    : TEXT('Votre abonnement <strong>' + (plan || '—') + '</strong> n\'a pas été renouvelé. Pour réactiver votre compte et relancer vos automatisations, réglez votre situation dès maintenant.')
    + TEXT('Une fois le paiement effectué, votre compte sera réactivé automatiquement sous 24h.', true);
  const body = `
    ${GREETING(nom)}
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#2a1515;border-left:4px solid #ef4444;border-radius:0 8px 8px 0;padding:16px 20px;margin:0 0 20px;">
      <tr><td style="color:#fca5a5;font-size:14px;line-height:1.6;">
        Vos automatisations ont été <strong>désactivées le ${ds}</strong>.
      </td></tr>
    </table>
    ${mainText}
    ${lienPaiement ? CTA('Régulariser ma situation', lienPaiement, '#ef4444') : ''}
    ${DIVIDER}
    ${SIGNATURE}`;
  return {
    subject: `🔴 Votre compte AkilAI a été suspendu`,
    html: BASE('#ef4444', 'Compte suspendu', 'Compte suspendu', body),
  };
}

// ─── 5. Réactivation ─────────────────────────────────────────────────────────
function reactivation({ nom, plan, dateProchainPaiement, corps }) {
  const mainText = corps ? renderCorps(corps)
    : TEXT('Tout est de nouveau opérationnel. Retrouvez vos automatisations dans votre dashboard.')
    + TEXT('Merci de votre confiance.', true);
  const body = `
    ${GREETING(nom)}
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#152a1e;border-left:4px solid #22c55e;border-radius:0 8px 8px 0;padding:16px 20px;margin:0 0 20px;">
      <tr><td style="color:#86efac;font-size:14px;line-height:1.6;">
        ✅ Votre compte et vos automatisations ont été <strong>réactivés avec succès</strong>.
      </td></tr>
    </table>
    ${INFO_BLOCK([
      ['Plan', plan || '—'],
      ['Prochain paiement', dateProchainPaiement || '—'],
    ], '#22c55e', '#152a1e')}
    ${mainText}
    ${CTA('Accéder à mon dashboard', 'https://portal-akilai.netlify.app', '#22c55e')}
    ${DIVIDER}
    ${SIGNATURE}`;
  return {
    subject: `✅ Votre compte AkilAI est réactivé`,
    html: BASE('#16a34a', 'Compte réactivé', 'Compte réactivé', body),
  };
}

// ─── 6. Facture ───────────────────────────────────────────────────────────────
function facture({ nom, numFacture, periode, montantTTC, plan, corps }) {
  const mainText = corps ? renderCorps(corps)
    : TEXT('Veuillez trouver votre facture en pièce jointe à cet email.')
    + TEXT('Conservez ce document pour votre comptabilité.', true);
  const body = `
    ${GREETING(nom)}
    ${mainText}
    ${INFO_BLOCK([
      ['N° Facture', numFacture || '—'],
      ['Période', periode || '—'],
      ['Montant TTC', `${montantTTC || '—'} €`],
      ['Plan', plan || '—'],
    ])}
    ${DIVIDER}
    ${SIGNATURE}`;
  return {
    subject: `🧾 Votre facture AkilAI — ${periode || numFacture}`,
    html: BASE('#70B2DE', 'Votre facture', 'Votre facture est disponible', body),
  };
}

// ─── 7. Ticket résolu ─────────────────────────────────────────────────────────
function ticketResolu({ nom, numTicket, sujet, dateResolution, reponseAkilai, corps }) {
  const closingText = corps ? renderCorps(corps)
    : TEXT('Si ce problème persiste ou si vous avez d\'autres questions, ouvrez un nouveau ticket depuis votre dashboard.', true);
  const body = `
    ${GREETING(nom)}
    ${TEXT('Votre demande a été traitée par notre équipe.')}
    ${INFO_BLOCK([
      ['N° Ticket', `#${numTicket}`],
      ['Sujet', sujet || '—'],
      ['Date résolution', dateResolution || new Date().toLocaleDateString('fr-FR')],
    ])}
    ${TEXT('Voici notre réponse :')}
    <div style="background:#252525;border-radius:8px;padding:20px;margin:0 0 20px;color:#e0e0e0;font-size:14px;line-height:1.7;">
      ${reponseAkilai || '—'}
    </div>
    ${CTA('Accéder au support', 'https://portal-akilai.netlify.app')}
    ${closingText}
    ${DIVIDER}
    ${SIGNATURE}`;
  return {
    subject: `✅ Votre ticket #${numTicket} a été résolu`,
    html: BASE('#70B2DE', 'Ticket résolu', 'Ticket résolu', body),
  };
}

module.exports = { bienvenue, relanceJ7, relanceJ3, suspension, reactivation, facture, ticketResolu };
