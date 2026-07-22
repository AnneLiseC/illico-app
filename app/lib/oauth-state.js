// app/lib/oauth-state.js
// State OAuth signé HMAC-SHA256 (anti-CSRF), partagé par les flux OAuth serveur.
// Format : base64url(payload).base64url(signature) ; payload = { uid, nonce, exp }.
// Même schéma que /api/auth/microsoft et /api/auth/google (repris pour /api/super-admin/email-oauth).

import crypto from 'crypto'

const TTL_MS = 10 * 60 * 1000 // 10 minutes

export function signState(userId) {
  const secret = process.env.OAUTH_STATE_SECRET
  if (!secret) throw new Error('OAUTH_STATE_SECRET non configuré')
  const payload = JSON.stringify({
    uid: userId,
    nonce: crypto.randomBytes(16).toString('hex'),
    exp: Date.now() + TTL_MS,
  })
  const payloadB64 = Buffer.from(payload).toString('base64url')
  const signature = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url')
  return `${payloadB64}.${signature}`
}

// Vérifie/décode un state signé. Renvoie l'uid si valide (signature OK + non expiré), sinon null.
export function verifyState(state) {
  if (!state || typeof state !== 'string') return null
  const secret = process.env.OAUTH_STATE_SECRET
  if (!secret) return null
  const parts = state.split('.')
  if (parts.length !== 2) return null
  const [payloadB64, signature] = parts
  const expected = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url')
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
