/**
 * agent-prospection-apify-collect.js — Phase 2
 * Cron lundi 07h15 UTC : récupère les résultats Apify et injecte les leads.
 */

const AIRTABLE_BASE       = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_RUNS_TABLE = "tbl8kdggBd4wJsO3Z"; // ApifyRuns
const AIRTABLE_LEADS_TABLE = "tblXJoVNtimnvGRBl"; // Leads
const AIRTABLE_RUNS_URL   = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_RUNS_TABLE}`;
const AIRTABLE_LEADS_URL  = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_LEADS_TABLE}`;
const APIFY_BASE          = "https://api.apify.com/v2";
const AGENT_URL           = "https://portal-akilai.netlify.app/.netlify/functions/agent-prospection";
const RECAP_TO            = "mohamed.diop@akilai.fr";
const FROM_EMAIL          = "Mohamed Diop <mohamed.diop@akilai.fr>";

const QUERY_TO_SECTEUR = {
  "cabinet médical toulouse":              "santé",
  "restaurant toulouse":                   "restauration",
  "salon de coiffure toulouse":            "coiffure & beauté",
  "hôtel toulouse":                        "hôtellerie",
  "agence immobilière toulouse":           "immobilier",
  "garage automobile toulouse":            "automobile",
  "services aux entreprises toulouse":     "services aux entreprises",
  "organisme de formation toulouse":       "formation",
  "salle de sport toulouse":               "sport & loisirs",
};

function airtableHeaders() {
  return {
    Authorization:  `Bearer ${process.env.AIRTABLE_API_KEY}`,
    "Content-Type": "application/json",
  };
}

