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
import { fetchRetry } from './http'

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

// Toutes les requêtes Drive passent par fetchRetry (isGoogle → détecte aussi le throttling
// signalé par un 403 + corps « rateLimitExceeded »).
async function driveFetch(accessToken, path, opts = {}) {
  const url = path.startsWith('http') ? path : `${API}${path}`
  return fetchRetry(url, { ...opts, headers: { Authorization: `Bearer ${accessToken}`, ...(opts.headers || {}) } }, { isGoogle: true })
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

// ── Étape 2 (push / move) ────────────────────────────────────────────────────────
// Google Drive AUTORISE les doublons de nom sous un même parent → toutes les fonctions
// « ensure/upload » cherchent d'abord un existant pour rester IDEMPOTENTES (sinon on
// empilerait des dossiers/fichiers homonymes à chaque sync).

// Échappe une valeur pour une requête q Google Drive (apostrophes → \').
function escQ(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'") }

// Cherche un enfant `name` sous `parentId`. folderOnly → uniquement les dossiers.
// Renvoie l'id du 1er match, ou null.
async function findChild(accessToken, parentId, name, folderOnly = false) {
  const parent = parentId === 'root' || !parentId ? 'root' : parentId
  let q = `'${parent}' in parents and name = '${escQ(name)}' and trashed = false`
  if (folderOnly) q += " and mimeType = 'application/vnd.google-apps.folder'"
  const params = new URLSearchParams({
    q, fields: 'files(id,name)', pageSize: '1', spaces: 'drive',
    supportsAllDrives: 'true', includeItemsFromAllDrives: 'true',
  })
  const res = await driveFetch(accessToken, `/files?${params.toString()}`)
  if (res.status === 401) throw new DriveReconnectError()
  if (!res.ok) throw new Error(`gdrive_find_failed_${res.status}`)
  const d = await res.json()
  return d.files && d.files[0] ? d.files[0].id : null
}

// IDEMPOTENT : id du sous-dossier `name` sous `parentId`, créé s'il n'existe pas.
export async function ensureChildFolder(accessToken, _driveId, parentId, name) {
  const existing = await findChild(accessToken, parentId, name, true)
  if (existing) return existing
  const created = await createFolder(accessToken, GDRIVE_SENTINEL, parentId, name)
  return created.itemId
}

// Crée/retrouve toute la chaîne de sous-dossiers sous rootItemId. Renvoie l'id de la feuille.
export async function ensureFolderPath(accessToken, _rootDriveId, rootItemId, segments) {
  let parent = rootItemId === 'root' || !rootItemId ? 'root' : rootItemId
  for (const seg of segments) parent = await ensureChildFolder(accessToken, GDRIVE_SENTINEL, parent, seg)
  return parent
}

// Upload SIMPLE d'un fichier sous parentItemId. Google autorisant les doublons, un fichier
// homonyme déjà présent est MIS À JOUR (PATCH media) plutôt que dupliqué (≈ conflictBehavior
// 'replace' de OneDrive). Renvoie { id, name, webUrl }.
export async function uploadSmallFile(accessToken, _driveId, parentItemId, fileName, body, contentType) {
  const parent = parentItemId === 'root' || !parentItemId ? 'root' : parentItemId
  const ct = contentType || 'application/octet-stream'
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body)

  const existingId = await findChild(accessToken, parent, fileName, false)
  if (existingId) {
    const res = await fetchRetry(`${UPLOAD}/files/${existingId}?uploadType=media&supportsAllDrives=true&fields=id,name,webViewLink`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': ct },
      body: buf,
    }, { isGoogle: true })
    if (!res.ok) throw new Error(`gdrive_upload_update_${res.status}`)
    const d = await res.json()
    return { id: d.id, name: d.name || fileName, webUrl: d.webViewLink || null }
  }

  // Nouveau fichier : multipart/related (métadonnées JSON + média binaire).
  const boundary = 'batilis_boundary_9f3c1a7e2d4b'
  const meta = JSON.stringify({ name: fileName, parents: [parent] })
  const pre = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
    `--${boundary}\r\nContent-Type: ${ct}\r\n\r\n`
  )
  const post = Buffer.from(`\r\n--${boundary}--`)
  const multipart = Buffer.concat([pre, buf, post])
  const res = await fetchRetry(`${UPLOAD}/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: multipart,
  }, { isGoogle: true })
  if (!res.ok) throw new Error(`gdrive_upload_failed_${res.status}`)
  const d = await res.json()
  return { id: d.id, name: d.name || fileName, webUrl: d.webViewLink || null }
}

// Déplace un item vers newParentId (Drive v3 : addParents/removeParents). oldParentId
// requis pour retirer l'ancien lien (un fichier Google peut avoir plusieurs parents).
export async function moveItem(accessToken, _driveId, itemId, newParentId, oldParentId) {
  const params = new URLSearchParams({ addParents: newParentId, supportsAllDrives: 'true', fields: 'id,parents' })
  if (oldParentId) params.set('removeParents', oldParentId)
  const res = await driveFetch(accessToken, `/files/${itemId}?${params.toString()}`, { method: 'PATCH' })
  if (!res.ok) throw new Error(`gdrive_move_failed_${res.status}`)
  const d = await res.json()
  return { id: d.id }
}

// Supprime un item : mise à la CORBEILLE (trashed=true), récupérable — comme la corbeille
// OneDrive. 404 (déjà parti) = succès idempotent.
export async function deleteItem(accessToken, _driveId, itemId) {
  const res = await driveFetch(accessToken, `/files/${itemId}?supportsAllDrives=true`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  })
  if (res.ok || res.status === 404) return true
  throw new Error(`gdrive_delete_failed_${res.status}`)
}

// Télécharge le contenu d'un item. Renvoie { buffer, contentType }.
export async function downloadItemContent(accessToken, _driveId, itemId) {
  const res = await driveFetch(accessToken, `/files/${itemId}?alt=media&supportsAllDrives=true`)
  if (res.status === 401) throw new DriveReconnectError()
  if (!res.ok) throw new Error(`gdrive_download_failed_${res.status}`)
  const contentType = res.headers.get('content-type') || 'application/octet-stream'
  return { buffer: Buffer.from(await res.arrayBuffer()), contentType }
}

// ── Étape 3 (pull entrant) ───────────────────────────────────────────────────────
// Google n'a pas de delta SCOPÉ à un dossier (comme OneDrive) : la changes API est au
// niveau COMPTE. On filtre donc les changements aux fichiers descendants de la racine
// choisie, via une remontée d'ascendance mémoïsée.

// Parents directs d'un fichier (mémoïsés). [] si introuvable.
async function getParents(accessToken, fileId, memo) {
  if (memo.has(fileId)) return memo.get(fileId)
  const res = await driveFetch(accessToken, `/files/${fileId}?fields=id,parents&supportsAllDrives=true`)
  let parents = []
  if (res.status === 401) throw new DriveReconnectError()
  if (res.ok) { const d = await res.json(); parents = d.parents || [] }
  memo.set(fileId, parents)
  return parents
}

// fileId est-il un descendant de rootId ? Remonte l'ascendance (borne de profondeur).
async function isUnderRoot(accessToken, fileId, rootId, memo, depth = 0) {
  if (fileId === rootId) return true
  if (depth > 25) return false
  const parents = await getParents(accessToken, fileId, memo)
  for (const p of parents) {
    if (p === rootId) return true
    if (await isUnderRoot(accessToken, p, rootId, memo, depth + 1)) return true
  }
  return false
}

// Détection ENTRANTE (inbox). Interface commune avec microsoft.pullInbox :
//   (accessToken, driveId, rootItemId, cursor) → { files, cursor, init }
//   - cursor absent → INIT : on mémorise juste le startPageToken (pas d'énumération de
//     l'existant → invariant n°2 anti-avalanche), files=[].
//   - sinon → changes depuis le curseur, filtrées aux FICHIERS (hors dossiers, hors
//     Google Docs natifs non téléchargeables, hors corbeille) DESCENDANTS de la racine.
//   files = [{ itemId, name, parentPath, webUrl }].
export async function pullInbox(accessToken, _driveId, rootItemId, cursor) {
  if (!cursor) {
    const res = await driveFetch(accessToken, '/changes/startPageToken?supportsAllDrives=true')
    if (res.status === 401) throw new DriveReconnectError()
    if (!res.ok) throw new Error(`gdrive_startpagetoken_${res.status}`)
    const d = await res.json()
    return { files: [], cursor: d.startPageToken || null, init: true }
  }

  const memo = new Map()
  const files = []
  let pageToken = cursor
  let newCursor = cursor
  let guard = 0
  const scoped = rootItemId && rootItemId !== 'root'

  while (pageToken && guard++ < 200) {
    const params = new URLSearchParams({
      pageToken,
      spaces: 'drive',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
      pageSize: '200',
      fields: 'nextPageToken,newStartPageToken,changes(removed,fileId,file(id,name,parents,trashed,mimeType,webViewLink))',
    })
    const res = await driveFetch(accessToken, `/changes?${params.toString()}`)
    if (res.status === 401) throw new DriveReconnectError()
    if (!res.ok) throw new Error(`gdrive_changes_failed_${res.status}`)
    const data = await res.json()

    for (const ch of (data.changes || [])) {
      const f = ch.file
      if (ch.removed || !f || f.trashed) continue
      // Dossiers ET fichiers Google natifs (Docs/Sheets/…) écartés : non pertinents et
      // non téléchargeables en binaire brut.
      if (f.mimeType && f.mimeType.startsWith('application/vnd.google-apps.')) continue
      if (scoped && !(await isUnderRoot(accessToken, f.id, rootItemId, memo))) continue
      files.push({ itemId: f.id, name: f.name || null, parentPath: null, webUrl: f.webViewLink || null })
    }

    if (data.nextPageToken) { pageToken = data.nextPageToken; continue }
    newCursor = data.newStartPageToken || newCursor
    pageToken = null
  }

  return { files, cursor: newCursor, init: false }
}
