const { sendEmail }           = require("./email-template");
const { BASE_URL, headers, ok, err, preflight } = require("./config");

/**
 * Appelée en fire-and-forget par update-ticket.js quand role === "support".
 * Envoie un email au client (récupéré depuis Airtable via clientId).
 */
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Méthode non autorisée", 405);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return err("JSON invalide", 400); }

  const { ticketId, message, clientId } = body;
  if (!ticketId || !message) return err("ticketId et message requis", 400);

  /* Récupérer l'email du client depuis Airtable */
  let clientEmail = null;
  let clientNom   = "Client";
  if (clientId) {
    try {
      const res  = await fetch(`${BASE_URL}/Clients/${clientId}`, { headers });
      const data = res.ok ? await res.json() : null;
      if (data?.fields?.Email) clientEmail = data.fields.Email;
      if (data?.fields?.Nom)   clientNom   = data.fields.Nom;
    } catch {}
  }

  if (!clientEmail) {
    console.warn("[notify-ticket-reply] Pas d'email client pour", clientId);
    return ok({ ok: false, reason: "no_client_email" });
  }

  const dashUrl = process.env.URL ? `${process.env.URL}/#tickets` : "https://votre-dashboard.netlify.app/#tickets";

  try {
    await sendEmail({
      to:    clientEmail,
      sujet: `Réponse à votre ticket #${ticketId} — AkilAI Support`,
      titre: "Votre ticket a reçu une réponse",
      corps: [
        `Bonjour ${clientNom},`,
        `Notre équipe a répondu à votre ticket.`,
        `<strong>Réponse :</strong><br><em>"${message.text}"</em>`,
        "Vous pouvez consulter l'historique complet de votre ticket en cliquant ci-dessous.",
      ],
      cta_label: "Voir mon ticket →",
      cta_url:   dashUrl,
    });

    return ok({ ok: true });
  } catch (e) {
    console.error("[notify-ticket-reply]", e.message);
    return err(e.message);
  }
};
