// app/lib/__tests__/ca-equivalence.test.js
//
// TEST D'ÉQUIVALENCE DES CALCULS DE CA — le garde-fou que l'audit réclamait.
//
// Le tableau de bord (computeCAMensuel) et les statistiques (computeCABreakdown) sont
// DEUX parcours de code distincts sur les mêmes données. Ils doivent, à périmètre égal,
// donner le même total. Historiquement ils ont divergé : le correctif « frais remboursés »
// n'avait été appliqué qu'à un seul des trois endroits, et 1 050 € encaissés étaient
// comptés par la page Finances mais absents du CA réel (BRUNET 500 €, LEULIER 550 €).
//
// Ce fichier prend six dossiers TYPES — un par piège connu — et vérifie l'égalité.
// Il n'affirme AUCUN montant : il n'a pas à savoir combien vaut un dossier, seulement
// que les deux chemins tombent d'accord. C'est ce qui le rend robuste aux évolutions
// de barème, et c'est aussi ce qui le rend capable de détecter une divergence introduite
// dans un seul des deux fichiers.

import { describe, it, expect } from 'vitest'
import { computeCAMensuel, computeCABreakdown, fraisEncaisses } from '../ca-reel.js'
import { COURTAGE_STANDARD } from '../finance.js'

const ANNEE = 2026
const r2 = (n) => Math.round(((n || 0) + Number.EPSILON) * 100) / 100
const totalMensuel = (dossiers) =>
  r2(Object.values(computeCAMensuel(dossiers, ANNEE, 'agence')).reduce((s, v) => s + v, 0))

const devis = (o = {}) => ({
  id: o.id ?? 'dv1',
  montant_ht: o.montant_ht ?? 10000,
  montant_ttc: o.montant_ttc ?? 11000,
  commission_pourcentage: o.commission_pourcentage ?? 10,
  statut: o.statut ?? 'accepte',
  date_signature: o.date_signature ?? '2026-03-10',
  artisan: o.artisan ?? { id: 'a1' },
  ...o,
})

const dossier = (o = {}) => ({
  id: o.id ?? 'd1',
  typologie: o.typologie ?? 'courtage',
  part_agente: o.part_agente ?? 0.5,
  taux_courtage: o.taux_courtage ?? COURTAGE_STANDARD,
  honoraires_amo_taux: o.honoraires_amo_taux ?? 9,
  frais_consultation: o.frais_consultation ?? 600,
  frais_statut: o.frais_statut ?? 'regle',
  date_signature_contrat: o.date_signature_contrat ?? '2026-03-01',
  date_fin_chantier: o.date_fin_chantier ?? '2026-06-30',
  devis_artisans: o.devis_artisans ?? [devis()],
  suivi_financier: o.suivi_financier ?? [],
  ...o,
})

// Les six pièges, un par dossier. Chacun a fait perdre de l'argent ou en fera perdre.
const CAS = {
  'courtage, frais réglés, courtage encaissé': dossier({
    id: 'c1',
    suivi_financier: [
      { type_echeance: 'frais_consultation',  statut_client: 'regle', date_paiement: '2026-03-05' },
      { type_echeance: 'honoraires_courtage', statut_client: 'regle', date_paiement: '2026-04-02' },
    ],
  }),

  // LE cas de la régression du 02/09 : frais 'rembourse' = encaissés quand même.
  'frais REMBOURSÉS (le cas des 1 050 €)': dossier({
    id: 'c2', frais_statut: 'rembourse',
    suivi_financier: [
      { type_echeance: 'frais_consultation',  statut_client: 'regle', date_paiement: '2026-05-12' },
      { type_echeance: 'honoraires_courtage', statut_client: 'regle', date_paiement: '2026-05-20' },
    ],
  }),

  'frais OFFERTS (ne doivent rien ajouter)': dossier({
    id: 'c3', frais_statut: 'offerts', frais_consultation: 0,
    suivi_financier: [
      { type_echeance: 'honoraires_courtage', statut_client: 'regle', date_paiement: '2026-02-10' },
    ],
  }),

  'AMO avec solde encaissé': dossier({
    id: 'c4', typologie: 'amo',
    suivi_financier: [
      { type_echeance: 'frais_consultation', statut_client: 'regle', date_paiement: '2026-01-15' },
      { type_echeance: 'solde_amo',          statut_client: 'regle', date_paiement: '2026-07-01' },
    ],
  }),

  // Commission comptée SEULEMENT si l'acompte est marqué reçu.
  'commission débloquée sur devis signé': dossier({
    id: 'c5',
    devis_artisans: [devis({ id: 'dv5' })],
    suivi_financier: [
      { type_echeance: 'acompte_artisan', devis_id: 'dv5', statut_illico: 'recu', date_deblocage: '2026-04-18' },
    ],
  }),

  // Devis repassé en 'a_modifier' : ne doit RIEN apporter (écart n°1 de l'audit).
  'devis repassé en a_modifier (ne compte pas)': dossier({
    id: 'c6',
    devis_artisans: [devis({ id: 'dv6', statut: 'a_modifier' })],
    suivi_financier: [
      { type_echeance: 'acompte_artisan', devis_id: 'dv6', statut_illico: 'recu', date_deblocage: '2026-04-18' },
    ],
  }),
}

describe('équivalence tableau de bord ↔ statistiques', () => {
  for (const [nom, d] of Object.entries(CAS)) {
    it(`même total sur : ${nom}`, () => {
      expect(totalMensuel([d])).toBeCloseTo(computeCABreakdown([d], ANNEE).total, 2)
    })
  }

  it('même total sur les six dossiers ensemble (les arrondis ne dérivent pas)', () => {
    const tous = Object.values(CAS)
    expect(totalMensuel(tous)).toBeCloseTo(computeCABreakdown(tous, ANNEE).total, 2)
  })

  it('un dossier hors année n apporte rien aux deux chemins', () => {
    const vieux = dossier({
      id: 'old', date_signature_contrat: '2024-02-01', date_fin_chantier: '2024-09-01',
      suivi_financier: [
        { type_echeance: 'frais_consultation',  statut_client: 'regle', date_paiement: '2024-03-05' },
        { type_echeance: 'honoraires_courtage', statut_client: 'regle', date_paiement: '2024-04-02' },
      ],
    })
    expect(totalMensuel([vieux])).toBe(0)
    expect(computeCABreakdown([vieux], ANNEE).total).toBe(0)
  })
})

describe('le critère « frais encaissés » est bien celui que les deux chemins utilisent', () => {
  it("un dossier 'rembourse' apporte des frais aux DEUX chemins, pas à un seul", () => {
    const d = CAS['frais REMBOURSÉS (le cas des 1 050 €)']
    expect(fraisEncaisses(d, d.suivi_financier)).toBe(true)
    expect(computeCABreakdown([d], ANNEE).frais).toBeGreaterThan(0)
    expect(totalMensuel([d])).toBeGreaterThan(0)
  })

  it("retirer la ligne de suivi rend les frais NON encaissés, des deux côtés à la fois", () => {
    const d = { ...CAS['frais REMBOURSÉS (le cas des 1 050 €)'],
      suivi_financier: [{ type_echeance: 'honoraires_courtage', statut_client: 'regle', date_paiement: '2026-05-20' }] }
    expect(fraisEncaisses(d, d.suivi_financier)).toBe(false)
    expect(computeCABreakdown([d], ANNEE).frais).toBe(0)
    // et les deux chemins restent d'accord entre eux
    expect(totalMensuel([d])).toBeCloseTo(computeCABreakdown([d], ANNEE).total, 2)
  })
})
