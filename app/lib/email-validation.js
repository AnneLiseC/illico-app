// app/lib/email-validation.js
// Validation du domaine email pour les comptes STAFF (agente, et futur admin).
// Les CLIENTS ne sont PAS concernés (lien magique, n'importe quel domaine).
//
// Règle : un email staff doit appartenir au réseau illiCO (@illico-travaux.com),
// SAUF s'il figure dans la liste d'exceptions STAFF_EMAIL_EXCEPTIONS (réservée
// aux tests). La variable est SERVEUR-ONLY (pas de préfixe NEXT_PUBLIC) : les
// exceptions ne sont jamais exposées au navigateur. Ce helper est donc destiné
// à être appelé côté serveur (routes /api), pas dans un composant client.

const STAFF_DOMAIN = 'illico-travaux.com'

// Exceptions lues depuis l'env : chaîne d'emails séparés par virgule.
// Absente → liste vide (seul le domaine illiCO passe). Normalisées trim+lowercase.
function parseExceptions() {
  return (process.env.STAFF_EMAIL_EXCEPTIONS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * @param {string} email
 * @returns {boolean} true si l'email est autorisé pour un compte staff.
 */
export function isAllowedStaffEmail(email) {
  if (!email || typeof email !== 'string') return false
  const normalized = email.trim().toLowerCase()
  if (normalized.endsWith('@' + STAFF_DOMAIN)) return true
  return parseExceptions().includes(normalized)
}
