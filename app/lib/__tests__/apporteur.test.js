import { describe, it, expect } from 'vitest'
import {
  normaliserGrille, tauxSelonGrille, expliquerGrille,
  grilleVersTexte, texteVersGrille,
} from '../apporteur.js'
import { calculateApporteurFinance } from '../finance.js'

// La grille décide de ce qu'on verse à un apporteur. Une erreur ici est une erreur
// d'argent, sur chaque chantier apporté, et personne ne la voit — le taux proposé a
// l'air d'un chiffre officiel.

const GRILLE_MARTIGUES = { paliers: [
  { seuil_ttc: 10000, taux: 5 },
  { seuil_ttc: 50000, taux: 7 },
  { seuil_ttc: 100000, taux: 10 },
] }

describe('lecture de la grille', () => {
  it('applique le palier atteint — la grille de Martigues, telle que dictée', () => {
    expect(tauxSelonGrille(GRILLE_MARTIGUES, 12000).taux).toBe(5)
    expect(tauxSelonGrille(GRILLE_MARTIGUES, 60000).taux).toBe(7)
    expect(tauxSelonGrille(GRILLE_MARTIGUES, 250000).taux).toBe(10)
  })

  it('« à partir de » comprend le seuil lui-même', () => {
    expect(tauxSelonGrille(GRILLE_MARTIGUES, 10000).taux).toBe(5)
    expect(tauxSelonGrille(GRILLE_MARTIGUES, 50000).taux).toBe(7)
    expect(tauxSelonGrille(GRILLE_MARTIGUES, 100000).taux).toBe(10)
  })

  it('ne propose RIEN sous le premier palier', () => {
    // « En dessous de 10 000 €, c'est un restaurant, donc commission nulle. »
    expect(tauxSelonGrille(GRILLE_MARTIGUES, 9999)).toBe(null)
    expect(tauxSelonGrille(GRILLE_MARTIGUES, 0)).toBe(null)
  })

  it('se moque de l\'ordre de saisie des paliers', () => {
    // Un franchisé qui saisit ses paliers en désordre obtiendrait sinon un taux faux,
    // sans le moindre signe.
    const desordre = { paliers: [
      { seuil_ttc: 100000, taux: 10 },
      { seuil_ttc: 10000, taux: 5 },
      { seuil_ttc: 50000, taux: 7 },
    ] }
    expect(tauxSelonGrille(desordre, 60000).taux).toBe(7)
  })

  it('ne propose rien plutôt qu\'un taux douteux quand la grille est absente ou bancale', () => {
    expect(tauxSelonGrille(null, 60000)).toBe(null)
    expect(tauxSelonGrille({}, 60000)).toBe(null)
    expect(tauxSelonGrille({ paliers: [] }, 60000)).toBe(null)
    expect(tauxSelonGrille({ paliers: [{ seuil_ttc: 'abc', taux: 5 }] }, 60000)).toBe(null)
    expect(tauxSelonGrille({ paliers: [{ seuil_ttc: 1000, taux: 900 }] }, 60000)).toBe(null)
  })

  it('ne propose rien sur un montant illisible', () => {
    expect(tauxSelonGrille(GRILLE_MARTIGUES, null)).toBe(null)
    expect(tauxSelonGrille(GRILLE_MARTIGUES, undefined)).toBe(null)
  })

  it('écarte les paliers invalides sans jeter les bons', () => {
    const melange = { paliers: [
      { seuil_ttc: 10000, taux: 5 },
      { seuil_ttc: null, taux: 7 },
      { seuil_ttc: 100000, taux: 10 },
    ] }
    expect(normaliserGrille(melange)).toHaveLength(2)
    expect(tauxSelonGrille(melange, 120000).taux).toBe(10)
  })
})

describe('justification affichée', () => {
  it('dit POURQUOI ce taux est proposé — un chiffre nu serait accepté sans réfléchir', () => {
    const t = expliquerGrille(GRILLE_MARTIGUES, 60000)
    expect(t).toContain('7 %')
    expect(t).toContain('50')
  })
  it('explique aussi l\'absence de commission sous le premier seuil', () => {
    expect(expliquerGrille(GRILLE_MARTIGUES, 5000)).toContain('aucune commission')
  })
  it('ne dit rien quand la société n\'a pas de grille', () => {
    expect(expliquerGrille(null, 60000)).toBe(null)
  })
})

