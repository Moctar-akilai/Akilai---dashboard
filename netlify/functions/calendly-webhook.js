/**
 * calendly-webhook.js
 * Reçoit les événements webhook Calendly (invitee.created, invitee.canceled).
 * - Crée ou met à jour un Lead dans Airtable avec statut "Démo planifiée"
 * - Envoie un email de notification à ADMIN_EMAIL via Resend
 *
 * URL webhook à configurer dans Calendly :
 *   https://portal-akilai.netlify.app/.netlify/functions/calendly-webhook
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

  // Logger le payload pour débogage (tronqué)
  const payload = body.payload || {};
  console.log("[calendly-webhook] payload:", JSON.stringify(payload).substring(0, 1500));

  if (!["invitee.created", "invitee.canceled"].includes(eventType)) {
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true, ignored: true }) };
  }

  // ── Extraire les données invitee ──
  const name      = payload.name  || "";
  const email     = payload.email || "";
  const nameParts = name.trim().split(" ");
  const prenom    = nameParts[0] || "";
  const nom       = nameParts.slice(1).join(" ") || nameParts[0] || "";

  // Téléphone : chercher dans questions_and_answers
  let telephone = "";
  const qna = payload.questions_and_answers || [];
  for (const qa of qna) {
    const q = (qa.question || "").toLowerCase();
    if (q.includes("téléphone") || q.includes("telephone") || q.includes("phone") || q.includes("mobile")) {
      telephone = qa.answer || "";
      break;
    }
  }

  // Infos RDV
  const scheduledEvent = payload.scheduled_event || {};
  const typeRDV        = payload.event_type?.name || scheduledEvent.name || "RDV Calendly";
  const dateRDV        = scheduledEvent.start_time || "";
  const location       = scheduledEvent.location || {};
  const lienRDV        = location.join_url || location.location || "";
  const annulerUrl     = payload.cancel_url     || "";
  const replanifierUrl = payload.reschedule_url  || "";
  const today          = new Date().toISOString().split("T")[0];

  console.log("[calendly-webhook] nom:", name, "| email:", email, "| tel:", telephone, "| typeRDV:", typeRDV, "| dateRDV:", dateRDV);

  if (!email) {
    console.warn("[calendly-webhook] email absent du payload — ignoré");
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true, ignored: true, reason: "no_email" }) };
  }

  const dateRDVFr = dateRDV
    ? new Date(dateRDV).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "";

  try {
    // ── Rechercher lead existant par email ──
    const searchParams = new URLSearchParams({
      filterByFormula: `{Email}="${email}"`,
      maxRecords: "1",
    });
    const searchRes  = await fetch(`${BASE_URL}/${LEADS_TABLE}?${searchParams}`, { headers });
    const searchData = await searchRes.json();
    const existing   = (searchData.records || [])[0];

    let leadId;
    let action;

    if (eventType === "invitee.created") {
      if (existing) {
        // ── PATCH lead existant ──
        const patchFields = {
          "Statut":               "Démo planifiée",
          "Date dernière action": today,
        };
        if (lienRDV)   patchFields["Lien RDV Calendly"] = lienRDV;
        if (telephone) patchFields["Téléphone"]         = telephone;

        const noteAddition = `\n[${today}] RDV Calendly planifié : ${typeRDV}${dateRDVFr ? " le " + dateRDVFr : ""}`;
        patchFields["Notes"] = (existing.fields["Notes"] || "") + noteAddition;

        await fetch(`${BASE_URL}/${LEADS_TABLE}/${existing.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ fields: patchFields, typecast: true }),
        });
        leadId = existing.id;
        action = "updated";
        console.log("[calendly-webhook] Lead existant mis à jour:", leadId);
      } else {
        // ── POST nouveau lead ──
        const createFields = {
          "Nom":                   nom || name,
          "Prénom":                prenom,
          "Email":                 email,
          "Téléphone":             telephone,
          "Source":                "Calendly",
          "Statut":                "Démo planifiée",
          "Lien RDV Calendly":     lienRDV,
          "Date entrée":           today,
          "Date dernière action":  today,
          "Notes":                 `RDV pris le ${dateRDVFr || today} — ${typeRDV}`,
        };

        const createRes  = await fetch(`${BASE_URL}/${LEADS_TABLE}`, {
          method: "POST",
          headers,
          body: JSON.stringify({ fields: createFields, typecast: true }),
        });
        const createData = await createRes.json();
        if (createData.error) {
          console.error("[calendly-webhook] Erreur création lead:", createData.error.message);
          return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: false, error: createData.error.message }) };
        }
        leadId = createData.id;
        action = "created";
        console.log("[calendly-webhook] Nouveau lead créé:", leadId);
      }

      // ── Email notification admin ──
      await sendAdminNotif({ nom: name, email, typeRDV, dateRDVFr, action });

      return {
        statusCode: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ ok: true, action, leadId }),
      };

    } else if (eventType === "invitee.canceled") {
      if (!existing) {
        console.warn("[calendly-webhook] RDV annulé mais aucun lead trouvé pour:", email);
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true, canceled: true, found: false }) };
      }

      const currentStatut = existing.fields["Statut"] || "";
      const revertable    = ["Prospect", "Contacté", "Démo planifiée"].includes(currentStatut);

      const noteAddition  = `\n[${today}] RDV Calendly annulé : ${typeRDV}${dateRDVFr ? " le " + dateRDVFr : ""}`;
      const patchFields   = {
        "Notes":                (existing.fields["Notes"] || "") + noteAddition,
        "Date dernière action": today,
      };
      if (revertable) patchFields["Statut"] = "Contacté";

      await fetch(`${BASE_URL}/${LEADS_TABLE}/${existing.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ fields: patchFields, typecast: true }),
      });
      console.log("[calendly-webhook] Lead marqué annulé:", existing.id, "| statut revert:", revertable);
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true, canceled: true, leadId: existing.id }) };
    }

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    console.error("[calendly-webhook] Exception:", e.message);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: e.message }) };
  }
};

async function sendAdminNotif({ nom, email, typeRDV, dateRDVFr, action }) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
  const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || "";
  if (!RESEND_API_KEY || !ADMIN_EMAIL) return;

  const actionLabel = action === "created" ? "Nouveau lead créé" : "Lead existant mis à jour";
  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
      <div style="background:#1a1a2e;padding:24px;border-radius:12px 12px 0 0;text-align:center">
        <span style="font-size:32px">📅</span>
        <h2 style="color:#70B2DE;margin:8px 0 0">Nouveau RDV Calendly</h2>
      </div>
      <div style="background:#f9f9f9;padding:24px;border-radius:0 0 12px 12px">
        <p style="color:#333;font-size:14px">Un prospect vient de prendre un RDV via Calendly.</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px">
          <tr><td style="padding:8px 0;color:#666;font-size:13px;width:130px">Nom</td><td style="padding:8px 0;font-weight:600;font-size:13px">${nom}</td></tr>
          <tr><td style="padding:8px 0;color:#666;font-size:13px">Email</td><td style="padding:8px 0;font-size:13px"><a href="mailto:${email}">${email}</a></td></tr>
          <tr><td style="padding:8px 0;color:#666;font-size:13px">Type RDV</td><td style="padding:8px 0;font-size:13px">${typeRDV}</td></tr>
          ${dateRDVFr ? `<tr><td style="padding:8px 0;color:#666;font-size:13px">Date</td><td style="padding:8px 0;font-weight:600;font-size:13px;color:#16a34a">${dateRDVFr}</td></tr>` : ""}
        </table>
        <div style="margin-top:20px;padding:12px 16px;background:#e8f5e9;border-radius:8px;font-size:13px;color:#166534">
          ✅ ${actionLabel} dans votre CRM AkilAI
        </div>
      </div>
    </div>`;

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from:    "AkilAI <noreply@akilai.fr>",
        to:      ADMIN_EMAIL,
        subject: `📅 Nouveau RDV Calendly — ${nom}`,
        html,
      }),
    });
    console.log("[calendly-webhook] Email admin envoyé à:", ADMIN_EMAIL);
  } catch (e) {
    console.warn("[calendly-webhook] Email admin échec:", e.message);
  }
}
