// app/lib/drive/taxonomie.js
// Traduit un dossier + un document Batilis en CHEMIN de dossiers du drive (OneDrive OU
// Google Drive — taxonomie commune). Arborescence :
//
//   <racine>/AAAA.MM.JJ NOM/
//     ├── Comptes rendus/
//     ├── Devis/{Signés,Reçus,Refusés}/
//     ├── Documents artisans/<Artisan>/{ (docs), Factures/, Autre/ }
//     ├── Photos/{Avant,Pendant,Après,Maquette}/
//     └── Autres/{Plans, Factures honoraires, Administratif}/
//
// Date du dossier client = TOUJOURS la date de création du dossier (created_at),
// jamais la signature (parfois vide). Nom = nom du client.

// 'YYYY.MM.DD' à partir d'un created_at ('2026-07-19T10:00:00' ou '2026-07-19 10:00:00').
// On lit la partie date brute → aucun décalage de fuseau.
export function dateDossier(createdAt) {
  const s = String(createdAt || '')
  const d = s.slice(0, 10) // YYYY-MM-DD
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.replaceAll('-', '.') : '0000.00.00'
}

// Nom du dossier client : « AAAA.MM.JJ NOM ». NOM = nom du client (fallback neutre).
export function nomDossierChantier(createdAt, clientNom) {
  const nom = (clientNom || 'CLIENT').trim()
  return `${dateDossier(createdAt)} ${nom}`.trim()
}

// Libellé de sous-dossier photo selon la catégorie (avant/pendant/après/maquette).
const PHOTO_CAT_LABEL = { avant: 'Avant', pendant: 'Pendant', apres: 'Après', maquette: 'Maquette' }

// Chemin des photos : « Photos/<Avant|Pendant|Après|Maquette> » (catégorie inconnue → Autres).
// (Séparé de sousDossiers car les photos n'ont pas de « catégorie document » mais une
// catégorie de prise de vue.)
export function photoSousDossiers(categoriePhoto) {
  return ['Photos', PHOTO_CAT_LABEL[categoriePhoto] || 'Autres']
}

// Sous-dossier(s) cible selon la catégorie du document. Renvoie un tableau de segments.
// artisanNom sert pour les docs artisans.
export function sousDossiers(categorie, artisanNom) {
  const artisan = (artisanNom || 'Sans artisan').trim()
  switch (categorie) {
    case 'compte_rendu':
      return ['Comptes rendus']
    // Documents artisans, directement sous le dossier de l'artisan.
    case 'attestation_demarrage':
    case 'deblocage_acompte':
    case 'avis_virement':
    case 'pv_reception':
    case 'attestation_chantier':
      return ['Documents artisans', artisan]
    case 'facture_artisan':
      return ['Documents artisans', artisan, 'Factures']
    case 'autre_artisan':
      return ['Documents artisans', artisan, 'Autre']
    // Autres, avec sous-dossiers dédiés.
    case 'plans':
      return ['Autres', 'Plans']
    case 'facture_honoraire':
      return ['Autres', 'Factures honoraires']
    case 'administratif':
      return ['Autres', 'Administratif']
    default:
      return ['Autres']
  }
}

// Nettoie un nom de segment pour OneDrive (caractères interdits : \ / : * ? " < > |).
export function nettoyerSegment(s) {
  return String(s || '').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 250) || '-'
}

// Chemin complet de segments (dossier chantier + sous-dossiers), nettoyés.
export function cheminSegments(createdAt, clientNom, categorie, artisanNom) {
  return [nomDossierChantier(createdAt, clientNom), ...sousDossiers(categorie, artisanNom)].map(nettoyerSegment)
}
