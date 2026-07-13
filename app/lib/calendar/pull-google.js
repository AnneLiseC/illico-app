// app/lib/calendar/pull-google.js
// Étage 3 — ADAPTATEUR GOOGLE du pull (B9-1). La logique commune (classification, plancher,
// anti-écho, B6, apply) vit dans pull-engine.js ; ce fichier ne fait que :
//   1. LIRE les events Google (events.list incrémental/full, gestion 410) ;
//   2. les NORMALISER vers { id, etag, start_utc, end_utc, kind, summary, status, ... } ;
//   3. fournir le WRITER Google (events.patch pour la réécriture de trame) ;
//   4. déléguer l'écriture base à engine.applyActions.
// B7 (récurrents) reste ici : lecture fenêtrée singleEvents propre à Google.
//
// ⚠️ Comportement Google STRICTEMENT INCHANGÉ vs avant l'extraction (B9-1).

import { createClient } from '@supabase/supabase-js'
import { resolveCible, buildGoogleCalendar } from './google'
import { parseEvent } from './parse-event'
import * as engine from './pull-engine'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Normalise le start d'un event Google -> instant UTC pour rendez_vous.date_heure (timestamptz).
export function googleStartToUtc(event) {
  const s = event.start || {}
  if (s.dateTime) return { kind: 'timed',  utc: new Date(s.dateTime).toISOString(), raw: s.dateTime }
  if (s.date)     return { kind: 'allday', utc: new Date(s.date + 'T00:00:00Z').toISOString(), raw: s.date }
  return { kind: 'unknown', utc: null, raw: null }
}

// Instant UTC de FIN d'un event (plancher de sync). end.dateTime / end.date ; à défaut, le start.
export function googleEndToUtc(event) {
  const e = event.end || {}
  if (e.dateTime) return new Date(e.dateTime).toISOString()
  if (e.date)     return new Date(e.date + 'T00:00:00Z').toISOString()
  return googleStartToUtc(event).utc
}

// Event Google (JSON) -> event NORMALISÉ consommé par le moteur agnostique.
function normalizeGoogleEvent(evt) {
  const s = googleStartToUtc(evt)
  return {
    id: evt.id,
    etag: evt.etag || null,
    status: evt.status,
    summary: evt.summary,
    start_utc: s.utc,
    start_raw: s.raw,
    kind: s.kind,
    end_utc: googleEndToUtc(evt),
    isRecurringInstance: !!evt.recurringEventId,
  }
}

// Writer Google injecté au moteur : réécriture de trame = events.patch(summary), renvoie l'etag.
function makeGoogleWriter(calendar, calendarId) {
  return {
    rewriteTrame: async (externalId, summary) => {
      const res = await calendar.events.patch({ calendarId, eventId: externalId, requestBody: { summary } })
      return res?.data?.etag || null
    },
  }
}

