// app/api/mcp/route.js
// Serveur MCP distant « BATILIS » — connecteur personnalisé claude.ai, LECTURE SEULE.
// Documentation : docs/mcp-batilis.md.
//
// Transport : Streamable HTTP SANS ÉTAT (un serveur et un transport par requête, réponses
// JSON), POST uniquement. SDK officiel : WebStandardStreamableHTTPServerTransport.
// https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
//
// Authentification : jeton OAuth Supabase de l'utilisatrice (cf. app/lib/mcp/auth.js).
// Sur 401, l'en-tête WWW-Authenticate pointe vers les métadonnées de ressource protégée
// (RFC 9728) : c'est ce qui déclenche la connexion côté claude.ai.

import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { authentifierMcp } from '../../lib/mcp/auth'
import { creerServeurMcp } from '../../lib/mcp/serveur'
import { urlMetadonnees, SCOPES } from '../../lib/mcp/metadonnees'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function refus(request, { statut, code, message }) {
  const headers = { 'Content-Type': 'application/json' }
  if (statut === 401) {
    headers['WWW-Authenticate'] =
      `Bearer error="${code}", resource_metadata="${urlMetadonnees(request)}", scope="${SCOPES.join(' ')}"`
  }
  return new Response(JSON.stringify({ error: code, error_description: message }), { status: statut, headers })
}

export async function POST(request) {
  const auth = await authentifierMcp(request)
  if (!auth.ok) return refus(request, auth)

  const serveur = creerServeurMcp({ supabase: auth.supabase })
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  await serveur.connect(transport)
  return transport.handleRequest(request, {
    authInfo: { token: auth.jeton, clientId: process.env.MCP_OAUTH_CLIENT_ID, scopes: SCOPES },
  })
}

// Sans état : pas de flux SSE (GET) ni de session à fermer (DELETE).
function methodeNonAutorisee() {
  return new Response(
    JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Méthode non autorisée : utiliser POST.' }, id: null }),
    { status: 405, headers: { Allow: 'POST', 'Content-Type': 'application/json' } })
}
export const GET = methodeNonAutorisee
export const DELETE = methodeNonAutorisee
