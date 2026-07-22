// app/api/super-admin/agent-requests/route.js
// GET : l'éditrice liste TOUTES les demandes d'agents (tous tenants), avec les
// libellés société/agence. Barrière requireSuperAdmin. service_role ensuite.
//
// INVARIANT : cette route ne renvoie QUE des demandes de comptes — aucune
// donnée métier (dossiers, clients, finances). Le cloisonnement RGPD tient.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '../../../lib/api-auth'

let _supabaseAdmin
function getSupabaseAdmin() {
  if (!_supabaseAdmin) _supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _supabaseAdmin
}

export async function GET(request) {
  const auth = await requireSuperAdmin(request)
  if (auth.error) return auth.error

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('demandes_agents')
      .select('id, prenom, nom, email, statut, created_at, traite_at, societe:societes(nom_societe), agence:agences(nom)')
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ demandes: data || [] })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
