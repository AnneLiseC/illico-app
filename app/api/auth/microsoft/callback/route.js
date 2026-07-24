// app/api/auth/microsoft/callback/route.js
// Callback OAuth Microsoft : échange le code contre les tokens, les stocke CHIFFRÉS
// dans comptes_oauth, puis renvoie vers l'UI. Miroir de /api/auth/google/callback.
//
// DEUX usages, distingués par state.kind (posé par /api/auth/microsoft) :
//   - 'drive'    (défaut) → OneDrive : fournisseur='microsoft', scope Files, ?onedrive=.
//   - 'calendar' → Outlook  : fournisseur='outlook',  scope Calendars, ?outlookcal=.
// Deux lignes comptes_oauth indépendantes (contrainte user_id,fournisseur) → tokens et
// déconnexion découplés.

import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { encrypt } from '../../../../lib/calendar/crypto'

const SCOPE_BY_KIND = {
  drive:    'offline_access User.Read Files.ReadWrite',
  calendar: 'offline_access User.Read Calendars.ReadWrite',
}
const FOURNISSEUR_BY_KIND = { drive: 'microsoft', calendar: 'outlook' }
const PARAM_BY_KIND       = { drive: 'onedrive', calendar: 'outlookcal' }

function authority() {
  return `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT || 'consumers'}`
}

let _supabaseAdmin
function getSupabaseAdmin() {
  if (!_supabaseAdmin) _supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _supabaseAdmin
}

// Vérifie/décode le state signé HMAC produit par /api/auth/microsoft. userId si valide.
function verifySignedState(state) {
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
  return { uid: payload.uid, kind: payload.kind === 'calendar' ? 'calendar' : 'drive' }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const state = searchParams.get('state')

  const decoded = state ? verifySignedState(state) : null
  // Paramètre d'échec fonction du kind (connu seulement si le state est valide).
  const failParam = decoded ? PARAM_BY_KIND[decoded.kind] : 'onedrive'

  if (error || !code || !state) {
    return NextResponse.redirect(new URL(`/profil?${failParam}=error`, request.url))
  }

  if (!decoded) {
    return NextResponse.redirect(new URL('/profil?onedrive=error&reason=state_invalid', request.url))
  }
  const userId = decoded.uid
  const kind = decoded.kind
  const scope = SCOPE_BY_KIND[kind]
  const fournisseur = FOURNISSEUR_BY_KIND[kind]
  const param = PARAM_BY_KIND[kind]

  // Destination selon le rôle : admin voit « Mon Drive » dans /parametres, l'agente
  // dans /profil. On y renvoie pour que le bandeau (connected/error) s'affiche au bon endroit.
  let dest = '/profil'
  try {
    const { data: prof } = await getSupabaseAdmin().from('profiles').select('role').eq('id', userId).maybeSingle()
    if (prof?.role === 'admin') dest = '/parametres'
  } catch { /* défaut /profil */ }

  try {
    // 1) Échange code → tokens (application/x-www-form-urlencoded).
    const tokenRes = await fetch(`${authority()}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET,
        redirect_uri: process.env.MICROSOFT_REDIRECT_URI,
        grant_type: 'authorization_code',
        scope,
        code,
      }).toString(),
    })
    const tok = await tokenRes.json()
    if (!tokenRes.ok || !tok.access_token) {
      console.error('Microsoft token exchange error:', tok?.error, tok?.error_description)
      return NextResponse.redirect(new URL(`${dest}?${param}=error`, request.url))
    }

    // 2) Identité du compte (Graph /me) — pour l'affichage. Non bloquant.
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

    // 3) Stockage CHIFFRÉ (AES-256-GCM). expiry_date = epoch ms (comme Google).
    await getSupabaseAdmin().from('comptes_oauth').upsert({
      user_id: userId,
      fournisseur,
      access_token: encrypt(tok.access_token),
      refresh_token: tok.refresh_token ? encrypt(tok.refresh_token) : null,
      expiry_date: tok.expires_in ? Date.now() + tok.expires_in * 1000 : null,
      compte_email: compteEmail,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,fournisseur' })

    return NextResponse.redirect(new URL(`${dest}?${param}=connected`, request.url))
  } catch (err) {
    console.error('Microsoft OAuth callback error:', err)
    return NextResponse.redirect(new URL(`${dest}?${param}=error`, request.url))
  }
}
