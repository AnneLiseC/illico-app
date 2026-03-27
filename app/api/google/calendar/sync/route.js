// app/api/google/calendar/sync/route.js
// Synchronisation bidirectionnelle app ↔ Google Calendar

import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID

function buildOAuthClient(tokens) {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
  client.setCredentials(tokens)
  return client
}

// ── Convertir un RDV en événement Google ──
function rdvToGoogleEvent(rdv) {
  const typeLabels = {
    visite_technique_client: 'R1 — Visite technique client',
    visite_technique_artisan: 'R2 — Visite technique avec artisan',
    presentation_devis: 'R3 — Présentation devis',
  }
  const label = typeLabels[rdv.type_rdv] || rdv.type_rdv
  const client = rdv.dossier?.client
  const nomClient = client ? `${client.civilite || ''} ${client.prenom} ${client.nom}`.trim() : ''
  const artisan = rdv.artisan?.entreprise || ''

  const start = new Date(rdv.date_heure)
  const end = new Date(start.getTime() + (rdv.duree_minutes || 60) * 60000)

  return {
    summary: ` ${label}${nomClient ? ' | ' + nomClient : ''}${artisan ? ' x ' + artisan : ''}`,
    description: [
      rdv.dossier?.reference ? `Chantier : ${rdv.dossier.reference}` : '',
      rdv.notes ? `Notes : ${rdv.notes}` : '',
      `[illico-rdv:${rdv.id}]`, // tag pour identification lors de la synchro retour
    ].filter(Boolean).join('\n'),
    start: { dateTime: start.toISOString(), timeZone: 'Europe/Paris' },
    end: { dateTime: end.toISOString(), timeZone: 'Europe/Paris' },
    colorId: rdv.type_rdv === 'visite_technique_client' ? '1'
            : rdv.type_rdv === 'visite_technique_artisan' ? '2' : '6',
  }
}

// ── Convertir une intervention en événement Google ──
function interventionToGoogleEvent(intervention) {
  const artisan = intervention.artisan?.entreprise || 'Artisan'
  const client = intervention.dossier?.client
  const nomClient = client ? `${client.prenom} ${client.nom}`.trim() : ''

  if (intervention.type_intervention === 'periode') {
    return [{
      summary: `🔨 ${artisan}${nomClient ? ' | ' + nomClient : ''}`,
      description: [
        intervention.dossier?.reference ? `Chantier : ${intervention.dossier.reference}` : '',
        intervention.notes ? `Notes : ${intervention.notes}` : '',
        `[illico-int:${intervention.id}]`,
      ].filter(Boolean).join('\n'),
      start: { date: intervention.date_debut },
      end: { date: (() => { const d = new Date(intervention.date_fin); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) })() },
    }]
  } else {
    // Jours spécifiques → un événement par jour
    return (intervention.jours_specifiques || []).map((jour, idx) => ({
      summary: ` 🔨 ${artisan}${nomClient ? ' | ' + nomClient : ''}`,
      description: [
        intervention.dossier?.reference ? `Chantier : ${intervention.dossier.reference}` : '',
        intervention.notes ? `Notes : ${intervention.notes}` : '',
        `[illico-int:${intervention.id}:${idx}]`,
      ].filter(Boolean).join('\n'),
      start: { date: jour },
      end: { date: jour },
    }))
  }
}

