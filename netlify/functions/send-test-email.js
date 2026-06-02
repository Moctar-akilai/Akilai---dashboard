const { ok, err, preflight, corsHeaders } = require("./config");
const { verifyAdminToken, unauthorized } = require("./admin-utils");
const templates = require("./email-templates");

const DEMO_VARS = {
  '{Nom}': 'Mohamed',
  '{Plan}': 'Business Vocal',
  '{Montant}': '197',
  '{DateEcheance}': '15/06/2026',
  '{LienPaiement}': 'https://akilai.fr/paiement',
  '{DateInscription}': new Date().toLocaleDateString('fr-FR'),
  '{Email}': 'demo@exemple.fr',
  '{DateSuspension}': new Date().toLocaleDateString('fr-FR'),
  '{DateProchainPaiement}': '01/07/2026',
  '{NumFacture}': 'AK-202606-1234',
  '{Periode}': 'Juin 2026',
  '{MontantTTC}': '197',
  '{NumTicket}': 'TK-001',
  '{Sujet}': 'Problème de connexion',
  '{DateResolution}': new Date().toLocaleDateString('fr-FR'),
  '{ReponseAkilai}': 'Nous avons résolu le problème. Votre accès est rétabli.',
};

function replaceDemoVars(text) {
  return Object.entries(DEMO_VARS).reduce((s, [k, v]) => s.replaceAll(k, v), text || '');
}

const DEMO_PARAMS = {
  nom: 'Mohamed', plan: 'Business Vocal', montant: '197',
  dateEcheance: '15/06/2026', lienPaiement: 'https://akilai.fr/paiement',
  dateInscription: new Date().toLocaleDateString('fr-FR'),
  email: 'demo@exemple.fr',
  dateSuspension: new Date().toLocaleDateString('fr-FR'),
  dateProchainPaiement: '01/07/2026',
  numFacture: 'AK-202606-1234', periode: 'Juin 2026', montantTTC: '197',
  numTicket: 'TK-001', sujet: 'Problème de connexion',
  dateResolution: new Date().toLocaleDateString('fr-FR'),
  reponseAkilai: 'Nous avons résolu le problème. Votre accès est rétabli.',
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (!verifyAdminToken(event)) return unauthorized();
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { template, sujet, corps } = JSON.parse(event.body || "{}");
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";
    const RESEND_API_KEY = process.env.RESEND_API_KEY || "";

    if (!RESEND_API_KEY) return err("RESEND_API_KEY not configured");
    if (!ADMIN_EMAIL) return err("ADMIN_EMAIL not configured");

    const subject = `[TEST] ${replaceDemoVars(sujet) || `Email test — ${template}`}`;
    const corpsResolved = replaceDemoVars(corps);

    const tplFn = templates[template] || templates.bienvenue;
    const tplResult = tplFn({ ...DEMO_PARAMS, corps: corpsResolved || undefined });

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: "AkilAI <noreply@akilai.fr>",
        to: ADMIN_EMAIL,
        subject,
        html: tplResult.html,
      }),
    });
    const data = await res.json();
    console.log('[email] send-test-email statut:', data.id || data.error || data.message);
    if (!res.ok) return err(data.message || "Resend error");
    return ok({ success: true, messageId: data.id });
  } catch (e) {
    return err(e.message);
  }
};
