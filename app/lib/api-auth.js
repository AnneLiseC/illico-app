// app/lib/api-auth.js
// Helper d'authentification côté serveur pour les routes /api/*
// Vérifie le JWT envoyé par le client via Authorization: Bearer <token>
// et charge le profil (rôle) correspondant.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isSuperAdminEmail } from './super-admin'

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

/**
 * Vérifie qu'un appelant authentifié appelle la route.
 * @returns {Promise<{user, profile} | {error: NextResponse}>}
 */
export async function requireUser(request) {
  const token = extractToken(request)
  if (!token) {
    return { error: NextResponse.json({ error: 'Non authentifié' }, { status: 401 }) }
  }

  const { data: userData, error: userError } = await getSupabaseAdmin().auth.getUser(token)
  if (userError || !userData?.user) {
    return { error: NextResponse.json({ error: 'Session invalide' }, { status: 401 }) }
  }

  const { data: profile, error: profileError } = await getSupabaseAdmin()
    .from('profiles')
    .select('id, role, client_id, prenom, nom, email, agence_id, societe_id')
    .eq('id', userData.user.id)
    .single()

  if (profileError || !profile) {
    return { error: NextResponse.json({ error: 'Profil introuvable' }, { status: 403 }) }
  }

  return { user: userData.user, profile }
}

/**
 * Vérifie qu'un appelant authentifié ET d'un rôle autorisé appelle la route.
 * @param {string[]} roles - rôles autorisés (ex: ['admin','agente'])
 */
export async function requireRole(request, roles) {
  const result = await requireUser(request)
  if (result.error) return result
  if (!roles.includes(result.profile.role)) {
    return { error: NextResponse.json({ error: 'Accès refusé' }, { status: 403 }) }
  }
  return result
}

/**
 * Vérifie que l'appelant est l'ÉDITRICE (super-admin), reconnue par son email
 * dans SUPER_ADMIN_EMAILS (serveur = autorité). Ne requiert PAS de profil : le
 * super-admin n'appartient à aucun tenant. À utiliser en tête des routes
 * /api/super-admin/*, qui poursuivent ensuite en service_role.
 * @returns {Promise<{user} | {error: NextResponse}>}
 */
export async function requireSuperAdmin(request) {
  const token = extractToken(request)
  if (!token) {
    return { error: NextResponse.json({ error: 'Non authentifié' }, { status: 401 }) }
  }
  const { data, error } = await getSupabaseAdmin().auth.getUser(token)
  if (error || !data?.user) {
    return { error: NextResponse.json({ error: 'Session invalide' }, { status: 401 }) }
  }
  if (!isSuperAdminEmail(data.user.email, process.env.SUPER_ADMIN_EMAILS)) {
    return { error: NextResponse.json({ error: 'Accès refusé' }, { status: 403 }) }
  }
  return { user: data.user }
}
