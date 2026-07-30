// app/api/drive/push/route.js
// POST { document_id } | { photo_id } — pousse un fichier Batilis dans le OneDrive de la
// RÉFÉRENTE du dossier, rangé dans la bonne arborescence, et enregistre l'item_id dans
// doc_index (invariant n°1 : item_id connu AVANT tout poll).
//
//   - document (chantier_documents) → sous-dossier selon la catégorie (Comptes rendus,
//     Documents artisans/<Artisan>, Autres).
//   - photo (photos, type_media='photo') → « Photos & vidéos/ ». Les VIDÉOS sont ignorées
//     ici (master OneDrive + upload résumable = lot suivant).
//
// Sortant SEUL. Pas de Drive/racine/refresh de la référente → on saute proprement (l'app
// marche sans Drive). Fichier maître = Supabase Storage ; OneDrive reçoit une COPIE.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole } from '../../../lib/api-auth'
import { driveModule, loadDriveCompte } from '../../../lib/drive/dispatch'
import { cheminChantier, cheminChantierPhoto } from '../../../lib/drive/taxonomie'

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
  const db = admin()

  // ── Résout la source (document ou photo) en un descripteur commun ──
  let src
  if (body.document_id) {
    const { data: idx } = await db.from('doc_index').select('id').eq('document_id', body.document_id).maybeSingle()
    if (idx) return NextResponse.json({ ok: true, already: true })
    const { data: doc } = await db.from('chantier_documents')
      .select('id, dossier_id, path, nom, categorie, artisan_id, type_mime').eq('id', body.document_id).maybeSingle()
    if (!doc) return NextResponse.json({ error: 'Document introuvable' }, { status: 404 })
    src = { kind: 'document', indexCol: 'document_id', indexVal: doc.id, dossierId: doc.dossier_id,
      bucket: 'documents', storagePath: doc.path, fileName: doc.nom, mime: doc.type_mime,
      categorie: doc.categorie, artisanId: doc.artisan_id }
  } else if (body.photo_id) {
    const { data: idx } = await db.from('doc_index').select('id').eq('photo_id', body.photo_id).maybeSingle()
    if (idx) return NextResponse.json({ ok: true, already: true })
    const { data: ph } = await db.from('photos')
      .select('id, dossier_id, url, type_media, categorie').eq('id', body.photo_id).maybeSingle()
    if (!ph) return NextResponse.json({ error: 'Photo introuvable' }, { status: 404 })
    if (ph.type_media === 'video') return NextResponse.json({ skipped: true, reason: 'video_later' })
    src = { kind: 'photo', indexCol: 'photo_id', indexVal: ph.id, dossierId: ph.dossier_id,
      bucket: 'photos', storagePath: ph.url, fileName: (ph.url || '').split('/').pop() || `${ph.id}.jpg`,
      mime: null, categorie: ph.categorie || null, artisanId: null }
  } else {
    return NextResponse.json({ error: 'document_id ou photo_id requis' }, { status: 400 })
  }

  // ── Dossier + référente + son Drive ──
  const { data: dossier } = await db.from('dossiers')
    .select('id, created_at, client_id, referente_id, statut').eq('id', src.dossierId).maybeSingle()
  if (!dossier) return NextResponse.json({ error: 'Dossier introuvable' }, { status: 404 })
  if (!dossier.referente_id) return NextResponse.json({ skipped: true, reason: 'no_referente' })

  const compte = await loadDriveCompte(db, dossier.referente_id)
  if (!compte || !compte.drive_root_drive_id || !compte.drive_root_id) {
    return NextResponse.json({ skipped: true, reason: 'no_root' })
  }
  const mod = driveModule(compte.fournisseur)
  if (!mod) return NextResponse.json({ skipped: true, reason: 'fournisseur' })

  let token
  try {
    token = await mod.getValidAccessToken(compte)
  } catch (e) {
    if (e.reconnect) return NextResponse.json({ skipped: true, reason: 'reconnect' })
    console.error('[drive/push] token', e)
    return NextResponse.json({ error: 'Erreur Drive' }, { status: 500 })
  }

  // ── Chemin cible (avec bucket de statut) ──
  const { data: client } = await db.from('clients').select('nom').eq('id', dossier.client_id).maybeSingle()
  let segments
  if (src.kind === 'photo') {
    segments = cheminChantierPhoto(dossier.statut, dossier.created_at, client?.nom, src.categorie)
  } else {
    let artisanNom = null
    if (src.artisanId) {
      const { data: a } = await db.from('artisans').select('entreprise').eq('id', src.artisanId).maybeSingle()
      artisanNom = a?.entreprise || null
    }
    segments = cheminChantier(dossier.statut, dossier.created_at, client?.nom, src.categorie, artisanNom)
  }

  try {
    const { data: blob, error: dlErr } = await db.storage.from(src.bucket).download(src.storagePath)
    if (dlErr || !blob) {
      console.error('[drive/push] download', dlErr?.message)
      return NextResponse.json({ error: 'Fichier source introuvable' }, { status: 404 })
    }
    const buffer = Buffer.from(await blob.arrayBuffer())

    // Move-aware : si déjà miroité (la catégorie/statut a pu changer → dossier cible
    // différent), on retire l'ancien item avant de reposer → le fichier se DÉPLACE au
    // lieu de se dupliquer (même patron que push-devis).
    const { data: existing } = await db.from('doc_index').select('id, drive_id, item_id').eq(src.indexCol, src.indexVal).maybeSingle()
    if (existing) { try { await mod.deleteItem(token, existing.drive_id, existing.item_id) } catch { /* best effort */ } }

    const leafId = await mod.ensureFolderPath(token, compte.drive_root_drive_id, compte.drive_root_id, segments)
    const up = await mod.uploadSmallFile(token, compte.drive_root_drive_id, leafId, src.fileName, buffer, src.mime, 'replace')

    const cheminLogique = [...segments, up.name].join('/')
    await db.from('doc_index').upsert({
      [src.indexCol]: src.indexVal,
      dossier_id: dossier.id,
      user_id: dossier.referente_id,
      origine: 'app',
      drive_id: compte.drive_root_drive_id,
      item_id: up.id,
      path: cheminLogique,
      updated_at: new Date().toISOString(),
    }, { onConflict: src.indexCol })

    return NextResponse.json({ ok: true, path: cheminLogique })
  } catch (e) {
    console.error('[drive/push] graph', e)
    return NextResponse.json({ error: 'Push OneDrive échoué' }, { status: 502 })
  }
}
