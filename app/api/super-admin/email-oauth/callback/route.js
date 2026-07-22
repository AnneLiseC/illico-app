// app/api/super-admin/email-oauth/callback/route.js
// Callback OAuth de la boîte d'envoi : échange le code contre les tokens, récupère
// l'adresse du compte (Graph /me), stocke le tout CHIFFRÉ (singleton email_sender_oauth),
// puis renvoie vers /super-admin. Protégé par le state signé HMAC (pas de bearer ici).

import { NextResponse } from 'next/server'
import { verifyState } from '../../../../lib/oauth-state'
import { saveSenderTokens, EMAIL_SCOPE } from '../../../../lib/email-sender'

function authority() {
  return `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT || 'consumers'}`
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const state = searchParams.get('state')

  const back = (params) => NextResponse.redirect(new URL(`/super-admin?${params}`, request.url))

  if (error || !code || !state) return back('email=error')

  const uid = verifyState(state)
  if (!uid) return back('email=error&reason=state')

  try {
    // 1. Échange code → tokens.
    const tokenRes = await fetch(`${authority()}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET,
        redirect_uri: process.env.MICROSOFT_EMAIL_REDIRECT_URI,
        grant_type: 'authorization_code',
        scope: EMAIL_SCOPE,
        code,
      }).toString(),
    })
    const tok = await tokenRes.json()
    if (!tokenRes.ok || !tok.access_token) {
      console.error('[email-oauth] token exchange KO', tok?.error, tok?.error_description)
      return back('email=error')
    }

    // 2. Identité du compte (adresse d'envoi) — Graph /me. Non bloquant.
    let compteEmail = null
    try {
      const meRes = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${tok.access_token}` },
      })
      if (meRes.ok) {
        const me = await meRes.json()
        compteEmail = me.mail || me.userPrincipalName || null
      }
    } catch { /* identité optionnelle */ }

    // 3. Stockage chiffré (singleton).
    await saveSenderTokens({
      access_token: tok.access_token,
      refresh_token: tok.refresh_token || null,
      expires_in: tok.expires_in,
      compte_email: compteEmail,
      connected_by: compteEmail,
    })

    return back('email=connected')
  } catch (err) {
    console.error('[email-oauth] callback error', err)
    return back('email=error')
  }
}
