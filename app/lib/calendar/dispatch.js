// app/lib/calendar/dispatch.js
// Couche de dispatch par fournisseur (lot 6b-1). Point d'entrée unique de l'écriture
// calendrier pour push/event : getClientForCible(cibleId) résout la cible → compte,
// lit compte.fournisseur, et renvoie un handle à interface commune :
//   { fournisseur, calendarId, compteOauthId, upsert({eventBody, externalId, contexte}),
//     delete({externalId, contexte}) }   ou null (cible inerte → skip, comme avant).
//
// ⚠️ Au 6b-1 SEUL Google est routé (0 compte iCloud en base) : le handle Google appelle
// EXACTEMENT le code d'avant (upsertEvent/deleteEvent/gcalWrite de google.js, même client
// googleapis). Refactoring pur — aucun changement de comportement Google. Le client iCloud
// (CalDAV) arrivera au 6b-2 dans la branche `else` ci-dessous (aujourd'hui inatteignable).

import { resolveCible, buildGoogleCalendar, makeGoogleClientHandle } from './google'

export async function getClientForCible(cibleId) {
  const resolved = await resolveCible(cibleId)
  if (!resolved) return null // cible introuvable ou sans compte → rien à pousser

  if (resolved.compte.fournisseur === 'google') {
    const googleCal = buildGoogleCalendar(resolved)
    if (!googleCal) return null // compte sans refresh_token → cible inerte (comme avant)
    return makeGoogleClientHandle(googleCal)
  }

  // 6b-2 : branche iCloud (CalDAV). Inatteignable au 6b-1 (aucun compte non-google) :
  // ce throw est un garde-fou explicite qui remplace l'ancien filtre fournisseur='google'.
  throw new Error(`Fournisseur calendrier non supporté: ${resolved.compte.fournisseur}`)
}
