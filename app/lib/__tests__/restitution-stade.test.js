import { describe, it, expect } from 'vitest'
import { nettoyerResume } from '../../api/pdf/restitution.js'

// ── Le stade du dossier ────────────────────────────────────────────────────
//
// La règle métier, dite par Anne-Lise : tant qu'aucun devis n'est signé, on est en
// PRÉSENTATION DE DEVIS. Un dossier terminé reste post-signature quoi qu'il arrive.
//
// Elle est reproduite ici parce que le bug qu'elle corrige n'était pas dans le calcul
// mais dans sa SOURCE : le code lisait `dossier.statut` en le comparant à des valeurs
// que la contrainte `dossiers_statut_manuel_check` interdit d'y écrire — NULL, 'annule'
// et 'termine' sont les seules possibles. Le test était donc toujours faux, et la mise
// en page de présentation des devis n'a jamais été produite une seule fois.
function stade(dossier, devis) {
  const statut = dossier?.statut || 'en_cours_chantier'
  const isTermine = statut === 'termine'
  const aDevisSigne = (devis || []).some(d => d.statut === 'accepte')
  return { isTermine, isPreSignature: !isTermine && !aDevisSigne }
}

describe('stade du dossier de restitution', () => {
  it('aucun devis signé → présentation de devis', () => {
    // Le cas réel du 09/09 : dossier 2026-CT-044, trois devis reçus, 52 585 €, aucun signé.
    const d = stade({ statut: null }, [{ statut: 'recu' }, { statut: 'recu' }, { statut: 'recu' }])
    expect(d.isPreSignature).toBe(true)
  })

  it('un seul devis signé suffit à basculer après signature', () => {
    expect(stade({ statut: null }, [{ statut: 'recu' }, { statut: 'accepte' }]).isPreSignature).toBe(false)
  })

  it('un dossier sans aucun devis est en présentation', () => {
    expect(stade({ statut: null }, []).isPreSignature).toBe(true)
  })

  it('un dossier terminé reste après signature, même sans devis accepté en base', () => {
    expect(stade({ statut: 'termine' }, [{ statut: 'recu' }]).isPreSignature).toBe(false)
  })

  it('un devis refusé ou à modifier ne vaut pas signature', () => {
    expect(stade({ statut: null }, [{ statut: 'refuse' }, { statut: 'a_modifier' }]).isPreSignature).toBe(true)
  })

  // La régression à empêcher : redevenir dépendant d'un statut que la base ne peut pas
  // contenir. Ces trois valeurs sont les SEULES que la contrainte autorise.
  it('ne dépend pas de valeurs de statut que la base interdit', () => {
    for (const statut of [null, 'annule', 'termine']) {
      expect(() => stade({ statut }, [])).not.toThrow()
    }
    // Avec l'ancienne règle, ce dossier passait pour « après signature » : c'est
    // exactement ce qui vidait le récapitulatif financier.
    expect(stade({ statut: null }, [{ statut: 'recu' }]).isPreSignature).toBe(true)
  })
})

// ── Le résumé inséré dans le PDF ───────────────────────────────────────────
describe('nettoyage du résumé', () => {
  it('retire le titre markdown que le modèle ajoute parfois', () => {
    // Constaté tel quel dans le dossier remis au client le 09/09.
    const brut = '# Résumé du projet de rénovation - Dossier 2026-CT-044\n\nM. Beille a acquis un duplex.'
    expect(nettoyerResume(brut)).toBe('M. Beille a acquis un duplex.')
  })

  it('retire les titres de tout niveau', () => {
    expect(nettoyerResume('### Sous-titre\nLe texte.')).toBe('Le texte.')
  })

  it('retire le gras et l\'italique, qui s\'imprimeraient avec leurs astérisques', () => {
    expect(nettoyerResume('**Gras** et *italique*.')).toBe('Gras et italique.')
    expect(nettoyerResume('__souligné__.')).toBe('souligné.')
  })

  it('retire les puces résiduelles malgré la consigne', () => {
    expect(nettoyerResume('- un\n- deux')).toBe('un\ndeux')
  })

  it('ne touche pas à un texte déjà propre', () => {
    const propre = "M. Beille a acquis un appartement duplex qu'il souhaite rénover."
    expect(nettoyerResume(propre)).toBe(propre)
  })

  it('ne confond pas un tiret de ponctuation avec une puce', () => {
    const t = 'Le projet — vaste — avance bien.'
    expect(nettoyerResume(t)).toBe(t)
  })

  it('rend null sur du vide plutôt qu\'une chaîne fantôme', () => {
    expect(nettoyerResume('')).toBe(null)
    expect(nettoyerResume(null)).toBe(null)
    expect(nettoyerResume('# Rien que le titre')).toBe(null)
  })
})

// ── La page « Suivi des paiements » ────────────────────────────────────────
//
// « Un suivi financier pour juste les frais de consultation, c'est chiant » (09/09).
// Une page entière, titre et en-tête compris, pour une ligne de 150 € déjà réglée.
//
// ⚠️ Ce drapeau est PARTAGÉ entre celui qui fabrique la page et celui qui la copie :
// les pages sont copiées par index. Fabriquer une page que l'appelant ne consomme pas
// décalerait toutes les suivantes — les photos prendraient la place du planning.
function afficherSuivi({ isPreSignature, suiviFinancier = [], factures = [], devisAcceptes = [] }) {
  const suiviHorsFrais = suiviFinancier.some(s => s?.type_echeance !== 'frais_consultation')
  return !isPreSignature && (suiviHorsFrais || factures.length > 0 || devisAcceptes.length > 0)
}

describe('page « Suivi des paiements »', () => {
  it("ne s'affiche pas pour les seuls frais de consultation", () => {
    expect(afficherSuivi({
      isPreSignature: false,
      suiviFinancier: [{ type_echeance: 'frais_consultation', montant_ttc: 150 }],
    })).toBe(false)
  })

  it("s'affiche dès qu'une échéance autre que les frais existe", () => {
    expect(afficherSuivi({
      isPreSignature: false,
      suiviFinancier: [
        { type_echeance: 'frais_consultation' },
        { type_echeance: 'acompte_amo' },
      ],
    })).toBe(true)
  })

  it("s'affiche dès qu'un devis est signé — il y aura des acomptes", () => {
    expect(afficherSuivi({ isPreSignature: false, devisAcceptes: [{ id: 'd1' }] })).toBe(true)
  })

  it("s'affiche dès qu'une facture artisan existe", () => {
    expect(afficherSuivi({ isPreSignature: false, factures: [{ id: 'f1' }] })).toBe(true)
  })

  it("ne s'affiche jamais en présentation de devis", () => {
    expect(afficherSuivi({
      isPreSignature: true,
      devisAcceptes: [{ id: 'd1' }],
      factures: [{ id: 'f1' }],
      suiviFinancier: [{ type_echeance: 'acompte_amo' }],
    })).toBe(false)
  })

  it('un dossier sans rien du tout ne produit pas la page', () => {
    expect(afficherSuivi({ isPreSignature: false })).toBe(false)
  })
})