describe('saisie de la grille dans les paramètres', () => {
  it('lit une saisie humaine : espaces, symboles, virgule décimale', () => {
    const { grille, erreurs } = texteVersGrille('10 000 € : 5 %\n50000 : 7\n100000 : 10,5')
    expect(erreurs).toEqual([])
    expect(grille.paliers).toEqual([
      { seuil_ttc: 10000, taux: 5 },
      { seuil_ttc: 50000, taux: 7 },
      { seuil_ttc: 100000, taux: 10.5 },
    ])
  })

  it('nomme la LIGNE fautive — « grille invalide » serait inutilisable', () => {
    const { erreurs } = texteVersGrille('10000 : 5\nn\'importe quoi\n50000 : 7')
    expect(erreurs).toHaveLength(1)
    expect(erreurs[0]).toContain('Ligne 2')
  })

  it('refuse un taux hors bornes, et le dit', () => {
    const { erreurs } = texteVersGrille('10000 : 500')
    expect(erreurs[0]).toContain('entre 0 et 100')
  })

  it('refuse un seuil défini deux fois', () => {
    const { erreurs } = texteVersGrille('10000 : 5\n10000 : 7')
    expect(erreurs[0]).toContain('déjà défini')
  })

  it('SIGNALE une grille décroissante sans la refuser — c\'est son argent', () => {
    const { grille, erreurs } = texteVersGrille('10000 : 10\n50000 : 5')
    expect(grille.paliers).toHaveLength(2)
    expect(erreurs[0]).toContain('plus BAS')
  })

  it('fait l\'aller-retour sans rien perdre', () => {
    const { grille } = texteVersGrille(grilleVersTexte(GRILLE_MARTIGUES))
    expect(grille.paliers).toEqual(GRILLE_MARTIGUES.paliers)
  })

  it('une saisie vide donne une grille vide, pas une erreur', () => {
    expect(texteVersGrille('')).toEqual({ grille: { paliers: [] }, erreurs: [] })
  })
})

// ── Le calcul lui-même ──────────────────────────────────────────────────────
//
// La base « honoraires » est la seule des trois qui n'existait pas. Elle porte sur ce
// que l'AGENCE facture, pas sur les travaux : pour un dossier AMO, courtage + solde
// AMO ; pour un courtage, le courtage seul (règle dictée le 10/09).
const devisSigne = (id, ht, ttc, com) => ({
  id, statut: 'accepte', montant_ht: ht, montant_ttc: ttc, commission_pourcentage: com,
})

describe('commission apporteur sur les honoraires', () => {
  const dossierCourtage = {
    typologie: 'courtage',
    apporteur_actif: true,
    apporteur_pourcentage: 10,
    part_agente: 0,
    taux_courtage: 0.10,
    client: { apporteur_base: 'honoraires' },
    devis_artisans: [devisSigne('d1', 10000, 11000, 0.10)],
    suivi_financier: [],
  }

  it('porte sur les honoraires, PAS sur les travaux', () => {
    const r = calculateApporteurFinance(dossierCourtage)
    expect(r.mode).toBe('honoraires')
    // 10 % de 1 000 € d'honoraires = 100 €, et surtout PAS 10 % des 10 000 € de travaux.
    expect(r.totalHT).toBeCloseTo(100, 2)
    expect(r.totalHT).not.toBeCloseTo(1000, 2)
  })

  it('ne verse rien tant que l\'acompte n\'est pas débloqué', () => {
    // On ne reverse pas une commission sur des honoraires qu'on n'a pas encaissés.
    expect(calculateApporteurFinance(dossierCourtage).partsReel.agente
         + calculateApporteurFinance(dossierCourtage).partsReel.admin).toBeCloseTo(0, 2)
  })

  it('verse une fois l\'acompte débloqué', () => {
    const avec = { ...dossierCourtage, suivi_financier: [
      { type_echeance: 'acompte_artisan', devis_id: 'd1', statut_illico: 'recu' },
    ] }
    const r = calculateApporteurFinance(avec)
    expect(r.partsReel.agente + r.partsReel.admin).toBeCloseTo(100, 2)
  })

  it('reste à zéro tant que l\'apporteur n\'est pas activé sur le chantier', () => {
    const r = calculateApporteurFinance({ ...dossierCourtage, apporteur_actif: false })
    expect(r.enabled).toBe(false)
    expect(r.totalHT).toBe(0)
  })

  it('le taux du CHANTIER prime sur celui du client', () => {
    // Tout l'intérêt de la grille par paliers : le même apporteur, deux chantiers de
    // tailles différentes, deux taux.
    const r = calculateApporteurFinance({
      ...dossierCourtage,
      apporteur_pourcentage: 5,
      client: { apporteur_base: 'honoraires', apporteur_pourcentage: 10 },
    })
    expect(r.tauxApporteur).toBeCloseTo(0.05, 4)
  })

  it('retombe sur le taux du client quand le chantier n\'en porte pas', () => {
    const r = calculateApporteurFinance({
      ...dossierCourtage,
      apporteur_pourcentage: null,
      client: { apporteur_base: 'honoraires', apporteur_pourcentage: 7 },
    })
    expect(r.tauxApporteur).toBeCloseTo(0.07, 4)
  })
})

describe('les deux bases existantes ne bougent pas', () => {
  const base = {
    typologie: 'courtage', apporteur_actif: true, apporteur_pourcentage: 10,
    part_agente: 0, taux_courtage: 0.10,
    devis_artisans: [devisSigne('d1', 10000, 11000, 0.10)],
    suivi_financier: [],
  }

  it('« total chantier » reste un pourcentage des TRAVAUX', () => {
    const r = calculateApporteurFinance({ ...base, client: { apporteur_base: 'total_chantier' } })
    expect(r.mode).toBe('total_chantier_ht')
    expect(r.totalHT).toBeCloseTo(1000, 2)
  })

  it('une base absente reste « par devis » — 42 clients sont dans ce cas', () => {
    const r = calculateApporteurFinance({ ...base, client: {} })
    expect(r.mode).toBe('par_devis')
    expect(r.totalHT).toBeCloseTo(1000, 2)
  })
})
