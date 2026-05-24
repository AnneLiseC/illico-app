// app/api/auth/google/callback/route.js
import { google } from 'googleapis'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
)

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

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
  return payload.uid
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const state = searchParams.get('state')

  if (error || !code || !state) {
    return NextResponse.redirect(new URL('/planning?google=error', request.url))
  }

  const userId = verifySignedState(state)
  if (!userId) {
    return NextResponse.redirect(new URL('/planning?google=error&reason=state_invalid', request.url))
  }

  try {
    const { tokens } = await oauth2Client.getToken(code)

    await supabaseAdmin.from('google_tokens').upsert({
      user_id: userId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      expiry_date: tokens.expiry_date || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

    return NextResponse.redirect(new URL('/planning?google=connected', request.url))
  } catch (err) {
    console.error('Google OAuth callback error:', err)
    return NextResponse.redirect(new URL('/planning?google=error', request.url))
  }
}
