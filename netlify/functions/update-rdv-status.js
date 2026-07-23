const { BASE_URL, headers, ok, err, preflight } = require("./config");

const VALID_STATUTS = ["Terminé", "Annulé", "No-show"];

/**
 * POST /.netlify/functions/update-rdv-status
 * Body : { rdvId, statut, email }
 * Vérifie que le salon du RDV appartient au client (email = User ID),
 * puis met à jour le champ Statut dans Airtable Rendez-vous.
 */
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Méthode non autorisée", 405);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch(e) { return err("JSON invalide", 400); }

  const { rdvId, statut, email } = body;
  if (!rdvId || !statut || !email) return err("rdvId, statut et email requis", 400);
  if (!VALID_STATUTS.includes(statut)) {
    return err(`Statut invalide. Valeurs acceptées : ${VALID_STATUTS.join(", ")}`, 400);
  }

  try {
    // 1. Fetch le RDV
    const rdvRes = await fetch(`${BASE_URL}/Rendez-vous/${rdvId}`, { headers });
    if (!rdvRes.ok) return err("RDV introuvable", 404);
    const rdv = await rdvRes.json();

    // 2. Vérifie que le salon de ce RDV appartient au client connecté
    const salonIds = rdv.fields.Salon || [];
    if (salonIds.length) {
      const salonRes = await fetch(`${BASE_URL}/Salons/${salonIds[0]}`, { headers });
      if (salonRes.ok) {
        const sf = (await salonRes.json()).fields || {};
        if (sf["User ID"] && sf["User ID"] !== email) return err("Accès refusé", 403);
      }
    }

    // 3. PATCH le statut
    const patchRes = await fetch(`${BASE_URL}/Rendez-vous/${rdvId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ fields: { Statut: statut } }),
    });
    if (!patchRes.ok) {
      const t = await patchRes.text();
      console.error("[update-rdv-status] Airtable error:", t);
      return err("Impossible de mettre à jour le statut", 502);
    }

    console.log(`[update-rdv-status] RDV ${rdvId} → ${statut}`);
    return ok({ ok: true, rdvId, statut });
  } catch (e) {
    console.error("[update-rdv-status]", e.message);
    return err(e.message);
  }
};
