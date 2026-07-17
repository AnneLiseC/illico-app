// app/api/onboarding/create-societe/route.js
// Route appelée par le formulaire d'onboarding (partie 3).
// Authentifie le user via JWT SANS exiger de profil (il n'en a pas encore),
// puis délègue la création atomique (société + 1ère agence + profil admin +
// consommation de l'invitation) à la fonction Postgres onboarding_create_societe,
// appelée en service_role. Traduit les codes d'erreur de la fonction.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

let _supabaseAdmin
function getSupabaseAdmin() {
  if (!_supabaseAdmin) _supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _supabaseAdmin
}

function extractToken(request) {
  const header = request.headers.get('authorization') || request.headers.get('Authorization')
  if (!header) return null
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : null
}

export async function POST(request) {
  // 1. Auth JWT LÉGÈRE : on vérifie le token et on récupère user.id, SANS exiger
  //    de profil (le user en onboarding n'en a pas encore — requireUser ferait 403).
  const token = extractToken(request)
  if (!token) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }
  const { data: userData, error: userError } = await getSupabaseAdmin().auth.getUser(token)
  if (userError || !userData?.user) {
    return NextResponse.json({ error: 'Session invalide' }, { status: 401 })
  }
  const userId = userData.user.id

  try {
    const body = await request.json()
    const {
      nom_societe, siret, rcs,
      agence_nom, agence_ville, agence_adresse, agence_cp, agence_tel,
      nom, prenom, telephone,
    } = body

    // 2. Champs requis (la fonction impose aussi les NOT NULL en dernier rempart).
    if (!nom_societe?.trim() || !agence_nom?.trim() || !agence_ville?.trim() || !nom?.trim() || !prenom?.trim()) {
      return NextResponse.json({ error: 'Champs requis manquants (société, agence, nom, prénom).' }, { status: 400 })
    }

    // 3. Création atomique. p_user_id vient du JWT vérifié → non falsifiable
    //    (le body ne porte PAS d'id).
    const { data: societeId, error: rpcError } = await getSupabaseAdmin().rpc('onboarding_create_societe', {
      p_user_id:       userId,
      p_nom_societe:   nom_societe,
      p_siret:         siret || '',
      p_rcs:           rcs || '',
      p_agence_nom:    agence_nom,
      p_agence_ville:  agence_ville,
      p_agence_adresse: agence_adresse || '',
      p_agence_cp:     agence_cp || '',
      p_agence_tel:    agence_tel || '',
      p_nom:           nom,
      p_prenom:        prenom,
      p_telephone:     telephone || '',
    })

    // 4. Traduction des erreurs métier remontées par RAISE EXCEPTION.
    if (rpcError) {
      const msg = rpcError.message || ''
      if (msg.includes('INVITATION_INVALIDE')) {
        return NextResponse.json({ error: 'Votre invitation est invalide ou expirée. Contactez l\'administrateur.' }, { status: 403 })
      }
      if (msg.includes('PROFIL_EXISTANT')) {
        return NextResponse.json({ error: 'Vous avez déjà une société.' }, { status: 409 })
      }
      if (msg.includes('USER_INTROUVABLE')) {
        return NextResponse.json({ error: 'Compte introuvable.' }, { status: 400 })
      }
      // Erreur inattendue : message générique au client, détail loggé côté serveur.
      console.error('[onboarding/create-societe] RPC error:', rpcError)
      return NextResponse.json({ error: 'Une erreur est survenue lors de la création.' }, { status: 500 })
    }

    return NextResponse.json({ success: true, societeId }, { status: 200 })
  } catch (err) {
    console.error('[onboarding/create-societe] error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