export async function POST(request) {
  try {
    // Auth : lire userId depuis le body (Supabase session = localStorage, pas cookie)
    const body = await request.json()
    const userId = body?.userId
    if (!userId) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    // Récupérer les tokens Google
    const { data: tokenData } = await supabaseAdmin
      .from('google_tokens')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (!tokenData) {
      return NextResponse.json({ error: 'Google Calendar non connecté' }, { status: 400 })
    }

    const auth = buildOAuthClient({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expiry_date: tokenData.expiry_date,
    })

    // Rafraîchir le token si expiré
    auth.on('tokens', async (tokens) => {
      if (tokens.access_token) {
        await supabaseAdmin.from('google_tokens').update({
          access_token: tokens.access_token,
          expiry_date: tokens.expiry_date,
          updated_at: new Date().toISOString(),
        }).eq('user_id', user.id)
      }
    })

    const calendar = google.calendar({ version: 'v3', auth })
    const results = { pushed: 0, updated: 0, errors: [] }

    // ── PUSH : App → Google ──

    // 1. RDV
    const { data: rdvs } = await supabaseAdmin
      .from('rendez_vous')
      .select('*, dossier:dossiers(id, reference, client:clients(civilite, prenom, nom)), artisan:artisans(id, entreprise)')

    for (const rdv of (rdvs || [])) {
      try {
        const event = rdvToGoogleEvent(rdv)
        if (rdv.google_event_id) {
          // Mettre à jour l'événement existant
          await calendar.events.update({
            calendarId: CALENDAR_ID,
            eventId: rdv.google_event_id,
            requestBody: event,
          })
          results.updated++
        } else {
          // Créer un nouvel événement
          const res = await calendar.events.insert({
            calendarId: CALENDAR_ID,
            requestBody: event,
          })
          await supabaseAdmin.from('rendez_vous')
            .update({ google_event_id: res.data.id })
            .eq('id', rdv.id)
          results.pushed++
        }
      } catch (err) {
        results.errors.push(`RDV ${rdv.id}: ${err.message}`)
      }
    }

    // 2. Interventions
    const { data: interventions } = await supabaseAdmin
      .from('interventions_artisans')
      .select('*, dossier:dossiers(id, reference, client:clients(prenom, nom)), artisan:artisans(id, entreprise)')

    for (const intervention of (interventions || [])) {
      try {
        const events = interventionToGoogleEvent(intervention)
        if (intervention.google_event_id) {
          // Pour les interventions déjà synchro, mettre à jour le premier événement
          await calendar.events.update({
            calendarId: CALENDAR_ID,
            eventId: intervention.google_event_id,
            requestBody: events[0],
          })
          results.updated++
        } else {
          // Créer le(s) événement(s)
          const res = await calendar.events.insert({
            calendarId: CALENDAR_ID,
            requestBody: events[0],
          })
          await supabaseAdmin.from('interventions_artisans')
            .update({ google_event_id: res.data.id })
            .eq('id', intervention.id)
          // Si jours multiples, créer les suivants sans stocker leur ID
          for (let i = 1; i < events.length; i++) {
            await calendar.events.insert({
              calendarId: CALENDAR_ID,
              requestBody: events[i],
            })
          }
          results.pushed++
        }
      } catch (err) {
        results.errors.push(`Intervention ${intervention.id}: ${err.message}`)
      }
    }

    // ── PULL : Google → App (événements créés directement dans Google Calendar) ──
    const now = new Date()
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1)

    const { data: googleEvents } = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: sixMonthsAgo.toISOString(),
      maxResults: 500,
      singleEvents: true,
      orderBy: 'startTime',
    })

    // ── PUSH : Dates démarrage/fin chantiers → Google ──
    const { data: dossiers } = await supabaseAdmin
      .from('dossiers')
      .select('id, reference, date_demarrage_chantier, date_fin_chantier, google_start_event_id, google_end_event_id, client:clients(prenom, nom)')

    for (const dossier of (dossiers || [])) {
      // Démarrage chantier
      if (dossier.date_demarrage_chantier) {
        try {
          const eventStart = {
            summary: `🏗 Démarrage ${dossier.client ? ' | ' + dossier.client.prenom + ' ' + dossier.client.nom : ''}`,
            description: `[illico-start:${dossier.id}]`,
            start: { date: dossier.date_demarrage_chantier },
            end: { date: dossier.date_demarrage_chantier },
            colorId: '2', // vert
          }
          if (dossier.google_start_event_id) {
            await calendar.events.update({ calendarId: CALENDAR_ID, eventId: dossier.google_start_event_id, requestBody: eventStart })
            results.updated++
          } else {
            const res = await calendar.events.insert({ calendarId: CALENDAR_ID, requestBody: eventStart })
            await supabaseAdmin.from('dossiers').update({ google_start_event_id: res.data.id }).eq('id', dossier.id)
            results.pushed++
          }
        } catch (err) { results.errors.push(`Démarrage ${dossier.id}: ${err.message}`) }
      }

      // Fin chantier
      if (dossier.date_fin_chantier) {
        try {
          const eventEnd = {
            summary: `🏁 Fin ${dossier.client ? ' | ' + dossier.client.prenom + ' ' + dossier.client.nom : ''}`,
            description: `[illico-end:${dossier.id}]`,
            start: { date: dossier.date_fin_chantier },
            end: { date: dossier.date_fin_chantier },
            colorId: '6', // orange
          }
          if (dossier.google_end_event_id) {
            await calendar.events.update({ calendarId: CALENDAR_ID, eventId: dossier.google_end_event_id, requestBody: eventEnd })
            results.updated++
          } else {
            const res = await calendar.events.insert({ calendarId: CALENDAR_ID, requestBody: eventEnd })
            await supabaseAdmin.from('dossiers').update({ google_end_event_id: res.data.id }).eq('id', dossier.id)
            results.pushed++
          }
        } catch (err) { results.errors.push(`Fin ${dossier.id}: ${err.message}`) }
      }
    }

    return NextResponse.json({
      success: true,
      pushed: results.pushed,
      updated: results.updated,
      errors: results.errors,
      message: `${results.pushed} créé(s), ${results.updated} mis à jour${results.errors.length ? `, ${results.errors.length} erreur(s)` : ''}`,
    })

  } catch (err) {
    console.error('Sync error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET : vérifier si l'utilisateur est connecté à Google
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    if (!userId) return NextResponse.json({ connected: false })

    const { data } = await supabaseAdmin
      .from('google_tokens')
      .select('updated_at')
      .eq('user_id', userId)
      .single()

    return NextResponse.json({ connected: !!data, lastSync: data?.updated_at || null })
  } catch {
    return NextResponse.json({ connected: false })
  }
}