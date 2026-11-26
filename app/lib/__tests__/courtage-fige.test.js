// Courtage FIGÉ à l'encaissement (décision 28/08/2026, appliquée le 26/11/2026)
// + reconnaissance du courtage réel ligne par ligne (montant figé + suppléments TS).
import { describe, it, expect } from 'vitest'
import { getCourtageGele, calculateHonorairesFinance, calculateHonorairesPrevi, calculateCourtageReel } from '../finance.js'

const dv = (o = {}) => ({ id: 'dv1', montant_ht: 10000, montant_ttc: 11000, statut: 'accepte', date_signature: '2026-01-10', ...o })
const courtage = (o = {}) => ({ type_echeance: 'honoraires_courtage', statut_client: 'regle', date_paiement: '2026-02-01', montant_ttc: 660, ...o })
const dossier = (o = {}) => ({ typologie: 'courtage', part_agente: 0.5, taux_courtage: 0.06, honoraires_amo_taux: 9, devis_artisans: [dv()], suivi_financier: [], ...o })

describe('getCourtageGele', () => {
  it('null sans ligne réglée', () => {
    expect(getCourtageGele(dossier())).toBeNull()
    expect(getCourtageGele(dossier({ suivi_financier: [courtage({ statut_client: 'en_attente' })] }))).toBeNull()
  })
  it('lit le montant de la ligne réglée', () => {
    expect(getCourtageGele(dossier({ suivi_financier: [courtage({ montant_ttc: '650.50' })] }))).toBe(650.5)
  })
})

describe('courtage figé — calcul', () => {
  it('sans gel : calcul inchangé (6 % de 11 000)', () => {
    expect(calculateHonorairesFinance(dossier()).courtage.ttc).toBe(660)
  })
  it('un devis modifié APRÈS paiement ne change plus le courtage', () => {
    const d = dossier({ devis_artisans: [dv({ montant_ttc: 13000 })], suivi_financier: [courtage()] })
    expect(calculateHonorairesFinance(d).courtage.ttc).toBe(660)
    expect(calculateHonorairesPrevi(d).courtage.ttc).toBe(660)
  })
  it('courtage seul : un TS signé après paiement s’AJOUTE au montant figé', () => {
    const d = dossier({
      devis_artisans: [dv(), dv({ id: 'dv2', montant_ttc: 5000, date_signature: '2026-03-01' })],
      suivi_financier: [courtage()],
    })
    expect(calculateHonorairesFinance(d).courtage.ttc).toBe(960)   // 660 + 5 000 × 6 %
  })
  it('AMO : le solde = total AMO de la base − courtage figé (aucun euro perdu)', () => {
    const d = dossier({ typologie: 'amo', devis_artisans: [dv({ montant_ttc: 13000 })], suivi_financier: [courtage()] })
    const h = calculateHonorairesFinance(d)
    expect(h.courtage.ttc).toBe(660)
    expect(h.soldeAmo.ttc).toBe(1290)   // 13 000 × 15 % − 660
  })
  it('AMO sans écart : identique à la formule historique', () => {
    const sans = calculateHonorairesFinance(dossier({ typologie: 'amo' }))
    const avec = calculateHonorairesFinance(dossier({ typologie: 'amo', suivi_financier: [courtage()] }))
    expect(avec.courtage.ttc).toBe(sans.courtage.ttc)
    expect(avec.soldeAmo.ttc).toBe(sans.soldeAmo.ttc)
  })
})

describe('calculateCourtageReel', () => {
  it('rien tant que le courtage n’est pas réglé', () => {
    expect(calculateCourtageReel(dossier()).tranches).toHaveLength(0)
  })
  it('le supplément TS n’est compté qu’une fois encaissé, à SA date', () => {
    const ts = { type_echeance: 'honoraires_courtage_ts', statut_client: 'en_attente', montant_ttc: 300, date_paiement: null }
    const d = dossier({ suivi_financier: [courtage(), ts] })
    expect(calculateCourtageReel(d).tranches).toHaveLength(1)
    expect(calculateCourtageReel(d).tranches[0].ttc).toBe(660)
    const d2 = dossier({ suivi_financier: [courtage(), { ...ts, statut_client: 'regle', date_paiement: '2026-04-02' }] })
    const r = calculateCourtageReel(d2)
    expect(r.tranches.map(t => [t.ttc, t.date_paiement])).toEqual([[660, '2026-02-01'], [300, '2026-04-02']])
    expect(r.recognizedNet).toBe(Math.round((550 * 0.95 + 250 * 0.95) * 100) / 100)
  })
})

import { calculateCourtageTS } from '../finance.js'
describe('calculateCourtageTS — courtage figé', () => {
  it('initial = montant encaissé, total = encaissé + TS', () => {
    const d = dossier({
      devis_artisans: [dv({ montant_ttc: 13000 }), dv({ id: 'dv2', montant_ttc: 5000, date_signature: '2026-03-01' })],
      suivi_financier: [courtage()],
    })
    expect(calculateCourtageTS(d)).toEqual({ montantTSttc: 300, courtageInitialTtc: 660, courtageTotalTtc: 960 })
  })
})
