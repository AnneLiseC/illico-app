// app/lib/calendar/pull-engine.js
// Étage 3 — MOTEUR DE PULL AGNOSTIQUE (B9-1). Extrait de pull-google.js SANS changement de
// comportement : classification RECONNU/INCONNU/CANCELLED, plancher (sync_floor), anti-écho
// par etag, last-write-wins sélectif B6, parsing B4, et l'orchestration d'écriture (apply).
//
// Le moteur ne connaît AUCUN fournisseur. Il opère sur un event NORMALISÉ :
//   { id, etag, start_utc, end_utc, kind, summary, status, isRecurringInstance, start_raw }
// et sur un WRITER injecté pour la seule écriture spécifique fournisseur (réécriture de trame) :
//   writer.rewriteTrame(externalId, summary) -> Promise<etag>   (throw en cas d'échec)
//
// Chaque adaptateur (google-pull, plus tard icloud-pull) : (1) lit les events chez le
// fournisseur et les NORMALISE, appelle classifyNormalized ; (2) fournit le writer ; (3) délègue
// l'écriture base à applyActions. Les colonnes google_event_id/google_etag restent inchangées à
// ce lot (renommage remote_* = B9-2).

import { createClient } from '@supabase/supabase-js'
import { parseEvent } from './parse-event'
import { rdvSummary } from './mapping'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Rapport agnostique (mêmes champs/valeurs qu'avant).
export function makeReport(cibleRow) {
  return {
    cible_id: cibleRow.id, agenda_nom: cibleRow.agenda_nom, calendar_id: cibleRow.calendar_id,
    agence_id: cibleRow.agence_id, societe_id: cibleRow.societe_id,
    mode: null,
    events_lus: 0, reconnus: 0, inconnus: 0, cancelled: 0,
    reconnus_echo: 0,
    reconnus_modifies: 0,
    reconnus_etag_init: 0,
    reconnus_sans_etag: 0,
    inconnus_typed: 0,
    trame_a_reecrire: 0,
    inconnus_sans_date: 0,
    ignores_plancher: 0,
    cancelled_sans_match: 0,
    matches_ambigus: 0,
    next_sync_token: null,
    exemples_utc: [],
    inconnus_insert: [],
    erreur: null,
  }
}

// trame: [{ google_event_id, summary }] ; updates: [{ id, google_event_id, payload, trameSummary|null, currentEtag }]
// etagBackfill: [{ id, etag }]
export function makeActions() {
  return { inserts: [], deletes: [], trame: [], updates: [], etagBackfill: [] }
}

// Vide rapport + actions (chemin 410 : la lecture incrémentale partielle est invalide).
export function resetReport(report, actions) {
  report.events_lus = 0; report.reconnus = 0; report.inconnus = 0; report.cancelled = 0
  report.reconnus_echo = 0; report.reconnus_modifies = 0; report.reconnus_etag_init = 0; report.reconnus_sans_etag = 0
  report.inconnus_typed = 0; report.trame_a_reecrire = 0
  report.inconnus_sans_date = 0; report.ignores_plancher = 0
  report.cancelled_sans_match = 0; report.matches_ambigus = 0
  report.exemples_utc = []; report.inconnus_insert = []
  actions.inserts.length = 0; actions.deletes.length = 0; actions.trame.length = 0
  actions.updates.length = 0; actions.etagBackfill.length = 0
}

// Charge (paginé, scopé société de la cible) les candidats du parsing. Read-only.
export async function loadCandidates(societeId) {
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

// Index COMPLET des RDV de CETTE cible : google_event_id -> [{ id, etag, dossier_id }] (pagination
// OBLIGATOIRE, cf. limite Supabase ~1000). Réappariement + anti-écho (etag).
export async function loadByGid(cibleRow) {
  const byGid = new Map()
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data: rows, error } = await supabaseAdmin
      .from('rendez_vous').select('id, google_event_id, google_etag, dossier_id')
      .eq('cible_id', cibleRow.id).not('google_event_id', 'is', null)
      .order('id', { ascending: true }).range(from, from + PAGE - 1)
    if (error || !rows || rows.length === 0) break
    for (const r of rows) {
      const arr = byGid.get(r.google_event_id) || []
      arr.push({ id: r.id, etag: r.google_etag, dossier_id: r.dossier_id }); byGid.set(r.google_event_id, arr)
    }
    if (rows.length < PAGE) break
  }
  return byGid
}

// Trame BATILIS d'un event typé rattaché : réutilise rdvSummary (mapping du push).
export function trameSummary(parsed, cand) {
  const dossier = parsed.dossier_id ? cand.dossiersById.get(parsed.dossier_id) : null
  const client = dossier?.client_id ? cand.clientsById.get(dossier.client_id) : null
  const artisan = parsed.artisan_id ? cand.artisansById.get(parsed.artisan_id) : null
  return rdvSummary({
    type_rdv: parsed.type_rdv,
    dossier: client ? { client: { civilite: client.civilite, prenom: client.prenom, nom: client.nom } } : null,
    artisan: artisan ? { entreprise: artisan.entreprise } : null,
  })
}

