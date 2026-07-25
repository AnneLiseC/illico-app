// app/api/auth/google/callback/route.js
import { google } from 'googleapis'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { encrypt } from '../../../../lib/calendar/crypto'

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
)

let _supabaseAdmin
function getSupabaseAdmin() {
  if (!_supabaseAdmin) _supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _supabaseAdmin
}

// Vérifie et décode le state signé HMAC produit par /api/auth/google.
// Retourne userId si valide, sinon null.
function verifySignedState(state) {
  if (!state || typeof state !== 'string') return null
  const secret = process.env.OAUTH_STATE_SECRET
  if (!secret) return null
  const parts = state.split('.')
  if (parts.length !== 2) return null
  const [payloadB64, signature] = parts
  const expected = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url')
  // Comparaison à temps constant pour éviter une fuite via timing
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  let payload
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
  } catch { return null }
  if (!payload?.uid || !payload?.exp) return null
  if (Date.now() > payload.exp) return null
  return { uid: payload.uid, kind: payload.kind === 'drive' ? 'drive' : 'calendar' }
}

const FOURNISSEUR_BY_KIND = { calendar: 'google', drive: 'googledrive' }

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const state = searchParams.get('state')

  const decoded = state ? verifySignedState(state) : null

  // Agenda → /planning?google= (inchangé). Google Drive → l'UI Mon Drive
  // (/parametres pour l'admin, /profil pour l'agente) ?googledrive=.
  const failUrl = (reason) => {
    if (decoded?.kind === 'drive') return new URL(`/profil?googledrive=error${reason ? `&reason=${reason}` : ''}`, request.url)
    return new URL(`/planning?google=error${reason ? `&reason=${reason}` : ''}`, request.url)
  }

  if (error || !code || !state) return NextResponse.redirect(failUrl())
  if (!decoded) return NextResponse.redirect(failUrl('state_invalid'))

  const userId = decoded.uid
  const kind = decoded.kind
  const fournisseur = FOURNISSEUR_BY_KIND[kind]
  const param = kind === 'drive' ? 'googledrive' : 'google'

  // Destination succès : agenda → /planning ; drive → /parametres (admin) ou /profil.
  let dest = kind === 'drive' ? '/profil' : '/planning'
  if (kind === 'drive') {
    try {
      const { data: prof } = await getSupabaseAdmin().from('profiles').select('role').eq('id', userId).maybeSingle()
      if (prof?.role === 'admin') dest = '/parametres'
    } catch { /* défaut /profil */ }
  }

  try {
    const { tokens } = await oauth2Client.getToken(code)

    // W1 — tokens stockés CHIFFRÉS (AES-256-GCM). refresh_token peut être null (Google ne le
    // renvoie qu'au 1er consentement) → on ne chiffre que s'il est présent. expiry_date en clair.
    await getSupabaseAdmin().from('comptes_oauth').upsert({
      user_id: userId,
      fournisseur,
      access_token: encrypt(tokens.access_token),
      refresh_token: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
      expiry_date: tokens.expiry_date || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,fournisseur' })

    return NextResponse.redirect(new URL(`${dest}?${param}=connected`, request.url))
  } catch (err) {
    console.error('Google OAuth callback error:', err)
    return NextResponse.redirect(failUrl())
  }
}
