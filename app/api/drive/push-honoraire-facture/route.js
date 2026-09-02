// app/api/drive/push-honoraire-facture/route.js
// POST { honoraire_facture_id } — miroir OneDrive d'une facture d'honoraire (suivi
// financier) dans Autres/Factures honoraires/. Idempotent via doc_index.honoraire_facture_id.
// Sortant SEUL, non bloquant : si la référente n'a pas de Drive, la route saute proprement.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole, assertDossierAccessible } from '../../../lib/api-auth'
import { cheminChantier, nettoyerSegment, slugNom } from '../../../lib/drive/taxonomie'
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
  const hfId = body.honoraire_facture_id
  if (!hfId) return NextResponse.json({ error: 'honoraire_facture_id manquant' }, { status: 400 })

  const db = admin()
  const { data: hf } = await db.from('honoraires_factures')
    .select('id, dossier_id, cle, pdf_path, nom').eq('id', hfId).maybeSingle()
  if (!hf) return NextResponse.json({ error: 'Facture honoraire introuvable' }, { status: 404 })

  const acces = await assertDossierAccessible(hf.dossier_id, auth.profile)
  if (acces.error) return acces.error
  const { data: dossier } = await db.from('dossiers')
    .select('id, created_at, date_premier_rdv, client_id, referente_id, statut, date_fin_chantier, date_cloture').eq('id', hf.dossier_id).maybeSingle()
  if (!dossier) return NextResponse.json({ error: 'Dossier introuvable' }, { status: 404 })
  const { data: client } = await db.from('clients').select('*').eq('id', dossier.client_id).maybeSingle()

  const ext = (hf.pdf_path?.split('.').pop() || 'pdf')
  // « Facture_honoraires_<client>_<courtage|solde>.<ext> » : le suffixe distingue les 2 factures
  // honoraires (elles partagent le dossier « 1. Administratif » → nom déterministe unique requis).
  const clientSlug = slugNom(formatNomClient(client, { civilite: false }))
  const cleSlug = hf.cle === 'courtage' ? 'courtage' : 'solde'
  const dateFin = dossier.date_fin_chantier || dossier.date_cloture || null
  const suffixe = await suffixeCollisionDossier(db, dossier)
  const segments = cheminChantier(dossier.statut, dossier.date_premier_rdv || dossier.created_at, client?.nom, 'facture_honoraire', null, { dateFin, nom2: client?.nom2, suffixe })

  const r = await pushMirror(db, {
    ownerUserId: dossier.referente_id,
    match: { honoraire_facture_id: hfId }, onConflict: 'honoraire_facture_id',
    indexFields: { dossier_id: dossier.id },
    filePath: hf.pdf_path,
    segments,
    fileName: `${nettoyerSegment(`Facture_honoraires_${clientSlug}_${cleSlug}`)}.${ext}`,
    mime: mimeFromExt(ext),
  })
  if (r.error) return NextResponse.json({ error: r.error }, { status: r.status || 502 })
  return NextResponse.json(r)
}
