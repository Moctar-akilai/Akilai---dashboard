const { BASE_URL, headers, ok, err, preflight } = require("./config");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();

  if (event.httpMethod === "GET") {
    try {
      const res = await fetch(`${BASE_URL}/Configurations?maxRecords=1`, { headers });
      if (!res.ok) return err(`Airtable ${res.status}`, 502);

      const data = await res.json();
      const rec  = data.records?.[0];
      if (!rec) return ok({ config: null });

      const f = rec.fields;
      return ok({
        config: {
          _id:           rec.id,
          nomAssistant:  f.NomAssistant  || "Sophie",
          voix:          f.Voix          || "",
          voiceName:     f.VoiceName     || "",
          tonalite:      f.Tonalite      || "neutre",
          personnalite:  f.Personnalite  || "efficace",
          langue:        f.Langue        || "fr",
          langueSecours: f.LangueSecours || "none",
          vitesseParole: Number(f.VitesseParole) || 1.0,
          silenceMax:    Number(f.SilenceMax)    || 8,
          interruptions: Boolean(f.Interruptions),
          promptSysteme: f.PromptSysteme || "",
        },
      });
    } catch (e) {
      return err(e.message);
    }
  }

  if (event.httpMethod === "POST") {
    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { return err("JSON invalide", 400); }

    const { _id, ...cfg } = body;

    const fields = {
      NomAssistant:  cfg.nomAssistant,
      Voix:          cfg.voix,
      VoiceName:     cfg.voiceName,
      Tonalite:      cfg.tonalite,
      Personnalite:  cfg.personnalite,
      Langue:        cfg.langue,
      LangueSecours: cfg.langueSecours,
      VitesseParole: cfg.vitesseParole,
      SilenceMax:    cfg.silenceMax,
      Interruptions: cfg.interruptions,
      PromptSysteme: cfg.promptSysteme,
    };

    try {
      let recordId = _id;

      if (!recordId) {
        const findRes  = await fetch(`${BASE_URL}/Configurations?maxRecords=1`, { headers });
        const findData = findRes.ok ? await findRes.json() : { records: [] };
        recordId = findData.records?.[0]?.id || null;
      }

      let res;
      if (recordId) {
        res = await fetch(`${BASE_URL}/Configurations/${recordId}`, {
          method: "PATCH", headers, body: JSON.stringify({ fields }),
        });
      } else {
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
