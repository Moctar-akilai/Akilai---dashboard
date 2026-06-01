const { BASE_URL, headers, ok, err, preflight, corsHeaders } = require("./config");
const { verifyAdminToken, unauthorized } = require("./admin-utils");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (!verifyAdminToken(event)) return unauthorized();

  try {
    const qs = event.queryStringParameters || {};
    const limit = Math.min(parseInt(qs.limit || "500", 10), 500);

    const params = new URLSearchParams({
      maxRecords: String(limit),
      "sort[0][field]": "Date de creation",
      "sort[0][direction]": "desc",
    });

    const res = await fetch(`${BASE_URL}/tblxXBGjv6iZU41XY?${params.toString()}`, { headers });
    if (!res.ok) {
      const text = await res.text();
      return err(`Airtable ${res.status}: ${text}`, 502);
    }
    const data = await res.json();

    if (data.error) return err(data.error.message || "Airtable error");

    const historique = (data.records || []).map((r) => {
      const f = r.fields || {};
      return {
        id: r.id,
        type: f.Type || "",
        canal: f.Canal || "",
        nom: f.Titre || "Inconnu",
        numero: f["Numéro client"] || "",
        date: f["Date de creation"] || r.createdTime,
        statut: f.Statut || "",
        userId: f["User ID"] || "",
        resume: f["Résumé"] || f.Détails || "",
        duree: f["Durée"] || 0,
        messageEntrant: f["Message entrant"] || "",
        transcription: f.Transcription || "",
        intention: f.Intention || "",
      };
    });

    return ok({ historique });
  } catch (e) {
    return err(e.message);
  }
};
