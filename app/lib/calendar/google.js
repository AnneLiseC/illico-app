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
import {
  rdvSummary, rdvDescription, rdvBounds,
  interventionSummary, interventionDescription, interventionOccurrences,
} from './mapping'

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

// Client OAuth ciblant une LIGNE comptes_oauth par son id (= compte détenteur de
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
      await supabaseAdmin.from('comptes_oauth').update({
        access_token: newTokens.access_token,
        expiry_date: newTokens.expiry_date,
        updated_at: new Date().toISOString(),
      }).eq('id', compteOauthId)
    }
  })
  return client
}

// Résolution MÉTIER d'une cible → { cible, compte } (compte = ligne comptes_oauth
// complète, TOUS fournisseurs confondus). Partagée par le dispatch, qui lit
// compte.fournisseur pour router (cf. app/lib/calendar/dispatch.js). null = cible
// introuvable ou sans compte rattaché → rien à pousser (l'appelant skip, comme avant).
export async function resolveCible(cibleId) {
  const { data: cible } = await supabaseAdmin
    .from('cibles_calendrier')
    .select('id, calendar_id, compte_oauth_id')
    .eq('id', cibleId)
    .single()
  if (!cible || !cible.compte_oauth_id) return null
  const { data: compte } = await supabaseAdmin
    .from('comptes_oauth')
    .select('*')
    .eq('id', cible.compte_oauth_id)
    .single()
  if (!compte) return null
  return { cible, compte }
}

// Construit l'accès Google (client OAuth + calendar) à partir d'une cible Google
// résolue. null si le compte n'a pas de refresh_token (cible inerte). EXTRAIT À
// L'IDENTIQUE de l'ancien getCalendarForCible : mêmes tokens, même client googleapis.
export function buildGoogleCalendar({ cible, compte }) {
  if (!compte.refresh_token) return null
  const oauthClient = buildOAuthClientForCompte(compte.id, {
    access_token: compte.access_token,
    refresh_token: compte.refresh_token,
    expiry_date: compte.expiry_date,
  })
  return {
    calendar: google.calendar({ version: 'v3', auth: oauthClient }),
    calendarId: cible.calendar_id,
    compteOauthId: cible.compte_oauth_id,
  }
}

// Handle d'écriture Google à interface commune (upsert/delete), consommé par le
// dispatch. upsert = upsertEvent (update si externalId présent, sinon insert, avec
// fallback 404/410) ; delete = deleteEvent. AUCUN changement de comportement Google :
// ce sont exactement les appels que push/event faisaient en direct avant le 6b-1.
export function makeGoogleClientHandle({ calendar, calendarId, compteOauthId }) {
  return {
    fournisseur: 'google',
    calendarId,
    compteOauthId,
    upsert: ({ eventBody, externalId, contexte }) =>
      upsertEvent({ calendar, calendarId, compteOauthId, googleEventId: externalId, eventBody, contexte }),
    delete: ({ externalId, contexte }) =>
      deleteEvent({ calendar, calendarId, eventId: externalId, contexte }),
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
  // Habillage JSON Google du mapping partagé (mapping.js). date_heure = instant UTC →
  // dateTime = ISO COMPLET (offset/Z) ; timeZone:'Europe/Paris' ne sert qu'à l'affichage.
  const { start, end } = rdvBounds(rdv)
  return {
    summary: rdvSummary(rdv),
    description: rdvDescription(rdv),
    start: { dateTime: start.toISOString(), timeZone: 'Europe/Paris' },
    end: { dateTime: end.toISOString(), timeZone: 'Europe/Paris' },
  }
}

// Bornes Google d'une occurrence (spec neutre de mapping.js → champs start/end Google).
// 'timed' et 'allday' (jour unique) passent par buildIntervTimes (timed vs date-only selon
// heure_debut) ; 'allday-range' = période multi-jours (end exclusif = date_fin + 1).
function googleTimeFields(time) {
  if (time.kind === 'allday-range') {
    const endDate = new Date(time.dateFin)
    endDate.setDate(endDate.getDate() + 1)
    return { start: { date: time.dateDebut }, end: { date: endDate.toISOString().slice(0, 10) } }
  }
  return buildIntervTimes(time.date, time.heure_debut, time.duree_minutes)
}

// Renvoie le tableau ordonné [eventPrincipal, ...extraEvents] (multi-jours), ou [] pour les
// cas à ignorer (l'appelant répond alors skipped). L'event[0] porte le google_event_id
// (upsert + writeback) ; les extras sont insert-only.
export function interventionToGoogleEvents(intervention) {
  const summary = interventionSummary(intervention)
  return interventionOccurrences(intervention).map((o) => ({
    summary,
    description: interventionDescription(intervention, o.marker),
    ...googleTimeFields(o.time),
  }))
}
