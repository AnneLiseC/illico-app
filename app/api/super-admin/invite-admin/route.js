// app/api/super-admin/invite-admin/route.js
// Invitation d'un admin franchisé DEPUIS l'espace créatrice (éditrice connectée).
// Même logique que la route secret-gated, mais barrière = requireSuperAdmin
// (email de l'éditrice, autorité serveur). invited_by = email de l'éditrice.

import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '../../../lib/api-auth'
import { inviteFranchiseAdmin } from '../../../lib/admin-invitation'

export async function POST(request) {
  const auth = await requireSuperAdmin(request)
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const { invitationId, emailSent } = await inviteFranchiseAdmin({ email: body.email, invited_by: auth.user.email })
    return NextResponse.json({ success: true, invitationId, emailSent }, { status: 200 })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 })
  }
}
