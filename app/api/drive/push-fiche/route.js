// app/api/drive/push-fiche/route.js
// POST { fiche_id, dossier_id? } — miroir OneDrive d'une fiche technique artisan.
//   1. TOUJOURS dans 02_ARTISANS/<Artisan>/Fiches techniques/ (catalogue complet de l'artisan).
//      Idempotent via doc_index.fiche_id. Owner = l'uploadeur (auth).
//   2. Si dossier_id fourni (fiche créée DEPUIS un chantier → liée à ce chantier), copie AUSSI
//      dans 01_CLIENTS/<bucket>/AAAA-MM-JJ NOM/5. Plans & techniques/. Copie « best effort »
//      NON indexée (skipIndex) : nom déterministe + 'replace' évitent les doublons.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole, assertDossierAccessible } from '../../../lib/api-auth'
import { cheminArtisanGlobal, cheminChantier, nettoyerSegment } from '../../../lib/drive/taxonomie'
import { suffixeCollisionDossier } from '../../../lib/drive/collisions'
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
  const ficheId = body.fiche_id
  if (!ficheId) return NextResponse.json({ error: 'fiche_id manquant' }, { status: 400 })

  const db = admin()
  const { data: fiche } = await db.from('fiches_techniques')
    .select('id, artisan_id, nom, url').eq('id', ficheId).maybeSingle()
  if (!fiche) return NextResponse.json({ error: 'Fiche introuvable' }, { status: 404 })

  // Cloisonnement tenant : la fiche doit appartenir à un artisan de la société de l'appelant
  // (artisans société-wide). Sans artisan rattaché → refus.
  {
    const { data: art } = fiche.artisan_id
      ? await db.from('artisans').select('societe_id').eq('id', fiche.artisan_id).maybeSingle()
      : { data: null }
    if (!art || art.societe_id !== auth.profile?.societe_id) return NextResponse.json({ error: 'Fiche introuvable' }, { status: 404 })
  }
  // Copie chantier : si un dossier est fourni, il doit lui aussi être accessible à l'appelant.
  if (body.dossier_id) {
    const acces = await assertDossierAccessible(body.dossier_id, auth.profile)
    if (acces.error) return acces.error
  }
  let artisanNom = 'artisan'
  if (fiche.artisan_id) {
    const { data: a } = await db.from('artisans').select('entreprise').eq('id', fiche.artisan_id).maybeSingle()
    artisanNom = a?.entreprise || 'artisan'
  }
  const ext = (fiche.url?.split('.').pop() || 'pdf')
  const segments = cheminArtisanGlobal(artisanNom, 'Fiches techniques')

  const fileName = `${nettoyerSegment(fiche.nom || 'Fiche technique')}.${ext}`

  // 1. Catalogue artisan (indexé).
  const r = await pushMirror(db, {
    ownerUserId: auth.profile?.id,
    match: { fiche_id: ficheId }, onConflict: 'fiche_id',
    indexFields: { artisan_id: fiche.artisan_id || null },
    filePath: fiche.url,
    segments,
    fileName,
    mime: mimeFromExt(ext),
  })
  if (r.error) return NextResponse.json({ error: r.error }, { status: r.status || 502 })

  // 2. Copie client si la fiche est liée à un chantier (best effort, non indexée).
  let clientCopy = null
  if (body.dossier_id && fiche.url) {
    const { data: dossier } = await db.from('dossiers')
      .select('id, created_at, date_premier_rdv, client_id, referente_id, statut, date_fin_chantier, date_cloture').eq('id', body.dossier_id).maybeSingle()
    if (dossier?.referente_id) {
      const { data: client } = await db.from('clients').select('nom, nom2').eq('id', dossier.client_id).maybeSingle()
      const dateFin = dossier.date_fin_chantier || dossier.date_cloture || null
      const suffixe = await suffixeCollisionDossier(db, dossier)
      const cSeg = cheminChantier(dossier.statut, dossier.date_premier_rdv || dossier.created_at, client?.nom, 'fiche_technique', null, { dateFin, nom2: client?.nom2, suffixe })
      try {
        const cr = await pushMirror(db, {
          ownerUserId: dossier.referente_id,
          skipIndex: true,
          filePath: fiche.url,
          segments: cSeg,
          fileName,
          mime: mimeFromExt(ext),
        })
        clientCopy = cr.path || cr.reason || null
      } catch { /* best effort : la copie client n'empêche jamais le catalogue */ }
    }
  }

  return NextResponse.json({ ...r, clientCopy })
}
