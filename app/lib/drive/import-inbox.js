// app/lib/drive/import-inbox.js
// Import d'un fichier « à rattacher » (drive_inbox) vers un chantier : télécharge la COPIE
// depuis le Drive, l'upload dans le stockage app, crée la ligne métier + doc_index, passe la
// ligne inbox en 'rattache'. Extrait de /api/drive/import pour être PARTAGÉ entre la route
// (parcours manuel) et le cron (rattachement automatique). Comportement identique au manuel.
//
// DEUX DESTINATIONS, PAS UNE (10/09) :
//   importerInbox      → chantier_documents  (contrats, comptes rendus, plans, docs artisans)
//   importerInboxPhoto → table photos        (6. Photos/1. Avant · 2. Pendant · 3. Apres)
// Le rattachement n'avait qu'une table d'arrivée, si bien qu'une photo bien rangée dans le
// Drive restait éternellement « à rattacher » : la seule action proposée l'aurait mise dans
// la mauvaise table, où elle n'apparaît ni dans l'onglet Photos, ni dans le dossier de
// restitution. C'était la logique manquante, pas un excès de prudence.
//
// Concurrence : la ligne inbox est PRISE atomiquement (compare-and-swap statut a_rattacher →
// rattache) AVANT tout téléchargement. Si 0 ligne affectée, un autre acteur (cron vs clic
// humain) l'a déjà prise → on s'arrête sans rien écrire ({ skipped }). Tout échec APRÈS la prise
// relâche la ligne (statut remis à a_rattacher) : mieux vaut un doublon potentiel au prochain
// passage qu'un fichier disparu de la liste sans avoir atterri nulle part.
//
// Tout-ou-rien : si l'insert doc_index échoue après la ligne métier, on supprime AUSSI cette
// ligne (et le fichier du stockage) — pas de demi-rattachement.
//
// Renvoie { ok, document_id | photo_id } | { skipped, reason } | { error, status } — pas de throw prévu.

import { RACINE_CLIENTS } from './taxonomie'

// Chemin « drive » du document (comme les pushes) : parent_path tronqué à partir de
// RACINE_CLIENTS + nom du fichier. C'est CE chemin qu'on écrit dans doc_index.path (le chemin
// de stockage app, aléatoire, reste dans chantier_documents.path) pour que le garde-fou
// anti-écho par nom (estEchoNom) reste durable : son dernier segment est le vrai nom du fichier.
export function cheminDriveDoc(parentPath, name) {
  const segs = String(parentPath || '').split('/').filter(Boolean)
  const i = segs.indexOf(RACINE_CLIENTS)
  const rel = i >= 0 ? segs.slice(i) : segs
  return [...rel, name || ''].filter(Boolean).join('/')
}

// Prise atomique de la ligne inbox + fabrique de la fonction qui la relâche.
// Renvoyée telle quelle aux deux imports pour qu'ils partagent EXACTEMENT le même verrou :
// deux implémentations du même compare-and-swap finiraient par diverger.
async function prendreLigne(db, inbox, auto) {
  const { data: pris, error } = await db.from('drive_inbox')
    .update({ statut: 'rattache', rattachement_auto: !!auto, rattache_le: new Date().toISOString() })
    .eq('id', inbox.id).eq('statut', 'a_rattacher').select('id')
  if (error) { console.error('[import-inbox] claim', error.message); return { erreur: { error: 'Verrou impossible', status: 500 } } }
  if (!pris || pris.length === 0) return { deja: true }
  const relacher = async () => {
    await db.from('drive_inbox')
      .update({ statut: 'a_rattacher', rattachement_auto: false, rattache_le: null })
      .eq('id', inbox.id).then(() => {}, () => {})
  }
  return { relacher }
}

export async function importerInbox(db, {
  mod, token, inbox, fournisseur, dossierId, categorie = null, artisanId = null, auto = false,
}) {
  const prise = await prendreLigne(db, inbox, auto)
  if (prise.erreur) return prise.erreur
  if (prise.deja) return { skipped: true, reason: 'deja_pris' }
  const { relacher } = prise

  let path = null, docId = null
  try {
    const { buffer, contentType } = await mod.downloadItemContent(token, inbox.drive_id, inbox.item_id)
    const ext = (inbox.name || '').split('.').pop() || 'bin'
    path = `chantiers/${dossierId}/documents/onedrive_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`

    const { error: upErr } = await db.storage.from('documents').upload(path, buffer, { contentType })
    if (upErr) { console.error('[import-inbox] storage', upErr.message); await relacher(); return { error: 'Copie impossible', status: 502 } }

    const { data: doc, error: insErr } = await db.from('chantier_documents').insert({
      dossier_id: dossierId, nom: inbox.name || 'Document', path,
      type_mime: contentType, taille: buffer.length,
      dans_restitution: false, categorie, artisan_id: artisanId,
    }).select('id').single()
    if (insErr) {
      await db.storage.from('documents').remove([path]).catch(() => {})
      console.error('[import-inbox] insert', insErr.message)
      await relacher()
      return { error: 'Enregistrement impossible', status: 500 }
    }
    docId = doc.id

    // doc_index.path = chemin DRIVE (parent_path + nom), PAS le chemin de stockage (cf. en-tête).
    const origine = fournisseur === 'googledrive' ? 'googledrive' : 'onedrive'
    const { error: idxErr } = await db.from('doc_index').insert({
      document_id: docId, dossier_id: dossierId, user_id: inbox.user_id,
      origine, drive_id: inbox.drive_id, item_id: inbox.item_id,
      path: cheminDriveDoc(inbox.parent_path, inbox.name),
    })
    if (idxErr) {
      // Tout-ou-rien : l'indexation a échoué → on défait chantier_documents ET le stockage.
      await db.from('chantier_documents').delete().eq('id', docId).then(() => {}, () => {})
      await db.storage.from('documents').remove([path]).catch(() => {})
      console.error('[import-inbox] doc_index', idxErr.message)
      await relacher()
      return { error: 'Indexation impossible', status: 500 }
    }

    return { ok: true, document_id: docId }
  } catch (e) {
    // Exception (téléchargement Graph, réseau…) : défaire ce qui a pu être créé, puis relâcher.
    if (docId) await db.from('chantier_documents').delete().eq('id', docId).then(() => {}, () => {})
    if (path) await db.storage.from('documents').remove([path]).catch(() => {})
    await relacher()
    console.error('[import-inbox] graph', e)
    return { error: 'Import échoué', status: 502 }
  }
}

