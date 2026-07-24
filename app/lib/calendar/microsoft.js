// app/lib/calendar/microsoft.js
// Accès Microsoft Graph — CALENDRIER Outlook (fournisseur='outlook'), côté SERVEUR.
// Distinct du drive (app/lib/drive/microsoft.js, fournisseur='microsoft') : compte,
// tokens et scope séparés (Calendars.ReadWrite). Lot 7 — Étape 1 : lister les agendas.
//
// Token lu/écrit CHIFFRÉ (crypto.js AES-256-GCM). Microsoft ROTATE le refresh_token →
// on réécrit access + refresh chiffrés à chaque refresh.

import { createClient } from '@supabase/supabase-js'
import { encrypt, decrypt } from './crypto'
import { graphFetch } from '../drive/microsoft'
import { rdvBounds, rdvSummary, rdvDescription, interventionSummary, interventionDescription, interventionOccurrences } from './mapping'

const SCOPE = 'offline_access User.Read Calendars.ReadWrite'

function authority() {
  return `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT || 'consumers'}`
}

let _admin
function admin() {
  if (!_admin) _admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _admin
}

// Erreur d'auth « à reconnecter » (refresh_token révoqué / consentement retiré / scope
// insuffisant). La route /api/calendar/list la traduit en 401 { reconnect: true }.
export class OutlookReconnectError extends Error {
  constructor(msg = 'reconnect') { super(msg); this.reconnect = true }
}
export function isOutlookAuthError(err) {
  return !!err?.reconnect
}

// access_token valide (refresh transparent). `compte` : id, access_token(chiffré),
// refresh_token(chiffré), expiry_date(ms). Miroir du drive, scope Calendars.
export async function getValidAccessToken(compte) {
  const SKEW = 60_000
  const access = compte.access_token ? decrypt(compte.access_token) : null
  if (access && compte.expiry_date && compte.expiry_date - SKEW > Date.now()) return access

  const refresh = compte.refresh_token ? decrypt(compte.refresh_token) : null
  if (!refresh) throw new OutlookReconnectError()

  const res = await fetch(`${authority()}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refresh,
      scope: SCOPE,
    }).toString(),
  })
  const tok = await res.json()
  if (!res.ok || !tok.access_token) {
    console.error('[outlook-cal] refresh KO', tok?.error, tok?.error_description)
    throw new OutlookReconnectError()
  }

  await admin().from('comptes_oauth').update({
    access_token: encrypt(tok.access_token),
    refresh_token: tok.refresh_token ? encrypt(tok.refresh_token) : compte.refresh_token,
    expiry_date: tok.expires_in ? Date.now() + tok.expires_in * 1000 : null,
    updated_at: new Date().toISOString(),
  }).eq('id', compte.id)

  return tok.access_token
}

// Liste les agendas Outlook du compte. Forme alignée sur listGoogleCalendars :
// { externalId, label, primary }. 401 Graph → OutlookReconnectError.
export async function listMicrosoftCalendars(compte) {
  const accessToken = await getValidAccessToken(compte)
  const res = await graphFetch(accessToken, '/me/calendars?$select=id,name,isDefaultCalendar,canEdit&$top=100')
  if (res.status === 401) throw new OutlookReconnectError()
  if (!res.ok) throw new Error(`graph_calendars_failed_${res.status}`)
  const data = await res.json()
  return (data.value || [])
    .map((c) => ({
      externalId: c.id,
      label: c.name || '(agenda sans nom)',
      primary: !!c.isDefaultCalendar,
    }))
    .sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0) || a.label.localeCompare(b.label, 'fr'))
}

// ─────────────────────────────────────────────────────────────────────────────
// PUSH (Étape 2) — RDV / interventions → événements Outlook.
//
// Format Graph (≠ Google) : subject/body au lieu de summary/description ; DateTimeTimeZone
// = { dateTime SANS offset, timeZone }. RDV = instant absolu (date_heure UTC) → timeZone 'UTC'.
// Intervention = journée entière (mapping.js n'émet que des occurrences 'allday' à date unique)
// → isAllDay, bornes minuit Europe/Paris, fin exclusive (jour suivant).
// ─────────────────────────────────────────────────────────────────────────────

const iso19 = (d) => d.toISOString().slice(0, 19)            // 'YYYY-MM-DDTHH:MM:SS' (sans 'Z')
function nextDayStr(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export function rdvToGraphEvent(rdv) {
  const { start, end } = rdvBounds(rdv)
  return {
    subject: rdvSummary(rdv),
    body: { contentType: 'text', content: rdvDescription(rdv) || '' },
    start: { dateTime: iso19(start), timeZone: 'UTC' },
    end:   { dateTime: iso19(end),   timeZone: 'UTC' },
  }
}

// Renvoie [{ role, body }] (même forme que interventionToGoogleEvents) : le pousseur
// itère les occurrences. Journée entière → isAllDay + bornes Europe/Paris.
export function interventionToGraphEvents(intervention) {
  const summary = interventionSummary(intervention)
  return interventionOccurrences(intervention).map((o) => {
    const date = o.time.date
    return {
      role: o.role,
      body: {
        subject: (o.label || '') + summary,
        body: { contentType: 'text', content: interventionDescription(intervention, o.marker) || '' },
        isAllDay: true,
        start: { dateTime: `${date}T00:00:00`, timeZone: 'Europe/Paris' },
        end:   { dateTime: `${nextDayStr(date)}T00:00:00`, timeZone: 'Europe/Paris' },
      },
    }
  })
}

// Écriture d'un événement (create/update). externalId = id Graph existant → PATCH ;
// 404 (supprimé côté Outlook) → on recrée. Sinon POST dans l'agenda cible (calendarId).
async function graphUpsertEvent(accessToken, calendarId, externalId, eventBody) {
  if (externalId) {
    const res = await graphFetch(accessToken, `/me/events/${externalId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(eventBody),
    })
    if (res.ok) { const d = await res.json(); return { action: 'updated', id: d.id } }
    if (res.status !== 404 && res.status !== 410) throw new Error(`graph_event_update_failed_${res.status}`)
  }
  const res = await graphFetch(accessToken, `/me/calendars/${calendarId}/events`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(eventBody),
  })
  if (!res.ok) throw new Error(`graph_event_insert_failed_${res.status}`)
  const d = await res.json()
  return { action: 'inserted', id: d.id }
}

async function graphDeleteEvent(accessToken, externalId) {
  if (!externalId) return { dryRun: false }
  const res = await graphFetch(accessToken, `/me/events/${externalId}`, { method: 'DELETE' })
  if (res.ok || res.status === 404) return { dryRun: false }
  throw new Error(`graph_event_delete_failed_${res.status}`)
}

// Handle à interface commune (cf. makeGoogleClientHandle). resolved = { cible, compte }.
// L'agenda cible = cible.calendar_id (id renvoyé par listMicrosoftCalendars). Le token
// est rafraîchi à chaque écriture (getValidAccessToken = cache tant que non expiré).
export function makeMicrosoftClientHandle({ cible, compte }) {
  const calendarId = cible.calendar_id
  return {
    fournisseur: 'outlook',
    calendarId,
    compteOauthId: compte.id,
    upsert: async ({ eventBody, externalId }) => {
      const accessToken = await getValidAccessToken(compte)
      const r = await graphUpsertEvent(accessToken, calendarId, externalId, eventBody)
      return { action: r.action, id: r.id, dryRun: false }
    },
    delete: async ({ externalId }) => {
      const accessToken = await getValidAccessToken(compte)
      return graphDeleteEvent(accessToken, externalId)
    },
  }
}
