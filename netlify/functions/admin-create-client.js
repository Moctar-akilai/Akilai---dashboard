const { BASE_URL, headers, ok, err, preflight, corsHeaders } = require("./config");
const { verifyAdminToken, unauthorized } = require("./admin-utils");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (!verifyAdminToken(event)) return unauthorized();
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { entreprise, nom, email, telephone, secteur, plan, pays } = JSON.parse(event.body || "{}");

    // 1. Create client in Airtable
    const airtableRes = await fetch(`${BASE_URL}/Clients`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        fields: {
          Entreprise: entreprise || "",
          Nom: nom || "",
          Email: email || "",
          "Numéro de téléphone": telephone || "",
          Secteur: secteur || "",
          Plan: plan || "",
          Pays: pays || "",
          Statut: "Actif",
          "Date inscription": new Date().toISOString().split("T")[0],
          "User ID": email || "",
        },
      }),
    });
    const data = await airtableRes.json();

    if (data.error) return err(data.error.message || "Airtable error");

    // 2. Send welcome email via Resend
    const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
    if (RESEND_API_KEY) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "AkilAI <noreply@akilai.fr>",
          to: email,
          subject: "Bienvenue chez AkilAI — Votre accès est prêt",
          html: `<h2>Bienvenue ${nom} !</h2><p>Votre compte AkilAI a été créé avec le plan <strong>${plan}</strong>.</p><p>Email de connexion : ${email}</p><p>L'équipe AkilAI</p>`,
        }),
      });
    }

    return ok({ ok: true, id: data.id });
  } catch (e) {
    return err(e.message);
  }
};
