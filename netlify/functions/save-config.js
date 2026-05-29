const { BASE_URL, headers, ok, err, preflight } = require("./config");

/**
 * GET  → retourne la config Voix & IA du client (par clientId queryParam)
 * POST → PATCH /Configurations/{id} avec tous les champs Voix & IA
 *
 * Champs Airtable : NomAssistant, Voix, Tonalite, Personnalite, Langue,
 *   LangueSecours, VitesseParole, SilenceMax, Interruptions, PromptSysteme, ClientId
 */
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();

  /* ---- GET : charger la config ---- */
  if (event.httpMethod === "GET") {
    const clientId = event.queryStringParameters?.clientId;
    const filter   = clientId
      ? `?filterByFormula=${encodeURIComponent(`{ClientId}="${clientId}"`)}&maxRecords=1`
      : "?maxRecords=1";

    try {
      const res = await fetch(`${BASE_URL}/Configurations${filter}`, { headers });
      if (!res.ok) return err(`Airtable ${res.status}`, 502);

      const data = await res.json();
      const rec  = data.records?.[0];
      if (!rec) return ok({ config: null }); /* pas encore de config */

      const f = rec.fields;
      return ok({
        config: {
          _id:           rec.id,
          nomAssistant:  f.NomAssistant  || "Sophie",
          voix:          f.Voix          || "Alloy",
          tonalite:      f.Tonalite      || "Professionnel",
          personnalite:  f.Personnalite  || "Chaleureux",
          langue:        f.Langue        || "fr-FR",
          langueSecours: f.LangueSecours || "en-US",
          vitesseParole: Number(f.VitesseParole) || 1.0,
          silenceMax:    Number(f.SilenceMax)    || 3,
          interruptions: Boolean(f.Interruptions),
          promptSysteme: f.PromptSysteme || "",
        },
      });
    } catch (e) {
      return err(e.message);
    }
  }

  /* ---- POST : sauvegarder la config ---- */
  if (event.httpMethod === "POST") {
    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { return err("JSON invalide", 400); }

    const { _id, clientId, ...cfg } = body;
    if (!_id && !clientId) return err("_id ou clientId requis", 400);

    const fields = {
      NomAssistant:  cfg.nomAssistant,
      Voix:          cfg.voix,
      Tonalite:      cfg.tonalite,
      Personnalite:  cfg.personnalite,
      Langue:        cfg.langue,
      LangueSecours: cfg.langueSecours,
      VitesseParole: cfg.vitesseParole,
      SilenceMax:    cfg.silenceMax,
      Interruptions: cfg.interruptions,
      PromptSysteme: cfg.promptSysteme,
    };
    if (clientId) fields.ClientId = clientId;

    try {
      let recordId = _id;

      /* Si pas d'ID, chercher ou créer */
      if (!recordId) {
        const filter = `?filterByFormula=${encodeURIComponent(`{ClientId}="${clientId}"`)}&maxRecords=1`;
        const findRes = await fetch(`${BASE_URL}/Configurations${filter}`, { headers });
        const findData = findRes.ok ? await findRes.json() : { records: [] };
        recordId = findData.records?.[0]?.id || null;
      }

      let res;
      if (recordId) {
        /* PATCH sur l'existant */
        res = await fetch(`${BASE_URL}/Configurations/${recordId}`, {
          method: "PATCH", headers, body: JSON.stringify({ fields }),
        });
      } else {
        /* POST pour créer */
        res = await fetch(`${BASE_URL}/Configurations`, {
          method: "POST", headers, body: JSON.stringify({ fields }),
        });
      }

      if (!res.ok) {
        const text = await res.text();
        console.error("Airtable save-config error:", res.status, text);
        return err(`Airtable ${res.status}`, 502);
      }

      const data = await res.json();
      return ok({ ok: true, id: data.id });
    } catch (e) {
      return err(e.message);
    }
  }

  return err("Méthode non autorisée", 405);
};
