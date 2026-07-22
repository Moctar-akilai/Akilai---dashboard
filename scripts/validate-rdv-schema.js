/**
 * validate-rdv-schema.js
 * Vérifie que les tables et champs de l'offre RDV sont bien créés dans Airtable.
 * Usage : AIRTABLE_API_KEY=xxx AIRTABLE_BASE_ID=xxx node scripts/validate-rdv-schema.js
 */

const API_KEY = process.env.AIRTABLE_API_KEY;
const BASE_ID = process.env.AIRTABLE_BASE_ID;

if (!API_KEY || !BASE_ID) {
  console.error("❌  Manque AIRTABLE_API_KEY ou AIRTABLE_BASE_ID");
  process.exit(1);
}

// Schéma attendu : { tableName: [ { name, type, options? } ] }
const EXPECTED = {
  "Clients": [
    { name: "Offre RDV active", type: "checkbox" },
  ],
  "Salons": [
    { name: "Nom salon",                    type: "singleLineText" },
    { name: "User ID",                      type: "singleLineText" },
    { name: "Horaires ouverture",           type: "multilineText" },
    { name: "Durée par défaut prestation",  type: "number" },
    { name: "Numéro WhatsApp",              type: "singleLineText" },
    { name: "Lien Google Calendar",         type: "singleLineText" },
    { name: "Lien avis Google",             type: "url" },
    { name: "Canal feedback",               type: "singleSelect", options: ["SMS", "WhatsApp", "Les deux"] },
  ],
  "Prestations": [
    { name: "Nom",    type: "singleLineText" },
    { name: "Durée",  type: "number" },
    { name: "Salon",  type: "multipleRecordLinks" },
  ],
  "Rendez-vous": [
    { name: "Client final - Nom",       type: "singleLineText" },
    { name: "Client final - Téléphone", type: "phoneNumber" },
    { name: "Salon",                    type: "multipleRecordLinks" },
    { name: "Prestation",               type: "multipleRecordLinks" },
    { name: "Date/Heure",               type: "dateTime" },
    { name: "Statut",                   type: "singleSelect", options: ["Confirmé", "Annulé", "Terminé", "No-show"] },
    { name: "Rappel envoyé",            type: "checkbox" },
    { name: "Feedback envoyé",          type: "checkbox" },
    { name: "Créé le",                  type: "createdTime" },
  ],
  "Clients finaux": [
    { name: "Nom",              type: "singleLineText" },
    { name: "Téléphone",        type: "phoneNumber" },
    { name: "Salon",            type: "multipleRecordLinks" },
    { name: "Dernière visite",  type: "date" },
    { name: "Nombre de visites",type: "number" },
    { name: "Statut relance",   type: "singleSelect", options: ["Actif", "À relancer", "Relancé", "Perdu"] },
  ],
};

async function fetchTables() {
  const res = await fetch(`https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`Airtable meta API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.tables;
}

function checkTable(table, expectedFields) {
  const fieldMap = {};
  for (const f of table.fields) fieldMap[f.name] = f;

  const errors = [];
  const warnings = [];

  for (const expected of expectedFields) {
    const actual = fieldMap[expected.name];
    if (!actual) {
      errors.push(`  ❌  Champ manquant : "${expected.name}" (attendu type: ${expected.type})`);
      continue;
    }
    if (actual.type !== expected.type) {
      errors.push(`  ❌  "${expected.name}" : type "${actual.type}" ≠ attendu "${expected.type}"`);
    } else {
      process.stdout.write(`  ✅  ${expected.name} (${actual.type})\n`);
    }

    // Vérifier les options des single select
    if (expected.options && actual.type === "singleSelect") {
      const actualOptions = (actual.options?.choices || []).map(c => c.name);
      for (const opt of expected.options) {
        if (!actualOptions.includes(opt)) {
          warnings.push(`  ⚠️   "${expected.name}" : option manquante "${opt}" (présentes : ${actualOptions.join(", ")})`);
        }
      }
    }
  }

  return { errors, warnings };
}

async function main() {
  console.log(`\n🔍  Validation schéma RDV — base ${BASE_ID}\n${"─".repeat(60)}`);

  let tables;
  try {
    tables = await fetchTables();
  } catch (e) {
    console.error("❌  Impossible de récupérer les tables :", e.message);
    process.exit(1);
  }

  const tableMap = {};
  for (const t of tables) tableMap[t.name] = t;

  let totalErrors = 0;
  let totalWarnings = 0;

  for (const [tableName, expectedFields] of Object.entries(EXPECTED)) {
    console.log(`\n📋  Table "${tableName}"`);
    const table = tableMap[tableName];
    if (!table) {
      console.log(`  ❌  TABLE MANQUANTE`);
      totalErrors++;
      continue;
    }
    const { errors, warnings } = checkTable(table, expectedFields);
    for (const e of errors)   { console.log(e); totalErrors++; }
    for (const w of warnings) { console.log(w); totalWarnings++; }
  }

  console.log(`\n${"─".repeat(60)}`);
  if (totalErrors === 0 && totalWarnings === 0) {
    console.log("✅  Schéma valide — toutes les tables et champs sont corrects.\n");
  } else {
    if (totalErrors > 0)   console.log(`❌  ${totalErrors} erreur(s) à corriger`);
    if (totalWarnings > 0) console.log(`⚠️   ${totalWarnings} avertissement(s) (options select manquantes)`);
    console.log();
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
