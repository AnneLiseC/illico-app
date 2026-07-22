// app/api/admin/invite-franchise/route.js
// Route d'invitation d'un nouvel ADMIN franchisé (onboarding multi-tenant),
// protégée par secret (ADMIN_INVITE_SECRET) — usage historique / hors session.
// La logique métier est partagée avec /api/super-admin/invite-admin via le
// helper inviteFranchiseAdmin.

import { NextResponse } from 'next/server'
import { checkBearerSecret } from '../../../lib/http-auth'
import { inviteFranchiseAdmin } from '../../../lib/admin-invitation'

export async function POST(request) {
  // 1. Secret (fail-closed + timing-safe) — barrière d'accès à la route.
  if (!checkBearerSecret(request, process.env.ADMIN_INVITE_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { invitationId } = await inviteFranchiseAdmin({ email: body.email, invited_by: body.invited_by || null })
    return NextResponse.json({ success: true, invitationId }, { status: 200 })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 })
  }
}
