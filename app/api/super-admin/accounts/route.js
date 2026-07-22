// app/api/super-admin/accounts/route.js
// GET : annuaire des COMPTES pour l'éditrice, groupé par société → agences →
// comptes staff (admin + agente). Barrière requireSuperAdmin, service_role ensuite.
//
// INVARIANT RGPD : uniquement des comptes utilisateurs (admin/agente). JAMAIS de
// données tenant — pas de clients, pas de dossiers, pas de finances. Les CLIENTS
// (role='client') sont exclus : ce sont des données métier des franchisés.

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
    const db = getSupabaseAdmin()
    const [{ data: societes, error: socErr }, { data: agences, error: agErr }, { data: profiles, error: profErr }] = await Promise.all([
      db.from('societes').select('id, nom_societe').order('nom_societe'),
      db.from('agences').select('id, nom, code, societe_id').order('code'),
      db.from('profiles').select('id, prenom, nom, email, role, actif, societe_id, agence_id').in('role', ['admin', 'agente']).order('prenom'),
    ])
    if (socErr || agErr || profErr) {
      return NextResponse.json({ error: (socErr || agErr || profErr).message }, { status: 500 })
    }

    // Groupage société → { agences, comptes }.
    const parSociete = (societes || []).map(s => ({
      id: s.id,
      nom_societe: s.nom_societe,
      agences: (agences || []).filter(a => a.societe_id === s.id),
      comptes: (profiles || []).filter(p => p.societe_id === s.id),
    }))

    return NextResponse.json({ societes: parSociete })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
