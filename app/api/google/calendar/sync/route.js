// app/api/google/calendar/sync/route.js

import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID

function buildOAuthClient(userId, tokens) {
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
      }).eq('user_id', userId)
    }
  })
  return client
}

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
    summary: `${label}${nomClient ? ' | ' + nomClient : ''}${artisan ? ' x ' + artisan : ''}`,
    description: [
      rdv.dossier?.reference ? `Chantier : ${rdv.dossier.reference}` : '',
      rdv.notes ? `Notes : ${rdv.notes}` : '',
      `[illico-rdv:${rdv.id}]`,
    ].filter(Boolean).join('\n'),
    start: { dateTime: start.toISOString(), timeZone: 'Europe/Paris' },
    end: { dateTime: end.toISOString(), timeZone: 'Europe/Paris' },
    colorId: rdv.type_rdv === 'visite_technique_client' ? '1'
            : rdv.type_rdv === 'visite_technique_artisan' ? '2' : '6',
  }
}

function interventionToGoogleEvent(intervention) {
  const artisan = intervention.artisan?.entreprise || 'Artisan'
  const client = intervention.dossier?.client
  const nomClient = client ? `${client.prenom} ${client.nom}`.trim() : ''
  const summary = `🔨 ${artisan}${nomClient ? ' | ' + nomClient : ''}`
    const baseDesc = [
      intervention.dossier?.reference ? `Chantier : ${intervention.dossier.reference}` : '',
      intervention.notes ? `Notes : ${intervention.notes}` : '',
    ].filter(Boolean)
  if (intervention.type_intervention === 'periode') {
    const endDate = new Date(intervention.date_fin)
    endDate.setDate(endDate.getDate() + 1)
    return [{
      summary,
      description: [...baseDesc, `[illico-int:${intervention.id}]`].join('\n'),
      start: { date: intervention.date_debut },
      end: { date: endDate.toISOString().slice(0, 10) },
    }]
  }
  return (intervention.jours_specifiques || []).map((jour, idx) => ({
    summary,
    description: [...baseDesc, `[illico-int:${intervention.id}:${idx}]`].join('\n'),
    start: { date: jour },
    end: { date: jour },
  }))
}
 
// Crée ou met à jour un événement Google ; re-crée si 404/410 (supprimé côté Google)
async function upsertEvent(calendar, googleEventId, eventBody) {
  if (googleEventId) {
    try {
      await calendar.events.update({ calendarId: CALENDAR_ID, eventId: googleEventId, requestBody: eventBody })
      return { action: 'updated', id: googleEventId }
    } catch (err) {
      if (err.code !== 404 && err.code !== 410) throw err
      // L'événement a été supprimé côté Google → on le re-crée
    }
  }
  const res = await calendar.events.insert({ calendarId: CALENDAR_ID, requestBody: eventBody })
  return { action: 'inserted', id: res.data.id }
}

