// app/lib/__tests__/dossiers.test.js
// Tests de NON-RÉGRESSION de l'avancement (5 jalons métier) et de la pertinence
// de la deadline devis. But : figer le comportement corrigé —
//   1) l'avancement = part des jalons franchis, PAS le % d'argent encaissé ;
//   2) la deadline devis (et donc le « retard ») ne s'applique QUE tant que le
//      dossier est en phase devis (fini les « retard 187j » sur un chantier).
//
// Lancer : npm test   (vitest run)

import { describe, it, expect } from 'vitest'
import { calculerEtapes, calculerAvancement, deadlineDevisPertinente } from '../dossiers'

describe('calculerAvancement — 5 jalons métier', () => {
  it('dossier vide (rien de franchi) = 0 %', () => {
    expect(calculerAvancement({}, [], 'a_contacter')).toBe(0)
  })

  it('mandat signé seul = 20 %', () => {
    expect(calculerAvancement({ contrat_signe: true }, [], 'a_contacter')).toBe(20)
  })

  it('≥1 devis (sans mandat) reste monotone = 40 %', () => {
    // step2 vrai ⇒ step1 rétro-coché par monotonicité.
    expect(calculerAvancement({ contrat_signe: false }, [{ statut: 'recu' }], 'devis_en_attente')).toBe(40)
  })

  it('chantier en cours = 80 % (4 jalons sur 5)', () => {
    expect(calculerAvancement({ contrat_signe: true }, [{ statut: 'accepte' }], 'en_cours_chantier')).toBe(80)
  })

  it('chantier terminé = 100 %', () => {
    expect(calculerAvancement({ contrat_signe: true }, [{ statut: 'accepte' }], 'termine')).toBe(100)
  })

  it('l\'argent encaissé n\'entre PAS dans le calcul', () => {
    // suivi_financier plein d'encaissements mais aucun jalon franchi → 0 %.
    const dossier = { suivi_financier: [{ montant_ttc: 10000, statut_illico: 'recu' }] }
    expect(calculerAvancement(dossier, [], 'a_contacter')).toBe(0)
  })

  it('étapes monotones : un jalon avancé implique les précédents', () => {
    const done = calculerEtapes({ contrat_signe: false }, [{ statut: 'accepte' }], 'en_cours_chantier')
    expect(done).toEqual([true, true, true, true, false])
  })
})

describe('deadlineDevisPertinente — cadre du « retard » devis', () => {
  it('pertinente en phase devis', () => {
    for (const st of ['a_contacter', 'a_relancer', 'en_etude', 'devis_en_attente', 'devis_prets', 'en_attente_signature', 'devis_a_modifier']) {
      expect(deadlineDevisPertinente(st)).toBe(true)
    }
  })

  it('NON pertinente une fois signé / en chantier / clos (fini les « retard 187j »)', () => {
    for (const st of ['chantier_a_venir', 'en_cours_chantier', 'termine', 'annule']) {
      expect(deadlineDevisPertinente(st)).toBe(false)
    }
  })
})
