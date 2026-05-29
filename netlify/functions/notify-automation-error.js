const { sendEmail }           = require("./email-template");
const { ok, err, preflight } = require("./config");

/**
 * Appelée en fire-and-forget par update-automation.js si nouveau statut === "Erreur".
 * Envoie un email à l'admin avec les détails de l'automation en erreur.
 */
exports.handler = async function(event, context) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Méthode non autorisée", 405);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return err("JSON invalide", 400); }

  const { automation } = body;
  if (!automation) return err("automation manquante", 400);

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return err("ADMIN_EMAIL non configuré", 500);

  const dashUrl = process.env.URL
    ? `${process.env.URL}/#automations`
    : "https://votre-dashboard.netlify.app/#automations";

  try {
    await sendEmail({
      to:         adminEmail,
      sujet:      `⚠️ Automation en erreur : ${automation.nom}`,
      badge:      "ERREUR",
      badge_color:"#ef4444",
      titre:      `Automation en erreur : ${automation.nom}`,
      corps: [
        `<strong>Nom :</strong> ${automation.nom}`,
        `<strong>Type :</strong> ${automation.type || "—"}`,
        `<strong>Dernière exécution :</strong> ${automation.derniere_exec || "inconnue"}`,
        `<strong>Prochaine exécution prévue :</strong> ${automation.prochaine_exec || "non planifiée"}`,
        "<br>Veuillez vérifier la configuration de cette automation et corriger l'erreur.",
      ],
      cta_label: "Voir les automations →",
      cta_url:   dashUrl,
    });

    return ok({ ok: true });
  } catch (e) {
    console.error("[notify-automation-error]", e.message);
    return err(e.message);
  }
};
