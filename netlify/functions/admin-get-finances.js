const { BASE_URL, headers, ok, err, preflight, corsHeaders } = require("./config");
const { verifyAdminToken, unauthorized } = require("./admin-utils");

function currentMonthKey() {
  const n = new Date();
  return `${n.getFullYear()}_${String(n.getMonth() + 1).padStart(2, "0")}`;
}

const DEFAULT_COUTS = { vapi: 0, elevenlabs: 0, make: 0, twilio: 0, netlify: 0, openai: 0, autres: 0 };

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (!verifyAdminToken(event)) return unauthorized();

  try {
    const listRes = await fetch(`${BASE_URL}/Configurations?maxRecords=1`, { headers });
    const listData = await listRes.json();
    if (listData.error) return err(listData.error.message || "Airtable error");
    const record = listData.records?.[0] || null;

    if (event.httpMethod === "GET") {
      if (!record) return ok({ couts: DEFAULT_COUTS, cac: 0, updatedAt: null });

      const raw = record.fields?.Finances;
      let data = { months: {}, cac: 0 };
      try { if (raw) data = JSON.parse(raw); } catch (e) {}

      const monthKey = currentMonthKey();
      const couts = data.months?.[monthKey] || DEFAULT_COUTS;
      const cac = data.cac || 0;

      return ok({ couts, cac, updatedAt: data.updatedAt || null, allMonths: data.months || {} });
    }

    if (event.httpMethod === "POST") {
      const bodyData = JSON.parse(event.body || "{}");
      const { couts, cac } = bodyData;
      if (!couts) return err("couts requis", 400);
      const monthKey = bodyData.monthKey || currentMonthKey();

      // Merge with existing months
      let existing = { months: {}, cac: 0 };
      try {
        const raw = record?.fields?.Finances;
        if (raw) existing = JSON.parse(raw);
      } catch (e) {}

      existing.months = existing.months || {};
      existing.months[monthKey] = couts;
      existing.cac = cac ?? existing.cac;
      existing.updatedAt = new Date().toISOString();

      const fields = { Finances: JSON.stringify(existing) };

      let res;
      if (record) {
        res = await fetch(`${BASE_URL}/Configurations/${record.id}`, {
          method: "PATCH", headers, body: JSON.stringify({ fields }),
        });
      } else {
        res = await fetch(`${BASE_URL}/Configurations`, {
          method: "POST", headers, body: JSON.stringify({ fields }),
        });
      }

      const data = await res.json();
      if (data.error) return err(data.error.message || "Airtable error");
      return ok({ ok: true });
    }

    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method not allowed" }) };
  } catch (e) {
    return err(e.message);
  }
};
