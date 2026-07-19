// app/api/drive/push/route.js
// POST { document_id } — pousse un document de chantier (chantier_documents) dans le
// OneDrive de la RÉFÉRENTE du dossier, rangé dans la bonne arborescence, et enregistre
// l'item_id dans doc_index (invariant n°1 : item_id connu AVANT tout poll).
//
// Sortant SEUL (Lot 2a-2). Si la référente n'a pas de Drive/racine → on saute
// silencieusement (l'app marche sans Drive). Le fichier reste dans Supabase Storage
// (magasin maître des fichiers nés dans l'app) ; OneDrive en reçoit une COPIE.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole } from '../../../lib/api-auth'
import { getValidAccessToken, ensureFolderPath, uploadSmallFile } from '../../../lib/drive/microsoft'
import { cheminSegments } from '../../../lib/drive/taxonomie'

let _admin
function admin() {
  if (!_admin) _admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _admin
}

export async function POST(request) {
  const auth = await requireRole(request, ['admin', 'agente'])
  if (auth.error) return auth.error

  let body
  try { body = await request.json() } catch { body = {} }
  const documentId = body.document_id
  if (!documentId) return NextResponse.json({ error: 'document_id manquant' }, { status: 400 })

  const db = admin()

  // Déjà indexé → on ne re-pousse pas (évite les doublons).
  const { data: deja } = await db.from('doc_index').select('id').eq('document_id', documentId).maybeSingle()
  if (deja) return NextResponse.json({ ok: true, already: true })

  // Document + dossier + client + artisan éventuel.
  const { data: doc } = await db.from('chantier_documents')
    .select('id, dossier_id, path, nom, categorie, artisan_id, type_mime')
    .eq('id', documentId).maybeSingle()
  if (!doc) return NextResponse.json({ error: 'Document introuvable' }, { status: 404 })

  const { data: dossier } = await db.from('dossiers')
    .select('id, created_at, client_id, referente_id').eq('id', doc.dossier_id).maybeSingle()
  if (!dossier) return NextResponse.json({ error: 'Dossier introuvable' }, { status: 404 })

  // Drive de la RÉFÉRENTE (routage du miroir). Pas de référente / pas de Drive / pas de
  // racine → on saute proprement.
  if (!dossier.referente_id) return NextResponse.json({ skipped: true, reason: 'no_referente' })
  const { data: compte } = await db.from('comptes_oauth')
    .select('id, access_token, refresh_token, expiry_date, drive_root_drive_id, drive_root_id')
    .eq('user_id', dossier.referente_id).eq('fournisseur', 'microsoft').maybeSingle()
  if (!compte || !compte.drive_root_drive_id || !compte.drive_root_id) {
    return NextResponse.json({ skipped: true, reason: 'no_root' })
  }

  let token
  try {
    token = await getValidAccessToken(compte)
  } catch (e) {
    if (e.reconnect) return NextResponse.json({ skipped: true, reason: 'reconnect' })
    console.error('[drive/push] token', e)
    return NextResponse.json({ error: 'Erreur OneDrive' }, { status: 500 })
  }

  const [{ data: client }, artisanRes] = await Promise.all([
    db.from('clients').select('nom').eq('id', dossier.client_id).maybeSingle(),
    doc.artisan_id
      ? db.from('artisans').select('entreprise').eq('id', doc.artisan_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const artisanNom = artisanRes?.data?.entreprise || null

  const segments = cheminSegments(dossier.created_at, client?.nom, doc.categorie, artisanNom)

  try {
    // Télécharge les octets depuis Supabase Storage (magasin maître).
    const { data: blob, error: dlErr } = await db.storage.from('documents').download(doc.path)
    if (dlErr || !blob) {
      console.error('[drive/push] download', dlErr?.message)
      return NextResponse.json({ error: 'Fichier source introuvable' }, { status: 404 })
    }
    const buffer = Buffer.from(await blob.arrayBuffer())

    // Arbo + upload dans le Drive de la référente.
    const leafId = await ensureFolderPath(token, compte.drive_root_drive_id, compte.drive_root_id, segments)
    const up = await uploadSmallFile(token, compte.drive_root_drive_id, leafId, doc.nom, buffer, doc.type_mime)

    // Index : item_id enregistré AVANT tout poller (invariant n°1).
    const cheminLogique = [...segments, up.name].join('/')
    await db.from('doc_index').upsert({
      document_id: doc.id,
      dossier_id: dossier.id,
      user_id: dossier.referente_id,
      origine: 'app',
      drive_id: compte.drive_root_drive_id,
      item_id: up.id,
      path: cheminLogique,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'document_id' })

    return NextResponse.json({ ok: true, path: cheminLogique })
  } catch (e) {
    console.error('[drive/push] graph', e)
    return NextResponse.json({ error: 'Push OneDrive échoué' }, { status: 502 })
  }
}
