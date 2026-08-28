// app/lib/__tests__/finance.test.js
// Tests de NON-RÉGRESSION du cœur financier (source unique : finance.js).
// But : figer les montants exacts (frais, commissions, courtage, AMO, apporteur,
// solde AMO échelonné) + garantir les invariants métier — notamment que TOUT
// partage agente/admin se calcule sur le HT, jamais sur le TTC (règle CDC).
//
// Lancer : npm test   (vitest run)

import { describe, it, expect } from 'vitest'
import {
  calculateCourtageTS, isHorsHonoraires,
  TVA_FRAIS, TVA_TRAVAUX, ROYALTIES_RATE, COURTAGE_STANDARD, AMO_STANDARD, DEFAULT_PART_AGENTE,
  getPartAgente, getTauxCourtage, getTauxAmo,
  getActiveDevis, getSignedDevis,
  calculateFraisFinance,
  calculateDevisFinance, calculateCommissionsFinance,
  calculateHonorairesFinance, calculateHonorairesPrevi, calculateHonorairesRecuAccepte,
  calculateSoldeAmoReel,
  calculateApporteurFinance,
  calculateDossierFinance,
} from '../finance.js'

// ── Fabriques de fixtures ─────────────────────────────────────────────────────
const devis = (o = {}) => ({
  id: o.id ?? 'dv1',
  montant_ht: o.montant_ht ?? 10000,
  montant_ttc: o.montant_ttc ?? 11000,
  commission_pourcentage: o.commission_pourcentage ?? 10,
  statut: o.statut ?? 'accepte',
  date_signature: o.date_signature ?? '2025-01-10',
  artisan: o.artisan ?? {},
  ...o,
})

const dossier = (o = {}) => ({
  typologie: o.typologie ?? 'courtage',
  part_agente: o.part_agente ?? 0.5,
  taux_courtage: o.taux_courtage ?? COURTAGE_STANDARD,
  devis_artisans: o.devis_artisans ?? [devis()],
  suivi_financier: o.suivi_financier ?? [],
  ...o,
})

// ── Constantes ────────────────────────────────────────────────────────────────
describe('constantes', () => {
  it('valeurs métier figées', () => {
    expect(TVA_FRAIS).toBe(1.2)
    expect(TVA_TRAVAUX).toBe(1.1)
    expect(ROYALTIES_RATE).toBe(0.05)
    expect(COURTAGE_STANDARD).toBe(0.06)
    expect(AMO_STANDARD).toBe(0.09)
    expect(DEFAULT_PART_AGENTE).toBe(0.5)
  })
})

// ── Accesseurs ────────────────────────────────────────────────────────────────
describe('getPartAgente', () => {
  it('utilise part_agente si présent', () => {
    expect(getPartAgente({ part_agente: 0.4 })).toBe(0.4)
  })
  it('normalise un pourcentage entier (40 -> 0.4)', () => {
    expect(getPartAgente({ part_agente: 40 })).toBe(0.4)
  })
  it('référent admin sans part_agente -> 0', () => {
    expect(getPartAgente({ referente: { role: 'admin' } })).toBe(0)
  })
  it('défaut = 0.5 sinon', () => {
    expect(getPartAgente({})).toBe(DEFAULT_PART_AGENTE)
  })
})

describe('getTauxCourtage / getTauxAmo', () => {
  it('courtage : valeur dossier ou défaut 6%', () => {
    expect(getTauxCourtage({ taux_courtage: 0.04 })).toBe(0.04)
    expect(getTauxCourtage({})).toBe(COURTAGE_STANDARD)
  })
  it('amo : honoraires_amo_taux en % normalisé, défaut 9%', () => {
    expect(getTauxAmo({ honoraires_amo_taux: 9 })).toBe(0.09)
    expect(getTauxAmo({})).toBe(AMO_STANDARD)
  })
})

describe('getActiveDevis / getSignedDevis', () => {
  const d = dossier({ devis_artisans: [
    devis({ id: 'a', statut: 'accepte' }),
    devis({ id: 'b', statut: 'recu', date_signature: null }),
    devis({ id: 'c', statut: 'a_modifier', date_signature: '2025-01-01' }),
    devis({ id: 'x', statut: 'refuse' }),
  ] })
  it('actifs = recu/accepte/a_modifier (exclut refuse)', () => {
    expect(getActiveDevis(d).map(v => v.id)).toEqual(['a', 'b', 'c'])
  })
  it('signés = accepte/date_signature mais JAMAIS a_modifier', () => {
    expect(getSignedDevis(d).map(v => v.id)).toEqual(['a'])
  })
})

