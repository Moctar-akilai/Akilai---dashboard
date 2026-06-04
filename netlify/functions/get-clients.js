const { BASE_URL, headers, ok, err, preflight } = require("./config");

exports.handler = async function(event, context) {
  if (event.httpMethod === "OPTIONS") return preflight();

  try {
    const email  = (event.queryStringParameters && event.queryStringParameters.email) || null;
    console.log("[get-clients] Email reçu :", email);

    const params = new URLSearchParams();
    if (email) {
      /* Filtre par User ID (champ texte contenant l'email) */
      params.set("filterByFormula", `{User ID}="${email}"`);
    }

    const url = `${BASE_URL}/Clients?${params}`;
    console.log("[get-clients] URL appelée :", url.replace(BASE_URL, "[BASE_URL]"));

    const res = await fetch(url, { headers });
    console.log("[get-clients] Statut Airtable :", res.status);

    if (!res.ok) {
      const text = await res.text();
      console.error("[get-clients] Erreur Airtable :", res.status, text);
      return err(`Airtable ${res.status}`, 502);
    }

    const data    = await res.json();
    const records = data.records || [];
    console.log("[get-clients] Nb clients trouvés :", records.length);

    if (records.length > 0) {
      console.log("[get-clients] Champs bruts :", JSON.stringify(records[0].fields));
      const statut = records[0].fields["Statut"];
      if (statut === "Résilié") {
        console.log("[get-clients] Compte résilié — accès bloqué pour :", email);
        return {
          statusCode: 403,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify({
            error: "COMPTE_RESILIE",
            message: "Votre compte a été résilié. Pour toute question, contactez-nous : bonjour@akilai.fr"
          })
        };
      }
    }

    const clients = records.map(function(r, i) {
      const f = r.fields;
      let notes = [];
      try { notes = f.Notes ? JSON.parse(f.Notes) : []; } catch(e) { notes = f.Notes ? [f.Notes] : []; }

      return {
        id:               r.id,
        _seq:             i + 1,
        nom:              f.Nom                        || f.Entreprise || "",
        entreprise:       f.Entreprise                 || "",
        secteur:          f.Secteur                    || "Autre",
        statut:           f.Statut                     || "Actif",
        plan:             f.Plan                       || "Starter",
        date_debut:       f["Date inscription"]        || new Date().toISOString().split("T")[0],
        prochain_paiement: f["Date prochain paiement"] || null,
        email:            f.Email                      || "",
        telephone:        f["Numéro de téléphone"]     || "",
        pays:             f.Pays                       || "",
        onboarding:       f.Onboarding                 || null,
        vapiAssistantId:  f.VapiAssistantId            || null,
        numeroVapi:       f["Numéro Vapi"]             || null,
        nomAssistant:     f.NomAssistant               || null,
        voiceId:          f.VoiceId                    || null,
        langue:           f.Langue                     || "fr",
        tonalite:         f.Tonalite                   || "neutre",
        promptSysteme:    f.PromptSysteme              || "",
        vitesseParole:    Number(f.VitesseParole)      || 1.0,
        notes,
        googleConnected:  f["Google Connected"]        || false,
        googleCalendarId: f["Google Calendar ID"]      || "primary",
        calendlyLink:          f["Calendly Link"]               || "",
        calendlyConnected:     f["Calendly Connected"]           || false,
        notionKey:             f["Notion Key"]                   || "",
        notionDatabaseId:      f["Notion Database ID"]           || "",
        notionConnected:       f["Notion Connected"]             || false,
        crmType:               f["CRM Type"]                     || "AkilAI",
        airtableExternalKey:   f["Airtable External Key"]        || "",
        airtableExternalBaseId: f["Airtable External Base ID"]   || "",
        airtableExternalTableId: f["Airtable External Table ID"] || "",
        googleSheetsId:        f["Google Sheets ID"]            || "",
        googleSheetsConnected: f["Google Sheets Connected"]     || false,
        microsoftConnected:    f["Microsoft Connected"]         || false,
        excelFileId:           f["Excel File ID"]               || "",
        outlookConnected:      f["Outlook Connected"]           || false,
        brevoConnected:        f["Brevo Connected"]             || false,
        resendConnected:       f["Resend Connected"]            || false,
        shopifyConnected:      f["Shopify Connected"]           || false,
        slackConnected:        f["Slack Connected"]             || false,
        hubspotConnected:      f["HubSpot Connected"]           || false,
        teamsConnected:        f["Teams Connected"]             || false,
        capaciteCreneau:       Number(f["Capacite Creneau"])    || 1,
        dureeRDV:              Number(f["Duree RDV"])           || 30,
        heureOuverture:        f["Heure Ouverture"]             || "08:00",
        heureFermeture:        f["Heure Fermeture"]             || "19:00",
      };
    });

    return ok({ clients });
  } catch (e) {
    console.error("[get-clients] Exception :", e.message, e.stack);
    return err(e.message);
  }
};
