// app/api/google/calendar/push/route.js
// Push unitaire d'un élément vers Google Calendar (après création/modification)

import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID

function nextDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

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

async function getCalendar(userId) {
  const { data: tokenData } = await supabaseAdmin
    .from('google_tokens')
    .select('*')
    .eq('user_id', userId)
    .single()
  if (!tokenData) return null
  const auth = buildOAuthClient(userId, {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expiry_date: tokenData.expiry_date,
  })
  return google.calendar({ version: 'v3', auth })
}

async function upsertEvent(calendar, googleEventId, eventBody) {
  if (googleEventId) {
    try {
      await calendar.events.update({ calendarId: CALENDAR_ID, eventId: googleEventId, requestBody: eventBody })
      return { action: 'updated', id: googleEventId }
    } catch (err) {
      if (err.code !== 404 && err.code !== 410) throw err
    }
  }
  const res = await calendar.events.insert({ calendarId: CALENDAR_ID, requestBody: eventBody })
  return { action: 'inserted', id: res.data.id }
}

function rdvToGoogleEvent(rdv) {
  const typeLabels = {
    visite_technique_client: 'R1 — ',
    visite_technique_artisan: 'R2 — ',
    presentation_devis: 'R3 — ',
  }
  const label = typeLabels[rdv.type_rdv] || rdv.type_rdv
  const client = rdv.dossier?.client
  const nomClient = client ? `${client.civilite || ''} ${client.prenom} ${client.nom}`.trim() : ''
  const artisan = rdv.artisan?.entreprise || ''
  const start = new Date(rdv.date_heure)
  const end = new Date(start.getTime() + (rdv.duree_minutes || 60) * 60000)

  // Envoyer sans suffixe Z pour que Google interprète via timeZone (évite le décalage UTC→Paris)
  const fmtNaive = (d) => d.toISOString().slice(0, 19)

  return {
    summary: `${label}${nomClient ? ' | ' + nomClient : ''}${artisan ? ' x ' + artisan : ''}`,
    description: [
      rdv.dossier?.reference ? `Chantier : ${rdv.dossier.reference}` : '',
      rdv.notes ? `Notes : ${rdv.notes}` : '',
      `[illico-rdv:${nomClient}]`,
    ].filter(Boolean).join('\n'),
    start: { dateTime: fmtNaive(start), timeZone: 'Europe/Paris' },
    end: { dateTime: fmtNaive(end), timeZone: 'Europe/Paris' },
    colorId: rdv.type_rdv === 'visite_technique_client' ? '1'
            : rdv.type_rdv === 'visite_technique_artisan' ? '2' : '6',
  }
}

