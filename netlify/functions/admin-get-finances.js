const { BASE_URL, headers, ok, err, preflight, corsHeaders } = require("./config");
const { verifyAdminToken, unauthorized } = require("./admin-utils");

function currentMonthKey() {
  const n = new Date();
  return `${n.getFullYear()}_${String(n.getMonth() + 1).padStart(2, "0")}`;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (!verifyAdminToken(event)) return unauthorized();

  try {
    const listRes = await fetch(`${BASE_URL}/Configurations?maxRecords=1`, { headers });
    const listData = await listRes.json();
    if (listData.error) return err(listData.error.message || "Airtable error");
    const existingRecord = listData.records && listData.records[0];

    if (event.httpMethod === "GET") {
      const defaultCouts = { vapi: 0, elevenlabs: 0, make: 0, twilio: 0, netlify: 0, openai: 0, autres: 0 };
      if (!existingRecord) return ok({ couts: defaultCouts, cac: 0, updatedAt: null });

      const f = existingRecord.fields || {};
      const monthKey = currentMonthKey();

      // Couts field stores a map: { "2026_06": {...}, "2026_05": {...} }
      // or legacy flat object for backwards compat
      let couts = defaultCouts;
      try {
        const raw = f.Couts;
        if (raw) {
          const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
          // If it has a month-keyed structure, extract current month
          if (parsed[monthKey] && typeof parsed[monthKey] === "object") {
            couts = parsed[monthKey];
          } else if (parsed.vapi !== undefined || parsed.make !== undefined) {
            // legacy flat object
            couts = parsed;
          }
        }
      } catch (e) { /* keep defaults */ }

      let cac = 0;
      try { cac = Number(f.CAC || 0); } catch (e) {}

      return ok({ couts, cac, updatedAt: f.UpdatedAt || existingRecord.createdTime });
    }

    if (event.httpMethod === "POST") {
      const { couts, cac } = JSON.parse(event.body || "{}");
      if (!couts) return err("couts is required");

      const monthKey = currentMonthKey();

      // Read existing monthly map to merge
      let monthlyMap = {};
      try {
        const raw = existingRecord?.fields?.Couts;
        if (raw) {
          const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
          // If it already has month keys, keep them; otherwise start fresh
          if (parsed && typeof parsed === "object" && !parsed.vapi) {
            monthlyMap = parsed;
          }
        }
      } catch (e) {}

      monthlyMap[monthKey] = couts;

      const fields = {
        Couts: JSON.stringify(monthlyMap),
        UpdatedAt: new Date().toISOString(),
      };
      if (cac != null) fields.CAC = Number(cac);

      if (existingRecord) {
        const patchRes = await fetch(`${BASE_URL}/Configurations/${existingRecord.id}`, {
          method: "PATCH", headers, body: JSON.stringify({ fields }),
        });
        const patchData = await patchRes.json();
        if (patchData.error) return err(patchData.error.message || "Airtable error");
      } else {
        const createRes = await fetch(`${BASE_URL}/Configurations`, {
          method: "POST", headers, body: JSON.stringify({ fields }),
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
