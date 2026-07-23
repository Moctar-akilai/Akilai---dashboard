const { BASE_URL, headers, ok, err, preflight } = require("./config");

exports.handler = async function(event, context) {
  if (event.httpMethod === "OPTIONS") return preflight();

  try {
    const email  = (event.queryStringParameters && event.queryStringParameters.email) || null;
    console.log("[get-historique] Email reçu :", email);

    const params = new URLSearchParams({ maxRecords: "100" });
    if (email) params.set("filterByFormula", `{User ID}="${email}"`);

    const res = await fetch(`${BASE_URL}/Historique?${params}`, { headers });
    console.log("[get-historique] Statut Airtable :", res.status);

    if (!res.ok) {
      const text = await res.text();
      console.error("[get-historique] Erreur Airtable :", res.status, text);
      return err(`Airtable ${res.status}`, 502);
    }

    const data    = await res.json();
    const records = (data.records || []).sort(function(a, b) {
      return new Date(b.createdTime) - new Date(a.createdTime);
    });
    console.log("[get-historique] Nb records :", records.length);

    const appels           = [];
    const conversations_wa = [];

    records.forEach(function(r, i) {
      const f    = r.fields;
      const type = (f.Type || "").toLowerCase();
      const canal = (f.Canal || "").toLowerCase();

      /* Transcription : texte brut stocké dans le champ Transcription */
      let transcription = [];
      try { transcription = f.Transcription ? JSON.parse(f.Transcription) : []; } catch(e) {
        transcription = f.Transcription ? [{ role: "assistant", text: f.Transcription }] : [];
      }

      const dateRaw = f["Date de creation"] || r.createdTime || null;
      const dt      = dateRaw ? new Date(dateRaw) : new Date();
      const date    = dt.toISOString().split("T")[0];
      const heure   = dt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }).replace(":", "h");

      /* Durée : nombre de secondes → format "Xm Ys" */
      const dureeRaw = Number(f["Durée"]) || 0;
      const dureeStr = dureeRaw
        ? `${Math.floor(dureeRaw / 60)}m ${String(dureeRaw % 60).padStart(2, "0")}s`
        : "0m 00s";

      if (type === "voix" || type === "appel" || type === "vocal" || canal === "vocal") {
        appels.push({
          id:            r.id,
          _seq:          i + 1,
          nom:           f.Titre              || "Inconnu",
          numero:        f["Numéro client"]   || "",
          date,
          heure,
          duree:         dureeStr,
          duree_sec:     dureeRaw,
          statut:        f.Statut             || "Traité",
          client_id:     f["User ID"]         || null,
          resume:        f["Résumé"]          || f.Détails || "",
          transcription,
          escalade:           !!f.Escalade,
          enregistrement:     f["Enregistrement audio"] || null,
          vapiCallId:         f["Vapi Call ID"] || null,
          automatisationIds:  Array.isArray(f["Automatisation"]) ? f["Automatisation"] : [],
        });
      } else if (type === "whatsapp" || canal === "whatsapp") {
        const messages = transcription.map(function(m) {
          return {
            role:  m.role  || "user",
            text:  m.text  || "",
            heure: m.heure || "",
          };
        });

        conversations_wa.push({
          id:            r.id,
          _seq:          i + 1,
          nom:           f.Titre             || "Inconnu",
          numero:        f["Numéro client"]  || "",
          date,
          heure,
          nb_messages:   messages.length || (f["Message entrant"] ? 1 : 0),
          client_id:     f["User ID"]        || null,
          statut:        f.Statut            || "Traité",
          intention:     f.Intention         || null,
          messageEntrant: f["Message entrant"] || "",
          details:        f["Détails"] || f["Résumé"] || "",
          messages,
          automatisationIds: Array.isArray(f["Automatisation"]) ? f["Automatisation"] : [],
        });
      }
    });

    return ok({ appels, conversations_wa });
  } catch (e) {
    console.error("[get-historique] Exception :", e.message, e.stack);
    return err(e.message);
  }
};
