// app/api/calendar/list/route.js
// GET /api/calendar/list?compte_oauth_id=<id> — liste les agendas d'un compte calendrier
// CONNECTÉ du user (lot 8a). LECTURE SEULE : aucune écriture (ni cible, ni compte).
//
// SCOPING : le compte est lu via un client Supabase AUTHENTIFIÉ (JWT du user). La RLS
// comptes_oauth_own (user_id = auth.uid()) ne renvoie QUE les comptes du user → impossible
// de lister les agendas du compte d'un collègue (404).
//
// DISPATCH par fournisseur, en réutilisant les builders existants :
//   google  → listGoogleCalendars  (calendarList.list)
//   icloud  → listICloudCalendars  (tsdav fetchCalendars)
// Erreurs d'auth (token Google révoqué / app-specific password iCloud invalide) → 401
// « à reconnecter », jamais un crash.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireUser } from '../../../lib/api-auth'
import { listGoogleCalendars, isGoogleAuthError } from '../../../lib/calendar/google'
import { listICloudCalendars, isCalDAVAuthError } from '../../../lib/calendar/icloud'
import { listMicrosoftCalendars, isOutlookAuthError } from '../../../lib/calendar/microsoft'

function extractToken(request) {
  const header = request.headers.get('authorization') || request.headers.get('Authorization')
  if (!header) return null
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : null
}

export async function GET(request) {
  const auth = await requireUser(request)
  if (auth.error) return auth.error

  const compteId = new URL(request.url).searchParams.get('compte_oauth_id')
  if (!compteId) {
    return NextResponse.json({ error: 'compte_oauth_id manquant' }, { status: 400 })
  }

  // Lecture SCOPÉE : client authentifié au JWT → RLS comptes_oauth_own. Renvoie le compte
  // (avec ses credentials, server-side uniquement) seulement s'il appartient au user.
  const token = extractToken(request)
  const supabaseUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } }
  )
  const { data: compte } = await supabaseUser
    .from('comptes_oauth').select('*').eq('id', compteId).maybeSingle()
  if (!compte) {
    return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 })
  }

  try {
    if (compte.fournisseur === 'google') {
      if (!compte.refresh_token) {
        return NextResponse.json({ error: 'Compte Google à reconnecter', reconnect: true }, { status: 401 })
      }
      const calendriers = await listGoogleCalendars(compte)
      return NextResponse.json({ fournisseur: 'google', calendriers })
    }
    if (compte.fournisseur === 'icloud') {
      const calendriers = await listICloudCalendars(compte)
      return NextResponse.json({ fournisseur: 'icloud', calendriers })
    }
    if (compte.fournisseur === 'outlook') {
      if (!compte.refresh_token) {
        return NextResponse.json({ error: 'Compte Outlook à reconnecter', reconnect: true }, { status: 401 })
      }
      const calendriers = await listMicrosoftCalendars(compte)
      return NextResponse.json({ fournisseur: 'outlook', calendriers })
    }
    return NextResponse.json({ error: `Fournisseur non supporté: ${compte.fournisseur}` }, { status: 400 })
  } catch (err) {
    const authFail =
      (compte.fournisseur === 'google' && isGoogleAuthError(err)) ||
      (compte.fournisseur === 'icloud' && isCalDAVAuthError(err)) ||
      (compte.fournisseur === 'outlook' && isOutlookAuthError(err))
    if (authFail) {
      return NextResponse.json(
        { error: `Compte ${compte.fournisseur} à reconnecter`, reconnect: true },
        { status: 401 }
      )
    }
    console.error('[calendar/list]', compte.fournisseur, err?.message)
    return NextResponse.json({ error: 'Erreur lors de la récupération des agendas' }, { status: 500 })
  }
}
