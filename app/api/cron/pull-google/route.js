// app/api/cron/pull-google/route.js
// B8 — CRON pull incrémental Google -> BATILIS (B4-B6). TOUS-TENANTS.
// Itère TOUTES les cibles google actives de TOUTES les sociétés, tenant dérivé de chaque
// cible, en service_role (pas d'utilisateur connecté). Isolation d'erreur par cible.
//
// Auth : header Authorization: Bearer ${CRON_SECRET} (même schéma que /api/cron/relances).
// Déclenchement : toutes les ~15 min (GitHub Actions — plan Vercel gratuit, cf. SPEC).

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { applyPullCibleGoogle } from '../../../lib/calendar/pull-google'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function GET(req) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: cibles, error } = await supabaseAdmin
    .from('cibles_calendrier')
    .select('id, agenda_nom, calendar_id, agence_id, societe_id, actif, fournisseur')
    .eq('fournisseur', 'google').eq('actif', true)   // TOUTES sociétés
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  console.log('[cron][pull-google] cibles google actives (toutes sociétés) :', (cibles || []).length)

  const resultats = []
  for (const cible of cibles || []) {
    try {
      const { report, applied } = await applyPullCibleGoogle(cible)
      resultats.push({
        cible: cible.agenda_nom, societe_id: cible.societe_id, mode: report.mode,
        inserts: applied.inserts, deletes: applied.deletes, updates: applied.updates,
        curseur: applied.cursor, erreur: report.erreur || undefined,
      })
      console.log(`[cron][pull-google] ${cible.agenda_nom} (${cible.id}) mode=${report.mode}`,
        `INSERÉS=${applied.inserts} SUPPRIMÉS=${applied.deletes} MAJ=${applied.updates} curseur=${applied.cursor}`,
        report.erreur ? `ERREUR=${report.erreur}` : '')
    } catch (e) {
      // Isolation : une cible en échec n'arrête pas les autres.
      resultats.push({ cible: cible.agenda_nom, societe_id: cible.societe_id, erreur: e?.message || String(e) })
      console.error('[cron][pull-google] cible', cible.id, 'KO:', e?.message || e)
    }
  }

  return NextResponse.json({ ok: true, canal: 'incremental', cibles: (cibles || []).length, resultats })
}
