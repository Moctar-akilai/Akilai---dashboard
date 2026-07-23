const { BASE_URL, headers, ok, err, preflight } = require("./config");
const CLIENTS_TABLE = "tble0g9eMTjAfw6OO";

/**
 * POST — PATCH /Automatisations/{recordId}
 * Body : { id, jours, heure, recurrence }
 *   id         : Airtable record ID (recXXX)
 *   jours      : number[] — 1=Lun … 7=Dim (ex: [1,2,3,4,5])
 *   heure      : "HH:MM" (heure de début, ex: "09:00")
 *   recurrence : "quotidien"|"hebdo"|"mensuel"
 *
 * Champs Airtable cibles :
 *   "Jours actifs"   multipleSelects  ["Lundi","Mercredi",...]
 *   "Heure de Début" singleSelect     "09:00"
 *   "Heure de fin"   singleSelect     "18:00" (calculé : heure + 9h par défaut)
 */

const NUM_TO_JOUR = {
  1: "Lundi", 2: "Mardi", 3: "Mercredi",
  4: "Jeudi", 5: "Vendredi", 6: "Samedi", 7: "Dimanche",
};

exports.handler = async function(event, context) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Méthode non autorisée", 405);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch(e) { return err("JSON invalide", 400); }

  const { id, jours, heure, recurrence } = body;
  if (!id) return err("Champ id obligatoire", 400);

  /* Convertir numéros → labels français */
  const joursActifs = (jours || []).map(n => NUM_TO_JOUR[n]).filter(Boolean);
  const heureDebut  = heure || "08:00";

  /* Heure de fin = heure de début + 1h (ex: 09:00 → 10:00) */
  const [hh, mm] = heureDebut.split(":").map(Number);
  const heureFin = String((hh + 1) % 24).padStart(2, "0") + ":" + String(mm).padStart(2, "0");

  console.log("[save-programmation] id:", id, "joursActifs:", joursActifs, "heureDebut:", heureDebut, "heureFin:", heureFin);

  try {
    const res = await fetch(`${BASE_URL}/Automatisations/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        fields: {
          "Jours actifs":   joursActifs,
          "Heure de Début": heureDebut,
          "Heure de fin":   heureFin,
        },
      }),
    });

    console.log("[save-programmation] Airtable status:", res.status);

    if (!res.ok) {
      const text = await res.text();
      console.error("[save-programmation] Airtable error:", res.status, text);
      return err(`Airtable ${res.status}`, 502);
    }

    const data = await res.json();
    console.log("[save-programmation] Airtable updated fields:", JSON.stringify(data.fields));

    // Notification email admin (fire-and-forget)
    sendAdminNotif(id, data.fields, joursActifs, heureDebut, heureFin).catch(e =>
      console.error("[save-programmation] email admin error:", e.message)
    );

    return ok({ ok: true });
  } catch (e) {
    console.error("[save-programmation] Exception:", e.message);
    return err(e.message);
  }
};

async function sendAdminNotif(autoId, autoFields, joursActifs, heureDebut, heureFin) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
  const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || "";
  if (!RESEND_API_KEY || !ADMIN_EMAIL) return;

  const nomAuto = autoFields?.Nom || autoId;
  const userId  = autoFields?.["User ID"] || "";

  // Récupérer Entreprise du client
  let entreprise = userId;
  if (userId) {
    try {
      const clientRes = await fetch(
        `${BASE_URL}/${CLIENTS_TABLE}?filterByFormula=${encodeURIComponent(`{User ID}="${userId}"`)}&maxRecords=1&fields[]=Entreprise`,
        { headers }
      );
      const clientData = await clientRes.json();
      entreprise = clientData.records?.[0]?.fields?.Entreprise || userId;
    } catch (_) {}
  }

  const dateAujourdhui = new Date().toLocaleDateString("fr-FR");
  const joursStr = joursActifs.length ? joursActifs.join(", ") : "—";

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({
      from: "AkilAI <noreply@akilai.fr>",
      to: ADMIN_EMAIL,
      subject: `📅 Nouvelle programmation — ${nomAuto}`,
      html: `<div style="font-family:Arial,sans-serif;background:#0f0f0f;color:#e0e0e0;padding:32px;max-width:520px;margin:0 auto;border-radius:12px">
        <p style="color:#70B2DE;font-size:18px;font-weight:700;margin:0 0 16px">📅 Programmation modifiée</p>
        <p style="margin:0 0 20px;color:#a0a0a0">Un client vient de modifier sa programmation.</p>
        <table style="width:100%;border-collapse:collapse;background:#1a1a1a;border-radius:8px;overflow:hidden">
          <tr><td style="padding:10px 14px;color:#a0a0a0;font-size:13px;border-bottom:1px solid #2a2a2a">Client</td><td style="padding:10px 14px;font-weight:600;border-bottom:1px solid #2a2a2a">${entreprise}${userId && userId !== entreprise ? ` (${userId})` : ''}</td></tr>
          <tr><td style="padding:10px 14px;color:#a0a0a0;font-size:13px;border-bottom:1px solid #2a2a2a">Automatisation</td><td style="padding:10px 14px;font-weight:600;border-bottom:1px solid #2a2a2a">${nomAuto}</td></tr>
          <tr><td style="padding:10px 14px;color:#a0a0a0;font-size:13px;border-bottom:1px solid #2a2a2a">Jours actifs</td><td style="padding:10px 14px;border-bottom:1px solid #2a2a2a">${joursStr}</td></tr>
          <tr><td style="padding:10px 14px;color:#a0a0a0;font-size:13px;border-bottom:1px solid #2a2a2a">Heure de début</td><td style="padding:10px 14px;border-bottom:1px solid #2a2a2a">${heureDebut}</td></tr>
          <tr><td style="padding:10px 14px;color:#a0a0a0;font-size:13px;border-bottom:1px solid #2a2a2a">Heure de fin</td><td style="padding:10px 14px;border-bottom:1px solid #2a2a2a">${heureFin}</td></tr>
          <tr><td style="padding:10px 14px;color:#a0a0a0;font-size:13px">Date</td><td style="padding:10px 14px">${dateAujourdhui}</td></tr>
        </table>
      </div>`,
    }),
  });
  console.log("[save-programmation] email admin envoyé →", ADMIN_EMAIL);
}
