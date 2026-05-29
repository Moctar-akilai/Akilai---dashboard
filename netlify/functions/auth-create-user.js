const bcrypt = require('bcryptjs');
const { BASE_URL, headers, ok, err, preflight } = require('./config');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();
  if (event.httpMethod !== 'POST') return err('Méthode non autorisée', 405);

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return err('ADMIN_PASSWORD non configuré', 500);
  if (event.headers['x-admin-password'] !== adminPassword) return err('Non autorisé', 401);

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return err('JSON invalide', 400); }

  const { clientId, password } = body;
  if (!clientId || !password) return err('clientId et password requis', 400);
  if (password.length < 8) return err('Mot de passe trop court (8 caractères minimum)', 400);

  try {
    const hashed = await bcrypt.hash(password, 12);
    const res = await fetch(`${BASE_URL}/Clients/${clientId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ fields: { MotDePasse: hashed } }),
    });
    if (!res.ok) return err(`Airtable ${res.status}`, 502);
    return ok({ ok: true });
  } catch (e) {
    return err(e.message);
  }
};
