const { BASE_URL, headers: airtableHeaders, ok, err, preflight } = require("./config");

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Method Not Allowed", 405);

  try {
    const { userId, message, titre } = JSON.parse(event.body || "{}");
    if (!userId || !message) return err("userId et message requis", 400);

    const searchUrl = `${BASE_URL}/Clients?filterByFormula=${encodeURIComponent(`{User ID}="${userId}"`)}&maxRecords=1`;
    const clientRes = await fetch(searchUrl, { headers: airtableHeaders });
    const clientData = await clientRes.json();
    if (!clientData.records?.length) return err("Client introuvable", 404);

    const webhookUrl = clientData.records[0].fields["Teams Webhook URL"] || "";
    if (!webhookUrl) return err("Teams Webhook URL non configuré", 400);

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        "@type":    "MessageCard",
        "@context": "http://schema.org/extensions",
        summary:    titre || "Appel AkilAI",
        themeColor: "0076D7",
        sections:   [{ text: message }],
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      console.error("[send-teams-notification] Webhook error:", res.status, t);
      return err(`Teams webhook ${res.status}`, 502);
    }

    return ok({ success: true });
  } catch (e) {
    console.error("[send-teams-notification] Exception:", e.message);
    return err(e.message);
  }
};
