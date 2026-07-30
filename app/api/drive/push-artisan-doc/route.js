// app/api/drive/push-artisan-doc/route.js
// POST { artisan_id, type } — miroir OneDrive d'un document administratif artisan (KBIS,
// décennale, qualification, RIB) dans Artisans/<Artisan>/Documents administratif/.
// Idempotent via doc_index (artisan_id, artisan_doc_type). Owner = l'uploadeur (auth).

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole } from '../../../lib/api-auth'
import { cheminArtisanGlobal, nettoyerSegment } from '../../../lib/drive/taxonomie'
import { pushMirror, mimeFromExt } from '../../../lib/drive/mirror'

const TYPES = {
  kbis: { champ: 'kbis_url', label: 'Kbis' },
  decennale: { champ: 'decennale_url', label: 'Décennale' },
  qualification: { champ: 'qualification_url', label: 'Qualification' },
  rib: { champ: 'rib_url', label: 'RIB' },
}

let _admin
function admin() {
  if (!_admin) _admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _admin
}

export async function POST(request) {
  const auth = await requireRole(request, ['admin', 'agente'])
  if (auth.error) return auth.error
  let body; try { body = await request.json() } catch { body = {} }
  const artisanId = body.artisan_id
  const type = body.type
  if (!artisanId || !TYPES[type]) return NextResponse.json({ error: 'artisan_id / type invalide' }, { status: 400 })

  const db = admin()
  const { data: artisan } = await db.from('artisans')
    .select('id, entreprise, kbis_url, decennale_url, qualification_url, rib_url').eq('id', artisanId).maybeSingle()
  if (!artisan) return NextResponse.json({ error: 'Artisan introuvable' }, { status: 404 })
  const filePath = artisan[TYPES[type].champ]
  const ext = (filePath?.split('.').pop() || 'pdf')
  const segments = cheminArtisanGlobal(artisan.entreprise, 'Documents administratif')

  const r = await pushMirror(db, {
    ownerUserId: auth.profile?.id,
    match: { artisan_id: artisanId, artisan_doc_type: type }, onConflict: 'artisan_id,artisan_doc_type',
    filePath,
    segments,
    fileName: `${nettoyerSegment(TYPES[type].label)}.${ext}`,
    mime: mimeFromExt(ext),
  })
  if (r.error) return NextResponse.json({ error: r.error }, { status: r.status || 502 })
  return NextResponse.json(r)
}
