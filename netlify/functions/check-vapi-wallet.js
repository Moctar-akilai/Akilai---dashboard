const { ok, err, preflight, corsHeaders } = require("./config");
const { verifyAdminToken, unauthorized } = require("./admin-utils");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (!verifyAdminToken(event)) return unauthorized();

  const VAPI_API_KEY = process.env.VAPI_API_KEY || "";
  if (!VAPI_API_KEY) return err("VAPI_API_KEY non configurée", 503);

  try {
    const res = await fetch("https://api.vapi.ai/account", {
      headers: { Authorization: `Bearer ${VAPI_API_KEY}` },
    });
    if (!res.ok) return err(`Vapi API ${res.status}`, 502);
    const data = await res.json();
    const balance = data.billingLimits?.balance ?? data.balance ?? null;
    return ok({ balance, currency: "USD", raw: data });
  } catch (e) {
    return err(e.message);
  }
};
