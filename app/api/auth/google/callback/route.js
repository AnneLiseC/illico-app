// app/api/auth/google/callback/route.js
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
  const userId = searchParams.get('state') // userId passé dans le state OAuth

  if (error || !code || !userId) {
    console.error('Callback error:', { error, code: !!code, userId })
    return NextResponse.redirect(new URL('/planning?google=error', request.url))
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