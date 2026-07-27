// app/api/auth/google/route.js
// Initie le flow OAuth Google. Retourne l'URL d'autorisation au client
// qui effectue la redirection (permet de passer le token d'auth en header
// — un <a href> ne le ferait pas).

import { google } from 'googleapis'
import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { requireRole } from '../../../lib/api-auth'

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
)

// State signé HMAC-SHA256 pour empêcher la CSRF.
// Format : base64url(payload).base64url(signature)
// payload = { uid, kind, nonce, exp }
// Deux usages du compte Google, distingués par `kind` (relu par le callback) :
// 'calendar' (défaut) → agenda, fournisseur='google' ; 'drive' → Google Drive,
// fournisseur='googledrive'. Scopes séparés → tokens indépendants (comme Outlook).
// ⚠️ NE PAS repasser 'drive' en 'auth/drive' (accès total) : c'est un scope RESTREINT
// qui impose une évaluation de sécurité CASA payante et annuelle avant publication.
// 'drive.file' est NON restreint : l'app n'accède qu'aux fichiers/dossiers QU'ELLE crée
// (ou que l'utilisateur sélectionne via le Google Picker). Suffit pour push / arborescence /
// déplacement. Conséquence assumée : le pull « entrant » (fichiers déposés à la main par
// l'utilisateur) n'est PAS visible côté Google Drive — OneDrive/Microsoft n'est pas concerné.
const SCOPE_BY_KIND = {
  calendar: ['https://www.googleapis.com/auth/calendar'],
  drive:    ['https://www.googleapis.com/auth/drive.file'],
}

function buildSignedState(userId, kind) {
  const secret = process.env.OAUTH_STATE_SECRET
  if (!secret) throw new Error('OAUTH_STATE_SECRET non configuré')
  const payload = JSON.stringify({
    uid: userId,
    kind,
    nonce: crypto.randomBytes(16).toString('hex'),
    exp: Date.now() + 10 * 60 * 1000, // 10 minutes
  })
  const payloadB64 = Buffer.from(payload).toString('base64url')
  const signature = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url')
  return `${payloadB64}.${signature}`
}

export async function POST(request) {
  const auth = await requireRole(request, ['admin', 'agente'])
  if (auth.error) return auth.error

  // kind facultatif dans le body ; 'calendar' par défaut (rétro-compat agenda).
  let kind = 'calendar'
  try {
    const body = await request.json()
    if (body?.kind === 'drive') kind = 'drive'
  } catch { /* pas de body → calendar */ }

  let state
  try {
    state = buildSignedState(auth.user.id, kind)
  } catch {
    return NextResponse.json({ error: 'Configuration serveur manquante' }, { status: 500 })
  }

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPE_BY_KIND[kind],
    prompt: 'consent',
    state,
  })

  return NextResponse.json({ url })
}
