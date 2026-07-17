// app/lib/__tests__/calendar-interventions.test.js
// Non-régression du mapping des INTERVENTIONS calendrier + anti-écho du pull.
//
// Règles figées ici :
//   - Une intervention est TOUJOURS en journée entière (jamais un créneau horaire).
//   - Période multi-jours  -> 2 marqueurs : (début) 1er jour + (fin) dernier jour.
//   - Période 1 jour        -> 1 marqueur sans préfixe.
//   - Jours spécifiques     -> 1 marqueur par jour coché (inchangé).
//   - Séparateur du titre = " x " (Entreprise x Client).
//   - Le pull ne ré-importe JAMAIS un event portant [illico-int:…] (anti-écho).

import { describe, it, expect } from 'vitest'
import { interventionSummary, interventionOccurrences } from '../calendar/mapping.js'
import { interventionToGoogleEvents } from '../calendar/google.js'
import { interventionToICS } from '../calendar/icloud.js'
import { classifyNormalized, makeReport, makeActions } from '../calendar/pull-engine.js'

const inter = (o = {}) => ({
  id: 'INT1',
  type_intervention: 'periode',
  date_debut: '2026-07-20',
  date_fin: '2026-07-24',
  jours_specifiques: null,
  artisan: { entreprise: 'Plomberie Martin' },
  dossier: { reference: '2026-CT-001', client: { prenom: 'Jean', nom: 'Dupont' } },
  ...o,
})

describe('interventionSummary', () => {
  it('sépare Entreprise et Client par " x "', () => {
    expect(interventionSummary(inter())).toBe('Plomberie Martin x Jean Dupont')
  })
  it('sans client -> juste l’entreprise', () => {
    expect(interventionSummary(inter({ dossier: null }))).toBe('Plomberie Martin')
  })
})

describe('interventionOccurrences — période', () => {
  it('multi-jours -> 2 occurrences journée entière (début/fin), avec préfixes et rôles', () => {
    const occ = interventionOccurrences(inter())
    expect(occ).toHaveLength(2)
    expect(occ[0]).toMatchObject({ role: 'start', label: '(début) ', time: { kind: 'allday', date: '2026-07-20' } })
    expect(occ[1]).toMatchObject({ role: 'end', label: '(fin) ', time: { kind: 'allday', date: '2026-07-24' } })
    expect(occ[0].marker).toBe('[illico-int:INT1:debut]')
    expect(occ[1].marker).toBe('[illico-int:INT1:fin]')
    expect(occ[0].idSuffix).toBe('-debut')
    expect(occ[1].idSuffix).toBe('-fin')
  })
  it('un seul jour (date_fin = date_debut) -> 1 marqueur sans préfixe', () => {
    const occ = interventionOccurrences(inter({ date_fin: '2026-07-20' }))
    expect(occ).toHaveLength(1)
    expect(occ[0]).toMatchObject({ role: 'start', label: '', time: { kind: 'allday', date: '2026-07-20' } })
    expect(occ[0].marker).toBe('[illico-int:INT1]')
  })
  it('date_fin absente -> 1 marqueur', () => {
    expect(interventionOccurrences(inter({ date_fin: null }))).toHaveLength(1)
  })
  it('date_debut absente -> aucune occurrence', () => {
    expect(interventionOccurrences(inter({ date_debut: null }))).toEqual([])
  })
  it('heure_debut est IGNORÉ : toujours journée entière (jamais timed)', () => {
    const occ = interventionOccurrences(inter({ heure_debut: '09:00', duree_minutes: 120 }))
    expect(occ.every(o => o.time.kind === 'allday')).toBe(true)
  })
})

describe('interventionOccurrences — jours spécifiques', () => {
  it('1 marqueur par jour coché, trié, journée entière, rôle "day"', () => {
    const occ = interventionOccurrences(inter({
      type_intervention: 'jours_specifiques', date_debut: null, date_fin: null,
      jours_specifiques: ['2026-08-05', '2026-08-01'],
    }))
    expect(occ).toHaveLength(2)
    expect(occ.map(o => o.time.date)).toEqual(['2026-08-01', '2026-08-05']) // trié
    expect(occ.every(o => o.role === 'day' && o.time.kind === 'allday')).toBe(true)
    expect(occ[0].marker).toBe('[illico-int:INT1:0]')
  })
  it('liste vide -> aucune occurrence', () => {
    expect(interventionOccurrences(inter({ type_intervention: 'jours_specifiques', jours_specifiques: [] }))).toEqual([])
  })
})

describe('builders Google / iCloud', () => {
  it('Google : [{role, body}] avec préfixe dans le titre, en date-only (vraie journée entière)', () => {
    const evts = interventionToGoogleEvents(inter())
    expect(evts).toHaveLength(2)
    expect(evts[0].role).toBe('start')
    expect(evts[0].body.summary).toBe('(début) Plomberie Martin x Jean Dupont')
    expect(evts[1].body.summary).toBe('(fin) Plomberie Martin x Jean Dupont')
    // date-only => start.date présent, pas de start.dateTime (jamais 00h01-23h59)
    expect(evts[0].body.start.date).toBe('2026-07-20')
    expect(evts[0].body.start.dateTime).toBeUndefined()
  })
  it('iCloud : [{role, body(ICS)}] en VALUE=DATE (journée entière) avec le préfixe', () => {
    const ics = interventionToICS(inter())
    expect(ics).toHaveLength(2)
    expect(ics[0].role).toBe('start')
    expect(ics[0].body).toContain('VALUE=DATE')      // all-day, pas de créneau horaire
    expect(ics[0].body).toContain('(début) Plomberie Martin x Jean Dupont')
    expect(ics[1].body).toContain('(fin) Plomberie Martin x Jean Dupont')
    expect(ics[0].body).toContain('illico-int-INT1-debut') // UID déterministe (idempotent)
  })
})

describe('anti-écho pull (classifyNormalized)', () => {
  const cibleRow = { id: 'CIB1', agenda_nom: 'A', calendar_id: 'C', agence_id: 'AG', societe_id: 'SO' }
  const cand = { clients: [], dossiers: [], artisans: [] }
  const ctx = () => ({ report: makeReport(cibleRow), actions: makeActions(), byGid: new Map(), cand, floorMs: 0, cibleRow })

  it('un event portant [illico-int:…] dans la description est IGNORÉ (aucun insert)', () => {
    const c = ctx()
    classifyNormalized({
      id: 'evt-x', etag: 'e1', status: 'confirmed', summary: 'Plomberie Martin x Jean Dupont',
      description: 'Chantier : 2026-CT-001\n[illico-int:INT1:debut]',
      start_utc: '2026-07-20T08:00:00Z', end_utc: '2026-07-20T09:00:00Z', kind: 'timed',
    }, c)
    expect(c.actions.inserts).toHaveLength(0)
    expect(c.report.interventions_ignorees).toBe(1)
  })

  it('un event normal SANS marqueur est bien traité (inséré) — pas de sur-blocage', () => {
    const c = ctx()
    classifyNormalized({
      id: 'evt-y', etag: 'e2', status: 'confirmed', summary: 'Déjeuner client',
      description: 'rien de spécial',
      start_utc: '2026-07-20T08:00:00Z', end_utc: '2026-07-20T09:00:00Z', kind: 'timed',
    }, c)
    expect(c.actions.inserts).toHaveLength(1)
    expect(c.report.interventions_ignorees || 0).toBe(0)
  })
})
