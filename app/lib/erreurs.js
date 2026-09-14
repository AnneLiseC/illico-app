// app/lib/erreurs.js
// Traduction des erreurs techniques en français, pour l'écran.
//
// ═══════════════════════════════════════════════════════════════════════════════════════
// LE PROBLÈME, MESURÉ LE 14/09
//
// 128 endroits de l'application affichaient `error.message` tel quel. Deux formes :
//   setErreur('Erreur : ' + error.message)   → un mot français devant une phrase anglaise
//   setErreur(err.message)                   → même pas ça
//
// Ce que le client lisait à l'écran ressemblait à :
//   duplicate key value violates unique constraint "devis_artisans_dossier_id_key"
//
// Deux dégâts, et le second est le plus grave.
//
//   1. Ça ne fait pas sérieux. Un client qui voit de l'anglais technique sur un dossier de
//      travaux à 50 000 € doute de tout le reste.
//
//   2. ÇA DONNE LE PLAN DE LA BASE. Noms de tables, de colonnes, de contraintes. C'est la
//      seule fuite d'information réelle de l'application — bien plus que les `console.log`,
//      qui n'affichent au pire que des données déjà sous les yeux de l'utilisateur connecté.
//
// ═══════════════════════════════════════════════════════════════════════════════════════
// CE QUE CE MODULE FAIT, ET POURQUOI IL GARDE UN CODE
//
// Il rend UNE phrase française, suivie d'un code court : « [ERR-23505] ».
//
// Le code n'est pas décoratif, c'est une demande explicite d'Anne-Lise : le client
// photographie son écran et le lui envoie. Sans repère, une capture disant « Une erreur
// est survenue » ne permet de chercher nulle part. Avec le code, elle sait immédiatement
// de quelle famille d'erreur il s'agit, sans que le client ait vu un seul nom de table.
//
// Le message technique complet n'est pas perdu : il part dans `console.error`. Invisible
// du client, disponible pour qui ouvre la console.
//
// ═══════════════════════════════════════════════════════════════════════════════════════
// RÈGLE DE TRADUCTION
//
// On ne traduit QUE ce qu'on reconnaît. Un code inconnu donne une phrase neutre et son
// code, JAMAIS le message d'origine : c'est précisément l'inconnu qui risque de contenir
// un nom de table. Mieux vaut une phrase vague qu'une fuite.
//
// SERVEUR OU NAVIGATEUR : ce module ne dépend de rien, il s'utilise des deux côtés.
// ═══════════════════════════════════════════════════════════════════════════════════════

// Codes Postgres, PostgREST et Supabase réellement rencontrés dans cette application.
// La phrase parle du MÉTIER, pas de la technique : « cet enregistrement existe déjà »
// et non « violation de contrainte d'unicité ».
const PAR_CODE = {
  // ── Postgres ──
  '23505': 'Cet enregistrement existe déjà.',
  '23503': 'Un élément lié est introuvable, ou il est encore utilisé ailleurs.',
  '23502': 'Un champ obligatoire n’est pas renseigné.',
  '23514': 'Une valeur saisie n’est pas autorisée.',
  '22001': 'Un texte saisi est trop long.',
  '22003': 'Un montant saisi est trop grand.',
  '22007': 'Une date saisie n’a pas un format valide.',
  '22P02': 'Une valeur saisie n’a pas le bon format.',
  '42501': 'Vous n’avez pas les droits nécessaires pour cette action.',
  '40001': 'Une autre modification a eu lieu en même temps. Recommencez.',
  '55P03': 'Cet élément est en cours de modification ailleurs. Réessayez dans un instant.',
  '57014': 'L’opération a pris trop de temps et a été interrompue.',
  '53300': 'Le service est momentanément saturé. Réessayez dans un instant.',

  // ── PostgREST (couche API de Supabase) ──
  // PGRST116 : un .single() qui ne trouve rien. Très fréquent après une suppression
  // faite dans un autre onglet.
  'PGRST116': 'Cet élément est introuvable. Il a peut-être été supprimé entre-temps.',
  'PGRST301': 'Votre session a expiré. Reconnectez-vous.',
  // PGRST204 : colonne absente du cache de schéma. C'est l'erreur du déploiement
  // incomplet — le code connaît une colonne que la base n'a pas encore, ou l'inverse.
  'PGRST204': 'L’application doit être rechargée pour prendre en compte une mise à jour.',
  'PGRST202': 'Cette fonction n’est pas disponible. Rechargez la page.',

  // ── HTTP nus, remontés par certaines routes ──
  '401': 'Votre session a expiré. Reconnectez-vous.',
  '403': 'Vous n’avez pas les droits nécessaires pour cette action.',
  '404': 'Cet élément est introuvable.',
  '409': 'Cet enregistrement existe déjà.',
  '413': 'Le fichier est trop volumineux.',
  '429': 'Trop de demandes d’affilée. Patientez quelques secondes.',
  '500': 'Le service a rencontré un problème. Réessayez.',
  '502': 'Le service est momentanément indisponible. Réessayez.',
  '503': 'Le service est momentanément indisponible. Réessayez.',
  '504': 'Le service met trop de temps à répondre. Réessayez.',
}

