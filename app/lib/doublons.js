// app/lib/doublons.js
// Détection de doublon à la saisie d'un client (cahier des charges v6 §4).
//
// POURQUOI — un même client saisi deux fois, c'est deux fiches, deux historiques, et
// deux dossiers Drive jumeaux. Ça s'est déjà produit : EPPINGER et BRUNET avaient chacun
// deux dossiers avant la reprise du nommage.
//
// CE QUE ÇA N'EST PAS — un blocage. La fonction ne décide rien : elle SIGNALE, et
// l'utilisateur tranche. Deux personnes peuvent légitimement porter le même nom, et un
// même client peut avoir plusieurs chantiers. Refuser la création serait pire que le
// doublon : on rendrait l'application inutilisable pour rattraper une erreur rare.
//
// Fonctions PURES → testables sans base ni réseau.

// Casse, accents, ponctuation et espaces multiples : « Jean-Luc DUPONT » et
// « jean luc dupont » sont le même nom pour un humain, donc pour nous aussi.
export function normaliserTexte(v) {
  return String(v || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Un numéro se compare sur ses CHIFFRES. « 06 12 34 56 78 », « 0612345678 » et
// « +33 6 12 34 56 78 » sont le même téléphone : on ramène l'indicatif français à 0 et
// on ne garde que les dix chiffres significatifs.
export function normaliserTelephone(v) {
  let d = String(v || '').replace(/\D+/g, '')
  if (d.startsWith('0033')) d = d.slice(4)
  else if (d.startsWith('33') && d.length > 10) d = d.slice(2)
  if (d.length === 9) d = '0' + d
  return d.length >= 9 ? d : ''
}

export function normaliserEmail(v) {
  return String(v || '').trim().toLowerCase()
}

// Motifs, du plus certain au plus douteux. L'ordre compte : c'est lui qui décide du
// message affiché quand plusieurs motifs s'appliquent au même client.
const MOTIFS = [
  { cle: 'email',        certitude: 'certain',  libelle: 'même adresse e-mail' },
  { cle: 'telephone',    certitude: 'certain',  libelle: 'même numéro de téléphone' },
  { cle: 'nom_prenom',   certitude: 'probable', libelle: 'même nom et même prénom' },
  { cle: 'nom_adresse',  certitude: 'probable', libelle: 'même nom et même adresse' },
  { cle: 'nom',          certitude: 'faible',   libelle: 'même nom' },
]

/**
 * Cherche les clients existants qui ressemblent au candidat.
 *
 * @param candidat  { nom, prenom, email, email2, telephone, telephone2, adresse }
 * @param existants liste de clients déjà en base (mêmes champs + id)
 * @returns [{ client, motifs: [{cle, certitude, libelle}], certitude }] trié du plus
 *          certain au plus douteux. Vide s'il n'y a rien à signaler.
 */
export function chercherDoublons(candidat = {}, existants = []) {
  const cNom     = normaliserTexte(candidat.nom)
  const cPrenom  = normaliserTexte(candidat.prenom)
  const cAdresse = normaliserTexte(candidat.adresse)
  const cEmails  = [candidat.email, candidat.email2].map(normaliserEmail).filter(Boolean)
  const cTels    = [candidat.telephone, candidat.telephone2].map(normaliserTelephone).filter(Boolean)

  // Sans nom ni contact, il n'y a rien à comparer.
  if (!cNom && cEmails.length === 0 && cTels.length === 0) return []

  const resultats = []
  for (const cl of existants || []) {
    const cles = new Set()

    const eEmails = [cl.email, cl.email2].map(normaliserEmail).filter(Boolean)
    if (cEmails.some(e => eEmails.includes(e))) cles.add('email')

    const eTels = [cl.telephone, cl.telephone2].map(normaliserTelephone).filter(Boolean)
    if (cTels.some(t => eTels.includes(t))) cles.add('telephone')

    const eNom = normaliserTexte(cl.nom)
    const memeNom = !!cNom && eNom === cNom
    if (memeNom && !!cPrenom && normaliserTexte(cl.prenom) === cPrenom) cles.add('nom_prenom')
    if (memeNom && !!cAdresse && normaliserTexte(cl.adresse) === cAdresse) cles.add('nom_adresse')
    if (memeNom) cles.add('nom')

    if (cles.size === 0) continue

    // Un motif fort absorbe le motif faible : signaler « même nom » sous « même e-mail »
    // n'apprend rien et allonge le message.
    const motifs = MOTIFS.filter(m => cles.has(m.cle))
    const forts = motifs.filter(m => m.certitude !== 'faible')
    resultats.push({
      client: cl,
      motifs: forts.length ? forts : motifs,
      certitude: (forts.length ? forts : motifs)[0].certitude,
    })
  }

  const rang = { certain: 0, probable: 1, faible: 2 }
  return resultats.sort((a, b) => rang[a.certitude] - rang[b.certitude])
}
