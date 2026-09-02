// app/lib/drive/import-inbox.js
// Import d'un fichier « à rattacher » (drive_inbox) vers un chantier : télécharge la COPIE
// depuis le Drive, l'upload dans le stockage app, crée chantier_documents + doc_index, passe la
// ligne inbox en 'rattache'. Extrait de /api/drive/import pour être PARTAGÉ entre la route
// (parcours manuel) et le cron (rattachement automatique). Comportement identique au manuel.
//
// Concurrence : la ligne inbox est PRISE atomiquement (compare-and-swap statut a_rattacher →
// rattache) AVANT tout téléchargement. Si 0 ligne affectée, un autre acteur (cron vs clic
// humain) l'a déjà prise → on s'arrête sans rien écrire ({ skipped }). Tout échec APRÈS la prise
// relâche la ligne (statut remis à a_rattacher) : mieux vaut un doublon potentiel au prochain
// passage qu'un fichier disparu de la liste sans avoir atterri nulle part.
//
// Tout-ou-rien : si l'insert doc_index échoue après chantier_documents, on supprime AUSSI la
// ligne chantier_documents (et le fichier du stockage) — pas de demi-rattachement.
//
// Renvoie { ok, document_id } | { skipped, reason } | { error, status } — pas de throw prévu.

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

export async function importerInbox(db, {
  mod, token, inbox, fournisseur, dossierId, categorie = null, artisanId = null, auto = false,
}) {
  // Prise atomique : n'avance QUE si cette ligne était encore a_rattacher (compare-and-swap).
  // Le perdant d'une course cron/clic humain s'arrête ici sans rien écrire.
  const { data: pris, error: claimErr } = await db.from('drive_inbox')
    .update({ statut: 'rattache', rattachement_auto: !!auto, rattache_le: new Date().toISOString() })
    .eq('id', inbox.id).eq('statut', 'a_rattacher').select('id')
  if (claimErr) { console.error('[import-inbox] claim', claimErr.message); return { error: 'Verrou impossible', status: 500 } }
  if (!pris || pris.length === 0) return { skipped: true, reason: 'deja_pris' }

  // Relâche la ligne sur TOUT chemin d'échec après la prise (y compris l'exception) : sans ça,
  // un import échoué laisserait le fichier en 'rattache' sans copie → disparu de la liste.
  const relacher = async () => {
    await db.from('drive_inbox')
      .update({ statut: 'a_rattacher', rattachement_auto: false, rattache_le: null })
      .eq('id', inbox.id).then(() => {}, () => {})
  }

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

// PUR & testable. Garde-fou anti-écho par NOM de fichier : un fichier détecté dont le nom
// correspond au dernier segment d'un chemin déjà indexé pour le MÊME dossier est un écho de
// l'app (pushMirror recrée l'item quand le chemin change → nouvel item_id, fichier redevenu
// « inconnu »). Sans ce garde-fou, le rattachement automatique en ferait un doublon silencieux.
export function estEchoNom(nomFichier, cheminsExistants) {
  const nom = String(nomFichier || '')
  if (!nom) return false
  return (cheminsExistants || []).some(p => String(p || '').split('/').pop() === nom)
}
