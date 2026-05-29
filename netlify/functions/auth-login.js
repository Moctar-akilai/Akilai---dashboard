const bcrypt = require('bcryptjs');
const { BASE_URL, headers, ok, err, preflight } = require('./config');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();
  if (event.httpMethod !== 'POST') return err('Méthode non autorisée', 405);

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return err('JSON invalide', 400); }

  const { email, password } = body;
  if (!email || !password) return err('Email et mot de passe requis', 400);

  try {
    const res = await fetch(
      `${BASE_URL}/Clients?filterByFormula=${encodeURIComponent(`{Email}="${email}"`)}`,
      { headers }
    );
    if (!res.ok) return err(`Airtable ${res.status}`, 502);

    const data = await res.json();
    const record = data.records?.[0];

    if (!record) return ok({ ok: false, error: 'Email ou mot de passe incorrect' });

    const hash = record.fields?.MotDePasse;
    if (!hash) return ok({ ok: false, error: 'Compte non configuré — contactez AkilAI' });

    const valid = await bcrypt.compare(password, hash);
    if (!valid) return ok({ ok: false, error: 'Email ou mot de passe incorrect' });

    return ok({
      ok: true,
      clientId: record.id,
      nom: record.fields?.Entreprise || record.fields?.Nom || email,
      email: record.fields?.Email || email,
    });
  } catch (e) {
    return err(e.message);
  }
};
