const { ok, err, preflight } = require("./config");

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Method Not Allowed", 405);

  const SID     = process.env.TWILIO_ACCOUNT_SID;
  const TOKEN   = process.env.TWILIO_AUTH_TOKEN;
  const FROM    = process.env.TWILIO_FROM_NUMBER;

  if (!SID || !TOKEN || !FROM) return err("Twilio non configuré", 500);

  try {
    const body     = JSON.parse(event.body || "{}");
    const msg      = body.message || body;
    const toolCall = msg.toolCallList?.[0] || msg.toolCalls?.[0];
    const args     = toolCall?.function?.arguments || body.arguments || body;
    const userId   =
      args.userId ||
      msg.call?.assistantOverrides?.metadata?.userId ||
      msg.call?.assistant?.metadata?.userId ||
      msg.call?.metadata?.userId ||
      body.userId || "";
    console.log("[vapi-tool-send-sms] userId:", userId, "| args:", JSON.stringify(args));
    const to      = args.to      || body.to      || "";
    const message = args.message || body.message || "";

    if (!to)      return err("to requis", 400);
    if (!message) return err("message requis", 400);

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
      return err(`Twilio ${res.status}`, 502);
    }

    const data = await res.json();
    console.log("[vapi-tool-send-sms] Sent to:", to, "sid:", data.sid);

    return ok({ success: true, messageSid: data.sid, message: `SMS envoyé à ${to}.` });
  } catch (e) {
    console.error("[vapi-tool-send-sms] Exception:", e.message);
    return err(e.message);
  }
};
