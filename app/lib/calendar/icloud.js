// app/lib/calendar/icloud.js
// Branche iCloud (CalDAV) de la synchro calendrier (lot 6b-2). Trois rôles :
//   1. Builders ICS (rdvToICS / interventionToICS) — MÊME contenu métier que Google
//      (summary / description), au format ICS (VCALENDAR) au lieu du JSON Google.
//   2. Client CalDAV via tsdav (Basic Auth + app-specific password DÉCHIFFRÉ).
//   3. Handle d'écriture à interface commune (upsert / delete), consommé par le dispatch.
//
// ⚠️ Le mapping summary/description DUPLIQUE volontairement celui de google.js
//   (rdvToGoogleEvent / interventionToGoogleEvents) : au 6b-2 on ne touche PAS google.js
//   (contrat « Google inchangé »). Toute évolution d'un libellé doit être répercutée dans
//   les DEUX fichiers ; une convergence (helper de mapping partagé) fera l'objet d'un lot
//   dédié, hors 6b.
//
// ⚠️ Aucun compte iCloud actif en base au 6b-2 : ce code n'est exécuté qu'au 6b-3 (compte
//   test). Les appels CalDAV (tsdav) sont validés contre iCloud RÉEL au 6b-3.

import { DAVClient } from 'tsdav'
import ical from 'ical-generator'
import { DateTime } from 'luxon'
import { decrypt } from './crypto'
import { DRY_RUN } from './google'

const TZ = 'Europe/Paris'

// ── Builders ICS ─────────────────────────────────────────────────────────────
// Un objet CalDAV = un VCALENDAR contenant un VEVENT. UID DÉTERMINISTE par item
// (idempotence create/update : même UID → même objet, pas de doublon au re-push).
// Les RDV (date_heure = instant UTC) sortent en UTC ; les interventions horodatées
// convertissent l'heure locale Paris en instant UTC (luxon) ; les périodes sans heure
// sortent en all-day (DTSTART;VALUE=DATE), end exclusif = lendemain (comme Google).

function icsString({ uid, summary, description, start, end, allDay }) {
  const cal = ical({ prodId: { company: 'illico-travaux', product: 'illico-app', language: 'FR' } })
  cal.createEvent({ id: uid, start, end, allDay, summary, description })
  return cal.toString()
}

// Jour suivant (minuit UTC) — pour la borne de fin exclusive des all-day.
function nextDayDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d
}

// Bornes d'une occurrence d'intervention. heure_debut → horodaté (heure locale Paris
// convertie en instant UTC, même affichage que Google) ; sinon all-day d'un jour.
function intervBounds(date, heure_debut, duree_minutes) {
  if (heure_debut) {
    const start = DateTime.fromISO(`${date}T${heure_debut}`, { zone: TZ }).toJSDate()
    const end = new Date(start.getTime() + (duree_minutes || 60) * 60000)
    return { start, end, allDay: false }
  }
  return { start: new Date(`${date}T00:00:00Z`), end: nextDayDate(date), allDay: true }
}

export function rdvToICS(rdv) {
  // Mapping IDENTIQUE à rdvToGoogleEvent (google.js) — garder synchronisé.
  const typeLabels = { visite_technique_client: 'R1', visite_technique_artisan: 'R2', presentation_devis: 'R3' }
  const client = rdv.dossier?.client
  const nomClient = client ? `${client.civilite || ''} ${client.prenom} ${client.nom}`.trim() : ''
  const artisan = rdv.artisan?.entreprise || ''
  const start = new Date(rdv.date_heure)
  const end = new Date(start.getTime() + (rdv.duree_minutes || 60) * 60000)
  const base = [typeLabels[rdv.type_rdv] || rdv.type_rdv, nomClient].filter(Boolean).join(' - ')
  const summary = rdv.type_rdv === 'autres'
    ? (rdv.titre || rdv.notes || 'Autre RDV')
    : `${base}${artisan ? ' x ' + artisan : ''}`
  const description = [
    rdv.dossier?.reference ? `Chantier : ${rdv.dossier.reference}` : '',
    rdv.notes ? `Notes : ${rdv.notes}` : '',
  ].filter(Boolean).join('\n')
  return icsString({ uid: `illico-rdv-${rdv.id}@illico-travaux.com`, summary, description, start, end, allDay: false })
}

