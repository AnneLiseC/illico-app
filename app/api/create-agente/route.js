// app/api/create-agente/route.js
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole } from '../../lib/api-auth'
import { isAllowedStaffEmail } from '../../lib/email-validation'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function POST(request) {
  const auth = await requireRole(request, ['admin'])
  if (auth.error) return auth.error
  try {
    const body = await request.json()
    const { prenom, nom, email, telephone, part_agente_defaut, frais_part_agente_defaut, parts_agente_disponibles, objectif, agence_id } = body

    // Validation
    if (!prenom || !nom || !email) {
      return NextResponse.json({ error: 'Prénom, nom et email sont requis' }, { status: 400 })
    }

    // Règle réseau : un compte staff doit utiliser une adresse @illico-travaux.com
    // (sauf exceptions STAFF_EMAIL_EXCEPTIONS). Barrière SERVEUR — refus AVANT
    // toute création de compte.
    if (!isAllowedStaffEmail(email)) {
      return NextResponse.json({ error: 'Les comptes staff doivent utiliser une adresse @illico-travaux.com' }, { status: 400 })
    }

    // Résoudre l'agence cible AVANT toute création de compte (pas d'orphelin auth).
    // - agence_id fourni (multi-agences) → valider qu'il appartient à la société de
    //   l'admin (barrière : .eq('societe_id') du JWT → agence étrangère = 0 ligne = rejet).
    // - agence_id absent (mono-agence) → déduction de l'unique agence (.order('code') déterministe).
    let agenceId
    if (agence_id) {
      const { data: ag } = await supabaseAdmin
        .from('agences').select('id').eq('id', agence_id).eq('societe_id', auth.profile.societe_id).maybeSingle()
      if (!ag) {
        return NextResponse.json({ error: 'Agence invalide' }, { status: 400 })
      }
      agenceId = ag.id
    } else {
      const { data: ag } = await supabaseAdmin
        .from('agences').select('id').eq('societe_id', auth.profile.societe_id).order('code').limit(1).single()
      if (!ag?.id) {
        return NextResponse.json({ error: 'Aucune agence trouvée pour la société de l\'admin' }, { status: 500 })
      }
      agenceId = ag.id
    }

    // 1. Inviter l'utilisateur via Supabase Auth — envoie l'email d'invitation
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: {
        prenom,
        nom,
        role: 'agente',
      },
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/set-password`,
    })

    if (inviteError) {
      return NextResponse.json({ error: inviteError.message }, { status: 400 })
    }

    const userId = inviteData.user.id

    // 2. Créer le profil dans profiles
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: userId,
        prenom,
        nom,
        email,
        telephone: telephone || null,
        role: 'agente',
        societe_id: auth.profile.societe_id,
        agence_id: agenceId,
        part_agente_defaut: part_agente_defaut || 0.5,
        frais_part_agente_defaut: frais_part_agente_defaut || 0.5,
        parts_agente_disponibles: parts_agente_disponibles || null,
      })

    if (profileError) {
      // Rollback : supprimer l'utilisateur auth si le profil échoue
      await supabaseAdmin.auth.admin.deleteUser(userId)
      return NextResponse.json({ error: profileError.message }, { status: 400 })
    }

    // 3. Objectif de CA (annuel) de l'agente — avec l'agence_id attribué ci-dessus.
    //    Tolérance échec partiel : si l'objectif échoue, l'agente reste créée
    //    (réglable ensuite en édition). PAS de rollback Auth pour un objectif raté.
    if (objectif != null) {
      try {
        await supabaseAdmin.from('objectifs_ca').insert({
          annee: new Date().getFullYear(),
          cible: 'agente',
          agente_id: userId,
          agence_id: agenceId,
          montant: parseFloat(objectif) || 0,
        })
      } catch {
        // Objectif non bloquant : l'agente est créée, l'objectif reste réglable en édition.
      }
    }

    return NextResponse.json({ success: true, userId })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(request) {
  const auth = await requireRole(request, ['admin'])
  if (auth.error) return auth.error
  try {
    const body = await request.json()
    const { id, prenom, nom, telephone, redevance_debut, part_agente_defaut, frais_part_agente_defaut, kbis_url, parts_agente_disponibles } = body

    if (!id) {
      return NextResponse.json({ error: 'ID requis' }, { status: 400 })
    }

    const updates = {}
    if (prenom !== undefined)                   updates.prenom = prenom
    if (nom !== undefined)                      updates.nom = nom
    if (telephone !== undefined)                updates.telephone = telephone
    if (redevance_debut !== undefined)          updates.redevance_debut = redevance_debut
    if (part_agente_defaut !== undefined)       updates.part_agente_defaut = part_agente_defaut
    if (frais_part_agente_defaut !== undefined) updates.frais_part_agente_defaut = frais_part_agente_defaut
    if (parts_agente_disponibles !== undefined) updates.parts_agente_disponibles = parts_agente_disponibles
    if (kbis_url !== undefined)                 updates.kbis_url = kbis_url

    const { error } = await supabaseAdmin.from('profiles').update(updates).eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(request) {
  const auth = await requireRole(request, ['admin'])
  if (auth.error) return auth.error
  try {
    const body = await request.json()
    const { id } = body

    if (!id) {
      return NextResponse.json({ error: 'ID requis' }, { status: 400 })
    }

    // Vérifier que c'est bien une agente (pas un admin)
    const { data: profil } = await supabaseAdmin.from('profiles').select('role').eq('id', id).single()
    if (!profil || profil.role !== 'agente') {
      return NextResponse.json({ error: 'Profil introuvable ou non supprimable' }, { status: 400 })
    }

    // Supprimer l'utilisateur Supabase Auth (cascade vers le profil si FK configurée)
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(id)
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    // Supprimer le profil (sécurité si pas de cascade)
    await supabaseAdmin.from('profiles').delete().eq('id', id)

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}