// ── Frais de consultation ─────────────────────────────────────────────────────
describe('calculateFraisFinance', () => {
  it('600 TTC -> HT 500, royalties 25, net 475, split 50/50', () => {
    const f = calculateFraisFinance({ frais_consultation: 600, part_agente: 0.5 })
    expect(f.fraisHT).toBe(500)          // 600 / TVA_FRAIS
    expect(f.royalties).toBe(25)         // 500 * 0.05
    expect(f.net).toBe(475)
    expect(f.parts).toEqual({ agente: 237.5, admin: 237.5 })
  })
  it('le partage porte sur le HT (agente + admin === net)', () => {
    const f = calculateFraisFinance({ frais_consultation: 600, part_agente: 0.3 })
    expect(f.parts.agente + f.parts.admin).toBeCloseTo(f.net, 2)
  })
})

// ── Commission par devis ──────────────────────────────────────────────────────
describe('calculateDevisFinance', () => {
  it('commission 10% sur 10000 HT -> comHT 1000, net 950, split 475/475', () => {
    const r = calculateDevisFinance(devis({ commission_pourcentage: 10 }), dossier())
    expect(r.comHT).toBe(1000)           // 10000 * 0.10 (base HT)
    expect(r.royaltiesType2).toBe(50)
    expect(r.netCom).toBe(950)
    expect(r.parts).toEqual({ agente: 475, admin: 475 })
    expect(r.signed).toBe(true)
  })
  it('acompte 30% du TTC + solde (affichage, hors partage)', () => {
    const r = calculateDevisFinance(devis({ montant_ttc: 11000 }), dossier())
    expect(r.acompte).toBeCloseTo(3300, 2)
    expect(r.solde).toBeCloseTo(7700, 2)
  })
  it('la commission est calculée sur le HT, pas le TTC', () => {
    // Un TTC différent ne doit PAS changer la commission (base = HT).
    const base = calculateDevisFinance(devis({ montant_ht: 10000, montant_ttc: 11000 }), dossier())
    const ttcX = calculateDevisFinance(devis({ montant_ht: 10000, montant_ttc: 99999 }), dossier())
    expect(ttcX.comHT).toBe(base.comHT)
    expect(ttcX.netCom).toBe(base.netCom)
  })
})

describe('calculateCommissionsFinance', () => {
  it('agrège les devis actifs et somme les parts', () => {
    const d = dossier({ devis_artisans: [
      devis({ id: 'a', montant_ht: 10000, commission_pourcentage: 10 }),
      devis({ id: 'b', montant_ht: 5000, commission_pourcentage: 10 }),
    ] })
    const c = calculateCommissionsFinance(d)
    expect(c.comHT).toBe(1500)           // 1000 + 500
    expect(c.parts.agente + c.parts.admin).toBeCloseTo(c.netCom, 2)
  })
})

// ── Honoraires courtage ───────────────────────────────────────────────────────
describe('calculateHonorairesFinance — courtage', () => {
  const h = calculateHonorairesFinance(dossier({ typologie: 'courtage' }))
  it('courtage 6% : brut 660 (TTC), ht 600, net 570, split 285/285', () => {
    expect(h.courtage.brut).toBe(660)    // 11000 * 0.06
    expect(h.courtage.ht).toBe(600)      // 10000 * 0.06
    expect(h.courtage.net).toBe(570)     // 600 - 30 royalties
    expect(h.courtage.parts).toEqual({ agente: 285, admin: 285 })
  })
  it('pas de solde AMO en courtage', () => {
    expect(h.soldeAmo.ttc).toBe(0)
    expect(h.soldeAmo.parts).toEqual({ agente: 0, admin: 0 })
  })
  it('tarif standard barré : courtage 660 + amo 990 = 1650', () => {
    expect(h.standard.courtageTTCBrut).toBe(660)
    expect(h.standard.amoTTC).toBe(990)
    expect(h.standard.totalTTC).toBe(1650)
  })
  it('PARTAGE SUR HT : agente+admin === net (< ttc)', () => {
    expect(h.courtage.parts.agente + h.courtage.parts.admin).toBeCloseTo(h.courtage.net, 2)
    expect(h.courtage.net).toBeLessThan(h.courtage.ttc)
  })
})

