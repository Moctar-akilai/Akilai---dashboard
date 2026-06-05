const { BASE_URL, headers, ok, err, preflight } = require("./config");

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Méthode non autorisée", 405);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch(e) { return err("JSON invalide", 400); }

  const { userId, nomAssistant, langue, tonalite, prompt } = body;
  if (!userId) return err("userId manquant", 400);

  console.log("[update-whatsapp-config] userId:", userId, "nom:", nomAssistant);

  try {
    /* Chercher le record client */
    const searchRes  = await fetch(
      `${BASE_URL}/Clients?filterByFormula=${encodeURIComponent(`{User ID}="${userId}"`)}&maxRecords=1`,
      { headers }
    );
    const searchData = await searchRes.json();
    const record     = searchData.records?.[0];
    if (!record) return err("Client introuvable", 404);

    const fields = {};
    if (nomAssistant !== undefined) fields["WhatsApp Nom Assistant"] = nomAssistant;
    if (langue       !== undefined) fields["WhatsApp Langue"]        = langue;
    if (tonalite     !== undefined) fields["WhatsApp Tonalite"]      = tonalite;
    if (prompt       !== undefined) fields["WhatsApp Prompt"]        = prompt;

    const patchRes = await fetch(`${BASE_URL}/Clients/${record.id}`, {
      method:  "PATCH",
      headers,
      body:    JSON.stringify({ fields }),
    });

    if (!patchRes.ok) {
      const text = await patchRes.text();
      console.error("[update-whatsapp-config] Airtable error:", patchRes.status, text);
      return err(`Airtable ${patchRes.status}`, 502);
    }

    console.log("[update-whatsapp-config] PATCH OK — champs:", Object.keys(fields).join(", "));

    /* Upsert Automatisations */
    try {
      const formula  = encodeURIComponent(`AND({User ID}="${userId}",{Type}="WhatsApp")`);
      const autoRes  = await fetch(`${BASE_URL}/Automatisations?filterByFormula=${formula}&maxRecords=1`, { headers });
      const autoData = autoRes.ok ? await autoRes.json() : { records: [] };
      const existing = autoData.records?.[0];

      if (existing) {
        await fetch(`${BASE_URL}/Automatisations/${existing.id}`, {
          method:  "PATCH",
          headers,
          body:    JSON.stringify({ fields: { Nom: nomAssistant || "Assistant WhatsApp", Statut: "Actif" }, typecast: true }),
        });
      } else {
        await fetch(`${BASE_URL}/Automatisations`, {
          method:  "POST",
          headers,
          body:    JSON.stringify({
            fields: {
              Nom:       nomAssistant || "Assistant WhatsApp",
              Type:      "WhatsApp",
              Statut:    "Actif",
              "User ID": userId,
              Description: `Assistant WhatsApp IA — ${langue || "Français"}`,
            },
            typecast: true,
          }),
        });
      }
    } catch (e2) {
      console.warn("[update-whatsapp-config] automatisation sync error:", e2.message);
    }

    return ok({ success: true });
  } catch (e) {
    console.error("[update-whatsapp-config] Exception:", e.message);
    return err(e.message);
  }
};
