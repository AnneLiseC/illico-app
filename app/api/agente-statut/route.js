// app/api/agente-statut/route.js
// POST /api/agente-statut — DÉSACTIVE (soft delete) ou RÉACTIVE une agente.
// Body : { id, actif }  (actif=false → désactiver ; actif=true → réactiver).
//
// Remplace la suppression « dure » : la ligne profiles RESTE (attribution préservée).
// Deux effets, réversibles :
//   1. ban Auth (admin.updateUserById ban_duration) → bloque la connexion ;
//      'none' = lève le ban à la réactivation.
//   2. profiles.actif = actif → reflété côté app (auth-context déconnecte une session
//      en cours si actif=false ; les listes d'assignation filtrent actif=true).

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole } from '../../lib/api-auth'

let _supabaseAdmin
function getSupabaseAdmin() {
  if (!_supabaseAdmin) _supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _supabaseAdmin
}

const BAN_DURATION = '876000h' // ~100 ans (réversible via 'none')

export async function POST(request) {
  const auth = await requireRole(request, ['admin'])
  if (auth.error) return auth.error
  try {
    const { id, actif } = await request.json()
    if (!id || typeof actif !== 'boolean') {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })
    }

    // Appartenance + rôle (service_role contourne la RLS, on la reflète) : même société,
    // et bien une agente (jamais un admin). 404 uniforme (pas de fuite cross-tenant).
    const { data: profil } = await getSupabaseAdmin()
      .from('profiles').select('role, societe_id').eq('id', id).single()
    if (!profil || profil.societe_id !== auth.profile.societe_id) {
      return NextResponse.json({ error: 'Profil introuvable' }, { status: 404 })
    }
    if (profil.role !== 'agente') {
      return NextResponse.json({ error: 'Profil non modifiable' }, { status: 400 })
    }

    // 1. Ban / unban Auth (bloque / débloque la connexion).
    const { error: banError } = await getSupabaseAdmin().auth.admin.updateUserById(id, {
      ban_duration: actif ? 'none' : BAN_DURATION,
    })
    if (banError) {
      return NextResponse.json({ error: banError.message }, { status: 400 })
    }

    // 2. Marquer actif/inactif (la ligne profiles reste → attribution préservée).
    const { error } = await getSupabaseAdmin().from('profiles').update({ actif }).eq('id', id)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
