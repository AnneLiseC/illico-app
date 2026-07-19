// app/lib/drive/microsoft.js
// Accès Microsoft Graph (OneDrive) côté SERVEUR uniquement. Fournit :
//   - getValidAccessToken(compte) : renvoie un access_token valide, en rafraîchissant
//     via le refresh_token si l'access_token a expiré. ⚠️ Microsoft ROTATE le
//     refresh_token à chaque refresh → on réécrit access + refresh chiffrés.
//   - graphFetch / listRootFolders / createRootFolder : helpers Graph de base (Lot 2a).
//
// Tokens lus/écrits CHIFFRÉS (crypto.js AES-256-GCM). Jamais côté client.

import { createClient } from '@supabase/supabase-js'
import { encrypt, decrypt } from '../calendar/crypto'

const GRAPH = 'https://graph.microsoft.com/v1.0'
const SCOPE = 'offline_access User.Read Files.ReadWrite'

function authority() {
  return `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT || 'consumers'}`
}

let _admin
function admin() {
  if (!_admin) _admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _admin
}

// Erreur signalant qu'une reconnexion OneDrive est nécessaire (refresh KO / absent).
export class DriveReconnectError extends Error {
  constructor(msg = 'reconnect') { super(msg); this.reconnect = true }
}

// Renvoie un access_token valide pour ce compte. `compte` doit contenir :
//   id, access_token(chiffré), refresh_token(chiffré), expiry_date(ms epoch).
export async function getValidAccessToken(compte) {
  const SKEW = 60_000 // 1 min de marge avant expiration
  const access = compte.access_token ? decrypt(compte.access_token) : null
  if (access && compte.expiry_date && compte.expiry_date - SKEW > Date.now()) {
    return access
  }

  const refresh = compte.refresh_token ? decrypt(compte.refresh_token) : null
  if (!refresh) throw new DriveReconnectError()

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
    throw new DriveReconnectError()
  }

  // Microsoft renvoie un NOUVEAU refresh_token → on réécrit les deux (chiffrés).
  await admin().from('comptes_oauth').update({
    access_token: encrypt(tok.access_token),
    refresh_token: tok.refresh_token ? encrypt(tok.refresh_token) : compte.refresh_token,
    expiry_date: tok.expires_in ? Date.now() + tok.expires_in * 1000 : null,
    updated_at: new Date().toISOString(),
  }).eq('id', compte.id)

  return tok.access_token
}

// Wrapper Graph : préfixe l'URL + Authorization. Renvoie la Response brute.
export async function graphFetch(accessToken, path, opts = {}) {
  const url = path.startsWith('http') ? path : `${GRAPH}${path}`
  return fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${accessToken}`, ...(opts.headers || {}) },
  })
}

// Dossiers de premier niveau du OneDrive (pour choisir la racine). [{id, name}]
export async function listRootFolders(accessToken) {
  const res = await graphFetch(accessToken, '/me/drive/root/children?$select=id,name,folder&$top=200')
  if (!res.ok) throw new Error(`graph_list_failed_${res.status}`)
  const data = await res.json()
  return (data.value || [])
    .filter(x => x.folder)
    .map(x => ({ id: x.id, name: x.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

// Crée un dossier à la racine du OneDrive (conflit → renomme). {id, name}
export async function createRootFolder(accessToken, name) {
  const res = await graphFetch(accessToken, '/me/drive/root/children', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'rename' }),
  })
  if (!res.ok) throw new Error(`graph_create_failed_${res.status}`)
  const data = await res.json()
  return { id: data.id, name: data.name }
}
