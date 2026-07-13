// app/lib/calendar/pull-google.js
// Étage 3 — PULL Google external -> BATILIS.
//
//  LOT B : lecture incrémentale + classement RECONNU / INCONNU / CANCELLED, DRY-RUN
//          (dryRunPullCibleGoogle) — n'écrit rien. TOUJOURS DISPONIBLE (GET).
//  LOT C : mêmes lecture + classement, PLUS les écritures réelles
//          (applyPullCibleGoogle) — INSERT des inconnus, DELETE des cancelled matchés,
//          upsert du curseur cible_sync_state. Les deux chemins partagent readAndClassify.
//  B3    : plancher de sync (sync_floor) — aucun import d'historique.
//  B4    : parsing des events INCONNUS (parseEvent) -> type_rdv + dossier_id + artisan_id.
//  B5    : réécriture de la trame BATILIS dans Google pour les events TYPÉS rattachés
//          (rdvSummary) + ANTI-ÉCHO par etag (SPEC 2.4) : on stocke l'etag écrit/vu ;
//          au pull suivant, etag identique = notre reflet -> NO-OP (pas de boucle).
//
// Invariants (verrouillés) :
//  - itère par CALENDAR_ID de la cible (jamais calendarList du compte) ;
//  - sync INCRÉMENTALE si sync_token présent, sinon FULL ;
//  - suppression = SEULEMENT event.status==='cancelled' (jamais par absence) ;
//  - réappariement = rendez_vous.google_event_id === event.id ET cible_id === cible courante ;
//  - INCONNU -> parse + INSERT ; CANCELLED+1match -> DELETE ; RECONNU -> NO-OP (B6 fera l'update) ;
//  - agence_id/societe_id DÉRIVÉS DE LA CIBLE, cible_id=cible, created_by=NULL,
//    google_event_id=event.id (ANTI-DOUBLON), google_etag=etag (ANTI-ÉCHO) ;
//  - GARDE-FOU : on n'applique les écritures d'une cible QU'APRÈS lecture complète réussie.
//
// ⚠️ Le refresh OAuth (buildOAuthClientForCompte) peut mettre à jour comptes_oauth.access_token
//    (mécanique OAuth de google.js) — hors des tables métier écrites ici.

import { createClient } from '@supabase/supabase-js'
import { resolveCible, buildGoogleCalendar } from './google'
import { parseEvent } from './parse-event'
import { rdvSummary } from './mapping'

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

// Charge (paginé, scopé société de la cible) les candidats du parsing. Read-only.
async function loadCandidates(societeId) {
  const fetchAll = async (table, cols) => {
    const rows = []; const PAGE = 1000
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabaseAdmin.from(table).select(cols)
        .eq('societe_id', societeId).order('id', { ascending: true }).range(from, from + PAGE - 1)
      if (error || !data || data.length === 0) break
      rows.push(...data)
      if (data.length < PAGE) break
    }
    return rows
  }
  const [clients, dossiers, artisans] = await Promise.all([
    fetchAll('clients', 'id, nom, prenom, nom2, prenom2, civilite'),
    fetchAll('dossiers', 'id, client_id, archive, statut'),
    fetchAll('artisans', 'id, entreprise'),
  ])
  return {
    clients, dossiers, artisans,
    clientsById: new Map(clients.map((c) => [c.id, c])),
    dossiersById: new Map(dossiers.map((d) => [d.id, d])),
    artisansById: new Map(artisans.map((a) => [a.id, a])),
  }
}

// Trame BATILIS d'un event typé rattaché : réutilise rdvSummary (mapping du push) à partir
// des ids parsés + candidats en mémoire (aucune requête). Renvoie le summary à réécrire.
function trameSummary(parsed, cand) {
  const dossier = parsed.dossier_id ? cand.dossiersById.get(parsed.dossier_id) : null
  const client = dossier?.client_id ? cand.clientsById.get(dossier.client_id) : null
  const artisan = parsed.artisan_id ? cand.artisansById.get(parsed.artisan_id) : null
  return rdvSummary({
    type_rdv: parsed.type_rdv,
    dossier: client ? { client: { civilite: client.civilite, prenom: client.prenom, nom: client.nom } } : null,
    artisan: artisan ? { entreprise: artisan.entreprise } : null,
  })
}

