// app/api/drive/push-devis/route.js
// POST { devis_id } — pousse le PDF d'un devis dans le OneDrive de la référente, rangé
// selon son STATUT : recu → Devis/Reçus, accepte → Devis/Signés, refuse → Devis/Refusés.
// MOVE-AWARE : à chaque appel on relit le statut ; si le devis était déjà miroité, on
// supprime l'ancien item avant de reposer le fichier → il « se déplace » de dossier quand
// le statut change (footgun tranché : le statut Coordibat fait foi, jamais le glisser-déposer).
//
// Sortant SEUL (partie sûre du financier ; le RETOUR des devis reste pour plus tard).

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole } from '../../../lib/api-auth'
import { getValidAccessToken, ensureFolderPath, uploadSmallFile, deleteItem } from '../../../lib/drive/microsoft'
import { nomDossierChantier, nettoyerSegment } from '../../../lib/drive/taxonomie'

const SOUS_DOSSIER = { accepte: 'Signés', refuse: 'Refusés', recu: 'Reçus' }

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
  const devisId = body.devis_id
  if (!devisId) return NextResponse.json({ error: 'devis_id manquant' }, { status: 400 })

  const db = admin()

  const { data: devis } = await db.from('devis_artisans')
    .select('id, dossier_id, artisan_id, statut, devis_pdf_path, devis_signe_path').eq('id', devisId).maybeSingle()
  if (!devis) return NextResponse.json({ error: 'Devis introuvable' }, { status: 404 })

  const statut = devis.statut || 'recu'
  const sousDossier = SOUS_DOSSIER[statut] || 'Reçus'
  // Signé → on privilégie le PDF signé ; sinon le devis reçu.
  const filePath = statut === 'accepte' ? (devis.devis_signe_path || devis.devis_pdf_path) : devis.devis_pdf_path

  const { data: existing } = await db.from('doc_index').select('id, drive_id, item_id').eq('devis_id', devisId).maybeSingle()

  // Dossier + référente + Drive
  const { data: dossier } = await db.from('dossiers')
    .select('id, created_at, client_id, referente_id').eq('id', devis.dossier_id).maybeSingle()
  if (!dossier?.referente_id) return NextResponse.json({ skipped: true, reason: 'no_referente' })

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
    console.error('[drive/push-devis] token', e)
    return NextResponse.json({ error: 'Erreur OneDrive' }, { status: 500 })
  }

  // Pas (ou plus) de fichier → on retire la copie Drive si elle existait.
  if (!filePath) {
    if (existing) {
      try { await deleteItem(token, existing.drive_id, existing.item_id) } catch { /* best effort */ }
      await db.from('doc_index').delete().eq('id', existing.id)
      return NextResponse.json({ ok: true, removed: true })
    }
    return NextResponse.json({ ok: true, nothing: true })
  }

  try {
    const { data: client } = await db.from('clients').select('nom').eq('id', dossier.client_id).maybeSingle()
    let artisanNom = 'artisan'
    if (devis.artisan_id) {
      const { data: a } = await db.from('artisans').select('entreprise').eq('id', devis.artisan_id).maybeSingle()
      artisanNom = a?.entreprise || 'artisan'
    }
    const fileName = `${nettoyerSegment(`Devis ${artisanNom} ${devis.id.slice(0, 8)}`)}.pdf`
    const segments = [nomDossierChantier(dossier.created_at, client?.nom), 'Devis', sousDossier].map(nettoyerSegment)

    // Déjà miroité → on supprime l'ancien item (le statut/dossier a pu changer) avant de reposer.
    if (existing) { try { await deleteItem(token, existing.drive_id, existing.item_id) } catch { /* best effort */ } }

    const { data: blob, error: dlErr } = await db.storage.from('documents').download(filePath)
    if (dlErr || !blob) {
      console.error('[drive/push-devis] download', dlErr?.message)
      return NextResponse.json({ error: 'PDF du devis introuvable' }, { status: 404 })
    }
    const buffer = Buffer.from(await blob.arrayBuffer())
    const leafId = await ensureFolderPath(token, compte.drive_root_drive_id, compte.drive_root_id, segments)
    const up = await uploadSmallFile(token, compte.drive_root_drive_id, leafId, fileName, buffer, 'application/pdf', 'replace')

    const cheminLogique = [...segments, up.name].join('/')
    await db.from('doc_index').upsert({
      devis_id: devisId,
      dossier_id: dossier.id,
      user_id: dossier.referente_id,
      origine: 'app',
      drive_id: compte.drive_root_drive_id,
      item_id: up.id,
      path: cheminLogique,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'devis_id' })

    return NextResponse.json({ ok: true, path: cheminLogique })
  } catch (e) {
    console.error('[drive/push-devis] graph', e)
    return NextResponse.json({ error: 'Push devis échoué' }, { status: 502 })
  }
}
