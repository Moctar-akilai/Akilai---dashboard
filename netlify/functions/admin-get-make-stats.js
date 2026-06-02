const { ok, err, preflight, corsHeaders } = require("./config");
const { verifyAdminToken, unauthorized } = require("./admin-utils");

const MAKE_API_KEY = process.env.MAKE_API_KEY || "";
const MAKE_BASE = "https://eu1.make.com/api/v2";

function makeHeaders() {
  return { Authorization: `Token ${MAKE_API_KEY}`, "Content-Type": "application/json" };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (!verifyAdminToken(event)) return unauthorized();

  if (!MAKE_API_KEY) return err("MAKE_API_KEY not configured");

  try {
    // 1. Get team ID from current user
    const meRes = await fetch(`${MAKE_BASE}/users/me`, { headers: makeHeaders() });
    const meData = await meRes.json();
    const teamId = meData?.user?.defaultTeamId || meData?.teams?.[0]?.id || null;

    // 2. Scenarios list
    const scenUrl = teamId
      ? `${MAKE_BASE}/scenarios?teamId=${teamId}&pg[limit]=100`
      : `${MAKE_BASE}/scenarios?pg[limit]=100`;
    const scenRes = await fetch(scenUrl, { headers: makeHeaders() });
    const scenData = await scenRes.json();
    const scenarios = scenData?.scenarios || scenData?.items || [];

    let total = scenarios.length, actifs = 0, inactifs = 0, erreur = 0;
    for (const s of scenarios) {
      const st = (s.isActive !== undefined ? s.isActive : s.status) ;
      if (s.isActive === true || s.status === "active") actifs++;
      else if (s.status === "error" || s.lastError) erreur++;
      else inactifs++;
    }

    // 3. Organisation info
    let orgNom = "", orgPlan = "";
    try {
      const orgRes = await fetch(`${MAKE_BASE}/teams${teamId ? '/'+teamId : ''}`, { headers: makeHeaders() });
      const orgData = await orgRes.json();
      orgNom = orgData?.team?.name || orgData?.name || "";
      orgPlan = orgData?.team?.plan || orgData?.license?.apps || "";
    } catch {}

    return ok({
      scenarios: { total, actifs, inactifs, erreur },
      organisation: { nom: orgNom, plan: orgPlan },
    });
  } catch (e) {
    console.error("[admin-get-make-stats]", e.message);
    return err(e.message);
  }
};
