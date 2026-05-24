// app/api/auth/google/route.js
// Initie le flow OAuth Google. Retourne l'URL d'autorisation au client
// qui effectue la redirection (permet de passer le token d'auth en header
// — un <a href> ne le ferait pas).

import { google } from 'googleapis'
import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { requireRole } from '../../../lib/api-auth'

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
)

// State signé HMAC-SHA256 pour empêcher la CSRF.
// Format : base64url(payload).base64url(signature)
// payload = { uid, nonce, exp }
function buildSignedState(userId) {
  const secret = process.env.OAUTH_STATE_SECRET
  if (!secret) throw new Error('OAUTH_STATE_SECRET non configuré')
  const payload = JSON.stringify({
    uid: userId,
    nonce: crypto.randomBytes(16).toString('hex'),
    exp: Date.now() + 10 * 60 * 1000, // 10 minutes
  })
  const payloadB64 = Buffer.from(payload).toString('base64url')
  const signature = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url')
  return `${payloadB64}.${signature}`
}

export async function POST(request) {
  const auth = await requireRole(request, ['admin', 'agente'])
  if (auth.error) return auth.error

  let state
  try {
    state = buildSignedState(auth.user.id)
  } catch {
    return NextResponse.json({ error: 'Configuration serveur manquante' }, { status: 500 })
  }

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar'],
    prompt: 'consent',
    state,
  })

  return NextResponse.json({ url })
}
