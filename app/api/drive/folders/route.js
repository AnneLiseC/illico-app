// app/api/drive/folders/route.js
// GET  : liste les dossiers de premier niveau du OneDrive du user + la racine choisie.
// POST : fixe la racine (dossier existant {root_id, root_name} OU création {create_name}).
//
// Tout est server-side : on charge le compte 'microsoft' du user (service role, scoping
// par user_id), on obtient un access_token valide (refresh transparent), on appelle Graph.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole } from '../../../lib/api-auth'
import { getValidAccessToken, listRootFolders, createRootFolder } from '../../../lib/drive/microsoft'

let _admin
function admin() {
  if (!_admin) _admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _admin
}

async function loadCompte(userId) {
  const { data } = await admin().from('comptes_oauth')
    .select('id, access_token, refresh_token, expiry_date, drive_root_id, drive_root_path')
    .eq('user_id', userId).eq('fournisseur', 'microsoft').maybeSingle()
  return data || null
}

export async function GET(request) {
  const auth = await requireRole(request, ['admin', 'agente'])
  if (auth.error) return auth.error

  const compte = await loadCompte(auth.user.id)
  if (!compte) return NextResponse.json({ connected: false })

  let accessToken
  try {
    accessToken = await getValidAccessToken(compte)
  } catch (e) {
    if (e.reconnect) return NextResponse.json({ connected: true, reconnect: true })
    console.error('[drive/folders GET] token', e)
    return NextResponse.json({ error: 'Erreur OneDrive' }, { status: 500 })
  }

  try {
    const folders = await listRootFolders(accessToken)
    return NextResponse.json({
      connected: true,
      folders,
      root_id: compte.drive_root_id || null,
      root_path: compte.drive_root_path || null,
    })
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
  const rootId = body.root_id
  const rootName = body.root_name

  if (!createName && (!rootId || !rootName)) {
    return NextResponse.json({ error: 'Dossier racine manquant' }, { status: 400 })
  }

  const compte = await loadCompte(auth.user.id)
  if (!compte) return NextResponse.json({ error: 'OneDrive non connecté' }, { status: 400 })

  let accessToken
  try {
    accessToken = await getValidAccessToken(compte)
  } catch (e) {
    if (e.reconnect) return NextResponse.json({ reconnect: true, error: 'Reconnecte ton OneDrive' }, { status: 409 })
    console.error('[drive/folders POST] token', e)
    return NextResponse.json({ error: 'Erreur OneDrive' }, { status: 500 })
  }

  let root = { id: rootId, name: rootName }
  if (createName) {
    try {
      root = await createRootFolder(accessToken, createName)
    } catch (e) {
      console.error('[drive/folders POST] create', e)
      return NextResponse.json({ error: 'Création du dossier impossible' }, { status: 502 })
    }
  }

  const { error } = await admin().from('comptes_oauth')
    .update({ drive_root_id: root.id, drive_root_path: root.name, updated_at: new Date().toISOString() })
    .eq('id', compte.id)
  if (error) {
    console.error('[drive/folders POST] update', error.message)
    return NextResponse.json({ error: 'Enregistrement impossible' }, { status: 500 })
  }

  return NextResponse.json({ root_id: root.id, root_path: root.name })
}
