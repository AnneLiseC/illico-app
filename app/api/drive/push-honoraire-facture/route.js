// app/api/drive/push-honoraire-facture/route.js
// POST { honoraire_facture_id } — miroir OneDrive d'une facture d'honoraire (suivi
// financier) dans Autres/Factures honoraires/. Idempotent via doc_index.honoraire_facture_id.
// Sortant SEUL, non bloquant : si la référente n'a pas de Drive, la route saute proprement.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole } from '../../../lib/api-auth'
import { cheminChantier, nettoyerSegment } from '../../../lib/drive/taxonomie'
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
  const hfId = body.honoraire_facture_id
  if (!hfId) return NextResponse.json({ error: 'honoraire_facture_id manquant' }, { status: 400 })

  const db = admin()
  const { data: hf } = await db.from('honoraires_factures')
    .select('id, dossier_id, cle, pdf_path, nom').eq('id', hfId).maybeSingle()
  if (!hf) return NextResponse.json({ error: 'Facture honoraire introuvable' }, { status: 404 })
  const { data: dossier } = await db.from('dossiers')
    .select('id, created_at, client_id, referente_id, statut').eq('id', hf.dossier_id).maybeSingle()
  if (!dossier) return NextResponse.json({ error: 'Dossier introuvable' }, { status: 404 })
  const { data: client } = await db.from('clients').select('nom').eq('id', dossier.client_id).maybeSingle()

  const ext = (hf.pdf_path?.split('.').pop() || 'pdf')
  const base = (hf.nom || (hf.cle === 'courtage' ? 'Facture honoraire courtage' : 'Facture solde AMO')).replace(/\.[^.]+$/, '')
  const segments = cheminChantier(dossier.statut, dossier.created_at, client?.nom, 'facture_honoraire', null)

  const r = await pushMirror(db, {
    ownerUserId: dossier.referente_id,
    match: { honoraire_facture_id: hfId }, onConflict: 'honoraire_facture_id',
    indexFields: { dossier_id: dossier.id },
    filePath: hf.pdf_path,
    segments,
    fileName: `${nettoyerSegment(base)}.${ext}`,
    mime: mimeFromExt(ext),
  })
  if (r.error) return NextResponse.json({ error: r.error }, { status: r.status || 502 })
  return NextResponse.json(r)
}
