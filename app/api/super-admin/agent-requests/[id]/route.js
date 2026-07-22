// app/api/super-admin/agent-requests/[id]/route.js
// L'éditrice HONORE ou REJETTE une demande d'agent.
//   POST { action: 'fulfill' } → crée + invite l'agent, marque la demande 'traitee'.
//   POST { action: 'reject'  } → marque la demande 'rejetee' (aucun compte créé).
//
// Anti-double-clic : on « réserve » la demande par un UPDATE CONDITIONNEL
// (…eq('statut','en_attente')). Si 0 ligne, un autre traitement l'a déjà prise.
// En cas d'échec de création, on REND la demande (retour 'en_attente').

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '../../../../lib/api-auth'
import { provisionAgent } from '../../../../lib/agent-provisioning'

let _supabaseAdmin
function getSupabaseAdmin() {
  if (!_supabaseAdmin) _supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _supabaseAdmin
}

export async function POST(request, { params }) {
  const auth = await requireSuperAdmin(request)
  if (auth.error) return auth.error

  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const action = body.action

    if (!['fulfill', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Action invalide' }, { status: 400 })
    }

    const db = getSupabaseAdmin()

    // ── REJET ────────────────────────────────────────────────────────────────
    if (action === 'reject') {
      const { data, error } = await db.from('demandes_agents')
        .update({ statut: 'rejetee', traite_at: new Date().toISOString() })
        .eq('id', id).eq('statut', 'en_attente')
        .select('id').maybeSingle()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (!data) return NextResponse.json({ error: 'Demande introuvable ou déjà traitée.' }, { status: 409 })
      return NextResponse.json({ success: true })
    }

    // ── VALIDATION (fulfill) ──────────────────────────────────────────────────
    // 1. Réserver la demande (claim conditionnel). On récupère ses données.
    const { data: claimed, error: claimErr } = await db.from('demandes_agents')
      .update({ statut: 'traitee', traite_at: new Date().toISOString() })
      .eq('id', id).eq('statut', 'en_attente')
      .select('id, prenom, nom, email, societe_id, agence_id').maybeSingle()
    if (claimErr) return NextResponse.json({ error: claimErr.message }, { status: 500 })
    if (!claimed) return NextResponse.json({ error: 'Demande introuvable ou déjà traitée.' }, { status: 409 })

    // 2. Créer + inviter l'agent. Pas de paramètres financiers ici : l'admin les
    //    réglera ensuite en édition (redevance, parts, objectif).
    try {
      const { userId } = await provisionAgent({
        prenom: claimed.prenom, nom: claimed.nom, email: claimed.email,
        societe_id: claimed.societe_id, agence_id: claimed.agence_id,
      })
      // 3. Lier l'agent créé à la demande.
      await db.from('demandes_agents').update({ agente_id: userId }).eq('id', id)
      return NextResponse.json({ success: true, userId }, { status: 200 })
    } catch (e) {
      // Échec création → on REND la demande (retour 'en_attente') pour réessai.
      await db.from('demandes_agents').update({ statut: 'en_attente', traite_at: null }).eq('id', id)
      return NextResponse.json({ error: e.message || 'Création impossible' }, { status: 400 })
    }
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
