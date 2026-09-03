// app/lib/drive/microsoft.js
// Accès Microsoft Graph (OneDrive) côté SERVEUR uniquement.
//
//   - getValidAccessToken(compte) : access_token valide (refresh transparent). ⚠️
//     Microsoft ROTATE le refresh_token → on réécrit access + refresh chiffrés.
//   - Navigation DRIVE-AWARE : un dossier est un couple (driveId, itemId). Ça couvre
//     les dossiers PARTAGÉS (qui vivent dans le Drive de leur propriétaire) autant que
//     « Mes fichiers ». getMyDriveId / listFolders / listSharedFolders / createFolder.
//
// Tokens lus/écrits CHIFFRÉS (crypto.js AES-256-GCM). Jamais côté client.

import { createClient } from '@supabase/supabase-js'
import { encrypt, decrypt } from '../calendar/crypto'
import { fetchRetry } from './http'

const GRAPH = 'https://graph.microsoft.com/v1.0'
const SCOPE = 'offline_access User.Read Files.ReadWrite'
const SELECT = '$select=id,name,folder,remoteItem,parentReference&$top=200'

function authority() {
  return `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT || 'consumers'}`
}

let _admin
function admin() {
  if (!_admin) _admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _admin
}

export class DriveReconnectError extends Error {
  constructor(msg = 'reconnect') { super(msg); this.reconnect = true }
}

// R22 — un Drive déconnecté ne DOIT plus être silencieux.
//
// Les routes d'envoi répondaient `200 { skipped: 'reconnect' }`, et les quatorze appels
// de l'interface sont en `.catch(() => {})` sans jamais lire la réponse. Résultat : le
// franchisé croyait son archivage à jour alors qu'il était arrêté depuis la dernière
// expiration de consentement Microsoft.
//
// On prévient donc ici, au seul endroit par où passe TOUTE demande de jeton — une
// notification interne par utilisateur et par jour, qui ne dépend d'aucune boîte
// d'envoi. Best-effort et non bloquant : prévenir ne doit jamais faire échouer autre
// chose que ce qui échouait déjà.
async function prevenirReconnexion(compte) {
  try {
    if (!compte?.user_id) return
    const { signalerReconnexionDrive } = await import('../notifications-internes.js')
    const nom = compte.fournisseur === 'googledrive' ? 'Google Drive' : 'OneDrive'
    await signalerReconnexionDrive(compte.user_id, nom)
  } catch { /* la notification est un plus, jamais un prérequis */ }
}