// ── Honoraires AMO ────────────────────────────────────────────────────────────
describe('calculateHonorairesFinance — AMO', () => {
  const h = calculateHonorairesFinance(dossier({ typologie: 'amo', honoraires_amo_taux: 9 }))
  it('courtage 6% + solde AMO 9% (base HT 10000)', () => {
    expect(h.courtage.ht).toBe(600)
    expect(h.soldeAmo.ttc).toBe(990)     // 11000 * 0.09
    expect(h.soldeAmo.ht).toBe(900)      // 10000 * 0.09
    expect(h.soldeAmo.net).toBe(855)     // 900 - 45
    expect(h.soldeAmo.parts).toEqual({ agente: 427.5, admin: 427.5 })
  })
  it('total net = courtage.net + soldeAmo.net', () => {
    expect(h.totalNet).toBe(1425)        // 570 + 855
  })
})

// ── Solde AMO échelonné (reconnaissance à l'encaissement) ─────────────────────
describe('calculateSoldeAmoReel', () => {
  it('sans ligne solde_amo_paiement -> hasTranches false', () => {
    expect(calculateSoldeAmoReel(dossier({ typologie: 'amo' })).hasTranches).toBe(false)
  })
  it('une tranche encaissée -> HT reconstruit au ratio, split sur HT', () => {
    const d = dossier({
      typologie: 'amo', honoraires_amo_taux: 9,
      suivi_financier: [{ type_echeance: 'solde_amo_paiement', montant_ttc: 990, date_paiement: '2025-02-01' }],
    })
    const r = calculateSoldeAmoReel(d)
    expect(r.hasTranches).toBe(true)
    expect(r.recognizedHt).toBe(900)     // 990 * (900/990)
    expect(r.recognizedNet).toBe(855)
    expect(r.parts.agente + r.parts.admin).toBeCloseTo(r.recognizedNet, 2)
  })
  it('tranche « en attente » -> exclue du CA réel (reconnaissance à l\'encaissement)', () => {
    const d = dossier({
      typologie: 'amo', honoraires_amo_taux: 9,
      suivi_financier: [
        { type_echeance: 'solde_amo_paiement', montant_ttc: 990, date_paiement: '2025-02-01', statut_client: 'regle' },
        { type_echeance: 'solde_amo_paiement', montant_ttc: 990, date_paiement: null, statut_client: 'en_attente' },
      ],
    })
    const r = calculateSoldeAmoReel(d)
    expect(r.hasTranches).toBe(true)
    expect(r.recognizedHt).toBe(900)   // seule la tranche réglée est reconnue (pas les 1980)
  })
})

// ── Apporteur client ──────────────────────────────────────────────────────────
describe('calculateApporteurFinance', () => {
  it('inactif -> enabled false, coût 0', () => {
    const a = calculateApporteurFinance(dossier({ apporteur_actif: false }))
    expect(a.enabled).toBe(false)
    expect(a.totalHT).toBe(0)
  })
  it('mode total_chantier_ht : 10% de 10000 HT = 1000, split 500/500', () => {
    const a = calculateApporteurFinance(dossier({
      apporteur_actif: true,
      apporteur_pourcentage: 10,
      client: { apporteur_base: 'total_chantier' },
      devis_artisans: [devis({ id: 'd1', montant_ht: 10000, commission_pourcentage: 5 })],
    }))
    expect(a.enabled).toBe(true)
    expect(a.mode).toBe('total_chantier_ht')
    expect(a.totalHT).toBe(1000)
    expect(a.parts).toEqual({ agente: 500, admin: 500 })
    expect(a.partsReel).toEqual({ agente: 0, admin: 0 }) // rien débloqué
  })
  it('le coût apporteur est calculé sur le HT', () => {
    const a = calculateApporteurFinance(dossier({
      apporteur_actif: true, apporteur_pourcentage: 10,
      client: { apporteur_base: 'total_chantier' },
      devis_artisans: [devis({ id: 'd1', montant_ht: 10000, montant_ttc: 99999, commission_pourcentage: 5 })],
    }))
    expect(a.totalHT).toBe(1000) // insensible au TTC
  })
})

