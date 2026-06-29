// app/api/calendar/icloud/connect/route.js
// POST /api/calendar/icloud/connect — connecte un compte iCloud (lot 8c).
// Body : { appleId, appPassword }  (app-specific password généré sur appleid.apple.com).
//
// Flux : (1) VALIDER les credentials via un login CalDAV réel (buildICloudClientRaw, mot de
// passe EN CLAIR, jamais inséré tel quel) ; (2) si OK, CHIFFRER le password (encrypt, clé
// serveur CALDAV_ENC_KEY) ; (3) upsert comptes_oauth via un client AUTHENTIFIÉ (RLS
// comptes_oauth_own → user_id = auth.uid()), onConflict (user_id, fournisseur).
//
// ⚠️ Le mot de passe en clair n'est NI loggé NI renvoyé. Le chiffrement est 100% serveur.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireUser } from '../../../../lib/api-auth'
import { encrypt } from '../../../../lib/calendar/crypto'
import { buildICloudClientRaw, isCalDAVAuthError } from '../../../../lib/calendar/icloud'

const ICLOUD_SERVER = 'https://caldav.icloud.com'

function extractToken(request) {
  const header = request.headers.get('authorization') || request.headers.get('Authorization')
  if (!header) return null
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : null
}

export async function POST(request) {
  const auth = await requireUser(request)
  if (auth.error) return auth.error

  let body
  try { body = await request.json() } catch { body = {} }
  const appleId = (body.appleId || '').trim()
  const appPassword = (body.appPassword || '').trim()
  if (!appleId || !appPassword) {
    return NextResponse.json({ error: 'Apple ID et mot de passe requis' }, { status: 400 })
  }

  // (1) Validation : login CalDAV réel. Refus → 400 clair, AUCUN insert.
  try {
    await buildICloudClientRaw(appleId, appPassword, ICLOUD_SERVER)
  } catch (err) {
    if (isCalDAVAuthError(err)) {
      return NextResponse.json(
        { error: "Identifiants iCloud refusés (vérifie l'app-specific password)" }, { status: 400 }
      )
    }
    console.error('[icloud/connect] validation', err?.message)
    return NextResponse.json({ error: 'Connexion à iCloud impossible' }, { status: 502 })
  }

  // (2)+(3) Chiffrement serveur + upsert via client authentifié (RLS own).
  const token = extractToken(request)
  const supabaseUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } }
  )
  const { data, error } = await supabaseUser
    .from('comptes_oauth')
    .upsert({
      user_id: auth.user.id,
      fournisseur: 'icloud',
      caldav_username: appleId,
      caldav_password: encrypt(appPassword),
      caldav_server: ICLOUD_SERVER,
      compte_email: appleId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,fournisseur' })
    .select('id')
    .single()

  if (error) {
    console.error('[icloud/connect] upsert', error.message)
    return NextResponse.json({ error: 'Enregistrement du compte impossible' }, { status: 500 })
  }
  return NextResponse.json({ success: true, compte_id: data.id })
}
