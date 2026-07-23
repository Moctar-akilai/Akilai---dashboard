const { BASE_URL, headers: airtableHeaders, ok, err, preflight } = require("./config");

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Method Not Allowed", 405);

  try {
    const { userId, nom, numero, email } = JSON.parse(event.body || "{}");
    if (!userId) return err("userId requis", 400);

    const searchUrl = `${BASE_URL}/Clients?filterByFormula=${encodeURIComponent(`{User ID}="${userId}"`)}&maxRecords=1`;
    const clientRes = await fetch(searchUrl, { headers: airtableHeaders });
    const clientData = await clientRes.json();
    if (!clientData.records?.length) return err("Client introuvable", 404);

    const apiKey = clientData.records[0].fields["Brevo API Key"] || "";
    if (!apiKey) return err("Brevo API Key non configuré", 400);

    const contactEmail = email || (numero ? `${numero.replace(/\s+/g, "")}@noemail.com` : null);
    if (!contactEmail) return err("email ou numero requis", 400);

    const body = {
      email:      contactEmail,
      attributes: {
        PRENOM: nom    || "",
        SMS:    numero || "",
      },
      listIds:    [2],
      updateEnabled: true,
    };

    const res = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "api-key":      apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok && res.status !== 204) {
      const t = await res.text();
      console.error("[brevo-add-contact] API error:", res.status, t);
      return err(`Brevo API ${res.status}`, 502);
    }

    return ok({ success: true });
  } catch (e) {
    console.error("[brevo-add-contact] Exception:", e.message);
    return err(e.message);
  }
};
