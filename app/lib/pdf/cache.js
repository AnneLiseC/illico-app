// app/lib/pdf/cache.js
// Cache des documents générés (PDF).
//
// LE PROBLÈME — refabriquer un document prend jusqu'à une minute : lecture du dossier,
// des devis, du suivi, téléchargement et recompression de chaque photo, rendu React-PDF.
// Recliquer deux minutes plus tard sans avoir rien changé refait exactement le même
// travail pour produire exactement le même fichier.
//
// LA RÈGLE RETENUE (décision du 03/09) — « dès qu'on fait une modification dans
// l'application qui pourrait être liée au PDF, on le relance ». Donc : invalidation
// LARGE, et on assume de régénérer parfois pour rien. Un nom de client corrigé relancera
// le calcul. C'est le bon arbitrage : attendre une minute pour rien coûte moins cher
// qu'envoyer un document périmé à un client.
//
// COMMENT — l'empreinte n'est PAS une date de modification (la plupart des tables n'en
// ont pas), c'est le CONTENU lui-même : on hache les données qui entrent dans le
// document. Si un seul champ utilisé change, l'empreinte change et le document est
// refait. Aucune colonne à ajouter, aucun déclencheur à maintenir, et aucun risque
// d'oublier de marquer une table comme modifiée.
//
// CE QUI EN DÉCOULE, ET QU'IL FAUT ASSUMER : l'empreinte doit être calculée à partir des
// MÉTADONNÉES seules (identifiants, chemins, montants, dates), jamais du contenu des
// fichiers — sinon il faudrait télécharger les photos pour savoir s'il faut les
// télécharger. Une photo REMPLACÉE à chemin identique ne serait donc pas détectée ;
// l'application n'écrase jamais une photo (chaque envoi crée une nouvelle ligne), donc
// le cas ne se produit pas. Si cela devait changer, il faudrait ajouter la taille du
// fichier à l'empreinte.

import crypto from 'crypto'

export const BUCKET_CACHE = 'documents'

// Sérialisation STABLE : deux objets équivalents doivent produire la même chaîne, quel
// que soit l'ordre des clés renvoyé par PostgREST. Sans ça, l'empreinte changerait au
// hasard et le cache ne servirait jamais à rien.
function stable(valeur) {
  if (valeur === null || valeur === undefined) return null
  if (Array.isArray(valeur)) return valeur.map(stable)
  if (valeur instanceof Date) return valeur.toISOString()
  if (typeof valeur === 'object') {
    const out = {}
    for (const cle of Object.keys(valeur).sort()) out[cle] = stable(valeur[cle])
    return out
  }
  // Les nombres arrivent parfois en texte depuis PostgREST ('1250.00' vs 1250) :
  // on les normalise, sinon une simple relecture changerait l'empreinte.
  if (typeof valeur === 'number') return Number.isFinite(valeur) ? String(valeur) : '0'
  return valeur
}

export function empreinteDe(donnees) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(donnees))).digest('hex')
}

// Chemin déterministe dans le Storage. `cle` distingue les documents multiples d'un même
// type sur un dossier (un compte rendu parmi d'autres, un devis précis).
export function cheminCache(dossierId, type, cle) {
  const suffixe = cle ? `-${String(cle).replace(/[^a-zA-Z0-9_-]/g, '')}` : ''
  return `cache/${dossierId}/${type}${suffixe}.pdf`
}

/**
 * Renvoie le PDF en cache si l'empreinte correspond, sinon null.
 * Ne lève JAMAIS : un cache en panne doit dégrader vers une régénération, pas vers une
 * erreur. C'est la règle de base d'un cache — il accélère, il ne décide pas.
 */
export async function lireCache(db, { dossierId, type, cle = null, empreinte }) {
  try {
    const { data: ligne } = await db.from('documents_cache')
      .select('path, empreinte')
      .eq('dossier_id', dossierId).eq('type', type).eq('cle', cle || '')
      .maybeSingle()
    if (!ligne || ligne.empreinte !== empreinte) return null

    const { data: fichier, error } = await db.storage.from(BUCKET_CACHE).download(ligne.path)
    if (error || !fichier) return null
    return Buffer.from(await fichier.arrayBuffer())
  } catch {
    return null
  }
}

/**
 * Range le PDF fraîchement produit. Ne lève jamais non plus : si l'écriture échoue, le
 * document a déjà été rendu et part au client — on perd le bénéfice, pas le service.
 * @returns {Promise<boolean>} true si le cache a bien été écrit.
 */
export async function ecrireCache(db, { dossierId, type, cle = null, empreinte, buffer }) {
  try {
    const path = cheminCache(dossierId, type, cle)
    const { error: upErr } = await db.storage.from(BUCKET_CACHE)
      .upload(path, buffer, { contentType: 'application/pdf', upsert: true })
    if (upErr) return false
    const { error: dbErr } = await db.from('documents_cache').upsert({
      dossier_id: dossierId, type, cle: cle || '', empreinte, path,
      taille: buffer.length, genere_le: new Date().toISOString(),
    }, { onConflict: 'dossier_id,type,cle' })
    return !dbErr
  } catch {
    return false
  }
}
