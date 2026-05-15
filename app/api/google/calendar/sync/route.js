// app/api/google/calendar/sync/route.js
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

function rdvToGoogleEvent(rdv) {
  const typeLabels = {
    visite_technique_client: 'R1 - ',
    visite_technique_artisan: 'R2 -',
    presentation_devis: 'R3 - ',
    autres : 'Autre - ',
  }
  const client = rdv.dossier?.client
  const nomClient = client ? `${client.civilite || ''} ${client.prenom} ${client.nom}`.trim() : ''
  const artisan = rdv.artisan?.entreprise || ''
  const start = new Date(rdv.date_heure)
  const end = new Date(start.getTime() + (rdv.duree_minutes || 60) * 60000)
  const fmtNaive = (d) => d.toISOString().slice(0, 19)
  const summary = rdv.type_rdv === 'autres'
    ? (rdv.titre || rdv.notes || 'Autre RDV')
    : `${typeLabels[rdv.type_rdv] || rdv.type_rdv}${nomClient ? ' | ' + nomClient : ''}${artisan ? ' x ' + artisan : ''}`
  return {
    summary,
    description: [
      rdv.dossier?.reference ? `Chantier : ${rdv.dossier.reference}` : '',
      rdv.notes ? `Notes : ${rdv.notes}` : '',
    ].filter(Boolean).join('\n'),
    start: { dateTime: fmtNaive(start), timeZone: 'Europe/Paris' },
    end: { dateTime: fmtNaive(end), timeZone: 'Europe/Paris' },
  }
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

function interventionToGoogleEvents(intervention) {
  if (!intervention.date_debut) return []
  if (intervention.type_intervention === 'jours_specifiques' && !intervention.jours_specifiques?.length) return []

  const artisan = intervention.artisan?.entreprise || 'Artisan'
  const client = intervention.dossier?.client
  const nomClient = client ? `${client.prenom} ${client.nom}`.trim() : ''
  const summary = `🔨 ${artisan}${nomClient ? ' | ' + nomClient : ''}`
  const baseDesc = [
    intervention.dossier?.reference ? `Chantier : ${intervention.dossier.reference}` : '',
    intervention.notes ? `Notes : ${intervention.notes}` : '',
  ].filter(Boolean)
  const { heure_debut, duree_minutes } = intervention

  if (intervention.type_intervention === 'periode') {
    if (!intervention.date_debut) return []
    if (heure_debut) {
      return [{
        summary,
        description: [...baseDesc, `[illico-int:${intervention.id}]`].join('\n'),
        ...buildIntervTimes(intervention.date_debut, heure_debut, duree_minutes),
      }]
    }
    const endDate = new Date(intervention.date_fin)
    endDate.setDate(endDate.getDate() + 1)
    return [{
      summary,
      description: [...baseDesc, `[illico-int:${intervention.id}]`].join('\n'),
      start: { date: intervention.date_debut },
      end: { date: endDate.toISOString().slice(0, 10) },
    }]
  }
  const jours = [...intervention.jours_specifiques].sort()
  return jours.map((jour, idx) => ({
    summary,
    description: [...baseDesc, `[illico-int:${intervention.id}:${idx}]`].join('\n'),
    ...buildIntervTimes(jour, heure_debut, duree_minutes),
  }))
}

// Tente une mise à jour ; retourne 'updated' ou 'not_found' si supprimé côté Google
async function tryUpdate(calendar, googleEventId, eventBody) {
  try {
    await calendar.events.update({ calendarId: CALENDAR_ID, eventId: googleEventId, requestBody: eventBody })
    return 'updated'
  } catch (err) {
    if (err.code === 404 || err.code === 410) return 'not_found'
    throw err
  }
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
    const results = { pushed: 0, updated: 0, pulled: 0, deleted: 0, errors: [] }

    // Vérifier que le calendrier est accessible avant de commencer
    try {
      await calendar.calendars.get({ calendarId: CALENDAR_ID })
    } catch (err) {
      const isInvalidGrant = err.code === 401
        || err.message?.includes('invalid_grant')
        || err.message?.includes('Token has been expired')
        || err.message?.includes('invalid_client')
      if (isInvalidGrant) {
        await supabaseAdmin.from('google_tokens').delete().eq('user_id', userId)
        return NextResponse.json({ error: 'Session Google expirée, reconnectez Google Calendar', needsReconnect: true }, { status: 400 })
      }
      const detail = err.code === 404 ? 'Calendrier introuvable (vérifiez GOOGLE_CALENDAR_ID)'
                   : err.code === 403 ? 'Accès refusé au calendrier (partagez-le avec votre compte Google)'
                   : `Erreur calendrier : ${err.message}`
      return NextResponse.json({ error: detail }, { status: 400 })
    }

    // ── PUSH : App → Google ──────────────────────────────────────────────────
    // Si l'événement existe encore dans Google : mise à jour
    // Si l'événement n'existe plus dans Google (404/410) : Google fait foi → suppression dans l'app

    // 1. RDVs
    const { data: rdvs } = await supabaseAdmin
      .from('rendez_vous')
      .select('*, dossier:dossiers(id, reference, client:clients(civilite, prenom, nom)), artisan:artisans(id, entreprise)')

    for (const rdv of (rdvs || [])) {
      try {
        if (rdv.google_event_id) {
          const status = await tryUpdate(calendar, rdv.google_event_id, rdvToGoogleEvent(rdv))
          if (status === 'not_found') {
            await supabaseAdmin.from('rendez_vous').delete().eq('id', rdv.id)
            results.deleted++
          } else {
            results.updated++
          }
        } else {
          const res = await calendar.events.insert({ calendarId: CALENDAR_ID, requestBody: rdvToGoogleEvent(rdv) })
          await supabaseAdmin.from('rendez_vous').update({ google_event_id: res.data.id }).eq('id', rdv.id)
          results.pushed++
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

        for (const evt of events) {
          const { _googleEventId, _field, ...eventBody } = evt
          if (_googleEventId) {
            const status = await tryUpdate(calendar, _googleEventId, eventBody)
            if (status === 'not_found') {
              if (_field === 'google_event_id') {
                await supabaseAdmin.from('interventions_artisans').delete().eq('id', intervention.id)
                results.deleted++
                break
              } else {
                await supabaseAdmin.from('interventions_artisans')
                  .update({ [_field]: null }).eq('id', intervention.id)
              }
            } else {
              results.updated++
            }
          } else {
            const res = await calendar.events.insert({ calendarId: CALENDAR_ID, requestBody: eventBody })
            await supabaseAdmin.from('interventions_artisans')
              .update({ [_field]: res.data.id }).eq('id', intervention.id)
            results.pushed++
          }
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
            summary: ` Démarrage${dossier.client ? ' | ' + dossier.client.prenom + ' ' + dossier.client.nom : ''}`,
            start: { date: dossier.date_demarrage_chantier },
            end: { date: nextDay(dossier.date_demarrage_chantier) },
            colorId: '2',
          }
          if (dossier.google_start_event_id) {
            const status = await tryUpdate(calendar, dossier.google_start_event_id, eventStart)
            if (status === 'not_found') {
              await supabaseAdmin.from('dossiers')
                .update({ date_demarrage_chantier: null, google_start_event_id: null })
                .eq('id', dossier.id)
              results.deleted++
            } else {
              results.updated++
            }
          } else {
            const res = await calendar.events.insert({ calendarId: CALENDAR_ID, requestBody: eventStart })
            await supabaseAdmin.from('dossiers').update({ google_start_event_id: res.data.id }).eq('id', dossier.id)
            results.pushed++
          }
        } catch (err) { results.errors.push(`Démarrage ${dossier.id}: ${err.message}`) }
      }

      if (dossier.date_fin_chantier) {
        try {
          const eventEnd = {
            summary: ` Fin${dossier.client ? ' | ' + dossier.client.prenom + ' ' + dossier.client.nom : ''}`,
            start: { date: dossier.date_fin_chantier },
            end: { date: nextDay(dossier.date_fin_chantier) },
          }
          if (dossier.google_end_event_id) {
            const status = await tryUpdate(calendar, dossier.google_end_event_id, eventEnd)
            if (status === 'not_found') {
              await supabaseAdmin.from('dossiers')
                .update({ date_fin_chantier: null, google_end_event_id: null })
                .eq('id', dossier.id)
              results.deleted++
            } else {
              results.updated++
            }
          } else {
            const res = await calendar.events.insert({ calendarId: CALENDAR_ID, requestBody: eventEnd })
            await supabaseAdmin.from('dossiers').update({ google_end_event_id: res.data.id }).eq('id', dossier.id)
            results.pushed++
          }
        } catch (err) { results.errors.push(`Fin ${dossier.id}: ${err.message}`) }
      }
    }

    // ── PULL : Google → App ──────────────────────────────────────────────────
    try {
      const now = new Date()
      const januaryFirst = new Date(now.getFullYear(), 0, 1)
      const twelveMonthsAhead = new Date(now.getFullYear(), now.getMonth() + 12, 1)

      const { data: calData } = await calendar.events.list({
        calendarId: CALENDAR_ID,
        timeMin: januaryFirst.toISOString(),
        timeMax: twelveMonthsAhead.toISOString(),
        maxResults: 1000,
        singleEvents: true,
        orderBy: 'startTime',
      })

      const googleItems = calData?.items || []

      // Index des IDs actifs dans Google (pour la détection des suppressions)
      const activeGoogleIds = new Set(
        googleItems.filter(e => e.status !== 'cancelled').map(e => e.id)
      )

      // Modifications de dates/heures faites directement dans Google
      for (const evt of googleItems) {
        if (evt.status === 'cancelled') continue
        const desc = evt.description || ''

        // RDV déplacé dans Google ?
        const rdvMatch = desc.match(/\[illico-rdv:([^\]]+)\]/)
        if (rdvMatch && evt.start?.dateTime) {
          try {
            const { data: rdv } = await supabaseAdmin
              .from('rendez_vous').select('id, date_heure, duree_minutes').eq('id', rdvMatch[1]).single()
            if (rdv) {
              const gStart = new Date(evt.start.dateTime)
              const gEnd = new Date(evt.end.dateTime)
              const gDuration = Math.round((gEnd - gStart) / 60000)
              if (Math.abs(gStart - new Date(rdv.date_heure)) > 60000 || gDuration !== rdv.duree_minutes) {
                await supabaseAdmin.from('rendez_vous')
                  .update({ date_heure: gStart.toISOString(), duree_minutes: gDuration }).eq('id', rdvMatch[1])
                results.pulled++
              }
            }
          } catch {}
          continue
        }

        // Interventions et dates chantier : gérées uniquement depuis l'app, on ignore le pull
        if (desc.match(/\[illico-int[^\]]*\]/) || desc.match(/\[illico-(?:start|end):[^\]]+\]/)) continue

        // Événement Google sans tag illico → importer comme RDV "Autres" (avec heure ou journée entière)
        if (evt.start?.dateTime || evt.start?.date) {
          try {
            const { data: existing } = await supabaseAdmin
              .from('rendez_vous').select('id').eq('google_event_id', evt.id).maybeSingle()
            if (!existing) {
              let dateHeure, dureeMinutes
              if (evt.start.dateTime) {
                const gStart = new Date(evt.start.dateTime)
                const gEnd = new Date(evt.end.dateTime)
                dateHeure = gStart.toISOString()
                dureeMinutes = Math.round((gEnd - gStart) / 60000) || 60
              } else {
                dateHeure = new Date(evt.start.date + 'T00:00:00').toISOString()
                dureeMinutes = 1440
              }
              const { error: insertError } = await supabaseAdmin.from('rendez_vous').insert({
                type_rdv: 'autres',
                date_heure: dateHeure,
                duree_minutes: dureeMinutes,
                titre: evt.summary || null,
                google_event_id: evt.id,
              })
              if (!insertError) results.pulled++
            }
          } catch {}
        }
      }

      // Filet de sécurité : suppressions non détectées par le PUSH
      const { data: rdvsWithId } = await supabaseAdmin
        .from('rendez_vous').select('id, date_heure, google_event_id').not('google_event_id', 'is', null)
      for (const rdv of (rdvsWithId || [])) {
        const d = new Date(rdv.date_heure)
        if (d >= januaryFirst && d <= twelveMonthsAhead && !activeGoogleIds.has(rdv.google_event_id)) {
          await supabaseAdmin.from('rendez_vous').delete().eq('id', rdv.id)
          results.deleted++
        }
      }

      const { data: intsWithId } = await supabaseAdmin
        .from('interventions_artisans').select('id, date_debut, google_event_id, google_end_event_id').not('google_event_id', 'is', null)
      for (const int of (intsWithId || [])) {
        const d = new Date(int.date_debut)
        if (d >= januaryFirst && d <= twelveMonthsAhead && !activeGoogleIds.has(int.google_event_id)) {
          await supabaseAdmin.from('interventions_artisans').delete().eq('id', int.id)
          results.deleted++
          continue
        }
        if (int.google_end_event_id && !activeGoogleIds.has(int.google_end_event_id)) {
          await supabaseAdmin.from('interventions_artisans')
            .update({ google_end_event_id: null }).eq('id', int.id)
        }
      }

    } catch (err) {
      results.errors.push(`Pull: ${err.message}`)
    }

    await supabaseAdmin.from('google_tokens')
      .update({ updated_at: new Date().toISOString() }).eq('user_id', userId)

    const parts = []
    if (results.pushed > 0) parts.push(`${results.pushed} créé(s)`)
    if (results.updated > 0) parts.push(`${results.updated} mis à jour`)
    if (results.pulled > 0) parts.push(`${results.pulled} importé(s) de Google`)
    if (results.deleted > 0) parts.push(`${results.deleted} supprimé(s) depuis Google`)

    // Dédupliquer les erreurs pour un message lisible
    const uniqueErrors = [...new Set(results.errors.map(e => e.replace(/^[^:]+:\s*/, '')))]
    const errMsg = uniqueErrors.length === 1
      ? uniqueErrors[0]
      : `${results.errors.length} erreurs — ${uniqueErrors.slice(0, 2).join(' / ')}${uniqueErrors.length > 2 ? '…' : ''}`
    if (results.errors.length > 0) parts.push(errMsg)


    return NextResponse.json({
      success: results.errors.length === 0 || parts.some(p => !p.includes('erreur')),
      pushed: results.pushed,
      updated: results.updated,
      pulled: results.pulled,
      deleted: results.deleted,
      errors: results.errors,
      message: parts.length ? parts.join(', ') : 'Planning déjà à jour',
      hasErrors: results.errors.length > 0,
    })

  } catch (err) {
    console.error('Sync error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    if (!userId) return NextResponse.json({ connected: false })

    const { data } = await supabaseAdmin
      .from('google_tokens').select('updated_at').eq('user_id', userId).single()

    return NextResponse.json({ connected: !!data, lastSync: data?.updated_at || null })
  } catch {
    return NextResponse.json({ connected: false })
  }
}
