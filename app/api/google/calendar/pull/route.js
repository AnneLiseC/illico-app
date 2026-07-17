// app/api/google/calendar/pull/route.js
// Étage 3 — PULL Google external -> BATILIS. Admin uniquement, borné à la société
// de l'admin (multi-franchise : un admin ne pilote que ses agences).
//
//  GET  = DRY-RUN (LOT B) : LIT + classe (RECONNU / INCONNU / CANCELLED), n'écrit RIEN.
//  POST = APPLY   (LOT C) : mêmes lecture + classement, PLUS les écritures réelles
//         (INSERT inconnus en 'autres', DELETE cancelled matchés, upsert curseur
//         cible_sync_state). Garde-fou : écritures appliquées seulement après
//         lecture complète réussie de la cible (cf. pull-google.js).
//
// NE ressuscite PAS app/api/google/calendar/sync/route.js (mort, mono-calendrier).

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole } from '../../../../lib/api-auth'
import { dryRunPullCibleGoogle, applyPullCibleGoogle } from '../../../../lib/calendar/pull-google'

let _supabaseAdmin
function getSupabaseAdmin() {
  if (!_supabaseAdmin) _supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _supabaseAdmin
}

// Cibles google ACTIVES de la société de l'admin.
async function getCiblesGoogle(societeId) {
  return getSupabaseAdmin()
    .from('cibles_calendrier')
    .select('id, agenda_nom, calendar_id, agence_id, societe_id, actif, fournisseur')
    .eq('fournisseur', 'google')
    .eq('actif', true)
    .eq('societe_id', societeId)
}

// ── DRY-RUN (LOT B) ────────────────────────────────────────────────────────────────────
export async function GET(request) {
  const auth = await requireRole(request, ['admin'])
  if (auth.error) return auth.error

  const { data: cibles, error } = await getCiblesGoogle(auth.profile.societe_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  console.log('[pull][DRY-RUN] cibles google actives :', (cibles || []).length)

  const rapports = []
  for (const cible of cibles || []) {
    const rapport = await dryRunPullCibleGoogle(cible)
    rapports.push(rapport)
    console.log(
      `[pull][DRY-RUN] cible ${rapport.agenda_nom} (${rapport.cible_id}) mode=${rapport.mode}`,
      `lus=${rapport.events_lus} reconnus=${rapport.reconnus} (echo=${rapport.reconnus_echo} modif=${rapport.reconnus_modifies} etag_init=${rapport.reconnus_etag_init})`,
      `inconnus=${rapport.inconnus} (typés=${rapport.inconnus_typed} trame=${rapport.trame_a_reecrire} sans_date=${rapport.inconnus_sans_date})`,
      `plancher_ignores=${rapport.ignores_plancher} cancelled=${rapport.cancelled} (sans_match=${rapport.cancelled_sans_match})`,
      `ambigus=${rapport.matches_ambigus}`,
      rapport.erreur ? `ERREUR=${rapport.erreur}` : '',
    )
    console.log('[pull][DRY-RUN]   next_sync_token (NON écrit) :', rapport.next_sync_token)
    console.log('[pull][DRY-RUN]   inconnus_insert (aperçu, NON insérés) :', JSON.stringify(rapport.inconnus_insert))
  }

  return NextResponse.json({
    dry_run: true,
    ecritures: 'aucune (ni rendez_vous, ni cible_sync_state)',
    cibles: rapports.length,
    rapports,
  })
}

// ── APPLY (LOT C) — écritures réelles ──────────────────────────────────────────────────
export async function POST(request) {
  const auth = await requireRole(request, ['admin'])
  if (auth.error) return auth.error

  const { data: cibles, error } = await getCiblesGoogle(auth.profile.societe_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  console.log('[pull][APPLY] cibles google actives :', (cibles || []).length)

  const resultats = []
  for (const cible of cibles || []) {
    const { report, applied } = await applyPullCibleGoogle(cible)
    resultats.push({ ...report, applied })
    console.log(
      `[pull][APPLY] cible ${report.agenda_nom} (${report.cible_id}) mode=${report.mode}`,
      `lus=${report.events_lus} reconnus=${report.reconnus} (echo=${report.reconnus_echo} modif=${report.reconnus_modifies} etag_init=${report.reconnus_etag_init})`,
      `inconnus=${report.inconnus} (typés=${report.inconnus_typed} sans_date=${report.inconnus_sans_date})`,
      `plancher_ignores=${report.ignores_plancher} cancelled=${report.cancelled} (sans_match=${report.cancelled_sans_match})`,
      `ambigus=${report.matches_ambigus}`,
      `=> INSERÉS=${applied.inserts} SUPPRIMÉS=${applied.deletes} MAJ=${applied.updates} TRAME=${applied.trame_ok}/${applied.trame_ok + applied.trame_ko}+${applied.updates_trame_ok} etag_init=${applied.etag_init} curseur=${applied.cursor}`,
      report.erreur ? `ERREUR=${report.erreur}` : '',
    )
  }

  return NextResponse.json({
    dry_run: false,
    ecritures: 'rendez_vous (insert/delete) + cible_sync_state (curseur)',
    cibles: resultats.length,
    resultats,
  })
}
