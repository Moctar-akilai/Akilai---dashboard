const { BASE_URL, headers, ok, err, preflight, corsHeaders } = require("./config");
const { verifyAdminToken, unauthorized } = require("./admin-utils");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (!verifyAdminToken(event)) return unauthorized();

  try {
    let allRecords = [];
    let offset = null;

    do {
      const params = new URLSearchParams({
        maxRecords: "100",
        "sort[0][field]": "createdTime",
        "sort[0][direction]": "desc",
      });
      if (offset) params.set("offset", offset);

      const res = await fetch(`${BASE_URL}/Support?${params.toString()}`, { headers });
      const data = await res.json();

      if (data.records) {
        allRecords = allRecords.concat(data.records);
      }
      offset = data.offset || null;
    } while (offset);

    const tickets = allRecords.map((r, i) => {
      const f = r.fields || {};
      let conversation = [];
      try {
        conversation = JSON.parse(f.Conversation || "[]");
      } catch (e) {
        conversation = [];
      }
      return {
        id: r.id,
        numero: f["N° Ticket"] || f.ID || i + 1,
        client: f.Client || f["User ID"] || "",
        sujet: f.Sujet || f.Titre || "",
        priorite: f.Priorité || "Normal",
        statut: f.Statut || "Ouvert",
        dateCreation: f["Date de creation"] || r.createdTime,
        conversation,
        userId: f["User ID"] || "",
      };
    });

    return ok({ tickets });
  } catch (e) {
    return err(e.message);
  }
};
