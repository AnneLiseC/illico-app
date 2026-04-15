// app/api/create-agente/route.js
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function POST(request) {
  try {
    const body = await request.json()
    const { prenom, nom, email, telephone, part_agente_defaut, frais_part_agente_defaut } = body

    // Validation
    if (!prenom || !nom || !email) {
      return NextResponse.json({ error: 'Prénom, nom et email sont requis' }, { status: 400 })
    }

    // 1. Inviter l'utilisateur via Supabase Auth — envoie l'email d'invitation
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: {
        prenom,
        nom,
        role: 'agente',
      },
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/login`,
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
        part_agente_defaut: part_agente_defaut || 0.5,
        frais_part_agente_defaut: frais_part_agente_defaut || 0.5,
      })

    if (profileError) {
      // Rollback : supprimer l'utilisateur auth si le profil échoue
      await supabaseAdmin.auth.admin.deleteUser(userId)
      return NextResponse.json({ error: profileError.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, userId })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json()
    const { id, prenom, nom, telephone, part_agente_defaut, frais_part_agente_defaut, kbis_url } = body

    if (!id) {
      return NextResponse.json({ error: 'ID requis' }, { status: 400 })
    }

    const updates = {}
    if (prenom !== undefined)                   updates.prenom = prenom
    if (nom !== undefined)                      updates.nom = nom
    if (telephone !== undefined)                updates.telephone = telephone
    if (part_agente_defaut !== undefined)       updates.part_agente_defaut = part_agente_defaut
    if (frais_part_agente_defaut !== undefined) updates.frais_part_agente_defaut = frais_part_agente_defaut
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