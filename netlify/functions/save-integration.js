const { BASE_URL, headers, ok, err, preflight } = require("./config");

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Method Not Allowed", 405);

  try {
    const { userId, type, value1, value2 } = JSON.parse(event.body || "{}");
    if (!userId || !type) return err("userId et type requis", 400);

    // Find client record
    const searchUrl = `${BASE_URL}/Clients?filterByFormula=${encodeURIComponent(`{User ID}="${userId}"`)}`;
    const searchRes = await fetch(searchUrl, { headers });
    const searchData = await searchRes.json();

    if (!searchData.records || searchData.records.length === 0) {
      return err("Client introuvable", 404);
    }

    const recordId = searchData.records[0].id;
    let fields = {};

    switch (type) {
      case "calendly":
        if (!value1) return err("Lien Calendly requis", 400);
        fields = {
          "Calendly Link":      value1,
          "Calendly Connected": true,
        };
        break;

      case "notion":
        if (!value1) return err("Clé Notion requise", 400);
        fields = {
          "Notion Key":         value1,
          "Notion Connected":   true,
        };
        if (value2) fields["Notion Database ID"] = value2;
        break;

      case "disconnect_google":
        fields = {
          "Google Access Token":  "",
          "Google Refresh Token": "",
          "Google Connected":     false,
        };
        break;

      case "disconnect_calendly":
        fields = {
          "Calendly Link":      "",
          "Calendly Connected": false,
        };
        break;

      case "disconnect_notion":
        fields = {
          "Notion Key":         "",
          "Notion Database ID": "",
          "Notion Connected":   false,
        };
        break;

      case "google_sheets":
        fields = {
          "Google Sheets ID":        value1 || "",
          "Google Sheets Connected": !!(value1),
        };
        break;

      case "disconnect_microsoft":
        fields = {
          "Microsoft Access Token":  "",
          "Microsoft Refresh Token": "",
          "Microsoft Connected":     false,
          "Excel File ID":           "",
        };
        break;

      case "excel_file":
        // value1 = Excel File ID selected by user
        fields = {
          "Excel File ID": value1 || "",
        };
        break;

      case "crm":
        // value1 = crmType ("AkilAI"|"Notion"|"Airtable")
        // value2 = JSON string of crm-specific credentials
        if (!value1) return err("crmType requis", 400);
        fields = { "CRM Type": value1 };
        if (value2) {
          try {
            const creds = JSON.parse(value2);
            if (creds.notionKey)              fields["Notion Key"]                   = creds.notionKey;
            if (creds.notionDatabaseId)       fields["Notion Database ID"]           = creds.notionDatabaseId;
            if (creds.airtableKey)            fields["Airtable External Key"]        = creds.airtableKey;
            if (creds.airtableBaseId)         fields["Airtable External Base ID"]    = creds.airtableBaseId;
            if (creds.airtableTableId)        fields["Airtable External Table ID"]   = creds.airtableTableId;
          } catch(e) { /* credentials optionnels */ }
        }
        break;

      default:
        return err(`Type inconnu : ${type}`, 400);
    }

    const patchRes = await fetch(`${BASE_URL}/Clients/${recordId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ fields, typecast: true }),
    });

    if (!patchRes.ok) {
      const t = await patchRes.text();
      console.error("[save-integration] Erreur PATCH Airtable:", patchRes.status, t);
      return err(`Airtable ${patchRes.status}`, 502);
    }

    return ok({ success: true });
  } catch (e) {
    console.error("[save-integration] Exception:", e.message);
    return err(e.message);
  }
};
