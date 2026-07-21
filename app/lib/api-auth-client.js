// app/lib/api-auth-client.js
// Helper côté client pour ajouter le token d'auth aux appels /api/*

import { supabase } from './supabase'

/**
 * Retourne les headers à utiliser pour un fetch vers /api/*.
 * Inclut Authorization: Bearer <token> si une session existe.
 *
 * getSession() renvoie le token STOCKÉ, potentiellement expiré : le timer
 * d'auto-refresh Supabase est suspendu quand l'onglet est inactif (onglet
 * épinglé laissé ouvert longtemps, téléphone verrouillé pendant une visite).
 * On force alors un refresh, sinon le serveur rejette l'appel en 401
 * « Session invalide ».
 */
export async function authHeaders(extra = {}) {
  let { data: { session } } = await supabase.auth.getSession()

  const expMs = session?.expires_at ? session.expires_at * 1000 : 0
  if (session && expMs && expMs <= Date.now() + 60_000) {   // expiré ou < 60 s de marge
    const { data, error } = await supabase.auth.refreshSession()
    if (!error && data?.session) session = data.session
  }

  const headers = { 'Content-Type': 'application/json', ...extra }
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`
  }
  return headers
}

/**
 * fetch() vers une route /api/* avec auth robuste.
 * - ajoute les headers d'auth (avec refresh proactif via authHeaders) ;
 * - si le serveur répond quand même 401 (course : token expiré juste avant
 *   l'appel, ou horloge), force UN refresh et retente une fois ;
 * - si c'est encore 401 après refresh, la session est réellement morte →
 *   redirige vers /login au lieu de laisser une erreur brute.
 *
 * Signature identique à fetch : apiFetch(url, { method, body, headers }).
 * Les `headers` passés sont fusionnés avec les headers d'auth.
 */
export async function apiFetch(url, options = {}) {
  const { headers: extra, ...rest } = options

  let res = await fetch(url, { ...rest, headers: await authHeaders(extra) })
  if (res.status !== 401) return res

  // 401 malgré le refresh proactif → on force un refresh et on retente une fois.
  const { data, error } = await supabase.auth.refreshSession()
  if (!error && data?.session) {
    res = await fetch(url, { ...rest, headers: await authHeaders(extra) })
    if (res.status !== 401) return res
  }

  // Toujours 401 → refresh token mort aussi → retour connexion.
  if (typeof window !== 'undefined') window.location.assign('/login')
  return res
}
