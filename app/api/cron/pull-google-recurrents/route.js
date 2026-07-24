// app/api/cron/pull-google-recurrents/route.js
// B8/B9-6 — CRON balayage des RÉCURRENTS external -> Batils (B7 Google / B9-5 iCloud).
// TOUS-TENANTS, TOUS FOURNISSEURS. Fenêtre [now ; now+180j], 1×/jour : matérialise les
// occurrences futures des séries que le canal incrémental ne re-signale jamais. Dispatch par
// fournisseur (pull-dispatch), service_role, isolation d'erreur par cible.
//
// Auth : header Authorization: Bearer ${CRON_SECRET} (injecté automatiquement par Vercel Cron
// quand CRON_SECRET est défini). Déclenchement : 1×/jour via VERCEL CRON NATIF (cf. vercel.json).

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { pullRecurrentsCible } from '../../../lib/calendar/pull-dispatch'
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

  console.log('[cron][pull-recurrents] cibles actives (toutes sociétés, tous fournisseurs) :', (cibles || []).length)

  const resultats = []
  for (const cible of cibles || []) {
    try {
      const { report, applied } = await pullRecurrentsCible(cible)
      // Champs de rapport diffèrent selon fournisseur (Google: recurrentes ; iCloud: series/occurrences).
      resultats.push({
        cible: cible.agenda_nom, fournisseur: cible.fournisseur, societe_id: cible.societe_id,
        series: report.recurrentes ?? report.series, deja_presentes: report.deja_presentes,
        nouvelles: applied.inserts, erreur: report.erreur || undefined,
      })
      console.log(`[cron][pull-recurrents] ${cible.fournisseur} ${cible.agenda_nom} (${cible.id})`,
        `séries=${report.recurrentes ?? report.series} déjà=${report.deja_presentes} NOUVELLES=${applied.inserts}`,
        report.erreur ? `ERREUR=${report.erreur}` : '')
    } catch (e) {
      resultats.push({ cible: cible.agenda_nom, fournisseur: cible.fournisseur, societe_id: cible.societe_id, erreur: e?.message || String(e) })
      console.error('[cron][pull-recurrents] cible', cible.id, 'KO:', e?.message || e)
    }
  }

  return NextResponse.json({ ok: true, canal: 'recurrents_180j', cibles: (cibles || []).length, resultats })
}
