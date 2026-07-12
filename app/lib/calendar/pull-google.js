// app/lib/calendar/pull-google.js
// Étage 3 — PULL Google external -> BATILIS.
//
//  LOT B : lecture incrémentale + classement RECONNU / INCONNU / CANCELLED, DRY-RUN
//          (dryRunPullCibleGoogle) — n'écrit rien. TOUJOURS DISPONIBLE (GET).
//  LOT C : mêmes lecture + classement, PLUS les écritures réelles
//          (applyPullCibleGoogle) — INSERT des inconnus, DELETE des cancelled matchés,
//          upsert du curseur cible_sync_state. On AJOUTE l'écriture, on NE réécrit
//          PAS la lecture : les deux chemins partagent readAndClassifyCibleGoogle.
//
// Invariants (verrouillés) :
//  - itère par CALENDAR_ID de la cible (jamais calendarList du compte) ;
//  - sync INCRÉMENTALE si sync_token présent en cible_sync_state, sinon FULL ;
//  - suppression = SEULEMENT event.status==='cancelled' (jamais par absence) ;
//  - réappariement = rendez_vous.google_event_id === event.id ET cible_id === cible courante ;
//  - RÈGLE v1 : INCONNU -> INSERT ; CANCELLED+1match -> DELETE ; RECONNU -> NO-OP (pas d'update) ;
//  - INSERT : type_rdv='autres', date_heure=UTC normalisé, titre=summary, dossier_id=NULL,
//    agence_id/societe_id DÉRIVÉS DE LA CIBLE, cible_id=cible, created_by=NULL,
//    google_event_id=event.id (ANTI-BOUCLE : reconnu au prochain pull, jamais re-poussé) ;
//  - GARDE-FOU : on n'applique les écritures d'une cible QU'APRÈS lecture complète réussie.
//
// ⚠️ Le refresh OAuth (buildOAuthClientForCompte) peut mettre à jour comptes_oauth.access_token
//    (mécanique OAuth de google.js) — hors des tables métier écrites ici.

import { createClient } from '@supabase/supabase-js'
import { resolveCible, buildGoogleCalendar } from './google'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Normalise le start d'un event Google -> instant UTC pour rendez_vous.date_heure (timestamptz).
//  - timed  : start.dateTime (ISO avec offset) -> toISOString() = UTC.
//  - allday : start.date (YYYY-MM-DD) -> minuit UTC (convention à raffiner plus tard).
export function googleStartToUtc(event) {
  const s = event.start || {}
  if (s.dateTime) return { kind: 'timed',  utc: new Date(s.dateTime).toISOString(), raw: s.dateTime }
  if (s.date)     return { kind: 'allday', utc: new Date(s.date + 'T00:00:00Z').toISOString(), raw: s.date }
  return { kind: 'unknown', utc: null, raw: null }
}

// Construit la ligne rendez_vous d'un event INCONNU (event externe pur). Tenant dérivé
// de la CIBLE, jamais du body Google. google_event_id = event.id (invariant anti-boucle).
function buildInsertRow(cibleRow, evt, utc) {
  return {
    type_rdv: 'autres',
    date_heure: utc,
    titre: evt.summary || '',
    dossier_id: null,
    agence_id: cibleRow.agence_id,
    societe_id: cibleRow.societe_id,
    cible_id: cibleRow.id,
    google_event_id: evt.id,
    created_by: null,
  }
}

