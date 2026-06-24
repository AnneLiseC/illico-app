// app/lib/expiration.js
// Calcul de l'expiration d'accès client + statut d'accès.
// Réutilisé par le stamp à la clôture (tr.3), le guard espace-client (tr.4) et le
// cron (tr.5).
//
// ⚠️ On manipule des DATES PURES ('YYYY-MM-DD', colonnes `date`) : pas de fuseau,
// pas de piège UTC. La comparaison lexicographique de chaînes ISO zero-paddées
// équivaut à une comparaison de dates ('2026-03-09' < '2026-03-10').

export const MOIS_VALIDITE = 3            // base + 3 mois = expiration
export const JOURS_PREAVIS = 21           // « bientôt » : ≤ 21 j avant expiration
export const JOURS_GRACE_DESACTIVATION = 14 // tr.5 : désactivation à expiration + 14 j

// Ajoute n mois à une date 'YYYY-MM-DD' → 'YYYY-MM-DD' (ou null).
function addMonths(dateStr, n) {
  if (!dateStr) return null
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number)
  const base = new Date(Date.UTC(y, m - 1, d))
  base.setUTCMonth(base.getUTCMonth() + n)
  return base.toISOString().slice(0, 10)
}

// Ajoute n jours (n peut être négatif) à une date 'YYYY-MM-DD' → 'YYYY-MM-DD'.
function addDays(dateStr, n) {
  if (!dateStr) return null
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number)
  const base = new Date(Date.UTC(y, m - 1, d))
  base.setUTCDate(base.getUTCDate() + n)
  return base.toISOString().slice(0, 10)
}

// Date du jour en 'YYYY-MM-DD' (date pure, locale machine).
function aujourdHui() {
  return new Date().toISOString().slice(0, 10)
}

// Formate une DATE PURE 'YYYY-MM-DD' en FR (« 15 octobre 2026 »). Construction
// LOCALE depuis les composants → pas de décalage UTC (≠ new Date('YYYY-MM-DD')
// qui serait interprété en UTC minuit). À utiliser pour les colonnes `date`,
// PAS pour les timestamps (ceux-là passent par lib/dates).
export function formatDateFR(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Date d'expiration = (date_fin_chantier ou date_cloture) + 3 mois, ou null si
// aucune base (dossier non clôturé → accès illimité).
export function calculerExpiration(dossier) {
  const base = dossier?.date_fin_chantier || dossier?.date_cloture || null
  return base ? addMonths(base, MOIS_VALIDITE) : null
}

// Statut d'accès : 'ouvert' | 'bientot' (≤21 j) | 'expire'. Utilise acces_expire_le
// s'il est stocké, sinon le recalcule. Pas de base → 'ouvert' (illimité).
export function statutAcces(dossier, today = aujourdHui()) {
  const exp = dossier?.acces_expire_le || calculerExpiration(dossier)
  if (!exp) return 'ouvert'
  const t = today.slice(0, 10)
  if (t >= exp) return 'expire'                       // J : accès expiré
  if (t >= addDays(exp, -JOURS_PREAVIS)) return 'bientot' // J-21 → J-1
  return 'ouvert'
}

// Date de désactivation du compte (tr.5) = expiration + 14 j, ou null.
export function dateDesactivation(dossier) {
  const exp = dossier?.acces_expire_le || calculerExpiration(dossier)
  return exp ? addDays(exp, JOURS_GRACE_DESACTIVATION) : null
}
