const { BASE_URL, headers: airtableHeaders, ok, err, preflight } = require("./config");

/* ─── Constantes ─────────────────────────────────────────────── */
const LEADS_TABLE    = "tblXJoVNtimnvGRBl";
const BCC_MOHAMED    = "mohamed.diop@akilai.fr";
const FROM_EMAIL     = "AkilAI <bonjour@akilai.fr>";
const CALENDLY_LINK  = "https://calendly.com/mohamed-diop-akilai";
const AKILAI_URL     = "https://akilai.fr";
const SIGNATURE      = `Mohamed Diop — AkilAI\n${AKILAI_URL}`;

/* ─── Prompt système agent ────────────────────────────────────── */
const SYSTEM_PROMPT = `Tu es l'agent Prospection d'AkilAI, une agence d'automatisation basée à Toulouse.

Ta mission : qualifier et contacter des TPE/PME à Toulouse pour leur proposer les solutions AkilAI (assistant vocal + automatisation WhatsApp).

Mohamed Diop (fondateur) reçoit une copie BCC de chaque action à mohamed.diop@akilai.fr. Il n'intervient pas sauf si un lead est marqué PRIORITAIRE.

## RÈGLES ABSOLUES
- Ne jamais mentionner "intelligence artificielle" ou "IA" ou "robot"
- Toujours dire "assistant virtuel" ou "solution d'automatisation"
- Ne jamais promettre de résultats garantis
- Ne jamais donner les tarifs complets sans démo préalable
- Ne jamais contacter deux fois le même lead la même semaine
- Ne jamais relancer un lead marqué "Fermé" ou "Désabonné"`;

/* ─── Templates email ─────────────────────────────────────────── */
const TEMPLATES = {
  J0: {
    médical: (e) => ({
      objet: `Une question pour ${e.entreprise}`,
      corps: `Bonjour,

Vos patients peinent parfois à joindre le cabinet parce que la ligne est occupée ? Nous travaillons avec des cabinets médicaux à Toulouse pour déployer des assistants virtuels capables de répondre aux appels 24h/24, confirmer les rendez-vous automatiquement et donner les informations de base à vos patients.

Sauriez-vous vers qui m'orienter au sein de votre cabinet pour échanger à ce sujet ?

${SIGNATURE}`,
    }),
    restaurant: (e) => ({
      objet: `Une question pour ${e.entreprise}`,
      corps: `Bonjour,

Des réservations perdues parce que le téléphone sonne dans le vide pendant que vos serveurs sont occupés à servir les clients ? Nous travaillons avec des restaurants à Toulouse pour déployer des assistants virtuels capables de répondre aux appels 24h/24 et confirmer les réservations automatiquement.

Sauriez-vous vers qui m'orienter au sein de votre établissement pour échanger à ce sujet ?

${SIGNATURE}`,
    }),
    immobilier: (e) => ({
      objet: `Une question pour ${e.entreprise}`,
      corps: `Bonjour,

Vos prospects appellent et tombent sur la messagerie au mauvais moment ? Nous travaillons avec des agences immobilières à Toulouse pour déployer des assistants virtuels capables de répondre aux appels 24h/24 et qualifier vos contacts automatiquement.

Sauriez-vous vers qui m'orienter au sein de votre agence pour échanger à ce sujet ?

${SIGNATURE}`,
    }),
    hôtel: (e) => ({
      objet: `Une question pour ${e.entreprise}`,
      corps: `Bonjour,

Des demandes clients sans réponse parce que la ligne est occupée en dehors des heures d'ouverture ? Nous travaillons avec des hôtels à Toulouse pour déployer des assistants virtuels capables de répondre aux appels 24h/24 et traiter les demandes de vos clients en temps réel.

Sauriez-vous vers qui m'orienter au sein de votre établissement pour échanger à ce sujet ?

${SIGNATURE}`,
    }),
  },
  J3: {
    default: (e) => ({
      objet: `Re : ${e.entreprise}`,
      corps: `Bonjour,

Je me permets de relancer rapidement.

Avez-vous pu transmettre mon message à la bonne personne ?

${SIGNATURE}`,
    }),
  },
  J7: {
    default: (e) => ({
      objet: `Dernier message — ${e.entreprise}`,
      corps: `Bonjour,

C'est mon dernier message.

Si le sujet des appels manqués ou des messages sans réponse devient un jour une priorité, je suis disponible ici :
${CALENDLY_LINK}

Bonne continuation,
${SIGNATURE}`,
    }),
  },
};

