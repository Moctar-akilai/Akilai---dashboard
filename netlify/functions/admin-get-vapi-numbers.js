const { ok, err, preflight } = require("./config");
const { verifyAdminToken, unauthorized } = require("./admin-utils");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (!verifyAdminToken(event)) return unauthorized();

  const VAPI_API_KEY = process.env.VAPI_API_KEY || "";
  if (!VAPI_API_KEY) return err("VAPI_API_KEY non configurée", 503);

  try {
    const [numRes, asstRes] = await Promise.all([
      fetch("https://api.vapi.ai/phone-number", { headers: { Authorization: `Bearer ${VAPI_API_KEY}` } }),
      fetch("https://api.vapi.ai/assistant", { headers: { Authorization: `Bearer ${VAPI_API_KEY}` } }),
    ]);

    const [numData, asstData] = await Promise.all([
      numRes.ok ? numRes.json() : { items: [] },
      asstRes.ok ? asstRes.json() : { items: [] },
    ]);

    const numbers = (numData.results || numData.items || numData || []).map(n => ({
      id: n.id,
      numero: n.number || n.twilioPhoneNumber || n.vonagePhoneNumber || "",
      label: n.name || n.label || "",
      assistantId: n.assistantId || null,
      provider: n.provider || "",
    }));

    const assistants = (asstData.results || asstData.items || asstData || []).map(a => ({
      id: a.id,
      nom: a.name || "",
      modele: a.model?.model || a.model?.provider || "",
      voix: a.voice?.voiceId || a.voice?.voice || "",
      statut: a.isActive === false ? "Inactif" : "Actif",
    }));

    return ok({ numbers, assistants });
  } catch (e) {
    return err(e.message);
  }
};
