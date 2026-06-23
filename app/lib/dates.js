// app/lib/dates.js
// Formatage des dates/heures en fuseau Europe/Paris.
//
// ⚠️ POUR LES TIMESTAMPS UTC UNIQUEMENT (colonnes `timestamp without time zone`
// qui stockent de l'UTC : created_at des messages, etc.). Ces colonnes sont
// renvoyées SANS suffixe de fuseau ("2026-06-23T16:45:00"), et `new Date(...)`
// les interpréterait comme heure LOCALE → affichage du wallclock UTC au lieu du
// local FR. parseUTC force l'interprétation UTC, puis on formate en Europe/Paris.
//
// ⚠️ NE PAS utiliser ces helpers sur les colonnes `date` PURES (date_visite,
// date_demarrage_chantier, date_limite_devis, signatures, expirations…) : ce sont
// des jours sans heure, les reparser en UTC risquerait de décaler le jour.
//
// Le timeZone:'Europe/Paris' explicite garantit le bon résultat même côté serveur
// (Vercel/Node en UTC), indépendamment du fuseau de la machine.

// Parse un timestamp UTC sans suffixe de fuseau en objet Date (instant correct).
// Accepte "2026-06-23T16:45:00", "2026-06-23 16:45:00" ou déjà suffixé "…Z".
// null/undefined → null.
export function parseUTC(ts) {
  if (!ts) return null
  return new Date(ts.endsWith('Z') ? ts : ts.replace(' ', 'T') + 'Z')
}

// Heure seule "HH:mm" en Europe/Paris (ex. "18:45").
export function fmtHeureFR(ts) {
  const d = parseUTC(ts)
  if (!d) return ''
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })
}

// Date courte + heure en Europe/Paris (ex. "23 juin, 18:45").
export function fmtDateHeureFR(ts) {
  const d = parseUTC(ts)
  if (!d) return ''
  return d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })
}

// Fenêtre d'édition d'un message (aligné sur le trigger SQL : interval '10 minutes').
// ⚠️ Affichage du bouton « modifier » UNIQUEMENT — le vrai gardien reste le
// trigger messages_lock_columns (qui rejette toute édition hors fenêtre/auteur).
export const DELAI_EDITION_MS = 10 * 60 * 1000

export function estDansDelaiEdition(ts) {
  const d = parseUTC(ts)
  return !!d && (Date.now() - d.getTime()) < DELAI_EDITION_MS
}
