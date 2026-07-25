// app/api/drive/move-chantier/route.js
// POST { dossier_id } — DÉPLACE le dossier chantier entre buckets de statut quand le statut
// change (En cours ↔ Terminés ↔ Annulés). Appelé (best effort) après une bascule de statut.
//
// Le statut Batilis fait FOI : on relit dossier.statut → bucket cible, on localise le dossier
// chantier « AAAA.MM.JJ NOM » sous Clients/<n'importe quel bucket>/ et on le déplace vers le
// bucket cible. item_ids inchangés par le move (les copies Drive restent connues de doc_index) ;
// on réécrit juste le préfixe logique des chemins (cosmétique). Provider-agnostique (dispatch).
//
// Rien à déplacer (jamais poussé, ou déjà dans le bon bucket) → skip silencieux. Les dossiers
// poussés AVANT cette arbo (sans Clients/<bucket>/) ne sont pas retrouvés → ils restent en place.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole } from '../../../lib/api-auth'
import { driveModule, loadDriveCompte } from '../../../lib/drive/dispatch'
import { bucketStatut, nomDossierChantier, nettoyerSegment } from '../../../lib/drive/taxonomie'

const BUCKETS = ['En cours', 'Terminés', 'Annulés']

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
  const dossierId = body.dossier_id
  if (!dossierId) return NextResponse.json({ error: 'dossier_id requis' }, { status: 400 })

  const db = admin()

  const { data: dossier } = await db.from('dossiers')
    .select('id, created_at, client_id, referente_id, statut').eq('id', dossierId).maybeSingle()
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
    console.error('[drive/move-chantier] token', e)
    return NextResponse.json({ error: 'Erreur Drive' }, { status: 500 })
  }

  const { data: client } = await db.from('clients').select('nom').eq('id', dossier.client_id).maybeSingle()
  const targetBucket = bucketStatut(dossier.statut)
  const folderName = nettoyerSegment(nomDossierChantier(dossier.created_at, client?.nom))

  try {
    // 1. Localise « Clients » sous la racine. Absent → rien n'a jamais été poussé.
    const racineEnfants = await mod.listFolders(token, compte.drive_root_drive_id, compte.drive_root_id)
    const clients = racineEnfants.find(f => f.name === 'Clients')
    if (!clients) return NextResponse.json({ skipped: true, reason: 'no_clients_folder' })

    // 2. Cherche le dossier chantier dans chaque bucket existant.
    const bucketEntries = (await mod.listFolders(token, clients.driveId, clients.itemId))
      .filter(b => BUCKETS.includes(b.name))
    let found = null
    for (const b of bucketEntries) {
      const kids = await mod.listFolders(token, b.driveId, b.itemId)
      const ch = kids.find(k => k.name === folderName)
      if (ch) { found = { bucketName: b.name, bucketItemId: b.itemId, itemId: ch.itemId, driveId: ch.driveId }; break }
    }
    if (!found) return NextResponse.json({ skipped: true, reason: 'not_pushed' })
    if (found.bucketName === targetBucket) return NextResponse.json({ ok: true, already: true })

    // 3. Assure le bucket cible et déplace le dossier chantier.
    const targetBucketId = await mod.ensureChildFolder(token, clients.driveId, clients.itemId, targetBucket)
    await mod.moveItem(token, compte.drive_root_drive_id, found.itemId, targetBucketId, found.bucketItemId)

    // 4. Réécrit le préfixe logique des chemins doc_index (item_ids inchangés).
    const oldPrefix = `Clients/${found.bucketName}/${folderName}/`
    const newPrefix = `Clients/${targetBucket}/${folderName}/`
    const { data: rows } = await db.from('doc_index').select('id, path').eq('dossier_id', dossierId)
    for (const row of (rows || [])) {
      if (row.path && row.path.startsWith(oldPrefix)) {
        await db.from('doc_index')
          .update({ path: newPrefix + row.path.slice(oldPrefix.length), updated_at: new Date().toISOString() })
          .eq('id', row.id)
      }
    }

    return NextResponse.json({ ok: true, moved: true, from: found.bucketName, to: targetBucket })
  } catch (e) {
    console.error('[drive/move-chantier] move', e)
    return NextResponse.json({ error: 'Déplacement Drive échoué' }, { status: 502 })
  }
}
