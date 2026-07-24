// app/api/agent-requests/route.js
// Demande d'agent par l'ADMIN franchisé. Nouveau modèle : l'admin ne crée plus
// de compte — il DÉPOSE une demande, que l'éditrice (super-admin) honore ou
// rejette depuis /super-admin.
//
//  POST : dépose une demande (prénom, nom, email, agence) + notifie l'éditrice.
//  GET  : liste les demandes de SA société (suivi côté admin).
//
// La table demandes_agents est service_role-only (RLS deny-all) : tous les accès
// passent par ce service_role après la barrière requireRole(['admin']).

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole } from '../../lib/api-auth'
import { isAllowedStaffEmail } from '../../lib/email-validation'
import { validateAgentIdentity } from '../../lib/agent-provisioning'
import { parseEmailList } from '../../lib/super-admin'
import { sendEmail } from '../../lib/email'

let _supabaseAdmin
function getSupabaseAdmin() {
  if (!_supabaseAdmin) _supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _supabaseAdmin
}

// Notifie l'éditrice (best-effort : un échec d'email ne perd JAMAIS la demande,
// qui est déjà enregistrée en base — source de vérité). Destinataires = liste
// SUPER_ADMIN_EMAILS (serveur). Pas de nouvelle variable d'env.
async function notifierEditrice({ prenom, nom, email, societeNom, agenceNom, demandeurNom }) {
  const destinataires = parseEmailList(process.env.SUPER_ADMIN_EMAILS)
  if (destinataires.length === 0) return
  const lien = `${process.env.NEXT_PUBLIC_APP_URL || ''}/super-admin`
  const html = `
    <p>Une nouvelle <strong>demande d'agent</strong> attend ta validation.</p>
    <table style="border-collapse:collapse;font-size:14px">
      <tr><td style="padding:4px 12px 4px 0;color:#666">Agent</td><td><strong>${prenom} ${nom}</strong></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#666">Email</td><td>${email}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#666">Société</td><td>${societeNom || '—'}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#666">Agence</td><td>${agenceNom || '—'}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#666">Demandé par</td><td>${demandeurNom || '—'}</td></tr>
    </table>
    <p style="margin-top:16px"><a href="${lien}">Ouvrir l'espace créatrice →</a></p>
  `
  // Un seul destinataire par envoi (sendEmail prend un `to` unique).
  await Promise.all(destinataires.map(to =>
    sendEmail({ to, subject: `Batilis — Demande d'agent : ${prenom} ${nom}`, html }).catch(() => {})
  ))
}

export async function POST(request) {
  const auth = await requireRole(request, ['admin'])
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const prenom = (body.prenom || '').trim()
    const nom = (body.nom || '').trim()
    const email = (body.email || '').trim().toLowerCase()
    const agenceIdIn = body.agence_id || null

    // 1. Identité + domaine réseau (mêmes règles que la création finale).
    const idErr = validateAgentIdentity({ prenom, nom, email })
    if (idErr) return NextResponse.json({ error: idErr }, { status: 400 })
    if (!isAllowedStaffEmail(email)) {
      return NextResponse.json({ error: 'Les comptes staff doivent utiliser une adresse @illico-travaux.com' }, { status: 400 })
    }

    const db = getSupabaseAdmin()
    const societeId = auth.profile.societe_id

    // 2. Résoudre l'agence cible (barrière : elle doit appartenir à la société
    //    de l'admin). Absente + société mono-agence → déduction déterministe.
    let agenceId
    if (agenceIdIn) {
      const { data: ag } = await db.from('agences').select('id').eq('id', agenceIdIn).eq('societe_id', societeId).maybeSingle()
      if (!ag) return NextResponse.json({ error: 'Agence invalide' }, { status: 400 })
      agenceId = ag.id
    } else {
      const { data: ags } = await db.from('agences').select('id').eq('societe_id', societeId).order('code')
      if (!ags || ags.length === 0) return NextResponse.json({ error: 'Aucune agence trouvée pour votre société' }, { status: 400 })
      if (ags.length > 1) return NextResponse.json({ error: 'Agence de rattachement requise' }, { status: 400 })
      agenceId = ags[0].id
    }

    // 3. Anti-doublon : (a) déjà un compte pour cet email, (b) déjà une demande en attente.
    const { data: existingProfile } = await db.from('profiles').select('id').eq('email', email).limit(1)
    if (existingProfile?.length) {
      return NextResponse.json({ error: 'Un compte existe déjà pour cet email.' }, { status: 409 })
    }
    const { data: existingReq } = await db.from('demandes_agents').select('id').eq('email', email).eq('statut', 'en_attente').limit(1)
    if (existingReq?.length) {
      return NextResponse.json({ error: 'Une demande est déjà en attente pour cet email.' }, { status: 409 })
    }

    // 4. Insert (service_role). L'index unique partiel est le filet anti-doublon concurrent.
    const { data: inserted, error: insErr } = await db.from('demandes_agents')
      .insert({ societe_id: societeId, agence_id: agenceId, demandeur_id: auth.user.id, prenom, nom, email, statut: 'en_attente' })
      .select('id')
      .single()
    if (insErr) {
      // Collision sur l'index unique partiel (course) → message clair.
      if (insErr.code === '23505') return NextResponse.json({ error: 'Une demande est déjà en attente pour cet email.' }, { status: 409 })
      return NextResponse.json({ error: insErr.message }, { status: 500 })
    }

    // 5. Notifier l'éditrice (best-effort). Récupère les libellés pour l'email.
    try {
      const [{ data: soc }, { data: agc }] = await Promise.all([
        db.from('societes').select('nom_societe').eq('id', societeId).maybeSingle(),
        db.from('agences').select('nom').eq('id', agenceId).maybeSingle(),
      ])
      await notifierEditrice({
        prenom, nom, email,
        societeNom: soc?.nom_societe,
        agenceNom: agc?.nom,
        demandeurNom: [auth.profile.prenom, auth.profile.nom].filter(Boolean).join(' '),
      })
    } catch { /* notification best-effort : la demande est déjà enregistrée */ }

    return NextResponse.json({ success: true, id: inserted.id }, { status: 200 })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET(request) {
  const auth = await requireRole(request, ['admin'])
  if (auth.error) return auth.error

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('demandes_agents')
      .select('id, prenom, nom, email, statut, created_at, traite_at, agence_id')
      .eq('societe_id', auth.profile.societe_id)
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ demandes: data || [] })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
