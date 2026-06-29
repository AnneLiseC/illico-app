// app/lib/calendar/dispatch.js
// Couche de dispatch par fournisseur. Point d'entrée unique de l'écriture calendrier
// pour push/event : getClientForCible(cibleId) résout la cible → compte, lit
// compte.fournisseur, et renvoie un handle à interface commune :
//   { fournisseur, calendarId, compteOauthId, upsert({eventBody, externalId, contexte}),
//     delete({externalId, contexte}) }   ou null (cible inerte → skip).
//
// Le build de l'eventBody dépend AUSSI du fournisseur (JSON Google vs ICS iCloud) :
// buildRdvEventBody / buildInterventionEventBodies routent dessus. C'est le SEUL point
// de branchement par fournisseur côté appelant — push reste agnostique.
//
// ⚠️ Le chemin Google est INCHANGÉ : handle Google (google.js) intact, builders Google
//   (rdvToGoogleEvent/interventionToGoogleEvents) appelés à l'identique. Dry-run diff
//   Google = vide. iCloud (6b-2) = nouveau code, 0 compte actif → n'impacte pas Google.

import { resolveCible, buildGoogleCalendar, makeGoogleClientHandle, rdvToGoogleEvent, interventionToGoogleEvents } from './google'
import { rdvToICS, interventionToICS, buildICloudClient, makeICloudClientHandle, isCalDAVAuthError } from './icloud'

export async function getClientForCible(cibleId) {
  const resolved = await resolveCible(cibleId)
  if (!resolved) return null // cible introuvable ou sans compte → rien à pousser

  if (resolved.compte.fournisseur === 'google') {
    const googleCal = buildGoogleCalendar(resolved)
    if (!googleCal) return null // compte sans refresh_token → cible inerte (comme avant)
    return makeGoogleClientHandle(googleCal)
  }

  if (resolved.compte.fournisseur === 'icloud') {
    try {
      const client = await buildICloudClient(resolved.compte)
      return makeICloudClientHandle(client, resolved.cible)
    } catch (err) {
      // App-specific password révoqué/invalide → skip propre (pas de refresh comme OAuth).
      if (isCalDAVAuthError(err)) {
        console.log('[dispatch] cible', cibleId, 'iCloud — auth refusée (app-specific password à reconnecter), skip')
        return null
      }
      throw err
    }
  }

  // Tout autre fournisseur (ex. outlook = lot 7) : garde-fou explicite.
  throw new Error(`Fournisseur calendrier non supporté: ${resolved.compte.fournisseur}`)
}

// Build de l'eventBody selon le fournisseur du handle. Google → JSON (inchangé) ;
// iCloud → chaîne ICS. Le chemin Google passe par rdvToGoogleEvent EXACTEMENT comme avant.
export function buildRdvEventBody(client, rdv) {
  return client.fournisseur === 'icloud' ? rdvToICS(rdv) : rdvToGoogleEvent(rdv)
}

export function buildInterventionEventBodies(client, intervention) {
  return client.fournisseur === 'icloud'
    ? interventionToICS(intervention)
    : interventionToGoogleEvents(intervention)
}
