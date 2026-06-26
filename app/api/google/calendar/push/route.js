// app/api/google/calendar/push/route.js
// Push unitaire d'un élément vers Google Calendar (après création/modification)
//
// LOT 4a — BASCULE SUR LES CIBLES :
//   La destination n'est plus l'env GOOGLE_CALENDAR_ID + les tokens du USER
//   déclencheur. On lit le cible_id de l'item → la cible (calendar_id +
//   compte_oauth_id) → les tokens du COMPTE DÉTENTEUR (google_tokens.id =
//   compte_oauth_id), et on pousse vers CE calendrier avec CES tokens.
//   - cible_id NULL → SKIP (aucun fallback sur GOOGLE_CALENDAR_ID).
//   - type 'dossier' → SKIP (le ciblage est porté par rendez_vous/interventions,
//     pas par dossiers ; marqueurs de chantier non poussés pour l'instant).
//   - DRY-RUN (GOOGLE_SYNC_DRY_RUN === '1') : logge ce qui serait poussé et
//     n'appelle ni Google ni le writeback en base.
//
// ⚠️ Le scoping tenant (lecture de l'item en service_role sans contrôle
//    d'appartenance) RESTE une faille connue, traitée au lot 4b — pas ici.

import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireUser } from '../../../../lib/api-auth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Mode simulation : calcule + logge l'événement sans rien écrire (Google ni base).
const DRY_RUN = process.env.GOOGLE_SYNC_DRY_RUN === '1'

// Token Bearer ré-extrait inline (lot 4b) : requireUser le valide mais ne le renvoie
// pas. On en a besoin pour construire un client RLS-authentifié servant de GATE
// d'appartenance (l'item poussé doit être dans l'agence/société du user).
function extractToken(request) {
  const header = request.headers.get('authorization') || request.headers.get('Authorization')
  if (!header) return null
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : null
}

function nextDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

// Client OAuth ciblant une LIGNE google_tokens par son id (= compte détenteur de
// la cible). ⚠️ Le refresh on('tokens') réécrit .eq('id', compteOauthId), JAMAIS
// .eq('user_id', ...) : on rafraîchit les tokens du compte de la cible, pas ceux
// du user déclencheur. Inverser corromprait le mauvais compte.
function buildOAuthClientForCompte(compteOauthId, tokens) {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
  client.setCredentials(tokens)
  client.on('tokens', async (newTokens) => {
    if (newTokens.access_token) {
      await supabaseAdmin.from('google_tokens').update({
        access_token: newTokens.access_token,
        expiry_date: newTokens.expiry_date,
        updated_at: new Date().toISOString(),
      }).eq('id', compteOauthId)
    }
  })
  return client
}

// Résout la cible d'un item → { calendar, calendarId, compteOauthId } ou null.
// null = rien à pousser : cible introuvable, sans compte OAuth, ou compte sans
// refresh_token (cible inerte). L'appelant logge la raison et skip.
async function getCalendarForCible(cibleId) {
  const { data: cible } = await supabaseAdmin
    .from('cibles_calendrier')
    .select('id, calendar_id, compte_oauth_id')
    .eq('id', cibleId)
    .single()
  if (!cible || !cible.compte_oauth_id) return null

  const { data: tokenData } = await supabaseAdmin
    .from('google_tokens')
    .select('*')
    .eq('id', cible.compte_oauth_id)
    .single()
  if (!tokenData || !tokenData.refresh_token) return null

  const oauthClient = buildOAuthClientForCompte(cible.compte_oauth_id, {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expiry_date: tokenData.expiry_date,
  })
  return {
    calendar: google.calendar({ version: 'v3', auth: oauthClient }),
    calendarId: cible.calendar_id,
    compteOauthId: cible.compte_oauth_id,
  }
}

