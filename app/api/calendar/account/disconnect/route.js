// app/api/calendar/account/disconnect/route.js
// POST /api/calendar/account/disconnect — déconnecte (supprime) un compte calendrier du
// user (lot 8c), Google ou iCloud. Body : { compte_oauth_id }.
//
// SCOPING : suppression via un client AUTHENTIFIÉ (RLS comptes_oauth_own) → un user ne peut
// supprimer QUE ses propres comptes. ⚠️ EFFET DE BORD : la FK
// cibles_calendrier.compte_oauth_id est ON DELETE SET NULL → les cibles associées
// deviennent inertes (compte_oauth_id = NULL). Le front avertit avant d'appeler.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireUser } from '../../../../lib/api-auth'

function extractToken(request) {
  const header = request.headers.get('authorization') || request.headers.get('Authorization')
  if (!header) return null
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : null
}

export async function POST(request) {
  const auth = await requireUser(request)
  if (auth.error) return auth.error

  let body
  try { body = await request.json() } catch { body = {} }
  const compteId = body.compte_oauth_id
  if (!compteId) {
    return NextResponse.json({ error: 'compte_oauth_id manquant' }, { status: 400 })
  }

  const token = extractToken(request)
  const supabaseUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } }
  )
  // RLS comptes_oauth_own : ne supprime que si le compte appartient au user. La clause
  // .select renvoie la/les ligne(s) effectivement supprimée(s) → 0 = hors périmètre.
  const { data, error } = await supabaseUser
    .from('comptes_oauth').delete().eq('id', compteId).select('id')

  if (error) {
    console.error('[account/disconnect]', error.message)
    return NextResponse.json({ error: 'Déconnexion impossible' }, { status: 500 })
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 })
  }
  return NextResponse.json({ success: true })
}