// Erreurs qui n'ont PAS de code : il faut les reconnaître au message. Chaque motif est
// large exprès — une même cause s'écrit différemment selon la couche qui la remonte.
const PAR_MOTIF = [
  [/failed to fetch|networkerror|network request failed|load failed/i,
    'La connexion a été interrompue. Vérifiez votre connexion internet.', 'RESEAU'],
  [/abort/i, 'L’opération a été interrompue.', 'ANNULE'],
  [/jwt|token|unauthor|invalid.*credential|session.*expir/i,
    'Votre session a expiré. Reconnectez-vous.', 'SESSION'],
  [/payload too large|exceeded the maximum allowed size|file size/i,
    'Le fichier est trop volumineux.', 'TAILLE'],
  [/mime type|not supported|invalid file type/i,
    'Ce type de fichier n’est pas accepté.', 'TYPE'],
  [/bucket not found|object not found|not_found/i,
    'Le fichier est introuvable. Il a peut-être été supprimé.', 'FICHIER'],
  [/already exists|duplicate/i, 'Cet enregistrement existe déjà.', 'DOUBLON'],
  [/row level security|rls/i, 'Vous n’avez pas les droits nécessaires pour cette action.', 'DROITS'],
  [/timeout|timed out/i, 'L’opération a pris trop de temps.', 'DELAI'],
  [/quota|rate limit|too many/i, 'Trop de demandes d’affilée. Patientez quelques secondes.', 'QUOTA'],
]

const PHRASE_INCONNUE = 'Une erreur est survenue.'

function texteErreur(error) {
  if (!error) return ''
  if (typeof error === 'string') return error
  return String(error.message || error.error_description || error.error || error.details || '')
}

function codeErreur(error) {
  if (!error || typeof error === 'string') return ''
  const brut = error.code ?? error.status ?? error.statusCode ?? ''
  return String(brut).trim()
}

// Repère stable pour une erreur qu'on ne sait pas nommer. Dérivé du message, donc la même
// erreur donne toujours le même code : deux captures d'écran différentes du même problème
// portent le même repère, ce qui est tout l'intérêt.
function empreinte(texte) {
  let h = 0
  for (let i = 0; i < texte.length; i++) h = ((h << 5) - h + texte.charCodeAt(i)) | 0
  return Math.abs(h).toString(36).toUpperCase().slice(0, 4).padStart(4, '0')
}

/**
 * Phrase française + code court, prêts à être affichés.
 *
 * @param {*} error      l'objet d'erreur (Supabase, fetch, Error, ou une simple chaîne)
 * @param {string} [contexte]  ce qu'on essayait de faire, en français : « Erreur upload PV »
 * @returns {string} par exemple « Erreur upload PV : Le fichier est trop volumineux. [ERR-413] »
 */
export function messageErreur(error, contexte) {
  const texte = texteErreur(error)
  const code = codeErreur(error)

  let phrase = PAR_CODE[code]
  let repere = code

  if (!phrase) {
    for (const [motif, fr, cle] of PAR_MOTIF) {
      if (motif.test(texte)) { phrase = fr; repere = cle; break }
    }
  }
  if (!phrase) {
    // Inconnu : on ne recopie SURTOUT pas le message d'origine, c'est lui qui porte les
    // noms de tables. Une empreinte du message sert de repère pour la capture d'écran.
    phrase = PHRASE_INCONNUE
    repere = repere || empreinte(texte || 'vide')
  }

  const marque = repere ? ` [ERR-${repere}]` : ''
  const prefixe = String(contexte || '').trim().replace(/\s*:\s*$/, '')
  return `${prefixe ? prefixe + ' : ' : ''}${phrase}${marque}`
}

/**
 * Écrit le détail technique dans la console, pour le diagnostic. Rien n'atteint l'écran.
 * Séparé de `messageErreur` pour que la traduction reste une fonction pure, testable et
 * utilisable côté serveur sans polluer les journaux.
 */
export function journaliserErreur(contexte, error) {
  try {
    console.error(`[${contexte || 'erreur'}]`, codeErreur(error) || '—', texteErreur(error), error)
  } catch { /* une console indisponible ne doit jamais casser l'application */ }
}

/**
 * Le geste complet, celui qu'on veut à l'appel : journaliser le détail ET rendre la phrase.
 */
export function erreurAffichable(error, contexte) {
  journaliserErreur(contexte, error)
  return messageErreur(error, contexte)
}
