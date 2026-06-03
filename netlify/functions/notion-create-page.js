const { BASE_URL, headers: airtableHeaders, ok, err, preflight } = require("./config");

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Method Not Allowed", 405);

  try {
    const { userId, titre, contenu, metadata } = JSON.parse(event.body || "{}");
    if (!userId) return err("userId requis", 400);

    // Fetch client from Airtable
    const searchUrl = `${BASE_URL}/Clients?filterByFormula=${encodeURIComponent(`{User ID}="${userId}"`)}`;
    const clientRes = await fetch(searchUrl, { headers: airtableHeaders });
    const clientData = await clientRes.json();

    if (!clientData.records || clientData.records.length === 0) {
      return err("Client introuvable", 404);
    }

    const fields     = clientData.records[0].fields;
    const notionKey  = fields["Notion Key"];
    const databaseId = fields["Notion Database ID"];

    if (!notionKey) return err("Clé Notion non configurée pour ce client", 400);
    if (!databaseId) return err("Database ID Notion non configuré pour ce client", 400);

    // Build page content
    const contenuTexte = contenu || "";
    const metaBloc = metadata
      ? `\nDurée : ${metadata.duree || 0}s | Statut : ${metadata.statut || ""} | Numéro : ${metadata.numeroClient || ""}`
      : "";

    const notionBody = {
      parent: { database_id: databaseId },
      properties: {
        Name: {
          title: [{ text: { content: titre || "Appel AkilAI" } }],
        },
        Date: {
          date: { start: new Date().toISOString() },
        },
        Statut: {
          select: { name: "Nouveau" },
        },
      },
      children: [
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [{ text: { content: contenuTexte + metaBloc } }],
          },
        },
      ],
    };

    const notionRes = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization:    `Bearer ${notionKey}`,
        "Content-Type":   "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify(notionBody),
    });

    if (!notionRes.ok) {
      const t = await notionRes.text();
      console.error("[notion-create-page] Erreur Notion API:", notionRes.status, t);
      return err(`Notion API ${notionRes.status}`, 502);
    }

    const page = await notionRes.json();
    return ok({
      success: true,
      pageId:  page.id,
      pageUrl: page.url,
    });
  } catch (e) {
    console.error("[notion-create-page] Exception:", e.message);
    return err(e.message);
  }
};
