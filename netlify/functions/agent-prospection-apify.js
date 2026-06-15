/**
 * agent-prospection-apify.js — Phase 1
 * Cron lundi 07h00 UTC : lance les 4 runs Apify et stocke les runIds.
 * Termine en < 5 secondes.
 */

const AIRTABLE_BASE      = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_RUNS_TABLE = "tbl8kdggBd4wJsO3Z"; // ApifyRuns
const AIRTABLE_RUNS_URL  = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_RUNS_TABLE}`;
const APIFY_BASE         = "https://api.apify.com/v2";
const APIFY_ACTOR        = "nwua9Gu5YrADL7ZDj";
const RECAP_TO           = "mohamed.diop@akilai.fr";
const FROM_EMAIL         = "Mohamed Diop <mohamed.diop@akilai.fr>";

const SECTEURS = [
  { query: "cabinet médical Toulouse",    secteur: "médical" },
  { query: "restaurant Toulouse",         secteur: "restaurant" },
  { query: "agence immobilière Toulouse", secteur: "immobilier" },
  { query: "hôtel Toulouse",              secteur: "hôtel" },
  { query: "salon de coiffure Toulouse",  secteur: "coiffure" },
];

function airtableHeaders() {
  return {
    Authorization:  `Bearer ${process.env.AIRTABLE_API_KEY}`,
    "Content-Type": "application/json",
  };
}

async function startApifyRun(query) {
  const res = await fetch(`${APIFY_BASE}/acts/${APIFY_ACTOR}/runs`, {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${process.env.APIFY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      searchStringsArray:        [query],
      maxCrawledPlacesPerSearch: 50,
      language:                  "fr",
      countryCode:               "fr",
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Apify start ${res.status}: ${t}`);
  }
  const data = await res.json();
  return data.data.id;
}

async function storeRunId(runId, secteur) {
  const today = new Date().toISOString().split("T")[0];
  const res = await fetch(AIRTABLE_RUNS_URL, {
    method:  "POST",
    headers: airtableHeaders(),
    body:    JSON.stringify({ fields: { RunId: runId, Secteur: secteur, Statut: "En cours", Date: today }, typecast: true }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Airtable POST ${res.status}: ${t}`);
  }
  return res.json();
}

exports.handler = async function() {
  const apifyKey = process.env.APIFY_API_KEY;
  if (!apifyKey) {
    console.error("[APIFY P1] APIFY_API_KEY non configurée");
    return { statusCode: 500, body: "APIFY_API_KEY manquante" };
  }

  console.log("[APIFY P1] Lancement des 4 runs Apify en parallèle…");

  /* Lance les 4 runs en parallèle */
  const results = await Promise.allSettled(
    SECTEURS.map(async ({ query, secteur }) => {
      const runId = await startApifyRun(query);
      console.log(`[APIFY P1] [${secteur}] Run lancé : ${runId}`);
      await storeRunId(runId, secteur);
      console.log(`[APIFY P1] [${secteur}] RunId stocké dans Airtable`);
      return { runId, secteur };
    })
  );

  const launched = results.filter(r => r.status === "fulfilled").map(r => r.value);
  const failed   = results.filter(r => r.status === "rejected").map(r => r.reason?.message);

  console.log(`[APIFY P1] ${launched.length}/4 runs lancés. Erreurs : ${failed.length ? failed.join(", ") : "aucune"}`);

  /* Email de confirmation */
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from:    FROM_EMAIL,
        to:      [RECAP_TO],
        subject: "[AkilAI] Scraping Apify lancé",
        text:    `${launched.length} runs Apify lancés — résultats disponibles dans 15 minutes.\n\nRuns :\n${launched.map(r => `  • ${r.secteur} : ${r.runId}`).join("\n")}${failed.length ? `\n\nÉchecs : ${failed.join(", ")}` : ""}\n\n—\nAkilAI · https://akilai.fr`,
      }),
    }).catch(e => console.warn("[APIFY P1] Email erreur:", e.message));
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true, launched: launched.length, failed }) };
};
