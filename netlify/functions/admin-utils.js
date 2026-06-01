const { corsHeaders } = require("./config");

function verifyAdminToken(event) {
  const auth = event.headers && (event.headers.authorization || event.headers.Authorization);
  if (!auth || !auth.startsWith("Bearer ")) return false;
  const token = auth.slice(7);
  try {
    const decoded = Buffer.from(token, "base64").toString("utf8");
    const parts = decoded.split(":");
    if (parts.length < 3) return false;
    const [email, timestamp, ...pwParts] = parts;
    const password = pwParts.join(":");
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
    if (email !== ADMIN_EMAIL) return false;
    if (password !== ADMIN_PASSWORD) return false;
    if (Date.now() - Number(timestamp) > 86400000) return false;
    return true;
  } catch (e) {
    return false;
  }
}

function unauthorized() {
  return {
    statusCode: 401,
    headers: corsHeaders,
    body: JSON.stringify({ ok: false, error: "Non autorisé" }),
  };
}

module.exports = { verifyAdminToken, unauthorized };
