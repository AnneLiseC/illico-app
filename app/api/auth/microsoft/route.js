// app/api/auth/microsoft/route.js
// Initie le flow OAuth Microsoft (OneDrive / Graph). Retourne l'URL d'autorisation
// au client, qui effectue la redirection (permet de passer le Bearer en header — un
// <a href> ne le ferait pas). Miroir de /api/auth/google.
//
// Scopes : Files.ReadWrite (accès aux fichiers OneDrive de l'utilisateur) +
//   offline_access (refresh_token) + User.Read (identité du compte).
// Authority : 'consumers' par défaut (comptes personnels — l'app est enregistrée en
//   « comptes personnels uniquement »). Surchargable via MICROSOFT_TENANT si un jour
//   on ouvre aux comptes pro (valeur 'common').

import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { requireRole } from '../../../lib/api-auth'

const SCOPE = 'offline_access User.Read Files.ReadWrite'

function authority() {
  return `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT || 'consumers'}`
}

// State signé HMAC-SHA256 anti-CSRF — même schéma que /api/auth/google.
// Format : base64url(payload).base64url(signature) ; payload = { uid, nonce, exp }
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

  if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_REDIRECT_URI) {
    return NextResponse.json({ error: 'Configuration Microsoft manquante' }, { status: 500 })
  }

  let state
  try {
    state = buildSignedState(auth.user.id)
  } catch {
    return NextResponse.json({ error: 'Configuration serveur manquante' }, { status: 500 })
  }

  const url = `${authority()}/oauth2/v2.0/authorize?` + new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID,
    response_type: 'code',
    redirect_uri: process.env.MICROSOFT_REDIRECT_URI,
    response_mode: 'query',
    scope: SCOPE,
    state,
    prompt: 'consent', // force l'écran de consentement → garantit le refresh_token
  }).toString()

  return NextResponse.json({ url })
}
