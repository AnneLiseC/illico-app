// app/lib/drive/taxonomie.js
// Traduit un dossier + un document Batils en CHEMIN de dossiers OneDrive, selon
// l'arborescence validée (SPEC_drive_onedrive.md §6).
//
//   <racine>/AAAA.MM.JJ NOM/<sous-dossier>/<fichier>
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

// Sous-dossier(s) cible selon la catégorie du document. Renvoie un tableau de segments
// (1 ou 2 niveaux). artisanNom sert pour les docs artisans.
export function sousDossiers(categorie, artisanNom) {
  switch (categorie) {
    case 'compte_rendu':
      return ['Comptes rendus']
    case 'attestation_demarrage':
    case 'deblocage_acompte':
    case 'avis_virement':
    case 'pv_reception':
    case 'attestation_chantier':
      return ['Documents artisans', (artisanNom || 'Sans artisan').trim()]
    case 'facture_honoraire':
    case 'plans':
    case 'administratif':
      return ['Autres']
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
