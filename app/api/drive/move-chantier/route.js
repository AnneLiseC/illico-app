// app/api/drive/move-chantier/route.js
// POST { dossier_id } — DÉPLACE le dossier chantier entre buckets de statut quand le statut
// change (1. En cours ↔ 2. Terminés/<année> ↔ 3. Sans suite). Appelé (best effort) après une
// bascule de statut.
//
// Le statut Batilis fait FOI : on relit dossier.statut → bucket cible, on localise le dossier
// chantier « AAAA-MM-JJ NOM » sous 01_CLIENTS/<n'importe quel bucket>[/<année>]/ et on le déplace
// vers le bucket cible. item_ids inchangés par le move (les copies Drive restent connues de
// doc_index) ; on réécrit juste le préfixe logique des chemins (cosmétique). Provider-agnostique.
//
// Rien à déplacer (jamais poussé, ou déjà au bon endroit) → skip silencieux. Les dossiers poussés
// AVANT cette arbo (sans 01_CLIENTS/<bucket>/) ne sont pas retrouvés → ils restent en place.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole } from '../../../lib/api-auth'
import { driveModule, loadDriveCompte } from '../../../lib/drive/dispatch'
import { RACINE_CLIENTS, bucketSegments, nomDossierChantier, nettoyerSegment } from '../../../lib/drive/taxonomie'

const BUCKETS = ['1. En cours', '2. Terminés', '3. Sans suite']

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
    .select('id, created_at, client_id, referente_id, statut, date_fin_chantier, date_cloture').eq('id', dossierId).maybeSingle()
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
  const folderName = nettoyerSegment(nomDossierChantier(dossier.created_at, client?.nom))
  // Segments cibles depuis la racine 01_CLIENTS (ex. ['1. En cours'] ou ['2. Terminés','2026']).
  const dateFin = dossier.date_fin_chantier || dossier.date_cloture || null
  const targetBucketSegs = bucketSegments(dossier.statut, { dateFin, createdAt: dossier.created_at }).map(nettoyerSegment)
  const targetPathSegs = targetBucketSegs.join('/')

  try {
    // 1. Localise « 01_CLIENTS » sous la racine. Absent → rien n'a jamais été poussé.
    const racineEnfants = await mod.listFolders(token, compte.drive_root_drive_id, compte.drive_root_id)
    const clients = racineEnfants.find(f => f.name === RACINE_CLIENTS)
    if (!clients) return NextResponse.json({ skipped: true, reason: 'no_clients_folder' })

    // 2. Cherche le dossier chantier dans chaque bucket (Terminés = 1 niveau plus profond, par année).
    const topBuckets = (await mod.listFolders(token, clients.driveId, clients.itemId))
      .filter(b => BUCKETS.includes(b.name))
    let found = null
    for (const b of topBuckets) {
      const kids = await mod.listFolders(token, b.driveId, b.itemId)
      const ch = kids.find(k => k.name === folderName)
      if (ch) { found = { segs: [b.name], parentItemId: b.itemId, itemId: ch.itemId }; break }
      // '2. Terminés' → parcourt les sous-dossiers d'année.
      if (b.name === '2. Terminés') {
        for (const y of kids) {
          const gkids = await mod.listFolders(token, y.driveId, y.itemId)
          const gch = gkids.find(k => k.name === folderName)
          if (gch) { found = { segs: [b.name, y.name], parentItemId: y.itemId, itemId: gch.itemId }; break }
        }
        if (found) break
      }
    }
    if (!found) return NextResponse.json({ skipped: true, reason: 'not_pushed' })
    if (found.segs.join('/') === targetPathSegs) return NextResponse.json({ ok: true, already: true })

    // 3. Assure le dossier cible (bucket + éventuelle année) et déplace le dossier chantier.
    const targetParentId = await mod.ensureFolderPath(token, compte.drive_root_drive_id, compte.drive_root_id, [RACINE_CLIENTS, ...targetBucketSegs])
    await mod.moveItem(token, compte.drive_root_drive_id, found.itemId, targetParentId, found.parentItemId)

    // 4. Réécrit le préfixe logique des chemins doc_index (item_ids inchangés).
    const oldPrefix = `${RACINE_CLIENTS}/${found.segs.join('/')}/${folderName}/`
    const newPrefix = `${RACINE_CLIENTS}/${targetPathSegs}/${folderName}/`
    const { data: rows } = await db.from('doc_index').select('id, path').eq('dossier_id', dossierId)
    for (const row of (rows || [])) {
      if (row.path && row.path.startsWith(oldPrefix)) {
        await db.from('doc_index')
          .update({ path: newPrefix + row.path.slice(oldPrefix.length), updated_at: new Date().toISOString() })
          .eq('id', row.id)
      }
    }

    return NextResponse.json({ ok: true, moved: true, from: found.segs.join('/'), to: targetPathSegs })
  } catch (e) {
    console.error('[drive/move-chantier] move', e)
    return NextResponse.json({ error: 'Déplacement Drive échoué' }, { status: 502 })
  }
}
