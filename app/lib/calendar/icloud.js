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
import {
  rdvSummary, rdvDescription, rdvBounds,
  interventionSummary, interventionDescription, interventionOccurrences,
} from './mapping'

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

// Bornes ICS d'une occurrence (spec neutre de mapping.js → start/end/allDay ical). 'timed'
// → heure locale Paris convertie en instant UTC (même affichage que Google) ; 'allday'
// (jour unique) et 'allday-range' (période) → DTSTART;VALUE=DATE, end exclusif = lendemain.
function icloudTimeFields(time) {
  if (time.kind === 'timed') {
    const start = DateTime.fromISO(`${time.date}T${time.heure_debut}`, { zone: TZ }).toJSDate()
    const end = new Date(start.getTime() + (time.duree_minutes || 60) * 60000)
    return { start, end, allDay: false }
  }
  if (time.kind === 'allday-range') {
    return { start: new Date(`${time.dateDebut}T00:00:00Z`), end: nextDayDate(time.dateFin), allDay: true }
  }
  return { start: new Date(`${time.date}T00:00:00Z`), end: nextDayDate(time.date), allDay: true }
}

export function rdvToICS(rdv) {
  // Habillage ICS du mapping partagé (mapping.js). RDV = instant UTC (allDay false).
  const { start, end } = rdvBounds(rdv)
  return icsString({
    uid: `illico-rdv-${rdv.id}@illico-travaux.com`,
    summary: rdvSummary(rdv),
    description: rdvDescription(rdv),
    start, end, allDay: false,
  })
}

// Renvoie le tableau ordonné [icsPrincipal, ...icsExtras] (multi-jours), ou [] pour les cas
// à ignorer — même structure que interventionToGoogleEvents (l'event[0] porte l'externalId/
// writeback ; les extras sont insert-only). UID déterministe = illico-int-<id><idSuffix>.
export function interventionToICS(intervention) {
  const summary = interventionSummary(intervention)
  return interventionOccurrences(intervention).map((o) => icsString({
    uid: `illico-int-${intervention.id}${o.idSuffix}@illico-travaux.com`,
    summary,
    description: interventionDescription(intervention, o.marker),
    ...icloudTimeFields(o.time),
  }))
}

// ── Client CalDAV + handle ───────────────────────────────────────────────────

// true si l'erreur tsdav ressemble à un échec d'authentification (app-specific
// password révoqué/invalide). Sert au garde-fou « skip propre » du dispatch.
export function isCalDAVAuthError(err) {
  const status = err?.status ?? err?.response?.status
  if (status === 401 || status === 403) return true
  return /\b(401|403|unauthor|forbidden)\b/i.test(err?.message || '')
}

// Builder bas-niveau : mot de passe EN CLAIR (jamais déchiffré ici). Sert à VALIDER des
// credentials à la connexion (lot 8c, avant chiffrement/insert). login() = test d'auth +
// discovery iCloud (URL par-utilisateur pXX-caldav.icloud.com) ; throw 401 si refusé.
export async function buildICloudClientRaw(username, password, server) {
  const client = new DAVClient({
    serverUrl: server || 'https://caldav.icloud.com',
    credentials: { username, password },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  })
  await client.login()
  return client
}

// Builder à partir d'un compte stocké (caldav_password CHIFFRÉ) → déchiffre puis délègue.
export async function buildICloudClient(compte) {
  return buildICloudClientRaw(compte.caldav_username, decrypt(compte.caldav_password), compte.caldav_server)
}

// displayName CalDAV peut être une string ou un objet (selon le serveur) → normalise.
function caldavName(displayName, fallback) {
  if (typeof displayName === 'string' && displayName.trim()) return displayName
  if (displayName && typeof displayName === 'object') {
    return displayName._text || displayName._cdata || displayName['#text'] || fallback
  }
  return fallback
}

// Liste les calendriers d'un compte iCloud connecté (lot 8a) → [{ externalId, label }].
// LECTURE SEULE (fetchCalendars). externalId = URL de la collection CalDAV (= calendar_id
// d'une future cible). login() peut throw 401 (app-specific password révoqué) → l'appelant
// mappe en « identifiants iCloud à reconnecter » via isCalDAVAuthError.
export async function listICloudCalendars(compte) {
  const client = await buildICloudClient(compte)
  const calendars = await client.fetchCalendars()
  return calendars.map((c) => ({
    externalId: c.url,
    label: caldavName(c.displayName, 'Calendrier iCloud'),
  }))
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
