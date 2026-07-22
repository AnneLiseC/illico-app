// app/api/super-admin/email-oauth/start/route.js
// Démarre la connexion de la BOÎTE D'ENVOI (OAuth Microsoft délégué, scope Mail.Send).
// L'éditrice (super-admin) autorise son compte Outlook une fois ; le token servira à
// envoyer tous les emails système. Renvoie l'URL d'autorisation (le client redirige).

import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '../../../../lib/api-auth'
import { signState } from '../../../../lib/oauth-state'
import { EMAIL_SCOPE } from '../../../../lib/email-sender'

function authority() {
  return `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT || 'consumers'}`
}

export async function POST(request) {
  const auth = await requireSuperAdmin(request)
  if (auth.error) return auth.error

  if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_EMAIL_REDIRECT_URI) {
    return NextResponse.json({ error: 'Configuration Microsoft (boîte d\'envoi) manquante' }, { status: 500 })
  }

  let state
  try {
    state = signState(auth.user.id)
  } catch {
    return NextResponse.json({ error: 'Configuration serveur manquante (OAUTH_STATE_SECRET)' }, { status: 500 })
  }

  const url = `${authority()}/oauth2/v2.0/authorize?` + new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID,
    response_type: 'code',
    redirect_uri: process.env.MICROSOFT_EMAIL_REDIRECT_URI,
    response_mode: 'query',
    scope: EMAIL_SCOPE,
    state,
    prompt: 'consent', // garantit le refresh_token + l'écran de consentement Mail.Send
  }).toString()

  return NextResponse.json({ url })
}