// Construit la ligne rendez_vous d'un event INCONNU parsé. Tenant dérivé de la CIBLE.
// titre : 'autres' ou typé-non-rattaché -> on garde le titre Google (pas de trame lossy) ;
// typé + dossier rattaché -> null (la trame BATILIS fait foi, réécrite en B5).
function buildInsertRow(cibleRow, evt, utc, parsed, needsTrame) {
  return {
    type_rdv: parsed.type_rdv,
    date_heure: utc,
    titre: needsTrame ? null : (evt.summary || ''),
    dossier_id: parsed.dossier_id,
    artisan_id: parsed.artisan_id,
    agence_id: cibleRow.agence_id,
    societe_id: cibleRow.societe_id,
    cible_id: cibleRow.id,
    google_event_id: evt.id,
    google_etag: evt.etag || null,
    created_by: null,
  }
}

// ── LECTURE + CLASSEMENT (partagé dry-run / apply) — AUCUNE écriture ici. ──────────────
async function readAndClassifyCibleGoogle(cibleRow, { reclassifyOn410 = true } = {}) {
  const report = {
    cible_id: cibleRow.id, agenda_nom: cibleRow.agenda_nom, calendar_id: cibleRow.calendar_id,
    agence_id: cibleRow.agence_id, societe_id: cibleRow.societe_id,
    mode: null,
    events_lus: 0, reconnus: 0, inconnus: 0, cancelled: 0,
    reconnus_echo: 0,                 // RECONNU dont l'etag == stocké (notre propre écriture)
    reconnus_modifies: 0,             // RECONNU dont l'etag diffère (modif humaine — B6)
    inconnus_typed: 0,                // inconnus non-'autres' après parsing
    trame_a_reecrire: 0,             // inconnus typés + rattachés -> réécriture de trame prévue
    inconnus_sans_date: 0,
    ignores_plancher: 0,
    cancelled_sans_match: 0,
    matches_ambigus: 0,
    next_sync_token: null,
    exemples_utc: [],
    inconnus_insert: [],
    erreur: null,
  }
  const actions = { inserts: [], deletes: [], trame: [] }   // trame: [{ google_event_id, summary }]

  const resolved = await resolveCible(cibleRow.id)
  if (!resolved) { report.erreur = 'cible sans compte'; return { report, actions, nextSyncToken: null, syncFloor: null, googleClient: null, status: 'error' } }
  const gc = buildGoogleCalendar(resolved)
  if (!gc) { report.erreur = 'compte sans refresh_token (cible inerte)'; return { report, actions, nextSyncToken: null, syncFloor: null, googleClient: null, status: 'error' } }
  const { calendar, calendarId } = gc

  const { data: state } = await supabaseAdmin
    .from('cible_sync_state').select('sync_token, sync_floor').eq('cible_id', cibleRow.id).maybeSingle()
  const syncToken = state?.sync_token || null

  const syncFloor = state?.sync_floor || new Date().toISOString()
  const floorMs = new Date(syncFloor).getTime()

  // Candidats du parsing (B4), scopés société de la cible, chargés une fois.
  const cand = await loadCandidates(cibleRow.societe_id)

  // Index COMPLET des RDV de CETTE cible : google_event_id -> [{ id, etag }] (pagination
  // OBLIGATOIRE, cf. limite Supabase ~1000). Sert au réappariement + à l'anti-écho (etag).
  const byGid = new Map()
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data: rows, error } = await supabaseAdmin
      .from('rendez_vous').select('id, google_event_id, google_etag')
      .eq('cible_id', cibleRow.id).not('google_event_id', 'is', null)
      .order('id', { ascending: true }).range(from, from + PAGE - 1)
    if (error || !rows || rows.length === 0) break
    for (const r of rows) {
      const arr = byGid.get(r.google_event_id) || []
      arr.push({ id: r.id, etag: r.google_etag }); byGid.set(r.google_event_id, arr)
    }
    if (rows.length < PAGE) break
  }

  const classify = (evt) => {
    report.events_lus++
    const endUtc = googleEndToUtc(evt)
    if (endUtc && new Date(endUtc).getTime() < floorMs) { report.ignores_plancher++; return }
    const n = googleStartToUtc(evt)
    if (report.exemples_utc.length < 3) {
      report.exemples_utc.push({ event_id: evt.id, google_start: n.raw, kind: n.kind, utc_prevu: n.utc })
    }
    const matched = byGid.get(evt.id) || []

    // CANCELLED : suppression uniquement, et seulement si match UNIQUE.
    if (evt.status === 'cancelled') {
      report.cancelled++
      if (matched.length === 0) { report.cancelled_sans_match++; return }
      if (matched.length > 1)  { report.matches_ambigus++; return }
      actions.deletes.push(matched[0].id)
      return
    }

    // RECONNU (match) -> NO-OP en B5. Anti-écho : etag identique = notre reflet ; sinon modif
    // humaine (traitée en B6). On COMPTE seulement, on n'écrit pas encore.
    if (matched.length > 1) { report.matches_ambigus++; report.reconnus++; return }
    if (matched.length === 1) {
      report.reconnus++
      const stored = matched[0].etag
      if (stored && evt.etag && evt.etag === stored) report.reconnus_echo++
      else report.reconnus_modifies++
      return
    }

    // INCONNU -> parse (B4) + INSERT.
    report.inconnus++
    if (!n.utc) { report.inconnus_sans_date++; return }
    const parsed = parseEvent(evt.summary, cand)
    const needsTrame = parsed.type_rdv !== 'autres' && parsed.dossier_id != null
    if (parsed.type_rdv !== 'autres') report.inconnus_typed++
    actions.inserts.push(buildInsertRow(cibleRow, evt, n.utc, parsed, needsTrame))
    if (needsTrame) {
      report.trame_a_reecrire++
      actions.trame.push({ google_event_id: evt.id, summary: trameSummary(parsed, cand) })
    }
    if (report.inconnus_insert.length < 5) {
      report.inconnus_insert.push({
        event_id: evt.id, summary: evt.summary || null, start_utc: n.utc,
        type_rdv: parsed.type_rdv, dossier_id: parsed.dossier_id, artisan_id: parsed.artisan_id, trame: needsTrame,
      })
    }
  }

  const runList = async (useToken) => {
    let pageToken = null
    do {
      const params = { calendarId, singleEvents: true, showDeleted: true, maxResults: 250 }
      if (useToken)  params.syncToken = useToken
      if (pageToken) params.pageToken = pageToken
      const { data } = await calendar.events.list(params)
      for (const evt of data.items || []) classify(evt)
      pageToken = data.nextPageToken || null
      if (!pageToken && data.nextSyncToken) report.next_sync_token = data.nextSyncToken
    } while (pageToken)
  }

  const reset = () => {
    report.events_lus = 0; report.reconnus = 0; report.inconnus = 0; report.cancelled = 0
    report.reconnus_echo = 0; report.reconnus_modifies = 0; report.inconnus_typed = 0; report.trame_a_reecrire = 0
    report.inconnus_sans_date = 0; report.ignores_plancher = 0
    report.cancelled_sans_match = 0; report.matches_ambigus = 0
    report.exemples_utc = []; report.inconnus_insert = []
    actions.inserts.length = 0; actions.deletes.length = 0; actions.trame.length = 0
  }

  const googleClient = { calendar, calendarId }
  try {
    if (syncToken) { report.mode = 'incremental'; await runList(syncToken) }
    else           { report.mode = 'full';        await runList(null) }
    return { report, actions, nextSyncToken: report.next_sync_token, syncFloor, googleClient, status: 'ok' }
  } catch (err) {
    if (err?.code === 410) {
      report.mode = 'full_after_410'
      report.erreur = 'full_resync_needed (410 Gone)'
      reset()
      if (reclassifyOn410) {
        try { await runList(null) } catch (e2) { report.erreur += ' | full sync KO: ' + (e2?.message || e2) }
      }
      return { report, actions, nextSyncToken: report.next_sync_token, syncFloor, googleClient, status: 'full_resync_needed' }
    }
    report.erreur = err?.message || String(err)
    return { report, actions, nextSyncToken: null, syncFloor, googleClient, status: 'error' }
  }
}

