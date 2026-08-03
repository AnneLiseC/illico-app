// app/lib/auth-errors.js
// Classification d'erreurs Supabase pour l'auth. Sans dépendance (testable seul).

// Distingue une erreur d'AUTH (jeton JWT expiré/invalide → 401) d'une vraie panne réseau
// ou d'un refus RLS (42501). Sur auth → refresh puis déconnexion ; sur réseau → retry.
export function estErreurAuth(error) {
  if (!error) return false
  const code = String(error.code || '')
  const msg = String(error.message || '').toLowerCase()
  if (code === '42501') return false                 // refus RLS = pas un jeton mort
  return code === 'PGRST301' || code === '401'        // JWT expiré / non autorisé
    || msg.includes('jwt') || msg.includes('token') || msg.includes('unauthor') || msg.includes('credential')
}
