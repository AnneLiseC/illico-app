// app/lib/mcp/metadonnees.js
// Métadonnées de ressource protégée (RFC 9728) du serveur MCP « BATILIS ».
// Spec MCP : https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
// claude.ai : `resource` doit être IDENTIQUE à l'URL saisie dans le connecteur, et seul le
// PREMIER serveur d'autorisation est utilisé.
// https://claude.com/docs/connectors/building/authentication
//
// Serveur d'autorisation = serveur OAuth 2.1 de Supabase, issuer `<projet>/auth/v1`.
// https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication

export const CHEMIN_MCP = '/api/mcp'
export const CHEMIN_METADONNEES = '/.well-known/oauth-protected-resource'
// Seul scope demandé : `email` (défaut Supabase). `openid` exigerait des clés JWT
// asymétriques (doc Supabase oauth-flows) : non demandé tant que ce n'est pas vérifié.
export const SCOPES = ['email']

export function urlRessource(request) {
  return `${new URL(request.url).origin}${CHEMIN_MCP}`
}

export function urlMetadonnees(request) {
  return `${new URL(request.url).origin}${CHEMIN_METADONNEES}${CHEMIN_MCP}`
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, MCP-Protocol-Version',
}

export function reponseMetadonnees(request) {
  return Response.json({
    resource: urlRessource(request),
    authorization_servers: [`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`],
    bearer_methods_supported: ['header'],
    scopes_supported: SCOPES,
    resource_name: 'BATILIS',
  }, { headers: CORS })
}

export function reponseOptions() {
  return new Response(null, { status: 204, headers: CORS })
}
