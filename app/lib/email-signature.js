// app/lib/email-signature.js
// Signature et enveloppe HTML des emails MÉTIER (ceux qui partent à un client ou à un
// artisan). Fonctions PURES : aucune requête, aucun réseau — testables sans base.
//
// POURQUOI L'AGENCE, ET PAS BATILIS (11/09)
//
// Les mails se signaient « Cordialement, illiCO travaux » en dur. Sur un produit
// multi-tenant, c'est faux deux fois : le client d'une agence reçoit une signature
// anonyme, et rien ne lui dit qui le contacte ni comment joindre quelqu'un. Or les
// données existent déjà — `agences` porte nom, adresse, code postal, ville, téléphone
// et responsable. Il ne manquait que de les lire.
//
// L'EXPÉDITEUR TECHNIQUE RESTE UNIQUE (contact@batilis-app.fr) : un service d'envoi
// écrit depuis un domaine vérifié, pas depuis la boîte de chaque franchisé. C'est donc
// la SIGNATURE qui porte l'identité de l'agence, et le `replyTo` qui ramène la réponse
// chez la bonne personne — la référente du dossier. Décision confirmée le 11/09 : aucune
// autre solution n'existe sans faire connecter sa boîte à chaque franchisé, ce qui est
// ingérable à vendre.
//
// Le HTML reste volontairement pauvre — tableaux simples, styles en ligne, aucune image
// distante. Les clients de messagerie (Outlook en tête) ignorent le CSS externe, et une
// image distante fait basculer un message en « contenu bloqué ».

// Échappement HTML. Les valeurs viennent de la base, donc de saisies humaines : un nom
// d'agence contenant « & » ou « < » casserait le rendu, et l'échapper coûte une ligne.
export function echapper(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/**
 * Adresse postale sur une ligne : « 22 RUE RAMADE, 13500 Martigues ».
 * Chaque morceau est facultatif — une agence à moitié renseignée ne doit pas produire
 * « , 13500 » ni une virgule orpheline.
 */
export function adresseUneLigne(agence) {
  const rue = String(agence?.adresse || '').trim()
  const cpVille = [agence?.code_postal, agence?.ville].map(v => String(v || '').trim()).filter(Boolean).join(' ')
  return [rue, cpVille].filter(Boolean).join(', ')
}

/**
 * Téléphone français en lecture confortable : « 0659810681 » → « 06 59 81 06 81 ».
 * Tout autre format (numéro déjà espacé, indicatif +33, numéro étranger) est rendu tel
 * quel : mieux vaut un numéro non reformaté qu'un numéro déformé.
 */
export function telephoneLisible(tel) {
  const brut = String(tel || '').trim()
  if (/^0\d{9}$/.test(brut)) return brut.match(/\d{2}/g).join(' ')
  return brut
}

/**
 * Signature HTML d'une agence. Renvoie '' si l'agence est inconnue : un bloc vide vaut
 * mieux qu'une signature fantôme (« Cordialement, » suivi de rien).
 *
 * @param {object} agence  ligne `agences` (nom, adresse, code_postal, ville, telephone)
 * @param {object} [opts]
 * @param {string} [opts.formule]  formule de politesse ; null pour ne pas en mettre
 */
export function signatureAgence(agence, opts = {}) {
  const nom = String(agence?.nom || '').trim()
  if (!nom) return ''
  const formule = opts.formule === null ? '' : (opts.formule || 'Cordialement,')
  const adresse = adresseUneLigne(agence)
  const tel = telephoneLisible(agence?.telephone)

  const lignes = [
    `<div style="font-weight:600;color:#0f172a">${echapper(nom)}</div>`,
    adresse ? `<div>${echapper(adresse)}</div>` : '',
    tel ? `<div>Tél. <a href="tel:${echapper(tel.replace(/\s/g, ''))}" style="color:#4f46e5;text-decoration:none">${echapper(tel)}</a></div>` : '',
  ].filter(Boolean).join('')

  return `${formule ? `<p style="margin:16px 0 8px">${echapper(formule)}</p>` : ''}`
    + `<div style="font-size:13px;line-height:1.6;color:#475569;border-top:1px solid #e2e8f0;padding-top:12px;margin-top:8px">${lignes}</div>`
}

/**
 * Enveloppe un contenu dans le gabarit commun : corps lisible + signature de l'agence.
 *
 * Un seul gabarit pour tous les mails métier, pour que le jour où l'on corrige une
 * largeur ou une couleur, on le fasse à un seul endroit — et non dans quatorze chaînes
 * de caractères disséminées dans les routes.
 */
export function gabaritEmail({ contenu, agence, formule } = {}) {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#0f172a;max-width:560px">`
    + `${contenu || ''}`
    + `${signatureAgence(agence, { formule })}`
    + `</div>`
}
