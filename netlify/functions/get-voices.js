const { ok, err, preflight } = require("./config");

/**
 * GET — Retourne la liste des voix ElevenLabs disponibles.
 *
 * Appel : GET https://api.elevenlabs.io/v1/voices
 * Header : xi-api-key: ELEVENLABS_API_KEY
 *
 * Retourne : [{ voice_id, name, preview_url, labels }]
 *
 * Variable d'env requise : ELEVENLABS_API_KEY
 */
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "GET") return err("Méthode non autorisée", 405);

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return err("ELEVENLABS_API_KEY non configuré", 500);

  try {
    const res = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": apiKey },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[get-voices] ElevenLabs API error:", res.status, text);
      return err(`ElevenLabs API ${res.status}: ${text}`, 502);
    }

    const data = await res.json();
    const voices = (data.voices || []).map((v) => ({
      voice_id:    v.voice_id,
      name:        v.name,
      preview_url: v.preview_url,
      labels:      v.labels || {},
    }));

    return ok({ ok: true, voices });
  } catch (e) {
    console.error("[get-voices]", e.message);
    return err(e.message);
  }
};
