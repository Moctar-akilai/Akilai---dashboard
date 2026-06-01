const { ok, err, preflight } = require("./config");

/**
 * GET /.netlify/functions/get-vapi-number?phoneNumberId=ph_xxx
 * Appelle GET https://api.vapi.ai/phone-number/{phoneNumberId}
 * Retourne { number, assistantId }
 */
exports.handler = async function(event, context) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "GET") return err("Méthode non autorisée", 405);

  const vapiKey = process.env.VAPI_API_KEY;
  if (!vapiKey) return err("VAPI_API_KEY non configuré", 500);

  const phoneNumberId = event.queryStringParameters?.phoneNumberId || null;
  if (!phoneNumberId) return err("phoneNumberId obligatoire", 400);

  console.log("[get-vapi-number] phoneNumberId:", phoneNumberId);

  try {
    const res = await fetch(`https://api.vapi.ai/phone-number/${phoneNumberId}`, {
      headers: { Authorization: `Bearer ${vapiKey}` },
    });

    console.log("[get-vapi-number] Vapi status:", res.status);

    if (!res.ok) {
      const text = await res.text();
      console.error("[get-vapi-number] Vapi error:", res.status, text);
      return err(`Vapi ${res.status}`, 502);
    }

    const data = await res.json();
    console.log("[get-vapi-number] number:", data.number, "assistantId:", data.assistantId || "none");

    return ok({
      number:      data.number      || null,
      assistantId: data.assistantId || null,
    });
  } catch (e) {
    console.error("[get-vapi-number] Exception:", e.message);
    return err(e.message);
  }
};
