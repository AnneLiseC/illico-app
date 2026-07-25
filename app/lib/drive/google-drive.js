// app/lib/drive/google-drive.js
// Accès Google Drive côté SERVEUR (modèle « alternative » à OneDrive). Interface
// IDENTIQUE à app/lib/drive/microsoft.js (getValidAccessToken/getMyDriveId/listFolders/
// listSharedFolders/createFolder…) pour que le dispatch drive route indifféremment.
//
// Google Drive n'a pas de notion de « driveId » pour le Drive perso : on utilise la
// sentinelle 'gdrive' comme driveId, et l'itemId = id du dossier Google ('root' = racine
// « Mon Drive »). REST v3 en bearer (comme graphFetch), refresh manuel (Google ne fait
// pas tourner le refresh_token). Tokens lus/écrits CHIFFRÉS (crypto.js AES-256-GCM).

import { createClient } from '@supabase/supabase-js'
import { encrypt, decrypt } from '../calendar/crypto'

const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
export const GDRIVE_SENTINEL = 'gdrive'   // driveId factice (Google n'en a pas pour le perso)

let _admin
function admin() {
  if (!_admin) _admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _admin
}

export class DriveReconnectError extends Error {
  constructor(msg = 'reconnect') { super(msg); this.reconnect = true }
}

// access_token valide (refresh transparent). `compte` : id, access_token(chiffré),
// refresh_token(chiffré), expiry_date(ms).
export async function getValidAccessToken(compte) {
  const SKEW = 60_000
  const access = compte.access_token ? decrypt(compte.access_token) : null
  if (access && compte.expiry_date && compte.expiry_date - SKEW > Date.now()) return access

  const refresh = compte.refresh_token ? decrypt(compte.refresh_token) : null
  if (!refresh) throw new DriveReconnectError()

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refresh,
    }).toString(),
  })
  const tok = await res.json()
  if (!res.ok || !tok.access_token) {
    console.error('[gdrive] refresh KO', tok?.error, tok?.error_description)
    throw new DriveReconnectError()
  }
  // Google ne renvoie pas de nouveau refresh_token au refresh → on garde l'existant.
  await admin().from('comptes_oauth').update({
    access_token: encrypt(tok.access_token),
    expiry_date: tok.expires_in ? Date.now() + tok.expires_in * 1000 : null,
    updated_at: new Date().toISOString(),
  }).eq('id', compte.id)

  return tok.access_token
}

async function driveFetch(accessToken, path, opts = {}) {
  const url = path.startsWith('http') ? path : `${API}${path}`
  return fetch(url, { ...opts, headers: { Authorization: `Bearer ${accessToken}`, ...(opts.headers || {}) } })
}

// Pas de driveId pour le perso Google → sentinelle. (Signature alignée sur microsoft.js.)
export async function getMyDriveId() {
  return GDRIVE_SENTINEL
}

// Dossiers enfants de `itemId` (itemId='root' → racine « Mon Drive »). driveId ignoré
// (sentinelle). Renvoie [{ driveId:'gdrive', itemId, name }] trié par nom.
export async function listFolders(accessToken, _driveId, itemId) {
  const parent = itemId === 'root' || !itemId ? 'root' : itemId
  const q = `'${parent}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  const params = new URLSearchParams({
    q,
    fields: 'files(id,name)',
    pageSize: '200',
    orderBy: 'name',
    spaces: 'drive',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  })
  const res = await driveFetch(accessToken, `/files?${params.toString()}`)
  if (res.status === 401) throw new DriveReconnectError()
  if (!res.ok) throw new Error(`gdrive_list_failed_${res.status}`)
  const data = await res.json()
  return (data.files || []).map(f => ({ driveId: GDRIVE_SENTINEL, itemId: f.id, name: f.name || '(sans nom)' }))
}

// « Partagés avec moi » : non géré à l'étape 1 (racine = Mon Drive). [] = pas de section.
export async function listSharedFolders() {
  return []
}

// Crée un dossier sous (parentItemId) ; driveId ignoré. Renvoie { driveId, itemId, name }.
export async function createFolder(accessToken, _parentDriveId, parentItemId, name) {
  const parent = parentItemId === 'root' || !parentItemId ? 'root' : parentItemId
  const res = await driveFetch(accessToken, '/files?supportsAllDrives=true', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parent] }),
  })
  if (!res.ok) throw new Error(`gdrive_create_failed_${res.status}`)
  const d = await res.json()
  return { driveId: GDRIVE_SENTINEL, itemId: d.id, name: d.name || name }
}

// ── Étapes 2/3 (push / pull) : à implémenter (ensureFolderPath, uploadSmallFile,
//    deleteItem, downloadItemContent, changes/delta). Non requis pour l'étape 1. ──