// `compte` doit contenir : id, access_token(chiffré), refresh_token(chiffré), expiry_date(ms).
export async function getValidAccessToken(compte) {
  const SKEW = 60_000
  const access = compte.access_token ? decrypt(compte.access_token) : null
  if (access && compte.expiry_date && compte.expiry_date - SKEW > Date.now()) return access

  const refresh = compte.refresh_token ? decrypt(compte.refresh_token) : null
  if (!refresh) { await prevenirReconnexion(compte); throw new DriveReconnectError() }

  const res = await fetch(`${authority()}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refresh,
      scope: SCOPE,
    }).toString(),
  })
  const tok = await res.json()
  if (!res.ok || !tok.access_token) {
    console.error('[drive] refresh KO', tok?.error, tok?.error_description)
    await prevenirReconnexion(compte)
    throw new DriveReconnectError()
  }

  await admin().from('comptes_oauth').update({
    access_token: encrypt(tok.access_token),
    refresh_token: tok.refresh_token ? encrypt(tok.refresh_token) : compte.refresh_token,
    expiry_date: tok.expires_in ? Date.now() + tok.expires_in * 1000 : null,
    updated_at: new Date().toISOString(),
  }).eq('id', compte.id)

  return tok.access_token
}

// Toutes les requêtes Graph passent par fetchRetry → résilience au throttling (429/5xx).
export async function graphFetch(accessToken, path, opts = {}) {
  const url = path.startsWith('http') ? path : `${GRAPH}${path}`
  return fetchRetry(url, { ...opts, headers: { Authorization: `Bearer ${accessToken}`, ...(opts.headers || {}) } })
}

// Normalise un enfant Graph en entrée dossier { driveId, itemId, name } ou null si ce
// n'est pas un dossier. Résout les raccourcis/partagés (remoteItem) vers leur vraie
// adresse (driveId du propriétaire + itemId distant).
function toFolderEntry(x, contextDriveId) {
  const isFolder = !!(x.folder || x.remoteItem?.folder)
  if (!isFolder) return null
  return {
    driveId: x.remoteItem?.parentReference?.driveId || contextDriveId,
    itemId: x.remoteItem?.id || x.id,
    name: x.name || x.remoteItem?.name || '(sans nom)',
  }
}

// Id du Drive personnel du user (pour adresser « Mes fichiers »).
export async function getMyDriveId(accessToken) {
  const res = await graphFetch(accessToken, '/me/drive?$select=id')
  if (!res.ok) throw new Error(`graph_drive_failed_${res.status}`)
  const data = await res.json()
  return data.id
}

// Dossiers enfants d'un item (driveId, itemId). itemId='root' → racine du drive.
export async function listFolders(accessToken, driveId, itemId) {
  const base = itemId === 'root'
    ? `/drives/${driveId}/root/children`
    : `/drives/${driveId}/items/${itemId}/children`
  const res = await graphFetch(accessToken, `${base}?${SELECT}`)
  if (!res.ok) throw new Error(`graph_list_failed_${res.status}`)
  const data = await res.json()
  return (data.value || [])
    .map(x => toFolderEntry(x, driveId))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

// Dossiers « Partagés avec moi » (vivent dans le Drive de leur propriétaire).
export async function listSharedFolders(accessToken) {
  const res = await graphFetch(accessToken, '/me/drive/sharedWithMe')
  if (!res.ok) throw new Error(`graph_shared_failed_${res.status}`)
  const data = await res.json()
  return (data.value || [])
    .filter(x => x.remoteItem?.folder)
    .map(x => ({
      driveId: x.remoteItem?.parentReference?.driveId,
      itemId: x.remoteItem?.id,
      name: x.name || x.remoteItem?.name || '(sans nom)',
    }))
    .filter(f => f.driveId && f.itemId)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

// Crée un dossier sous un parent (driveId, itemId). Conflit → renomme.
export async function createFolder(accessToken, parentDriveId, parentItemId, name) {
  const base = parentItemId === 'root'
    ? `/drives/${parentDriveId}/root/children`
    : `/drives/${parentDriveId}/items/${parentItemId}/children`
  const res = await graphFetch(accessToken, base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'rename' }),
  })
  if (!res.ok) throw new Error(`graph_create_failed_${res.status}`)
  const data = await res.json()
  return { driveId: parentDriveId, itemId: data.id, name: data.name }
}

// IDEMPOTENT : renvoie l'itemId d'un sous-dossier `name` sous `parentId` (même driveId),
// en le CRÉANT s'il n'existe pas. Conflit (409) → on relit et on retrouve l'existant.
export async function ensureChildFolder(accessToken, driveId, parentId, name) {
  const base = parentId === 'root'
    ? `/drives/${driveId}/root/children`
    : `/drives/${driveId}/items/${parentId}/children`
  const res = await graphFetch(accessToken, base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
  })
  if (res.ok) { const d = await res.json(); return d.id }
  if (res.status === 409) {
    const kids = await listFolders(accessToken, driveId, parentId)
    const found = kids.find(f => f.name.toLowerCase() === name.toLowerCase())
    if (found) return found.itemId
  }
  throw new Error(`ensure_folder_failed_${res.status}`)
}

// Crée/retrouve toute une chaîne de sous-dossiers sous (rootDriveId, rootItemId).
// Renvoie l'itemId du dernier (la feuille), dans rootDriveId.
export async function ensureFolderPath(accessToken, rootDriveId, rootItemId, segments) {
  let parent = rootItemId
  for (const seg of segments) {
    parent = await ensureChildFolder(accessToken, rootDriveId, parent, seg)
  }
  return parent
}

// Déplace un item (driveId, itemId) sous newParentId (même drive). oldParentId ignoré
// (Graph remplace le parent). Renvoie { id }.
export async function moveItem(accessToken, driveId, itemId, newParentId, _oldParentId) {
  const res = await graphFetch(accessToken, `/drives/${driveId}/items/${itemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parentReference: { id: newParentId } }),
  })
  if (!res.ok) throw new Error(`move_failed_${res.status}`)
  const d = await res.json()
  return { id: d.id }
}

// Delta query sur le sous-arbre de (driveId, itemId). Suit la pagination (@odata.nextLink)
// et renvoie { items, deltaLink }. deltaLink=null en entrée → INIT avec token=latest :
// Graph renvoie un curseur SANS énumérer l'existant (invariant n°2 : pas d'avalanche).
// deltaLink fourni → seulement les changements depuis.
// PUR et testable : un curseur delta STOCKE qui renvoie ce statut est-il mort ?
// Graph documente `410 Gone` (resyncRequired) pour un jeton delta perime, mais OneDrive
// GRAND PUBLIC renvoie aussi `404` dans ce cas — constate en prod le 02/09 : le dossier
// surveille existait toujours (l'app y ecrivait encore), seul le curseur etait invalide.
// 400 couvre le curseur malforme. On ne resynchronise QUE si un curseur etait stocke :
// un echec sur l'URL d'init n'est pas un curseur mort, c'est une vraie panne (droits,
// dossier supprime, reseau) et doit remonter.
export function curseurMort(status) {
  return status === 404 || status === 410 || status === 400
}

