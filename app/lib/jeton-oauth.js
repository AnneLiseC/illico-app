// app/lib/jeton-oauth.js
// Distingue un jeton de SESSION de l'app d'un jeton émis par le serveur OAuth 2.1 de
// Supabase pour une application tierce (connecteur Claude « BATILIS »).
//
// Doc Supabase : un jeton OAuth porte un claim `client_id` en plus des claims habituels ;
// un jeton de session (mot de passe, lien magique) n'en a pas.
// https://supabase.com/docs/guides/auth/oauth-server/token-security
//
// POURQUOI. Les routes /api/* valident le jeton puis travaillent en service_role, qui
// contourne la RLS. Sans ce filtre, un jeton OAuth (donné à Claude pour LIRE) pourrait
// appeler ces routes et écrire. Seul le serveur MCP accepte un jeton OAuth.
//
// Ce module ne VÉRIFIE PAS la signature : il lit les claims. La vérification reste faite
// par `auth.getUser(jeton)` côté appelant. Un attaquant qui retirerait `client_id` d'un
// jeton casserait sa signature et serait rejeté par getUser.

/** Claims (payload) d'un JWT, ou null si illisible. Aucune vérification de signature. */
export function claimsJeton(jeton) {
  if (typeof jeton !== 'string') return null
  const parties = jeton.split('.')
  if (parties.length !== 3) return null
  try {
    const claims = JSON.parse(Buffer.from(parties[1], 'base64url').toString('utf8'))
    return claims && typeof claims === 'object' && !Array.isArray(claims) ? claims : null
  } catch {
    return null
  }
}

/**
 * true si le jeton a été émis pour un client OAuth (claim `client_id` présent).
 * FAIL-CLOSED : un jeton illisible est traité comme OAuth (donc refusé par les routes /api/*).
 */
export function estJetonOAuth(jeton) {
  const claims = claimsJeton(jeton)
  if (!claims) return true
  return claims.client_id !== undefined && claims.client_id !== null
}
