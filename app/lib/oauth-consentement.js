// app/lib/oauth-consentement.js
// Règles partagées du connecteur MCP « BATILIS » entre le serveur (/api/mcp), la page de
// consentement (/oauth/consent) et la page de connexion (/login?next=…).
// Module pur : aucun import, utilisable côté navigateur comme côté serveur.

// Rôles autorisés à utiliser le connecteur. Distinction par RÔLE, jamais par nom ou id.
export const ROLES_CONNECTEUR = ['admin', 'agente']

// Chemin de la page de consentement. Doit être identique au réglage « Authorization Path »
// du serveur OAuth Supabase (Authentication > OAuth Server).
// https://supabase.com/docs/guides/auth/oauth-server/getting-started
export const CHEMIN_CONSENTEMENT = '/oauth/consent'

const ORIGINE_FICTIVE = 'https://batilis.invalid'
const AUTHORIZATION_ID = /^[A-Za-z0-9_-]{1,200}$/

/**
 * Valide le paramètre `next` de /login. Seul un retour vers la page de consentement est
 * accepté, reconstruit à partir de son seul paramètre `authorization_id`. Tout le reste
 * (autre domaine, //domaine, URL encodée, javascript:, autre chemin) → null.
 * @returns {string|null} chemin relatif sûr, ou null
 */
export function retourConsentementSur(valeur) {
  if (typeof valeur !== 'string' || !valeur.startsWith(`${CHEMIN_CONSENTEMENT}?`)) return null
  let url
  try { url = new URL(valeur, ORIGINE_FICTIVE) } catch { return null }
  if (url.origin !== ORIGINE_FICTIVE || url.pathname !== CHEMIN_CONSENTEMENT) return null
  const id = url.searchParams.get('authorization_id')
  if (!id || !AUTHORIZATION_ID.test(id)) return null
  return `${CHEMIN_CONSENTEMENT}?authorization_id=${id}`
}
