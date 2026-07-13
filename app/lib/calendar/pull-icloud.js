// app/lib/calendar/pull-icloud.js
// Étage 3 — ADAPTATEUR PULL iCLOUD (CalDAV), parité du sens Google->BATILIS (B9-4/B9-5).
// Même MOTEUR agnostique que Google (pull-engine.js) : ce fichier ne fait que le TRANSPORT
// CalDAV + la NORMALISATION ICS -> event { id, etag, start_utc, end_utc, kind, summary, status }.
//   - id (remote) = URL de l'objet CalDAV ; réappariement/anti-doublon par google_event_id ;
//   - anti-écho = ETag CalDAV (colonne google_etag, générique) ;
//   - sync incrémentale = tsdav.smartCollectionSync (RFC 6578) ; sync-token dans cible_sync_state ;
//   - suppression = objet 404 (deleted) -> event 'cancelled' pour le moteur ;
//   - récurrents (B9-5) = expansion 180j via ICAL.Event (gère RRULE + EXDATE + overrides).
//
// ⚠️ À VALIDER EN RÉEL sur iCloud (compte agente, cible « Appli test ») : le contrat exact de
//    tsdav.smartCollectionSync (shape detailedResult, sync-token périmé) et la résolution des
//    TZID par ical.js dépendent du serveur — le push iCloud a été validé au 6b-3, PAS le pull.

import { createClient } from '@supabase/supabase-js'
import ICAL from 'ical.js'
import { resolveCible } from './google'
import { buildICloudClient, isCalDAVAuthError } from './icloud'
import { parseEvent } from './parse-event'
import * as engine from './pull-engine'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ── Normalisation ICS ──────────────────────────────────────────────────────────────────
// Enregistre les VTIMEZONE de l'objet pour que ical.js résolve les TZID -> instants absolus.
function registerTimezones(comp) {
  for (const vt of comp.getAllSubcomponents('vtimezone')) {
    try {
      const tz = new ICAL.Timezone(vt)
      if (tz.tzid && !ICAL.TimezoneService.has(tz.tzid)) ICAL.TimezoneService.register(tz.tzid, tz)
    } catch { /* VTIMEZONE illisible : on ignore, toJSDate retombera sur l'UTC/flottant */ }
  }
}

// ICAL.Time -> { utc:ISO|null, kind } aligné sur googleStartToUtc : all-day = minuit UTC du jour ;
// timed = instant absolu (TZID/Z résolus). Flottant (sans zone) : interprété tel quel par ical.js.
function timeToUtc(t) {
  if (!t) return { utc: null, kind: 'unknown' }
  if (t.isDate) {
    const y = String(t.year).padStart(4, '0'), m = String(t.month).padStart(2, '0'), d = String(t.day).padStart(2, '0')
    return { utc: new Date(`${y}-${m}-${d}T00:00:00Z`).toISOString(), kind: 'allday' }
  }
  return { utc: t.toJSDate().toISOString(), kind: 'timed' }
}

function parseIcs(ics) {
  const comp = new ICAL.Component(ICAL.parse(ics))
  registerTimezones(comp)
  return comp
}

// Objet CalDAV mono-event -> event normalisé (B9-4). status CANCELLED (rare hors 404) géré.
function objectToNorm(url, etag, vevent) {
  const e = new ICAL.Event(vevent)
  const s = timeToUtc(e.startDate)
  const en = timeToUtc(e.endDate)
  const status = String(vevent.getFirstPropertyValue('status') || '').toUpperCase() === 'CANCELLED'
    ? 'cancelled' : 'confirmed'
  return {
    id: url, etag: etag || null, status, summary: e.summary || '',
    start_utc: s.utc, start_raw: null, kind: s.kind, end_utc: en.utc, isRecurringInstance: false,
  }
}

// Remplace le SUMMARY d'un ICS (réécriture de trame) et re-sérialise.
function replaceSummary(ics, summary) {
  const comp = parseIcs(ics)
  const vevent = comp.getFirstSubcomponent('vevent')
  vevent.updatePropertyWithValue('summary', summary)
  return comp.toString()
}

// Writer iCloud injecté au moteur : réécriture de trame = GET + set SUMMARY + PUT, renvoie l'ETag.
function makeICloudWriter(client, calendarUrl) {
  const calendar = { url: calendarUrl }
  return {
    rewriteTrame: async (externalId, summary) => {
      const [obj] = await client.fetchCalendarObjects({ calendar, objectUrls: [externalId] })
      if (!obj) throw new Error('objet CalDAV introuvable pour réécriture de trame')
      await client.updateCalendarObject({
        calendarObject: { url: externalId, data: replaceSummary(obj.data, summary), etag: obj.etag },
      })
      const [o2] = await client.fetchCalendarObjects({ calendar, objectUrls: [externalId] })
      return o2?.etag || null
    },
  }
}

