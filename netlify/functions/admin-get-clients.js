const { BASE_URL, headers, ok, err, preflight, corsHeaders } = require("./config");
const { verifyAdminToken, unauthorized } = require("./admin-utils");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (!verifyAdminToken(event)) return unauthorized();

  try {
    let allRecords = [];
    let offset = null;

    do {
      const params = new URLSearchParams({ maxRecords: "100" });
      if (offset) params.set("offset", offset);

      const res = await fetch(`${BASE_URL}/Clients?${params.toString()}`, { headers });
      const data = await res.json();

      if (data.records) {
        allRecords = allRecords.concat(data.records);
      }
      offset = data.offset || null;
    } while (offset);

    const clients = allRecords.map((r) => {
      const f = r.fields || {};
      return {
        id: r.id,
        nom: f.Nom || "",
        entreprise: f.Entreprise || "",
        email: f.Email || "",
        plan: f.Plan || "",
        statut: f.Statut || "",
        dateInscription: f["Date inscription"] || "",
        prochainPaiement: f["Date prochain paiement"] || "",
        pays: f.Pays || "",
        onboarding: f.Onboarding || "",
        telephone: f["Numéro de téléphone"] || "",
        secteur: f.Secteur || "",
        vapiAssistantId: f.VapiAssistantId || "",
        numeroVapi: f["Numéro Vapi"] || "",
        numeroTwilio: f["Numéro Twilio"] || "",
        notes: f.Notes || "",
      };
    });

    return ok({ clients });
  } catch (e) {
    return err(e.message);
  }
};
