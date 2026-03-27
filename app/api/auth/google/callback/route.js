// app/api/auth/google/callback/route.js
// Reçoit le code Google, échange contre des tokens, les stocke dans Supabase

import { google } from 'googleapis'
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

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(
      new URL('/planning?google=error', request.url)
    )
  }

  try {
    // Échanger le code contre des tokens
    const { tokens } = await oauth2Client.getToken(code)

    // Récupérer le cookie de session Supabase pour identifier l'utilisateur
    const cookieHeader = request.headers.get('cookie') || ''
    const supabaseWithCookie = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { global: { headers: { cookie: cookieHeader } } }
    )

    const { data: { user } } = await supabaseWithCookie.auth.getUser()

    if (!user) {
      return NextResponse.redirect(
        new URL('/login', request.url)
      )
    }

    // Stocker les tokens dans Supabase
    await supabaseAdmin.from('google_tokens').upsert({
      user_id: user.id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      expiry_date: tokens.expiry_date || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

    return NextResponse.redirect(
      new URL('/planning?google=connected', request.url)
    )
  } catch (err) {
    console.error('Google OAuth error:', err)
    return NextResponse.redirect(
      new URL('/planning?google=error', request.url)
    )
  }
}