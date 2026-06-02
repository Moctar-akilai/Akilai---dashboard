const { BASE_URL, headers, ok, err, preflight, corsHeaders } = require("./config");
const { verifyAdminToken, unauthorized } = require("./admin-utils");
const { bienvenue: bienvenueTpl } = require("./email-templates");
const { getEmailCorps } = require("./email-config");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (!verifyAdminToken(event)) return unauthorized();
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { entreprise, nom, email, telephone, secteur, plan, pays } = JSON.parse(event.body || "{}");

    // 1. Create client in Airtable
    const SINGLE_SELECT_FIELDS = ["Secteur", "Plan", "Pays", "Statut", "Onboarding"];
    const rawFields = {
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
    };
    const fields = Object.fromEntries(
      Object.entries(rawFields).filter(([k, v]) =>
        SINGLE_SELECT_FIELDS.includes(k) ? (v !== "" && v != null) : true
      )
    );

    const airtableRes = await fetch(`${BASE_URL}/Clients`, {
      method: "POST",
      headers,
      body: JSON.stringify({ fields }),
    });
    const data = await airtableRes.json();

    if (data.error) return err(data.error.message || "Airtable error");

    // 2. Send welcome email via Resend
    const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
    if (RESEND_API_KEY) {
      const _rWelcome = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify(await (async () => {
          const corps = await getEmailCorps('bienvenue').catch(() => null);
          const tpl = bienvenueTpl({ nom, plan, email, dateInscription: new Date().toLocaleDateString('fr-FR'), corps });
          return { from: "AkilAI <noreply@akilai.fr>", to: email, subject: tpl.subject, html: tpl.html };
        })()),
      });
      const _dWelcome = await _rWelcome.json();
      console.log('[email] admin-create-client statut:', _dWelcome.id || _dWelcome.error || _dWelcome.message);
    }

    return ok({ ok: true, id: data.id });
  } catch (e) {
    return err(e.message);
  }
};
