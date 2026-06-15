const BASE_ID   = "appQapY4J7WC1iW4F";
const TABLE_ID  = "tblXJoVNtimnvGRBl";
const BASE_URL  = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`;
const RECAP_TO  = "mohamed.diop@akilai.fr";
const FROM_EMAIL = "AkilAI <bonjour@akilai.fr>";
const AGENT_URL  = "https://portal-akilai.netlify.app/.netlify/functions/agent-prospection";

/* ─── Helpers ────────────────────────────────────────────────── */

function airtableHeaders() {
  return {
    Authorization:  `Bearer ${process.env.AIRTABLE_API_KEY}`,
    "Content-Type": "application/json",
  };
}

function daysSince(dateStr) {
  if (!dateStr) return 999;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / 86_400_000);
}

async function fetchLeads() {
  const filterFormula = encodeURIComponent(
    `OR({Statut}="Contacté",{Statut}="Prospect chaud")`
  );
  const fields = ["Statut", "Date dernière action", "Date entrée", "Prénom", "Nom", "Entreprise", "Email"]
    .map(f => `fields[]=${encodeURIComponent(f)}`).join("&");

  let records = [];
  let offset  = "";

  do {
    const url = `${BASE_URL}?filterByFormula=${filterFormula}&${fields}${offset ? `&offset=${offset}` : ""}`;
    const res = await fetch(url, { headers: airtableHeaders() });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Airtable GET ${res.status}: ${t}`);
    }
    const data = await res.json();
    records = records.concat(data.records || []);
    offset  = data.offset || "";
  } while (offset);

  return records;
}

async function callEnvoyer(airtable_id, type) {
  const res = await fetch(`${AGENT_URL}?action=envoyer`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ airtable_id, type }),
  });
  const data = await res.json();
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

async function sendRecap({ date, total, j3, j7, skipped, errors }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[CRON] RESEND_API_KEY absent — email récap ignoré");
    return;
  }

  const corps = `Récapitulatif des relances automatiques AkilAI du ${date}.

Leads analysés   : ${total}
Relances J+3 envoyées : ${j3}
Relances J+7 envoyées : ${j7}
Leads ignorés (bloqués / pas encore dus) : ${skipped}
Erreurs : ${errors.length > 0 ? errors.join(", ") : "aucune"}

—
AkilAI · https://akilai.fr`;

  const res = await fetch("https://api.resend.com/emails", {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      Authorization:   `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from:    FROM_EMAIL,
      to:      [RECAP_TO],
      subject: `[AkilAI] Récap relances du ${date}`,
      text:    corps,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error("[CRON] Resend recap erreur:", res.status, t);
  }
}

/* ─── Handler ────────────────────────────────────────────────── */

exports.handler = async function() {
  const today = new Date().toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
  console.log(`[CRON agent-prospection] Démarrage — ${today}`);

  let leads;
  try {
    leads = await fetchLeads();
  } catch (e) {
    console.error("[CRON] Erreur fetchLeads:", e.message);
    return { statusCode: 500, body: e.message };
  }

  console.log(`[CRON] ${leads.length} leads récupérés (statut Contacté ou Prospect chaud)`);

  let j3Count = 0, j7Count = 0, skipped = 0;
  const errors = [];

  for (const record of leads) {
    const id      = record.id;
    const f       = record.fields || {};
    const statut  = f["Statut"]               || "";
    const label   = `${f["Prénom"] || ""} ${f["Nom"] || ""} (${f["Entreprise"] || id})`.trim();
    const jours   = daysSince(f["Date dernière action"] || f["Date entrée"]);

    /* Leads bloqués — ne jamais toucher */
    if (["Perdu", "Prospect", "Démo planifiée", "Proposition envoyée", "Gagné"].includes(statut)) {
      console.log(`[CRON] ${id} — ${label} — statut "${statut}" ignoré`);
      skipped++;
      continue;
    }

    /* Contacté depuis ≥ 3 jours → relance J+3 */
    if (statut === "Contacté" && jours >= 3) {
      try {
        await callEnvoyer(id, "J3");
        console.log(`[CRON] ${id} — ${label} — J+3 envoyé (${jours}j depuis dernière action)`);
        j3Count++;
      } catch (e) {
        console.error(`[CRON] ${id} — ${label} — J+3 ERREUR:`, e.message);
        errors.push(`${id}:J3:${e.message}`);
      }
      continue;
    }

    /* Prospect chaud depuis ≥ 4 jours → relance J+7 */
    if (statut === "Prospect chaud" && jours >= 4) {
      try {
        await callEnvoyer(id, "J7");
        console.log(`[CRON] ${id} — ${label} — J+7 envoyé (${jours}j depuis dernière action)`);
        j7Count++;
      } catch (e) {
        console.error(`[CRON] ${id} — ${label} — J+7 ERREUR:`, e.message);
        errors.push(`${id}:J7:${e.message}`);
      }
      continue;
    }

    console.log(`[CRON] ${id} — ${label} — statut "${statut}" ${jours}j — pas encore dû, ignoré`);
    skipped++;
  }

  console.log(`[CRON] Terminé — J+3: ${j3Count}, J+7: ${j7Count}, ignorés: ${skipped}, erreurs: ${errors.length}`);

  await sendRecap({ date: today, total: leads.length, j3: j3Count, j7: j7Count, skipped, errors });

  return { statusCode: 200, body: JSON.stringify({ ok: true, j3: j3Count, j7: j7Count, skipped, errors }) };
};
