// app/api/admin/invite-franchise/route.js
// Route d'invitation d'un nouvel ADMIN franchisé (onboarding multi-tenant).
// Appelée UNIQUEMENT par Anne-Lise, protégée par secret (ADMIN_INVITE_SECRET) —
// pas d'utilisateur authentifié, pas de rôle au-dessus d'admin dans l'app.
// Valide le domaine, refuse les doublons, envoie l'invitation Supabase et
// enregistre la ligne admin_invitations (table service_role-only, sous-lot 3a-1).

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isAllowedStaffEmail } from '../../../lib/email-validation'
import { checkBearerSecret } from '../../../lib/http-auth'

let _supabaseAdmin
function getSupabaseAdmin() {
  if (!_supabaseAdmin) _supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _supabaseAdmin
}

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000  // 7 jours

export async function POST(request) {
  // 1. Secret (fail-closed + timing-safe) — barrière d'accès à la route.
  if (!checkBearerSecret(request, process.env.ADMIN_INVITE_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const email = (body.email || '').trim().toLowerCase()
    const invited_by = body.invited_by || null

    // 2. Champ requis
    if (!email) {
      return NextResponse.json({ error: 'Email requis' }, { status: 400 })
    }

    // 3. Domaine réseau (helper partagé avec create-agente)
    if (!isAllowedStaffEmail(email)) {
      return NextResponse.json({ error: 'Les comptes staff doivent utiliser une adresse @illico-travaux.com' }, { status: 400 })
    }

    // 4. Anti-doublon (lectures en service_role — la table est service_role-only).
    //    On récupère les statuts bloquants (en_attente / consommee) pour cet email.
    //    Les 'revoquee' n'empêchent pas une nouvelle invitation.
    const { data: existing, error: existErr } = await getSupabaseAdmin()
      .from('admin_invitations')
      .select('statut')
      .eq('email', email)
      .in('statut', ['en_attente', 'consommee'])
    if (existErr) {
      return NextResponse.json({ error: existErr.message }, { status: 500 })
    }
    if (existing?.some(r => r.statut === 'consommee')) {
      return NextResponse.json({ error: 'Cet email a déjà créé sa société (déjà onboardé).' }, { status: 409 })
    }
    if (existing?.some(r => r.statut === 'en_attente')) {
      return NextResponse.json({ error: 'Cet email a déjà une invitation en attente.' }, { status: 409 })
    }

    // 5. Déjà admin d'une société existante ? (source : profiles.email)
    const { data: adminProfiles, error: profErr } = await getSupabaseAdmin()
      .from('profiles')
      .select('id')
      .eq('email', email)
      .eq('role', 'admin')
      .limit(1)
    if (profErr) {
      return NextResponse.json({ error: profErr.message }, { status: 500 })
    }
    if (adminProfiles?.length) {
      return NextResponse.json({ error: 'Cet email est déjà admin d\'une société.' }, { status: 409 })
    }

    // 6. Invitation Supabase — crée le compte auth.users immédiatement (id dispo).
    //    Échoue si l'email a déjà un compte auth (emails uniques) → message clair.
    const { data: inviteData, error: inviteError } = await getSupabaseAdmin().auth.admin.inviteUserByEmail(email, {
      data: { role: 'admin' },
      // PROVISOIRE 3a — redirectTo à rebrancher vers l'écran de création société en 3c.
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/set-password`,
    })
    if (inviteError) {
      return NextResponse.json({ error: inviteError.message }, { status: 409 })
    }
    const userId = inviteData.user.id

    // 7. Ligne d'invitation (expiration à +7j). L'index unique partiel
    //    (email WHERE statut='en_attente') est le filet anti-doublon concurrent.
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS).toISOString()
    const { data: inserted, error: insErr } = await getSupabaseAdmin()
      .from('admin_invitations')
      .insert({ email, user_id: userId, statut: 'en_attente', invited_by, expires_at: expiresAt })
      .select('id')
      .single()

    // 8. Rollback : si l'INSERT échoue (dont collision sur l'index unique partiel),
    //    supprimer le compte auth créé par l'invite — pas de compte orphelin.
    if (insErr) {
      await getSupabaseAdmin().auth.admin.deleteUser(userId)
      return NextResponse.json({ error: insErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, invitationId: inserted.id }, { status: 200 })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