// sync-token périmé (pendant du 410 Google) : iCloud renvoie souvent 409/412/403 ou un message clair.
function isStaleSyncToken(err) {
  const status = err?.status ?? err?.response?.status
  if (status === 409 || status === 412) return true
  return /sync.?token|invalid.?token|410|gone/i.test(err?.message || '')
}

// Lecture des changements CalDAV depuis le sync-token (ou FULL si absent). ⚠️ shape tsdav à valider.
async function readICloudChanges(client, calendarUrl, syncToken) {
  const synced = await client.smartCollectionSync({
    collection: { url: calendarUrl, syncToken: syncToken || undefined, objects: [] },
    method: 'webdav', syncLevel: 1, detailedResult: true,
  })
  const o = synced?.objects || {}
  const changed = [...(o.created || []), ...(o.updated || [])]
    .filter((x) => x && x.data).map((x) => ({ url: x.url, etag: x.etag, data: x.data }))
  const deleted = (o.deleted || []).map((x) => (x && x.url) ? x.url : x).filter(Boolean)
  return { changed, deleted, nextToken: synced?.syncToken || syncToken || null }
}

// ── B9-4 — PULL iCLOUD INCRÉMENTAL (branché sur le moteur agnostique) ──────────────────
export async function applyPullCibleICloud(cibleRow) {
  const report = engine.makeReport(cibleRow)
  const actions = engine.makeActions()

  const resolved = await resolveCible(cibleRow.id)
  if (!resolved) { report.erreur = 'cible sans compte'; return engine.applyActions(cibleRow, { report, actions, nextSyncToken: null, syncFloor: null, status: 'error' }, null) }
  let client
  try {
    client = await buildICloudClient(resolved.compte)
  } catch (err) {
    const msg = isCalDAVAuthError(err) ? 'iCloud auth refusée (app-specific password à reconnecter)' : (err?.message || String(err))
    report.erreur = msg
    return engine.applyActions(cibleRow, { report, actions, nextSyncToken: null, syncFloor: null, status: 'error' }, null)
  }
  const calendarUrl = resolved.cible.calendar_id

  const { data: state } = await supabaseAdmin
    .from('cible_sync_state').select('sync_token, sync_floor').eq('cible_id', cibleRow.id).maybeSingle()
  const syncToken = state?.sync_token || null
  const syncFloor = state?.sync_floor || new Date().toISOString()
  const floorMs = new Date(syncFloor).getTime()

  const cand = await engine.loadCandidates(cibleRow.societe_id)
  const byGid = await engine.loadByGid(cibleRow)
  const ctx = { report, actions, byGid, cand, floorMs, cibleRow }
  const writer = makeICloudWriter(client, calendarUrl)
  report.mode = syncToken ? 'incremental' : 'full'

  let nextToken = syncToken
  try {
    const { changed, deleted, nextToken: nt } = await readICloudChanges(client, calendarUrl, syncToken)
    nextToken = nt
    // Suppressions (objet 404) -> event 'cancelled' pour le moteur (delete si match unique).
    for (const url of deleted) {
      engine.classifyNormalized(
        { id: url, etag: null, status: 'cancelled', summary: '', start_utc: null, start_raw: null, kind: 'unknown', end_utc: null, isRecurringInstance: false },
        ctx,
      )
    }
    // Changements -> normalisation. Les récurrents (RRULE) sont SKIP ici (canal B9-5).
    for (const obj of changed) {
      let vevent
      try { vevent = parseIcs(obj.data).getFirstSubcomponent('vevent') }
      catch (e) { console.error('[pull-icloud] ICS illisible', obj.url, e?.message || e); continue }
      if (!vevent) continue
      if (vevent.hasProperty('rrule')) continue   // série -> B9-5 (pas d'insert du maître)
      engine.classifyNormalized(objectToNorm(obj.url, obj.etag, vevent), ctx)
    }
  } catch (err) {
    if (isStaleSyncToken(err)) {
      // Pendant du 410 Google : on remet le sync-token à NULL -> full au prochain run.
      report.mode = 'full_after_resync'
      report.erreur = 'full_resync_needed (sync-token invalide)'
      return engine.applyActions(cibleRow, { report, actions, nextSyncToken: null, syncFloor, status: 'full_resync_needed' }, writer)
    }
    report.erreur = err?.message || String(err)
    return engine.applyActions(cibleRow, { report, actions, nextSyncToken: null, syncFloor, status: 'error' }, writer)
  }

  return engine.applyActions(cibleRow, { report, actions, nextSyncToken: nextToken, syncFloor, status: 'ok' }, writer)
}

