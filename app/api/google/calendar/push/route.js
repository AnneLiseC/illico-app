// app/api/google/calendar/push/route.js
// Push unitaire d'un élément vers Google Calendar (après création/modification)
//
// LOT 4a — BASCULE SUR LES CIBLES :
//   La destination n'est plus l'env GOOGLE_CALENDAR_ID + les tokens du USER
//   déclencheur. On lit le cible_id de l'item → la cible (calendar_id +
//   compte_oauth_id) → les tokens du COMPTE DÉTENTEUR (comptes_oauth.id =
//   compte_oauth_id), et on pousse vers CE calendrier avec CES tokens.
//   - cible_id NULL → SKIP (aucun fallback sur GOOGLE_CALENDAR_ID).
//   - type 'dossier' → SKIP (le ciblage est porté par rendez_vous/interventions,
//     pas par dossiers ; marqueurs de chantier non poussés pour l'instant).
//   - DRY-RUN (GOOGLE_SYNC_DRY_RUN === '1') : logge ce qui serait poussé et
//     n'appelle ni Google ni le writeback en base.
//
// LOT 5a — la construction des events + la résolution de la cible + l'écriture
//   Google (dry-run) sont extraites dans app/lib/calendar/google.js (sans aucun
//   changement de comportement). Cette route garde l'orchestration POST, le scoping
//   (gate RLS, lot 4b) et les writebacks google_event_id (service_role).

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireUser } from '../../../../lib/api-auth'
import { getClientForCible, buildRdvEventBody, buildInterventionEventBodies } from '../../../../lib/calendar/dispatch'
import { DRY_RUN } from '../../../../lib/calendar/google'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Token Bearer ré-extrait inline (lot 4b) : requireUser le valide mais ne le renvoie
// pas. On en a besoin pour construire un client RLS-authentifié servant de GATE
// d'appartenance (l'item poussé doit être dans l'agence/société du user).
function extractToken(request) {
  const header = request.headers.get('authorization') || request.headers.get('Authorization')
  if (!header) return null
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : null
}

