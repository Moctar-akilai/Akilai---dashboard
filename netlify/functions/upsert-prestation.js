const { BASE_URL, headers, ok, err, preflight } = require("./config");

/**
 * POST /.netlify/functions/upsert-prestation
 * Body : { email, prestation: { id?, nom, description, duree, prix, categorie, reservableEnLigne } }
 *
 * Si prestation.id est présent → PATCH (mise à jour).
 * Sinon → POST (création) avec Salon = [salonId du client].
 * Vérifie que la prestation appartient bien au salon du client connecté.
 */
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Méthode non autorisée", 405);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) { return err("JSON invalide", 400); }

  const { email, prestation } = body;
  if (!email || !prestation)    return err("email et prestation requis", 400);
  if (!prestation.nom?.trim())  return err("Le nom de la prestation est requis", 400);
  if (!prestation.duree || prestation.duree < 5) return err("La durée doit être ≥ 5 minutes", 400);

  try {
    // Trouve le salon du client
    const formula  = encodeURIComponent(`{User ID}="${email}"`);
    const salonRes = await fetch(`${BASE_URL}/Salons?filterByFormula=${formula}&maxRecords=1`, { headers });
    const salonData = salonRes.ok ? await salonRes.json() : { records: [] };
    const salon     = salonData.records?.[0];
    if (!salon) return err("Aucun salon trouvé pour ce compte", 404);

    const salonId = salon.id;

    // Si mise à jour : vérifie ownership
    if (prestation.id) {
      const pRes = await fetch(`${BASE_URL}/Prestations/${prestation.id}`, { headers });
      if (!pRes.ok) return err("Prestation introuvable", 404);
      const pd = await pRes.json();
      if (!(pd.fields.Salon || []).includes(salonId)) return err("Accès refusé", 403);
    }

    const fields = {
      "Nom":                 prestation.nom.trim(),
      "Description":         prestation.description || "",
      "Durée":               Number(prestation.duree),
      "Catégorie":           prestation.categorie || "",
      "Réservable en ligne": Boolean(prestation.reservableEnLigne),
    };
    if (prestation.prix !== null && prestation.prix !== undefined && prestation.prix !== "") {
      fields["Prix"] = Number(prestation.prix);
    } else {
      fields["Prix"] = null;
    }

    let res;
    if (prestation.id) {
      res = await fetch(`${BASE_URL}/Prestations/${prestation.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ fields }),
      });
    } else {
      fields["Salon"] = [salonId];
      res = await fetch(`${BASE_URL}/Prestations`, {
        method: "POST",
        headers,
        body: JSON.stringify({ fields, typecast: true }),
      });
    }

    if (!res.ok) {
      const t = await res.text();
      console.error("[upsert-prestation] Airtable error:", t);
      return err("Impossible de sauvegarder la prestation", 502);
    }

    const rec = await res.json();
    console.log("[upsert-prestation]", prestation.id ? "Mis à jour" : "Créé", rec.id);
    return ok({
      ok: true,
      prestation: {
        id:               rec.id,
        nom:              rec.fields.Nom                     || "",
        description:      rec.fields.Description             || "",
        duree:            rec.fields["Durée"]                || 30,
        prix:             rec.fields.Prix                    ?? null,
        categorie:        rec.fields["Catégorie"]            || "",
        reservableEnLigne: rec.fields["Réservable en ligne"] || false,
      },
    });
  } catch (e) {
    console.error("[upsert-prestation]", e.message);
    return err(e.message);
  }
};