export async function POST(request) {
  try {

    const body = await request.json()
    const userId = body?.userId
    if (!userId) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const { data: tokenData } = await supabaseAdmin
      .from('google_tokens')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (!tokenData) {
      return NextResponse.json({ error: 'Google Calendar non connecté' }, { status: 400 })
    }

    const auth = buildOAuthClient(userId, {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expiry_date: tokenData.expiry_date,
    })

    const calendar = google.calendar({ version: 'v3', auth })
    const results = { pushed: 0, updated: 0, pulled: 0, errors: [] }

    // ── PUSH : App → Google ──

    // 1. RDVs
    const { data: rdvs } = await supabaseAdmin
      .from('rendez_vous')
      .select('*, dossier:dossiers(id, reference, client:clients(civilite, prenom, nom)), artisan:artisans(id, entreprise)')

    for (const rdv of (rdvs || [])) {
      try {
        const result = await upsertEvent(calendar, rdv.google_event_id, rdvToGoogleEvent(rdv))
        if (result.action === 'inserted') {
          await supabaseAdmin.from('rendez_vous').update({ google_event_id: result.id }).eq('id', rdv.id)
          results.pushed++
          } else {
          results.updated++
        }
      } catch (err) {
        results.errors.push(`RDV ${rdv.id}: ${err.message}`)
      }
    }

    // 2. Interventions artisans
    const { data: interventions } = await supabaseAdmin
      .from('interventions_artisans')
      .select('*, dossier:dossiers(id, reference, client:clients(prenom, nom)), artisan:artisans(id, entreprise)')

    for (const intervention of (interventions || [])) {
      try {
        const events = interventionToGoogleEvents(intervention)
        if (!events.length) continue
        const result = await upsertEvent(calendar, intervention.google_event_id, events[0])
        if (result.action === 'inserted') {
          await supabaseAdmin.from('interventions_artisans')
            .update({ google_event_id: result.id }).eq('id', intervention.id)
          for (let i = 1; i < events.length; i++) {
            await calendar.events.insert({ calendarId: CALENDAR_ID, requestBody: events[i] })
          }
          results.pushed++
        } else {
          results.updated++
        }
      } catch (err) {
        results.errors.push(`Intervention ${intervention.id}: ${err.message}`)
      }
    }

    // 3. Dates clés dossiers
    const { data: dossiers } = await supabaseAdmin
      .from('dossiers')
      .select('id, reference, date_demarrage_chantier, date_fin_chantier, google_start_event_id, google_end_event_id, client:clients(prenom, nom)')

    for (const dossier of (dossiers || [])) {
      if (dossier.date_demarrage_chantier) {
        try {
          const eventStart = {
            summary: ` Démarrage ${dossier.client ? ' | ' + dossier.client.prenom + ' ' + dossier.client.nom : ''}`,
            description: `[illico-start:${dossier.id}]`,
            start: { date: dossier.date_demarrage_chantier },
            end: { date: dossier.date_demarrage_chantier },
            colorId: '2',
          }
          const result = await upsertEvent(calendar, dossier.google_start_event_id, eventStart)
          if (result.action === 'inserted') {
            await supabaseAdmin.from('dossiers').update({ google_start_event_id: result.id }).eq('id', dossier.id)
            results.pushed++
          } else {
            results.updated++
          }
        } catch (err) { results.errors.push(`Démarrage ${dossier.id}: ${err.message}`) }
      }

      if (dossier.date_fin_chantier) {
        try {
          const eventEnd = {
            summary: `Fin ${dossier.client ? ' | ' + dossier.client.prenom + ' ' + dossier.client.nom : ''}`,
            description: `[illico-end:${dossier.id}]`,
            start: { date: dossier.date_fin_chantier },
            end: { date: dossier.date_fin_chantier },
            colorId: '6',
          }
          const result = await upsertEvent(calendar, dossier.google_end_event_id, eventEnd)
          if (result.action === 'inserted') {
            await supabaseAdmin.from('dossiers').update({ google_end_event_id: result.id }).eq('id', dossier.id)
            results.pushed++
          } else {
            results.updated++
          }
        } catch (err) { results.errors.push(`Fin ${dossier.id}: ${err.message}`) }
      }
    }

    // ── PULL : Google → App ──────────────────────────────────────────────────
    try {
      const now = new Date()
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1)
      const twelveMonthsAhead = new Date(now.getFullYear(), now.getMonth() + 12, 1)
 
      const { data: calData } = await calendar.events.list({
        calendarId: CALENDAR_ID,
        timeMin: sixMonthsAgo.toISOString(),
        timeMax: twelveMonthsAhead.toISOString(),
        maxResults: 1000,
        singleEvents: true,
        orderBy: 'startTime',
      })
 
      for (const evt of (calData?.items || [])) {
        if (evt.status === 'cancelled') continue
        const desc = evt.description || ''
 
        // RDV modifié dans Google ?
        const rdvMatch = desc.match(/\[illico-rdv:([^\]]+)\]/)
        if (rdvMatch && evt.start?.dateTime) {
          try {
            const { data: rdv } = await supabaseAdmin
              .from('rendez_vous')
              .select('id, date_heure, duree_minutes')
              .eq('id', rdvMatch[1])
              .single()
            if (rdv) {
              const gStart = new Date(evt.start.dateTime)
              const gEnd = new Date(evt.end.dateTime)
              const gDuration = Math.round((gEnd - gStart) / 60000)
              if (Math.abs(gStart - new Date(rdv.date_heure)) > 60000 || gDuration !== rdv.duree_minutes) {
                await supabaseAdmin.from('rendez_vous')
                  .update({ date_heure: gStart.toISOString(), duree_minutes: gDuration })
                  .eq('id', rdvMatch[1])
                results.pulled++
              }
            }
          } catch {}
          continue
        }
 
        // Intervention période modifiée dans Google ?
        // On cible uniquement le tag sans indice (période = un seul événement)
        const intMatch = desc.match(/\[illico-int:([a-f0-9-]{36})\]\s*$/)
        if (intMatch && evt.start?.date && evt.end?.date) {
          try {
            const { data: intervention } = await supabaseAdmin
              .from('interventions_artisans')
              .select('id, type_intervention, date_debut, date_fin')
              .eq('id', intMatch[1])
              .single()
            if (intervention?.type_intervention === 'periode') {
              const gEndExcl = new Date(evt.end.date)
              gEndExcl.setDate(gEndExcl.getDate() - 1)
              const gEndStr = gEndExcl.toISOString().slice(0, 10)
              if (evt.start.date !== intervention.date_debut || gEndStr !== intervention.date_fin) {
                await supabaseAdmin.from('interventions_artisans')
                  .update({ date_debut: evt.start.date, date_fin: gEndStr })
                  .eq('id', intMatch[1])
                results.pulled++
              }
            }
          } catch {}
          continue
        }
 
        // Date démarrage chantier modifiée dans Google ?
        const startMatch = desc.match(/\[illico-start:([^\]]+)\]/)
        if (startMatch && evt.start?.date) {
          try {
            const { data: dossier } = await supabaseAdmin
              .from('dossiers')
              .select('id, date_demarrage_chantier')
              .eq('id', startMatch[1])
              .single()
            if (dossier && evt.start.date !== dossier.date_demarrage_chantier) {
              await supabaseAdmin.from('dossiers')
                .update({ date_demarrage_chantier: evt.start.date })
                .eq('id', startMatch[1])
              results.pulled++
            }
          } catch {}
          continue
        }
 
        // Date fin chantier modifiée dans Google ?
        const endMatch = desc.match(/\[illico-end:([^\]]+)\]/)
        if (endMatch && evt.start?.date) {
          try {
            const { data: dossier } = await supabaseAdmin
              .from('dossiers')
              .select('id, date_fin_chantier')
              .eq('id', endMatch[1])
              .single()
            if (dossier && evt.start.date !== dossier.date_fin_chantier) {
              await supabaseAdmin.from('dossiers')
                .update({ date_fin_chantier: evt.start.date })
                .eq('id', endMatch[1])
              results.pulled++
            }
          } catch {}
        }
      }
    } catch (err) {
      results.errors.push(`Pull: ${err.message}`)
    }
 
    // Mettre à jour le timestamp de dernière synchro
    await supabaseAdmin.from('google_tokens')
      .update({ updated_at: new Date().toISOString() })
      .eq('user_id', userId)
 
    const parts = []
    if (results.pushed > 0) parts.push(`${results.pushed} créé(s)`)
    if (results.updated > 0) parts.push(`${results.updated} mis à jour`)
    if (results.pulled > 0) parts.push(`${results.pulled} importé(s) de Google`)
    if (results.errors.length > 0) parts.push(`${results.errors.length} erreur(s)`)

    return NextResponse.json({
      success: true,
      pushed: results.pushed,
      updated: results.updated,
      errors: results.errors,
      message: parts.length ? parts.join(', ') : 'Planning déjà à jour',
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