// Construit l'URL d'INIT : token=latest → curseur SANS enumerer l'existant (invariant n°2).
function urlInitDelta(driveId, itemId) {
  return itemId === 'root'
    ? `${GRAPH}/drives/${driveId}/root/delta?token=latest`
    : `${GRAPH}/drives/${driveId}/items/${itemId}/delta?token=latest`
}

export async function deltaQuery(accessToken, driveId, itemId, deltaLink) {
  const urlInit = urlInitDelta(driveId, itemId)
  let next = deltaLink || urlInit
  let depuisCurseur = !!deltaLink   // on est parti d'un curseur stocke
  let resync = false                // un seul reessai, jamais deux (sinon boucle infinie)
  const items = []
  let finalDelta = null
  let guard = 0
  while (next && guard++ < 200) {
    const res = await graphFetch(accessToken, next)
    if (!res.ok) {
      // Curseur stocke mort → UN SEUL reessai depuis l'init, puis on repart de zero.
      if (depuisCurseur && !resync && curseurMort(res.status)) {
        console.error(`[drive/microsoft] curseur delta mort (${res.status}) → resynchronisation`)
        resync = true
        depuisCurseur = false
        items.length = 0
        next = urlInit
        continue
      }
      throw new Error(`delta_failed_${res.status}`)
    }
    const data = await res.json()
    for (const it of (data.value || [])) items.push(it)
    if (data['@odata.nextLink']) { next = data['@odata.nextLink']; continue }
    finalDelta = data['@odata.deltaLink'] || null
    next = null
  }
  return { items, deltaLink: finalDelta, resync }
}

// Détection ENTRANTE (inbox). Interface commune avec google-drive.pullInbox :
//   (accessToken, driveId, rootItemId, cursor) → { files, cursor, init }
//   - cursor absent → INIT : delta token=latest → curseur SANS énumérer l'existant
//     (invariant n°2), files=[].
//   - sinon → changements depuis le curseur, filtrés aux FICHIERS (hors dossiers/suppr.).
//   files = [{ itemId, name, parentPath, webUrl }] ; cursor = deltaLink à persister.
export async function pullInbox(accessToken, driveId, rootItemId, cursor) {
  const { items, deltaLink, resync } = await deltaQuery(accessToken, driveId, rootItemId, cursor)
  // Une resynchronisation repart de `token=latest` : Graph ne renvoie AUCUN item existant.
  // On la traite donc exactement comme une init — sinon on inserait une liste vide comme
  // si c'etaient des changements. `resync` est remonte pour que le cron le SIGNALE : une
  // resynchronisation qui se repete a chaque passage veut dire que la racine est devenue
  // inatteignable et qu'il faut reconnecter le Drive, pas s'auto-reparer en silence.
  const init = !cursor || resync
  const files = init ? [] : items
    .filter(it => !it.deleted && !it.folder && it.file)
    .map(it => ({ itemId: it.id, name: it.name || null, parentPath: it.parentReference?.path || null, webUrl: it.webUrl || null }))
  return { files, cursor: deltaLink || cursor || null, init, resync }
}

// Télécharge le contenu d'un item (driveId, itemId). Renvoie { buffer, contentType }.
export async function downloadItemContent(accessToken, driveId, itemId) {
  const res = await graphFetch(accessToken, `/drives/${driveId}/items/${itemId}/content`)
  if (!res.ok) throw new Error(`download_failed_${res.status}`)
  const contentType = res.headers.get('content-type') || 'application/octet-stream'
  return { buffer: Buffer.from(await res.arrayBuffer()), contentType }
}

// Supprime un item (driveId, itemId). 404 (déjà supprimé) = succès idempotent.
export async function deleteItem(accessToken, driveId, itemId) {
  const res = await graphFetch(accessToken, `/drives/${driveId}/items/${itemId}`, { method: 'DELETE' })
  if (res.ok || res.status === 404) return true
  throw new Error(`delete_failed_${res.status}`)
}

// Upload SIMPLE (≤ ~250 Mo) d'un fichier sous (driveId, parentItemId). Conflit → renomme.
// `body` = Buffer/Uint8Array. Renvoie { id, name, webUrl }.
export async function uploadSmallFile(accessToken, driveId, parentItemId, fileName, body, contentType, conflictBehavior = 'rename') {
  const enc = encodeURIComponent(fileName)
  const path = parentItemId === 'root'
    ? `/drives/${driveId}/root:/${enc}:/content`
    : `/drives/${driveId}/items/${parentItemId}:/${enc}:/content`
  const res = await graphFetch(accessToken, `${path}?@microsoft.graph.conflictBehavior=${conflictBehavior}`, {
    method: 'PUT',
    headers: { 'Content-Type': contentType || 'application/octet-stream' },
    body,
  })
  if (!res.ok) throw new Error(`upload_failed_${res.status}`)
  const d = await res.json()
  return { id: d.id, name: d.name, webUrl: d.webUrl }
}
