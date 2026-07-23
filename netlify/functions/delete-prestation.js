const { BASE_URL, headers, ok, err, preflight } = require("./config");

/**
 * POST /.netlify/functions/delete-prestation
 * Body : { email, prestationId }
 * Vérifie que la prestation appartient au salon du client, puis supprime.
 */
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Méthode non autorisée", 405);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) { return err("JSON invalide", 400); }

  const { email, prestationId } = body;
  if (!email || !prestationId) return err("email et prestationId requis", 400);

  try {
    // Salon du client
    const formula  = encodeURIComponent(`{User ID}="${email}"`);
    const salonRes = await fetch(`${BASE_URL}/Salons?filterByFormula=${formula}&maxRecords=1`, { headers });
    const salonData = salonRes.ok ? await salonRes.json() : { records: [] };
    const salon     = salonData.records?.[0];
    if (!salon) return err("Aucun salon trouvé", 404);

    // Vérification ownership
    const pRes = await fetch(`${BASE_URL}/Prestations/${prestationId}`, { headers });
    if (!pRes.ok) return err("Prestation introuvable", 404);
    const pd = await pRes.json();
    if (!(pd.fields.Salon || []).includes(salon.id)) return err("Accès refusé", 403);

    // Suppression
    const delRes = await fetch(`${BASE_URL}/Prestations/${prestationId}`, {
      method: "DELETE",
      headers,
    });
    if (!delRes.ok) {
      const t = await delRes.text();
      console.error("[delete-prestation] Airtable error:", t);
      return err("Impossible de supprimer la prestation", 502);
    }

    console.log("[delete-prestation] Supprimé:", prestationId);
    return ok({ ok: true, deleted: prestationId });
  } catch (e) {
    console.error("[delete-prestation]", e.message);
    return err(e.message);
  }
};
