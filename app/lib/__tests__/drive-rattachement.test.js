import { describe, it, expect } from 'vitest'
import {
  deciderRattachement, segmentsApresRacine,
  categoriePhotoDepuisDossier, estImage,
} from '../drive/rattachement.js'

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
const decide = (chemin, nom = 'document.pdf') => deciderRattachement(chemin, CANDIDATS, ARTISANS, nom)

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
      .toEqual({ destination: 'documents', dossier_id: 'barloy', categorie: 'compte_rendu', artisan_id: null })
  })

  it('un chantier TERMINE, dont le bucket porte une annee differente de la date du nom', () => {
    // Nom = 1er RDV (2025), bucket = annee de fin de chantier (2026). Les deux doivent coller.
    expect(decide(`${P}/2. Terminés/2026/2025-10-21 EPPINGER-GUERTEAU/1. Administratif`))
      .toEqual({ destination: 'documents', dossier_id: 'epp', categorie: 'administratif', artisan_id: null })
  })

  it("une facture d'artisan : l'artisan ET la nature sont lus dans le chemin", () => {
    // « on n'a pas fait tous les dossiers pour rien » : le 3e niveau porte la categorie.
    // La ranger en « Autres » alors que le Drive l'avait classee, c'est relire la taxonomie
    // a moitie.
    expect(decide(`${P}/1. En cours/2026-06-09 BARLOY-TEPPE/4. Documents artisans/MJ RENOVATION/Factures`))
      .toEqual({ destination: 'documents', dossier_id: 'barloy', categorie: 'facture_artisan', artisan_id: 'a-mj' })
    expect(decide(`${P}/1. En cours/2026-06-09 BARLOY-TEPPE/4. Documents artisans/MJ RENOVATION/Autre`))
      .toEqual({ destination: 'documents', dossier_id: 'barloy', categorie: 'autre_artisan', artisan_id: 'a-mj' })
  })

  it("a la RACINE de l'artisan, la nature reste indecidable — et on ne l'invente pas", () => {
    // Cinq categories ecrivent a cet endroit (attestation de demarrage, deblocage d'acompte,
    // avis de virement, PV de reception, attestation de fin) : le dossier ne les distingue
    // pas, donc le rattachement non plus. L'artisan, lui, est certain.
    expect(decide(`${P}/1. En cours/2026-06-09 BARLOY-TEPPE/4. Documents artisans/MJ RENOVATION`))
      .toEqual({ destination: 'documents', dossier_id: 'barloy', categorie: null, artisan_id: 'a-mj' })
  })

  it('un fichier a la racine du chantier : chantier connu, nature inconnue', () => {
    expect(decide(`${P}/1. En cours/2026-06-09 BARLOY-TEPPE`))
      .toEqual({ destination: 'documents', dossier_id: 'barloy', categorie: null, artisan_id: null })
  })

  it('le suffixe anti-collision distingue bien les deux chantiers ZIAT', () => {
    expect(decide(`${P}/1. En cours/2026-05-12 ZIAT-LEFEVRE/1. Administratif`).dossier_id).toBe('ziat1')
    expect(decide(`${P}/1. En cours/2026-05-12 ZIAT-LEFEVRE_1/1. Administratif`).dossier_id).toBe('ziat2')
  })
})

