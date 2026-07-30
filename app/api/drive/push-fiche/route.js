// app/api/drive/push-fiche/route.js
// POST { fiche_id } — miroir OneDrive d'une fiche technique artisan (globale, hors chantier)
// dans Artisans/<Artisan>/Fiches techniques/. Idempotent via doc_index.fiche_id.
// Owner = l'uploadeur (auth) : une fiche artisan n'est pas rattachée à une référente précise.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole } from '../../../lib/api-auth'
import { cheminArtisanGlobal, nettoyerSegment } from '../../../lib/drive/taxonomie'
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
  let artisanNom = 'artisan'
  if (fiche.artisan_id) {
    const { data: a } = await db.from('artisans').select('entreprise').eq('id', fiche.artisan_id).maybeSingle()
    artisanNom = a?.entreprise || 'artisan'
  }
  const ext = (fiche.url?.split('.').pop() || 'pdf')
  const segments = cheminArtisanGlobal(artisanNom, 'Fiches techniques')

  const r = await pushMirror(db, {
    ownerUserId: auth.profile?.id,
    match: { fiche_id: ficheId }, onConflict: 'fiche_id',
    indexFields: { artisan_id: fiche.artisan_id || null },
    filePath: fiche.url,
    segments,
    fileName: `${nettoyerSegment(fiche.nom || 'Fiche technique')}.${ext}`,
    mime: mimeFromExt(ext),
  })
  if (r.error) return NextResponse.json({ error: r.error }, { status: r.status || 502 })
  return NextResponse.json(r)
}
