// app/api/cron/pull-google/route.js
// B8/B9-6 — CRON pull incrémental external -> BATILIS (B4-B6). TOUS-TENANTS, TOUS FOURNISSEURS.
// Itère TOUTES les cibles ACTIVES de TOUTES les sociétés (google + icloud), dispatch par
// fournisseur (pull-dispatch), moteur agnostique derrière, service_role. Isolation par cible.
//
// Auth : header Authorization: Bearer ${CRON_SECRET} (même schéma que /api/cron/relances).
// Déclenchement : toutes les ~15 min (GitHub Actions — plan Vercel gratuit, cf. SPEC).

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { applyPullCible } from '../../../lib/calendar/pull-dispatch'
import { checkBearerSecret } from '../../../lib/http-auth'

let _supabaseAdmin
function getSupabaseAdmin() {
  if (!_supabaseAdmin) _supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _supabaseAdmin
}

export async function GET(req) {
  if (!checkBearerSecret(req, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: cibles, error } = await getSupabaseAdmin()
    .from('cibles_calendrier')
    .select('id, agenda_nom, calendar_id, agence_id, societe_id, actif, fournisseur')
    .eq('actif', true)   // TOUTES sociétés, TOUS fournisseurs
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  console.log('[cron][pull] cibles actives (toutes sociétés, tous fournisseurs) :', (cibles || []).length)

  const resultats = []
  for (const cible of cibles || []) {
    try {
      const { report, applied } = await applyPullCible(cible)
      resultats.push({
        cible: cible.agenda_nom, fournisseur: cible.fournisseur, societe_id: cible.societe_id, mode: report.mode,
        inserts: applied.inserts, deletes: applied.deletes, updates: applied.updates,
        curseur: applied.cursor, erreur: report.erreur || undefined,
      })
      console.log(`[cron][pull] ${cible.fournisseur} ${cible.agenda_nom} (${cible.id}) mode=${report.mode}`,
        `INSERÉS=${applied.inserts} SUPPRIMÉS=${applied.deletes} MAJ=${applied.updates} curseur=${applied.cursor}`,
        report.erreur ? `ERREUR=${report.erreur}` : '')
    } catch (e) {
      // Isolation : une cible en échec n'arrête pas les autres.
      resultats.push({ cible: cible.agenda_nom, fournisseur: cible.fournisseur, societe_id: cible.societe_id, erreur: e?.message || String(e) })
      console.error('[cron][pull] cible', cible.id, 'KO:', e?.message || e)
    }
  }

  return NextResponse.json({ ok: true, canal: 'incremental', cibles: (cibles || []).length, resultats })
}