// Ligne rendez_vous d'un event INCONNU parsé. Tenant dérivé de la CIBLE. `norm` = event normalisé.
export function buildInsertRow(cibleRow, norm, utc, parsed, needsTrame) {
  return {
    type_rdv: parsed.type_rdv,
    date_heure: utc,
    titre: needsTrame ? null : (norm.summary || ''),
    dossier_id: parsed.dossier_id,
    artisan_id: parsed.artisan_id,
    agence_id: cibleRow.agence_id,
    societe_id: cibleRow.societe_id,
    cible_id: cibleRow.id,
    google_event_id: norm.id,
    google_etag: norm.etag || null,
    created_by: null,
  }
}

// ── CLASSIFICATION (agnostique) — mute report/actions. AUCUNE écriture. ────────────────
// ctx = { report, actions, byGid, cand, floorMs, cibleRow }
export function classifyNormalized(norm, ctx) {
  const { report, actions, byGid, cand, floorMs, cibleRow } = ctx
  report.events_lus++
  // ANTI-ÉCHO INTERVENTIONS : nos propres pushes d'intervention portent le marqueur
  // [illico-int:…] dans leur description. On ne les ré-importe JAMAIS comme RDV — leurs
  // ids vivent dans interventions_artisans (pas rendez_vous), donc byGid ne les reconnaît
  // pas et ils seraient sinon insérés en RDV fantômes à chaque pull.
  if (norm.description && norm.description.includes('[illico-int:')) {
    report.interventions_ignorees = (report.interventions_ignorees || 0) + 1
    return
  }
  // PLANCHER : event fini avant sync_floor -> ignoré (aucun import d'historique).
  if (norm.end_utc && new Date(norm.end_utc).getTime() < floorMs) { report.ignores_plancher++; return }
  if (report.exemples_utc.length < 3) {
    report.exemples_utc.push({ event_id: norm.id, google_start: norm.start_raw, kind: norm.kind, utc_prevu: norm.start_utc })
  }
  const matched = byGid.get(norm.id) || []

  // CANCELLED : suppression uniquement, et seulement si match UNIQUE.
  if (norm.status === 'cancelled') {
    report.cancelled++
    if (matched.length === 0) { report.cancelled_sans_match++; return }
    if (matched.length > 1)  { report.matches_ambigus++; return }
    actions.deletes.push(matched[0].id)
    return
  }

  // RECONNU
  if (matched.length > 1) { report.matches_ambigus++; report.reconnus++; return }
  if (matched.length === 1) {
    report.reconnus++
    const cur = matched[0]                         // { id, etag, dossier_id }
    const stored = cur.etag

    // ANTI-ÉCHO : etag identique = notre propre écriture -> NO-OP.
    if (stored && norm.etag && norm.etag === stored) { report.reconnus_echo++; return }

    // Pré-requis : pas d'etag de référence (google_etag NULL) -> on NE re-parse PAS, on capte l'etag.
    if (!stored) {
      report.reconnus_etag_init++
      if (norm.etag) actions.etagBackfill.push({ id: cur.id, etag: norm.etag })
      return
    }

    // SÛRETÉ : event sans etag (anormal) -> pas de référence fiable -> no-op.
    if (!norm.etag) { report.reconnus_sans_etag++; return }

    // etag connu ET différent = VRAIE modif humaine -> LAST-WRITE-WINS SÉLECTIF (SPEC 2.2).
    report.reconnus_modifies++
    const parsed = parseEvent(norm.summary, cand)
    const finalDossierId = parsed.dossier_id != null ? parsed.dossier_id : (cur.dossier_id ?? null)
    const needsTrame = parsed.type_rdv !== 'autres' && finalDossierId != null
    const payload = {
      type_rdv: parsed.type_rdv,
      artisan_id: parsed.artisan_id,
      titre: needsTrame ? null : (norm.summary || ''),
    }
    if (norm.start_utc) payload.date_heure = norm.start_utc
    if (norm.kind !== 'allday' && norm.start_utc && norm.end_utc) {
      const dm = Math.round((new Date(norm.end_utc).getTime() - new Date(norm.start_utc).getTime()) / 60000)
      if (dm > 0) payload.duree_minutes = dm
    }
    if (parsed.dossier_id != null) payload.dossier_id = parsed.dossier_id   // sinon omis -> gardé
    actions.updates.push({
      id: cur.id, google_event_id: norm.id, currentEtag: norm.etag || null, payload,
      trameSummary: needsTrame
        ? trameSummary({ type_rdv: parsed.type_rdv, dossier_id: finalDossierId, artisan_id: parsed.artisan_id }, cand)
        : null,
    })
    return
  }

  // INCONNU -> parse (B4) + INSERT.
  report.inconnus++
  if (!norm.start_utc) { report.inconnus_sans_date++; return }
  const parsed = parseEvent(norm.summary, cand)
  const needsTrame = parsed.type_rdv !== 'autres' && parsed.dossier_id != null
  if (parsed.type_rdv !== 'autres') report.inconnus_typed++
  actions.inserts.push(buildInsertRow(cibleRow, norm, norm.start_utc, parsed, needsTrame))
  if (needsTrame) {
    report.trame_a_reecrire++
    actions.trame.push({ google_event_id: norm.id, summary: trameSummary(parsed, cand) })
  }
  if (report.inconnus_insert.length < 5) {
    report.inconnus_insert.push({
      event_id: norm.id, summary: norm.summary || null, start_utc: norm.start_utc,
      type_rdv: parsed.type_rdv, dossier_id: parsed.dossier_id, artisan_id: parsed.artisan_id, trame: needsTrame,
    })
  }
}

