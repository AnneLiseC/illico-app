import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { claimsJeton, estJetonOAuth } from '../jeton-oauth'

// Fabrique un JWT NON signé (la signature n'est pas lue par ce module).
function jwt(claims) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}.signature`
}

const SESSION = jwt({ sub: 'u1', role: 'authenticated', aud: 'authenticated' })
const OAUTH = jwt({ sub: 'u1', role: 'authenticated', aud: 'authenticated', client_id: 'client-claude' })

describe('jeton-oauth', () => {
  it('lit les claims d\'un JWT', () => {
    expect(claimsJeton(OAUTH).client_id).toBe('client-claude')
  })
  it('jeton de session (sans client_id) : pas OAuth', () => {
    expect(estJetonOAuth(SESSION)).toBe(false)
  })
  it('jeton OAuth (client_id présent) : OAuth', () => {
    expect(estJetonOAuth(OAUTH)).toBe(true)
  })
  it('client_id vide reste un jeton OAuth (présence du claim)', () => {
    expect(estJetonOAuth(jwt({ sub: 'u1', client_id: '' }))).toBe(true)
  })
  it('fail-closed : jeton illisible traité comme OAuth', () => {
    expect(estJetonOAuth('pas-un-jwt')).toBe(true)
    expect(estJetonOAuth('a.b.c')).toBe(true)
    expect(estJetonOAuth(`x.${Buffer.from('[1]').toString('base64url')}.y`)).toBe(true)
    expect(estJetonOAuth(null)).toBe(true)
  })
})

// ── api-auth : le refus arrive AVANT tout appel à Supabase ─────────────────────
const getUser = vi.fn()
const single = vi.fn()
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser },
    from: () => ({ select: () => ({ eq: () => ({ single }) }) }),
  }),
}))

function req(token) {
  return new Request('https://app.test/api/x', { headers: token ? { authorization: `Bearer ${token}` } : {} })
}

describe('api-auth refuse les jetons OAuth', () => {
  beforeEach(() => {
    getUser.mockReset().mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.c' } }, error: null })
    single.mockReset().mockResolvedValue({ data: { id: 'u1', role: 'agente' }, error: null })
  })

  it('requireUser : jeton OAuth → 403, getUser jamais appelé', async () => {
    const { requireUser } = await import('../api-auth')
    const r = await requireUser(req(OAUTH))
    expect(r.error.status).toBe(403)
    expect(getUser).not.toHaveBeenCalled()
  })
  it('requireUser : jeton de session → accepté (l\'app continue de fonctionner)', async () => {
    const { requireUser } = await import('../api-auth')
    const r = await requireUser(req(SESSION))
    expect(r.error).toBeUndefined()
    expect(r.profile.role).toBe('agente')
  })
  it('requireRole : jeton OAuth → 403', async () => {
    const { requireRole } = await import('../api-auth')
    const r = await requireRole(req(OAUTH), ['admin', 'agente'])
    expect(r.error.status).toBe(403)
  })
  it('requireSuperAdmin : jeton OAuth → 403, getUser jamais appelé', async () => {
    const { requireSuperAdmin } = await import('../api-auth')
    const r = await requireSuperAdmin(req(OAUTH))
    expect(r.error.status).toBe(403)
    expect(getUser).not.toHaveBeenCalled()
  })
  it('create-societe : jeton OAuth → 403, getUser jamais appelé', async () => {
    const { POST } = await import('../../api/onboarding/create-societe/route')
    const res = await POST(req(OAUTH))
    expect(res.status).toBe(403)
    expect(getUser).not.toHaveBeenCalled()
  })
})

// ── Recensement : tout point d'entrée serveur qui valide un JWT filtre les jetons OAuth ──
// Un nouveau `auth.getUser(<jeton>)` côté serveur sans estJetonOAuth fera échouer ce test.
// Seule exception : le serveur MCP, qui EXIGE au contraire un jeton OAuth.
const EXCEPTIONS = new Set(['app/lib/mcp/auth.js'])
function fichiers(dir) {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n)
    if (n === 'node_modules' || n === '_design' || n === '__tests__') return []
    return statSync(p).isDirectory() ? fichiers(p) : /\.(js|jsx|mjs)$/.test(n) ? [p] : []
  })
}
describe('recensement des validations de JWT côté serveur', () => {
  it('chaque auth.getUser(jeton) est précédé d\'un estJetonOAuth dans le même fichier', () => {
    const fautifs = fichiers('app')
      .filter(f => /\.auth\.getUser\(\s*[A-Za-z_]/.test(readFileSync(f, 'utf8')))
      .filter(f => !EXCEPTIONS.has(f.replace(/\\/g, '/')))
      .filter(f => !readFileSync(f, 'utf8').includes('estJetonOAuth('))
    expect(fautifs).toEqual([])
  })
})
