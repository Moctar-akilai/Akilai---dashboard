const { BASE_URL, headers, ok, err, preflight, corsHeaders } = require("./config");
const { verifyAdminToken, unauthorized } = require("./admin-utils");
const { sendOnboardingEmail } = require("./send-onboarding-email");

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
      body: JSON.stringify({ fields, typecast: true }),
    });
    const data = await airtableRes.json();

    if (data.error) return err(data.error.message || "Airtable error");

    // 2. Fire-and-forget : email de bienvenue
    if (email) {
      sendOnboardingEmail({
        clientName:   nom || "",
        clientEmail:  email,
        dashboardUrl: "https://portal-akilai.netlify.app",
      }).catch(e => console.error("[admin-create-client] sendOnboardingEmail erreur:", e.message));
    }

    return ok({ ok: true, id: data.id });
  } catch (e) {
    return err(e.message);
  }
};
