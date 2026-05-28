const { BASE_URL, headers, ok, err, preflight } = require("./config");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();

  try {
    const res = await fetch(`${BASE_URL}/Clients?maxRecords=1`, { headers });

    if (!res.ok) {
      const body = await res.text();
      console.error("Airtable ping failed:", res.status, body);
      return err(`Airtable returned ${res.status}`, 502);
    }

    const data = await res.json();
    const count = data.records?.length ?? 0;

    return ok({ ok: true, count, message: `Airtable connecté — ${count} enregistrement(s) Clients` });
  } catch (e) {
    return err(e.message);
  }
};