// ── La destination : la logique qui manquait ────────────────────────────────────────────
//
// « Normalement ca doit rattacher automatiquement quand c'est bien range. » C'etait vrai des
// comptes rendus, faux des photos : le rattachement n'avait qu'une table d'arrivee. Une photo
// rangee dans « 6. Photos/1. Avant » designe pourtant un chantier ET une categorie de prise de
// vue, aussi surement qu'un CR designe sa categorie de document.
describe('deciderRattachement — les photos vont dans la table photos', () => {
  it('lit la categorie de prise de vue depuis le sous-dossier', () => {
    expect(decide(`${P}/1. En cours/2026-06-09 BARLOY-TEPPE/6. Photos/1. Avant`, 'IMG_0104.jpeg'))
      .toEqual({ destination: 'photos', dossier_id: 'barloy', categorie_photo: 'avant' })
    expect(decide(`${P}/1. En cours/2026-06-09 BARLOY-TEPPE/6. Photos/2. Pendant`, 'a.jpg').categorie_photo).toBe('pendant')
    expect(decide(`${P}/1. En cours/2026-06-09 BARLOY-TEPPE/6. Photos/3. Apres`, 'a.jpg').categorie_photo).toBe('apres')
  })

  it('accepte les dossiers ranges A LA MAIN, pas seulement ceux que l\'appli ecrit', () => {
    // Le Drive reel du 10/09 : « AVANT » (39 fichiers), « _1. Avant » (38), « _2. Pendant » (3).
    // Exiger le libelle exact laisserait 80 photos de cote pour une majuscule et un underscore.
    expect(decide(`${P}/1. En cours/2026-06-09 BARLOY-TEPPE/6. Photos/AVANT`, 'a.jpg').categorie_photo).toBe('avant')
    expect(decide(`${P}/1. En cours/2026-06-09 BARLOY-TEPPE/6. Photos/_1. Avant`, 'a.jpg').categorie_photo).toBe('avant')
    expect(decide(`${P}/1. En cours/2026-06-09 BARLOY-TEPPE/6. Photos/_2. Pendant`, 'a.jpg').categorie_photo).toBe('pendant')
    expect(decide(`${P}/1. En cours/2026-06-09 BARLOY-TEPPE/6. Photos/3. Après`, 'a.jpg').categorie_photo).toBe('apres')
  })

  it('une MAQUETTE est une photo, meme rangee dans « 5. Plans & techniques »', () => {
    // Le Drive contient bien un sous-dossier « maquette » : le classement etait fait, c'est
    // la relecture qui l'ignorait et les rangeait en documents « plans ».
    expect(decide(`${P}/1. En cours/2026-06-09 BARLOY-TEPPE/5. Plans & techniques/maquette`, 'vue3d.jpg'))
      .toEqual({ destination: 'photos', dossier_id: 'barloy', categorie_photo: 'maquette' })
    expect(decide(`${P}/1. En cours/2026-06-09 BARLOY-TEPPE/5. Plans & techniques/Maquettes`, 'a.png').categorie_photo)
      .toBe('maquette')
  })

  it('un PDF dans le dossier maquette reste un DOCUMENT', () => {
    // La table photos n'affiche pas un PDF. Mieux vaut un plan bien rangé qu'une photo
    // fantome dans la galerie.
    expect(decide(`${P}/1. En cours/2026-06-09 BARLOY-TEPPE/5. Plans & techniques/maquette`, 'plan.pdf'))
      .toEqual({ destination: 'documents', dossier_id: 'barloy', categorie: 'plans', artisan_id: null })
  })

  it('les sous-dossiers libres sous « 5. Plans & techniques » restent des plans', () => {
    // « sdb wc », « Plan cuisine », « LAPEYRE », « moodboard »… : elle range par piece ou par
    // fournisseur. Aucune categorie de l'appli ne leur correspond, et c'est tres bien : le
    // niveau 1 suffit a decider, le niveau 2 est son organisation a elle.
    expect(decide(`${P}/1. En cours/2026-06-09 BARLOY-TEPPE/5. Plans & techniques/sdb wc`, 'a.jpg').categorie).toBe('plans')
    expect(decide(`${P}/1. En cours/2026-06-09 BARLOY-TEPPE/5. Plans & techniques/moodboard`, 'a.jpg').categorie).toBe('plans')
    expect(decide(`${P}/1. En cours/2026-06-09 BARLOY-TEPPE/1. Administratif/PLU_ABF_CADASTRE`, 'a.pdf').categorie).toBe('administratif')
  })

  it('ne DEVINE pas la categorie : une photo sans categorie reste a la main', () => {
    // 175 photos sont posees a la racine de « 6. Photos ». Les classer en « Avant » par
    // defaut fausserait le dossier de restitution du client, sans que ca se voie.
    const d = decide(`${P}/1. En cours/2026-06-09 BARLOY-TEPPE/6. Photos`, 'a.jpg')
    expect(d.destination).toBeUndefined()
    expect(d.raison).toBe('categorie_photo_inconnue')
    expect(d.aLister).toBe(true)
  })

  it('n\'importe pas les videos automatiquement', () => {
    // Un mp4 de plusieurs centaines de Mo dans une fonction serverless, c'est un timeout.
    const d = decide(`${P}/1. En cours/2026-06-09 BARLOY-TEPPE/6. Photos/1. Avant`, 'chantier.mp4')
    expect(d.raison).toBe('media_non_image')
    expect(d.aLister).toBe(true)
  })

  it('reconnait les formats d\'images du terrain', () => {
    expect(estImage('IMG_0104.jpeg')).toBe(true)
    expect(estImage('photo.HEIC')).toBe(true)
    expect(estImage('plan.pdf')).toBe(false)
    expect(estImage('visite.mp4')).toBe(false)
  })

  it('categoriePhotoDepuisDossier ne dit oui que sur un mot reconnu', () => {
    expect(categoriePhotoDepuisDossier('4. Autres')).toBe(null)
    expect(categoriePhotoDepuisDossier('')).toBe(null)
    expect(categoriePhotoDepuisDossier(undefined)).toBe(null)
    expect(categoriePhotoDepuisDossier('avant travaux')).toBe('avant')
  })
})

