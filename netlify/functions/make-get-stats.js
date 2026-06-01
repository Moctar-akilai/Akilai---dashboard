const { ok, err, preflight, corsHeaders } = require("./config");
const { verifyAdminToken, unauthorized } = require("./admin-utils");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (!verifyAdminToken(event)) return unauthorized();

  const MAKE_API_KEY = process.env.MAKE_API_KEY || "";
  if (!MAKE_API_KEY) return err("MAKE_API_KEY non configurée", 503);

  try {
    const baseUrl = "https://eu2.make.com/api/v2"; // or us2.make.com depending on region

    const [scenRes, orgRes] = await Promise.all([
      fetch(`${baseUrl}/scenarios?isActive=true`, {
        headers: { Authorization: `Token ${MAKE_API_KEY}` },
      }),
      fetch(`${baseUrl}/organizations`, {
        headers: { Authorization: `Token ${MAKE_API_KEY}` },
      }),
    ]);

    const [scenData, orgData] = await Promise.all([
      scenRes.ok ? scenRes.json() : { scenarios: [] },
      orgRes.ok ? orgRes.json() : { organizations: [] },
    ]);

    const scenarios = (scenData.scenarios || []).length;
    const org = (orgData.organizations || [])[0] || null;
    const opsUsed = org?.operationsUsed ?? null;
    const opsLimit = org?.operationsLimit ?? null;
    const opsLeft = opsLimit != null && opsUsed != null ? opsLimit - opsUsed : null;

    return ok({ scenarios, opsUsed, opsLeft, opsLimit });
  } catch (e) {
    return err(e.message);
  }
};