// Renvoie le tableau ordonné [icsPrincipal, ...icsExtras] (multi-jours), ou [] pour les
// cas à ignorer — même structure que interventionToGoogleEvents (l'event[0] porte
// l'externalId/writeback ; les extras sont insert-only).
export function interventionToICS(intervention) {
  const artisan = intervention.artisan?.entreprise || 'Artisan'
  const client = intervention.dossier?.client
  const nomClient = client ? `${client.prenom} ${client.nom}`.trim() : ''
  const summary = `${artisan}${nomClient ? ' | ' + nomClient : ''}`
  const baseDesc = [
    intervention.dossier?.reference ? `Chantier : ${intervention.dossier.reference}` : '',
    intervention.notes ? `Notes : ${intervention.notes}` : '',
  ].filter(Boolean)
  const { heure_debut, duree_minutes } = intervention

  const mk = (uidSuffix, marker, bounds) => icsString({
    uid: `illico-int-${intervention.id}${uidSuffix}@illico-travaux.com`,
    summary,
    description: [...baseDesc, marker].join('\n'),
    ...bounds,
  })

  if (intervention.type_intervention === 'periode') {
    if (!intervention.date_fin && !heure_debut) return []
    if (heure_debut) {
      return [mk('', `[illico-int:${intervention.id}]`, intervBounds(intervention.date_debut, heure_debut, duree_minutes))]
    }
    // all-day multi-jours : date_debut → date_fin (end exclusif = date_fin + 1 jour)
    return [mk('', `[illico-int:${intervention.id}]`, {
      start: new Date(`${intervention.date_debut}T00:00:00Z`),
      end: nextDayDate(intervention.date_fin),
      allDay: true,
    })]
  }

  const jours = [...(intervention.jours_specifiques || [])].sort()
  if (!jours.length) return []
  const first = mk('-0', `[illico-int:${intervention.id}:0]`, intervBounds(jours[0], heure_debut, duree_minutes))
  const extras = jours.slice(1).map((jour, i) =>
    mk(`-${i + 1}`, `[illico-int:${intervention.id}:${i + 1}]`, intervBounds(jour, heure_debut, duree_minutes)))
  return [first, ...extras]
}

// ── Client CalDAV + handle ───────────────────────────────────────────────────

// true si l'erreur tsdav ressemble à un échec d'authentification (app-specific
// password révoqué/invalide). Sert au garde-fou « skip propre » du dispatch.
export function isCalDAVAuthError(err) {
  const status = err?.status ?? err?.response?.status
  if (status === 401 || status === 403) return true
  return /\b(401|403|unauthor|forbidden)\b/i.test(err?.message || '')
}

export async function buildICloudClient(compte) {
  const client = new DAVClient({
    serverUrl: compte.caldav_server || 'https://caldav.icloud.com',
    credentials: { username: compte.caldav_username, password: decrypt(compte.caldav_password) },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  })
  await client.login() // discovery iCloud (URL par-utilisateur pXX-caldav.icloud.com)
  return client
}

function ensureSlash(u) {
  return u.endsWith('/') ? u : u + '/'
}

// Extrait l'UID d'un VCALENDAR (déplie les lignes repliées RFC 5545 d'abord).
function extractUID(ics) {
  const unfolded = ics.replace(/\r\n[ \t]/g, '')
  const m = unfolded.match(/UID:(.*)/)
  if (!m) throw new Error('ICS sans UID — impossible de nommer l\'objet CalDAV')
  return m[1].trim()
}

export function makeICloudClientHandle(client, cible) {
  const calendar = { url: cible.calendar_id } // calendar_id = URL de la collection CalDAV

  const logDryRun = (action, externalId, contexte) => console.log('[push][DRY-RUN]', JSON.stringify({
    action, fournisseur: 'icloud', type: contexte?.type, itemId: contexte?.itemId,
    calendarId: cible.calendar_id, externalId,
  }))

  return {
    fournisseur: 'icloud',
    calendarId: cible.calendar_id,
    compteOauthId: cible.compte_oauth_id,

    // eventBody = chaîne ICS. externalId = URL de l'objet CalDAV (ou null = create).
    upsert: async ({ eventBody, externalId, contexte }) => {
      if (DRY_RUN) {
        logDryRun(externalId ? 'update' : 'insert', externalId, contexte)
        return { action: externalId ? 'updated' : 'inserted', id: externalId, dryRun: true }
      }
      if (externalId) {
        // update : re-GET de l'ETag courant (jamais stocké) puis remplacement.
        const [obj] = await client.fetchCalendarObjects({ calendar, objectUrls: [externalId] })
        if (obj) {
          await client.updateCalendarObject({ calendarObject: { url: externalId, data: eventBody, etag: obj.etag } })
          return { action: 'updated', id: externalId, dryRun: false }
        }
        // objet disparu côté iCloud → on recrée (fall-through vers le create).
      }
      const filename = `${extractUID(eventBody)}.ics`
      const url = new URL(filename, ensureSlash(cible.calendar_id)).href
      await client.createCalendarObject({ calendar, filename, iCalString: eventBody })
      return { action: 'inserted', id: url, dryRun: false }
    },

    delete: async ({ externalId, contexte }) => {
      if (DRY_RUN) {
        logDryRun('delete', externalId, contexte)
        return { dryRun: true }
      }
      const [obj] = await client.fetchCalendarObjects({ calendar, objectUrls: [externalId] })
      if (!obj) return { dryRun: false } // déjà supprimé côté iCloud → no-op
      await client.deleteCalendarObject({ calendarObject: { url: externalId, etag: obj.etag } })
      return { dryRun: false }
    },
  }
}
