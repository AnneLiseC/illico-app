// app/api/drive/push-facture/route.js
// POST { facture_id } — miroir OneDrive d'une facture artisan (suivi financier) dans
// Documents artisans/<Artisan>/Factures/. Idempotent via doc_index.facture_id.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole } from '../../../lib/api-auth'
import { chantierBaseSegments, nettoyerSegment } from '../../../lib/drive/taxonomie'
import { pushMirror, mimeFromExt } from '../../../lib/drive/mirror'

let _admin
function admin() {
  if (!_admin) _admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _admin
}

export async function POST(request) {
  const auth = await requireRole(request, ['admin', 'agente'])
  if (auth.error) return auth.error
  let body; try { body = await request.json() } catch { body = {} }
  const factureId = body.facture_id
  if (!factureId) return NextResponse.json({ error: 'facture_id manquant' }, { status: 400 })

  const db = admin()
  const { data: facture } = await db.from('factures_artisans')
    .select('id, dossier_id, artisan_id, libelle, pdf_path').eq('id', factureId).maybeSingle()
  if (!facture) return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 })
  const { data: dossier } = await db.from('dossiers')
    .select('id, created_at, client_id, referente_id, statut').eq('id', facture.dossier_id).maybeSingle()
  if (!dossier) return NextResponse.json({ error: 'Dossier introuvable' }, { status: 404 })
  const { data: client } = await db.from('clients').select('nom').eq('id', dossier.client_id).maybeSingle()
  let artisanNom = 'artisan'
  if (facture.artisan_id) {
    const { data: a } = await db.from('artisans').select('entreprise').eq('id', facture.artisan_id).maybeSingle()
    artisanNom = a?.entreprise || 'artisan'
  }
  const ext = (facture.pdf_path?.split('.').pop() || 'pdf')
  const segments = [...chantierBaseSegments(dossier.statut, dossier.created_at, client?.nom), 'Documents artisans', artisanNom, 'Factures'].map(nettoyerSegment)

  const r = await pushMirror(db, {
    ownerUserId: dossier.referente_id,
    match: { facture_id: factureId }, onConflict: 'facture_id',
    indexFields: { dossier_id: dossier.id },
    filePath: facture.pdf_path,
    segments,
    fileName: `${nettoyerSegment(`${facture.libelle || 'Facture'} ${facture.id.slice(0, 8)}`)}.${ext}`,
    mime: mimeFromExt(ext),
  })
  if (r.error) return NextResponse.json({ error: r.error }, { status: r.status || 502 })
  return NextResponse.json(r)
}
