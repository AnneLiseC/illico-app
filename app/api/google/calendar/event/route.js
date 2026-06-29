// app/api/google/calendar/event/route.js
// Supprime un événement Google Calendar lors de la suppression d'un RDV / intervention.
//
// LOT 5c — BASCULE SUR LES CIBLES (via app/lib/calendar/google.js) :
//   Le calendrier + les tokens ne viennent plus de GOOGLE_CALENDAR_ID + du user
//   courant, mais de la CIBLE de l'item. Comme l'item est souvent déjà supprimé en
//   base au moment de l'appel (fiche chantier), le front passe `cibleId` (qu'il
//   possède dans l'objet rdv/intervention) → getCalendarForCible → deleteEvent.
//   DRY-RUN géré par la lib (deleteEvent logge sans supprimer).
//
//   Garde-fou scoping (stratégie a) : on vérifie via la RLS AUTHENTIFIÉE que la cible
//   visée est dans le périmètre du user (cibles_calendrier = perso ∪ agence ∪ admin-
//   société), pour bloquer un cibleId forgé hors tenant.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireUser } from '../../../../lib/api-auth'
import { getCalendarForCible, deleteEvent } from '../../../../lib/calendar/google'

function extractToken(request) {
  const header = request.headers.get('authorization') || request.headers.get('Authorization')
  if (!header) return null
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : null
}

export async function DELETE(request) {
  const auth = await requireUser(request)
  if (auth.error) return auth.error
  try {
    const body = await request.json()
    const { googleEventId, cibleId } = body

    // Rien à supprimer côté Google : pas d'event (item jamais poussé) ou pas de cible
    // (un item sans cible n'a jamais été poussé) → skip propre.
    if (!googleEventId) {
      return NextResponse.json({ success: true, skipped: true, reason: 'pas d\'event' })
    }
    if (!cibleId) {
      console.log('[event] pas de cible → rien à supprimer')
      return NextResponse.json({ success: true, skipped: true, reason: 'sans cible' })
    }

    // GARDE-FOU scoping : la cible visée est-elle dans le périmètre du user ? Lecture
    // AUTHENTIFIÉE (RLS cibles_calendrier). Bloque un cibleId forgé hors tenant.
    const token = extractToken(request)
    const supabaseUser = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } }
    )
    const { data: autorise } = await supabaseUser
      .from('cibles_calendrier').select('id').eq('id', cibleId).maybeSingle()
    if (!autorise) {
      console.log('[event] cible', cibleId, '— hors périmètre (RLS), refusé')
      return NextResponse.json({ error: 'Hors périmètre' }, { status: 403 })
    }

    // Résolution cible → calendrier + tokens du compte détenteur (service_role, lib).
    const resolved = await getCalendarForCible(cibleId)
    if (!resolved) {
      console.log('[event] cible', cibleId, '— non résolvable (compte OAuth/token absent), skip')
      return NextResponse.json({ success: true, skipped: true, reason: 'cible non résolvable' })
    }

    try {
      await deleteEvent({
        calendar: resolved.calendar, calendarId: resolved.calendarId,
        eventId: googleEventId, contexte: { type: 'event-delete', itemId: googleEventId },
      })
    } catch (err) {
      // L'event n'existe plus côté Google (déjà supprimé) → pas une erreur critique.
      if (err.code === 410 || err.code === 404) {
        return NextResponse.json({ success: true, alreadyDeleted: true })
      }
      throw err
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Delete Google event error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
