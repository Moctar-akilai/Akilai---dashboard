const { sendEmail }           = require("./email-template");
const { BASE_URL, headers, ok, err, preflight } = require("./config");

/**
 * Appelée en fire-and-forget par create-ticket.js.
 * Envoie un email à l'admin (ADMIN_EMAIL) pour chaque nouveau ticket.
 * Si priorité "Urgente" → [URGENT] dans le sujet.
 */
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Méthode non autorisée", 405);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return err("JSON invalide", 400); }

  const { ticket, clientId } = body;
  if (!ticket) return err("ticket manquant", 400);

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return err("ADMIN_EMAIL non configuré", 500);

  /* Récupérer le nom du client depuis Airtable si disponible */
  let clientNom = clientId || "Client inconnu";
  if (clientId && clientId.startsWith("rec")) {
    try {
      const res  = await fetch(`${BASE_URL}/Clients/${clientId}`, { headers });
      const data = res.ok ? await res.json() : null;
      if (data?.fields?.Nom) clientNom = data.fields.Nom;
    } catch {}
  }

  const isUrgent = ticket.priorite === "Urgente";
  const sujet    = `${isUrgent ? "[URGENT] " : ""}Nouveau ticket #${ticket._seq || ticket.id} — ${ticket.priorite} — ${clientNom}`;
  const dashUrl  = process.env.URL ? `${process.env.URL}/#tickets` : "https://votre-dashboard.netlify.app/#tickets";

  try {
    await sendEmail({
      to:        adminEmail,
      sujet,
      badge:      ticket.priorite,
      badge_color: isUrgent ? "#ef4444" : ticket.priorite === "Haute" ? "#f97316" : "#70B2DE",
      titre:     `Nouveau ticket : ${ticket.sujet}`,
      corps: [
        `<strong>Client :</strong> ${clientNom}`,
        `<strong>Priorité :</strong> ${ticket.priorite}`,
        `<strong>Catégorie :</strong> ${ticket.categorie}`,
        `<strong>Statut :</strong> ${ticket.statut}`,
        ticket.messages?.[0]?.text
          ? `<br><strong>Message initial :</strong><br><em>"${ticket.messages[0].text}"</em>`
          : "",
      ].filter(Boolean),
      cta_label: "Voir le ticket →",
      cta_url:   dashUrl,
    });

    return ok({ ok: true });
  } catch (e) {
    console.error("[notify-new-ticket]", e.message);
    return err(e.message);
  }
};
