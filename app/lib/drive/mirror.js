// app/lib/drive/mirror.js
// Miroir générique app→Drive d'un fichier du bucket 'documents'. Idempotent via une clé
// doc_index (simple ou composite). Extrait du patron éprouvé de push-devis/push-facture
// pour éviter la duplication : toutes les routes push-* « secondaires » l'appellent.
//
// pushMirror(db, {
//   ownerUserId,  // à qui appartient le Drive (référente du dossier, ou l'uploadeur pour
//                 // les docs artisan globaux)
//   match,        // filtre doc_index d'idempotence, ex { facture_id } ou { artisan_id, artisan_doc_type }
//   onConflict,   // clé(s) d'upsert, ex 'facture_id' ou 'artisan_id,artisan_doc_type'
//   indexFields,  // champs supplémentaires écrits dans doc_index (dossier_id…)
//   filePath,     // chemin storage (null → retire le miroir)
//   segments,     // dossiers cibles (déjà nettoyés)
//   fileName, mime,
// }) → { ok?, skipped?, removed?, nothing?, reason?, error?, status?, path? }

import { driveModule, loadDriveCompte } from './dispatch'

export function mimeFromExt(ext) {
  const e = (ext || '').toLowerCase()
  if (e === 'png') return 'image/png'
  if (e === 'jpg' || e === 'jpeg') return 'image/jpeg'
  return 'application/pdf'
}

export async function pushMirror(db, opts) {
  const { ownerUserId, match, onConflict, indexFields = {}, filePath, segments, fileName, mime, skipIndex = false } = opts

  // skipIndex : copie « best effort » NON indexée dans doc_index (ex. copie client d'une fiche
  // technique, dont l'original est déjà indexé côté 02_ARTISANS). Idempotence assurée par le
  // nom déterministe + conflictBehavior 'replace' (ré-upload = remplacement au même endroit).
  const { data: existing } = skipIndex
    ? { data: null }
    : await db.from('doc_index').select('id, drive_id, item_id').match(match).maybeSingle()

  if (!ownerUserId) return { skipped: true, reason: 'no_owner' }
  const compte = await loadDriveCompte(db, ownerUserId)
  if (!compte || !compte.drive_root_drive_id || !compte.drive_root_id) {
    // ⚠️ CONNECTÉ N'EST PAS OPÉRATIONNEL.
    //
    // Un compte Drive peut avoir un jeton parfaitement valide et AUCUN dossier racine :
    // l'utilisateur a autorisé l'application, puis n'a jamais choisi où ranger. Rien
    // n'est alors archivé, et rien ne le dit — l'écran Drive le signale, mais il faut
    // penser à l'ouvrir. Cas réel : chez CTP, deux comptes connectés depuis six semaines
    // sans racine ; 30 chantiers sur 37 sans un seul document archivé.
    //
    // On prévient donc là où l'on constate le problème : au moment où un document aurait
    // dû partir. Une notification par semaine — c'est un réglage à faire une fois, pas
    // une panne à surveiller, et une alerte quotidienne finirait ignorée.
    if (compte) {
      try {
        const { notifierUtilisateur } = await import('../notifications-internes.js')
        await notifierUtilisateur({
          userId: ownerUserId,
          type: 'drive_sans_racine',
          titre: 'Aucun dossier Drive choisi',
          message: "Ton compte Drive est connecté, mais aucun dossier racine n'a été choisi : "
            + "tes devis, comptes rendus et factures ne sont copiés nulle part. "
            + "Choisis un dossier racine dans Paramètres, puis lance le rattrapage pour "
            + "archiver ce qui a déjà été créé.",
          fenetreHeures: 168,   // une fois par semaine
        })
      } catch { /* prévenir est un plus, jamais un prérequis */ }
    }
    return { skipped: true, reason: 'no_root' }
  }
  const mod = driveModule(compte.fournisseur)
  if (!mod) return { skipped: true, reason: 'fournisseur' }

  let token
  try { token = await mod.getValidAccessToken(compte) }
  catch (e) { if (e.reconnect) return { skipped: true, reason: 'reconnect' }; throw e }

  // Plus de fichier → on retire la copie Drive si elle existait.
  if (!filePath) {
    if (existing) {
      try { await mod.deleteItem(token, existing.drive_id, existing.item_id) } catch { /* best effort */ }
      await db.from('doc_index').delete().eq('id', existing.id)
      return { ok: true, removed: true }
    }
    return { ok: true, nothing: true }
  }

  // Déjà miroité → on supprime l'ancien item avant de reposer (le fichier a pu changer).
  if (existing) { try { await mod.deleteItem(token, existing.drive_id, existing.item_id) } catch { /* best effort */ } }

  const { data: blob, error: dlErr } = await db.storage.from('documents').download(filePath)
  if (dlErr || !blob) return { error: 'Fichier introuvable', status: 404 }
  const buffer = Buffer.from(await blob.arrayBuffer())
  const leafId = await mod.ensureFolderPath(token, compte.drive_root_drive_id, compte.drive_root_id, segments)
  const up = await mod.uploadSmallFile(token, compte.drive_root_drive_id, leafId, fileName, buffer, mime, 'replace')

  const cheminLogique = [...segments, up.name].join('/')
  if (!skipIndex) {
    await db.from('doc_index').upsert({
      ...match,
      ...indexFields,
      user_id: ownerUserId,
      origine: 'app',
      drive_id: compte.drive_root_drive_id,
      item_id: up.id,
      path: cheminLogique,
      updated_at: new Date().toISOString(),
    }, { onConflict })
  }

  return { ok: true, path: cheminLogique }
}
