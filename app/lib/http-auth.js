// app/lib/http-auth.js
// Vérification d'un secret partagé passé en header "Authorization: Bearer <secret>".
// Utilisé par les routes protégées SANS utilisateur authentifié : les crons Vercel
// (CRON_SECRET) et l'invitation d'admin franchisé (ADMIN_INVITE_SECRET).
//
// Deux garanties par rapport à l'ancien `header !== \`Bearer ${process.env.X}\`` :
//   1. FAIL-CLOSED : si le secret attendu est absent/vide (oubli de config, preview
//      Vercel sans variable), on REFUSE au lieu de comparer à "Bearer undefined"
//      — sinon un appelant envoyant littéralement "Bearer undefined" passerait.
//   2. TEMPS CONSTANT : comparaison via crypto.timingSafeEqual (pas de fuite timing),
//      cohérent avec la vérif du state OAuth (auth/google/callback).

import crypto from 'crypto'

/**
 * @param {Request} request - la requête entrante (route handler Next.js)
 * @param {string|undefined} expected - le secret attendu (ex: process.env.CRON_SECRET)
 * @returns {boolean} true si le header correspond exactement au secret configuré
 */
export function checkBearerSecret(request, expected) {
  // Fail-closed : pas de secret configuré => aucun accès possible.
  if (!expected || typeof expected !== 'string') return false

  const header =
    request.headers.get('authorization') || request.headers.get('Authorization') || ''

  const a = Buffer.from(header)
  const b = Buffer.from(`Bearer ${expected}`)
  // timingSafeEqual exige des longueurs égales : on court-circuite proprement sinon.
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
