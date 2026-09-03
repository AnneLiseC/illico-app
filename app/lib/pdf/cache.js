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
// ─────────────────────────────────────────────────────────────────────────────
// CE QUE L'AUDIT DU 03/09 A CORRIGÉ ICI — trois réserves, une seule cause
//
// L'empreinte porte des CHEMINS de fichiers, pas leur contenu. C'était assumé, avec
// pour justification « l'application n'écrase jamais un fichier ». C'ÉTAIT FAUX :
// le RIB et le Kbis du franchisé, le devis signé, le PV de réception et la facture
// s'écrivaient tous sur un chemin déterministe, en écrasement. Changer de banque ne
// changeait pas le chemin, donc pas l'empreinte, donc l'ANCIEN RIB continuait de
// partir dans chaque dossier déjà en cache. (R10)
//
// Le remède n'est pas ici : ces chemins d'envoi sont désormais HORODATÉS, comme
// l'étaient déjà les documents d'artisans. Un fichier remplacé change de chemin, donc
// change l'empreinte. Le principe « métadonnées seulement » est préservé — c'est son
// hypothèse de départ qui était fausse, pas le principe.
//
// Deux autres corrections vivent bien dans ce fichier :
//   · R12 — le chemin de cache PORTE maintenant l'empreinte. Avant, deux générations
//     concurrentes (deux onglets, l'agente et le client au même instant) pouvaient
//     s'entrelacer : A dépose sa version, B dépose la sienne, B écrit sa ligne, A écrit
//     la sienne — la ligne annonçait une version, le fichier en contenait une autre, et
//     le mauvais document était servi indéfiniment sans jamais se corriger. Avec
//     l'empreinte dans le nom, chaque version a son fichier : l'écriture devient
//     idempotente et l'entrelacement n'a plus d'effet.
//   · R15 — la purge à la suppression d'un chantier partait du navigateur, que les
//     règles de stockage n'autorisent pas sur le préfixe `cache/`. Elle échouait en
//     silence. `purgerCache` ci-dessous la fait côté serveur.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'crypto'

export const BUCKET_CACHE = 'documents'
export const PREFIXE_CACHE = 'cache'

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
  // Et le cas symétrique, qui manquait : un numérique PostgREST arrive en TEXTE avec
  // ses décimales ('1250.00'). On ne normalise QUE cette forme — chiffres avec un point
  // décimal — pour ne jamais toucher à un identifiant, une date ou une référence.
  if (typeof valeur === 'string' && /^-?\d+\.\d+$/.test(valeur)) {
    const n = Number(valeur)
    return Number.isFinite(n) ? String(n) : valeur
  }
  return valeur
}

export function empreinteDe(donnees) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(donnees))).digest('hex')
}

// La date d'ÉDITION est imprimée sur le document (« établi le … ») et se calcule au
// rendu. Elle doit donc entrer dans l'empreinte, sinon un document servi trois semaines
// plus tard porte la date de sa première fabrication — et sur une pièce remise au client
// final, cette mention fait foi. (R13)
//
// Conséquence assumée : chaque document se refait UNE fois par jour. On garde le cache
// dans la journée — le cas qui gênait, recliquer deux minutes plus tard — et on le perd
// d'un jour sur l'autre. C'est le bon sens de l'arbitrage déjà retenu.
export function jourDEdition(maintenant = new Date()) {
  return maintenant.toISOString().slice(0, 10)   // AAAA-MM-JJ
}

// Chemin dans le Storage. `cle` distingue les documents multiples d'un même type sur un
// dossier (un compte rendu parmi d'autres). L'EMPREINTE fait partie du nom : deux
// versions ne peuvent pas se marcher dessus.
export function cheminCache(dossierId, type, cle, empreinte) {
  const suffixe = cle ? `-${String(cle).replace(/[^a-zA-Z0-9_-]/g, '')}` : ''
  const marque = empreinte ? `-${String(empreinte).slice(0, 16)}` : ''
  return `${PREFIXE_CACHE}/${dossierId}/${type}${suffixe}${marque}.pdf`
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
 *
 * L'ancien fichier de ce (dossier, type, clé) est supprimé APRÈS que la ligne pointe sur
 * le nouveau : dans cet ordre, une panne au milieu laisse un fichier orphelin — bénin —
 * plutôt qu'une ligne qui pointe sur un fichier disparu.
 *
 * @returns {Promise<boolean>} true si le cache a bien été écrit.
 */
export async function ecrireCache(db, { dossierId, type, cle = null, empreinte, buffer }) {
  try {
    const path = cheminCache(dossierId, type, cle, empreinte)

    const { data: ancienne } = await db.from('documents_cache')
      .select('path').eq('dossier_id', dossierId).eq('type', type).eq('cle', cle || '')
      .maybeSingle()

    const { error: upErr } = await db.storage.from(BUCKET_CACHE)
      .upload(path, buffer, { contentType: 'application/pdf', upsert: true })
    if (upErr) return false

    const { error: dbErr } = await db.from('documents_cache').upsert({
      dossier_id: dossierId, type, cle: cle || '', empreinte, path,
      taille: buffer.length, genere_le: new Date().toISOString(),
    }, { onConflict: 'dossier_id,type,cle' })
    if (dbErr) return false

    if (ancienne?.path && ancienne.path !== path) {
      try { await db.storage.from(BUCKET_CACHE).remove([ancienne.path]) } catch { /* orphelin bénin */ }
    }
    return true
  } catch {
    return false
  }
}

/**
 * Supprime tout le cache d'un dossier — fichiers ET lignes.
 * À appeler CÔTÉ SERVEUR (service_role) : les règles de stockage ne couvrent pas le
 * préfixe `cache/`, donc un appel depuis le navigateur échoue en silence. C'était le cas
 * jusqu'au 03/09, et les PDF des chantiers supprimés survivaient indéfiniment. (R15)
 *
 * Ne lève jamais : une purge ratée ne doit pas empêcher la suppression du chantier.
 * @returns {Promise<number>} nombre de fichiers effectivement supprimés.
 */
export async function purgerCache(db, dossierId) {
  try {
    const dossierPrefix = `${PREFIXE_CACHE}/${dossierId}`
    const { data: fichiers } = await db.storage.from(BUCKET_CACHE).list(dossierPrefix, { limit: 1000 })
    const chemins = (fichiers || []).filter(f => f?.name).map(f => `${dossierPrefix}/${f.name}`)
    if (chemins.length > 0) {
      await db.storage.from(BUCKET_CACHE).remove(chemins)
    }
    await db.from('documents_cache').delete().eq('dossier_id', dossierId)
    return chemins.length
  } catch {
    return 0
  }
}
