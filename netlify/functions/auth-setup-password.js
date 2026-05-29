const bcrypt = require('bcryptjs');
const { BASE_URL, headers, ok, err, preflight } = require('./config');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();
  if (event.httpMethod !== 'POST') return err('Méthode non autorisée', 405);

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return err('JSON invalide', 400); }

  const { token, password } = body;
  if (!token || !password) return err('Token et mot de passe requis', 400);
  if (password.length < 8) return err('Mot de passe trop court (8 caractères minimum)', 400);

  try {
    const res = await fetch(
      `${BASE_URL}/Clients?filterByFormula=${encodeURIComponent(`{InviteToken}="${token}"`)}`,
      { headers }
    );
    if (!res.ok) return err(`Airtable ${res.status}`, 502);

    const data = await res.json();
    const record = data.records?.[0];
    if (!record) return ok({ ok: false, error: 'Lien invalide ou déjà utilisé' });

    const expiry = record.fields?.InviteExpiry;
    if (expiry && new Date(expiry) < new Date()) {
      return ok({ ok: false, error: 'Ce lien a expiré (valide 7 jours)' });
    }

    const hashed = await bcrypt.hash(password, 12);

    const update = await fetch(`${BASE_URL}/Clients/${record.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        fields: { MotDePasse: hashed, InviteToken: '', InviteExpiry: '' },
      }),
    });
    if (!update.ok) return err(`Airtable ${update.status}`, 502);

    return ok({
      ok: true,
      clientId: record.id,
      nom: record.fields?.Entreprise || record.fields?.Nom || record.fields?.Email || 'Client',
      email: record.fields?.Email || '',
    });
  } catch (e) {
    return err(e.message);
  }
};