// Seul point d'écriture Google de la route. En DRY-RUN : logge et ne touche rien.
// action ∈ 'insert' | 'update'. Renvoie { id, dryRun }.
async function gcalWrite({ calendar, action, calendarId, requestBody, eventId, compteOauthId, contexte }) {
  if (DRY_RUN) {
    console.log('[push][DRY-RUN]', JSON.stringify({
      action,
      type: contexte?.type,
      itemId: contexte?.itemId,
      calendarId,
      compteOauthId,
      summary: requestBody?.summary,
      start: requestBody?.start,
      end: requestBody?.end,
    }))
    return { id: null, dryRun: true }
  }
  if (action === 'update') {
    await calendar.events.update({ calendarId, eventId, requestBody })
    return { id: eventId, dryRun: false }
  }
  const res = await calendar.events.insert({ calendarId, requestBody })
  return { id: res.data.id, dryRun: false }
}

async function upsertEvent({ calendar, calendarId, compteOauthId, googleEventId, eventBody, contexte }) {
  if (googleEventId) {
    try {
      const r = await gcalWrite({ calendar, action: 'update', calendarId, eventId: googleEventId, requestBody: eventBody, compteOauthId, contexte })
      return { action: 'updated', id: r.id, dryRun: r.dryRun }
    } catch (err) {
      if (err.code !== 404 && err.code !== 410) throw err
    }
  }
  const r = await gcalWrite({ calendar, action: 'insert', calendarId, requestBody: eventBody, compteOauthId, contexte })
  return { action: 'inserted', id: r.id, dryRun: r.dryRun }
}

function buildIntervTimes(date, heure_debut, duree_minutes) {
  if (heure_debut) {
    const start = new Date(`${date}T${heure_debut}`)
    const end = new Date(start.getTime() + (duree_minutes || 60) * 60000)
    const fmt = d => d.toISOString().slice(0, 19)
    return { start: { dateTime: fmt(start), timeZone: 'Europe/Paris' }, end: { dateTime: fmt(end), timeZone: 'Europe/Paris' } }
  }
  return { start: { date }, end: { date: nextDay(date) } }
}

