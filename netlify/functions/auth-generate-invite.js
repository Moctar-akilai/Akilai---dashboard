const { BASE_URL, headers, ok, err, preflight } = require('./config');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();
  if (event.httpMethod !== 'POST') return err('Méthode non autorisée', 405);

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return err('ADMIN_PASSWORD non configuré', 500);
  if (event.headers['x-admin-password'] !== adminPassword) return err('Non autorisé', 401);

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return err('JSON invalide', 400); }

  const { clientId } = body;
  if (!clientId) return err('clientId requis', 400);

  const token = crypto.randomUUID();
  const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const siteUrl = (process.env.URL || 'https://portal-akilai.netlify.app').replace(/\/$/, '');

  try {
    const res = await fetch(`${BASE_URL}/Clients/${clientId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ fields: { InviteToken: token, InviteExpiry: expiry } }),
    });
    if (!res.ok) return err(`Airtable ${res.status}`, 502);

    const link = `${siteUrl}/#setup?token=${token}`;
    return ok({ ok: true, link, expiry });
  } catch (e) {
    return err(e.message);
  }
};
