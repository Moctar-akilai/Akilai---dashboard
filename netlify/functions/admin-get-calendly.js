const { preflight, corsHeaders } = require("./config");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();

  const CALENDLY_API_KEY = process.env.CALENDLY_API_KEY || "";
  if (!CALENDLY_API_KEY) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "CALENDLY_API_KEY non configuré" }) };
  }

  const calHeaders = {
    Authorization: `Bearer ${CALENDLY_API_KEY}`,
    "Content-Type": "application/json",
  };

  try {
    // Get current user to obtain organization URI
    const meRes = await fetch("https://api.calendly.com/users/me", { headers: calHeaders });
    if (!meRes.ok) {
      const text = await meRes.text();
      console.error("[admin-get-calendly] /users/me error:", meRes.status, text);
      return { statusCode: 502, headers: corsHeaders, body: JSON.stringify({ error: `Calendly ${meRes.status}` }) };
    }
    const meData = await meRes.json();
    const orgUri  = meData.resource?.current_organization || "";
    const userUri = meData.resource?.uri || "";

    // Get scheduled events (upcoming 60 days)
    const now    = new Date().toISOString();
    const future = new Date(Date.now() + 60 * 86400 * 1000).toISOString();
    const params = new URLSearchParams({
      organization: orgUri,
      min_start_time: now,
      max_start_time: future,
      status: "active",
      count: "100",
      sort: "start_time:asc",
    });

    const evRes  = await fetch(`https://api.calendly.com/scheduled_events?${params}`, { headers: calHeaders });
    const evData = await evRes.json();
    const events = evData.collection || [];

    // For each event fetch invitees (first page, max 5 per event to stay fast)
    const rdvs = await Promise.all(events.map(async (ev) => {
      const evUuid = ev.uri.split("/").pop();
      let invitees = [];
      try {
        const invRes  = await fetch(`https://api.calendly.com/scheduled_events/${evUuid}/invitees?count=5`, { headers: calHeaders });
        const invData = await invRes.json();
        invitees = (invData.collection || []).map(i => ({
          name:  i.name  || "",
          email: i.email || "",
        }));
      } catch (e) {
        console.warn("[admin-get-calendly] invitees fetch:", e.message);
      }

      return {
        uri:       ev.uri,
        uuid:      evUuid,
        name:      ev.name || "",
        startTime: ev.start_time || "",
        endTime:   ev.end_time   || "",
        status:    ev.status     || "active",
        location:  ev.location?.join_url || ev.location?.location || "",
        invitees,
      };
    }));

    // KPI: events last 30 days
    const past30Start = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
    const pastParams  = new URLSearchParams({
      organization: orgUri,
      min_start_time: past30Start,
      max_start_time: now,
      status: "active",
      count: "100",
    });
    const pastRes  = await fetch(`https://api.calendly.com/scheduled_events?${pastParams}`, { headers: calHeaders });
    const pastData = await pastRes.json();
    const pastCount = (pastData.collection || []).length;

    // Event types
    const etParams = new URLSearchParams({ user: userUri, count: "20" });
    const etRes    = await fetch(`https://api.calendly.com/event_types?${etParams}`, { headers: calHeaders });
    const etData   = await etRes.json();
    const eventTypes = (etData.collection || []).map(et => ({
      uri:          et.uri,
      name:         et.name || "",
      duration:     et.duration || 0,
      active:       et.active !== false,
      bookingUrl:   et.booking_url || et.scheduling_url || "",
    }));

    console.log("[admin-get-calendly] rdvs:", rdvs.length, "pastCount:", pastCount, "eventTypes:", eventTypes.length);
    return {
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, rdvs, pastCount, eventTypes, schedulingUrl: meData.resource?.scheduling_url || "" }),
    };
  } catch (e) {
    console.error("[admin-get-calendly] Exception:", e.message);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: e.message }) };
  }
};