/* ─── Réponses aux objections ─────────────────────────────────── */
const REPONSES_OBJECTION = {
  prix: `Nos formules démarrent à 99€/mois pour un assistant virtuel qui répond à vos appels 24h/24 — moins qu'une demi-journée d'assistante par mois. Il y a aussi un essai 7 jours sans engagement.
Je peux vous montrer concrètement ce que ça donne en 10 minutes :
${CALENDLY_LINK}

${SIGNATURE}`,
  confiance: `Je comprends tout à fait. On peut faire une démonstration live de 10 minutes sur votre propre numéro — vous entendez exactement ce que vos clients entendront.
${CALENDLY_LINK}

${SIGNATURE}`,
  timing: `Pas de problème, je note et reviens vers vous à ce moment-là.
Bonne continuation d'ici là.

${SIGNATURE}`,
  non: `Merci pour votre retour, bonne continuation !

${SIGNATURE}`,
};

/* ─── Helpers ─────────────────────────────────────────────────── */

async function callClaude(userPrompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY non configurée");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key":         apiKey,
      "anthropic-version": "2023-06-01",
      "content-type":      "application/json",
    },
    body: JSON.stringify({
      model:      "claude-sonnet-4-6",
      max_tokens: 1024,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${t}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text || "";
}

async function airtableGet(recordId) {
  const res = await fetch(`${BASE_URL}/${LEADS_TABLE}/${recordId}`, {
    headers: airtableHeaders,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Airtable GET ${res.status}: ${t}`);
  }
  return res.json();
}

async function airtableCreate(fields) {
  const res = await fetch(`${BASE_URL}/${LEADS_TABLE}`, {
    method:  "POST",
    headers: airtableHeaders,
    body:    JSON.stringify({ fields, typecast: true }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Airtable POST ${res.status}: ${t}`);
  }
  return res.json();
}

async function airtablePatch(recordId, fields) {
  const res = await fetch(`${BASE_URL}/${LEADS_TABLE}/${recordId}`, {
    method:  "PATCH",
    headers: airtableHeaders,
    body:    JSON.stringify({ fields, typecast: true }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Airtable PATCH ${res.status}: ${t}`);
  }
  return res.json();
}

async function sendEmail({ to, subject, text, bcc = BCC_MOHAMED, replyTo }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY non configurée");

  const payload = {
    from:    FROM_EMAIL,
    to:      Array.isArray(to) ? to : [to],
    subject,
    text,
    bcc:     [bcc],
  };
  if (replyTo) payload.reply_to = replyTo;

  const res = await fetch("https://api.resend.com/emails", {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Resend ${res.status}: ${t}`);
  }
  return res.json();
}

function getTemplate(type, secteur, lead) {
  const secteurKey = (secteur || "").toLowerCase();
  if (type === "J0") {
    const fn = TEMPLATES.J0[secteurKey] || TEMPLATES.J0.restaurant;
    return fn(lead);
  }
  if (type === "J3") return TEMPLATES.J3.default(lead);
  if (type === "J7") return TEMPLATES.J7.default(lead);
  throw new Error(`Type inconnu : ${type}`);
}

function statutParType(type) {
  if (type === "J0") return "Contacté";
  if (type === "J3") return "Relance J+3";
  if (type === "J7") return "Relance J+7";
  return "Contacté";
}

/* ─── Endpoint 1 : score ──────────────────────────────────────── */

async function handleScore(body) {
  const {
    prenom, nom, entreprise, secteur, email, telephone,
    ville, note_google, avis_google, site_web, chatbot_visible,
  } = body;

  if (!entreprise || !secteur) return err("Champs obligatoires : entreprise, secteur", 400);

  console.log("[agent-prospection/score] lead:", entreprise, "—", secteur);

  /* Appel Claude pour scoring structuré */
  const scoringPrompt = `Score ce lead de prospection AkilAI et retourne UNIQUEMENT du JSON valide (aucun texte avant ou après).

Lead :
- Prénom : ${prenom || ""}
- Nom : ${nom || ""}
- Entreprise : ${entreprise}
- Secteur : ${secteur}
- Email : ${email || "non disponible"}
- Téléphone : ${telephone || "non disponible"}
- Ville : ${ville || "Toulouse"}
- Note Google : ${note_google ?? "inconnue"}
- Nombre d'avis Google : ${avis_google ?? "inconnu"}
- Site web présent : ${site_web ? "oui" : "non"}
- Chatbot visible sur le site : ${chatbot_visible ? "oui" : "non"}

Critères de scoring :
+3 points : secteur prioritaire (médical, restaurant, immobilier, hôtel)
+2 points : email direct (pas contact@, pas info@, pas webmaster@)
+2 points : téléphone direct disponible
+1 point  : note Google ≥ 4.0
+1 point  : nombre d'avis Google ≥ 50
+1 point  : site web présent MAIS pas de chatbot visible

Décision :
- Score ≥ 7 → "séquence complète"
- Score 4-6 → "message unique"
- Score ≤ 3 → "archiver"

Retourne ce JSON exact :
{
  "score": <nombre 1-10>,
  "decision": "<séquence complète|message unique|archiver>",
  "raison": "<explication courte>"
}`;

  const claudeRaw  = await callClaude(scoringPrompt);
  console.log("[agent-prospection/score] Claude brut:", claudeRaw.substring(0, 300));

  let scoring;
  try {
    const jsonMatch = claudeRaw.match(/\{[\s\S]*\}/);
    scoring = JSON.parse(jsonMatch ? jsonMatch[0] : claudeRaw);
  } catch (e) {
    return err("Claude n'a pas retourné un JSON valide : " + claudeRaw.substring(0, 200));
  }

  const { score, decision, raison } = scoring;
  const statut = decision === "archiver" ? "Archivé" : "À contacter";

  /* Créer le record dans Airtable */
  const fields = {
    "Prénom":    prenom    || "",
    "Nom":       nom       || "",
    "Entreprise": entreprise,
    "Secteur":   secteur,
    "Score":     Number(score),
    "Statut":    statut,
    "Canal":     "email",
    "Ville":     ville     || "Toulouse",
    "Notes":     `Score : ${score}/10 — ${decision}\nRaison : ${raison}`,
    "Date premier contact": new Date().toISOString().split("T")[0],
  };
  if (email)     fields["Email"]     = email;
  if (telephone) fields["Téléphone"] = telephone;

  const record = await airtableCreate(fields);
  console.log("[agent-prospection/score] Airtable créé:", record.id, "| score:", score, "| décision:", decision);

  /* BCC Mohamed */
  const secteurLabel = (secteur || "").charAt(0).toUpperCase() + secteur.slice(1);
  await sendEmail({
    to:      BCC_MOHAMED,
    subject: `[LEAD SCORÉ] ${prenom || ""} ${nom || ""} — ${secteurLabel} — Score ${score}/10 — ${decision}`,
    text:    `Nouveau lead scoré par l'agent AkilAI.\n\nEntreprise : ${entreprise}\nSecteur : ${secteur}\nEmail : ${email || "—"}\nTéléphone : ${telephone || "—"}\nVille : ${ville || "Toulouse"}\n\nScore : ${score}/10\nDécision : ${decision}\nRaison : ${raison}\n\nAirtable ID : ${record.id}`,
    bcc:     null,
  }).catch(e => console.warn("[agent-prospection/score] BCC Mohamed erreur:", e.message));

  return ok({ score, decision, raison, airtable_id: record.id, statut });
}

/* ─── Endpoint 2 : envoyer ────────────────────────────────────── */

async function handleEnvoyer(body) {
  const { airtable_id, type } = body;
  if (!airtable_id) return err("Champ obligatoire : airtable_id", 400);
  if (!["J0", "J3", "J7"].includes(type)) return err("Type doit être J0, J3 ou J7", 400);

  console.log("[agent-prospection/envoyer] id:", airtable_id, "| type:", type);

  const record = await airtableGet(airtable_id);
  const f = record.fields || {};

  /* Vérifications anti-spam */
  if (["Fermé", "Archivé"].includes(f["Statut"])) {
    return err(`Lead ${f["Statut"]} — envoi bloqué`, 400);
  }
  if (!f["Email"]) {
    return err("Email manquant dans Airtable", 400);
  }

  const lead = {
    prenom:    f["Prénom"]    || "",
    nom:       f["Nom"]       || "",
    entreprise: f["Entreprise"] || "votre établissement",
    secteur:   f["Secteur"]   || "",
    email:     f["Email"],
  };

  /* Template fixe (Claude peut personnaliser si besoin) */
  const template = getTemplate(type, lead.secteur, lead);

  /* Optionnel : personnalisation légère via Claude */
  const personalisePrompt = `Personnalise légèrement cet email de prospection en gardant le même ton sobre et direct.
Ne change pas la structure, ajoute juste une touche naturelle si le contexte le permet.
Retourne UNIQUEMENT le corps de l'email personnalisé, sans objet, sans commentaire.

Entreprise : ${lead.entreprise}
Secteur : ${lead.secteur}
Prénom du destinataire (si connu) : ${lead.prenom || "non connu"}

Corps original :
${template.corps}`;

  let corpsPersonalise = template.corps;
  try {
    const claudeCorps = await callClaude(personalisePrompt);
    if (claudeCorps && claudeCorps.length > 50) corpsPersonalise = claudeCorps.trim();
  } catch (e) {
    console.warn("[agent-prospection/envoyer] Claude personnalisation erreur:", e.message, "— utilisation template brut");
  }

  /* Envoi email */
  const emailResult = await sendEmail({
    to:      lead.email,
    subject: template.objet,
    text:    corpsPersonalise,
  });
  console.log("[agent-prospection/envoyer] Email envoyé à", lead.email, "| Resend id:", emailResult.id);

  /* Mise à jour Airtable */
  const newStatut   = statutParType(type);
  const today       = new Date().toISOString().split("T")[0];
  const patchFields = {
    "Statut":           newStatut,
    "Dernière action":  today,
  };
  if (type === "J0" && !f["Date premier contact"]) {
    patchFields["Date premier contact"] = today;
  }
  await airtablePatch(airtable_id, patchFields);
  console.log("[agent-prospection/envoyer] Airtable mis à jour → statut:", newStatut);

  /* BCC Mohamed */
  await sendEmail({
    to:      BCC_MOHAMED,
    subject: `[MESSAGE ENVOYÉ] ${lead.prenom} ${lead.nom} — ${lead.entreprise} — ${type}`,
    text:    `L'agent AkilAI vient d'envoyer un message.\n\nEntreprise : ${lead.entreprise}\nEmail : ${lead.email}\nType : ${type}\nNouveau statut : ${newStatut}\n\nAirtable ID : ${airtable_id}`,
    bcc:     null,
  }).catch(e => console.warn("[agent-prospection/envoyer] BCC Mohamed erreur:", e.message));

  return ok({ ok: true, type, statut: newStatut, email_id: emailResult.id, email_dest: lead.email });
}

/* ─── Endpoint 3 : reponse ────────────────────────────────────── */

async function handleReponse(body) {
  const { airtable_id, email_expediteur, contenu_reponse } = body;
  if (!airtable_id)     return err("Champ obligatoire : airtable_id", 400);
  if (!contenu_reponse) return err("Champ obligatoire : contenu_reponse", 400);

  console.log("[agent-prospection/reponse] id:", airtable_id, "| expéditeur:", email_expediteur);

  const record = await airtableGet(airtable_id);
  const f = record.fields || {};
  const lead = {
    prenom:    f["Prénom"]    || "",
    nom:       f["Nom"]       || "",
    entreprise: f["Entreprise"] || "",
    email:     f["Email"]     || email_expediteur || "",
  };

  /* Détection intention via Claude */
  const intentionPrompt = `Analyse la réponse de ce prospect et retourne UNIQUEMENT du JSON valide.

Prospect : ${lead.prenom} ${lead.nom} (${lead.entreprise})
Réponse reçue : "${contenu_reponse}"

Intentions possibles : intéressé / objection_prix / objection_confiance / objection_timing / pas_intéressé

Retourne ce JSON exact :
{
  "intention": "<intéressé|objection_prix|objection_confiance|objection_timing|pas_intéressé>",
  "confiance": <0.0-1.0>,
  "resume": "<résumé en une phrase>"
}`;

  const claudeRaw = await callClaude(intentionPrompt);
  console.log("[agent-prospection/reponse] Claude intention brut:", claudeRaw.substring(0, 200));

  let analyse;
  try {
    const jsonMatch = claudeRaw.match(/\{[\s\S]*\}/);
    analyse = JSON.parse(jsonMatch ? jsonMatch[0] : claudeRaw);
  } catch (e) {
    return err("Claude n'a pas retourné un JSON valide : " + claudeRaw.substring(0, 200));
  }

  const { intention, resume } = analyse;
  console.log("[agent-prospection/reponse] Intention détectée:", intention);

  /* Réponse et mise à jour selon l'intention */
  let corpsReponse, newStatut, sujetReponse, estPrioritaire = false, emailEnvoye = false;
  const today = new Date().toISOString().split("T")[0];

  if (intention === "intéressé") {
    sujetReponse  = `Re : ${lead.entreprise} — Démo disponible`;
    corpsReponse  = `Bonjour ${lead.prenom || ""},\n\nMerci pour votre retour !\n\nJe serais ravi de vous montrer concrètement ce que ça donne en 10 minutes. Vous pouvez réserver directement ici :\n${CALENDLY_LINK}\n\n${SIGNATURE}`;
    newStatut     = "Prospect chaud";
    estPrioritaire = true;
  } else if (intention === "objection_prix") {
    sujetReponse = `Re : ${lead.entreprise}`;
    corpsReponse = `Bonjour ${lead.prenom || ""},\n\n${REPONSES_OBJECTION.prix}`;
    newStatut    = "À relancer";
  } else if (intention === "objection_confiance") {
    sujetReponse = `Re : ${lead.entreprise}`;
    corpsReponse = `Bonjour ${lead.prenom || ""},\n\n${REPONSES_OBJECTION.confiance}`;
    newStatut    = "À relancer";
  } else if (intention === "objection_timing") {
    sujetReponse = `Re : ${lead.entreprise}`;
    corpsReponse = `Bonjour ${lead.prenom || ""},\n\n${REPONSES_OBJECTION.timing}`;
    newStatut    = "À relancer";
  } else {
    /* pas_intéressé */
    sujetReponse = `Re : ${lead.entreprise}`;
    corpsReponse = `Bonjour ${lead.prenom || ""},\n\n${REPONSES_OBJECTION.non}`;
    newStatut    = "Fermé";
  }

  /* Envoi réponse (sauf "pas intéressé" qui reçoit quand même un accusé poli) */
  if (lead.email) {
    const emailResult = await sendEmail({
      to:      lead.email,
      subject: sujetReponse,
      text:    corpsReponse,
      replyTo: BCC_MOHAMED,
    });
    emailEnvoye = true;
    console.log("[agent-prospection/reponse] Réponse envoyée à", lead.email, "| Resend id:", emailResult.id);
  }

  /* Mise à jour Airtable */
  const patchFields = {
    "Statut":          newStatut,
    "Dernière action": today,
    "Notes":           `${f["Notes"] || ""}\n[${today}] Réponse reçue — Intention : ${intention} — ${resume}`.trim(),
  };
  console.log("[agent-prospection/reponse] PATCH Airtable fields:", JSON.stringify(patchFields));
  const patchResult = await airtablePatch(airtable_id, patchFields);
  console.log("[agent-prospection/reponse] Airtable PATCH résultat:", JSON.stringify(patchResult?.fields?.Statut), "| id:", patchResult?.id);

  /* BCC Mohamed — notification standard */
  const bccSubject = estPrioritaire
    ? `[LEAD CHAUD 🔥] ${lead.prenom} ${lead.nom} — ${lead.entreprise} — Intéressé`
    : `[RÉPONSE REÇUE] ${lead.prenom} ${lead.nom} — Intention : ${intention} — Action : ${newStatut}`;

  await sendEmail({
    to:      BCC_MOHAMED,
    subject: bccSubject,
    text:    `L'agent AkilAI a reçu une réponse.\n\nEntreprise : ${lead.entreprise}\nEmail : ${lead.email}\n\nRéponse du prospect :\n"${contenu_reponse}"\n\nIntention détectée : ${intention}\nRésumé : ${resume}\n\nAction prise : ${newStatut}\nRéponse envoyée : ${emailEnvoye ? "oui" : "non"}\n${estPrioritaire ? "\n⚡ LEAD PRIORITAIRE — démo à confirmer sur Calendly" : ""}\n\nAirtable ID : ${airtable_id}`,
    bcc:     null,
  }).catch(e => console.warn("[agent-prospection/reponse] BCC Mohamed erreur:", e.message));

  return ok({
    ok:           true,
    intention,
    resume,
    statut:       newStatut,
    email_envoye: emailEnvoye,
    prioritaire:  estPrioritaire,
  });
}

/* ─── Handler principal ───────────────────────────────────────── */

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST")    return err("Méthode non autorisée — POST requis", 405);

  const action = (event.queryStringParameters || {}).action || "";
  console.log("[agent-prospection] action:", action, "| method:", event.httpMethod);

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return err("JSON invalide", 400);
  }

  try {
    if (action === "score")   return await handleScore(body);
    if (action === "envoyer") return await handleEnvoyer(body);
    if (action === "reponse") return await handleReponse(body);
    return err(`Action inconnue : "${action}". Utiliser ?action=score|envoyer|reponse`, 400);
  } catch (e) {
    console.error("[agent-prospection] Exception:", e.message, e.stack);
    return err(e.message);
  }
};
