// app/lib/agent-provisioning.js
// Cœur de la CRÉATION d'un compte agent (invite Auth + profil + objectif).
// Extrait de l'ancien POST /api/create-agente : la création est désormais
// réservée à l'ÉDITRICE (super-admin), qui honore une demande d'agent. Ce
// module est le seul endroit qui invite/crée un agent — appelé par la route
// /api/super-admin/agent-requests/[id] (validation), jamais par un admin.
//
// SERVEUR UNIQUEMENT (service_role). Ne pas importer côté client.

import { createClient } from '@supabase/supabase-js'
import { isAllowedStaffEmail } from './email-validation'
import { sendEmail } from './email'
import { buildInvitationEmail } from './invitation-email'

let _supabaseAdmin
function getSupabaseAdmin() {
  if (!_supabaseAdmin) _supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _supabaseAdmin
}

/**
 * Validation PURE des champs d'identité d'une demande/création d'agent.
 * (email : format réseau vérifié séparément par isAllowedStaffEmail côté serveur,
 * pas ici, pour rester testable sans env.)
 * @returns {string|null} message d'erreur, ou null si OK.
 */
export function validateAgentIdentity({ prenom, nom, email }) {
  if (!prenom || !String(prenom).trim()) return 'Prénom requis'
  if (!nom || !String(nom).trim())       return 'Nom requis'
  if (!email || !String(email).trim())   return 'Email requis'
  // format email minimal (une @ avec du texte de part et d'autre, pas d'espace)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) return 'Email invalide'
  return null
}

/**
 * Crée un agent : invitation Auth (email), profil `profiles`, objectif de CA
 * optionnel. Rollback du compte Auth si l'insert profil échoue (pas d'orphelin).
 *
 * La société / l'agence NE sont PAS déduites d'un profil appelant (l'éditrice
 * n'en a pas) : elles sont fournies explicitement par l'appelant, qui les a
 * déjà validées (agence ∈ société).
 *
 * @throws {Error} message clair en cas d'échec (invite, profil).
 * @returns {Promise<{ userId: string }>}
 */
export async function provisionAgent({
  prenom, nom, email, telephone,
  redevance_debut, redevance_mensuelle_ht,
  part_agente_defaut, frais_part_agente_defaut, parts_agente_disponibles,
  objectif, societe_id, agence_id,
}) {
  const identityErr = validateAgentIdentity({ prenom, nom, email })
  if (identityErr) throw new Error(identityErr)

  if (!isAllowedStaffEmail(email)) {
    throw new Error('Les comptes staff doivent utiliser une adresse @illico-travaux.com')
  }
  if (!societe_id || !agence_id) {
    throw new Error('Société et agence requises')
  }
  if (redevance_mensuelle_ht != null && (isNaN(Number(redevance_mensuelle_ht)) || Number(redevance_mensuelle_ht) < 0)) {
    throw new Error('Redevance mensuelle invalide (nombre positif attendu)')
  }

  const db = getSupabaseAdmin()

  // 1. Génère le lien d'invitation Supabase (crée le compte auth, SANS envoyer
  //    l'email Supabase). L'email partira de NOTRE boîte d'envoi (Outlook), plus bas.
  const { data: linkData, error: linkError } = await db.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { data: { prenom, nom, role: 'agente' }, redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/set-password` },
  })
  if (linkError) throw new Error(linkError.message)

  const userId = linkData.user.id
  const actionLink = linkData.properties?.action_link

  // 2. Profil dans profiles.
  const { error: profileError } = await db.from('profiles').insert({
    id: userId,
    prenom, nom, email,
    telephone: telephone || null,
    redevance_debut: redevance_debut || null,
    redevance_mensuelle_ht: redevance_mensuelle_ht != null ? Number(redevance_mensuelle_ht) : null,
    role: 'agente',
    societe_id,
    agence_id,
    part_agente_defaut: part_agente_defaut || 0.5,
    frais_part_agente_defaut: frais_part_agente_defaut || 0.5,
    parts_agente_disponibles: parts_agente_disponibles || null,
  })
  if (profileError) {
    // Rollback : supprimer le compte auth si le profil échoue.
    await db.auth.admin.deleteUser(userId)
    throw new Error(profileError.message)
  }

  // 3. Objectif de CA (annuel) — non bloquant : si l'objectif échoue, l'agente
  //    reste créée (réglable ensuite en édition). Pas de rollback Auth ici.
  if (objectif != null) {
    try {
      await db.from('objectifs_ca').insert({
        annee: new Date().getFullYear(),
        cible: 'agente',
        agente_id: userId,
        agence_id,
        montant: parseFloat(objectif) || 0,
      })
    } catch {
      // silencieux : l'objectif reste réglable en édition.
    }
  }

  // 4. Envoi de l'email d'invitation depuis la boîte d'envoi (Outlook). BEST-EFFORT :
  //    le compte est déjà créé — si l'email échoue (boîte non connectée p.ex.), on ne
  //    supprime PAS l'agent ; on remonte l'info pour que l'éditrice puisse renvoyer.
  let emailSent = false
  if (actionLink) {
    try {
      const { subject, html } = buildInvitationEmail({ prenom, nom, actionLink, role: 'agente' })
      await sendEmail({ to: email, subject, html })
      emailSent = true
    } catch { /* email non envoyé : compte créé quand même, à renvoyer */ }
  }

  return { userId, emailSent }
}