// ── ESTIMO : verrou de non-régression ─────────────────────────────────────────
// ESTIMO se comporte comme un frais de consultation à montant variable : AUCUN
// honoraire courtage/AMO. On fige ce comportement pour éviter qu'un futur branchement
// ne fasse fuiter des honoraires sur un dossier estimo.
describe('calculateHonorairesFinance — estimo (aucun honoraire)', () => {
  const h = calculateHonorairesFinance(dossier({ typologie: 'estimo', frais_consultation: 500, frais_statut: 'regle' }))
  it('estimo → courtage et solde AMO à zéro', () => {
    expect(h.courtage.brut).toBe(0)
    expect(h.courtage.ttc).toBe(0)
    expect(h.courtage.ht).toBe(0)
    expect(h.courtage.parts).toEqual({ agente: 0, admin: 0 })
    expect(h.soldeAmo.ttc).toBe(0)
    expect(h.soldeAmo.parts).toEqual({ agente: 0, admin: 0 })
  })
  it('estimo → les frais de consultation (montant estimo) restent calculés normalement', () => {
    const f = calculateFraisFinance(dossier({ typologie: 'estimo', frais_consultation: 600 }))
    expect(f.fraisHT).toBe(500)   // 600 / 1.2
  })
})

// ── MERAD : verrou de non-régression ──────────────────────────────────────────
// MERAD = courtage allégé : PAS d'honoraires courtage/AMO ; la rémunération BATILIS
// est la COMMISSION artisan (commission_pourcentage du devis), déjà calculée par
// calculateCommissionsFinance et récupérée via l'acompte débloqué. On fige les deux.
describe('finance — merad', () => {
  it('merad → aucun honoraire courtage ni solde AMO (comme estimo)', () => {
    const h = calculateHonorairesFinance(dossier({ typologie: 'merad' }))
    expect(h.courtage.ttc).toBe(0)
    expect(h.courtage.parts).toEqual({ agente: 0, admin: 0 })
    expect(h.soldeAmo.ttc).toBe(0)
  })
  it('merad → la commission artisan (commission_pourcentage) est bien calculée', () => {
    const c = calculateCommissionsFinance(dossier({
      typologie: 'merad',
      devis_artisans: [devis({ montant_ht: 10000, commission_pourcentage: 15, statut: 'accepte' })],
    }))
    expect(c.comHT).toBe(1500)   // 10000 × 15%
  })
})

// ── Agrégat dossier ───────────────────────────────────────────────────────────
describe('calculateDossierFinance', () => {
  it('ne jette pas sur un dossier vide et renvoie des zéros cohérents', () => {
    const f = calculateDossierFinance({})
    expect(f.frais.fraisHT).toBe(0)
    expect(f.gains.netsPrevi).toEqual({ agente: 0, admin: 0 })
  })
  it('déterministe : deux appels identiques -> résultat identique', () => {
    const d = dossier({ typologie: 'amo', honoraires_amo_taux: 9 })
    expect(calculateDossierFinance(d)).toEqual(calculateDossierFinance(d))
  })
  it('gains prévi nets = bruts - part apporteur (sur HT)', () => {
    const d = dossier({
      typologie: 'courtage',
      apporteur_actif: true, apporteur_pourcentage: 10,
      client: { apporteur_base: 'total_chantier' },
    })
    const f = calculateDossierFinance(d)
    const brutA = f.frais.parts.agente + f.commissions.parts.agente + f.honorairesPrevi.parts.agente
    expect(f.gains.netsPrevi.agente).toBeCloseTo(brutA - f.apporteur.parts.agente, 2)
  })
})

// ── INVARIANT GLOBAL : aucun partage sur le TTC ───────────────────────────────
describe('invariant HT — le total agente+admin ne dépasse jamais le net HT', () => {
  const cases = [
    dossier({ typologie: 'courtage' }),
    dossier({ typologie: 'amo', honoraires_amo_taux: 9 }),
    dossier({ typologie: 'courtage', part_agente: 0.3, taux_courtage: 0.04 }),
  ]
  it.each(cases)('honoraires : parts == net pour %#', (d) => {
    const h = calculateHonorairesFinance(d)
    const totalParts =
      h.courtage.parts.agente + h.courtage.parts.admin +
      h.soldeAmo.parts.agente + h.soldeAmo.parts.admin
    expect(totalParts).toBeCloseTo(h.totalNet, 2)
  })
})

