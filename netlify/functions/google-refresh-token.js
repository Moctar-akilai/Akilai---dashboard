const { BASE_URL, headers: airtableHeaders, corsHeaders, ok, err, preflight } = require("./config");

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") return preflight();

  try {
    const { recordId, refreshToken } = JSON.parse(event.body || "{}");
    if (!recordId || !refreshToken) return err("recordId et refreshToken requis", 400);

    const clientId     = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id:     clientId,
        client_secret: clientSecret,
        grant_type:    "refresh_token",
      }),
    });

    if (!tokenRes.ok) {
      const t = await tokenRes.text();
      console.error("[google-refresh-token] Erreur:", tokenRes.status, t);
      return err("Impossible de rafraîchir le token Google", 502);
    }

    const { access_token } = await tokenRes.json();

    // Update access token in Airtable
    await fetch(`${BASE_URL}/Clients/${recordId}`, {
      method: "PATCH",
      headers: airtableHeaders,
      body: JSON.stringify({ fields: { "Google Access Token": access_token } }),
    });

    return ok({ access_token });
  } catch (e) {
    console.error("[google-refresh-token] Exception:", e.message);
    return err(e.message);
  }
};
