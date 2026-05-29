const { BASE_URL, headers, ok, err, preflight } = require('./config');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();
  if (event.httpMethod !== 'POST') return err('Méthode non autorisée', 405);

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return err('JSON invalide', 400); }

  const { email } = body;
  if (!email) return err('Email requis', 400);

  try {
    /* Tentative avec filtre */
    const res = await fetch(
      `${BASE_URL}/Clients?filterByFormula=${encodeURIComponent(`{Email}="${email.trim()}"`)}`,
      { headers }
    );
    if (!res.ok) return err(`Airtable ${res.status}`, 502);

    const data = await res.json();
    const records = data.records || [];

    console.log('[auth-login] Email cherché:', email.trim());
    console.log('[auth-login] Records trouvés par filtre:', records.length);
    if (records[0]) {
      console.log('[auth-login] Champs du 1er record:', JSON.stringify(records[0].fields));
    }

    /* Si filtre vide, récupérer les 3 premiers pour voir les noms de champs réels */
    if (records.length === 0) {
      const sampleRes = await fetch(`${BASE_URL}/Clients?maxRecords=3`, { headers });
      if (sampleRes.ok) {
        const sampleData = await sampleRes.json();
        const sample = sampleData.records || [];
        console.log('[auth-login] DIAGNOSTIC — noms de champs réels (3 premiers records):',
          JSON.stringify(sample.map(r => Object.keys(r.fields)))
        );
        console.log('[auth-login] DIAGNOSTIC — valeurs du 1er record:', JSON.stringify(sample[0]?.fields));
      }
      return ok({ ok: false, message: 'Email non reconnu. Contactez AkilAI.' });
    }

    const record = records[0];
    return ok({
      ok: true,
      clientId: record.id,
      nom: record.fields?.Entreprise || record.fields?.Nom || email,
      email: record.fields?.Email || email,
    });
  } catch (e) {
    console.error('[auth-login] Erreur:', e.message);
    return err(e.message);
  }
};
