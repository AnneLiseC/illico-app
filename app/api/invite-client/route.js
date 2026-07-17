// app/api/invite-client/route.js
// Invitation d'un CLIENT à créer son compte (espace client).
// Le serveur CRÉE le compte + GÉNÈRE le lien de définition de mot de passe
// (generateLink, service_role) SANS envoyer d'email : il renvoie l'action_link au
// front, qui ouvre un brouillon mailto que le référent envoie de sa propre boîte.
//   - 1er appel  : type 'invite'   → crée auth.users + insert profiles (+ rollback).
//   - compte déjà créé : type 'recovery' → régénère un lien SANS recréer (renvoi).
// Le client invité a role='client' et client_id = le client du dossier → son accès
// est scopé automatiquement par mes_dossiers_client() (RLS existante).
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole } from '../../lib/api-auth'

let _supabaseAdmin
function getSupabaseAdmin() {
  if (!_supabaseAdmin) _supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _supabaseAdmin
}

export async function POST(request) {
  // 1. Gate : staff uniquement (le référent du dossier, ou un admin de la société).
  const auth = await requireRole(request, ['admin', 'agente'])
  if (auth.error) return auth.error
  try {
    const { dossierId } = await request.json()
    if (!dossierId) {
      return NextResponse.json({ error: 'dossierId requis' }, { status: 400 })
    }

    // 2. Charger le dossier + CONTRÔLE D'APPARTENANCE (service_role contourne la
    //    RLS → on la reflète). agente : référente du dossier ; admin : sa société.
    //    404 uniforme (introuvable ou hors périmètre : même réponse).
    const { data: dossier } = await getSupabaseAdmin()
      .from('dossiers')
      .select('id, client_id, societe_id, agence_id, referente_id')
      .eq('id', dossierId)
      .maybeSingle()

    const isAdmin = auth.profile.role === 'admin'
    const owns = dossier && (isAdmin
      ? dossier.societe_id === auth.profile.societe_id
      : dossier.referente_id === auth.user.id)
    if (!owns) {
      return NextResponse.json({ error: 'Dossier introuvable' }, { status: 404 })
    }
    if (!dossier.client_id) {
      return NextResponse.json({ error: 'Ce dossier n\'a pas de client associé' }, { status: 400 })
    }

    // 3. Lire le client du dossier (email/prénom/nom).
    const { data: client } = await getSupabaseAdmin()
      .from('clients')
      .select('id, email, prenom, nom')
      .eq('id', dossier.client_id)
      .maybeSingle()
    if (!client) {
      return NextResponse.json({ error: 'Client introuvable' }, { status: 404 })
    }
    const email = (client.email || '').trim()
    if (!email) {
      // Code exploitable côté front pour un message dédié.
      return NextResponse.json(
        { error: 'email_manquant', message: 'Ajoutez un email au client avant de l\'inviter.' },
        { status: 400 }
      )
    }

    // 4. IDEMPOTENCE — détection FIABLE via NOTRE donnée : un profil client déjà
    //    rattaché à ce client = compte déjà créé. (On ne scanne pas auth : le profil
    //    est le lien qui compte ; un client = une personne = un compte, couvrant
    //    tous ses dossiers via mes_dossiers_client().) Sert d'AIGUILLAGE : compte
    //    existant → on régénère un lien (recovery), sinon → on crée (invite).
    const { data: existing } = await getSupabaseAdmin()
      .from('profiles')
      .select('id')
      .eq('client_id', client.id)
      .eq('role', 'client')
      .maybeSingle()

    const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/auth/set-password`

    // 5a. COMPTE EXISTANT → régénérer un lien SANS recréer (renvoi d'invitation).
    if (existing) {
      const { data: linkData, error: linkError } = await getSupabaseAdmin().auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo },
      })
      if (linkError) {
        return NextResponse.json({ error: linkError.message }, { status: 400 })
      }
      // Réinviter = rouvrir l'accès : si le compte avait été désactivé (cron J+14),
      // on le réactive. On ne touche QUE ce profil client.
      await getSupabaseAdmin().from('profiles').update({ acces_actif: true }).eq('id', existing.id)
      return NextResponse.json({
        status: 'relinked',
        actionLink: linkData.properties.action_link,
        email,
        prenom: client.prenom || '',
      })
    }

    // 5b. PAS DE COMPTE → générer le lien d'invitation (crée le auth.users SANS
    //     envoyer d'email) + insert profiles + rollback si échec.
    const { data: linkData, error: linkError } = await getSupabaseAdmin().auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        redirectTo,
        data: { prenom: client.prenom, nom: client.nom, role: 'client' },
      },
    })
    if (linkError) {
      return NextResponse.json({ error: linkError.message }, { status: 400 })
    }
    const userId = linkData.user.id

    const { error: profileError } = await getSupabaseAdmin()
      .from('profiles')
      .insert({
        id: userId,
        role: 'client',
        client_id: client.id,
        societe_id: dossier.societe_id,
        agence_id: dossier.agence_id,
        email,
        prenom: client.prenom || '',
        nom: client.nom || '',
      })

    if (profileError) {
      // Rollback : pas d'auth.users orphelin si le profil échoue (comme create-agente).
      await getSupabaseAdmin().auth.admin.deleteUser(userId)
      return NextResponse.json({ error: profileError.message }, { status: 400 })
    }

    return NextResponse.json({
      status: 'invited',
      actionLink: linkData.properties.action_link,
      email,
      prenom: client.prenom || '',
    })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
