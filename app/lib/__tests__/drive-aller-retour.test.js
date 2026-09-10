import { describe, it, expect } from 'vitest'
import {
  CATEGORIES_DOCUMENT, CATEGORIES_PHOTO,
  cheminChantier, cheminChantierPhoto,
} from '../drive/taxonomie.js'
import { deciderRattachement } from '../drive/rattachement.js'

// ═══════════════════════════════════════════════════════════════════════════════════════
// L'ALLER-RETOUR : ce que l'appli ÉCRIT dans le Drive, sait-elle le RELIRE ?
//
// POURQUOI CE FICHIER EXISTE
//
// Le 10/09, trois défauts de relecture ont été trouvés l'un après l'autre, à la main, par
// l'utilisatrice :
//   · les photos rangées dans « 6. Photos » n'avaient aucune destination ;
//   · une facture rangée dans « <Artisan>/Factures » arrivait en « Autres » ;
//   · une maquette rangée dans « 5. Plans & techniques/maquette » était relue comme un plan.
// Trois fois le MÊME défaut : l'écriture crée un niveau de dossier, la relecture l'ignore.
// Et trois fois, c'est un humain qui l'a vu, pas le code.
//
// Ce test rend ce défaut impossible à commettre en silence. Il traite l'écriture et la
// lecture comme ce qu'elles sont — une fonction et sa réciproque — et exige que la
// composition des deux soit l'identité, ou que la perte soit DÉCLARÉE ici, avec sa raison.
//
// Le second test, celui qui compte le plus, vérifie que le tableau ci-dessous couvre
// TOUTES les catégories connues de la taxonomie. Ajouter une catégorie d'écriture sans
// décider de sa relecture fait échouer la suite. On ne peut plus oublier : on peut
// seulement décider, et l'écrire.
// ═══════════════════════════════════════════════════════════════════════════════════════

const DOSSIER = { id: 'd1', statut: null, date_premier_rdv: '2026-06-09', created_at: '2026-06-22' }
const CLIENT = { nom: 'Barloy', nom2: 'Teppe' }
const CANDIDATS = [{ dossier: DOSSIER, client: CLIENT, suffixe: '' }]
const ARTISAN = 'MJ RENOVATION'
const ARTISANS = new Map([[ARTISAN, 'a-mj']])
const PREFIXE = '/drives/59B2EBA7CDFE3599/root:/Illico Travaux/ANNELISE/'

// Le chemin Graph d'un fichier écrit par l'appli, tel que le poller le verra.
const cheminEcrit = (segments) => PREFIXE + segments.join('/')

// ── Ce que la relecture doit rendre, catégorie par catégorie ──────────────────────────
//
// `attendu` = la catégorie que le rattachement doit retrouver.
// `perte`   = présent UNIQUEMENT quand la relecture NE PEUT PAS être exacte, avec la
//             raison. Une perte n'est pas un bug tant qu'elle est un choix assumé — mais
//             elle doit être écrite ici pour rester un choix, et non un oubli.
const DOCUMENTS = [
  { categorie: 'compte_rendu', attendu: 'compte_rendu' },
  { categorie: 'administratif', attendu: 'administratif' },
  { categorie: 'plans', attendu: 'plans' },
  { categorie: 'facture_artisan', attendu: 'facture_artisan', artisan: true },
  { categorie: 'autre_artisan', attendu: 'autre_artisan', artisan: true },

  // ── Pertes assumées ────────────────────────────────────────────────────────────────
  // Elles ont toutes la même cause : PLUSIEURS catégories écrivent dans le MÊME dossier.
  // Aucune relecture ne peut les distinguer — l'information est perdue au rangement, pas
  // à la lecture. Les corriger demanderait de créer des sous-dossiers dans le Drive, ce
  // qui est une décision d'organisation, pas une décision technique.
  { categorie: 'facture_honoraire', attendu: 'administratif',
    perte: 'écrit dans « 1. Administratif », comme administratif' },
  { categorie: 'estimation', attendu: 'plans',
    perte: 'écrit dans « 5. Plans & techniques », comme plans et fiche_technique' },
  { categorie: 'fiche_technique', attendu: 'plans',
    perte: 'écrit dans « 5. Plans & techniques », comme plans et estimation' },
  { categorie: 'attestation_demarrage', attendu: null, artisan: true,
    perte: 'écrit à la racine de l\'artisan, comme 4 autres catégories' },
  { categorie: 'deblocage_acompte', attendu: null, artisan: true,
    perte: 'écrit à la racine de l\'artisan, comme 4 autres catégories' },
  { categorie: 'avis_virement', attendu: null, artisan: true,
    perte: 'écrit à la racine de l\'artisan, comme 4 autres catégories' },
  { categorie: 'pv_reception', attendu: null, artisan: true,
    perte: 'écrit à la racine de l\'artisan, comme 4 autres catégories' },
  { categorie: 'attestation_chantier', attendu: null, artisan: true,
    perte: 'écrit à la racine de l\'artisan, comme 4 autres catégories' },
]

