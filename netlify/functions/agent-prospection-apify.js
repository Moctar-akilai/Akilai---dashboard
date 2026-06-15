/**
 * agent-prospection-apify.js — Scheduled function (lundi 07h00 UTC)
 *
 * Scrape des leads Toulouse via Apify Google Maps Scraper,
 * déduplique avec Airtable, et injecte les nouveaux leads
 * dans agent-prospection?action=score.
 *
 * Note : les Netlify Scheduled Functions tournent en mode background
 * (15 min max), pas 26s. Le timeout Apify par secteur est 5 min.
 */

const AIRTABLE_BASE  = "appQapY4J7WC1iW4F";
const AIRTABLE_TABLE = "tblXJoVNtimnvGRBl";
const AIRTABLE_URL   = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}`;
const APIFY_BASE     = "https://api.apify.com/v2";
const APIFY_ACTOR    = "nwua9Gu5YrADL7ZDj";
const AGENT_URL      = "https://portal-akilai.netlify.app/.netlify/functions/agent-prospection";
const RECAP_TO       = "mohamed.diop@akilai.fr";
const FROM_EMAIL     = "AkilAI <bonjour@akilai.fr>";

const SECTEURS = [
  { query: "cabinet médical Toulouse",    secteur: "médical" },
  { query: "restaurant Toulouse",         secteur: "restaurant" },
  { query: "agence immobilière Toulouse", secteur: "immobilier" },
  { query: "hôtel Toulouse",              secteur: "hôtel" },
];

/* ─── Helpers Apify ──────────────────────────────────────────── */

function apifyHeaders() {
  return { Authorization: `Bearer ${process.env.APIFY_API_KEY}` };
}

async function startApifyRun(query) {
  const res = await fetch(
    `${APIFY_BASE}/acts/${APIFY_ACTOR}/runs`,
    {
      method:  "POST",
      headers: { ...apifyHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        searchStringsArray:           [query],
        maxCrawledPlacesPerSearch:    50,
        language:                     "fr",
        countryCode:                  "fr",
      }),
    }
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Apify start ${res.status}: ${t}`);
  }
  const data = await res.json();
  return data.data.id; // runId
}

async function waitForRun(runId, timeoutMs = 300_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res  = await fetch(`${APIFY_BASE}/actor-runs/${runId}`, { headers: apifyHeaders() });
    const data = await res.json();
    const status = data?.data?.status;
    if (status === "SUCCEEDED")  return data.data.defaultDatasetId;
    if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
      throw new Error(`Apify run ${runId} terminé avec statut ${status}`);
    }
    await sleep(10_000);
  }
  throw new Error(`Apify run ${runId} timeout (5 min dépassé)`);
}

