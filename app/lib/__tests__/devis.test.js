// app/lib/__tests__/devis.test.js
// Tests de la logique pure du devis : construction du payload (point d'entrée de
// l'argent), normalisation de l'extraction IA (jamais de confiance aveugle), et
// rapprochement d'artisan par nom.

import { describe, it, expect } from 'vitest'
import { buildDevisPayload, normaliserExtractionDevis, matchArtisanParNom } from '../devis'

describe('buildDevisPayload', () => {
  it('convertit la commission en décimale et lit les montants', () => {
    const p = buildDevisPayload({ montant_ht: '1000', montant_ttc: '1100', ttc_manuel: true, commission_pourcentage: '6', acompte_pourcentage: 30 })
    expect(p.montant_ht).toBe(1000)
    expect(p.montant_ttc).toBe(1100)
    expect(p.ttc_manuel).toBe(true)
    expect(p.commission_pourcentage).toBeCloseTo(0.06)
    expect(p.acompte_pourcentage).toBe(30)
    expect(p.acompte_montant_fixe).toBeNull()
  })

  it('sans_commission force 0 (et non null) ET exonère les honoraires', () => {
    const p = buildDevisPayload({ montant_ht: '500', montant_ttc: '550', sans_commission: true, commission_pourcentage: '15', acompte_pourcentage: 30 })
    expect(p.commission_pourcentage).toBe(0)
    expect(p.hors_honoraires).toBe(true)
  })

  it('case décochée → hors_honoraires false explicite (jamais undefined)', () => {
    const p = buildDevisPayload({ montant_ht: '500', montant_ttc: '550', commission_pourcentage: '15', acompte_pourcentage: 30 })
    expect(p.hors_honoraires).toBe(false)
  })

  it('commission vide → null (défaut standard côté finance)', () => {
    const p = buildDevisPayload({ montant_ht: '500', montant_ttc: '550', commission_pourcentage: '', acompte_pourcentage: 30 })
    expect(p.commission_pourcentage).toBeNull()
  })

  it('acompte montant fixe (-1) lit le montant, sinon null', () => {
    const fixe = buildDevisPayload({ montant_ht: '1000', acompte_pourcentage: -1, acompte_montant_fixe: '250' })
    expect(fixe.acompte_pourcentage).toBe(-1)
    expect(fixe.acompte_montant_fixe).toBe(250)
    const fixeVide = buildDevisPayload({ montant_ht: '1000', acompte_pourcentage: -1, acompte_montant_fixe: '' })
    expect(fixeVide.acompte_montant_fixe).toBeNull()
  })

  it('champs vides → null (pas de 0 fantôme)', () => {
    const p = buildDevisPayload({ montant_ht: '', montant_ttc: '', acompte_pourcentage: 0 })
    expect(p.montant_ht).toBeNull()
    expect(p.montant_ttc).toBeNull()
    expect(p.acompte_pourcentage).toBe(0)
  })
})

describe('normaliserExtractionDevis', () => {
  it('parse les nombres à la française (espaces, virgule, €)', () => {
    const e = normaliserExtractionDevis({ montant_ht: '1 234,56 €', montant_tva: '123,46', montant_ttc: '1 358,02 €' })
    expect(e.montant_ht).toBeCloseTo(1234.56)
    expect(e.montant_tva).toBeCloseTo(123.46)
    expect(e.montant_ttc).toBeCloseTo(1358.02)
  })

  it('pas de TVA → HT = TTC (comble le manquant)', () => {
    expect(normaliserExtractionDevis({ montant_ht: '1000', taux_tva: 0 }).montant_ttc).toBe(1000)
    expect(normaliserExtractionDevis({ montant_ttc: '800' }).montant_ht).toBe(800)
  })

  it('avec TVA on garde HT et TTC distincts', () => {
    const e = normaliserExtractionDevis({ montant_ht: '1000', montant_tva: '100', montant_ttc: '1100' })
    expect(e.montant_ht).toBe(1000)
    expect(e.montant_ttc).toBe(1100)
  })

  it('dates : ISO et JJ/MM/AAAA acceptées, le reste → null', () => {
    expect(normaliserExtractionDevis({ date_reception: '15/03/2026' }).date_reception).toBe('2026-03-15')
    expect(normaliserExtractionDevis({ date_reception: '2026-03-15' }).date_reception).toBe('2026-03-15')
    expect(normaliserExtractionDevis({ date_reception: 'le 15 mars' }).date_reception).toBeNull()
  })

  it('valeurs non numériques → null (jamais NaN)', () => {
    const e = normaliserExtractionDevis({ montant_ht: 'sur devis', montant_ttc: 'N/A' })
    expect(e.montant_ht).toBeNull()
    expect(e.montant_ttc).toBeNull()
  })

  it('signale ttc < ht', () => {
    expect(normaliserExtractionDevis({ montant_ht: '1000', montant_ttc: '900', montant_tva: '50' }).warnings).toContain('ttc_inferieur_ht')
  })
})

describe('matchArtisanParNom', () => {
  const artisans = [
    { id: 'a1', entreprise: 'SARL Dupont Plomberie' },
    { id: 'a2', entreprise: 'Élec Générale' },
    { id: 'a3', entreprise: 'Peinture 13' },
  ]
  it('match exact malgré forme juridique et accents', () => {
    expect(matchArtisanParNom('DUPONT PLOMBERIE', artisans)).toEqual({ id: 'a1', exact: true })
    expect(matchArtisanParNom('elec generale', artisans)).toEqual({ id: 'a2', exact: true })
  })
  it('inclusion partielle', () => {
    expect(matchArtisanParNom('Établissements Dupont Plomberie Sud', artisans).id).toBe('a1')
  })
  it('aucun match → id vide', () => {
    expect(matchArtisanParNom('Menuiserie Martin', artisans)).toEqual({ id: '', exact: false })
    expect(matchArtisanParNom('', artisans)).toEqual({ id: '', exact: false })
  })
})
