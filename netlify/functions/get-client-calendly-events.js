const { BASE_URL, headers: airtableHeaders, ok, err, preflight } = require("./config");

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") return preflight();

  try {
    const userId = (event.queryStringParameters || {}).userId || "";
    if (!userId) return err("userId requis", 400);

    const searchUrl = `${BASE_URL}/Clients?filterByFormula=${encodeURIComponent(`{User ID}="${userId}"`)}&maxRecords=1`;
    const clientRes = await fetch(searchUrl, { headers: airtableHeaders });
    const clientData = await clientRes.json();
    if (!clientData.records || clientData.records.length === 0) return err("Client introuvable", 404);

    const fields       = clientData.records[0].fields;
    const calendlyLink = fields["Calendly Link"] || "";
    const clientEmail  = fields.Email || userId;

    const apiKey = process.env.CALENDLY_API_KEY || "";
    const orgUri = process.env.CALENDLY_ORG_URI || "";

    if (!apiKey || !orgUri) return err("Calendly non configuré côté serveur", 500);
    if (!calendlyLink) return ok({ events: [] });

    // Fetch scheduled events for the org
    const params = new URLSearchParams({
      organization: orgUri,
      count: "50",
      status: "active",
    });

    const evRes = await fetch(`https://api.calendly.com/scheduled_events?${params}`, {
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    });

    if (!evRes.ok) {
      const t = await evRes.text();
      console.error("[get-client-calendly-events] API error:", evRes.status, t);
      return err(`Calendly API ${evRes.status}`, 502);
    }

    const evData  = await evRes.json();
    const allEvs  = evData.collection || [];

    // For each event, fetch invitees and filter by clientEmail
    const matched = [];
    for (const ev of allEvs.slice(0, 30)) {
      const invRes = await fetch(`https://api.calendly.com/scheduled_events/${ev.uri.split("/").pop()}/invitees`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!invRes.ok) continue;
      const invData = await invRes.json();
      const hasClient = (invData.collection || []).some(i => i.email === clientEmail);
      if (hasClient) {
        matched.push({
          id:        ev.uri,
          name:      ev.name,
          startTime: ev.start_time,
          endTime:   ev.end_time,
          status:    ev.status,
          joinUrl:   ev.location?.join_url || "",
        });
      }
    }

    return ok({ events: matched });
  } catch (e) {
    console.error("[get-client-calendly-events] Exception:", e.message);
    return err(e.message);
  }
};
