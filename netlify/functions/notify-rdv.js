const { BASE_URL, headers, ok, err, preflight } = require("./config");
const { buildEmail } = require("./email-template");

function getTermeContact(secteur) {
  const s = (secteur || "").toLowerCase();
  if (s.includes("médical") || s.includes("medical") || s.includes("santé") || s.includes("dentaire") || s.includes("pharmacie")) return "Patient";
  if (s.includes("restaurant") || s.includes("hôtel") || s.includes("hotel") || s.includes("conciergerie")) return "Convive";
  if (s.includes("formation") || s.includes("coaching")) return "Apprenant";
  if (s.includes("juridique") || s.includes("avocat") || s.includes("notaire") || s.includes("coiffure") || s.includes("esthétique") || s.includes("beauté") || s.includes("spa")) return "Client";
  return "Contact";
}

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Méthode non autorisée", 405);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch(e) { return err("JSON invalide", 400); }

  const { userId, nomPatient, date, heure, titre, telephone, eventLink, secteur, clientEmail, clientNom } = body;
  if (!userId) return err("userId manquant", 400);

  const terme = getTermeContact(secteur);

  console.log("[notify-rdv] userId:", userId, "| terme:", terme, "| secteur:", secteur, "| nomPatient:", nomPatient);

  /* Récupérer l'email du client si non fourni */
  let toEmail = clientEmail || "";
  let toNom   = clientNom  || "";
  if (!toEmail) {
    try {
      const searchRes  = await fetch(
        `${BASE_URL}/Clients?filterByFormula=${encodeURIComponent(`{User ID}="${userId}"`)}&maxRecords=1&fields[]=Email&fields[]=Nom`,
        { headers }
      );
      const searchData = await searchRes.json();
      const record     = searchData.records?.[0];
      toEmail = record?.fields?.Email || "";
      toNom   = record?.fields?.Nom   || "";
    } catch (e) {
      console.warn("[notify-rdv] impossible de récupérer l'email client:", e.message);
    }
  }

  if (!toEmail) {
    console.warn("[notify-rdv] email client introuvable — notification ignorée");
    return ok({ success: false, reason: "no_client_email" });
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
  if (!RESEND_API_KEY) {
    console.warn("[notify-rdv] RESEND_API_KEY absent");
    return ok({ success: false, reason: "no_resend_key" });
  }

  const sujet = `📅 Nouveau RDV — ${terme} : ${nomPatient}${date ? ` le ${date}` : ""}`;
  const corps = [
    `Un nouveau rendez-vous vient d'être confirmé par votre assistant vocal AkilAI.`,
    `<strong>${terme} :</strong> ${nomPatient}${telephone ? ` &nbsp;·&nbsp; 📞 ${telephone}` : ""}`,
    date && heure ? `<strong>Date :</strong> ${date} à ${heure}` : date ? `<strong>Date :</strong> ${date}` : "",
    titre ? `<strong>Motif :</strong> ${titre}` : "",
  ].filter(Boolean);

  const { subject, html, text } = buildEmail({
    sujet,
    titre:   `📅 Nouveau RDV confirmé`,
    corps,
    badge:   `Nouveau ${terme}`,
    ...(eventLink ? { cta_label: "Voir dans Google Calendar", cta_url: eventLink } : {}),
  });

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from:    "AkilAI <noreply@akilai.fr>",
        to:      [toEmail],
        subject: subject || sujet,
        html,
        text,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("[notify-rdv] Resend error:", res.status, JSON.stringify(data));
      return ok({ success: false, reason: "resend_error", status: res.status });
    }
    console.log("[notify-rdv] email envoyé à", toEmail, "| id:", data.id);
    return ok({
      success: true,
      notification: {
        titre:   "📅 Nouveau RDV confirmé",
        message: `${terme} : ${nomPatient}${date && heure ? ` — ${date} à ${heure}` : ""}`,
        terme,
      },
    });
  } catch (e) {
    console.error("[notify-rdv] exception:", e.message);
    return ok({ success: false, reason: e.message });
  }
};

exports.getTermeContact = getTermeContact;
