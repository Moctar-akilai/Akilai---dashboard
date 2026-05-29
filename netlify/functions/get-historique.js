const { BASE_URL, headers, ok, err, preflight } = require("./config");
const { requireAuth, filterByClient } = require("./auth");

/**
 * GET /Historique — 100 derniers enregistrements du client authentifié, triés par date desc.
 * Retourne : { appels: [...], conversations_wa: [...] }
 */
exports.handler = async (event, context) => {
  if (event.httpMethod === "OPTIONS") return preflight();

  const auth = requireAuth(event, context);
  if (auth.error) return auth.error;
  const { clientId } = auth;

  try {
    const filter = filterByClient(clientId);
    const params = new URLSearchParams({
      "sort[0][field]":     "DateHeure",
      "sort[0][direction]": "desc",
      maxRecords:           "100",
    });

    const res = await fetch(`${BASE_URL}/Historique?${filter}&${params}`, { headers });
    if (!res.ok) return err(`Airtable ${res.status}`);

    const data    = await res.json();
    const records = data.records || [];

    const appels           = [];
    const conversations_wa = [];

    records.forEach((r, i) => {
      const f    = r.fields;
      const type = (f.Type || "").toLowerCase();

      let transcription = [];
      try { transcription = f.Transcription ? JSON.parse(f.Transcription) : []; } catch {}

      if (type === "voix" || type === "appel") {
        const dt   = f.DateHeure ? new Date(f.DateHeure) : new Date();
        const date = dt.toISOString().split("T")[0];
        const heure = dt.toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit" }).replace(":", "h");

        appels.push({
          id:            r.id,
          _seq:          i + 1,
          nom:           f.Nom      || "Inconnu",
          numero:        f.Numero   || "",
          date,
          heure,
          duree:         f.Duree    || "0:00",
          statut:        f.Statut   || "Traité",
          client_id:     f.ClientId || null,
          resume:        f.Resume   || "",
          transcription,
        });
      } else if (type === "whatsapp") {
        const messages = transcription.map(m => ({
          role:  m.role  || "user",
          text:  m.text  || "",
          heure: m.heure || "",
        }));

        const dt   = f.DateHeure ? new Date(f.DateHeure) : new Date();
        const date = dt.toISOString().split("T")[0];

        conversations_wa.push({
          id:          r.id,
          _seq:        i + 1,
          nom:         f.Nom      || "Inconnu",
          numero:      f.Numero   || "",
          date,
          nb_messages: Number(f.NbMessages) || messages.length,
          client_id:   f.ClientId || null,
          statut:      f.Statut   || "Traité",
          messages,
        });
      }
    });

    return ok({ appels, conversations_wa });
  } catch (e) {
    return err(e.message);
  }
};
