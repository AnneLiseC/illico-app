// app/api/super-admin/email-oauth/route.js
// GET : état de la boîte d'envoi (connectée ? quelle adresse ?) pour l'UI /super-admin.
// Barrière requireSuperAdmin. Ne renvoie jamais de token.

import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '../../../lib/api-auth'
import { getSenderStatus } from '../../../lib/email-sender'

export async function GET(request) {
  const auth = await requireSuperAdmin(request)
  if (auth.error) return auth.error
  try {
    const status = await getSenderStatus()
    return NextResponse.json(status)
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
