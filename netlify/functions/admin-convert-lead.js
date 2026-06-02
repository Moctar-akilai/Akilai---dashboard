const { BASE_URL, headers, ok, err, preflight } = require("./config");

const LEADS_TABLE = "tblXJoVNtimnvGRBl";

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Méthode non autorisée", 405);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) { return err("JSON invalide", 400); }

  const { leadId, plan, montant } = body;
  if (!leadId) return err("leadId requis", 400);

  try {
    // Fetch lead record
    const leadRes  = await fetch(`${BASE_URL}/${LEADS_TABLE}/${leadId}`, { headers });
    if (!leadRes.ok) return err("Lead introuvable", 404);
    const leadData = await leadRes.json();
    const f        = leadData.fields || {};

    const email      = f["Email"]      || "";
    const nom        = f["Nom"]        || "";
    const prenom     = f["Prénom"]     || "";
    const entreprise = f["Entreprise"] || "";

    if (!email) return err("Le lead n'a pas d'email — conversion impossible", 400);

    // Create client in Airtable Clients table
    const clientFields = {
      "Nom":         `${prenom} ${nom}`.trim() || nom,
      "Email":       email,
      "Entreprise":  entreprise,
      "User ID":     email,
      "Statut":      "Actif",
      "Plan":        plan || "Starter",
    };
    if (montant) clientFields["MRR"] = Number(montant);

    const clientRes  = await fetch(`${BASE_URL}/Clients`, {
      method: "POST",
      headers,
      body: JSON.stringify({ fields: clientFields, typecast: true }),
    });
    const clientData = await clientRes.json();
    if (clientData.error) return err(`Airtable Clients: ${clientData.error.message}`, 400);

    const newClientId = clientData.id;

    // Mark lead as converted + Gagné
    const patchRes = await fetch(`${BASE_URL}/${LEADS_TABLE}/${leadId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ fields: {
        "Statut":   "Gagné",
        "Converti": true,
        "Date dernière action": new Date().toISOString().split("T")[0],
      }}),
    });
    const patchData = await patchRes.json();
    if (patchData.error) console.warn("[admin-convert-lead] lead PATCH error:", patchData.error.message);

    console.log("[admin-convert-lead] Lead", leadId, "→ Client", newClientId);
    return ok({ ok: true, clientId: newClientId, leadId });
  } catch (e) {
    console.error("[admin-convert-lead] Exception:", e.message);
    return err(e.message);
  }
};