// ── B9-5 — RÉCURRENTS iCLOUD (fenêtre 180j, canal séparé, 1×/jour) ─────────────────────
// CalDAV ne déplie pas les séries : on récupère tous les objets, et pour chaque VEVENT à RRULE
// on déroule via ICAL.Event (RRULE + EXDATE + overrides RECURRENCE-ID) sur [now ; now+180j].
// Id synthétique par occurrence = URL#YYYYMMDD (les occurrences partagent l'URL). INSERT seulement,
// anti-doublon par google_event_id, PAS de trame, PAS de delete (comme B7 Google).
export async function pullRecurrentsCibleICloud(cibleRow, { horizonDays = 180 } = {}) {
  const report = {
    cible_id: cibleRow.id, agenda_nom: cibleRow.agenda_nom,
    objets_lus: 0, series: 0, occurrences: 0, deja_presentes: 0, sans_date: 0, nouvelles: 0, erreur: null,
  }
  const applied = { inserts: 0 }

  const resolved = await resolveCible(cibleRow.id)
  if (!resolved) { report.erreur = 'cible sans compte'; return { report, applied } }
  let client
  try { client = await buildICloudClient(resolved.compte) }
  catch (err) { report.erreur = isCalDAVAuthError(err) ? 'iCloud auth refusée' : (err?.message || String(err)); return { report, applied } }
  const calendar = { url: resolved.cible.calendar_id }

  const cand = await engine.loadCandidates(cibleRow.societe_id)

  // Set des google_event_id déjà présents (les occurrences ont id = URL#YYYYMMDD), paginé.
  const seen = new Set()
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from('rendez_vous').select('google_event_id')
      .eq('cible_id', cibleRow.id).not('google_event_id', 'is', null)
      .order('google_event_id', { ascending: true }).range(from, from + PAGE - 1)
    if (error || !data || data.length === 0) break
    for (const r of data) seen.add(r.google_event_id)
    if (data.length < PAGE) break
  }

  const now = new Date()
  const horizonEnd = new Date(Date.now() + horizonDays * 86400000)
  const inserts = []
  try {
    const objects = await client.fetchCalendarObjects({ calendar })
    report.objets_lus = objects.length
    for (const obj of objects) {
      let comp, vevents
      try { comp = parseIcs(obj.data); vevents = comp.getAllSubcomponents('vevent') }
      catch { continue }
      const master = (vevents || []).find((v) => v.hasProperty('rrule'))
      if (!master) continue
      report.series++
      const event = new ICAL.Event(master)
      // Rattache les overrides (VEVENT RECURRENCE-ID) pour que getOccurrenceDetails les applique.
      for (const vv of vevents) {
        if (vv !== master && vv.hasProperty('recurrence-id')) { try { event.relateException(vv) } catch { /* ignore */ } }
      }
      const it = event.iterator()
      let next, guard = 0
      while ((next = it.next()) && guard++ < 2000) {
        const jsd = next.toJSDate()
        if (jsd > horizonEnd) break
        if (jsd < now) continue
        report.occurrences++
        let det
        try { det = event.getOccurrenceDetails(next) } catch { continue }
        const s = timeToUtc(det.startDate)
        if (!s.utc) { report.sans_date++; continue }
        const ymd = `${next.year}${String(next.month).padStart(2, '0')}${String(next.day).padStart(2, '0')}`
        const occId = `${obj.url}#${ymd}`
        if (seen.has(occId)) { report.deja_presentes++; continue }
        const summary = det.item?.summary || event.summary || ''
        const parsed = parseEvent(summary, cand)
        inserts.push(engine.buildInsertRow(cibleRow, { id: occId, etag: obj.etag || null, summary }, s.utc, parsed, false))
        seen.add(occId)
      }
    }
  } catch (err) {
    report.erreur = err?.message || String(err)
    return { report, applied }
  }

  report.nouvelles = inserts.length
  if (inserts.length) {
    const { error } = await supabaseAdmin.from('rendez_vous').insert(inserts)
    if (error) report.erreur = 'insert KO: ' + error.message
    else applied.inserts = inserts.length
  }
  return { report, applied }
}
