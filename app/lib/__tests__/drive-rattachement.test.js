import { describe, it, expect } from 'vitest'
import { deciderRattachement, segmentsApresRacine } from '../drive/rattachement.js'

// Chemins REELS observes dans drive_inbox (prefixe Graph complet, volontairement conserve :
// il varie selon le compte et ne doit jamais servir de repere).
const P = '/drives/59B2EBA7CDFE3599/root:/Illico Travaux/ANNELISE/01_CLIENTS'

const CANDIDATS = [
  { dossier: { id: 'barloy', statut: null, date_premier_rdv: '2026-06-09', created_at: '2026-06-22' },
    client: { nom: 'Barloy', nom2: 'Teppe ' }, suffixe: '' },
  { dossier: { id: 'epp', statut: 'termine', date_premier_rdv: '2025-10-21', created_at: '2026-04-16', date_fin_chantier: '2026-07-15' },
    client: { nom: 'Eppinger', nom2: 'Guerteau' }, suffixe: '' },
  { dossier: { id: 'ziat1', statut: null, date_premier_rdv: '2026-05-12', created_at: '2026-05-12T08:00:00Z' },
    client: { nom: 'ZIAT', nom2: 'Lefevre' }, suffixe: '' },
  { dossier: { id: 'ziat2', statut: null, date_premier_rdv: '2026-05-12', created_at: '2026-05-12T09:00:00Z' },
    client: { nom: 'ZIAT', nom2: 'Lefevre' }, suffixe: '_1' },
]
const ARTISANS = new Map([['MJ RENOVATION', 'a-mj'], ['BETATEC', 'a-beta']])
const decide = (chemin) => deciderRattachement(chemin, CANDIDATS, ARTISANS)

describe('segmentsApresRacine', () => {
  it("s'ancre sur 01_CLIENTS et ignore le prefixe du compte", () => {
    expect(segmentsApresRacine(`${P}/1. En cours/2026-06-09 BARLOY-TEPPE/2. Comptes rendus`))
      .toEqual(['1. En cours', '2026-06-09 BARLOY-TEPPE', '2. Comptes rendus'])
  })
  it('renvoie null hors de 01_CLIENTS', () => {
    expect(segmentsApresRacine('/drives/x/root:/ANNELISE/02_ARTISANS/BETATEC')).toBe(null)
  })
})

describe('deciderRattachement — ce qui se rattache tout seul', () => {
  it('un compte rendu : chantier + categorie', () => {
    expect(decide(`${P}/1. En cours/2026-06-09 BARLOY-TEPPE/2. Comptes rendus`))
      .toEqual({ dossier_id: 'barloy', categorie: 'compte_rendu', artisan_id: null })
  })

  it('un chantier TERMINE, dont le bucket porte une annee differente de la date du nom', () => {
    // Nom = 1er RDV (2025), bucket = annee de fin de chantier (2026). Les deux doivent coller.
    expect(decide(`${P}/2. Terminés/2026/2025-10-21 EPPINGER-GUERTEAU/1. Administratif`))
      .toEqual({ dossier_id: 'epp', categorie: 'administratif', artisan_id: null })
  })

  it("une facture d'artisan connu : l'artisan est resolu depuis le nom du dossier", () => {
    expect(decide(`${P}/1. En cours/2026-06-09 BARLOY-TEPPE/4. Documents artisans/MJ RENOVATION/Factures`))
      .toEqual({ dossier_id: 'barloy', categorie: null, artisan_id: 'a-mj' })
  })

  it('un fichier a la racine du chantier : chantier connu, nature inconnue', () => {
    expect(decide(`${P}/1. En cours/2026-06-09 BARLOY-TEPPE`))
      .toEqual({ dossier_id: 'barloy', categorie: null, artisan_id: null })
  })

  it('le suffixe anti-collision distingue bien les deux chantiers ZIAT', () => {
    expect(decide(`${P}/1. En cours/2026-05-12 ZIAT-LEFEVRE/1. Administratif`).dossier_id).toBe('ziat1')
    expect(decide(`${P}/1. En cours/2026-05-12 ZIAT-LEFEVRE_1/1. Administratif`).dossier_id).toBe('ziat2')
  })
})

describe('deciderRattachement — ce qui reste a la main (le plus important)', () => {
  it('un artisan inconnu ne se devine pas', () => {
    expect(decide(`${P}/1. En cours/2026-06-09 BARLOY-TEPPE/4. Documents artisans/PLOMBIER X/Factures`).dossier_id)
      .toBeUndefined()
  })

  it("un devis n'est pas un document de chantier : jamais automatique", () => {
    expect(decide(`${P}/1. En cours/2026-06-09 BARLOY-TEPPE/3. Devis/2. Presentes`).raison)
      .toBe('dossier_manuel:3. Devis')
  })

  it('une photo va dans la table photos, pas dans les documents', () => {
    expect(decide(`${P}/1. En cours/2026-06-09 BARLOY-TEPPE/6. Photos/1. Avant`).raison)
      .toBe('dossier_manuel:6. Photos')
  })

  it('un fichier range dans le MAUVAIS bucket ne se rattache pas', () => {
    // EPPINGER est termine : le trouver sous « 1. En cours » veut dire que quelque chose
    // ne va pas. On ne rattache pas, on laisse voir.
    expect(decide(`${P}/1. En cours/2025-10-21 EPPINGER-GUERTEAU/1. Administratif`).dossier_id)
      .toBeUndefined()
  })

  it('un chantier inconnu ne se rattache pas', () => {
    expect(decide(`${P}/1. En cours/2026-01-01 INCONNU/1. Administratif`).raison)
      .toBe('aucun_chantier_correspondant')
  })

  it('un fichier hors de 01_CLIENTS ne se rattache pas', () => {
    expect(decide('/drives/x/root:/ANNELISE/02_ARTISANS/BETATEC').raison).toBe('hors_01_CLIENTS')
  })

  it('aucun candidat : rien ne se rattache', () => {
    expect(deciderRattachement(`${P}/1. En cours/2026-06-09 BARLOY-TEPPE/2. Comptes rendus`, [], ARTISANS).raison)
      .toBe('aucun_chantier_correspondant')
  })
})