// ── HORS HONORAIRES — case « Sans commission ni honoraires » ──────────────────
// Cas de référence : dossier 2026-AM-002 (Eppinger). Devis 75 047,95 € TTC dont
// 2 TS cochés (880 + 308 = 1 188 €). Base pleine 75 047,95 / base réduite 73 859,95.
// Taux : courtage 5,4 % · AMO 6,6 %. Pivot posé AVANT les 2 TS → TS-1 armé.
describe('hors_honoraires — exonération d\'honoraires par devis', () => {
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100
  const eppinger = (exonere) => dossier({
    typologie: 'amo',
    taux_courtage: 0.054,
    honoraires_amo_taux: 6.6,
    devis_artisans: [
      devis({ id: 'base', montant_ht: 67145.41, montant_ttc: 73859.95, date_signature: '2026-02-01' }),
      devis({ id: 'ts1', montant_ht: 800,  montant_ttc: 880, date_signature: '2026-05-20', hors_honoraires: exonere }),
      devis({ id: 'ts2', montant_ht: 280,  montant_ttc: 308, date_signature: '2026-05-20', hors_honoraires: exonere }),
    ],
    suivi_financier: [
      { type_echeance: 'honoraires_courtage', statut_client: 'regle', date_paiement: '2026-03-01' },
    ],
  })

  it('helper : seul hors_honoraires === true exonère (commission 0 ne suffit pas)', () => {
    expect(isHorsHonoraires({ hors_honoraires: true })).toBe(true)
    expect(isHorsHonoraires({ commission_pourcentage: 0 })).toBe(false)
    expect(isHorsHonoraires({})).toBe(false)
  })

  it('assiette pleine conservée pour le TOTAL CHANTIER et le tarif standard', () => {
    const f = calculateHonorairesFinance(eppinger(true))
    expect(f.totalDevisTTCSignes).toBeCloseTo(75047.95, 2)
    expect(f.standard.courtageTTCBrut).toBeCloseTo(4502.88, 2)
    expect(f.standard.amoTTC).toBeCloseTo(6754.32, 2)
  })

  it('acompte + solde AMO calculés sur l\'assiette réduite', () => {
    const f = calculateHonorairesFinance(eppinger(true))
    expect(f.courtage.brut).toBeCloseTo(3988.44, 2)
    expect(f.soldeAmo.ttc).toBeCloseTo(4874.76, 2)
    expect(f.courtage.brut + f.soldeAmo.ttc).toBeCloseTo(8863.20, 2)
  })

  it('précédence sur TS-1 : le TS exonéré n\'est PAS surtaxé à (courtage + AMO)', () => {
    const exo = calculateHonorairesFinance(eppinger(true))
    const ref = calculateHonorairesFinance(eppinger(false))
    // Sans exonération, TS-1 bascule les 1 188 € à 12 % → +142,56 € sur le solde.
    expect(ref.soldeAmo.ttc).toBeCloseTo(5017.32, 2)
    expect(exo.soldeAmo.ttc).toBeCloseTo(4874.76, 2)
    expect(ref.soldeAmo.ttc - exo.soldeAmo.ttc).toBeCloseTo(142.56, 2)
    // Le courtage, lui, est identique : TS-1 l'amputait déjà des mêmes 1 188 €.
    expect(exo.courtage.brut).toBeCloseTo(ref.courtage.brut, 2)
  })

  it('honoraires offerts valorisés aux taux standard', () => {
    const f = calculateHonorairesFinance(eppinger(true))
    expect(f.exclu.ttc).toBeCloseTo(1188, 2)
    expect(f.exclu.courtageStdTTC).toBeCloseTo(71.28, 2)
    expect(f.exclu.amoStdTTC).toBeCloseTo(106.92, 2)
  })

  it('décomposition exacte standard → votre tarif (contrôles du cahier des charges)', () => {
    const f = calculateHonorairesFinance(eppinger(true))
    const offertC = f.exclu.courtageStdTTC
    const offertA = f.exclu.amoStdTTC
    const remiseC = round2(f.standard.courtageTTCBrut - f.courtage.brut - offertC)
    const remiseA = round2(f.standard.amoTTC - f.soldeAmo.ttc - offertA)
    const honStd  = round2(f.standard.courtageTTCBrut + f.standard.amoTTC)
    expect(honStd).toBeCloseTo(11257.20, 2)
    expect(remiseC).toBeCloseTo(443.16, 2)
    expect(remiseA).toBeCloseTo(1772.64, 2)
    expect(round2(offertC + offertA)).toBeCloseTo(178.20, 2)
    // 11 257,20 − 443,16 − 1 772,64 − 178,20 = 8 863,20
    expect(round2(honStd - remiseC - remiseA - offertC - offertA)).toBeCloseTo(8863.20, 2)
    // 3 988,44 + 4 874,76 = 8 863,20
    expect(round2(f.courtage.brut + f.soldeAmo.ttc)).toBeCloseTo(8863.20, 2)
  })

  it('libellé TS : vrai seulement si TOUS les exonérés sont post-pivot', () => {
    // Cas Eppinger : pivot 01/03, TS signés le 20/05 → travaux supplémentaires.
    expect(calculateHonorairesFinance(eppinger(true)).exclu.tousTS).toBe(true)

    // Devis exonéré signé AVANT le pivot → libellé générique.
    const avant = dossier({
      typologie: 'amo', taux_courtage: 0.054, honoraires_amo_taux: 6.6,
      devis_artisans: [
        devis({ id: 'base', montant_ttc: 73859.95, date_signature: '2026-02-01' }),
        devis({ id: 'x', montant_ttc: 880, date_signature: '2026-02-10', hors_honoraires: true }),
      ],
      suivi_financier: [{ type_echeance: 'honoraires_courtage', statut_client: 'regle', date_paiement: '2026-03-01' }],
    })
    expect(calculateHonorairesFinance(avant).exclu.tousTS).toBe(false)

    // Lot MIXTE (un avant, un après) → générique aussi.
    const mixte = dossier({
      typologie: 'amo', taux_courtage: 0.054, honoraires_amo_taux: 6.6,
      devis_artisans: [
        devis({ id: 'base', montant_ttc: 73859.95, date_signature: '2026-02-01' }),
        devis({ id: 'x', montant_ttc: 880, date_signature: '2026-02-10', hors_honoraires: true }),
        devis({ id: 'y', montant_ttc: 308, date_signature: '2026-05-20', hors_honoraires: true }),
      ],
      suivi_financier: [{ type_echeance: 'honoraires_courtage', statut_client: 'regle', date_paiement: '2026-03-01' }],
    })
    expect(calculateHonorairesFinance(mixte).exclu.tousTS).toBe(false)

    // Aucun pivot (courtage non réglé) → générique.
    const sansPivot = dossier({
      typologie: 'amo', taux_courtage: 0.054, honoraires_amo_taux: 6.6,
      devis_artisans: [
        devis({ id: 'base', montant_ttc: 73859.95, date_signature: '2026-02-01' }),
        devis({ id: 'x', montant_ttc: 880, date_signature: '2026-05-20', hors_honoraires: true }),
      ],
      suivi_financier: [],
    })
    expect(calculateHonorairesFinance(sansPivot).exclu.tousTS).toBe(false)

    // Dossier COURTAGE : le pivot est lu sans gate typologie → TS reconnus aussi.
    const courtageTS = dossier({
      typologie: 'courtage', taux_courtage: 0.06,
      devis_artisans: [
        devis({ id: 'base', montant_ttc: 11000, date_signature: '2026-02-01' }),
        devis({ id: 'ts', montant_ttc: 1100, date_signature: '2026-05-01', hors_honoraires: true }),
      ],
      suivi_financier: [{ type_echeance: 'honoraires_courtage', statut_client: 'regle', date_paiement: '2026-03-01' }],
    })
    expect(calculateHonorairesFinance(courtageTS).exclu.tousTS).toBe(true)

    // Aucun devis exonéré → toujours false (aucune ligne au PDF).
    expect(calculateHonorairesFinance(eppinger(false)).exclu.tousTS).toBe(false)
  })

  it('taux plein 6/9 % + devis exonéré : écart à expliquer non nul', () => {
    // Point 3 : sans remise de taux, le total baisse quand même → le PDF doit pouvoir
    // afficher le tarif standard barré. Ici on vérifie la matière : l'écart.
    const d = dossier({
      typologie: 'amo', taux_courtage: COURTAGE_STANDARD, honoraires_amo_taux: 9,
      devis_artisans: [
        devis({ id: 'base', montant_ttc: 10000, date_signature: '2026-02-01' }),
        devis({ id: 'x', montant_ttc: 1000, date_signature: '2026-05-01', hors_honoraires: true }),
      ],
      suivi_financier: [],
    })
    const f = calculateHonorairesFinance(d)
    expect(f.standard.courtageTTCBrut).toBeCloseTo(660, 2)   // 11 000 × 6 %
    expect(f.courtage.brut).toBeCloseTo(600, 2)              // 10 000 × 6 %
    expect(f.standard.amoTTC).toBeCloseTo(990, 2)            // 11 000 × 9 %
    expect(f.soldeAmo.ttc).toBeCloseTo(900, 2)               // 10 000 × 9 %
    // L'écart est exactement les honoraires offerts : aucune remise de taux.
    expect(round2(f.standard.courtageTTCBrut - f.courtage.brut)).toBeCloseTo(f.exclu.courtageStdTTC, 2)
    expect(round2(f.standard.amoTTC - f.soldeAmo.ttc)).toBeCloseTo(f.exclu.amoStdTTC, 2)
  })

  it('prévisionnel et recap recu+accepte suivent la même assiette réduite', () => {
    const previ = calculateHonorairesPrevi(eppinger(true))
    const recap = calculateHonorairesRecuAccepte(eppinger(true))
    expect(previ.totalDevisTTCRecus).toBeCloseTo(75047.95, 2)
    expect(previ.courtage.brut).toBeCloseTo(3988.44, 2)
    expect(recap.totalDevisTTCRecuAccepte).toBeCloseTo(75047.95, 2)
    expect(recap.courtage.brut).toBeCloseTo(3988.44, 2)
  })

  it('TS-2 (courtage-only) : un TS exonéré ne génère aucun supplément', () => {
    const base = {
      typologie: 'courtage',
      taux_courtage: 0.06,
      suivi_financier: [{ type_echeance: 'honoraires_courtage', statut_client: 'regle', date_paiement: '2026-03-01' }],
    }
    const mk = (exonere) => dossier({
      ...base,
      devis_artisans: [
        devis({ id: 'a', montant_ht: 10000, montant_ttc: 11000, date_signature: '2026-02-01' }),
        devis({ id: 'ts', montant_ht: 1000, montant_ttc: 1100, date_signature: '2026-05-01', hors_honoraires: exonere }),
      ],
    })
    const ref = calculateCourtageTS(mk(false))
    expect(ref.montantTSttc).toBeCloseTo(66, 2)          // 1 100 × 6 %
    expect(ref.courtageTotalTtc).toBeCloseTo(726, 2)     // 12 100 × 6 %
    const exo = calculateCourtageTS(mk(true))
    expect(exo.montantTSttc).toBeCloseTo(0, 2)
    expect(exo.courtageTotalTtc).toBeCloseTo(660, 2)     // 11 000 × 6 %
  })

  it('NON-RÉGRESSION : sans aucun devis coché, tout est identique au centime', () => {
    const cas = [
      dossier({ typologie: 'courtage' }),
      dossier({ typologie: 'amo', honoraires_amo_taux: 9 }),
      eppinger(false),
      eppinger(undefined),
    ]
    for (const d of cas) {
      const f = calculateHonorairesFinance(d)
      expect(f.exclu.ttc).toBe(0)
      expect(f.exclu.courtageStdTTC).toBe(0)
      expect(f.exclu.amoStdTTC).toBe(0)
    }
    // eppinger(false) == eppinger(undefined) : hors_honoraires absent ⇒ non exonéré.
    const a = calculateHonorairesFinance(eppinger(false))
    const b = calculateHonorairesFinance(eppinger(undefined))
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})
