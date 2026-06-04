const { BASE_URL, headers, ok, err, preflight } = require("./config");

/**
 * POST — PATCH /Clients/{recordId}
 * Body : {
 *   id            : Airtable record ID du client (recXXX)
 *   nomAssistant  : string
 *   langue        : string (ex: "fr", "en")
 *   tonalite      : string (ex: "Professionnel", "Amical", ...)
 *   promptSysteme : string
 *   vitesseParole : number (0.5 – 2.0)
 *   voiceId       : string (ElevenLabs voice_id)
 * }
 */
exports.handler = async function(event, context) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Méthode non autorisée", 405);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch(e) { return err("JSON invalide", 400); }

  const { id, nomAssistant, langue, tonalite, promptSysteme, vitesseParole, voiceId,
          capaciteCreneau, dureeRDV, heureOuverture, heureFermeture } = body;

  if (!id) return err("Champ id obligatoire", 400);

  console.log("[update-voice-config] PATCH client :", id, "nom:", nomAssistant, "langue:", langue, "tonalite:", tonalite, "voiceId:", voiceId);

  try {
    const fields = {};
    if (nomAssistant  !== undefined) fields["NomAssistant"]  = nomAssistant;
    if (langue        !== undefined) fields["Langue"]        = langue;
    if (tonalite      !== undefined) fields["Tonalite"]      = tonalite;
    if (promptSysteme !== undefined) fields["PromptSysteme"] = promptSysteme;
    if (vitesseParole   !== undefined) fields["VitesseParole"]   = Number(vitesseParole);
    if (voiceId         !== undefined) fields["VoiceId"]         = voiceId;
    if (capaciteCreneau !== undefined) fields["Capacite Creneau"] = Number(capaciteCreneau);
    if (dureeRDV        !== undefined) fields["Duree RDV"]       = Number(dureeRDV);
    if (heureOuverture  !== undefined) fields["Heure Ouverture"] = heureOuverture;
    if (heureFermeture  !== undefined) fields["Heure Fermeture"] = heureFermeture;

    const res = await fetch(`${BASE_URL}/Clients/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ fields }),
    });

    console.log("[update-voice-config] Airtable status:", res.status);

    if (!res.ok) {
      const text = await res.text();
      console.error("[update-voice-config] Airtable error:", res.status, text);
      return err(`Airtable ${res.status}`, 502);
    }

    const data = await res.json();
    console.log("[update-voice-config] Champs mis à jour:", JSON.stringify(Object.keys(data.fields || {})));
    return ok({ ok: true, id: data.id });
  } catch (e) {
    console.error("[update-voice-config] Exception:", e.message);
    return err(e.message);
  }
};
