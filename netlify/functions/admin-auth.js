const { ok, err, preflight, corsHeaders } = require("./config");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { email, password } = JSON.parse(event.body || "{}");
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      const token = Buffer.from(`${email}:${Date.now()}:${password}`).toString("base64");
      return ok({ ok: true, token });
    } else {
      return ok({ ok: false, message: "Identifiants invalides" });
    }
  } catch (e) {
    return err(e.message);
  }
};
