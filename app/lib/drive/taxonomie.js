// app/lib/drive/taxonomie.js
// Traduit un dossier + un document Batilis en CHEMIN de dossiers du drive (OneDrive OU
// Google Drive — taxonomie commune). Arborescence CIBLE (modèle illiCO 2026) :
//
//   01_CLIENTS/
//     ├── 1. En cours/ | 2. Terminés/<année>/ | 3. Sans suite/
//     │     └── AAAA-MM-JJ NOM/                       (nom client en MAJUSCULES ; date = création du dossier)
//     │           1. Administratif/                    (contrat, admin client, factures honoraires)
//     │           2. Comptes rendus/
//     │           3. Devis/{1. Reçus, 2. Signés, 3. Refusés}/
//     │           4. Documents artisans/<Artisan>/{ (PV, attestations, acomptes…), Factures/, Autre/ }
//     │           5. Plans & techniques/               (plans, estimations, fiches techniques liées au chantier)
//     │           6. Photos/{1. Avant, 2. Pendant, 3. Après, 4. Maquette}/
//   02_ARTISANS/
//     └── <Artisan>/{ Documents administratif/, Fiches techniques/ }   (catalogue complet de l'artisan)
//
// Le bucket (En cours / Terminés / Sans suite) suit le statut du dossier ; au changement de
// statut, le dossier chantier est DÉPLACÉ entre buckets (move-chantier).
// Date du dossier client = date de CRÉATION du dossier (created_at), jamais la signature.

export const RACINE_CLIENTS  = '01_CLIENTS'
export const RACINE_ARTISANS = '02_ARTISANS'

// 'AAAA-MM-JJ' à partir d'un created_at ('2026-07-19T10:00:00' ou '2026-07-19 10:00:00').
// On lit la partie date brute → aucun décalage de fuseau.
export function dateDossier(createdAt) {
  const d = String(createdAt || '').slice(0, 10) // YYYY-MM-DD
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '0000-00-00'
}

// Nom du dossier client : « AAAA-MM-JJ NOM » (NOM en MAJUSCULES ; fallback neutre).
export function nomDossierChantier(createdAt, clientNom) {
  const nom = (clientNom || 'CLIENT').trim().toUpperCase()
  return `${dateDossier(createdAt)} ${nom}`.trim()
}

// Bucket de statut → segments. 'annule' → « 3. Sans suite » ; 'termine' → « 2. Terminés/<année> »
// (année = date de fin de chantier si fournie, sinon année de création) ; sinon « 1. En cours ».
export function bucketSegments(statut, { dateFin, createdAt } = {}) {
  if (statut === 'annule') return ['3. Sans suite']
  if (statut === 'termine') {
    const src = String(dateFin || createdAt || '')
    const y = /^\d{4}/.test(src) ? src.slice(0, 4) : '0000'
    return ['2. Terminés', y]
  }
  return ['1. En cours']
}

// Sous-dossier Devis selon le statut du devis.
export function devisSousDossier(statutDevis) {
  if (statutDevis === 'accepte' || statutDevis === 'signe') return '2. Signés'
  if (statutDevis === 'refuse') return '3. Refusés'
  return '1. Reçus'
}

// Libellé de sous-dossier photo (numéroté) selon la catégorie de prise de vue.
const PHOTO_CAT_LABEL = { avant: '1. Avant', pendant: '2. Pendant', apres: '3. Après', maquette: '4. Maquette' }
export function photoSousDossiers(categoriePhoto) {
  return ['6. Photos', PHOTO_CAT_LABEL[categoriePhoto] || 'Autres']
}

// Sous-dossier(s) cible selon la catégorie du document. Renvoie un tableau de segments.
export function sousDossiers(categorie, artisanNom) {
  const artisan = (artisanNom || 'Sans artisan').trim()
  switch (categorie) {
    case 'compte_rendu':
      return ['2. Comptes rendus']
    // Documents artisans : PV, attestations, acomptes (déblocage / avis de virement)… par artisan.
    case 'attestation_demarrage':
    case 'deblocage_acompte':
    case 'avis_virement':
    case 'pv_reception':
    case 'attestation_chantier':
      return ['4. Documents artisans', artisan]
    case 'facture_artisan':
      return ['4. Documents artisans', artisan, 'Factures']
    case 'autre_artisan':
      return ['4. Documents artisans', artisan, 'Autre']
    // Plans & techniques : plans, estimations, fiches techniques liées au chantier.
    case 'plans':
    case 'estimation':
    case 'fiche_technique':
      return ['5. Plans & techniques']
    // Administratif : facture honoraires illiCO, contrat, pièces admin client.
    case 'facture_honoraire':
    case 'administratif':
      return ['1. Administratif']
    default:
      return ['1. Administratif']
  }
}

// Nettoie un nom de segment pour OneDrive (caractères interdits : \ / : * ? " < > |).
export function nettoyerSegment(s) {
  return String(s || '').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 250) || '-'
}

// Slug d'un nom (client ou artisan) pour un NOM DE FICHIER : sans accents, alphanumérique + _
// Ex. « Élise Guérteau » → « Elise_Guerteau ». Fallback neutre si vide.
export function slugNom(s) {
  return String(s || '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'x'
}

// Segments de base du dossier chantier : 01_CLIENTS/<bucket>/AAAA-MM-JJ NOM (NON nettoyés).
export function chantierBaseSegments(statut, createdAt, clientNom, opts = {}) {
  return [RACINE_CLIENTS, ...bucketSegments(statut, { dateFin: opts.dateFin, createdAt }), nomDossierChantier(createdAt, clientNom)]
}

// Chemin complet d'un DOCUMENT chantier.
export function cheminChantier(statut, createdAt, clientNom, categorie, artisanNom, opts = {}) {
  return [...chantierBaseSegments(statut, createdAt, clientNom, opts), ...sousDossiers(categorie, artisanNom)].map(nettoyerSegment)
}

// Chemin complet d'une PHOTO chantier.
export function cheminChantierPhoto(statut, createdAt, clientNom, categoriePhoto, opts = {}) {
  return [...chantierBaseSegments(statut, createdAt, clientNom, opts), ...photoSousDossiers(categoriePhoto)].map(nettoyerSegment)
}

// Chemin d'un document ARTISAN GLOBAL (hors chantier) : 02_ARTISANS/<Artisan>/<sous-dossier>.
// sousDossier = 'Documents administratif' | 'Fiches techniques'.
export function cheminArtisanGlobal(artisanNom, sousDossier) {
  return [RACINE_ARTISANS, (artisanNom || 'Sans artisan').trim(), sousDossier].map(nettoyerSegment)
}
