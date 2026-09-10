// app/lib/drive/rattachement.js
// RATTACHEMENT AUTOMATIQUE des fichiers deposes a la main dans le Drive.
//
// Le principe : la taxonomie qui ECRIT les dossiers est deterministe, donc elle se lit a
// l'envers. Un fichier depose dans
//   .../01_CLIENTS/1. En cours/2026-06-09 BARLOY-TEPPE/2. Comptes rendus/
// designe sans ambiguite un chantier et une categorie. Plutot que de RE-PARSER le nom du
// dossier (date, patronymes, suffixe — trois regles a maintenir en double), on recalcule le
// nom attendu de CHAQUE chantier avec les memes fonctions que celles qui l'ecrivent, et on
// compare. Le jour ou la taxonomie change, la lecture suit toute seule.
//
// REGLE D'OR : on ne rattache QUE sur correspondance unique et exacte. Le moindre doute —
// deux chantiers possibles, un sous-dossier inconnu — laisse le fichier dans la liste
// « a rattacher » pour decision humaine. Un mauvais rattachement automatique est bien pire
// qu'un rattachement manquant : il est invisible.
//
// ---------------------------------------------------------------------------------------
// CE QUI A CHANGE LE 10/09, ET POURQUOI (1294 fichiers « a rattacher »)
//
// La liste « a rattacher » avait deverse 1294 lignes d'un coup. Mesure faite avant tout
// changement : 612 hors 01_CLIENTS (02_ARTISANS, 04_COMM, brouillons de rangement), 489
// dans des sous-dossiers que ce fichier refusait DEJA de rattacher, 193 reellement en
// attente. Autrement dit, 85 % de la liste etait du travail qu'aucun clic humain ne pouvait
// finir — parce que le rattachement n'avait qu'UNE destination, `chantier_documents`,
// alors que le Drive range QUATRE natures de fichiers.
//
// Deux corrections de fond, plutot que de masquer la liste :
//
// 1. PERIMETRE. Un fichier hors 01_CLIENTS, ou dans un dossier que l'appli n'ecrit ni ne
//    lit ('7. Echanges', brouillons '_…'), n'entre plus dans la liste — `aLister:false`.
//    Ce n'est pas « ignorer un probleme » : c'est cesser d'appeler « tache » ce qui n'en
//    est pas une. Le fichier reste evidemment intact dans le Drive.
//
// 2. DESTINATION. La decision porte desormais une `destination` :
//      'documents' → chantier_documents (comme avant)
//      'photos'    → table photos, avec la categorie de prise de vue lue du sous-dossier
//    « Normalement ca doit rattacher automatiquement quand c'est bien range » : c'etait
//    vrai pour les comptes rendus et faux pour les photos, faute de table d'arrivee.
//    Mesure du 10/09 : sur 362 photos listees, AUCUNE ne portait le nom que l'appli ecrit
//    quand elle pousse une photo (<client>_<categorie>_<n>.jpg) — ce ne sont donc pas des
//    echos, ce sont ses photos de terrain, absentes de l'appli.
//
// CE QU'ON NE FAIT TOUJOURS PAS, ET C'EST DELIBERE : les devis. Un devis porte un artisan,
// un HT, un TTC, une commission. Le creer depuis un PDF, c'est inventer des donnees
// financieres qui ne se verront pas. « 3. Devis » sort donc de la liste sans y entrer par
// une autre porte : le jour ou l'on voudra creer un devis depuis un fichier depose, ce sera
// une fonction a part, avec extraction et validation humaine.

import { RACINE_CLIENTS, nomDossierChantier, bucketSegments, nettoyerSegment } from './taxonomie'

// Decoupe un parent_path Graph en segments, en ignorant tout ce qui precede 01_CLIENTS.
// Le prefixe varie (/drives/<id>/root:/Illico Travaux/ANNELISE/...) et n'a rien a nous
// apprendre : on s'ancre sur la racine metier, pas sur l'emplacement du compte.
export function segmentsApresRacine(parentPath) {
  const brut = String(parentPath || '').split('/').map(s => s.trim()).filter(Boolean)
  const i = brut.lastIndexOf(RACINE_CLIENTS)
  return i === -1 ? null : brut.slice(i + 1)
}

// Sous-dossier -> categorie de chantier_documents. On ne couvre QUE les cas ou le dossier
// designe la nature du document sans ambiguite.
const CATEGORIE_PAR_DOSSIER = {
  '1. Administratif': 'administratif',
  '2. Comptes rendus': 'compte_rendu',
  '5. Plans & techniques': 'plans',
}

// 3e niveau sous « 4. Documents artisans/<Artisan>/ ». Ces deux dossiers-là sont écrits par
// une catégorie et une seule (cf. sousDossiers), donc ils se relisent sans ambiguïté.
const CATEGORIE_PAR_DOSSIER_ARTISAN = {
  'Factures': 'facture_artisan',
  'Autre': 'autre_artisan',
}

