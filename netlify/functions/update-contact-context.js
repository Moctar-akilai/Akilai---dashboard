const { BASE_URL, headers, ok, err, preflight } = require("./config");

const CONTACTS_TABLE = "tblmBABwZaL2HTSx6";

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Méthode non autorisée", 405);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch(e) { return err("JSON invalide", 400); }

  const { userId, numero, nom, email, resume, canal } = body;
  if (!userId) return err("userId requis", 400);
  if (!numero) return err("numero requis", 400);

  try {
    /* Chercher contact existant */
    const formula = encodeURIComponent(`AND({User ID}="${userId}",{Numéro}="${numero}")`);
    const searchRes  = await fetch(`${BASE_URL}/${CONTACTS_TABLE}?filterByFormula=${formula}&maxRecords=1`, { headers });
    const searchData = await searchRes.json();
    const existing   = searchData.records?.[0];
    const now        = new Date().toISOString();

    if (existing) {
      const f = existing.fields;

      /* Mettre à jour l'historique — garder 10 entrées max */
      let historique = [];
      try { historique = JSON.parse(f["Historique Interactions"] || "[]"); } catch(e) {}
      historique.push({ date: now, canal: canal || "Inconnu", resume: (resume || "").substring(0, 200) });
      if (historique.length > 10) historique.splice(0, historique.length - 10);

      const patchFields = {
        "Contexte":               (resume || "").substring(0, 500),
        "Nb appels":              (Number(f["Nb appels"]) || 0) + 1,
        "Derniere Interaction":   now,
        "Historique Interactions": JSON.stringify(historique),
      };
      if (nom   && !f["Nom"])   patchFields["Nom"]   = nom;
      if (email && !f["Email"]) patchFields["Email"] = email;

      await fetch(`${BASE_URL}/${CONTACTS_TABLE}/${existing.id}`, {
        method:  "PATCH",
        headers,
        body:    JSON.stringify({ fields: patchFields }),
      });

      console.log("[update-contact-context] PATCH contact:", existing.id);
      return ok({ ok: true, action: "updated", id: existing.id });
    } else {
      /* Créer nouveau contact */
      const newFields = {
        "User ID":               userId,
        "Numéro":                numero,
        "Nb appels":             1,
        "Derniere Interaction":  now,
        "Contexte":              (resume || "").substring(0, 500),
        "Historique Interactions": JSON.stringify([{ date: now, canal: canal || "Inconnu", resume: (resume || "").substring(0, 200) }]),
        "Source":                canal === "Vocal" ? "Appel vocal" : canal === "WhatsApp" ? "WhatsApp" : "Manuel",
      };
      if (nom)   newFields["Nom"]   = nom;
      if (email) newFields["Email"] = email;

      const createRes  = await fetch(`${BASE_URL}/${CONTACTS_TABLE}`, {
        method:  "POST",
        headers,
        body:    JSON.stringify({ fields: newFields, typecast: true }),
      });
      const createData = await createRes.json();

      console.log("[update-contact-context] POST contact:", createData.id);
      return ok({ ok: true, action: "created", id: createData.id });
    }
  } catch (e) {
    console.error("[update-contact-context] Exception:", e.message);
    return err(e.message);
  }
};
