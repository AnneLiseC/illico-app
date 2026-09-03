// app/lib/__tests__/ca-reel.test.js
// Tests de « ce qu'on facture au client » (computeFactureClient) : frais + honoraires
// HT, BRUT facturé, sur les dossiers signés de l'année. Vérifie le périmètre (pas de
// commissions/devis), la base facturé (par date de signature), et l'interaction avec
// le statut des frais (offerts = 0 ; rembourse = pas de double-comptage).

import { describe, it, expect } from 'vitest'
import { computeFactureClient, fraisEncaisses } from '../ca-reel.js'

// Le critere « frais encaisses » doit etre IDENTIQUE a celui de la page Finances, sinon un
// meme dossier affiche deux montants selon la page. Corrige le 02/09 : 'rembourse' etait
// ignore par le CA reel alors qu'il l'est bien — 1 050 EUR manquants en production.
describe('fraisEncaisses — le critere partage avec la page Finances', () => {
  const suiviRegle = [{ type_echeance: 'frais_consultation', statut_client: 'regle' }]

  it("statut 'regle' -> encaisses, meme sans ligne de suivi", () => {
    expect(fraisEncaisses({ frais_statut: 'regle' }, [])).toBe(true)
  })

  it("statut 'rembourse' + suivi recu -> encaisses (LE cas qui manquait)", () => {
    expect(fraisEncaisses({ frais_statut: 'rembourse' }, suiviRegle)).toBe(true)
  })

  it("statut 'rembourse' SANS suivi recu -> pas encaisses", () => {
    expect(fraisEncaisses({ frais_statut: 'rembourse' }, [])).toBe(false)
  })

  it("'offerts' sans suivi -> pas encaisses", () => {
    expect(fraisEncaisses({ frais_statut: 'offerts' }, [])).toBe(false)
  })

  it('une ligne de suivi d un AUTRE type ne compte pas', () => {
    expect(fraisEncaisses({ frais_statut: 'offerts' },
      [{ type_echeance: 'honoraires_courtage', statut_client: 'regle' }])).toBe(false)
  })

  it('dossier ou suivi absents -> pas encaisses, jamais d exception', () => {
    expect(fraisEncaisses(null, null)).toBe(false)
    expect(fraisEncaisses(undefined, undefined)).toBe(false)
  })
})

// Dossier courtage : 1 devis signé 10 000 HT / 11 000 TTC, taux courtage 6 %,
// frais de consultation 600 TTC (= 500 HT), contrat signé le 15/03/2025.
const dos = (o = {}) => ({
  typologie: 'courtage',
  taux_courtage: 0.06,
  part_agente: 0.5,
  frais_consultation: 600,
  frais_statut: 'regle',
  date_signature_contrat: '2025-03-15',
  devis_artisans: [{ id: 'dv1', montant_ht: 10000, montant_ttc: 11000, statut: 'accepte', date_signature: '2025-03-10', artisan: {} }],
  suivi_financier: [],
  ...o,
})

describe('computeFactureClient', () => {
  it('courtage standard : frais 500 HT + honoraires 600 HT = 1100', () => {
    const r = computeFactureClient([dos()], 2025)
    expect(r.frais).toBe(500)
    expect(r.honoraires).toBe(600)
    expect(r.total).toBe(1100)
    expect(r.parMois[3]).toBe(1100)   // mars
  })

  it('base FACTURÉ par année de signature : autre année = 0', () => {
    expect(computeFactureClient([dos()], 2024).total).toBe(0)
  })

  it("frais offerts = non facturés (0), honoraires intacts", () => {
    const r = computeFactureClient([dos({ frais_statut: 'offerts' })], 2025)
    expect(r.frais).toBe(0)
    expect(r.honoraires).toBe(600)
    expect(r.total).toBe(600)
  })

  it('frais à rembourser : pas de double-comptage (total = honoraires brut)', () => {
    // rembourse : honoraires.ht = htBrut − fraisHT = 600 − 500 = 100 ; frais = 500.
    const r = computeFactureClient([dos({ frais_statut: 'rembourse' })], 2025)
    expect(r.frais).toBe(500)
    expect(r.honoraires).toBe(100)
    expect(r.total).toBe(600)
  })

  it('dossier non signé (pas de date_signature_contrat) = ignoré', () => {
    expect(computeFactureClient([dos({ date_signature_contrat: null })], 2025).total).toBe(0)
  })

  it('agrège plusieurs dossiers', () => {
    const r = computeFactureClient([dos(), dos()], 2025)
    expect(r.total).toBe(2200)
  })
})
