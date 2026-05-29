const { ok, err, preflight } = require("./config");

exports.handler = async function(event, context) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "GET") return err("Méthode non autorisée", 405);

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error("[get-voices] ELEVENLABS_API_KEY non configurée");
    return err("ELEVENLABS_API_KEY non configuré", 500);
  }

  console.log("[get-voices] Appel ElevenLabs API...");

  try {
    const res = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": apiKey },
    });

    console.log("[get-voices] Statut ElevenLabs :", res.status);

    if (!res.ok) {
      const text = await res.text();
      console.error("[get-voices] Erreur ElevenLabs :", res.status, text);
      return err("ElevenLabs " + res.status + ": " + text, 502);
    }

    const data   = await res.json();
    const voices = (data.voices || []).map(function(v) {
      return {
        voice_id:    v.voice_id,
        name:        v.name,
        preview_url: v.preview_url,
        labels:      v.labels || {},
      };
    });

    console.log("[get-voices] Nb voix reçues :", voices.length);
    if (voices.length > 0) {
      console.log("[get-voices] Première voix :", voices[0].name, voices[0].voice_id);
    }

    return ok({ ok: true, voices });
  } catch (e) {
    console.error("[get-voices] Exception :", e.message, e.stack);
    return err(e.message);
  }
};
