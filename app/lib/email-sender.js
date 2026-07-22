// app/lib/email-sender.js
// Boîte d'envoi email (OAuth Microsoft délégué). Gère LE token unique (singleton
// email_sender_oauth) utilisé pour envoyer tous les emails système « en tant que »
// l'adresse Outlook connectée par l'éditrice depuis /super-admin.
//
// SERVEUR UNIQUEMENT (service_role + crypto). Ne pas importer côté client.

import { createClient } from '@supabase/supabase-js'
import { encrypt, decrypt } from './calendar/crypto'

let _admin
function admin() {
  if (!_admin) _admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _admin
}

function authority() {
  return `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT || 'consumers'}`
}

// Scope délégué : envoi d'email + refresh + identité (compte_email).
export const EMAIL_SCOPE = 'offline_access User.Read Mail.Send'

// État de la boîte d'envoi (pour l'UI /super-admin). Ne renvoie JAMAIS de token.
export async function getSenderStatus() {
  const { data } = await admin()
    .from('email_sender_oauth').select('compte_email, updated_at').eq('id', 'default').maybeSingle()
  if (!data) return { connected: false }
  return { connected: true, compte_email: data.compte_email || null, updated_at: data.updated_at || null }
}

// Stocke/écrase le token de la boîte d'envoi (à la connexion depuis le callback).
export async function saveSenderTokens({ access_token, refresh_token, expires_in, compte_email, connected_by }) {
  const { error } = await admin().from('email_sender_oauth').upsert({
    id: 'default',
    compte_email: compte_email || null,
    access_token: encrypt(access_token),
    refresh_token: refresh_token ? encrypt(refresh_token) : null,
    expiry_date: expires_in ? Date.now() + expires_in * 1000 : null,
    connected_by: connected_by || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })
  if (error) throw new Error(error.message)
}

// Renvoie un access_token valide (refresh transparent si expiré). Microsoft ROTATE
// le refresh_token → on réécrit access + refresh chiffrés. Lève si non connectée
// ou si le refresh échoue (reconnexion nécessaire).
export async function getSenderAccessToken() {
  const { data: row } = await admin().from('email_sender_oauth').select('*').eq('id', 'default').maybeSingle()
  if (!row || !row.refresh_token) {
    throw new Error("Boîte d'envoi email non connectée (à connecter dans l'espace créatrice)")
  }

  const SKEW = 60_000
  const access = row.access_token ? decrypt(row.access_token) : null
  if (access && row.expiry_date && row.expiry_date - SKEW > Date.now()) return access

  const refresh = decrypt(row.refresh_token)
  const res = await fetch(`${authority()}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refresh,
      scope: EMAIL_SCOPE,
    }).toString(),
  })
  const tok = await res.json()
  if (!res.ok || !tok.access_token) {
    console.error('[email-sender] refresh KO', tok?.error, tok?.error_description)
    throw new Error("Boîte d'envoi email : reconnexion nécessaire")
  }

  await admin().from('email_sender_oauth').update({
    access_token: encrypt(tok.access_token),
    refresh_token: tok.refresh_token ? encrypt(tok.refresh_token) : row.refresh_token,
    expiry_date: tok.expires_in ? Date.now() + tok.expires_in * 1000 : null,
    updated_at: new Date().toISOString(),
  }).eq('id', 'default')

  return tok.access_token
}