// Sous-dossiers dont l'appli n'est PAS la destination, et qui n'ont donc rien a faire dans
// une liste de taches :
//   '3. Devis'                 : table devis_artisans, circuit propre (cf. en-tete).
//   '7. Echanges'              : dossier de travail manuel, l'appli n'y ecrit jamais.
//   "8. Apporteur d'affaires"  : idem.
const HORS_PERIMETRE = new Set(['3. Devis', '7. Echanges', "8. Apporteur d'affaires"])

// Le dossier photos, qui a MAINTENANT une destination (table photos).
const DOSSIER_PHOTOS = '6. Photos'

// Extensions traitees comme images. Les VIDEOS (mp4, mov…) ne sont pas importees
// automatiquement : un fichier de plusieurs centaines de Mo dans une fonction serverless,
// c'est un timeout au mieux. Elles restent listees pour un geste humain — elles sont 15.
const EXT_IMAGE = new Set(['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'gif', 'bmp', 'tif', 'tiff'])

export function estImage(nomFichier) {
  const ext = String(nomFichier || '').split('.').pop().toLowerCase()
  return EXT_IMAGE.has(ext)
}

// Categorie de prise de vue depuis le NOM DU DOSSIER, tolerante a la realite du terrain.
//
// La taxonomie ecrit « 1. Avant / 2. Pendant / 3. Apres ». Le Drive reel, lui, contient
// aussi « AVANT » (39 fichiers), « _1. Avant » (38), « _2. Pendant » (3) : des dossiers
// crees a la main, avant que l'appli n'existe ou pendant un rangement. Exiger le libelle
// exact laisserait 80 fichiers de cote pour une majuscule et un underscore. On enleve donc
// le prefixe de numerotation, les underscores et les accents, puis on lit le mot.
//
// On ne devine RIEN au-dela : un dossier photo sans categorie lisible (ou une photo posee
// a la racine de « 6. Photos ») reste a la main. Classer 175 photos en « Avant » par
// defaut fausserait le dossier de restitution du client, silencieusement.
export function categoriePhotoDepuisDossier(segment) {
  const s = String(segment || '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/^[_\s]*\d+\s*[.)\-]?\s*/, '')   // « _1. » , « 3. » , « 2) »
    .replace(/^[_\s]+/, '')
    .trim()
  if (s.startsWith('avant')) return 'avant'
  if (s.startsWith('pendant')) return 'pendant'
  if (s.startsWith('apres')) return 'apres'
  return null
}

// Nom de dossier attendu pour un chantier, avec les MEMES fonctions que celles qui l'ecrivent.
export function nomAttendu(dossier, client, suffixe) {
  return nettoyerSegment(nomDossierChantier(
    dossier.date_premier_rdv || dossier.created_at,
    client?.nom, client?.nom2, suffixe,
  ))
}

// Segments de bucket attendus ('1. En cours' | '2. Terminés',<annee> | '3. Sans suite',<annee>).
export function bucketAttendu(dossier) {
  // MEME cascade que les routes qui ecrivent : cloture d'abord, puis fin de chantier, puis
  // date metier. Si la lecture et l'ecriture divergent ici, un fichier range au bon endroit
  // ne serait plus reconnu — c'est tout l'interet de passer par bucketSegments.
  return bucketSegments(dossier.statut, {
    dateCloture: dossier.date_cloture || null,
    dateFin: dossier.date_fin_chantier || null,
    createdAt: dossier.date_premier_rdv || dossier.created_at,
  }).map(nettoyerSegment)
}

// Refus : `aLister` dit si un humain peut encore en faire quelque chose. false = le fichier
// ne rentre meme pas dans la liste (rien a decider), true = decision humaine possible.
const refus = (raison, aLister = true) => ({ raison, aLister })

// PUR. Decide du sort d'un fichier a partir de son chemin, de son nom, et des chantiers connus.
//   parentPath     : drive_inbox.parent_path
//   candidats      : [{ dossier, client, suffixe }] — TOUS les chantiers de la referente
//   artisansParNom : Map nom d'entreprise nettoye -> artisan_id (peut etre vide)
//   nomFichier     : drive_inbox.name — sert a distinguer image / video dans « 6. Photos »
//
// Renvoie soit une destination sure :
//   { destination:'documents', dossier_id, categorie, artisan_id }
//   { destination:'photos',    dossier_id, categorie_photo }
// soit un refus { raison, aLister }.
export function deciderRattachement(parentPath, candidats, artisansParNom = new Map(), nomFichier = null) {
  const seg = segmentsApresRacine(parentPath)
  // Hors 01_CLIENTS : 02_ARTISANS, 04_COMM, brouillons de rangement… Le rattachement ne sait
  // pas ecrire ailleurs que sur un chantier ; 612 lignes venaient de la.
  if (!seg) return refus('hors_01_CLIENTS', false)
  // Brouillons de rangement (_A_TRIER, _A_SUPPRIMER, _MODELE DOSSIER CLIENT…) : le dossier
  // dit lui-meme que son contenu n'est pas range. Rien a rattacher tant qu'il ne l'est pas.
  //
  // L'underscore suivi d'un CHIFFRE est exclu de cette regle, et ce n'est pas une subtilite
  // gratuite : le Drive reel contient « _1. Avant » (38 photos) et « _2. Pendant » (3), des
  // sous-dossiers photo renommes a la main. Le meme caractere sert donc a deux intentions
  // opposees — « pas range » d'un cote, « range, avec une coquille » de l'autre. Le chiffre
  // les separe : un brouillon ne se numerote pas.
  if (seg.some(s => /^_(?!\d)/.test(s))) return refus('dossier_de_rangement', false)
  if (seg.length < 2) return refus('chemin_trop_court', false)

  // Le nom du chantier est le segment qui suit le bucket ; le bucket fait 1 ou 2 segments
  // ('2. Terminés' et '3. Sans suite' portent une annee). On essaie les deux longueurs et on
  // exige la coherence avec le bucket attendu du chantier trouve — sinon un fichier range
  // dans le mauvais bucket serait rattache quand meme, ce qu'on ne veut pas.
  const essais = [1, 2].filter(n => seg.length > n).map(n => ({
    bucket: seg.slice(0, n), nomDossier: seg[n], sous: seg.slice(n + 1),
  }))

  const trouves = []
  for (const e of essais) {
    for (const c of candidats) {
      if (nomAttendu(c.dossier, c.client, c.suffixe) !== e.nomDossier) continue
      const attendu = bucketAttendu(c.dossier)
      if (attendu.join('/') !== e.bucket.join('/')) continue
      trouves.push({ dossier: c.dossier, sous: e.sous })
    }
  }
  if (trouves.length === 0) return refus('aucun_chantier_correspondant')
  // Deux chantiers pour un meme chemin : impossible en theorie (le suffixe les separe),
  // mais on ne parie pas dessus.
  const ids = new Set(trouves.map(t => t.dossier.id))
  if (ids.size > 1) return refus('chantier_ambigu')

  const { dossier, sous } = trouves[0]
  const premier = sous[0]

  // Fichier pose a la racine du dossier chantier : on connait le chantier, pas la nature.
  if (!premier) return { destination: 'documents', dossier_id: dossier.id, categorie: null, artisan_id: null }

  if (HORS_PERIMETRE.has(premier)) return refus(`hors_perimetre:${premier}`, false)

  // ── Photos ────────────────────────────────────────────────────────────────────────
  if (premier === DOSSIER_PHOTOS) {
    if (!estImage(nomFichier)) return refus('media_non_image')
    const cat = categoriePhotoDepuisDossier(sous[1])
    if (!cat) return refus('categorie_photo_inconnue')
    return { destination: 'photos', dossier_id: dossier.id, categorie_photo: cat }
  }

  // ── Documents artisans ────────────────────────────────────────────────────────────
  // On resout l'entreprise par son nom de dossier. Sans correspondance unique, on ne devine
  // pas — un document attribue au mauvais artisan fausse son suivi.
  if (premier === '4. Documents artisans') {
    const nomArtisan = sous[1]
    if (!nomArtisan) return { destination: 'documents', dossier_id: dossier.id, categorie: null, artisan_id: null }
    const artisanId = artisansParNom.get(nomArtisan)
    if (!artisanId) return refus(`artisan_inconnu:${nomArtisan}`)
    // Le 3e niveau porte la NATURE du document, et il faut le lire : l'écriture crée
    // « <artisan>/Factures » pour une facture et « <artisan>/Autre » pour le reste
    // (cf. sousDossiers). Ignorer ce niveau revenait à ranger une facture d'artisan en
    // « Autres » alors que le Drive l'avait classée — la taxonomie n'a pas été construite
    // pour être relue à moitié.
    //
    // À la RACINE de l'artisan, en revanche, on ne tranche pas : cinq catégories y écrivent
    // (attestation de démarrage, déblocage d'acompte, avis de virement, PV de réception,
    // attestation de fin). Le dossier ne les distingue pas, donc le rattachement non plus.
    const categorie = CATEGORIE_PAR_DOSSIER_ARTISAN[sous[2]] ?? null
    return { destination: 'documents', dossier_id: dossier.id, categorie, artisan_id: artisanId }
  }

  if (!(premier in CATEGORIE_PAR_DOSSIER)) return refus(`sous_dossier_inconnu:${premier}`)
  return { destination: 'documents', dossier_id: dossier.id, categorie: CATEGORIE_PAR_DOSSIER[premier], artisan_id: null }
}
