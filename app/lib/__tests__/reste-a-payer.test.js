import { describe, it, expect } from 'vitest'
import { resteAFacturerDevis, resteAPayerDevis, montantRegleFacture, reliquatFacture } from '../finance.js'

// Facturé (pièces de l'artisan) ≠ réglé (argent du client). Le cas réel du 30/10 :
// JADRAS, devis MJ RENOVATION 59 177,02 € — facture d'acompte 17 753,11, le client
// n'a viré que 17 735,11 (18 € oubliés). Situation 17 753,11 payée intégralement.
const JADRAS = {
  devisTTC: 59177.02,
  acompteTTC: 17753.11,
  acompteEncaisse: true,
  factures: [
    { libelle: 'Facture acompte', montant_ttc: 17753.11, montant_regle: 17735.11, statut: 'paye' },
    { libelle: 'Facture de situation', montant_ttc: 17753.11, montant_regle: null, statut: 'paye' },
  ],
}

describe('reste à payer — JADRAS 2026-AM-001', () => {
  it('reste à facturer 23 670,80 (inchangé) / reste à payer 23 688,80', () => {
    const rf = resteAFacturerDevis({
      devisTTC: JADRAS.devisTTC,
      totalFactureTTC: 17753.11 * 2,
      totalFactAcompteTTC: 17753.11,
      acompteTTC: JADRAS.acompteTTC,
      acompteEncaisse: true,
    })
    expect(rf.reste).toBe(23670.80)
    expect(resteAPayerDevis(JADRAS).reste).toBe(23688.80)
  })

  it('le reliquat de 18 € est porté par la facture d\'acompte', () => {
    expect(reliquatFacture(JADRAS.factures[0])).toBe(18)
    expect(reliquatFacture(JADRAS.factures[1])).toBe(0)
  })
})

describe('reste à payer — règle du 11/09 conservée', () => {
  it('acompte coché « Réglé » sans facture d\'acompte : compté réglé au théorique', () => {
    const r = resteAPayerDevis({
      devisTTC: 8613, acompteTTC: 2583.90, acompteEncaisse: true,
      factures: [{ libelle: 'Facture solde', montant_ttc: 6029.10, statut: 'paye' }],
    })
    expect(r.reste).toBe(0)
  })

  it('case non cochée et aucune facture : tout reste dû', () => {
    expect(resteAPayerDevis({ devisTTC: 8613, acompteTTC: 2583.90, acompteEncaisse: false }).reste).toBe(8613)
  })
})

describe('montant réglé d\'une facture', () => {
  it('payée sans montant_regle = réglée en totalité (existant inchangé)', () => {
    expect(montantRegleFacture({ montant_ttc: 1000, statut: 'paye', montant_regle: null })).toBe(1000)
  })

  it('en attente sans montant_regle = rien de réglé', () => {
    expect(montantRegleFacture({ montant_ttc: 1000, statut: 'en_attente' })).toBe(0)
    expect(reliquatFacture({ montant_ttc: 1000, statut: 'en_attente' })).toBe(0)
  })

  it('en attente AVEC montant_regle (paiement partiel) : le réglé compte', () => {
    const f = { libelle: 'Facture de situation', montant_ttc: 1000, statut: 'en_attente', montant_regle: 400 }
    expect(montantRegleFacture(f)).toBe(400)
    expect(resteAPayerDevis({ devisTTC: 1000, factures: [f] }).reste).toBe(600)
  })

  it('trop-versé : reliquat négatif, reste à payer à 0 et trop-versé signalé', () => {
    const f = { libelle: 'Facture solde', montant_ttc: 1000, statut: 'paye', montant_regle: 1010 }
    expect(reliquatFacture(f)).toBe(-10)
    const r = resteAPayerDevis({ devisTTC: 1000, factures: [f] })
    expect(r.reste).toBe(0)
    expect(r.tropVerse).toBe(10)
  })
})
