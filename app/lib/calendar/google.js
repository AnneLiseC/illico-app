// app/lib/calendar/google.js
// Lib unique de la synchro Google Calendar (étage 2). Centralise la construction des
// events (rdv / intervention), la résolution de la cible (calendar_id + tokens du
// compte détenteur) et l'écriture Google avec mode dry-run.
//
// ⚠️ LOT 5a — EXTRACTION À L'IDENTIQUE de push/route.js : aucun nettoyage cosmétique.
//   Les quirks d'espaces sont PRÉSERVÉS tels quels (typeLabels 'R1 - ', double-espace
//   « R1 -  | », espace initial du summary intervention, ligne morte 'Autre - ') —
//   ils seront nettoyés au lot 5b. Le comportement doit être strictement identique
//   (dry-run diff avant/après = vide).

import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Mode simulation : calcule + logge l'événement sans rien écrire (Google ni base).
export const DRY_RUN = process.env.GOOGLE_SYNC_DRY_RUN === '1'

export function nextDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

// Client OAuth ciblant une LIGNE google_tokens par son id (= compte détenteur de
// la cible). ⚠️ Le refresh on('tokens') réécrit .eq('id', compteOauthId), JAMAIS
// .eq('user_id', ...) : on rafraîchit les tokens du compte de la cible, pas ceux
// du user déclencheur. Inverser corromprait le mauvais compte.
export function buildOAuthClientForCompte(compteOauthId, tokens) {
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
export async function getCalendarForCible(cibleId) {
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

// Seul point d'écriture Google (insert/update). En DRY-RUN : logge et ne touche rien.
// action ∈ 'insert' | 'update'. Renvoie { id, dryRun }.
export async function gcalWrite({ calendar, action, calendarId, requestBody, eventId, compteOauthId, contexte }) {
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

// Suppression d'un événement Google (gated DRY-RUN). NOUVEAU au 5a — pas encore
// utilisé (event/route.js basculera dessus au 5c).
export async function deleteEvent({ calendar, calendarId, eventId, contexte }) {
  if (DRY_RUN) {
    console.log('[push][DRY-RUN]', JSON.stringify({
      action: 'delete', type: contexte?.type, itemId: contexte?.itemId, calendarId, eventId,
    }))
    return { dryRun: true }
  }
  await calendar.events.delete({ calendarId, eventId })
  return { dryRun: false }
}

export async function upsertEvent({ calendar, calendarId, compteOauthId, googleEventId, eventBody, contexte }) {
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

export function buildIntervTimes(date, heure_debut, duree_minutes) {
  if (heure_debut) {
    const start = new Date(`${date}T${heure_debut}`)
    const end = new Date(start.getTime() + (duree_minutes || 60) * 60000)
    const fmt = d => d.toISOString().slice(0, 19)
    return { start: { dateTime: fmt(start), timeZone: 'Europe/Paris' }, end: { dateTime: fmt(end), timeZone: 'Europe/Paris' } }
  }
  return { start: { date }, end: { date: nextDay(date) } }
}

export function rdvToGoogleEvent(rdv) {
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

// Extrait À L'IDENTIQUE du bloc inliné de push/route.js (POST, type 'intervention').
// Renvoie le tableau ordonné [eventPrincipal, ...extraEvents] (multi-jours), ou []
// pour les cas à ignorer (l'appelant répond alors skipped, comme avant). L'event[0]
// porte le google_event_id (upsert + writeback) ; les extras sont insert-only.
export function interventionToGoogleEvents(intervention) {
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
    if (!intervention.date_fin && !heure_debut) return []
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
    if (!jours.length) return []
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
  return [firstEvent, ...extraEvents]
}
