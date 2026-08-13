// app/api/planning/pdf/route.js
// POST { dossier_id, format?, colonnes?, mention? } — renvoie (inline) le PDF du PLANNING (Gantt).
// Staff uniquement. Génération déléguée à lib/pdf/genererPlanning.js.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole, assertDossierAccessible } from '../../../lib/api-auth'
import { genererPlanningPDF } from '../../../lib/pdf/genererPlanning.js'
import { formatNomClient } from '../../../lib/clients.js'

export const maxDuration = 60

const MENTION_MAX = 600

let _admin
function admin() {
  if (!_admin) _admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _admin
}

export async function POST(request) {
  const auth = await requireRole(request, ['admin', 'agente'])
  if (auth.error) return auth.error

  let body; try { body = await request.json() } catch { body = {} }
  const dossierId = body.dossier_id
  if (!dossierId) return NextResponse.json({ error: 'dossier_id manquant' }, { status: 400 })
  // Appartenance au tenant (service_role contourne la RLS).
  const acces = await assertDossierAccessible(dossierId, auth.profile)
  if (acces.error) return acces.error
  const format = body.format === 'A3' ? 'A3' : 'A4'
  const colonnes = body.colonnes && typeof body.colonnes === 'object' ? body.colonnes : {}
  const mention = typeof body.mention === 'string' ? body.mention.slice(0, MENTION_MAX) : ''

  try {
    const { buffer, dossier } = await genererPlanningPDF(admin(), dossierId, { format, colonnes, mention })
    const slug = (formatNomClient(dossier.client, { civilite: false }) || 'chantier')
      .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_')
    const nom = `Planning_${slug}.pdf`
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${nom.replace(/[^\x20-\x7e]/g, '')}"; filename*=UTF-8''${encodeURIComponent(nom)}`,
      },
    })
  } catch (e) {
    console.error('[planning/pdf]', e)
    const status = /introuvable/.test(e?.message || '') ? 404 : 500
    return NextResponse.json({ error: e?.message || 'Génération PDF échouée' }, { status })
  }
}
