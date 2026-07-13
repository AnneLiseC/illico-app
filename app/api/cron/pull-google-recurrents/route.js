// app/api/cron/pull-google-recurrents/route.js
// B8 — CRON balayage des RÉCURRENTS Google -> BATILIS (B7). TOUS-TENANTS.
// Fenêtre [now ; now+180j], 1×/jour : matérialise les occurrences futures des séries que le
// canal incrémental ne re-signale jamais. Itère toutes les cibles google actives de toutes
// les sociétés, service_role, isolation d'erreur par cible.
//
// Auth : header Authorization: Bearer ${CRON_SECRET}. Déclenchement : 1×/jour (GitHub Actions).

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { pullRecurrentsCibleGoogle } from '../../../lib/calendar/pull-google'

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
    .eq('fournisseur', 'google').eq('actif', true)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  console.log('[cron][pull-recurrents] cibles google actives (toutes sociétés) :', (cibles || []).length)

  const resultats = []
  for (const cible of cibles || []) {
    try {
      const { report, applied } = await pullRecurrentsCibleGoogle(cible, { horizonDays: 180 })
      resultats.push({
        cible: cible.agenda_nom, societe_id: cible.societe_id,
        recurrentes: report.recurrentes, deja_presentes: report.deja_presentes,
        nouvelles: applied.inserts, erreur: report.erreur || undefined,
      })
      console.log(`[cron][pull-recurrents] ${cible.agenda_nom} (${cible.id})`,
        `récurrentes=${report.recurrentes} déjà=${report.deja_presentes} NOUVELLES=${applied.inserts}`,
        report.erreur ? `ERREUR=${report.erreur}` : '')
    } catch (e) {
      resultats.push({ cible: cible.agenda_nom, societe_id: cible.societe_id, erreur: e?.message || String(e) })
      console.error('[cron][pull-recurrents] cible', cible.id, 'KO:', e?.message || e)
    }
  }

  return NextResponse.json({ ok: true, canal: 'recurrents_180j', cibles: (cibles || []).length, resultats })
}