/**
 * Import d'une PHOTO du Drive vers la table photos, avec sa catégorie de prise de vue.
 *
 * Même verrou, même règle du tout-ou-rien que l'import de documents. Deux différences qui
 * comptent :
 *
 * · Le doublon se juge par (dossier, nom de fichier). La photo garde son nom d'origine dans
 *   `photos.nom` — c'est déjà le critère de doublon de l'upload manuel. Sans ça, un dossier
 *   re-rangé dans le Drive (nouvel item_id pour Graph) réimporterait toute la galerie une
 *   deuxième fois, et personne ne s'en apercevrait avant le dossier de restitution.
 *
 * · La photo est copiée TELLE QUELLE, sans la compression 1600 px que fait l'upload depuis
 *   le navigateur. Une photo de terrain pèse ~5 Mo : c'est le prix d'un import fidèle, et
 *   l'original est de toute façon déjà dans le Drive. À surveiller si le stockage devient
 *   un sujet — la compression serveur demanderait `sharp`, dépendance transitive de Next
 *   sur laquelle on ne veut pas s'appuyer en douce.
 */
export async function importerInboxPhoto(db, {
  mod, token, inbox, fournisseur, dossierId, categoriePhoto, auto = false,
}) {
  // Doublon AVANT la prise : inutile de verrouiller une ligne pour la relâcher aussitôt.
  const nom = inbox.name || 'photo'
  const { data: deja } = await db.from('photos')
    .select('id').eq('dossier_id', dossierId).eq('nom', nom).limit(1)
  if (deja && deja.length > 0) {
    // La photo est déjà dans l'appli : la ligne inbox n'a plus lieu d'être proposée.
    await db.from('drive_inbox').update({ statut: 'ignore' }).eq('id', inbox.id).then(() => {}, () => {})
    return { skipped: true, reason: 'photo_deja_presente' }
  }

  const prise = await prendreLigne(db, inbox, auto)
  if (prise.erreur) return prise.erreur
  if (prise.deja) return { skipped: true, reason: 'deja_pris' }
  const { relacher } = prise

  let path = null, photoId = null
  try {
    const { buffer, contentType } = await mod.downloadItemContent(token, inbox.drive_id, inbox.item_id)
    const ext = (nom.split('.').pop() || 'jpg').toLowerCase()
    // Même convention de chemin que l'upload depuis la fiche chantier : le bucket 'photos'
    // est rangé par dossier puis par catégorie.
    path = `chantiers/${dossierId}/${categoriePhoto}/drive_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`

    const { error: upErr } = await db.storage.from('photos').upload(path, buffer, { contentType })
    if (upErr) { console.error('[import-inbox] storage photo', upErr.message); await relacher(); return { error: 'Copie impossible', status: 502 } }

    const { data: photo, error: insErr } = await db.from('photos').insert({
      dossier_id: dossierId, url: path, categorie: categoriePhoto,
      type_media: 'photo', nom, uploaded_by: inbox.user_id,
    }).select('id').single()
    if (insErr) {
      await db.storage.from('photos').remove([path]).catch(() => {})
      console.error('[import-inbox] insert photo', insErr.message)
      await relacher()
      return { error: 'Enregistrement impossible', status: 500 }
    }
    photoId = photo.id

    const origine = fournisseur === 'googledrive' ? 'googledrive' : 'onedrive'
    const { error: idxErr } = await db.from('doc_index').insert({
      photo_id: photoId, dossier_id: dossierId, user_id: inbox.user_id,
      origine, drive_id: inbox.drive_id, item_id: inbox.item_id,
      path: cheminDriveDoc(inbox.parent_path, nom),
    })
    if (idxErr) {
      await db.from('photos').delete().eq('id', photoId).then(() => {}, () => {})
      await db.storage.from('photos').remove([path]).catch(() => {})
      console.error('[import-inbox] doc_index photo', idxErr.message)
      await relacher()
      return { error: 'Indexation impossible', status: 500 }
    }

    return { ok: true, photo_id: photoId }
  } catch (e) {
    if (photoId) await db.from('photos').delete().eq('id', photoId).then(() => {}, () => {})
    if (path) await db.storage.from('photos').remove([path]).catch(() => {})
    await relacher()
    console.error('[import-inbox] graph photo', e)
    return { error: 'Import échoué', status: 502 }
  }
}

// PUR & testable. Garde-fou anti-écho par NOM de fichier : un fichier détecté dont le nom
// correspond au dernier segment d'un chemin déjà indexé pour le MÊME dossier est un écho de
// l'app (pushMirror recrée l'item quand le chemin change → nouvel item_id, fichier redevenu
// « inconnu »). Sans ce garde-fou, le rattachement automatique en ferait un doublon silencieux.
export function estEchoNom(nomFichier, cheminsExistants) {
  const nom = String(nomFichier || '')
  if (!nom) return false
  return (cheminsExistants || []).some(p => String(p || '').split('/').pop() === nom)
}