// Écrit le curseur en 'error' SANS toucher sync_token (on ne perd pas le curseur sur panne).
export async function markCursorError(cibleId, message) {
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

// B5 — réécrit la trame (writer fournisseur) pour les inserts typés+rattachés, stocke l'etag rendu.
async function reecrireTrames(writer, trame, idByGid) {
  const out = { ok: 0, ko: 0 }
  for (const t of trame) {
    const rdvId = idByGid.get(t.google_event_id)
    if (!rdvId) { out.ko++; continue }
    try {
      const newEtag = await writer.rewriteTrame(t.google_event_id, t.summary)
      await supabaseAdmin.from('rendez_vous').update({ google_etag: newEtag }).eq('id', rdvId)
      out.ok++
    } catch (e) {
      console.error('[pull][B5] trame KO event', t.google_event_id, e?.message || e)
      out.ko++
    }
  }
  return out
}

// B6 — modifs humaines : UPDATE des champs re-parsés, puis réécriture de trame (writer) si
// typé+rattaché (sinon on stocke l'etag courant -> anti-écho). Non bloquant.
async function appliquerUpdatesB6(writer, updates) {
  const out = { ok: 0, ko: 0, trame_ok: 0, trame_ko: 0 }
  for (const u of updates) {
    const { error } = await supabaseAdmin.from('rendez_vous').update(u.payload).eq('id', u.id)
    if (error) { console.error('[pull][B6] update KO', u.id, error.message); out.ko++; continue }
    out.ok++
    if (u.trameSummary) {
      try {
        const newEtag = await writer.rewriteTrame(u.google_event_id, u.trameSummary)
        await supabaseAdmin.from('rendez_vous').update({ google_etag: newEtag }).eq('id', u.id)
        out.trame_ok++
      } catch (e) {
        console.error('[pull][B6] trame KO', u.google_event_id, e?.message || e)
        out.trame_ko++
        await supabaseAdmin.from('rendez_vous').update({ google_etag: u.currentEtag }).eq('id', u.id)
      }
    } else {
      await supabaseAdmin.from('rendez_vous').update({ google_etag: u.currentEtag }).eq('id', u.id)
    }
  }
  return out
}

// ── APPLY (agnostique) — écrit rendez_vous + cible_sync_state ; writer pour la trame. ──
export async function applyActions(cibleRow, { report, actions, nextSyncToken, syncFloor, status }, writer) {
  const applied = { inserts: 0, deletes: 0, trame_ok: 0, trame_ko: 0,
    etag_init: 0, updates: 0, updates_trame_ok: 0, updates_trame_ko: 0, cursor: null }
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
    const { data: inserted, error } = await supabaseAdmin
      .from('rendez_vous').insert(actions.inserts).select('id, google_event_id')
    if (error) writeError = (writeError ? writeError + ' | ' : '') + 'insert KO: ' + error.message
    else {
      applied.inserts = inserted.length
      idByGid = new Map((inserted || []).map((r) => [r.google_event_id, r.id]))
    }
  }

  if (writeError) {
    report.erreur = writeError
    await markCursorError(cibleRow.id, writeError)
    applied.cursor = 'error'
    return { report, applied }
  }

  // B5 — réécriture des trames (typés rattachés) + anti-écho (etag). Non bloquant.
  if (actions.trame.length) {
    const r = await reecrireTrames(writer, actions.trame, idByGid)
    applied.trame_ok = r.ok; applied.trame_ko = r.ko
  }

  // B6 — backfill etag des RDV sans référence : capte l'etag, NE modifie rien.
  for (const b of actions.etagBackfill) {
    await supabaseAdmin.from('rendez_vous').update({ google_etag: b.etag }).eq('id', b.id)
  }
  applied.etag_init = actions.etagBackfill.length

  // B6 — modifs humaines (last-write-wins sélectif). Non bloquant.
  if (actions.updates.length) {
    const r = await appliquerUpdatesB6(writer, actions.updates)
    applied.updates = r.ok; applied.updates_trame_ok = r.trame_ok; applied.updates_trame_ko = r.trame_ko
  }

  await supabaseAdmin.from('cible_sync_state').upsert({
    cible_id: cibleRow.id, sync_token: nextSyncToken, last_sync_at: nowIso, sync_floor: syncFloor,
    last_status: 'ok', last_error: null,
  }, { onConflict: 'cible_id' })
  applied.cursor = 'ok'
  return { report, applied }
}
