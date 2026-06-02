/**
 * calendly-webhook.js
 * Receives Calendly webhook events (invitee.created, invitee.canceled).
 * On invitee.created: creates or updates a Lead in Airtable with status "Démo planifiée".
 * Configure in Calendly Dashboard → Webhooks → URL:
 *   https://{site}.netlify.app/.netlify/functions/calendly-webhook
 */

const { BASE_URL, headers, preflight, corsHeaders } = require("./config");

const LEADS_TABLE = "tblXJoVNtimnvGRBl";

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: "Method not allowed" };
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) {
    return { statusCode: 400, headers: corsHeaders, body: "JSON invalide" };
  }

  const eventType = body.event || "";
  console.log("[calendly-webhook] event:", eventType);

  if (!["invitee.created", "invitee.canceled"].includes(eventType)) {
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true, ignored: true }) };
  }

  const payload   = body.payload || {};
  const invitee   = payload.invitee || {};
  const eventInfo = payload.event   || {};

  const email    = invitee.email || "";
  const name     = invitee.name  || "";
  const nameParts = name.trim().split(" ");
  const prenom   = nameParts[0] || "";
  const nom      = nameParts.slice(1).join(" ") || nameParts[0] || "";
  const startTime = eventInfo.start_time || payload.scheduled_event?.start_time || "";
  const eventName = eventInfo.name       || payload.scheduled_event?.name       || "RDV Calendly";
  const rdvUri    = payload.scheduled_event?.uri || "";

  if (!email) {
    console.warn("[calendly-webhook] No email in payload");
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true, ignored: true }) };
  }

  try {
    // Check if lead already exists with this email
    const searchParams = new URLSearchParams({
      filterByFormula: `{Email}="${email}"`,
      maxRecords: "1",
    });
    const searchRes  = await fetch(`${BASE_URL}/${LEADS_TABLE}?${searchParams}`, { headers });
    const searchData = await searchRes.json();
    const existing   = (searchData.records || [])[0];

    const today = new Date().toISOString().split("T")[0];

    if (eventType === "invitee.created") {
      if (existing) {
        // Update existing lead
        await fetch(`${BASE_URL}/${LEADS_TABLE}/${existing.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ fields: {
            "Statut":                "Démo planifiée",
            "Lien RDV Calendly":     rdvUri || existing.fields["Lien RDV Calendly"] || "",
            "Date dernière action":  today,
            "Notes": (existing.fields["Notes"] || "") + `\n[${today}] RDV Calendly planifié: ${eventName} le ${startTime ? new Date(startTime).toLocaleDateString("fr-FR") : "?"}`,
          }}),
        });
        console.log("[calendly-webhook] Updated lead:", existing.id);
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true, updated: true, leadId: existing.id }) };
      } else {
        // Create new lead
        const createRes  = await fetch(`${BASE_URL}/${LEADS_TABLE}`, {
          method: "POST",
          headers,
          body: JSON.stringify({ fields: {
            "Nom":                   nom || name,
            "Prénom":                prenom,
            "Email":                 email,
            "Source":                "Calendly",
            "Statut":                "Démo planifiée",
            "Lien RDV Calendly":     rdvUri,
            "Date entrée":           today,
            "Date dernière action":  today,
            "Notes":                 `RDV Calendly: ${eventName}${startTime ? " le " + new Date(startTime).toLocaleDateString("fr-FR") : ""}`,
          }}),
        });
        const createData = await createRes.json();
        if (createData.error) {
          console.error("[calendly-webhook] create lead error:", createData.error.message);
          return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: false, error: createData.error.message }) };
        }
        console.log("[calendly-webhook] Created lead:", createData.id);
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true, created: true, leadId: createData.id }) };
      }
    } else if (eventType === "invitee.canceled" && existing) {
      // Revert status if not already further in pipeline
      const currentStatut = existing.fields["Statut"] || "";
      const revertable    = ["Prospect", "Contacté", "Démo planifiée"].includes(currentStatut);
      if (revertable) {
        await fetch(`${BASE_URL}/${LEADS_TABLE}/${existing.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ fields: {
            "Statut":               "Contacté",
            "Date dernière action": today,
            "Notes": (existing.fields["Notes"] || "") + `\n[${today}] RDV Calendly annulé: ${eventName}`,
          }}),
        });
        console.log("[calendly-webhook] Reverted lead to Contacté:", existing.id);
      }
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true, canceled: true }) };
    }

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    console.error("[calendly-webhook] Exception:", e.message);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: e.message }) };
  }
};
