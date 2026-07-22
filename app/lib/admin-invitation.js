// app/lib/admin-invitation.js
// Cœur de l'invitation d'un ADMIN franchisé (onboarding multi-tenant) : valide
// le domaine, refuse les doublons, envoie l'invitation Supabase et enregistre
// la ligne admin_invitations (table service_role-only).
//
// Extrait pour être partagé par DEUX appelants :
//   - POST /api/admin/invite-franchise      (secret-gated, usage historique/CLI)
//   - POST /api/super-admin/invite-admin    (éditrice connectée, depuis /super-admin)
//
// SERVEUR UNIQUEMENT (service_role). Les erreurs portent un `.status` HTTP.

import { createClient } from '@supabase/supabase-js'
import { isAllowedStaffEmail } from './email-validation'
import { sendEmail } from './email'
import { buildInvitationEmail } from './invitation-email'

let _supabaseAdmin
function getSupabaseAdmin() {
  if (!_supabaseAdmin) _supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _supabaseAdmin
}

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000  // 7 jours

function httpError(message, status) {
  const e = new Error(message)
  e.status = status
  return e
}

/**
 * Invite un admin franchisé.
 * @param {{ email: string, invited_by?: string }} params
 * @throws {Error & { status: number }}
 * @returns {Promise<{ invitationId: string }>}
 */
export async function inviteFranchiseAdmin({ email: rawEmail, invited_by = null }) {
  const email = (rawEmail || '').trim().toLowerCase()

  if (!email) throw httpError('Email requis', 400)
  if (!isAllowedStaffEmail(email)) {
    throw httpError('Les comptes staff doivent utiliser une adresse @illico-travaux.com', 400)
  }

  const db = getSupabaseAdmin()

  // Anti-doublon (statuts bloquants). Les 'revoquee' n'empêchent pas une nouvelle invitation.
  const { data: existing, error: existErr } = await db
    .from('admin_invitations')
    .select('statut')
    .eq('email', email)
    .in('statut', ['en_attente', 'consommee'])
  if (existErr) throw httpError(existErr.message, 500)
  if (existing?.some(r => r.statut === 'consommee')) {
    throw httpError('Cet email a déjà créé sa société (déjà onboardé).', 409)
  }
  if (existing?.some(r => r.statut === 'en_attente')) {
    throw httpError('Cet email a déjà une invitation en attente.', 409)
  }

  // Déjà admin d'une société existante ?
  const { data: adminProfiles, error: profErr } = await db
    .from('profiles').select('id').eq('email', email).eq('role', 'admin').limit(1)
  if (profErr) throw httpError(profErr.message, 500)
  if (adminProfiles?.length) throw httpError('Cet email est déjà admin d\'une société.', 409)

  // Lien d'invitation Supabase (crée le compte auth.users, SANS envoyer l'email
  // Supabase). L'email partira de NOTRE boîte d'envoi (Outlook), plus bas.
  const { data: linkData, error: linkError } = await db.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { data: { role: 'admin' }, redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/set-password` },
  })
  if (linkError) throw httpError(linkError.message, 409)
  const userId = linkData.user.id
  const actionLink = linkData.properties?.action_link

  // Ligne d'invitation (expiration +7j). L'index unique partiel est le filet concurrent.
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS).toISOString()
  const { data: inserted, error: insErr } = await db
    .from('admin_invitations')
    .insert({ email, user_id: userId, statut: 'en_attente', invited_by, expires_at: expiresAt })
    .select('id')
    .single()
  if (insErr) {
    // Rollback : supprimer le compte auth créé par l'invite — pas de compte orphelin.
    await db.auth.admin.deleteUser(userId)
    throw httpError(insErr.message, 500)
  }

  // Envoi de l'email d'invitation depuis la boîte d'envoi (Outlook). BEST-EFFORT :
  // le compte + la ligne d'invitation existent déjà ; un échec d'email ne les annule pas.
  let emailSent = false
  if (actionLink) {
    try {
      const { subject, html } = buildInvitationEmail({ actionLink, role: 'admin' })
      await sendEmail({ to: email, subject, html })
      emailSent = true
    } catch { /* email non envoyé : invitation créée quand même, à renvoyer */ }
  }

  return { invitationId: inserted.id, emailSent }
}
