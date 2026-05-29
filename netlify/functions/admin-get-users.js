const { corsHeaders, ok, err, preflight } = require("./config");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "GET") return err("Méthode non autorisée", 405);

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return err("ADMIN_PASSWORD non configuré", 500);

  const provided = event.headers["x-admin-password"] || "";
  if (provided !== adminPassword) return err("Mot de passe incorrect", 401);

  const serviceRole = process.env.NETLIFY_IDENTITY_SERVICE_ROLE;
  if (!serviceRole) return err("NETLIFY_IDENTITY_SERVICE_ROLE non configuré", 500);

  const siteUrl = process.env.URL || "https://portal-akilai.netlify.app";

  try {
    const res = await fetch(`${siteUrl}/.netlify/identity/admin/users?per_page=200`, {
      headers: {
        Authorization: `Bearer ${serviceRole}`,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      return err(`Netlify Identity API ${res.status}: ${text}`, 502);
    }

    const data = await res.json();
    const users = (data.users || []).map((u) => ({
      id: u.id,
      email: u.email,
      airtable_client_id: u.app_metadata?.airtable_client_id || null,
      created_at: u.created_at,
      confirmed: !!u.confirmed_at,
    }));

    return ok({ users });
  } catch (e) {
    return err(e.message);
  }
};
