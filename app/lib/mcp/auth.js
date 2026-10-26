// app/lib/mcp/auth.js
// Authentification du serveur MCP « BATILIS » (connecteur claude.ai, lecture seule).
//
// RÈGLE ABSOLUE : ce module et tout ce que le serveur MCP importe n'utilisent JAMAIS la
// clé service_role. Chaque lecture passe par un client Supabase créé avec la clé PUBLIQUE
// et le jeton de l'utilisateur : la RLS s'applique telle quelle (cf. test « arbre de
// modules » dans app/lib/__tests__/mcp.test.js).
//
// Étapes, dans l'ordre, toutes fail-closed :
//   1. jeton Bearer présent ;
//   2. jeton émis par le serveur OAuth Supabase POUR NOTRE client (claim `client_id` égal
//      à MCP_OAUTH_CLIENT_ID). Supabase n'émet pas d'audience propre à la ressource
//      (aud = "authenticated") : ce contrôle remplace la liaison d'audience demandée par
//      la spec MCP. https://supabase.com/docs/guides/auth/oauth-server/token-security
//      https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
//   3. jeton valide et session non révoquée : auth.getUser(jeton) interroge le serveur
//      Auth (fonctionne avec des clés JWT HS256 comme asymétriques) ;
//   4. profil lisible, rôle `admin` ou `agente`, profil actif (`profiles.actif`).

import { createClient } from '@supabase/supabase-js'
import { claimsJeton } from '../jeton-oauth'
import { ROLES_CONNECTEUR } from '../oauth-consentement'

export function extraireJeton(request) {
  const entete = request.headers.get('authorization') || ''
  const m = entete.match(/^Bearer\s+(.+)$/i)
  return m ? m[1].trim() : null
}

/** Client Supabase au jeton de l'utilisateur, clé publique (anon). Jamais service_role. */
export function clientSupabaseUtilisateur(jeton) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jeton}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function refus(statut, code, message) {
  return { ok: false, statut, code, message }
}

/**
 * @returns {Promise<{ok:true, supabase, profil, jeton} | {ok:false, statut:number, code:string, message:string}>}
 *   code = 'invalid_token' (401, Claude relance la connexion) ou 'access_denied' (403).
 */
export async function authentifierMcp(request, { creerClient = clientSupabaseUtilisateur } = {}) {
  const jeton = extraireJeton(request)
  if (!jeton) return refus(401, 'invalid_token', 'Connexion requise : jeton d\'accès absent.')

  const attendu = process.env.MCP_OAUTH_CLIENT_ID
  if (!attendu) return refus(503, 'server_error', 'Connecteur BATILIS non configuré (MCP_OAUTH_CLIENT_ID absent).')
  const claims = claimsJeton(jeton)
  if (!claims || claims.client_id !== attendu) {
    return refus(401, 'invalid_token', 'Jeton non émis pour le connecteur BATILIS.')
  }

  const supabase = creerClient(jeton)
  const { data: userData, error: userError } = await supabase.auth.getUser(jeton)
  if (userError || !userData?.user) {
    return refus(401, 'invalid_token', 'Jeton invalide ou expiré : reconnectez le connecteur BATILIS.')
  }

  const { data: profil, error: profilError } = await supabase
    .from('profiles').select('id, role, actif, prenom, nom, agence_id, societe_id')
    .eq('id', userData.user.id).maybeSingle()
  if (profilError || !profil) return refus(403, 'access_denied', 'Accès refusé : profil BATILIS introuvable.')
  if (!ROLES_CONNECTEUR.includes(profil.role)) {
    return refus(403, 'access_denied', 'Accès refusé : le connecteur BATILIS est réservé aux comptes admin et agente.')
  }
  if (profil.actif !== true) {
    return refus(403, 'access_denied', 'Accès refusé : ce compte BATILIS est désactivé.')
  }

  return { ok: true, supabase, profil, jeton }
}
