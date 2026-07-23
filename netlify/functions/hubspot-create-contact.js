const { BASE_URL, headers: airtableHeaders, ok, err, preflight } = require("./config");

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Method Not Allowed", 405);

  try {
    const { userId, nom, numero, email, resume } = JSON.parse(event.body || "{}");
    if (!userId) return err("userId requis", 400);

    const searchUrl = `${BASE_URL}/Clients?filterByFormula=${encodeURIComponent(`{User ID}="${userId}"`)}&maxRecords=1`;
    const clientRes = await fetch(searchUrl, { headers: airtableHeaders });
    const clientData = await clientRes.json();
    if (!clientData.records?.length) return err("Client introuvable", 404);

    const apiKey = clientData.records[0].fields["HubSpot API Key"] || "";
    if (!apiKey) return err("HubSpot API Key non configuré", 400);

    const hsHeaders = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };

    // Create or upsert contact
    const contactBody = {
      properties: {
        firstname:       nom    || "",
        phone:           numero || "",
        email:           email  || "",
        hs_lead_status:  "NEW",
      },
    };

    let contactId = null;
    const createRes = await fetch("https://api.hubapi.com/crm/v3/objects/contacts", {
      method: "POST",
      headers: hsHeaders,
      body: JSON.stringify(contactBody),
    });

    if (createRes.ok) {
      const contactData = await createRes.json();
      contactId = contactData.id;
    } else if (createRes.status === 409) {
      // Contact already exists — extract existing ID from error
      const errData = await createRes.json().catch(() => ({}));
      contactId = errData.message?.match(/ID: (\d+)/)?.[1] || null;
    } else {
      const t = await createRes.text();
      console.error("[hubspot-create-contact] Contact error:", createRes.status, t);
    }

    // Add note if resume provided
    if (resume && contactId) {
      const noteBody = {
        properties: {
          hs_note_body:  resume,
          hs_timestamp:  String(Date.now()),
        },
        associations: [{
          to:    { id: contactId },
          types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }],
        }],
      };
      await fetch("https://api.hubapi.com/crm/v3/objects/notes", {
        method: "POST",
        headers: hsHeaders,
        body: JSON.stringify(noteBody),
      });
    }

    return ok({ success: true, contactId });
  } catch (e) {
    console.error("[hubspot-create-contact] Exception:", e.message);
    return err(e.message);
  }
};
