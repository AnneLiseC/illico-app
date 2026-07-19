// app/api/drive/folders/route.js
// Navigateur de dossiers OneDrive (drive-aware).
//   GET  (top)    : ?  → « Mes fichiers » (source 'perso') + « Partagés » (source 'partage').
//   GET  (browse) : ?drive_id=&item_id= → dossiers enfants de cet item.
//   POST          : fixe la racine — dossier existant {drive_id,item_id,name} OU
//                   création {create_name, parent_drive_id, parent_item_id}.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole } from '../../../lib/api-auth'
import { getValidAccessToken, getMyDriveId, listFolders, listSharedFolders, createFolder } from '../../../lib/drive/microsoft'

let _admin
function admin() {
  if (!_admin) _admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _admin
}

async function loadCompte(userId) {
  const { data } = await admin().from('comptes_oauth')
    .select('id, access_token, refresh_token, expiry_date, drive_root_drive_id, drive_root_id, drive_root_path')
    .eq('user_id', userId).eq('fournisseur', 'microsoft').maybeSingle()
  return data || null
}

function rootOf(compte) {
  return {
    drive_id: compte.drive_root_drive_id || null,
    item_id: compte.drive_root_id || null,
    path: compte.drive_root_path || null,
  }
}

export async function GET(request) {
  const auth = await requireRole(request, ['admin', 'agente'])
  if (auth.error) return auth.error

  const compte = await loadCompte(auth.user.id)
  if (!compte) return NextResponse.json({ connected: false })

  let token
  try {
    token = await getValidAccessToken(compte)
  } catch (e) {
    if (e.reconnect) return NextResponse.json({ connected: true, reconnect: true })
    console.error('[drive/folders GET] token', e)
    return NextResponse.json({ error: 'Erreur OneDrive' }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  const driveId = searchParams.get('drive_id')
  const itemId = searchParams.get('item_id')

  try {
    if (driveId && itemId) {
      const folders = (await listFolders(token, driveId, itemId)).map(f => ({ ...f, source: 'perso' }))
      return NextResponse.json({ connected: true, level: 'browse', folders, root: rootOf(compte) })
    }
    // Niveau racine : Mes fichiers + Partagés.
    const myDriveId = await getMyDriveId(token)
    const [perso, shared] = await Promise.all([
      listFolders(token, myDriveId, 'root'),
      listSharedFolders(token).catch(() => []), // sharedWithMe peut être vide / indispo
    ])
    const folders = [
      ...perso.map(f => ({ ...f, source: 'perso' })),
      ...shared.map(f => ({ ...f, source: 'partage' })),
    ]
    return NextResponse.json({ connected: true, level: 'top', my_drive_id: myDriveId, folders, root: rootOf(compte) })
  } catch (e) {
    console.error('[drive/folders GET] list', e)
    return NextResponse.json({ error: 'Impossible de lister les dossiers OneDrive' }, { status: 502 })
  }
}

export async function POST(request) {
  const auth = await requireRole(request, ['admin', 'agente'])
  if (auth.error) return auth.error

  let body
  try { body = await request.json() } catch { body = {} }
  const createName = (body.create_name || '').trim()

  const compte = await loadCompte(auth.user.id)
  if (!compte) return NextResponse.json({ error: 'OneDrive non connecté' }, { status: 400 })

  let token
  try {
    token = await getValidAccessToken(compte)
  } catch (e) {
    if (e.reconnect) return NextResponse.json({ reconnect: true, error: 'Reconnecte ton OneDrive' }, { status: 409 })
    console.error('[drive/folders POST] token', e)
    return NextResponse.json({ error: 'Erreur OneDrive' }, { status: 500 })
  }

  let root
  if (createName) {
    // Création sous le parent courant (défaut : racine de Mes fichiers).
    let parentDriveId = body.parent_drive_id
    const parentItemId = body.parent_item_id || 'root'
    try {
      if (!parentDriveId) parentDriveId = await getMyDriveId(token)
      root = await createFolder(token, parentDriveId, parentItemId, createName)
    } catch (e) {
      console.error('[drive/folders POST] create', e)
      return NextResponse.json({ error: 'Création du dossier impossible' }, { status: 502 })
    }
  } else {
    if (!body.drive_id || !body.item_id || !body.name) {
      return NextResponse.json({ error: 'Dossier manquant' }, { status: 400 })
    }
    root = { driveId: body.drive_id, itemId: body.item_id, name: body.name }
  }

  const { error } = await admin().from('comptes_oauth').update({
    drive_root_drive_id: root.driveId,
    drive_root_id: root.itemId,
    drive_root_path: root.name,
    updated_at: new Date().toISOString(),
  }).eq('id', compte.id)
  if (error) {
    console.error('[drive/folders POST] update', error.message)
    return NextResponse.json({ error: 'Enregistrement impossible' }, { status: 500 })
  }

  return NextResponse.json({ root_drive_id: root.driveId, root_id: root.itemId, root_path: root.name })
}
