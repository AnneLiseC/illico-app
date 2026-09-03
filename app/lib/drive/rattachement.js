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
// deux chantiers possibles, un sous-dossier inconnu, une photo, un devis — laisse le fichier
// dans la liste « a rattacher » pour decision humaine. Un mauvais rattachement automatique
// est bien pire qu'un rattachement manquant : il est invisible.

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
//   null                      -> categorie inconnue mais rattachement possible (Autres)
//   undefined (cle absente)   -> on NE rattache PAS
const CATEGORIE_PAR_DOSSIER = {
  '1. Administratif': 'administratif',
  '2. Comptes rendus': 'compte_rendu',
  '5. Plans & techniques': 'plans',
}

// Sous-dossiers volontairement NON rattaches automatiquement, avec la raison :
//   '3. Devis'   : un devis n'est pas un chantier_document, il a sa propre table et son
//                  statut porte le circuit (Recus/Presentes/Signes/Refuses).
//   '6. Photos'  : les photos vont dans la table photos, pas dans chantier_documents.
//   '7. Echanges', '8. Apporteur d'affaires' : dossiers manuels, l'appli n'y ecrit jamais.
const DOSSIERS_MANUELS = new Set(['3. Devis', '6. Photos', '7. Echanges', "8. Apporteur d'affaires"])

// Nom de dossier attendu pour un chantier, avec les MEMES fonctions que celles qui l'ecrivent.
export function nomAttendu(dossier, client, suffixe) {
  return nettoyerSegment(nomDossierChantier(
    dossier.date_premier_rdv || dossier.created_at,
    client?.nom, client?.nom2, suffixe,
  ))
}

// Segments de bucket attendus ('1. En cours' | '2. Terminés',<annee> | '3. Sans suite').
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

// PUR. Decide du rattachement d'un fichier a partir de son chemin et des chantiers connus.
//   parentPath  : drive_inbox.parent_path
//   candidats   : [{ dossier, client, suffixe }] — TOUS les chantiers de la referente
//   artisansParNom : Map nom d'entreprise nettoye -> artisan_id (peut etre vide)
// Renvoie { dossier_id, categorie, artisan_id } si et seulement si tout est certain,
// sinon { raison } expliquant pourquoi on laisse la main a l'humain.
export function deciderRattachement(parentPath, candidats, artisansParNom = new Map()) {
  const seg = segmentsApresRacine(parentPath)
  if (!seg) return { raison: 'hors_01_CLIENTS' }
  if (seg.length < 2) return { raison: 'chemin_trop_court' }

  // Le nom du chantier est le segment qui suit le bucket ; le bucket fait 1 ou 2 segments
  // ('2. Terminés' porte une annee). On essaie les deux longueurs et on exige la coherence
  // avec le bucket attendu du chantier trouve — sinon un fichier range dans le mauvais
  // bucket serait rattache quand meme, ce qu'on ne veut pas.
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
  if (trouves.length === 0) return { raison: 'aucun_chantier_correspondant' }
  // Deux chantiers pour un meme chemin : impossible en theorie (le suffixe les separe),
  // mais on ne parie pas dessus.
  const ids = new Set(trouves.map(t => t.dossier.id))
  if (ids.size > 1) return { raison: 'chantier_ambigu' }

  const { dossier, sous } = trouves[0]
  const premier = sous[0]

  // Fichier pose a la racine du dossier chantier : on connait le chantier, pas la nature.
  if (!premier) return { dossier_id: dossier.id, categorie: null, artisan_id: null }

  if (DOSSIERS_MANUELS.has(premier)) return { raison: `dossier_manuel:${premier}` }

  // Documents artisans : on resout l'entreprise par son nom de dossier. Sans correspondance
  // unique, on ne devine pas — un document attribue au mauvais artisan fausse son suivi.
  if (premier === '4. Documents artisans') {
    const nomArtisan = sous[1]
    if (!nomArtisan) return { dossier_id: dossier.id, categorie: null, artisan_id: null }
    const artisanId = artisansParNom.get(nomArtisan)
    if (!artisanId) return { raison: `artisan_inconnu:${nomArtisan}` }
    return { dossier_id: dossier.id, categorie: null, artisan_id: artisanId }
  }

  if (!(premier in CATEGORIE_PAR_DOSSIER)) return { raison: `sous_dossier_inconnu:${premier}` }
  return { dossier_id: dossier.id, categorie: CATEGORIE_PAR_DOSSIER[premier], artisan_id: null }
}
