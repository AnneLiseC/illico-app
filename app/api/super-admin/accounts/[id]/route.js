// app/api/super-admin/accounts/[id]/route.js
// L'éditrice DÉSACTIVE / RÉACTIVE un compte (réversible ; JAMAIS de suppression
// définitive — le hard delete casse les attributions). Barrière requireSuperAdmin.
//   POST { actif: false } → désactive (ban Auth + profiles.actif=false)
//   POST { actif: true  } → réactive  (lève le ban + profiles.actif=true)
//
// CASCADE (choix produit) : désactiver un FRANCHISÉ (admin) désactive AUSSI tous
// les agents de sa société — on ne laisse pas d'agent actif sans franchisé.
// La RÉACTIVATION d'un franchisé ne réactive PAS ses agents (à réactiver un par
// un, volontairement).
//
// Même mécanique de ban que /api/agente-statut (updateUserById ban_duration).

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '../../../../lib/api-auth'

let _supabaseAdmin
function getSupabaseAdmin() {
  if (!_supabaseAdmin) _supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _supabaseAdmin
}

const BAN_DURATION = '876000h' // ~100 ans (réversible via 'none')

async function setActif(db, id, actif) {
  const { error: banError } = await db.auth.admin.updateUserById(id, { ban_duration: actif ? 'none' : BAN_DURATION })
  if (banError) throw new Error(banError.message)
  const { error } = await db.from('profiles').update({ actif }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function POST(request, { params }) {
  const auth = await requireSuperAdmin(request)
  if (auth.error) return auth.error

  try {
    const { id } = await params
    const { actif } = await request.json()
    if (typeof actif !== 'boolean') {
      return NextResponse.json({ error: 'Paramètre actif manquant' }, { status: 400 })
    }

    const db = getSupabaseAdmin()

    // Cible : doit exister et être un compte staff (admin/agente), jamais un client.
    const { data: profil } = await db.from('profiles').select('role, societe_id').eq('id', id).single()
    if (!profil || !['admin', 'agente'].includes(profil.role)) {
      return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 })
    }

    // 1. Le compte ciblé.
    await setActif(db, id, actif)

    // 2. Cascade : désactivation d'un franchisé → désactive toute sa société.
    let cascade = 0
    if (profil.role === 'admin' && actif === false && profil.societe_id) {
      const { data: agents } = await db.from('profiles')
        .select('id').eq('societe_id', profil.societe_id).eq('role', 'agente')
      for (const a of (agents || [])) {
        try { await setActif(db, a.id, false); cascade++ } catch { /* on continue : best-effort par agent */ }
      }
    }

    return NextResponse.json({ success: true, cascade })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
