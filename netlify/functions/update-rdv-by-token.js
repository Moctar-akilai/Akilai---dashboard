const { BASE_URL, headers, ok, err, preflight } = require("./config");

/**
 * POST /.netlify/functions/update-rdv-by-token
 * Body : { token, action: "annuler" | "modifier", dateHeure? (ISO, pour modifier) }
 *
 * Le token fait office de clé d'accès — pas d'authentification client requise.
 * - "annuler" : PATCH Statut = "Annulé"
 * - "modifier" : PATCH Date/Heure = nouveau créneau
 *
 * Dans les deux cas : refuse si le RDV est déjà passé ou déjà annulé.
 */
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Méthode non autorisée", 405);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) { return err("JSON invalide", 400); }

  const { token, action, dateHeure } = body;
  if (!token)  return err("token requis", 400);
  if (!action) return err("action requise (annuler | modifier)", 400);
  if (action === "modifier" && !dateHeure) return err("dateHeure requis pour modifier", 400);

  try {
    // 1. Retrouve le RDV via le token
    const formula = encodeURIComponent(`{Token gestion}="${token}"`);
    const findRes = await fetch(`${BASE_URL}/Rendez-vous?filterByFormula=${formula}&maxRecords=1`, { headers });
    if (!findRes.ok) return err("Erreur Airtable", 502);
    const findData = await findRes.json();
    const rdv = findData.records?.[0];
    if (!rdv) return err("RDV introuvable ou lien invalide", 404);

    const f         = rdv.fields;
    const statut    = f.Statut || "Confirmé";
    const dateActuelle = f["Date/Heure"] ? new Date(f["Date/Heure"]) : null;

    // 2. Garde-fous
    if (statut === "Annulé") return err("Ce RDV est déjà annulé.", 409);
    if (statut === "Terminé") return err("Ce RDV est déjà terminé et ne peut plus être modifié.", 409);
    if (dateActuelle && dateActuelle < new Date()) {
      return err("Ce RDV est déjà passé et ne peut plus être modifié.", 409);
    }

    // 3. Action
    let patchFields;

    if (action === "annuler") {
      patchFields = { "Statut": "Annulé" };

    } else if (action === "modifier") {
      const newDate = new Date(dateHeure);
      if (isNaN(newDate.getTime())) return err("dateHeure invalide", 400);
      if (newDate < new Date()) return err("Impossible de choisir un créneau passé.", 400);

      // Vérifie que le nouveau créneau est libre (race condition)
      const salonId      = (f.Salon || [])[0]      || null;
      const prestationId = (f.Prestation || [])[0] || null;

      if (salonId && prestationId) {
        const prestRes = await fetch(`${BASE_URL}/Prestations/${prestationId}`, { headers });
        const pf = prestRes.ok ? (await prestRes.json()).fields || {} : {};
        const salonRes = await fetch(`${BASE_URL}/Salons/${salonId}`, { headers });
        const sf = salonRes.ok ? (await salonRes.json()).fields || {} : {};
        const dureeMin = pf["Durée"] || sf["Durée par défaut prestation"] || 30;
        const newEnd = new Date(newDate.getTime() + dureeMin * 60000);

        const rdvFormula = encodeURIComponent(
          `AND({Statut}!="Annulé",IS_AFTER({Date/Heure},"${new Date(newDate.getTime() - 3 * 3600000).toISOString()}"),IS_BEFORE({Date/Heure},"${new Date(newEnd.getTime() + 3 * 3600000).toISOString()}"))`
        );
        const conflictRes = await fetch(`${BASE_URL}/Rendez-vous?filterByFormula=${rdvFormula}`, { headers });
        const conflictData = conflictRes.ok ? await conflictRes.json() : { records: [] };

        const conflict = (conflictData.records || [])
          .filter(r => r.id !== rdv.id && (r.fields.Salon || []).includes(salonId) && r.fields["Date/Heure"])
          .some(r => {
            const s = new Date(r.fields["Date/Heure"]);
            const e = new Date(s.getTime() + dureeMin * 60000);
            return newDate < e && newEnd > s;
          });
        if (conflict) return err("Ce créneau vient d'être réservé. Veuillez en choisir un autre.", 409);
      }

      patchFields = { "Date/Heure": new Date(dateHeure).toISOString() };

    } else {
      return err("action invalide", 400);
    }

    // 4. PATCH Airtable
    const patchRes = await fetch(`${BASE_URL}/Rendez-vous/${rdv.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ fields: patchFields }),
    });
    if (!patchRes.ok) {
      const t = await patchRes.text();
      console.error("[update-rdv-by-token] Airtable error:", t);
      return err("Impossible de mettre à jour le rendez-vous", 502);
    }

    console.log(`[update-rdv-by-token] ${action} rdv=${rdv.id}`);
    return ok({ ok: true, action });

  } catch (e) {
    console.error("[update-rdv-by-token]", e.message);
    return err(e.message);
  }
};
