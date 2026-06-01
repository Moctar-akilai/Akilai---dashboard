const { BASE_URL, headers, ok, err, preflight } = require("./config");
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
        "sort[0][field]": "Date activation",
        "sort[0][direction]": "desc",
      });
      if (offset) params.set("offset", offset);

      const res = await fetch(`${BASE_URL}/tble4KroqvA1JodJs?${params.toString()}`, { headers });
      if (!res.ok) {
        const text = await res.text();
        return err(`Airtable ${res.status}: ${text}`, 502);
      }
      const data = await res.json();
      if (data.error) return err(data.error.message || "Airtable error");
      if (data.records) allRecords = allRecords.concat(data.records);
      offset = data.offset || null;
    } while (offset);

    const automations = allRecords.map((r) => {
      const f = r.fields || {};
      return {
        id: r.id,
        nom: f.Nom || "",
        type: f.Type || "",
        statut: f.Statut || "Actif",
        userId: f["User ID"] || "",
        makeScenarioId: f["Make scenario ID"] || null,
        appelsTraites: f["Appels traités"] || 0,
        messagesTraites: f["Messages traités"] || 0,
        rdvPris: f["RDV pris"] || 0,
        recordId: f["Record ID"] || r.id,
      };
    });

    return ok({ automations });
  } catch (e) {
    return err(e.message);
  }
};
