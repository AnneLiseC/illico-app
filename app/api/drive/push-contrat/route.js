// app/api/drive/push-contrat/route.js
// POST { dossier_id } — miroir OneDrive du contrat signé (mandat) d'un chantier, rangé
// dans Autres/Administratif/. Idempotent via doc_index.contrat_dossier_id.

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
  const dossierId = body.dossier_id
  if (!dossierId) return NextResponse.json({ error: 'dossier_id manquant' }, { status: 400 })

  const acces = await assertDossierAccessible(dossierId, auth.profile)
  if (acces.error) return acces.error

  const db = admin()
  const { data: dossier } = await db.from('dossiers')
    .select('id, created_at, date_premier_rdv, client_id, referente_id, statut, contrat_url, date_fin_chantier, date_cloture').eq('id', dossierId).maybeSingle()
  if (!dossier) return NextResponse.json({ error: 'Dossier introuvable' }, { status: 404 })
  const { data: client } = await db.from('clients').select('*').eq('id', dossier.client_id).maybeSingle()
  const ext = (dossier.contrat_url?.split('.').pop() || 'pdf')
  const clientSlug = slugNom(formatNomClient(client, { civilite: false }))
  // Annee de classement : la CLOTURE d'abord (le clic), puis la fin de chantier (cf. taxonomie).
  const dateCloture = dossier.date_cloture || null
  const dateFin = dossier.date_fin_chantier || null
  const suffixe = await suffixeCollisionDossier(db, dossier)
  const segments = [...chantierBaseSegments(dossier.statut, dossier.date_premier_rdv || dossier.created_at, client?.nom, { dateCloture, dateFin, nom2: client?.nom2, suffixe }), ...sousDossiers('administratif')].map(nettoyerSegment)

  const r = await pushMirror(db, {
    ownerUserId: dossier.referente_id,
    match: { contrat_dossier_id: dossier.id }, onConflict: 'contrat_dossier_id',
    indexFields: { dossier_id: dossier.id },
    filePath: dossier.contrat_url,
    segments,
    fileName: `${nettoyerSegment(`Contrat_${clientSlug}`)}.${ext}`,
    mime: mimeFromExt(ext),
  })
  if (r.error) return NextResponse.json({ error: r.error }, { status: r.status || 502 })
  return NextResponse.json(r)
}
