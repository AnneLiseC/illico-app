// app/lib/calendar/pull-google.js
// Étage 3 — LOT B : PULL Google en DRY-RUN. LECTURE SEULE STRICTE.
// N'écrit NI rendez_vous NI cible_sync_state. Réutilise resolveCible + buildGoogleCalendar
// (google.js) — NE ressuscite PAS sync/route.js (mort, mono-calendrier).
//
// Invariants (verrouillés) :
//  - itère par CALENDAR_ID de la cible (jamais calendarList du compte) ;
//  - sync INCRÉMENTALE si sync_token présent en cible_sync_state, sinon FULL (sans timeMin/Max) ;
//  - suppression = SEULEMENT event.status==='cancelled' (jamais par absence) ;
//  - réappariement = rendez_vous.google_event_id === event.id ET cible_id === cible courante ;
//  - 410 Gone → signale 'full_resync_needed' (en dry-run : ne réinitialise rien, refait un full pour classer).
//
// ⚠️ Le refresh OAuth (buildOAuthClientForCompte) peut mettre à jour comptes_oauth.access_token
//    (mécanique OAuth de google.js) — ce N'EST PAS une des 2 tables interdites (rendez_vous / cible_sync_state).

import { createClient } from '@supabase/supabase-js'
import { resolveCible, buildGoogleCalendar } from './google'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Normalise le start d'un event Google → instant UTC prévu pour rendez_vous.date_heure (timestamptz).
//  - timed  : start.dateTime (ISO avec offset) → toISOString() = UTC.
//  - allday : start.date (YYYY-MM-DD) → minuit UTC (convention à figer au lot C).
export function googleStartToUtc(event) {
  const s = event.start || {}
  if (s.dateTime) return { kind: 'timed',  utc: new Date(s.dateTime).toISOString(), raw: s.dateTime }
  if (s.date)     return { kind: 'allday', utc: new Date(s.date + 'T00:00:00Z').toISOString(), raw: s.date }
  return { kind: 'unknown', utc: null, raw: null }
}

// Pull incrémental DRY-RUN d'UNE cible google. Renvoie un rapport, AUCUNE écriture rdv/state.
export async function dryRunPullCibleGoogle(cibleRow) {
  const report = {
    cible_id: cibleRow.id, agenda_nom: cibleRow.agenda_nom, calendar_id: cibleRow.calendar_id,
    agence_id: cibleRow.agence_id, societe_id: cibleRow.societe_id,
    mode: null,                       // 'incremental' | 'full' | 'full_after_410'
    events_lus: 0, reconnus: 0, inconnus: 0, cancelled: 0,
    cancelled_sans_match: 0,          // delete qui tomberait sur 0 ligne
    matches_ambigus: 0,               // google_event_id matchant >1 ligne (clé ambiguë)
    next_sync_token: null,            // ce qu'on STOCKERAIT (NON écrit)
    exemples_utc: [],                 // 2-3 normalisations
    inconnus_insert: [],              // aperçu des inserts "autres" potentiels
    erreur: null,
  }

  const resolved = await resolveCible(cibleRow.id)
  if (!resolved) { report.erreur = 'cible sans compte'; return report }
  const gc = buildGoogleCalendar(resolved)
  if (!gc) { report.erreur = 'compte sans refresh_token (cible inerte)'; return report }
  const { calendar, calendarId } = gc

  // Curseur existant — LECTURE SEULE.
  const { data: state } = await supabaseAdmin
    .from('cible_sync_state').select('sync_token').eq('cible_id', cibleRow.id).maybeSingle()
  const syncToken = state?.sync_token || null

  // Index des RDV de CETTE cible : google_event_id -> [ids] (réappariement + détection ambiguïté).
  const { data: rdvRows } = await supabaseAdmin
    .from('rendez_vous').select('id, google_event_id')
    .eq('cible_id', cibleRow.id).not('google_event_id', 'is', null)
  const byGid = new Map()
  for (const r of rdvRows || []) {
    const arr = byGid.get(r.google_event_id) || []; arr.push(r.id); byGid.set(r.google_event_id, arr)
  }

  const classify = (evt) => {
    report.events_lus++
    const matched = byGid.get(evt.id) || []
    if (matched.length > 1) report.matches_ambigus++
    if (evt.status === 'cancelled') {
      report.cancelled++
      if (matched.length === 0) report.cancelled_sans_match++
      return
    }
    if (matched.length >= 1) {
      report.reconnus++
    } else {
      report.inconnus++
      if (report.inconnus_insert.length < 5) {
        const n = googleStartToUtc(evt)
        report.inconnus_insert.push({
          event_id: evt.id, summary: evt.summary || null, start_utc: n.utc, kind: n.kind,
          // dérivation à l'insert "autres" (lot C) : depuis la CIBLE, jamais du body.
          agence_id: cibleRow.agence_id, societe_id: cibleRow.societe_id, dossier_id: null,
        })
      }
    }
    if (report.exemples_utc.length < 3) {
      const n = googleStartToUtc(evt)
      report.exemples_utc.push({ event_id: evt.id, google_start: n.raw, kind: n.kind, utc_prevu: n.utc })
    }
  }

  // events.list avec pagination + capture du nextSyncToken sur la DERNIÈRE page.
  const runList = async (useToken) => {
    let pageToken = null
    do {
      const params = { calendarId, singleEvents: true, showDeleted: true, maxResults: 250 }
      if (useToken)  params.syncToken = useToken   // incrémental (cancelled inclus)
      if (pageToken) params.pageToken = pageToken   // full sync : PAS de timeMin/timeMax (incompatibles syncToken)
      const { data } = await calendar.events.list(params)
      for (const evt of data.items || []) classify(evt)
      pageToken = data.nextPageToken || null
      if (!pageToken && data.nextSyncToken) report.next_sync_token = data.nextSyncToken
    } while (pageToken)
  }

  const resetCounters = () => {
    report.events_lus = 0; report.reconnus = 0; report.inconnus = 0; report.cancelled = 0
    report.cancelled_sans_match = 0; report.matches_ambigus = 0
    report.exemples_utc = []; report.inconnus_insert = []
  }

  try {
    if (syncToken) { report.mode = 'incremental'; await runList(syncToken) }
    else           { report.mode = 'full';        await runList(null) }
  } catch (err) {
    if (err?.code === 410) {
      // syncToken périmé. DRY-RUN : on NE réinitialise PAS cible_sync_state, on SIGNALE,
      // et on refait un full sync pour quand même produire la classification (sans écrire).
      report.mode = 'full_after_410'
      report.erreur = 'full_resync_needed (410 Gone) — cible_sync_state NON réinitialisé (dry-run)'
      resetCounters()
      try { await runList(null) } catch (e2) { report.erreur += ' | full sync KO: ' + (e2?.message || e2) }
    } else {
      report.erreur = err?.message || String(err)
    }
  }
  return report
}