// ── LECTURE + CLASSEMENT (partagé dry-run / apply) — AUCUNE écriture ici. ──────────────
// Renvoie { report, actions, nextSyncToken, status } où :
//   status ∈ 'ok' | 'full_resync_needed' (410) | 'error'
//   actions = { inserts: [ligne rendez_vous…], deletes: [rdv.id…] }  (listes COMPLÈTES)
// options.reclassifyOn410 : sur 410, refaire un full pour reclasser (dry-run) ou non (apply).
async function readAndClassifyCibleGoogle(cibleRow, { reclassifyOn410 = true } = {}) {
  const report = {
    cible_id: cibleRow.id, agenda_nom: cibleRow.agenda_nom, calendar_id: cibleRow.calendar_id,
    agence_id: cibleRow.agence_id, societe_id: cibleRow.societe_id,
    mode: null,                       // 'incremental' | 'full' | 'full_after_410'
    events_lus: 0, reconnus: 0, inconnus: 0, cancelled: 0,
    inconnus_sans_date: 0,            // inconnus non insérables (start non normalisable) — SKIP
    cancelled_sans_match: 0,          // delete qui tomberait sur 0 ligne (no-op)
    matches_ambigus: 0,               // google_event_id matchant >1 ligne — NI insert NI delete
    next_sync_token: null,            // curseur à stocker (écrit seulement en apply)
    exemples_utc: [],                 // 2-3 normalisations (diagnostic)
    inconnus_insert: [],              // aperçu ≤5 des inserts (diagnostic)
    erreur: null,
  }
  const actions = { inserts: [], deletes: [] }

  const resolved = await resolveCible(cibleRow.id)
  if (!resolved) { report.erreur = 'cible sans compte'; return { report, actions, nextSyncToken: null, status: 'error' } }
  const gc = buildGoogleCalendar(resolved)
  if (!gc) { report.erreur = 'compte sans refresh_token (cible inerte)'; return { report, actions, nextSyncToken: null, status: 'error' } }
  const { calendar, calendarId } = gc

  // Curseur existant.
  const { data: state } = await supabaseAdmin
    .from('cible_sync_state').select('sync_token').eq('cible_id', cibleRow.id).maybeSingle()
  const syncToken = state?.sync_token || null

  // Index COMPLET des RDV de CETTE cible : google_event_id -> [ids] (réappariement + ambiguïté).
  // ⚠️ Pagination OBLIGATOIRE : sans .range(), la requête est plafonnée à la limite par
  // défaut Supabase (~1000 lignes). Une cible dépassant ce seuil voyait son index tronqué
  // -> matches ratés au-delà (cancelled non supprimés) ET re-insert des inconnus en doublon.
  // .order('id') = pagination stable.
  const byGid = new Map()
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data: rows, error } = await supabaseAdmin
      .from('rendez_vous').select('id, google_event_id')
      .eq('cible_id', cibleRow.id).not('google_event_id', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error || !rows || rows.length === 0) break
    for (const r of rows) {
      const arr = byGid.get(r.google_event_id) || []; arr.push(r.id); byGid.set(r.google_event_id, arr)
    }
    if (rows.length < PAGE) break
  }

  const classify = (evt) => {
    report.events_lus++
    const n = googleStartToUtc(evt)
    if (report.exemples_utc.length < 3) {
      report.exemples_utc.push({ event_id: evt.id, google_start: n.raw, kind: n.kind, utc_prevu: n.utc })
    }
    const matched = byGid.get(evt.id) || []

    // CANCELLED : suppression uniquement, et seulement si match UNIQUE.
    if (evt.status === 'cancelled') {
      report.cancelled++
      if (matched.length === 0) { report.cancelled_sans_match++; return }
      if (matched.length > 1)  { report.matches_ambigus++; return }   // ambigu -> on ne supprime pas
      actions.deletes.push(matched[0])
      return
    }

    // Non-cancelled avec match -> RECONNU -> NO-OP (jamais d'update, voulu).
    if (matched.length > 1) { report.matches_ambigus++; report.reconnus++; return }
    if (matched.length === 1) { report.reconnus++; return }

    // INCONNU -> INSERT (sauf start non normalisable : date_heure est NOT NULL).
    report.inconnus++
    if (!n.utc) { report.inconnus_sans_date++; return }
    const row = buildInsertRow(cibleRow, evt, n.utc)
    actions.inserts.push(row)
    if (report.inconnus_insert.length < 5) {
      report.inconnus_insert.push({ event_id: evt.id, summary: evt.summary || null, start_utc: n.utc, kind: n.kind })
    }
  }

  // events.list paginé + capture du nextSyncToken sur la DERNIÈRE page.
  const runList = async (useToken) => {
    let pageToken = null
    do {
      const params = { calendarId, singleEvents: true, showDeleted: true, maxResults: 250 }
      if (useToken)  params.syncToken = useToken   // incrémental (cancelled inclus)
      if (pageToken) params.pageToken = pageToken   // full : PAS de timeMin/timeMax (incompat. syncToken)
      const { data } = await calendar.events.list(params)
      for (const evt of data.items || []) classify(evt)
      pageToken = data.nextPageToken || null
      if (!pageToken && data.nextSyncToken) report.next_sync_token = data.nextSyncToken
    } while (pageToken)
  }

  const reset = () => {
    report.events_lus = 0; report.reconnus = 0; report.inconnus = 0; report.cancelled = 0
    report.inconnus_sans_date = 0; report.cancelled_sans_match = 0; report.matches_ambigus = 0
    report.exemples_utc = []; report.inconnus_insert = []
    actions.inserts.length = 0; actions.deletes.length = 0
  }

  try {
    if (syncToken) { report.mode = 'incremental'; await runList(syncToken) }
    else           { report.mode = 'full';        await runList(null) }
    return { report, actions, nextSyncToken: report.next_sync_token, status: 'ok' }
  } catch (err) {
    if (err?.code === 410) {
      // syncToken périmé. On SIGNALE full_resync_needed. Les actions de la lecture
      // incrémentale partielle sont invalides -> reset.
      report.mode = 'full_after_410'
      report.erreur = 'full_resync_needed (410 Gone)'
      reset()
      if (reclassifyOn410) {   // dry-run : refait un full pour montrer la classification.
        try { await runList(null) } catch (e2) { report.erreur += ' | full sync KO: ' + (e2?.message || e2) }
      }
      return { report, actions, nextSyncToken: report.next_sync_token, status: 'full_resync_needed' }
    }
    report.erreur = err?.message || String(err)
    return { report, actions, nextSyncToken: null, status: 'error' }
  }
}

