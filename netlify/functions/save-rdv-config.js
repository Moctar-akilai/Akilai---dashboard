const { BASE_URL, headers, ok, err, preflight } = require("./config");

/**
 * POST /.netlify/functions/save-rdv-config
 * Body : { email, salonFields }
 *
 * salonFields peut contenir :
 *   "Nom salon", "Adresse", "Horaires ouverture",
 *   "Numéro WhatsApp", "Lien avis Google", "Canal feedback",
 *   "Durée par défaut prestation"
 *
 * Trouve le salon par {User ID}=email.
 * Si le salon n'existe pas encore, le crée.
 */
const ALLOWED_FIELDS = new Set([
  "Nom salon",
  "Adresse",
  "Horaires ouverture",
  "Numéro WhatsApp",
  "Lien avis Google",
  "Canal feedback",
  "Durée par défaut prestation",
]);

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Méthode non autorisée", 405);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) { return err("JSON invalide", 400); }

  const { email, salonFields } = body;
  if (!email)        return err("email requis", 400);
  if (!salonFields || typeof salonFields !== "object") return err("salonFields requis", 400);

  // Whitelist des champs modifiables
  const fields = {};
  for (const [k, v] of Object.entries(salonFields)) {
    if (ALLOWED_FIELDS.has(k)) fields[k] = v;
  }
  if (!Object.keys(fields).length) return err("Aucun champ valide à mettre à jour", 400);

  try {
    // Cherche le salon existant
    const formula  = encodeURIComponent(`{User ID}="${email}"`);
    const findRes  = await fetch(`${BASE_URL}/Salons?filterByFormula=${formula}&maxRecords=1`, { headers });
    const findData = findRes.ok ? await findRes.json() : { records: [] };
    const existing = findData.records?.[0];

    let res;
    if (existing) {
      // PATCH
      res = await fetch(`${BASE_URL}/Salons/${existing.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ fields }),
      });
    } else {
      // Création
      res = await fetch(`${BASE_URL}/Salons`, {
        method: "POST",
        headers,
        body: JSON.stringify({ fields: { ...fields, "User ID": email }, typecast: true }),
      });
    }

    if (!res.ok) {
      const t = await res.text();
      console.error("[save-rdv-config] Airtable error:", t);
      return err("Impossible de sauvegarder la configuration", 502);
    }

    const rec = await res.json();
    console.log("[save-rdv-config] Salon sauvegardé:", rec.id);
    return ok({ ok: true, salonId: rec.id });
  } catch (e) {
    console.error("[save-rdv-config]", e.message);
    return err(e.message);
  }
};
