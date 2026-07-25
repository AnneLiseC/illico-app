// app/api/reset-password/route.js
// POST { email } — « Mot de passe oublié ». Envoie le lien de réinitialisation depuis
// NOTRE boîte d'envoi (Microsoft Graph, cf. lib/email) au lieu de Supabase, pour que TOUS
// les mails transactionnels partent du même expéditeur (comme les invitations agentes).
//
// PUBLIC (pas de session : l'utilisateur a justement perdu son accès). Deux garde-fous :
//   - ANTI-ÉNUMÉRATION : réponse TOUJOURS générique { ok:true } — on ne révèle jamais si un
//     compte existe (generateLink échoue en silence si l'email est inconnu → pas d'envoi).
//   - ANTI-ABUS : cooldown par email (table reset_cooldown) → protège aussi la boîte Outlook
//     d'un flood (sinon les mails partiraient en rafale DE ta boîte, risque de blocage Graph).
//
// L'auth reste 100 % Supabase : on ne fait que générer le lien (service_role) et l'expédier.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { sendEmail } from '../../lib/email'
import { buildResetEmail } from '../../lib/reset-email'

const COOLDOWN_MS = 60_000 // 1 min entre deux envois pour un même email

let _admin
function admin() {
  if (!_admin) _admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _admin
}

export async function POST(request) {
  let body
  try { body = await request.json() } catch { body = {} }
  const email = String(body.email || '').trim().toLowerCase()

  // Réponse identique dans TOUS les cas (anti-énumération).
  const generic = () => NextResponse.json({ ok: true })
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return generic()

  const db = admin()

  // Cooldown : on n'a envoyé un mail que si une ligne existe (posée après envoi réel).
  const { data: cd } = await db.from('reset_cooldown').select('last_sent_at').eq('email', email).maybeSingle()
  if (cd && Date.now() - new Date(cd.last_sent_at).getTime() < COOLDOWN_MS) return generic()

  // Lien de récupération. Échoue si aucun compte → on ne révèle rien, on renvoie générique.
  let actionLink = null
  try {
    const { data, error } = await db.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/set-password?type=recovery` },
    })
    if (!error) actionLink = data?.properties?.action_link || null
  } catch { /* compte inconnu / erreur Supabase → générique */ }
  if (!actionLink) return generic()

  // Envoi via NOTRE boîte (best effort). On ne pose le cooldown qu'après un envoi réussi.
  try {
    const { subject, html } = buildResetEmail({ actionLink })
    await sendEmail({ to: email, subject, html })
    await db.from('reset_cooldown').upsert({ email, last_sent_at: new Date().toISOString() }, { onConflict: 'email' })
  } catch (e) {
    console.error('[reset-password] envoi', e?.message || e)
  }
  return generic()
}