export async function POST(request) {
  const auth = await requireUser(request)
  if (auth.error) return auth.error
  try {
    const body = await request.json()
    const { type, id } = body

    if (!type || !id) {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })
    }

    // GATE d'appartenance (lot 4b) : client authentifié au JWT du user → la RLS
    // (agence pour une agente, société pour un admin) ne renvoie l'id que si l'item
    // est dans son périmètre. Sert UNIQUEMENT de contrôle d'autorisation ; les données
    // complètes (avec jointures) sont relues en service_role, bornées à l'id validé —
    // car la jointure dossier est référente-scopée et serait NULL pour un item de collègue.
    const token = extractToken(request)
    const supabaseUser = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } }
    )
    const tableItem = type === 'rdv' ? 'rendez_vous' : type === 'intervention' ? 'interventions_artisans' : null
    if (tableItem) {
      const { data: autorise } = await supabaseUser.from(tableItem).select('id').eq('id', id).maybeSingle()
      if (!autorise) {
        console.log('[push]', type, id, '— hors périmètre (RLS), refusé')
        return NextResponse.json({ error: 'Hors périmètre' }, { status: 403 })
      }
    }

    // ── RDV ─────────────────────────────────────────────────────────────────
    if (type === 'rdv') {
      const { data: rdv } = await supabaseAdmin
        .from('rendez_vous')
        .select('*, dossier:dossiers(id, reference, client:clients(civilite, prenom, nom)), artisan:artisans(id, entreprise)')
        .eq('id', id)
        .single()

      if (!rdv) return NextResponse.json({ error: 'RDV introuvable' }, { status: 404 })

      if (!rdv.cible_id) {
        console.log('[push] rdv', id, '— sans cible, non poussé')
        return NextResponse.json({ success: true, skipped: true, reason: 'sans cible' })
      }
      const client = await getClientForCible(rdv.cible_id)
      if (!client) {
        console.log('[push] rdv', id, '— cible', rdv.cible_id, 'non poussable (compte OAuth absent ou sans refresh_token), skip')
        return NextResponse.json({ success: true, skipped: true, reason: 'cible non poussable' })
      }
      console.log('[push] rdv', id, '→ cible', rdv.cible_id, 'calendar', client.calendarId, 'compte', client.compteOauthId, DRY_RUN ? '(DRY-RUN)' : '')

      const result = await client.upsert({
        eventBody: buildRdvEventBody(client, rdv),
        externalId: rdv.google_event_id,
        contexte: { type: 'rdv', itemId: id },
      })
      if (result.action === 'inserted' && !result.dryRun && result.id) {
        // google_event_id = id externe générique (eventId Google OU URL CalDAV iCloud).
        // google_etag stocké seulement si le handle le fournit (iCloud, B9-3) — anti-écho pull.
        const patch = { google_event_id: result.id }
        if (result.etag) patch.google_etag = result.etag
        await supabaseAdmin.from('rendez_vous').update(patch).eq('id', id)
      }
    }

    // ── Intervention ─────────────────────────────────────────────────────────
    if (type === 'intervention') {
      const { data: intervention } = await supabaseAdmin
        .from('interventions_artisans')
        .select('*, dossier:dossiers(id, reference, client:clients(prenom, nom)), artisan:artisans(id, entreprise)')
        .eq('id', id)
        .single()

      if (!intervention) return NextResponse.json({ error: 'Intervention introuvable' }, { status: 404 })

      if (!intervention.cible_id) {
        console.log('[push] intervention', id, '— sans cible, non poussée')
        return NextResponse.json({ success: true, skipped: true, reason: 'sans cible' })
      }
      const client = await getClientForCible(intervention.cible_id)
      if (!client) {
        console.log('[push] intervention', id, '— cible', intervention.cible_id, 'non poussable (compte OAuth absent ou sans refresh_token), skip')
        return NextResponse.json({ success: true, skipped: true, reason: 'cible non poussable' })
      }
      console.log('[push] intervention', id, '→ cible', intervention.cible_id, 'calendar', client.calendarId, 'compte', client.compteOauthId, DRY_RUN ? '(DRY-RUN)' : '')

      // Construction des events extraite en lib (lot 5a) : [] → rien à pousser (skip,
      // comme avant) ; sinon [eventPrincipal, ...extras] (multi-jours). L'event[0] porte
      // le google_event_id (upsert + writeback) ; les extras sont insert-only.
      const events = buildInterventionEventBodies(client, intervention)
      if (!events.length) return NextResponse.json({ success: true, skipped: true })
      const [firstEvent, ...extraEvents] = events

      const result = await client.upsert({
        eventBody: firstEvent,
        externalId: intervention.google_event_id,
        contexte: { type: 'intervention', itemId: id },
      })
      if (result.action === 'inserted') {
        if (!result.dryRun && result.id) {
          await supabaseAdmin.from('interventions_artisans')
            .update({ google_event_id: result.id }).eq('id', id)
        }
        // Extras (jours 2..n) : insert-only via upsert SANS externalId (→ insert,
        // exactement comme l'ancien gcalWrite direct). Même appel googleapis, même dry-run.
        for (const evt of extraEvents) {
          await client.upsert({
            eventBody: evt,
            externalId: null,
            contexte: { type: 'intervention-extra', itemId: id },
          })
        }
      }
    }

    // ── Dates clés dossier ───────────────────────────────────────────────────
    // Le ciblage est porté par rendez_vous/interventions (cible_id), PAS par les
    // dossiers. Les marqueurs de chantier (google_start/end_event_id) ne sont donc
    // pas poussés au lot 4a : on skip proprement (traitement éventuel plus tard).
    if (type === 'dossier') {
      console.log('[push] dossier', id, '— sans ciblage (cible_id porté par rdv/interv), marqueurs non poussés')
      return NextResponse.json({ success: true, skipped: true, reason: 'dossier non ciblé' })
    }

    return NextResponse.json({ success: true, dryRun: DRY_RUN })
  } catch (err) {
    console.error('Push error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
