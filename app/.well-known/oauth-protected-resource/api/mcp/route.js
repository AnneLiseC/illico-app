// app/.well-known/oauth-protected-resource/api/mcp/route.js
// Métadonnées de ressource protégée (RFC 9728) du serveur MCP /api/mcp. Servies à la
// racine ET au chemin de la ressource : les clients MCP essaient les deux.
// https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization

import { reponseMetadonnees, reponseOptions } from '../../../../lib/mcp/metadonnees'

export const dynamic = 'force-dynamic'

export function GET(request) {
  return reponseMetadonnees(request)
}

export function OPTIONS() {
  return reponseOptions()
}
