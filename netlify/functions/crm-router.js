const { BASE_URL, headers: airtableHeaders, corsHeaders, preflight } = require("./config");

const CLIENTS_TABLE  = "tble0g9eMTjAfw6OO";
const BASE_SITE      = process.env.URL || "https://portal-akilai.netlify.app";

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: "Method Not Allowed" };
  }

  try {
    const { userId, contactData, callData } = JSON.parse(event.body || "{}");
    if (!userId) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "userId requis" }) };
    }

    // Fetch client config
    const cUrl  = `${BASE_URL}/${CLIENTS_TABLE}?filterByFormula=${encodeURIComponent(`{User ID}="${userId}"`)}&maxRecords=1`;
    const cRes  = await fetch(cUrl, { headers: airtableHeaders });
    const cData = await cRes.json();

    if (!cData.records || cData.records.length === 0) {
      console.warn("[crm-router] Client introuvable pour userId:", userId);
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: "Client introuvable" }) };
    }

    const cf      = cData.records[0].fields;
    const crmType = cf["CRM Type"] || "AkilAI";

    console.log("[crm-router] CRM type:", crmType, "| userId:", userId);

    // ── AkilAI CRM ──
    if (crmType === "AkilAI") {
      const res = await fetch(`${BASE_SITE}/.netlify/functions/create-contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          nom:    contactData.nom    || "",
          prenom: contactData.prenom || "",
          numero: contactData.numero || "",
          email:  contactData.email  || "",
          statut: "Prospect",
          source: contactData.source || "Appel vocal",
          notes:  callData ? `${callData.resume || ""}\nDurée: ${callData.duree || 0}s | Statut: ${callData.statut || ""}` : "",
        }),
      });
      const data = await res.json();
      console.log("[crm-router] AkilAI CRM:", data.action, data.id);
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, crm: "AkilAI", ...data }) };
    }

    // ── Notion CRM ──
    if (crmType === "Notion") {
      const notionKey  = cf["Notion Key"]         || "";
      const databaseId = cf["Notion Database ID"] || "";
      if (!notionKey || !databaseId) {
        console.warn("[crm-router] Notion non configuré pour:", userId);
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: false, reason: "Notion non configuré" }) };
      }

      const numero = contactData.numero || "";
      const titre  = contactData.nom
        ? `${contactData.nom} ${contactData.prenom || ""}`.trim()
        : numero || "Contact inconnu";

      // Check if page exists by numéro (search by title/numéro)
      let pageId = null;
      if (numero) {
        const searchRes = await fetch("https://api.notion.com/v1/databases/" + databaseId + "/query", {
          method: "POST",
          headers: { Authorization: `Bearer ${notionKey}`, "Content-Type": "application/json", "Notion-Version": "2022-06-28" },
          body: JSON.stringify({ filter: { property: "Numéro", phone_number: { equals: numero } } }),
        });
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          if (searchData.results && searchData.results.length > 0) pageId = searchData.results[0].id;
        }
      }

      if (pageId) {
        // Add call entry to existing page as a paragraph block
        const callSummary = callData
          ? `📞 ${new Date().toLocaleDateString("fr-FR")} — ${callData.duree || 0}s — ${callData.statut || ""} : ${callData.resume || callData.transcript || ""}`
          : `📞 ${new Date().toLocaleDateString("fr-FR")} — Appel entrant`;

        await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${notionKey}`, "Content-Type": "application/json", "Notion-Version": "2022-06-28" },
          body: JSON.stringify({
            children: [{ object: "block", type: "paragraph", paragraph: { rich_text: [{ text: { content: callSummary } }] } }],
          }),
        });
        console.log("[crm-router] Notion: entrée ajoutée à la page existante", pageId);
      } else {
        // Create new page
        const callSummary = callData
          ? `📞 ${new Date().toLocaleDateString("fr-FR")} — ${callData.duree || 0}s — ${callData.statut || ""} : ${callData.resume || callData.transcript || ""}`
          : `📞 ${new Date().toLocaleDateString("fr-FR")} — Premier appel`;

        const pageBody = {
          parent: { database_id: databaseId },
          properties: {
            Name:           { title: [{ text: { content: titre } }] },
            "Numéro":       { phone_number: numero || null },
            "Email":        contactData.email ? { email: contactData.email } : undefined,
            "Statut":       { select: { name: "Prospect" } },
            "Nb appels":    { number: 1 },
            "Dernier appel": { date: { start: new Date().toISOString().split("T")[0] } },
            "Source":       { select: { name: contactData.source || "Appel vocal" } },
          },
          children: [
            { object: "block", type: "heading_3", heading_3: { rich_text: [{ text: { content: "Historique des appels" } }] } },
            { object: "block", type: "paragraph",  paragraph:  { rich_text: [{ text: { content: callSummary } }] } },
          ],
        };
        // Remove undefined properties
        Object.keys(pageBody.properties).forEach(k => { if (pageBody.properties[k] === undefined) delete pageBody.properties[k]; });

        const createRes = await fetch("https://api.notion.com/v1/pages", {
          method: "POST",
          headers: { Authorization: `Bearer ${notionKey}`, "Content-Type": "application/json", "Notion-Version": "2022-06-28" },
          body: JSON.stringify(pageBody),
        });
        if (createRes.ok) {
          const p = await createRes.json();
          console.log("[crm-router] Notion: nouvelle page créée", p.id);
        } else {
          const t = await createRes.text();
          console.error("[crm-router] Notion create error:", createRes.status, t);
        }
      }

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, crm: "Notion" }) };
    }

    // ── Airtable externe ──
    if (crmType === "Airtable") {
      const extKey     = cf["Airtable External Key"]      || "";
      const extBaseId  = cf["Airtable External Base ID"]  || "";
      const extTableId = cf["Airtable External Table ID"] || "";

      if (!extKey || !extBaseId || !extTableId) {
        console.warn("[crm-router] Airtable externe non configuré pour:", userId);
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: false, reason: "Airtable externe non configuré" }) };
      }

      const extHeaders = { Authorization: `Bearer ${extKey}`, "Content-Type": "application/json" };
      const extBase    = `https://api.airtable.com/v0/${extBaseId}`;

      const numero = contactData.numero || "";

      // Check if record exists by numéro
      let existingId = null;
      if (numero) {
        const checkRes  = await fetch(`${extBase}/${extTableId}?filterByFormula=${encodeURIComponent(`{Numéro}="${numero}"`)}&maxRecords=1`, { headers: extHeaders });
        const checkData = await checkRes.json();
        if (checkData.records && checkData.records.length > 0) existingId = checkData.records[0].id;
      }

      const extFields = {
        "Nom":    contactData.nom    || "",
        "Numéro": numero,
        "Date":   new Date().toISOString().split("T")[0],
        "Résumé": callData?.resume || "",
        "Durée":  callData?.duree  || 0,
      };

      if (existingId) {
        await fetch(`${extBase}/${extTableId}/${existingId}`, {
          method: "PATCH", headers: extHeaders, body: JSON.stringify({ fields: extFields }),
        });
        console.log("[crm-router] Airtable externe: PATCH", existingId);
      } else {
        await fetch(`${extBase}/${extTableId}`, {
          method: "POST", headers: extHeaders, body: JSON.stringify({ fields: extFields }),
        });
        console.log("[crm-router] Airtable externe: POST nouveau contact");
      }

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, crm: "Airtable" }) };
    }

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, crm: crmType, skipped: true }) };
  } catch (e) {
    console.error("[crm-router] Exception:", e.message, e.stack);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: e.message }) };
  }
};
