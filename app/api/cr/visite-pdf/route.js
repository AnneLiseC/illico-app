// app/api/cr/visite-pdf/route.js
// POST { visite_id, options?, filtre_lot_id? } — renvoie (inline) le PDF d'une VISITE.
// La génération est déléguée à lib/pdf/genererVisite.js (réutilisée par la diffusion).

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireUser, assertDossierAccessible } from '../../../lib/api-auth'
import { genererVisitePDF } from '../../../lib/pdf/genererVisite.js'
import { formatNomClient } from '../../../lib/clients.js'

export const maxDuration = 60

let _admin
function admin() {
  if (!_admin) _admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _admin
}

export async function POST(request) {
  const auth = await requireUser(request)
  if (auth.error) return auth.error
  const role = auth.profile?.role
  if (!['admin', 'agente', 'client'].includes(role)) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  let body; try { body = await request.json() } catch { body = {} }
  const visiteId = body.visite_id
  if (!visiteId) return NextResponse.json({ error: 'visite_id manquant' }, { status: 400 })
  let options = body.options && typeof body.options === 'object' ? body.options : {}
  let filtreLotId = body.filtre_lot_id || null

  const db = admin()

  // Client : PDF COMPLET de ses propres visites PUBLIÉES uniquement (jamais options/filtre).
  if (role === 'client') {
    const { data: chk } = await db.from('comptes_rendus')
      .select('valide, dossier:dossiers(client_id)').eq('id', visiteId).maybeSingle()
    if (!chk) return NextResponse.json({ error: 'Visite introuvable' }, { status: 404 })
    if (!chk.valide || chk.dossier?.client_id !== auth.profile.client_id) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }
    options = {}; filtreLotId = null
  } else {
    // Staff (admin/agente) : contrôle d'appartenance au tenant (service_role contourne la RLS).
    const { data: v } = await db.from('comptes_rendus').select('dossier_id').eq('id', visiteId).maybeSingle()
    if (!v) return NextResponse.json({ error: 'Visite introuvable' }, { status: 404 })
    const acces = await assertDossierAccessible(v.dossier_id, auth.profile)
    if (acces.error) return acces.error
  }

  try {
    const { buffer, dossier, visite } = await genererVisitePDF(db, visiteId, { options, filtreLotId })
    const slug = (formatNomClient(dossier.client, { civilite: false }) || 'client').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_')
    const nom = `Visite_${visite.numero_visite || ''}_${slug}.pdf`.replace('__', '_')
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${nom.replace(/[^\x20-\x7e]/g, '')}"; filename*=UTF-8''${encodeURIComponent(nom)}`,
      },
    })
  } catch (e) {
    console.error('[cr/visite-pdf]', e)
    const status = /introuvable/.test(e?.message || '') ? 404 : 500
    return NextResponse.json({ error: e?.message || 'Génération PDF échouée' }, { status })
  }
}