function apifyHeaders() {
  return { Authorization: `Bearer ${process.env.APIFY_API_KEY}` };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ─── Airtable helpers ───────────────────────────────────────── */

async function getPendingRuns() {
  const filter = encodeURIComponent(`{Statut}="En cours"`);
  const res = await fetch(`${AIRTABLE_RUNS_URL}?filterByFormula=${filter}`, {
    headers: airtableHeaders(),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Airtable GET runs ${res.status}: ${t}`);
  }
  const data = await res.json();
  return data.records || [];
}

async function markRunTraité(recordId) {
  const res = await fetch(`${AIRTABLE_RUNS_URL}/${recordId}`, {
    method:  "PATCH",
    headers: airtableHeaders(),
    body:    JSON.stringify({ fields: { Statut: "Traité" }, typecast: true }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.warn(`[APIFY P2] PATCH run ${recordId} erreur: ${res.status} ${t}`);
  }
}

async function emailExistsInLeads(email) {
  const filter = encodeURIComponent(`{Email}="${email}"`);
  const res = await fetch(
    `${AIRTABLE_LEADS_URL}?filterByFormula=${filter}&fields[]=Email&maxRecords=1`,
    { headers: airtableHeaders() }
  );
  if (!res.ok) return false;
  const data = await res.json();
  return (data.records || []).length > 0;
}

/* ─── Apify helpers ──────────────────────────────────────────── */

async function getRunStatus(runId) {
  const res = await fetch(`${APIFY_BASE}/actor-runs/${runId}`, {
    headers: apifyHeaders(),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Apify status ${res.status}: ${t}`);
  }
  const data = await res.json();
  return { status: data.data.status, datasetId: data.data.defaultDatasetId };
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
  return res.json();
}

/* ─── Lead extraction ────────────────────────────────────────── */

function extractLead(item, secteur) {
  const entreprise = (item.title || item.name || "").trim();
  const email      = (item.email || "").trim().toLowerCase();
  const telephone  = item.phone || item.phoneNumber || "";
  const website    = !!(item.website || item.url);
  const noteGoogle = item.totalScore   ?? item.rating       ?? null;
  const avisGoogle = item.reviewsCount ?? item.reviewCount  ?? null;
  const prenom     = item.contactFirstName || "";
  const nom        = item.contactLastName  || "";

  /* Déduit le secteur depuis searchString si disponible */
  const rawQuery = (item.searchString || "").toLowerCase();
  const secteurResolu = QUERY_TO_SECTEUR[rawQuery] || secteur;

  return { entreprise, prenom, nom, email, telephone,
           note_google: noteGoogle, avis_google: avisGoogle,
           site_web: website, secteur: secteurResolu, ville: "Toulouse" };
}

/* ─── Agent score ────────────────────────────────────────────── */

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

async function sendRecap({ date, runs, totalScrape, ignored, injected, details }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { console.warn("[APIFY P2] RESEND_API_KEY absent"); return; }

  const detailLines = details.map(
    d => `  • ${d.secteur} : ${d.scrape} scrapés, ${d.injected} injectés, ${d.ignored} ignorés`
  ).join("\n");

  const corps = `Récapitulatif du scraping Apify AkilAI du ${date}.

Runs traités         : ${runs}
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
      subject: `[AkilAI] Récap scraping Apify du ${date}`,
      text:    corps,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error("[APIFY P2] Resend erreur:", res.status, t);
  }
}

/* ─── Handler ────────────────────────────────────────────────── */

exports.handler = async function() {
  const date = new Date().toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
  console.log(`[APIFY P2] Démarrage collecte — ${date}`);

  /* 1. Récupère les runs "En cours" */
  let pendingRuns;
  try {
    pendingRuns = await getPendingRuns();
  } catch (e) {
    console.error("[APIFY P2] Erreur getPendingRuns:", e.message);
    return { statusCode: 500, body: e.message };
  }

  console.log(`[APIFY P2] ${pendingRuns.length} run(s) en attente`);
  if (pendingRuns.length === 0) {
    console.log("[APIFY P2] Rien à traiter");
    return { statusCode: 200, body: JSON.stringify({ ok: true, runs: 0 }) };
  }

  let totalScrape  = 0;
  let totalIgnored = 0;
  let totalInjected = 0;
  let runsTraités  = 0;
  const details    = [];

  /* 2. Traite chaque run séquentiellement */
  for (const record of pendingRuns) {
    const runId   = record.fields?.RunId;
    const secteur = record.fields?.Secteur || "inconnu";

    if (!runId) {
      console.warn(`[APIFY P2] Record ${record.id} sans RunId — ignoré`);
      continue;
    }

    console.log(`[APIFY P2] [${secteur}] Vérification run : ${runId}`);

    /* Vérifie le statut Apify */
    let runInfo;
    try {
      runInfo = await getRunStatus(runId);
    } catch (e) {
      console.error(`[APIFY P2] [${secteur}] getRunStatus erreur:`, e.message);
      continue;
    }

    if (runInfo.status !== "SUCCEEDED") {
      console.log(`[APIFY P2] [${secteur}] Run ${runId} statut : ${runInfo.status} — ignoré`);
      continue;
    }

    /* Récupère les items du dataset */
    let items;
    try {
      items = await fetchDataset(runInfo.datasetId);
    } catch (e) {
      console.error(`[APIFY P2] [${secteur}] fetchDataset erreur:`, e.message);
      continue;
    }

    const scrapeCount = items.length;
    totalScrape += scrapeCount;
    let runIgnored = 0, runInjected = 0;
    console.log(`[APIFY P2] [${secteur}] ${scrapeCount} items reçus`);

    /* Traite chaque item */
    for (const item of items) {
      const lead = extractLead(item, secteur);

      /* Sans email → skip */
      if (!lead.email || !lead.email.includes("@") || !lead.entreprise) {
        runIgnored++;
        continue;
      }

      /* Doublon Airtable → skip */
      const exists = await emailExistsInLeads(lead.email);
      if (exists) {
        console.log(`[APIFY P2] [${secteur}] ${lead.email} — déjà en base`);
        runIgnored++;
        continue;
      }

      /* Injection via agent-prospection?action=score */
      try {
        const result = await callScore(lead);
        console.log(`[APIFY P2] [${secteur}] ${lead.email} — score ${result.score}/10 — ${result.decision} — id: ${result.airtable_id}`);
        runInjected++;
      } catch (e) {
        console.error(`[APIFY P2] [${secteur}] ${lead.email} — score ERREUR:`, e.message);
        runIgnored++;
      }

      await sleep(2_000);
    }

    /* Marque le run comme traité */
    await markRunTraité(record.id);
    runsTraités++;
    totalIgnored  += runIgnored;
    totalInjected += runInjected;
    details.push({ secteur, scrape: scrapeCount, injected: runInjected, ignored: runIgnored });
    console.log(`[APIFY P2] [${secteur}] Terminé — injectés: ${runInjected}, ignorés: ${runIgnored}`);
  }

  console.log(`[APIFY P2] Collecte terminée — runs: ${runsTraités}, injectés: ${totalInjected}, ignorés: ${totalIgnored}`);

  await sendRecap({ date, runs: runsTraités, totalScrape, ignored: totalIgnored, injected: totalInjected, details });

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, runs: runsTraités, totalScrape, totalInjected, totalIgnored }),
  };
};
