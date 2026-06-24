// app/api/create-agence/route.js
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole } from '../../lib/api-auth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function POST(request) {
  const auth = await requireRole(request, ['admin'])
  if (auth.error) return auth.error
  try {
    const body = await request.json()
    const { nom, ville, adresse, code_postal, telephone, email, responsable_nom } = body

    // Validation
    if (!nom?.trim() || !ville?.trim()) {
      return NextResponse.json({ error: 'Nom et ville sont requis' }, { status: 400 })
    }

    // societe_id dérivé du profil de l'admin (JAMAIS du body — non falsifiable).
    // code NON fourni : le trigger agences_generer_code_trg le génère (format LLNN).
    const { data: agence, error } = await supabaseAdmin
      .from('agences')
      .insert({
        societe_id: auth.profile.societe_id,
        nom: nom.trim(),
        ville: ville.trim(),
        adresse: adresse?.trim() || null,
        code_postal: code_postal?.trim() || null,
        telephone: telephone?.trim() || null,
        email: email?.trim() || null,
        responsable_nom: responsable_nom?.trim() || null,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, agence }, { status: 200 })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
