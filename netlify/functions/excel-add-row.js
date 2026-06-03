const { BASE_URL, headers: airtableHeaders, ok, err, preflight } = require("./config");

async function refreshMicrosoftToken(recordId, refreshToken) {
  const clientId     = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const tenant       = process.env.MICROSOFT_TENANT_ID || "common";

  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id:     clientId,
      client_secret: clientSecret,
      grant_type:    "refresh_token",
      scope:         "Files.ReadWrite offline_access",
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.access_token) return null;

  await fetch(`${BASE_URL}/Clients/${recordId}`, {
    method: "PATCH",
    headers: airtableHeaders,
    body: JSON.stringify({ fields: { "Microsoft Access Token": data.access_token } }),
  });
  return data.access_token;
}

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Method Not Allowed", 405);

  try {
    const { userId, rowData } = JSON.parse(event.body || "{}");
    if (!userId) return err("userId requis", 400);

    const searchUrl = `${BASE_URL}/Clients?filterByFormula=${encodeURIComponent(`{User ID}="${userId}"`)}&maxRecords=1`;
    const clientRes = await fetch(searchUrl, { headers: airtableHeaders });
    const clientData = await clientRes.json();

    if (!clientData.records || clientData.records.length === 0) return err("Client introuvable", 404);

    const record       = clientData.records[0];
    const recordId     = record.id;
    const fields       = record.fields;
    let   accessToken  = fields["Microsoft Access Token"];
    const refreshToken = fields["Microsoft Refresh Token"];
    const fileId       = fields["Excel File ID"];

    if (!fileId)  return err("Excel File ID non configuré", 400);
    if (!accessToken && !refreshToken) return err("Microsoft non connecté", 400);

    const row = [
      new Date().toLocaleDateString("fr-FR"),
      rowData.numero  || "",
      rowData.nom     || "",
      (rowData.duree  || 0) + "s",
      rowData.statut  || "",
      rowData.resume  || "",
    ];

    // Try to get tables in the workbook, then append to the first table
    const appendToTable = async (token) => {
      // First get list of tables
      const tablesRes = await fetch(
        `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/tables`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (tablesRes.ok) {
        const tablesData = await tablesRes.json();
        const tableId = tablesData.value && tablesData.value[0] && tablesData.value[0].id;
        if (tableId) {
          return fetch(
            `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/tables/${tableId}/rows/add`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ values: [row] }),
            }
          );
        }
      }
      // Fallback: append to Sheet1 used range
      return fetch(
        `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/worksheets/Sheet1/range(address='A1')/insert`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ shift: "Down" }),
        }
      );
    };

    let addRes = await appendToTable(accessToken);

    if (addRes.status === 401 && refreshToken) {
      console.log("[excel-add-row] Token expiré, rafraîchissement…");
      const newToken = await refreshMicrosoftToken(recordId, refreshToken);
      if (!newToken) return err("Impossible de rafraîchir le token Microsoft", 502);
      accessToken = newToken;
      addRes = await appendToTable(accessToken);
    }

    if (!addRes.ok) {
      const t = await addRes.text();
      console.error("[excel-add-row] Graph API error:", addRes.status, t);
      return err(`Graph API ${addRes.status}`, 502);
    }

    return ok({ success: true });
  } catch (e) {
    console.error("[excel-add-row] Exception:", e.message);
    return err(e.message);
  }
};
