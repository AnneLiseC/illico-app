// app/api/super-admin/renvoyer-invitation/route.js
// Renvoie son lien d'activation à un compte qui ne s'est jamais connecté.
//
// R6 — POURQUOI CETTE ROUTE N'EXISTAIT PAS, ET POURQUOI IL LA FAUT
//
// L'envoi de l'invitation est « best-effort » à deux endroits (admin-invitation.js et
// agent-provisioning.js) : si la boîte d'envoi est déconnectée, l'échec est avalé, le
// compte est créé, et l'écran affiche « invitation créée — email NON envoyé ». Puis
// plus rien. Les deux fichiers portent même le commentaire « à renvoyer » — l'intention
// existait, le geste n'existait pas.
//
// Et une seconde tentative était refusée : « Cet email a déjà une invitation en
// attente » (409). La seule issue était de supprimer une ligne en base à la main.
// Sur trois comptes à ouvrir chez un nouveau franchisé, ce n'est pas un cas d'école.
//
// CE QUE FAIT LA ROUTE : elle régénère un lien et le renvoie. Elle ne crée aucun compte
// et n'en modifie aucun.
//
// POURQUOI UN LIEN DE TYPE `recovery` ET NON `invite` : `invite` refuse un compte qui
// existe déjà — or c'est précisément notre cas, le compte a été créé lors de la première
// tentative. `recovery` ouvre la même page `/auth/set-password`, où la personne choisit
// son mot de passe. C'est déjà le mécanisme de « mot de passe oublié ».
//
// LE GARDE-FOU : on refuse si la personne s'est DÉJÀ connectée. Renvoyer une invitation
// à un compte actif n'a pas de sens et ressemblerait, côté destinataire, à une tentative
// de prise de contrôle de son compte. Dans ce cas, c'est « mot de passe oublié » qui
// s'applique, et c'est à la personne elle-même de le demander.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireSuperAdmin } from '../../../lib/api-auth'
import { sendEmail } from '../../../lib/email'
import { buildInvitationEmail } from '../../../lib/invitation-email'

let _admin
function db() {
  if (!_admin) _admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _admin
}

const TTL_MS = 7 * 24 * 60 * 60 * 1000

export async function POST(request) {
  const auth = await requireSuperAdmin(request)
  if (auth.error) return auth.error

  let email
  try {
    const body = await request.json()
    email = (body?.email || '').trim().toLowerCase()
  } catch {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  }
  if (!email) return NextResponse.json({ error: 'Email requis' }, { status: 400 })

  const admin = db()

  try {
    // 1. Le compte existe-t-il, et s'est-il déjà connecté ?
    const { data: liste, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 })
    const compte = (liste?.users || []).find(u => (u.email || '').toLowerCase() === email)
    if (!compte) {
      return NextResponse.json({ error: "Aucun compte pour cette adresse. Utilise « Inviter » plutôt que « Renvoyer »." }, { status: 404 })
    }
    if (compte.last_sign_in_at) {
      return NextResponse.json({
        error: "Ce compte s'est déjà connecté : son invitation a été utilisée. "
          + "S'il a perdu son mot de passe, il doit demander « Mot de passe oublié » depuis l'écran de connexion.",
      }, { status: 409 })
    }

    // 2. Régénérer le lien d'activation.
    const { data: lien, error: lienErr } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/set-password?type=recovery` },
    })
    if (lienErr) return NextResponse.json({ error: lienErr.message }, { status: 500 })
    const actionLink = lien?.properties?.action_link
    if (!actionLink) return NextResponse.json({ error: 'Lien non généré' }, { status: 500 })

    // 3. Rouvrir la fenêtre de 7 jours quand une invitation d'admin est en attente.
    //    Sans ça, le lien fonctionne mais la ligne d'invitation reste périmée.
    const { data: profil } = await admin.from('profiles').select('prenom, nom, role').eq('id', compte.id).maybeSingle()
    const expiresAt = new Date(Date.now() + TTL_MS).toISOString()
    await admin.from('admin_invitations')
      .update({ expires_at: expiresAt })
      .eq('email', email).eq('statut', 'en_attente')

    // 4. Envoyer. ICI, contrairement à la création, l'échec N'EST PAS avalé : le seul
    //    but de cette route est d'envoyer un message. Si l'envoi échoue, il faut le dire.
    const { subject, html } = buildInvitationEmail({
      prenom: profil?.prenom, nom: profil?.nom, actionLink,
      role: profil?.role === 'agente' ? 'agente' : 'admin',
    })
    try {
      await sendEmail({ to: email, subject, html })
    } catch (err) {
      return NextResponse.json({
        error: "Le lien a été régénéré mais l'email n'est pas parti : "
          + (err?.message || 'boîte d\'envoi indisponible')
          + ". Vérifie la connexion de la boîte d'envoi ci-dessus, puis réessaie.",
      }, { status: 502 })
    }

    return NextResponse.json({ success: true, email })
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Erreur' }, { status: 500 })
  }
}
