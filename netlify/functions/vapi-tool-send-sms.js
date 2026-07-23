const { preflight } = require("./config");

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  const SID   = process.env.TWILIO_ACCOUNT_SID;
  const TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const FROM  = process.env.TWILIO_FROM_NUMBER;

  try {
    const body       = JSON.parse(event.body || "{}");
    const vapiMsg    = body.message || body;
    const toolCall   = vapiMsg.toolCallList?.[0] || vapiMsg.toolCalls?.[0];
    const toolCallId = toolCall?.id || "tool-call-1";
    const args       = toolCall?.function?.arguments || body.arguments || body;
    const userId     =
      event.headers?.["x-user-id"] ||
      event.headers?.["X-User-Id"] ||
      args.userId ||
      body.userId || "";
    console.log("[vapi-tool-send-sms] userId:", userId, "| args:", JSON.stringify(args));

    const to      = args.to      || body.to      || "";
    const message = args.message || body.smsText || "";

    const vapiError = (msg) => ({
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results: [{ toolCallId, result: msg }] }),
    });

    if (!SID || !TOKEN || !FROM) return vapiError("Twilio non configuré.");
    if (!to)      return vapiError("Numéro destinataire manquant.");
    if (!message) return vapiError("Message SMS manquant.");

    const formData = new URLSearchParams({ To: to, From: FROM, Body: message });

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: "Basic " + Buffer.from(`${SID}:${TOKEN}`).toString("base64"),
        },
        body: formData.toString(),
      }
    );

    if (!res.ok) {
      const t = await res.text();
      console.error("[vapi-tool-send-sms] Twilio error:", res.status, t);
      return vapiError(`Erreur Twilio ${res.status}.`);
    }

    const data       = await res.json();
    const resultText = `SMS envoyé à ${to}.`;
    console.log("[vapi-tool-send-sms] Sent to:", to, "sid:", data.sid);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results: [{ toolCallId, result: resultText }] }),
    };
  } catch (e) {
    console.error("[vapi-tool-send-sms] ERREUR:", e.message, e.stack);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results: [{ toolCallId: "tool-call-1", result: "Erreur: " + e.message }] }),
    };
  }
};