async function fetchDataset(datasetId) {
  const res = await fetch(
    `${APIFY_BASE}/datasets/${datasetId}/items?format=json&limit=100`,
    { headers: apifyHeaders() }
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Apify dataset ${res.status}: ${t}`);
  }
  return res.json(); // array d'items
}

/* ─── Helpers Airtable ───────────────────────────────────────── */

function airtableHeaders() {
  return {
    Authorization:  `Bearer ${process.env.AIRTABLE_API_KEY}`,
    "Content-Type": "application/json",
  };
}

async function emailExistsInAirtable(email) {
  const formula = encodeURIComponent(`{Email}="${email}"`);
  const res = await fetch(
    `${AIRTABLE_URL}?filterByFormula=${formula}&fields[]=Email&maxRecords=1`,
    { headers: airtableHeaders() }
  );
  if (!res.ok) return false;
  const data = await res.json();
  return (data.records || []).length > 0;
}

/* ─── Helper score ───────────────────────────────────────────── */

async function callScore(payload) {
  const res = await fetch(`${AGENT_URL}?action=score`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

/* ─── Resend recap ───────────────────────────────────────────── */

async function sendRecap({ date, totalScrape, ignored, injected, details }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { console.warn("[APIFY-CRON] RESEND_API_KEY absent"); return; }

  const detailLines = details.map(
    d => `  • ${d.secteur} : ${d.scrape} scrapés, ${d.new} injectés, ${d.skip} ignorés`
  ).join("\n");

  const corps = `Récapitulatif du scraping Apify AkilAI du ${date}.

Total leads scrapés  : ${totalScrape}
Ignorés (sans email ou déjà en base) : ${ignored}
Nouveaux leads scorés et injectés    : ${injected}

Détail par secteur :
${detailLines}

—
AkilAI · https://akilai.fr`;

  const res = await fetch("https://api.resend.com/emails", {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from:    FROM_EMAIL,
      to:      [RECAP_TO],
      subject: `[AkilAI] Scraping Apify du ${date}`,
      text:    corps,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error("[APIFY-CRON] Resend recap erreur:", res.status, t);
  }
}

/* ─── Misc ───────────────────────────────────────────────────── */

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function extractLead(item, secteur) {
  /* Google Maps Scraper retourne ces champs */
  const title    = item.title        || item.name        || "";
  const email    = (item.email       || "").trim().toLowerCase();
  const phone    = item.phone        || item.phoneNumber || "";
  const website  = !!(item.website   || item.url);
  const score    = item.totalScore   ?? item.rating      ?? null;
  const reviews  = item.reviewsCount ?? item.reviewCount ?? null;

  /* Prénom/Nom depuis categoryName ou contact — souvent vide */
  const prenom = item.contactFirstName || "";
  const nom    = item.contactLastName  || "";

  return { entreprise: title, prenom, nom, email, telephone: phone,
           note_google: score, avis_google: reviews, site_web: website,
           secteur, ville: "Toulouse" };
}

/* ─── Handler ────────────────────────────────────────────────── */

exports.handler = async function() {
  const apifyKey = process.env.APIFY_API_KEY;
  if (!apifyKey) {
    console.error("[APIFY-CRON] APIFY_API_KEY non configurée");
    return { statusCode: 500, body: "APIFY_API_KEY manquante" };
  }

  const date       = new Date().toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
  let totalScrape  = 0;
  let totalIgnored = 0;
  let totalInjected = 0;
  const details    = [];

  console.log(`[APIFY-CRON] Démarrage — ${date}`);

  for (const { query, secteur } of SECTEURS) {
    console.log(`[APIFY-CRON] ── Secteur : ${secteur} (query: "${query}")`);
    let runScrape = 0, runNew = 0, runSkip = 0;

    try {
      /* 1. Lancer le run Apify */
      const runId = await startApifyRun(query);
      console.log(`[APIFY-CRON] [${secteur}] Run lancé : ${runId}`);

      /* 2. Attendre la fin (5 min max) */
      const datasetId = await waitForRun(runId, 300_000);
      console.log(`[APIFY-CRON] [${secteur}] Run terminé — dataset : ${datasetId}`);

      /* 3. Récupérer les items */
      const items = await fetchDataset(datasetId);
      runScrape = items.length;
      totalScrape += runScrape;
      console.log(`[APIFY-CRON] [${secteur}] ${runScrape} items reçus`);

      /* 4. Traiter chaque item */
      for (const item of items) {
        const lead = extractLead(item, secteur);

        /* Ignorer sans email */
        if (!lead.email || !lead.email.includes("@")) {
          runSkip++;
          continue;
        }

        /* Vérifier doublon Airtable */
        const exists = await emailExistsInAirtable(lead.email);
        if (exists) {
          console.log(`[APIFY-CRON] [${secteur}] ${lead.email} — déjà en base, ignoré`);
          runSkip++;
          continue;
        }

        /* Appeler agent-prospection?action=score */
        try {
          const result = await callScore(lead);
          console.log(`[APIFY-CRON] [${secteur}] ${lead.email} — scoré : ${result.score}/10 — ${result.decision} — Airtable: ${result.airtable_id}`);
          runNew++;
        } catch (e) {
          console.error(`[APIFY-CRON] [${secteur}] ${lead.email} — score ERREUR:`, e.message);
          runSkip++;
        }

        /* Rate limiting : 2s entre chaque appel */
        await sleep(2_000);
      }

    } catch (e) {
      console.error(`[APIFY-CRON] [${secteur}] ERREUR:`, e.message);
    }

    totalIgnored  += runSkip;
    totalInjected += runNew;
    details.push({ secteur, scrape: runScrape, new: runNew, skip: runSkip });
    console.log(`[APIFY-CRON] [${secteur}] Résultat — scrapés: ${runScrape}, injectés: ${runNew}, ignorés: ${runSkip}`);
  }

  console.log(`[APIFY-CRON] Terminé — total: ${totalScrape}, injectés: ${totalInjected}, ignorés: ${totalIgnored}`);

  await sendRecap({ date, totalScrape, ignored: totalIgnored, injected: totalInjected, details });

  return { statusCode: 200, body: JSON.stringify({ ok: true, totalScrape, totalInjected, totalIgnored }) };
};
