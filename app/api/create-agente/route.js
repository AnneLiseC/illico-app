// app/api/create-agente/route.js
// ⚠️ La CRÉATION d'agent n'est PLUS ici. Depuis le cadrage « création des
// utilisateurs », créer un compte est RÉSERVÉ à l'éditrice (super-admin) :
//   - l'admin DÉPOSE une demande         → POST /api/agent-requests
//   - l'éditrice l'honore (création)     → POST /api/super-admin/agent-requests/[id]
//     (logique de création : app/lib/agent-provisioning.js)
// Ce fichier ne conserve que le PATCH d'ÉDITION (l'admin garde la main sur les
// parts, redevances, objectif, KBIS de SES agents — inchangé).
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole } from '../../lib/api-auth'

let _supabaseAdmin
function getSupabaseAdmin() {
  if (!_supabaseAdmin) _supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _supabaseAdmin
}

export async function PATCH(request) {
  const auth = await requireRole(request, ['admin'])
  if (auth.error) return auth.error
  try {
    const body = await request.json()
    const { id, prenom, nom, telephone, redevance_debut, redevance_mensuelle_ht, part_agente_defaut, frais_part_agente_defaut, kbis_url, parts_agente_disponibles } = body

    if (!id) {
      return NextResponse.json({ error: 'ID requis' }, { status: 400 })
    }

    // Redevance mensuelle (HT) : optionnelle (NULL = à paramétrer). Si fournie
    // (non null), doit être un nombre >= 0.
    if (redevance_mensuelle_ht != null && (isNaN(Number(redevance_mensuelle_ht)) || Number(redevance_mensuelle_ht) < 0)) {
      return NextResponse.json({ error: 'Redevance mensuelle invalide (nombre positif attendu)' }, { status: 400 })
    }

    const updates = {}
    if (prenom !== undefined)                   updates.prenom = prenom
    if (nom !== undefined)                      updates.nom = nom
    if (telephone !== undefined)                updates.telephone = telephone
    if (redevance_debut !== undefined)          updates.redevance_debut = redevance_debut
    if (redevance_mensuelle_ht !== undefined)   updates.redevance_mensuelle_ht = redevance_mensuelle_ht != null ? Number(redevance_mensuelle_ht) : null
    if (part_agente_defaut !== undefined)       updates.part_agente_defaut = part_agente_defaut
    if (frais_part_agente_defaut !== undefined) updates.frais_part_agente_defaut = frais_part_agente_defaut
    if (parts_agente_disponibles !== undefined) updates.parts_agente_disponibles = parts_agente_disponibles
    if (kbis_url !== undefined)                 updates.kbis_url = kbis_url

    // Contrôle d'appartenance — service_role contourne la RLS, on la reflète :
    // un admin n'édite que les profils de SA société. 404 uniforme (introuvable
    // ou autre société : même réponse, pas de fuite d'existence cross-tenant).
    const { data: cible } = await getSupabaseAdmin().from('profiles').select('societe_id').eq('id', id).single()
    if (!cible || cible.societe_id !== auth.profile.societe_id) {
      return NextResponse.json({ error: 'Profil introuvable' }, { status: 404 })
    }

    const { error } = await getSupabaseAdmin().from('profiles').update(updates).eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// La suppression « dure » d'une agente (hard delete) a été RETIRÉE : elle cassait
// l'attribution (FK NO ACTION) et détruisait des données. On DÉSACTIVE désormais
// (soft delete réversible) via POST /api/agente-statut { id, actif:false }.