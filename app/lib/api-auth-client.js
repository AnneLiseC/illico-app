// app/lib/api-auth-client.js
// Helper côté client pour ajouter le token d'auth aux appels /api/*

import { supabase } from './supabase'

/**
 * Retourne les headers à utiliser pour un fetch vers /api/*.
 * Inclut Authorization: Bearer <token> si une session existe.
 */
export async function authHeaders(extra = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = { 'Content-Type': 'application/json', ...extra }
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`
  }
  return headers
}