function rdvToGoogleEvent(rdv) {
  const typeLabels = {
    visite_technique_client: 'R1 - ',
    visite_technique_artisan: 'R2 - ',
    presentation_devis: 'R3 - ',
    autres: 'Autre - ',
  }
  const client = rdv.dossier?.client
  const nomClient = client ? `${client.civilite || ''} ${client.prenom} ${client.nom}`.trim() : ''
  const artisan = rdv.artisan?.entreprise || ''
  // date_heure est un timestamptz (instant UTC) → envoyer l'instant ISO COMPLET (offset/Z)
  // à Google ; timeZone:'Europe/Paris' ne sert qu'à l'affichage/récurrence. Ne PAS faire
  // slice(0,19) qui couperait l'offset et ré-étiquetterait le wall-clock UTC comme Paris (+offset erroné).
  const start = new Date(rdv.date_heure)
  const end = new Date(start.getTime() + (rdv.duree_minutes || 60) * 60000)
  const summary = rdv.type_rdv === 'autres'
    ? (rdv.titre || rdv.notes || 'Autre RDV')
    : `${typeLabels[rdv.type_rdv] || rdv.type_rdv}${nomClient ? ' | ' + nomClient : ''}${artisan ? ' x ' + artisan : ''}`
  return {
    summary,
    description: [
      rdv.dossier?.reference ? `Chantier : ${rdv.dossier.reference}` : '',
      rdv.notes ? `Notes : ${rdv.notes}` : '',
    ].filter(Boolean).join('\n'),
    start: { dateTime: start.toISOString(), timeZone: 'Europe/Paris' },
    end: { dateTime: end.toISOString(), timeZone: 'Europe/Paris' },
  }
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
      const resolved = await getCalendarForCible(rdv.cible_id)
      if (!resolved) {
        console.log('[push] rdv', id, '— cible', rdv.cible_id, 'non poussable (compte OAuth absent ou sans refresh_token), skip')
        return NextResponse.json({ success: true, skipped: true, reason: 'cible non poussable' })
      }
      console.log('[push] rdv', id, '→ cible', rdv.cible_id, 'calendar', resolved.calendarId, 'compte', resolved.compteOauthId, DRY_RUN ? '(DRY-RUN)' : '')

      const result = await upsertEvent({
        calendar: resolved.calendar, calendarId: resolved.calendarId, compteOauthId: resolved.compteOauthId,
        googleEventId: rdv.google_event_id, eventBody: rdvToGoogleEvent(rdv),
        contexte: { type: 'rdv', itemId: id },
      })
      if (result.action === 'inserted' && !result.dryRun && result.id) {
        await supabaseAdmin.from('rendez_vous').update({ google_event_id: result.id }).eq('id', id)
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
      const resolved = await getCalendarForCible(intervention.cible_id)
      if (!resolved) {
        console.log('[push] intervention', id, '— cible', intervention.cible_id, 'non poussable (compte OAuth absent ou sans refresh_token), skip')
        return NextResponse.json({ success: true, skipped: true, reason: 'cible non poussable' })
      }
      console.log('[push] intervention', id, '→ cible', intervention.cible_id, 'calendar', resolved.calendarId, 'compte', resolved.compteOauthId, DRY_RUN ? '(DRY-RUN)' : '')

      const artisan = intervention.artisan?.entreprise || 'Artisan'
      const client = intervention.dossier?.client
      const nomClient = client ? `${client.prenom} ${client.nom}`.trim() : ''
      const summary = ` ${artisan}${nomClient ? ' | ' + nomClient : ''}`
      const baseDesc = [
        intervention.dossier?.reference ? `Chantier : ${intervention.dossier.reference}` : '',
        intervention.notes ? `Notes : ${intervention.notes}` : '',
      ].filter(Boolean)

      let firstEvent
      let extraEvents = []

      const { heure_debut, duree_minutes } = intervention

      if (intervention.type_intervention === 'periode') {
        if (!intervention.date_fin && !heure_debut) return NextResponse.json({ success: true, skipped: true })
        if (heure_debut) {
          firstEvent = {
            summary,
            description: [...baseDesc, `[illico-int:${intervention.id}]`].join('\n'),
            ...buildIntervTimes(intervention.date_debut, heure_debut, duree_minutes),
          }
        } else {
          const endDate = new Date(intervention.date_fin)
          endDate.setDate(endDate.getDate() + 1)
          firstEvent = {
            summary,
            description: [...baseDesc, `[illico-int:${intervention.id}]`].join('\n'),
            start: { date: intervention.date_debut },
            end: { date: endDate.toISOString().slice(0, 10) },
          }
        }
      } else {
        const jours = [...(intervention.jours_specifiques || [])].sort()
        if (!jours.length) return NextResponse.json({ success: true, skipped: true })
        firstEvent = {
          summary,
          description: [...baseDesc, `[illico-int:${intervention.id}:0]`].join('\n'),
          ...buildIntervTimes(jours[0], heure_debut, duree_minutes),
        }
        extraEvents = jours.slice(1).map((jour, i) => ({
          summary,
          description: [...baseDesc, `[illico-int:${intervention.id}:${i + 1}]`].join('\n'),
          ...buildIntervTimes(jour, heure_debut, duree_minutes),
        }))
      }

      const result = await upsertEvent({
        calendar: resolved.calendar, calendarId: resolved.calendarId, compteOauthId: resolved.compteOauthId,
        googleEventId: intervention.google_event_id, eventBody: firstEvent,
        contexte: { type: 'intervention', itemId: id },
      })
      if (result.action === 'inserted') {
        if (!result.dryRun && result.id) {
          await supabaseAdmin.from('interventions_artisans')
            .update({ google_event_id: result.id }).eq('id', id)
        }
        for (const evt of extraEvents) {
          await gcalWrite({
            calendar: resolved.calendar, action: 'insert', calendarId: resolved.calendarId,
            requestBody: evt, compteOauthId: resolved.compteOauthId,
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
