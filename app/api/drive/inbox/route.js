// app/api/drive/inbox/route.js
// POST { inbox_id, action:'ignore' } — écarte un fichier détecté de la liste « à rattacher »
// (statut='ignore'). Le fichier reste dans OneDrive ; on arrête juste de le proposer.
// Écriture via service role (drive_inbox n'a qu'une policy de lecture), scoping par owner.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole } from '../../../lib/api-auth'

let _admin
function admin() {
  if (!_admin) _admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _admin
}

export async function POST(request) {
  const auth = await requireRole(request, ['admin', 'agente'])
  if (auth.error) return auth.error

  let body
  try { body = await request.json() } catch { body = {} }
  if (!body.inbox_id || body.action !== 'ignore') {
    return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 })
  }

  const db = admin()
  const { data: inbox } = await db.from('drive_inbox').select('id, user_id').eq('id', body.inbox_id).maybeSingle()
  if (!inbox) return NextResponse.json({ ok: true, nothing: true })
  if (inbox.user_id !== auth.user.id) {
    const { data: prop } = await db.from('profiles')
      .select('societe_id, agence_id').eq('id', inbox.user_id).maybeSingle()
    const memeTenant = auth.profile?.role === 'admin'
      ? prop?.societe_id === auth.profile.societe_id
      : prop?.agence_id === auth.profile?.agence_id
    if (!memeTenant) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }
  await db.from('drive_inbox').update({ statut: 'ignore' }).eq('id', inbox.id)
  return NextResponse.json({ ok: true })
}