const PHOTOS = [
  { categorie: 'avant', attendu: 'avant' },
  { categorie: 'pendant', attendu: 'pendant' },
  { categorie: 'apres', attendu: 'apres' },
  // La maquette n'est pas rangée dans « 6. Photos » mais dans « 5. Plans & techniques »
  // (arbitrage du 02/09). Elle se relit quand même : le sous-dossier s'appelle « maquette ».
  { categorie: 'maquette', attendu: 'maquette' },
]

describe('aller-retour DOCUMENTS : écrire puis relire', () => {
  for (const cas of DOCUMENTS) {
    const nom = cas.perte
      ? `${cas.categorie} → « ${cas.attendu ?? 'Autres'} » (perte assumée : ${cas.perte})`
      : `${cas.categorie} se relit à l'identique`
    it(nom, () => {
      const segments = cheminChantier(
        DOSSIER.statut, DOSSIER.date_premier_rdv, CLIENT.nom, cas.categorie,
        cas.artisan ? ARTISAN : null, { nom2: CLIENT.nom2, suffixe: '' },
      )
      const decision = deciderRattachement(cheminEcrit(segments), CANDIDATS, ARTISANS, 'doc.pdf')

      expect(decision.destination, `« ${cas.categorie} » n'est plus rattaché du tout`).toBe('documents')
      expect(decision.dossier_id).toBe('d1')
      expect(decision.categorie).toBe(cas.attendu)
      // Un document d'artisan sans artisan_id est invisible dans la fiche chantier : la
      // section « Documents artisans » ne montre que ceux qui en ont un.
      if (cas.artisan) expect(decision.artisan_id, 'artisan perdu en route').toBe('a-mj')
    })
  }
})

describe('aller-retour PHOTOS : écrire puis relire', () => {
  for (const cas of PHOTOS) {
    it(`${cas.categorie} se relit à l'identique`, () => {
      const segments = cheminChantierPhoto(
        DOSSIER.statut, DOSSIER.date_premier_rdv, CLIENT.nom, cas.categorie,
        { nom2: CLIENT.nom2, suffixe: '' },
      )
      const decision = deciderRattachement(cheminEcrit(segments), CANDIDATS, ARTISANS, 'photo.jpg')
      expect(decision.destination, `« ${cas.categorie} » n'atterrit pas dans la table photos`).toBe('photos')
      expect(decision.categorie_photo).toBe(cas.attendu)
    })
  }
})

// ── LE test : la couverture ────────────────────────────────────────────────────────────
//
// Celui-ci ne vérifie pas un comportement, il vérifie qu'on n'a rien oublié. C'est le seul
// qui aurait attrapé les trois défauts du 10/09 SANS qu'on ait eu l'idée de les chercher.
describe('couverture : aucune catégorie ne peut être ajoutée sans décider de sa relecture', () => {
  it('toutes les catégories de document sont couvertes', () => {
    const couvertes = DOCUMENTS.map(c => c.categorie).sort()
    const attendues = [...CATEGORIES_DOCUMENT].sort()
    // Message explicite : si ça casse, c'est qu'une catégorie a été ajoutée à l'écriture
    // sans qu'on dise ce que la lecture doit en faire. Ajoute-la ci-dessus — avec `attendu`
    // si elle se relit, avec `perte` et sa raison si elle ne le peut pas.
    expect(couvertes).toEqual(attendues)
  })

  it('toutes les catégories de photo sont couvertes', () => {
    expect(PHOTOS.map(c => c.categorie).sort()).toEqual([...CATEGORIES_PHOTO].sort())
  })

  it('les pertes sont NOMMÉES, jamais silencieuses', () => {
    // Une catégorie relue autrement qu'à l'identique doit porter une explication. Sans
    // cette règle, il suffirait d'aligner `attendu` sur le comportement observé pour faire
    // taire le test — ce qui est exactement la façon de transformer un bug en « normal ».
    for (const cas of DOCUMENTS) {
      if (cas.attendu !== cas.categorie) {
        expect(cas.perte, `« ${cas.categorie} » n'est pas relu à l'identique et ne dit pas pourquoi`).toBeTruthy()
      }
    }
  })
})
