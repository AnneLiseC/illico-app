// app/api/update-agence/route.js
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole } from '../../lib/api-auth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function PATCH(request) {
  const auth = await requireRole(request, ['admin'])
  if (auth.error) return auth.error
  try {
    const body = await request.json()
    const { agence_id, nom, ville, adresse, code_postal, telephone, email, responsable_nom } = body

    if (!agence_id) {
      return NextResponse.json({ error: 'agence_id requis' }, { status: 400 })
    }
    // nom et ville sont NOT NULL en base.
    if (!nom?.trim() || !ville?.trim()) {
      return NextResponse.json({ error: 'Nom et ville sont requis' }, { status: 400 })
    }

    // Contrôle d'appartenance AVANT écriture (service_role contourne la RLS) :
    // l'agence doit appartenir à la société de l'admin. 404 uniforme (introuvable
    // ou autre société : même réponse, pas de fuite d'existence cross-tenant).
    const { data: agence } = await supabaseAdmin
      .from('agences').select('id, societe_id').eq('id', agence_id).single()
    if (!agence || agence.societe_id !== auth.profile.societe_id) {
      return NextResponse.json({ error: 'Agence introuvable' }, { status: 404 })
    }

    // Whitelist STRICTE — objet construit champ par champ (jamais de spread du body).
    // JAMAIS code (généré par trigger BEFORE INSERT, non recalculé en UPDATE),
    // societe_id (tenant immuable), id ni created_at.
    const updates = {
      nom: nom.trim(),
      ville: ville.trim(),
      adresse: adresse?.trim() || null,
      code_postal: code_postal?.trim() || null,
      telephone: telephone?.trim() || null,
      email: email?.trim() || null,
      responsable_nom: responsable_nom?.trim() || null,
    }

    const { data: updated, error } = await supabaseAdmin
      .from('agences').update(updates).eq('id', agence_id).select().single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, agence: updated }, { status: 200 })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