export async function POST(request) {
  try {
    const body = await request.json()
    const { userId, type, id } = body

    if (!userId || !type || !id) {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })
    }

    const calendar = await getCalendar(userId)
    if (!calendar) {
      return NextResponse.json({ success: true, skipped: true })
    }

    // ── RDV ─────────────────────────────────────────────────────────────────
    if (type === 'rdv') {
      const { data: rdv } = await supabaseAdmin
        .from('rendez_vous')
        .select('*, dossier:dossiers(id, reference, client:clients(civilite, prenom, nom)), artisan:artisans(id, entreprise)')
        .eq('id', id)
        .single()

      if (!rdv) return NextResponse.json({ error: 'RDV introuvable' }, { status: 404 })

      const result = await upsertEvent(calendar, rdv.google_event_id, rdvToGoogleEvent(rdv))
      if (result.action === 'inserted') {
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

      const artisan = intervention.artisan?.entreprise || 'Artisan'
      const client = intervention.dossier?.client
      const nomClient = client ? `${client.prenom} ${client.nom}`.trim() : ''
      const summary = ` ${artisan}${nomClient ? ' | ' + nomClient : ''}`
      const baseDesc = [
        intervention.dossier?.reference ? `Chantier : ${intervention.dossier.reference}` : '',
        intervention.notes ? `Notes : ${intervention.notes}` : '',
      ].filter(Boolean)

      if (intervention.type_intervention === 'periode') {
        if (!intervention.date_debut) return NextResponse.json({ success: true, skipped: true })
        const baseDescStr = baseDesc.join('\n')

        const eventDebut = {
          summary: `Début ${summary}`,
          description: [baseDescStr, `[illico-int-debut:${intervention.id}]`].filter(Boolean).join('\n'),
          start: { date: intervention.date_debut },
           end: { date: nextDay(intervention.date_debut) },
          colorId: '2',
        }
        const resultDebut = await upsertEvent(calendar, intervention.google_event_id, eventDebut)
        if (resultDebut.action === 'inserted') {
          await supabaseAdmin.from('interventions_artisans')
            .update({ google_event_id: resultDebut.id }).eq('id', id)
        }

        if (intervention.date_fin) {
          const eventFin = {
            summary: `Fin ${summary}`,
            description: [baseDescStr, `[illico-int-fin:${intervention.id}]`].filter(Boolean).join('\n'),
            start: { date: intervention.date_fin },
            end: { date: nextDay(intervention.date_fin) },
            colorId: '6',
          }
          const resultFin = await upsertEvent(calendar, intervention.google_end_event_id, eventFin)
          if (resultFin.action === 'inserted') {
            await supabaseAdmin.from('interventions_artisans')
              .update({ google_end_event_id: resultFin.id }).eq('id', id)
          }
        }
      } else {
        const jours = [...(intervention.jours_specifiques || [])].sort()
        if (!jours.length) return NextResponse.json({ success: true, skipped: true })
        const firstEvent = {
          summary,
          description: [...baseDesc, `[illico-int:${intervention.id}]`].join('\n'),
          start: { date: jours[0] },
          end: { date: nextDay(jours[jours.length - 1]) },
        }
        const result = await upsertEvent(calendar, intervention.google_event_id, firstEvent)
        if (result.action === 'inserted') {
          await supabaseAdmin.from('interventions_artisans')
            .update({ google_event_id: result.id }).eq('id', id)
        }
      }
    }

    // ── Dates clés dossier ───────────────────────────────────────────────────
    if (type === 'dossier') {
      const { data: dossier } = await supabaseAdmin
        .from('dossiers')
        .select('id, date_demarrage_chantier, date_fin_chantier, google_start_event_id, google_end_event_id, client:clients(prenom, nom)')
        .eq('id', id)
        .single()

      if (!dossier) return NextResponse.json({ error: 'Dossier introuvable' }, { status: 404 })

      const nomClient = dossier.client ? `${dossier.client.prenom} ${dossier.client.nom}` : ''

      if (dossier.date_demarrage_chantier) {
        const eventStart = {
          summary: `Démarrage${nomClient ? ' | ' + nomClient : ''}`,
          description: `[illico-start:${dossier.id}]`,
          start: { date: dossier.date_demarrage_chantier },
          end: { date: nextDay(dossier.date_demarrage_chantier) },
          colorId: '2',
        }
        const result = await upsertEvent(calendar, dossier.google_start_event_id, eventStart)
        if (result.action === 'inserted') {
          await supabaseAdmin.from('dossiers').update({ google_start_event_id: result.id }).eq('id', id)
        }
      }

      if (dossier.date_fin_chantier) {
        const eventEnd = {
          summary: `Fin${nomClient ? ' | ' + nomClient : ''}`,
          description: `[illico-end:${dossier.id}]`,
          start: { date: dossier.date_fin_chantier },
          end: { date: nextDay(dossier.date_fin_chantier) },
          colorId: '6',
        }
        const result = await upsertEvent(calendar, dossier.google_end_event_id, eventEnd)
        if (result.action === 'inserted') {
          await supabaseAdmin.from('dossiers').update({ google_end_event_id: result.id }).eq('id', id)
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Push error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