// ── DRY-RUN (LOT B) — n'écrit rien. Conserve la sortie de rapport du lot B. ────────────
export async function dryRunPullCibleGoogle(cibleRow) {
  const { report } = await readAndClassifyCibleGoogle(cibleRow, { reclassifyOn410: true })
  if (report.erreur && report.erreur.startsWith('full_resync_needed')) {
    report.erreur += ' — cible_sync_state NON réinitialisé (dry-run)'
  }
  return report
}

// Écrit le curseur en 'error' SANS toucher sync_token (on ne perd pas le curseur sur panne).
async function markCursorError(cibleId, message) {
  const nowIso = new Date().toISOString()
  const { data: existing } = await supabaseAdmin
    .from('cible_sync_state').select('cible_id').eq('cible_id', cibleId).maybeSingle()
  if (existing) {
    await supabaseAdmin.from('cible_sync_state')
      .update({ last_status: 'error', last_error: message, last_sync_at: nowIso }).eq('cible_id', cibleId)
  } else {
    await supabaseAdmin.from('cible_sync_state')
      .insert({ cible_id: cibleId, sync_token: null, last_status: 'error', last_error: message, last_sync_at: nowIso })
  }
}

// ── APPLY (LOT C) — écrit réellement rendez_vous + cible_sync_state. ───────────────────
export async function applyPullCibleGoogle(cibleRow) {
  const { report, actions, nextSyncToken, status } =
    await readAndClassifyCibleGoogle(cibleRow, { reclassifyOn410: false })
  const applied = { inserts: 0, deletes: 0, cursor: null }
  const nowIso = new Date().toISOString()

  // 410 : reset curseur -> full au prochain run. AUCUNE écriture rendez_vous.
  if (status === 'full_resync_needed') {
    await supabaseAdmin.from('cible_sync_state').upsert({
      cible_id: cibleRow.id, sync_token: null, last_sync_at: nowIso,
      last_status: 'full_resync_needed', last_error: report.erreur,
    }, { onConflict: 'cible_id' })
    applied.cursor = 'full_resync_needed'
    return { report, applied }
  }

  // Erreur (réseau, cible inerte…) : curseur INCHANGÉ, on note juste l'échec.
  if (status === 'error') {
    await markCursorError(cibleRow.id, report.erreur || 'erreur inconnue')
    applied.cursor = 'error'
    return { report, applied }
  }

  // status === 'ok' -> GARDE-FOU levé : lecture complète réussie, on applique.
  let writeError = null
  if (actions.deletes.length) {
    const { error } = await supabaseAdmin.from('rendez_vous').delete().in('id', actions.deletes)
    if (error) writeError = 'delete KO: ' + error.message
    else applied.deletes = actions.deletes.length
  }
  if (actions.inserts.length) {
    const { error } = await supabaseAdmin.from('rendez_vous').insert(actions.inserts)
    if (error) writeError = (writeError ? writeError + ' | ' : '') + 'insert KO: ' + error.message
    else applied.inserts = actions.inserts.length
  }

  if (writeError) {
    // Écriture partielle en échec : on N'AVANCE PAS le curseur (prochain run rejoue la fenêtre).
    report.erreur = writeError
    await markCursorError(cibleRow.id, writeError)
    applied.cursor = 'error'
  } else {
    await supabaseAdmin.from('cible_sync_state').upsert({
      cible_id: cibleRow.id, sync_token: nextSyncToken, last_sync_at: nowIso,
      last_status: 'ok', last_error: null,
    }, { onConflict: 'cible_id' })
    applied.cursor = 'ok'
  }
  return { report, applied }
}
