const { BASE_URL, headers, ok, err, preflight } = require("./config");
const { sendAssistantReadyEmail } = require("./send-assistant-ready-email");

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

  const { id, nomAssistant, langue, tonalite, promptSysteme, firstMessage, vitesseParole, voiceId,
          capaciteCreneau, dureeRDV, heureOuverture, heureFermeture } = body;

  if (!id) return err("Champ id obligatoire", 400);

  console.log("[update-voice-config] PATCH client :", id, "nom:", nomAssistant, "langue:", langue, "tonalite:", tonalite, "voiceId:", voiceId);

  try {
    const fields = {};
    if (nomAssistant  !== undefined) fields["NomAssistant"]  = nomAssistant;
    if (langue        !== undefined) fields["Langue"]        = langue;
    if (tonalite      !== undefined) fields["Tonalite"]      = tonalite;
    if (promptSysteme !== undefined) fields["PromptSysteme"] = promptSysteme;
    if (firstMessage  !== undefined) fields["FirstMessage"]  = firstMessage;
    if (vitesseParole   !== undefined) fields["VitesseParole"]   = Number(vitesseParole);
    if (voiceId) fields["VoiceId"] = voiceId;
    if (capaciteCreneau !== undefined) fields["Capacite Creneau"] = Number(capaciteCreneau);
    if (dureeRDV        !== undefined) fields["Duree RDV"]       = Number(dureeRDV);
    if (heureOuverture  !== undefined) fields["Heure Ouverture"] = heureOuverture;
    if (heureFermeture  !== undefined) fields["Heure Fermeture"] = heureFermeture;

    let res = await fetch(`${BASE_URL}/Clients/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ fields }),
    });

    /* Si Airtable rejette à cause du champ FirstMessage non créé, retry sans */
    if (!res.ok && firstMessage !== undefined) {
      const text = await res.text();
      if (text.includes("FirstMessage") || text.includes("UNKNOWN_FIELD_NAME")) {
        console.warn("[update-voice-config] FirstMessage non trouvé dans Airtable — retry sans ce champ");
        delete fields["FirstMessage"];
        res = await fetch(`${BASE_URL}/Clients/${id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ fields }),
        });
      } else {
        console.error("[update-voice-config] Airtable error:", res.status, text);
        return err(`Airtable ${res.status}`, 502);
      }
    }

    console.log("[update-voice-config] Airtable status:", res.status);

    if (!res.ok) {
      const text = await res.text();
      console.error("[update-voice-config] Airtable error:", res.status, text);
      return err(`Airtable ${res.status}`, 502);
    }

    const data = await res.json();
    console.log("[update-voice-config] Champs mis à jour:", JSON.stringify(Object.keys(data.fields || {})));

    /* PATCH Vapi si un assistantId existe */
    const vapiAssistantId = data.fields?.["VapiAssistantId"] || null;
    const vapiKey = process.env.VAPI_API_KEY;
    if (vapiAssistantId && vapiKey && promptSysteme !== undefined) {
      const vapiPatchBody = { model: { messages: [{ role: "system", content: promptSysteme || "" }] } };
      if (nomAssistant !== undefined) vapiPatchBody.name = nomAssistant;
      if (voiceId)                    vapiPatchBody.voice = { provider: "11labs", model: "eleven_flash_v2_5", voiceId, stability: 0.4, similarityBoost: 0.75, speed: 1.15, style: 0.3, optimizeStreamingLatency: 4, useSpeakerBoost: false, autoMode: true };
      if (firstMessage !== undefined) vapiPatchBody.firstMessage = firstMessage || "";
      if (vitesseParole !== undefined) vapiPatchBody.voice = { ...(vapiPatchBody.voice || {}), speed: Number(vitesseParole) };

      console.log("[update-voice-config] PATCH Vapi assistant:", vapiAssistantId, "| prompt length:", (promptSysteme || "").length);
      try {
        const vapiRes = await fetch(`https://api.vapi.ai/assistant/${vapiAssistantId}`, {
          method:  "PATCH",
          headers: { "Authorization": `Bearer ${vapiKey}`, "Content-Type": "application/json" },
          body:    JSON.stringify(vapiPatchBody),
        });
        const vapiText = await vapiRes.text();
        if (vapiRes.ok) {
          console.log("[update-voice-config] Vapi PATCH succès — status:", vapiRes.status);
        } else {
          console.error("[update-voice-config] Vapi PATCH erreur:", vapiRes.status, vapiText.substring(0, 300));
        }
      } catch(vapiErr) {
        console.error("[update-voice-config] Vapi PATCH exception:", vapiErr.message);
      }
    } else {
      console.log("[update-voice-config] Vapi PATCH ignoré — vapiAssistantId:", vapiAssistantId || "absent", "| vapiKey:", vapiKey ? "ok" : "manquante");
    }

    /* Fire-and-forget : email "assistant configuré" */
    const f = data.fields || {};
    if (f["Email"]) {
      sendAssistantReadyEmail({
        clientName:      f["Nom"]             || "",
        clientEmail:     f["Email"],
        assistantType:   f["AssistantType"]   || "Vocal",
        vapiPhoneNumber: f["VapiPhoneNumber"] || "",
        whatsappNumber:  f["WhatsAppNumber"]  || "",
      }).catch(e => console.error("[update-voice-config] sendAssistantReadyEmail erreur:", e.message));
    }

    return ok({ ok: true, id: data.id });
  } catch (e) {
    console.error("[update-voice-config] Exception:", e.message);
    return err(e.message);
  }
};
