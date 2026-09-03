// app/api/drive/push-pv/route.js
// POST { devis_id } — miroir OneDrive du PV de réception d'un devis, rangé dans
// Documents artisans/<Artisan>/. Idempotent via doc_index.pv_devis_id (distinct de
// devis_id, réservé au PDF du devis lui-même).

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole, assertDossierAccessible } from '../../../lib/api-auth'
import { chantierBaseSegments, sousDossiers, nettoyerSegment, slugNom } from '../../../lib/drive/taxonomie'
import { suffixeCollisionDossier } from '../../../lib/drive/collisions'
import { formatNomClient } from '../../../lib/clients'
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
  const devisId = body.devis_id
  if (!devisId) return NextResponse.json({ error: 'devis_id manquant' }, { status: 400 })

  const db = admin()
  const { data: devis } = await db.from('devis_artisans')
    .select('id, dossier_id, artisan_id, pv_path').eq('id', devisId).maybeSingle()
  if (!devis) return NextResponse.json({ error: 'Devis introuvable' }, { status: 404 })

  const acces = await assertDossierAccessible(devis.dossier_id, auth.profile)
  if (acces.error) return acces.error
  const { data: dossier } = await db.from('dossiers')
    .select('id, created_at, date_premier_rdv, client_id, referente_id, statut, date_fin_chantier, date_cloture').eq('id', devis.dossier_id).maybeSingle()
  if (!dossier) return NextResponse.json({ error: 'Dossier introuvable' }, { status: 404 })
  const { data: client } = await db.from('clients').select('*').eq('id', dossier.client_id).maybeSingle()
  let artisanNom = 'artisan'
  if (devis.artisan_id) {
    const { data: a } = await db.from('artisans').select('entreprise').eq('id', devis.artisan_id).maybeSingle()
    artisanNom = a?.entreprise || 'artisan'
  }
  const ext = (devis.pv_path?.split('.').pop() || 'pdf')
  // Annee de classement : la CLOTURE d'abord (le clic), puis la fin de chantier (cf. taxonomie).
  const dateCloture = dossier.date_cloture || null
  const dateFin = dossier.date_fin_chantier || null
  const suffixe = await suffixeCollisionDossier(db, dossier)
  const segments = [...chantierBaseSegments(dossier.statut, dossier.date_premier_rdv || dossier.created_at, client?.nom, { dateCloture, dateFin, nom2: client?.nom2, suffixe }), ...sousDossiers('pv_reception', artisanNom)].map(nettoyerSegment)
  const clientSlug = slugNom(formatNomClient(client, { civilite: false }))
  const artisanSlug = slugNom(artisanNom)

  const r = await pushMirror(db, {
    ownerUserId: dossier.referente_id,
    match: { pv_devis_id: devis.id }, onConflict: 'pv_devis_id',
    indexFields: { dossier_id: dossier.id },
    filePath: devis.pv_path,
    segments,
    fileName: `${nettoyerSegment(`PV_reception_${clientSlug}_${artisanSlug}`)}.${ext}`,
    mime: mimeFromExt(ext),
  })
  if (r.error) return NextResponse.json({ error: r.error }, { status: r.status || 502 })
  return NextResponse.json(r)
}
