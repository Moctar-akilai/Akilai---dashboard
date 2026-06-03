const { BASE_URL, headers: airtableHeaders, ok, err, preflight } = require("./config");

const BASE_SITE = process.env.URL || "https://portal-akilai.netlify.app";

async function refreshAccessToken(recordId, refreshToken) {
  const res = await fetch(`${BASE_SITE}/.netlify/functions/google-refresh-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recordId, refreshToken }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token || null;
}

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Method Not Allowed", 405);

  try {
    const { userId, rowData } = JSON.parse(event.body || "{}");
    if (!userId) return err("userId requis", 400);

    // Fetch client
    const searchUrl = `${BASE_URL}/Clients?filterByFormula=${encodeURIComponent(`{User ID}="${userId}"`)}&maxRecords=1`;
    const clientRes = await fetch(searchUrl, { headers: airtableHeaders });
    const clientData = await clientRes.json();

    if (!clientData.records || clientData.records.length === 0) return err("Client introuvable", 404);

    const record       = clientData.records[0];
    const recordId     = record.id;
    const fields       = record.fields;
    let   accessToken  = fields["Google Access Token"];
    const refreshToken = fields["Google Refresh Token"];
    const spreadsheetId = fields["Google Sheets ID"];

    if (!spreadsheetId) return err("Google Sheets ID non configuré", 400);
    if (!accessToken && !refreshToken) return err("Google non connecté pour ce client", 400);

    const row = [
      new Date().toLocaleDateString("fr-FR"),
      rowData.numero   || "",
      rowData.nom      || "",
      (rowData.duree   || 0) + "s",
      rowData.statut   || "",
      rowData.resume   || "",
    ];

    // Append row
    let sheetsRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:append?valueInputOption=RAW`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values: [row] }),
      }
    );

    // Refresh and retry on 401
    if (sheetsRes.status === 401 && refreshToken) {
      console.log("[google-sheets-add-row] Token expiré, rafraîchissement…");
      const newToken = await refreshAccessToken(recordId, refreshToken);
      if (!newToken) return err("Impossible de rafraîchir le token Google", 502);
      accessToken = newToken;

      sheetsRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:append?valueInputOption=RAW`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ values: [row] }),
        }
      );
    }

    if (!sheetsRes.ok) {
      const t = await sheetsRes.text();
      console.error("[google-sheets-add-row] Erreur Sheets API:", sheetsRes.status, t);
      return err(`Sheets API ${sheetsRes.status}`, 502);
    }

    return ok({ success: true });
  } catch (e) {
    console.error("[google-sheets-add-row] Exception:", e.message);
    return err(e.message);
  }
};
