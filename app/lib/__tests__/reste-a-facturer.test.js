import { describe, it, expect } from 'vitest'
import { resteAFacturerDevis } from '../finance.js'

// Le « reste à facturer » décide de ce qu'on redemande au client. Se tromper ici, c'est
// facturer deux fois un acompte déjà encaissé — ou oublier de facturer un solde.
//
// Le défaut corrigé le 11/09 : l'écran portait DEUX définitions du mot « facturé ». Le
// compteur ne comptait que les factures enregistrées ; la facture de solde, elle, était
// saisie à la main à « devis − acompte ». Après chaque solde, il restait donc exactement
// le montant de l'acompte — sur un acompte pourtant coché « Réglé ».

describe('reste à facturer — les deux devis réels du 11/09', () => {
  it('LS TRAVAUX : 8 613 € de devis, solde de 6 029,10 € facturé, acompte encaissé', () => {
    // L'écran affichait « Reste à facturer : 2 583,90 € », soit très exactement l'acompte
    // déjà encaissé. Plus rien n'est dû.
    const r = resteAFacturerDevis({
      devisTTC: 8613, totalFactureTTC: 6029.10, totalFactAcompteTTC: 0,
      acompteTTC: 2583.90, acompteEncaisse: true,
    })
    expect(r.reste).toBe(0)
    expect(r.acompteNonFacture).toBeCloseTo(2583.90, 2)
  })

  it('ALPILLES : 2 222,88 € de devis, solde de 1 332,34 € facturé, acompte encaissé', () => {
    const r = resteAFacturerDevis({
      devisTTC: 2222.88, totalFactureTTC: 1332.34, totalFactAcompteTTC: 0,
      acompteTTC: 890.54, acompteEncaisse: true,
    })
    expect(r.reste).toBe(0)
    expect(r.acompteNonFacture).toBeCloseTo(890.54, 2)
  })
})

describe('reste à facturer — ce qu\'il ne faut surtout pas déduire deux fois', () => {
  it('acompte encaissé ET facturé : on ne déduit rien de plus', () => {
    // Le cas du 3e devis LS TRAVAUX, qui a bien sa « Facture acompte » de 2 596 €. Déduire
    // l'acompte une seconde fois offrirait 2 596 € au client, en silence.
    const r = resteAFacturerDevis({
      devisTTC: 6490, totalFactureTTC: 2596, totalFactAcompteTTC: 2596,
      acompteTTC: 2596, acompteEncaisse: true,
    })
    expect(r.reste).toBe(3894)
    expect(r.acompteNonFacture).toBe(0)
  })

  it('facture d\'acompte PARTIELLE : seule la part non couverte est déduite', () => {
    const r = resteAFacturerDevis({
      devisTTC: 10000, totalFactureTTC: 1000, totalFactAcompteTTC: 1000,
      acompteTTC: 3000, acompteEncaisse: true,
    })
    // 10 000 − 1 000 facturé − 2 000 d'acompte encaissé sans facture.
    expect(r.reste).toBe(7000)
    expect(r.acompteNonFacture).toBe(2000)
  })

  it('acompte PAS encore encaissé : il reste entièrement à facturer', () => {
    // Tant que la case « Réglé » n'est pas cochée, rien n'a été encaissé : on ne déduit rien.
    const r = resteAFacturerDevis({
      devisTTC: 8613, totalFactureTTC: 0, totalFactAcompteTTC: 0,
      acompteTTC: 2583.90, acompteEncaisse: false,
    })
    expect(r.reste).toBe(8613)
    expect(r.acompteNonFacture).toBe(0)
  })
})

describe('reste à facturer — bornes et données douteuses', () => {
  it('ne descend jamais sous zéro, même sur-facturé', () => {
    const r = resteAFacturerDevis({
      devisTTC: 1000, totalFactureTTC: 1500, totalFactAcompteTTC: 0,
      acompteTTC: 300, acompteEncaisse: true,
    })
    expect(r.reste).toBe(0)
  })

  it('des montants absents ou illisibles ne produisent pas NaN à l\'écran', () => {
    expect(resteAFacturerDevis({}).reste).toBe(0)
    expect(resteAFacturerDevis({ devisTTC: null, totalFactureTTC: undefined }).reste).toBe(0)
    expect(resteAFacturerDevis({ devisTTC: '8613', totalFactureTTC: 'abc' }).reste).toBe(8613)
  })

  it('arrondit au centime — pas de « reste à facturer : 0,004 € »', () => {
    const r = resteAFacturerDevis({
      devisTTC: 1000, totalFactureTTC: 333.333, totalFactAcompteTTC: 0,
      acompteTTC: 333.333, acompteEncaisse: true,
    })
    expect(r.reste).toBe(333.34)
  })
})
