// app/api/google/calendar/event/route.js
// Supprime un événement Google Calendar

import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID

export async function DELETE(request) {
  try {
    const body = await request.json()
    const { userId, googleEventId } = body

    if (!userId || !googleEventId) {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })
    }

    // Récupérer les tokens
    const { data: tokenData } = await supabaseAdmin
      .from('google_tokens')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (!tokenData) {
      // Pas connecté à Google → pas grave, on ignore silencieusement
      return NextResponse.json({ success: true, skipped: true })
    }

    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    )
    auth.setCredentials({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expiry_date: tokenData.expiry_date,
    })

    auth.on('tokens', async (tokens) => {
      if (tokens.access_token) {
        await supabaseAdmin.from('google_tokens').update({
          access_token: tokens.access_token,
          expiry_date: tokens.expiry_date,
          updated_at: new Date().toISOString(),
        }).eq('user_id', userId)
      }
    })

    const calendar = google.calendar({ version: 'v3', auth })

    await calendar.events.delete({
      calendarId: CALENDAR_ID,
      eventId: googleEventId,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    // Si l'event n'existe plus dans Google (déjà supprimé), ce n'est pas une erreur critique
    if (err.code === 410 || err.code === 404) {
      return NextResponse.json({ success: true, alreadyDeleted: true })
    }
    console.error('Delete Google event error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}