// ── Le perimetre : ce qui n'entre plus dans la liste ────────────────────────────────────
//
// 1294 lignes le 10/09, dont 85 % qu'aucun clic humain ne pouvait finir. `aLister:false`
// signifie « ce n'est pas une tache », pas « ce fichier n'a pas d'importance ».
describe('deciderRattachement — ce qui ne doit meme pas etre liste', () => {
  it('hors 01_CLIENTS : 02_ARTISANS, 04_COMM… (612 lignes le 10/09)', () => {
    const d = decide('/drives/x/root:/ANNELISE/02_ARTISANS/BETATEC/Documents administratif', 'Kbis.pdf')
    expect(d.raison).toBe('hors_01_CLIENTS')
    expect(d.aLister).toBe(false)
  })

  it("un devis n'est pas un document de chantier : il a sa table et son circuit", () => {
    const d = decide(`${P}/1. En cours/2026-06-09 BARLOY-TEPPE/3. Devis/2. Presentes`, 'devis.pdf')
    expect(d.raison).toBe('hors_perimetre:3. Devis')
    expect(d.aLister).toBe(false)
  })

  it("« 7. Echanges » est un dossier de travail : l'appli n'y ecrit ni n'y lit", () => {
    expect(decide(`${P}/1. En cours/2026-06-09 BARLOY-TEPPE/7. Echanges`, 'x.pdf').aLister).toBe(false)
  })

  it('un dossier de rangement (_A_TRIER, _MODELE…) dit lui-meme qu\'il n\'est pas range', () => {
    expect(decide(`${P}/_A_RECLASSER`, 'x.pdf').aLister).toBe(false)
    expect(decide(`${P}/_MODELE DOSSIER CLIENT/1. Administratif`, 'x.pdf').aLister).toBe(false)
    expect(decide(`${P}/1. En cours/2026-06-09 BARLOY-TEPPE/_A_RECLASSER`, 'x.pdf').aLister).toBe(false)
  })
})

describe('deciderRattachement — ce qui reste a la main (le plus important)', () => {
  it('un artisan inconnu ne se devine pas', () => {
    const d = decide(`${P}/1. En cours/2026-06-09 BARLOY-TEPPE/4. Documents artisans/PLOMBIER X/Factures`)
    expect(d.destination).toBeUndefined()
    expect(d.aLister).toBe(true)
  })

  it('un fichier range dans le MAUVAIS bucket ne se rattache pas', () => {
    // EPPINGER est termine : le trouver sous « 1. En cours » veut dire que quelque chose
    // ne va pas. On ne rattache pas, on laisse voir.
    expect(decide(`${P}/1. En cours/2025-10-21 EPPINGER-GUERTEAU/1. Administratif`).destination)
      .toBeUndefined()
  })

  it('un chantier inconnu ne se rattache pas, et reste visible', () => {
    // Cas reel : NIVAGGIOLI, VICIDOMINI, KEOLIS… ranges dans le Drive, absents de BATILIS.
    // C'est justement ce qu'il faut montrer — c'est le chantier qui manque, pas le fichier.
    const d = decide(`${P}/1. En cours/2026-01-01 INCONNU/1. Administratif`)
    expect(d.raison).toBe('aucun_chantier_correspondant')
    expect(d.aLister).toBe(true)
  })

  it('un sous-dossier inconnu reste visible', () => {
    // Cas reel : « skp Carmona » (108 fichiers). On ne sait pas quoi en faire — elle, si.
    const d = decide(`${P}/1. En cours/2026-06-09 BARLOY-TEPPE/skp Machin`)
    expect(d.raison).toBe('sous_dossier_inconnu:skp Machin')
    expect(d.aLister).toBe(true)
  })

  it('aucun candidat : rien ne se rattache', () => {
    expect(deciderRattachement(`${P}/1. En cours/2026-06-09 BARLOY-TEPPE/2. Comptes rendus`, [], ARTISANS).raison)
      .toBe('aucun_chantier_correspondant')
  })
})
