const { ok, err, preflight, corsHeaders } = require("./config");
const { verifyAdminToken, unauthorized } = require("./admin-utils");
const templates = require("./email-templates");

const DEMO_PARAMS = {
  nom: 'Mohamed',
  plan: 'Business Vocal',
  montant: '197',
  dateEcheance: '15/06/2026',
  lienPaiement: 'https://akilai.fr/paiement',
  dateInscription: '01/06/2026',
  email: 'mohamed@exemple.fr',
  dateSuspension: '02/06/2026',
  dateProchainPaiement: '02/07/2026',
  numFacture: 'FAC-2026-00001',
  periode: 'Juin 2026',
  montantTTC: '236.40',
  numTicket: '42',
  sujet: 'Problème de connexion',
  dateResolution: '02/06/2026',
  reponseAkilai: 'Votre problème a été résolu.',
};

const VAR_MAP = {
  '{Nom}': DEMO_PARAMS.nom,
  '{Plan}': DEMO_PARAMS.plan,
  '{Montant}': DEMO_PARAMS.montant,
  '{DateEcheance}': DEMO_PARAMS.dateEcheance,
  '{LienPaiement}': DEMO_PARAMS.lienPaiement,
  '{DateInscription}': DEMO_PARAMS.dateInscription,
  '{Email}': DEMO_PARAMS.email,
  '{DateSuspension}': DEMO_PARAMS.dateSuspension,
  '{DateProchainPaiement}': DEMO_PARAMS.dateProchainPaiement,
  '{NumFacture}': DEMO_PARAMS.numFacture,
  '{Periode}': DEMO_PARAMS.periode,
  '{MontantTTC}': DEMO_PARAMS.montantTTC,
  '{NumTicket}': DEMO_PARAMS.numTicket,
  '{Sujet}': DEMO_PARAMS.sujet,
  '{DateResolution}': DEMO_PARAMS.dateResolution,
  '{ReponseAkilai}': DEMO_PARAMS.reponseAkilai,
};

function replaceVars(text) {
  return Object.entries(VAR_MAP).reduce((s, [k, v]) => s.replaceAll(k, v), text || '');
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (!verifyAdminToken(event)) return unauthorized();
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { template, sujet, corps } = JSON.parse(event.body || "{}");
    const tplFn = templates[template] || templates.bienvenue;
    const corpsResolved = replaceVars(corps);
    const result = tplFn({ ...DEMO_PARAMS, corps: corpsResolved || undefined });
    return ok({ html: result.html, subject: replaceVars(sujet) || result.subject });
  } catch (e) {
    return err(e.message);
  }
};
