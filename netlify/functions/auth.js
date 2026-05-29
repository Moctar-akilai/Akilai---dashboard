const { err } = require('./config');

function requireAuth(event) {
  const clientId = event.headers?.['x-client-id'] || null;
  if (!clientId) return { error: err('Non autorisé — session expirée', 401) };
  return { clientId };
}

function filterByClient(clientId, extraFormula) {
  const base = `{ClientId}="${clientId}"`;
  const formula = extraFormula ? `AND(${base},${extraFormula})` : base;
  return `filterByFormula=${encodeURIComponent(formula)}`;
}

module.exports = { requireAuth, filterByClient };
