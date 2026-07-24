// app/lib/calendar/pull-microsoft.js
// Étage 3 — ADAPTATEUR OUTLOOK du pull (lot 7, étape 3). Miroir de pull-google.js :
// la logique commune (classification, plancher, anti-écho, apply) vit dans pull-engine.js.
// Ce fichier :
//   1. LIT les events Outlook via Microsoft Graph DELTA (/events/delta, curseur deltaLink) ;
//   2. les NORMALISE vers la forme agnostique attendue par le moteur ;
//   3. fournit le WRITER Outlook (PATCH /me/events pour la réécriture de trame) ;
//   4. délègue l'écriture base à engine.applyActions.
// Canal récurrents : calendarView fenêtré (Graph n'étend pas les séries dans /events/delta).
//
// Curseur = @odata.deltaLink (stocké dans cible_sync_state.sync_token, comme le syncToken
// Google). Expiration → 410 → resync complet (même contrat que Google).

import { createClient } from '@supabase/supabase-js'
import { resolveCible } from './google'
import { parseEvent } from './parse-event'
import { getValidAccessToken } from './microsoft'
import { graphFetch } from '../drive/microsoft'
import * as engine from './pull-engine'

let _supabaseAdmin
function getSupabaseAdmin() {
  if (!_supabaseAdmin) _supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _supabaseAdmin
}

// Champs demandés à Graph (les items @removed d'un delta ne portent que id + @removed).
const EVENT_SELECT = '$select=id,subject,body,bodyPreview,start,end,isAllDay,isCancelled,type,seriesMasterId,changeKey'
// Prefer : force Graph à renvoyer les heures en UTC → dateTime = heure murale UTC.
const PREFER_UTC = { Prefer: 'outlook.timezone="UTC"' }

// start/end Graph → instant UTC. Avec Prefer UTC, dateTime est une heure murale UTC
// ('YYYY-MM-DDTHH:MM:SS.fffffff', sans 'Z') → on tronque à 19 et on suffixe 'Z'.
// Journée entière → date seule (minuit UTC), cohérent avec googleStartToUtc.
function graphTimeToUtc(dtObj, isAllDay) {
  const dt = dtObj?.dateTime
  if (!dt) return { kind: 'unknown', utc: null, raw: null }
  if (isAllDay) {
    const d = dt.slice(0, 10)
    return { kind: 'allday', utc: new Date(`${d}T00:00:00Z`).toISOString(), raw: d }
  }
  return { kind: 'timed', utc: new Date(`${dt.slice(0, 19)}Z`).toISOString(), raw: dt }
}

// Event Graph -> event NORMALISÉ consommé par le moteur agnostique.
export function normalizeGraphEvent(evt) {
  const removed = !!evt['@removed']
  const s = removed ? { kind: 'unknown', utc: null, raw: null } : graphTimeToUtc(evt.start, evt.isAllDay)
  const e = removed ? { utc: null } : graphTimeToUtc(evt.end, evt.isAllDay)
  const cancelled = removed || evt.isCancelled === true
  return {
    id: evt.id,
    etag: evt.changeKey || null,
    status: cancelled ? 'cancelled' : 'confirmed',
    summary: evt.subject || '',
    description: (evt.body?.content || evt.bodyPreview || ''),   // porte le marqueur [illico-int:…] → anti-écho
    start_utc: s.utc,
    start_raw: s.raw,
    kind: s.kind,
    end_utc: e.utc || s.utc,
    isRecurringInstance: evt.type === 'occurrence' || evt.type === 'exception',
  }
}

