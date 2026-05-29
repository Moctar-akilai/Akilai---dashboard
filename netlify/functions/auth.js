const { err } = require("./config");

/**
 * Helper d'authentification pour les Netlify Functions.
 *
 * Netlify Identity parse automatiquement le JWT du header Authorization
 * et expose l'utilisateur dans context.clientContext.user.
 * Aucune librairie externe requise — c'est le mécanisme natif Netlify.
 *
 * Usage dans une function :
 *   const auth = requireAuth(event, context);
 *   if (auth.error) return auth.error;
 *   const { clientId, user } = auth;
 */
function requireAuth(event, context) {
  /* En développement local, accepter le header x-client-id comme fallback */
  const isDev = process.env.NETLIFY_DEV === "true" || process.env.NODE_ENV === "development";

  const user = context?.clientContext?.user;

  if (!user) {
    if (isDev) {
      /* Dev local : lire le clientId depuis le header x-client-id */
      const devClientId = event.headers?.["x-client-id"] || null;
      if (devClientId) {
        return { user: null, clientId: devClientId, isDev: true };
      }
    }
    return { error: err("Non autorisé — token manquant ou invalide", 401) };
  }

  const clientId = user.app_metadata?.airtable_client_id || null;
  if (!clientId) {
    return { error: err("Compte non configuré — airtable_client_id manquant", 403) };
  }

  return { user, clientId, isDev: false };
}

/**
 * Construit le filterByFormula Airtable pour isoler les données du client.
 * Ex: filterByClient("recXXXX") → "?filterByFormula=%7BClientId%7D%3D%22recXXXX%22"
 */
function filterByClient(clientId, extraFormula) {
  const base = `{ClientId}="${clientId}"`;
  const formula = extraFormula ? `AND(${base},${extraFormula})` : base;
  return `filterByFormula=${encodeURIComponent(formula)}`;
}

module.exports = { requireAuth, filterByClient };
