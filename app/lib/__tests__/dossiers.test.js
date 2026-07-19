// app/lib/__tests__/dossiers.test.js
// Tests de NON-RÉGRESSION de l'avancement (5 jalons métier) et de la pertinence
// de la deadline devis. But : figer le comportement corrigé —
//   1) l'avancement = part des jalons franchis, PAS le % d'argent encaissé ;
//   2) la deadline devis (et donc le « retard ») ne s'applique QUE tant que le
//      dossier est en phase devis (fini les « retard 187j » sur un chantier).
//
// Lancer : npm test   (vitest run)

import { describe, it, expect } from 'vitest'
import { calculerEtapes, calculerAvancement, deadlineDevisPertinente, diffJours, joursAvantDeadlineDevis, badgeDeadlineDevis } from '../dossiers'

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

  it('dossier null (chargement) ne crashe pas → 0 % / aucune étape', () => {
    // Régression : à l'ouverture d'une fiche, dossier === null le temps du fetch.
    expect(() => calculerAvancement(null)).not.toThrow()
    expect(calculerAvancement(null)).toBe(0)
    expect(calculerEtapes(null)).toEqual([false, false, false, false, false])
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

describe('diffJours — jours pleins, robuste au fuseau', () => {
  const ref = new Date(2026, 6, 17) // 17 juillet 2026, minuit local

  it('date future = écart positif', () => {
    expect(diffJours('2026-07-20', ref)).toBe(3)
  })
  it('même jour = 0 (peu importe l\'heure de la référence)', () => {
    expect(diffJours('2026-07-17', new Date(2026, 6, 17, 23, 59))).toBe(0)
  })
  it('date passée = écart négatif', () => {
    expect(diffJours('2026-07-10', ref)).toBe(-7)
  })
  it('une string YYYY-MM-DD (minuit UTC) ne décale pas d\'un jour', () => {
    // Le bug classique : new Date("2026-07-17") = minuit UTC → -1j en fuseau négatif.
    expect(diffJours('2026-07-17', ref)).toBe(0)
  })
})

describe('badgeDeadlineDevis — convention UNIQUE (liste = dashboard)', () => {
  const ref = new Date(2026, 6, 17)
  const enPhase = (dateLimite) => ({ statut: 'a_contacter', date_limite_devis: dateLimite })

  it('à venir 1-7 j → « J-N » (ambre), JAMAIS pour un retard', () => {
    expect(badgeDeadlineDevis(enPhase('2026-07-20'), ref)).toEqual({ jours: 3, texte: 'J-3', ton: 'urgent' })
  })
  it('aujourd\'hui → « Aujourd\'hui » (et non « J-0 »)', () => {
    expect(badgeDeadlineDevis(enPhase('2026-07-17'), ref)).toEqual({ jours: 0, texte: "Aujourd'hui", ton: 'urgent' })
  })
  it('retard → « Retard Nj » (rouge), plus jamais « J-… »', () => {
    expect(badgeDeadlineDevis(enPhase('2026-07-14'), ref)).toEqual({ jours: -3, texte: 'Retard 3j', ton: 'retard' })
  })
  it('au-delà de 7 j → texte null (le composant affiche la date)', () => {
    const b = badgeDeadlineDevis(enPhase('2026-08-15'), ref)
    expect(b.ton).toBe('normal')
    expect(b.texte).toBeNull()
  })
  it('hors phase devis (terminé) → aucun badge', () => {
    expect(joursAvantDeadlineDevis({ statut: 'termine', date_limite_devis: '2026-01-01' }, ref)).toBeNull()
    expect(badgeDeadlineDevis({ statut: 'termine', date_limite_devis: '2026-01-01' }, ref)).toBeNull()
  })
  it('pas de deadline → aucun badge', () => {
    expect(badgeDeadlineDevis(enPhase(null), ref)).toBeNull()
  })
})
