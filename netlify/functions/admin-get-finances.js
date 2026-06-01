const { BASE_URL, headers, ok, err, preflight, corsHeaders } = require("./config");
const { verifyAdminToken, unauthorized } = require("./admin-utils");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (!verifyAdminToken(event)) return unauthorized();

  try {
    if (event.httpMethod === "GET") {
      // Fetch first record from /Configurations
      const res = await fetch(`${BASE_URL}/Configurations?maxRecords=1`, { headers });
      const data = await res.json();

      if (data.error) return err(data.error.message || "Airtable error");

      const record = data.records && data.records[0];
      if (!record) {
        return ok({
          couts: { vapi: 0, elevenlabs: 0, make: 0, twilio: 0, netlify: 0, openai: 0, autres: 0 },
          updatedAt: null,
        });
      }

      const f = record.fields || {};
      let couts = { vapi: 0, elevenlabs: 0, make: 0, twilio: 0, netlify: 0, openai: 0, autres: 0 };
      try {
        couts = typeof f.Couts === "string" ? JSON.parse(f.Couts) : f.Couts || couts;
      } catch (e) {
        // keep defaults
      }

      return ok({ couts, updatedAt: f.UpdatedAt || record.createdTime });
    }

    if (event.httpMethod === "POST") {
      const { couts } = JSON.parse(event.body || "{}");
      if (!couts) return err("couts is required");

      // Check if a record already exists
      const listRes = await fetch(`${BASE_URL}/Configurations?maxRecords=1`, { headers });
      const listData = await listRes.json();

      if (listData.error) return err(listData.error.message || "Airtable error");

      const existingRecord = listData.records && listData.records[0];

      if (existingRecord) {
        // Update existing record
        const patchRes = await fetch(`${BASE_URL}/Configurations/${existingRecord.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            fields: {
              Couts: JSON.stringify(couts),
              UpdatedAt: new Date().toISOString(),
            },
          }),
        });
        const patchData = await patchRes.json();
        if (patchData.error) return err(patchData.error.message || "Airtable error");
      } else {
        // Create new record
        const createRes = await fetch(`${BASE_URL}/Configurations`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            fields: {
              Couts: JSON.stringify(couts),
              UpdatedAt: new Date().toISOString(),
            },
          }),
        });
        const createData = await createRes.json();
        if (createData.error) return err(createData.error.message || "Airtable error");
      }

      return ok({ ok: true });
    }

    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method not allowed" }) };
  } catch (e) {
    return err(e.message);
  }
};
