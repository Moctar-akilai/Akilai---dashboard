const { ok, err, preflight } = require("./config");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Méthode non autorisée", 405);

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return err("ADMIN_PASSWORD non configuré", 500);

  const provided = event.headers["x-admin-password"] || "";
  if (provided !== adminPassword) return err("Mot de passe incorrect", 401);

  const serviceRole = process.env.NETLIFY_IDENTITY_SERVICE_ROLE;
  if (!serviceRole) return err("NETLIFY_IDENTITY_SERVICE_ROLE non configuré", 500);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return err("JSON invalide", 400); }

  const { userId } = body;
  if (!userId) return err("userId manquant", 400);

  const siteUrl = process.env.URL || "https://portal-akilai.netlify.app";

  try {
    const res = await fetch(`${siteUrl}/.netlify/identity/admin/users/${userId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${serviceRole}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ confirm: true }),
    });

    if (!res.ok) {
      const text = await res.text();
      return err(`Netlify Identity API ${res.status}: ${text}`, 502);
    }

    const updated = await res.json();
    return ok({
      ok: true,
      userId: updated.id,
      email: updated.email,
      confirmed: !!updated.confirmed_at,
    });
  } catch (e) {
    return err(e.message);
  }
};
