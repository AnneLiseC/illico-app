// app/api/google/calendar/pull/route.js
// Étage 3 — LOT B : PULL Google en DRY-RUN. LECTURE SEULE STRICTE.
//
// N'écrit RIEN : ni rendez_vous, ni cible_sync_state. Se contente de LIRE les
// événements Google des cibles google actives (par calendar_id de la cible),
// de classer chaque event (RECONNU / INCONNU / CANCELLED) contre les
// rendez_vous.google_event_id de la MÊME cible, et de LOGUER ce qui SERAIT écrit
// au lot C (inserts "autres", suppressions, nextSyncToken à stocker).
//
// Objectif : prouver la mécanique de réappariement + le curseur incrémental
// AVANT toute écriture réelle. Admin uniquement (opération de maintenance
// transverse aux agences d'une société).
//
// NE ressuscite PAS app/api/google/calendar/sync/route.js (mort, mono-calendrier).

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole } from '../../../../lib/api-auth'
import { dryRunPullCibleGoogle } from '../../../../lib/calendar/pull-google'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function GET(request) {
  const auth = await requireRole(request, ['admin'])
  if (auth.error) return auth.error

  // Cibles google ACTIVES uniquement. On borne à la société de l'admin
  // (multi-franchise : un admin ne pilote que ses agences).
  const { data: cibles, error } = await supabaseAdmin
    .from('cibles_calendrier')
    .select('id, agenda_nom, calendar_id, agence_id, societe_id, actif, fournisseur')
    .eq('fournisseur', 'google')
    .eq('actif', true)
    .eq('societe_id', auth.profile.societe_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.log('[pull][DRY-RUN] cibles google actives :', (cibles || []).length)

  const rapports = []
  for (const cible of cibles || []) {
    const rapport = await dryRunPullCibleGoogle(cible)
    rapports.push(rapport)
    // Log clair par cible — c'est le livrable "log" du dry-run.
    console.log(
      `[pull][DRY-RUN] cible ${rapport.agenda_nom} (${rapport.cible_id}) mode=${rapport.mode}`,
      `lus=${rapport.events_lus} reconnus=${rapport.reconnus} inconnus=${rapport.inconnus}`,
      `cancelled=${rapport.cancelled} (sans_match=${rapport.cancelled_sans_match})`,
      `ambigus=${rapport.matches_ambigus}`,
      rapport.erreur ? `ERREUR=${rapport.erreur}` : '',
    )
    console.log('[pull][DRY-RUN]   next_sync_token (NON écrit) :', rapport.next_sync_token)
    console.log('[pull][DRY-RUN]   exemples_utc :', JSON.stringify(rapport.exemples_utc))
    console.log('[pull][DRY-RUN]   inconnus_insert (aperçu, NON insérés) :', JSON.stringify(rapport.inconnus_insert))
  }

  return NextResponse.json({
    dry_run: true,
    ecritures: 'aucune (ni rendez_vous, ni cible_sync_state)',
    cibles: rapports.length,
    rapports,
  })
}
