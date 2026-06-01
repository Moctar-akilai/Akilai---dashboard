const { BASE_URL, headers, ok, err, preflight, corsHeaders } = require("./config");
const { verifyAdminToken, unauthorized } = require("./admin-utils");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();

  const tokenOk = verifyAdminToken(event);
  console.log("[admin-get-tickets] Token reçu:", !!(event.headers && (event.headers.authorization || event.headers.Authorization)));
  console.log("[admin-get-tickets] Token valide:", tokenOk);
  if (!tokenOk) return unauthorized();

  try {
    let allRecords = [];
    let offset = null;

    do {
      const params = new URLSearchParams({
        maxRecords: "100",
        "sort[0][field]": "N° Ticket",
        "sort[0][direction]": "desc",
      });
      if (offset) params.set("offset", offset);

      const url = `${BASE_URL}/tbl42Bo0bb6BRfavB?${params.toString()}`;
      const res = await fetch(url, { headers });
      console.log("[admin-get-tickets] Statut Airtable:", res.status);

      if (!res.ok) {
        const text = await res.text();
        console.error("[admin-get-tickets] Erreur Airtable:", text);
        return err(`Airtable ${res.status}: ${text}`, 502);
      }

      const data = await res.json();
      if (data.error) {
        console.error("[admin-get-tickets] Airtable error:", data.error);
        return err(data.error.message || "Airtable error");
      }

      if (data.records) allRecords = allRecords.concat(data.records);
      offset = data.offset || null;
    } while (offset);

    console.log("[admin-get-tickets] Nb tickets:", allRecords.length);

    const tickets = allRecords.map((r, i) => {
      const f = r.fields || {};
      let conversation = [];
      try { conversation = JSON.parse(f.Conversation || "[]"); } catch (e) { conversation = []; }
      const autoNoms = Array.isArray(f["Nom (from Automatisation concernée)"])
        ? f["Nom (from Automatisation concernée)"]
        : [];
      return {
        id: r.id,
        numero: f["N° Ticket"] || i + 1,
        client: Array.isArray(f.Client) ? (f["Nom (from Client)"]?.[0] || "") : (f.Client || ""),
        sujet: f.Sujet || "",
        message: f.Message || "",
        priorite: f.Priorité || "Normale",
        statut: f.Statut || "Ouvert",
        dateCreation: f["Date création"] || r.createdTime,
        dateResolution: f["Date résolution"] || null,
        automatisation: autoNoms.length ? autoNoms.join(", ") : "",
        conversation,
        userId: f["User ID"] || "",
      };
    });

    return ok({ tickets });
  } catch (e) {
    console.error("[admin-get-tickets] Exception:", e.message);
    return err(e.message);
  }
};