// Writer Outlook injecté au moteur : réécriture de trame = PATCH subject, renvoie le changeKey.
function makeGraphWriter(accessToken, calendarId) {
  return {
    rewriteTrame: async (externalId, summary) => {
      const res = await graphFetch(accessToken, `/me/events/${externalId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject: summary }),
      })
      if (!res.ok) throw new Error(`graph_trame_failed_${res.status}`)
      const d = await res.json()
      return d.changeKey || null
    },
  }
}

// Parcourt un delta (init si deltaLink=null, sinon incrémental depuis le curseur), suit la
// pagination (@odata.nextLink) et renvoie le nouveau deltaLink. 410 = curseur expiré → throw{code:410}.
async function runDeltaGraph(accessToken, calendarId, deltaLink, onEvent) {
  let next = deltaLink || `/me/calendars/${calendarId}/events/delta?${EVENT_SELECT}`
  let finalDelta = null
  let guard = 0
  while (next && guard++ < 500) {
    const res = await graphFetch(accessToken, next, { headers: PREFER_UTC })
    if (res.status === 410) { const e = new Error('delta_expired'); e.code = 410; throw e }
    if (!res.ok) throw new Error(`delta_failed_${res.status}`)
    const data = await res.json()
    for (const evt of (data.value || [])) onEvent(evt)
    if (data['@odata.nextLink']) { next = data['@odata.nextLink']; continue }
    finalDelta = data['@odata.deltaLink'] || null
    next = null
  }
  return finalDelta
}

// ── LECTURE + CLASSEMENT Outlook (partagé) — AUCUNE écriture ici. ──────────────────────
async function readAndClassifyGraph(cibleRow, { reclassifyOn410 = true } = {}) {
  const report = engine.makeReport(cibleRow)
  const actions = engine.makeActions()

  const resolved = await resolveCible(cibleRow.id)
  if (!resolved) { report.erreur = 'cible sans compte'; return { report, actions, nextSyncToken: null, syncFloor: null, status: 'error', writer: null } }
  if (!resolved.compte.refresh_token) { report.erreur = 'compte sans refresh_token (cible inerte)'; return { report, actions, nextSyncToken: null, syncFloor: null, status: 'error', writer: null } }
  const calendarId = resolved.cible.calendar_id

  let accessToken
  try { accessToken = await getValidAccessToken(resolved.compte) }
  catch { report.erreur = 'compte Outlook à reconnecter'; return { report, actions, nextSyncToken: null, syncFloor: null, status: 'error', writer: null } }

  const { data: state } = await getSupabaseAdmin()
    .from('cible_sync_state').select('sync_token, sync_floor').eq('cible_id', cibleRow.id).maybeSingle()
  const deltaLink = state?.sync_token || null
  const syncFloor = state?.sync_floor || new Date().toISOString()
  const floorMs = new Date(syncFloor).getTime()

  const cand = await engine.loadCandidates(cibleRow.societe_id)
  const byGid = await engine.loadByGid(cibleRow)
  const ctx = { report, actions, byGid, cand, floorMs, cibleRow }
  const writer = makeGraphWriter(accessToken, calendarId)

  const runList = async (useDelta) => {
    const finalDelta = await runDeltaGraph(accessToken, calendarId, useDelta, (evt) => engine.classifyNormalized(normalizeGraphEvent(evt), ctx))
    if (finalDelta) report.next_sync_token = finalDelta
  }

  try {
    if (deltaLink) { report.mode = 'incremental'; await runList(deltaLink) }
    else           { report.mode = 'full';        await runList(null) }
    return { report, actions, nextSyncToken: report.next_sync_token, syncFloor, status: 'ok', writer }
  } catch (err) {
    if (err?.code === 410) {
      report.mode = 'full_after_410'
      report.erreur = 'full_resync_needed (410 Gone)'
      engine.resetReport(report, actions)
      if (reclassifyOn410) {
        try { await runList(null) } catch (e2) { report.erreur += ' | full sync KO: ' + (e2?.message || e2) }
      }
      return { report, actions, nextSyncToken: report.next_sync_token, syncFloor, status: 'full_resync_needed', writer }
    }
    report.erreur = err?.message || String(err)
    return { report, actions, nextSyncToken: null, syncFloor, status: 'error', writer }
  }
}

// ── DRY-RUN — n'écrit rien (ni base, ni Outlook). ──────────────────────────────────────
export async function dryRunPullCibleMicrosoft(cibleRow) {
  const { report } = await readAndClassifyGraph(cibleRow, { reclassifyOn410: true })
  if (report.erreur && report.erreur.startsWith('full_resync_needed')) {
    report.erreur += ' — cible_sync_state NON réinitialisé (dry-run)'
  }
  return report
}

// ── APPLY — lecture Outlook puis écriture via le moteur agnostique. ────────────────────
export async function applyPullCibleMicrosoft(cibleRow) {
  const res = await readAndClassifyGraph(cibleRow, { reclassifyOn410: false })
  return engine.applyActions(cibleRow, res, res.writer)
}

// ── BALAYAGE DES RÉCURRENTS (canal séparé) — spécifique Outlook (calendarView fenêtré) ──
// /events/delta ne renvoie que les séries-maîtres, pas leurs occurrences. calendarView
// [now ; now+180j] MATÉRIALISE les occurrences ; on ne garde que celles d'une série
// (type 'occurrence'|'exception'). INSERT seulement, anti-doublon par id d'instance.
export async function pullRecurrentsCibleMicrosoft(cibleRow, { horizonDays = 180 } = {}) {
  const report = {
    cible_id: cibleRow.id, agenda_nom: cibleRow.agenda_nom,
    instances_lues: 0, non_recurrentes: 0, recurrentes: 0,
    deja_presentes: 0, sans_date: 0, nouvelles: 0, erreur: null,
  }
  const applied = { inserts: 0 }

  const resolved = await resolveCible(cibleRow.id)
  if (!resolved) { report.erreur = 'cible sans compte'; return { report, applied } }
  if (!resolved.compte.refresh_token) { report.erreur = 'compte sans refresh_token (cible inerte)'; return { report, applied } }
  const calendarId = resolved.cible.calendar_id

  let accessToken
  try { accessToken = await getValidAccessToken(resolved.compte) }
  catch { report.erreur = 'compte Outlook à reconnecter'; return { report, applied } }

  const cand = await engine.loadCandidates(cibleRow.societe_id)

  // Set des id d'événements déjà présents pour cette cible (anti-doublon), paginé.
  const seen = new Set()
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await getSupabaseAdmin()
      .from('rendez_vous').select('google_event_id')
      .eq('cible_id', cibleRow.id).not('google_event_id', 'is', null)
      .order('google_event_id', { ascending: true }).range(from, from + PAGE - 1)
    if (error || !data || data.length === 0) break
    for (const r of data) seen.add(r.google_event_id)
    if (data.length < PAGE) break
  }

  const startDateTime = new Date().toISOString()
  const endDateTime = new Date(Date.now() + horizonDays * 86400000).toISOString()
  const inserts = []
  try {
    let next = `/me/calendars/${calendarId}/calendarView`
      + `?startDateTime=${encodeURIComponent(startDateTime)}&endDateTime=${encodeURIComponent(endDateTime)}`
      + `&${EVENT_SELECT}&$top=250`
    let guard = 0
    while (next && guard++ < 500) {
      const res = await graphFetch(accessToken, next, { headers: PREFER_UTC })
      if (!res.ok) throw new Error(`calendarview_failed_${res.status}`)
      const data = await res.json()
      for (const evt of (data.value || [])) {
        report.instances_lues++
        if (!(evt.type === 'occurrence' || evt.type === 'exception')) { report.non_recurrentes++; continue }
        report.recurrentes++
        if (seen.has(evt.id)) { report.deja_presentes++; continue }
        const n = normalizeGraphEvent(evt)
        if (!n.start_utc) { report.sans_date++; continue }
        if (n.description && n.description.includes('[illico-int:')) { continue } // anti-écho interventions
        const parsed = parseEvent(n.summary, cand)
        inserts.push(engine.buildInsertRow(cibleRow, n, n.start_utc, parsed, false))
        seen.add(evt.id)
      }
      next = data['@odata.nextLink'] || null
    }
  } catch (err) {
    report.erreur = err?.message || String(err)
    return { report, applied }
  }

  report.nouvelles = inserts.length
  if (inserts.length) {
    const { error } = await getSupabaseAdmin().from('rendez_vous').insert(inserts)
    if (error) report.erreur = 'insert KO: ' + error.message
    else applied.inserts = inserts.length
  }
  return { report, applied }
}