// ── DRY-RUN (LOT B) — n'écrit rien (ni base, ni Google). Montre le parsing (B4). ───────
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

// B5 — réécrit la trame BATILIS dans Google pour les inserts typés+rattachés, puis stocke
// l'etag renvoyé par Google (ANTI-ÉCHO). Non bloquant : un échec Google laisse le RDV en
// base (correct) avec l'etag lu ; la trame sera retentée quand l'event rechangera. Renvoie
// { ok, ko }.
async function reecrireTrames(googleClient, trame, idByGid) {
  const out = { ok: 0, ko: 0 }
  for (const t of trame) {
    const rdvId = idByGid.get(t.google_event_id)
    if (!rdvId) { out.ko++; continue }
    try {
      const res = await googleClient.calendar.events.patch({
        calendarId: googleClient.calendarId,
        eventId: t.google_event_id,
        requestBody: { summary: t.summary },
      })
      const newEtag = res?.data?.etag || null
      await supabaseAdmin.from('rendez_vous').update({ google_etag: newEtag }).eq('id', rdvId)
      out.ok++
    } catch (e) {
      console.error('[pull][B5] trame KO event', t.google_event_id, e?.message || e)
      out.ko++
    }
  }
  return out
}

// ── APPLY (LOT C + B4/B5) — écrit rendez_vous + cible_sync_state, réécrit les trames. ──
export async function applyPullCibleGoogle(cibleRow) {
  const { report, actions, nextSyncToken, syncFloor, googleClient, status } =
    await readAndClassifyCibleGoogle(cibleRow, { reclassifyOn410: false })
  const applied = { inserts: 0, deletes: 0, trame_ok: 0, trame_ko: 0, cursor: null }
  const nowIso = new Date().toISOString()

  // 410 : reset curseur -> full au prochain run. AUCUNE écriture rendez_vous. sync_floor préservé.
  if (status === 'full_resync_needed') {
    await supabaseAdmin.from('cible_sync_state').upsert({
      cible_id: cibleRow.id, sync_token: null, last_sync_at: nowIso, sync_floor: syncFloor,
      last_status: 'full_resync_needed', last_error: report.erreur,
    }, { onConflict: 'cible_id' })
    applied.cursor = 'full_resync_needed'
    return { report, applied }
  }

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

  let idByGid = new Map()
  if (actions.inserts.length) {
    // .select() pour récupérer les ids (nécessaires à la réécriture de trame B5).
    const { data: inserted, error } = await supabaseAdmin
      .from('rendez_vous').insert(actions.inserts).select('id, google_event_id')
    if (error) writeError = (writeError ? writeError + ' | ' : '') + 'insert KO: ' + error.message
    else {
      applied.inserts = inserted.length
      idByGid = new Map((inserted || []).map((r) => [r.google_event_id, r.id]))
    }
  }

  if (writeError) {
    // Écriture base en échec : on N'AVANCE PAS le curseur, PAS de réécriture Google.
    report.erreur = writeError
    await markCursorError(cibleRow.id, writeError)
    applied.cursor = 'error'
    return { report, applied }
  }

  // B5 — réécriture des trames (typés rattachés) + anti-écho (etag). Non bloquant.
  if (actions.trame.length) {
    const r = await reecrireTrames(googleClient, actions.trame, idByGid)
    applied.trame_ok = r.ok; applied.trame_ko = r.ko
  }

  await supabaseAdmin.from('cible_sync_state').upsert({
    cible_id: cibleRow.id, sync_token: nextSyncToken, last_sync_at: nowIso, sync_floor: syncFloor,
    last_status: 'ok', last_error: null,
  }, { onConflict: 'cible_id' })
  applied.cursor = 'ok'
  return { report, applied }
}