// ── LECTURE + CLASSEMENT Google (partagé dry-run / apply) — AUCUNE écriture ici. ──────
async function readAndClassifyGoogle(cibleRow, { reclassifyOn410 = true } = {}) {
  const report = engine.makeReport(cibleRow)
  const actions = engine.makeActions()

  const resolved = await resolveCible(cibleRow.id)
  if (!resolved) { report.erreur = 'cible sans compte'; return { report, actions, nextSyncToken: null, syncFloor: null, status: 'error', writer: null } }
  const gc = buildGoogleCalendar(resolved)
  if (!gc) { report.erreur = 'compte sans refresh_token (cible inerte)'; return { report, actions, nextSyncToken: null, syncFloor: null, status: 'error', writer: null } }
  const { calendar, calendarId } = gc

  const { data: state } = await supabaseAdmin
    .from('cible_sync_state').select('sync_token, sync_floor').eq('cible_id', cibleRow.id).maybeSingle()
  const syncToken = state?.sync_token || null
  const syncFloor = state?.sync_floor || new Date().toISOString()
  const floorMs = new Date(syncFloor).getTime()

  const cand = await engine.loadCandidates(cibleRow.societe_id)
  const byGid = await engine.loadByGid(cibleRow)
  const ctx = { report, actions, byGid, cand, floorMs, cibleRow }
  const writer = makeGoogleWriter(calendar, calendarId)

  const runList = async (useToken) => {
    let pageToken = null
    do {
      const params = { calendarId, singleEvents: true, showDeleted: true, maxResults: 250 }
      if (useToken)  params.syncToken = useToken
      if (pageToken) params.pageToken = pageToken
      const { data } = await calendar.events.list(params)
      for (const evt of data.items || []) engine.classifyNormalized(normalizeGoogleEvent(evt), ctx)
      pageToken = data.nextPageToken || null
      if (!pageToken && data.nextSyncToken) report.next_sync_token = data.nextSyncToken
    } while (pageToken)
  }

  try {
    if (syncToken) { report.mode = 'incremental'; await runList(syncToken) }
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

// ── DRY-RUN (LOT B) — n'écrit rien (ni base, ni Google). Montre le parsing (B4). ───────
export async function dryRunPullCibleGoogle(cibleRow) {
  const { report } = await readAndClassifyGoogle(cibleRow, { reclassifyOn410: true })
  if (report.erreur && report.erreur.startsWith('full_resync_needed')) {
    report.erreur += ' — cible_sync_state NON réinitialisé (dry-run)'
  }
  return report
}

// ── APPLY (LOT C + B4/B5/B6) — lecture Google puis écriture via le moteur. ─────────────
export async function applyPullCibleGoogle(cibleRow) {
  const res = await readAndClassifyGoogle(cibleRow, { reclassifyOn410: false })
  return engine.applyActions(cibleRow, res, res.writer)
}

// ── B7 — BALAYAGE DES RÉCURRENTS (canal séparé, 1×/jour) — spécifique Google ───────────
// Le pull incrémental (syncToken) ne re-signale JAMAIS les occurrences futures d'une série
// inchangée. Ce canal les matérialise : events.list fenêtré [now ; now+180j], singleEvents:true,
// et ne garde QUE les occurrences de séries (recurringEventId présent). INSERT seulement (parsing
// B4), anti-doublon par google_event_id d'instance. PAS de trame, PAS de delete, PAS de curseur.
export async function pullRecurrentsCibleGoogle(cibleRow, { horizonDays = 180 } = {}) {
  const report = {
    cible_id: cibleRow.id, agenda_nom: cibleRow.agenda_nom,
    instances_lues: 0, non_recurrentes: 0, recurrentes: 0,
    deja_presentes: 0, sans_date: 0, nouvelles: 0, erreur: null,
  }
  const applied = { inserts: 0 }

  const resolved = await resolveCible(cibleRow.id)
  if (!resolved) { report.erreur = 'cible sans compte'; return { report, applied } }
  const gc = buildGoogleCalendar(resolved)
  if (!gc) { report.erreur = 'compte sans refresh_token (cible inerte)'; return { report, applied } }
  const { calendar, calendarId } = gc

  const cand = await engine.loadCandidates(cibleRow.societe_id)

  // Set des google_event_id déjà présents (anti-doublon), paginé.
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

  const timeMin = new Date().toISOString()
  const timeMax = new Date(Date.now() + horizonDays * 86400000).toISOString()
  const inserts = []
  try {
    let pageToken = null
    do {
      const params = { calendarId, singleEvents: true, showDeleted: false, maxResults: 250, timeMin, timeMax }
      if (pageToken) params.pageToken = pageToken
      const { data } = await calendar.events.list(params)
      for (const evt of data.items || []) {
        report.instances_lues++
        if (!evt.recurringEventId) { report.non_recurrentes++; continue }
        report.recurrentes++
        if (seen.has(evt.id)) { report.deja_presentes++; continue }
        const n = googleStartToUtc(evt)
        if (!n.utc) { report.sans_date++; continue }
        const parsed = parseEvent(evt.summary, cand)
        inserts.push(engine.buildInsertRow(cibleRow, evt, n.utc, parsed, false))
        seen.add(evt.id)
      }
      pageToken = data.nextPageToken || null
    } while (pageToken)
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
