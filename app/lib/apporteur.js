// app/lib/apporteur.js
// La grille de commission apporteur — logique pure, testable, sans React ni réseau.
//
// CE QUE LA GRILLE FAIT, ET CE QU'ELLE NE FAIT PAS
//
// Elle PROPOSE un taux d'après le montant du chantier. Elle ne décide rien : le taux
// réellement appliqué est celui écrit sur le dossier (`dossiers.apporteur_pourcentage`),
// que l'agente peut corriger. C'est indispensable — le bonus « locaux professionnels »
// se décide au cas par cas, en fonction du local, et n'a donc aucune formule.
//
// Elle appartient à la SOCIÉTÉ, pas au produit. Celle de Martigues est 5 / 7 / 10 aux
// seuils 10 000 / 50 000 / 100 000 € ; un autre franchisé aura la sienne, ou aucune.
// Aucun de ces chiffres n'est écrit dans le code.
//
// ⚠️ DEUX UNITÉS DIFFÉRENTES DANS LE MÊME OBJET, ET C'EST VOULU :
//   · `seuil_ttc` se compare au total des devis signés en **TTC** — c'est le montant
//     dont on parle avec un agent immobilier (« un chantier à 50 000 € ») ;
//   · `taux` est en **POINTS** (5 = 5 %) et la commission se calcule ensuite en **HT**,
//     comme tout le reste du module apporteur.
// Mélanger les deux, c'est le défaut R20 qui lisait un taux de 1 % comme 100 %.

/**
 * Met une grille brute en forme exploitable : paliers valides, triés du plus GRAND
 * seuil au plus petit.
 *
 * Le tri décroissant n'est pas cosmétique : `tauxSelonGrille` renvoie le premier palier
 * atteint, donc l'ordre porte la règle. Trier ici une fois pour toutes évite d'avoir à
 * faire confiance à l'ordre de saisie — un franchisé qui saisit ses paliers dans le
 * désordre obtiendrait sinon un taux faux, en silence.
 *
 * Un palier est retenu s'il a un seuil ET un taux numériques, seuil ≥ 0 et
 * taux entre 0 et 100. Tout le reste est écarté sans bruit : une grille à moitié
 * saisie doit dégrader vers « pas de proposition », jamais vers une proposition fausse.
 *
 * @param {*} brut le contenu de societes.grille_apporteur
 * @returns {{seuil_ttc:number, taux:number}[]} trié par seuil décroissant
 */
export function normaliserGrille(brut) {
  const paliers = Array.isArray(brut?.paliers) ? brut.paliers : []
  // ⚠️ `Number(null)` vaut 0, et `Number('')` aussi. Sans ce filtre préalable, un palier
  // au seuil manquant devenait « à partir de 0 € » : le taux s'appliquait à TOUS les
  // chantiers, y compris ceux que la grille exclut. Défaut trouvé par le test le 10/09,
  // avant qu'il ne coûte quoi que ce soit.
  const renseigne = (v) => v !== null && v !== undefined && v !== ''
  return paliers
    .filter(p => renseigne(p?.seuil_ttc) && renseigne(p?.taux))
    .map(p => ({ seuil_ttc: Number(p.seuil_ttc), taux: Number(p.taux) }))
    .filter(p => Number.isFinite(p.seuil_ttc) && p.seuil_ttc >= 0
              && Number.isFinite(p.taux) && p.taux >= 0 && p.taux <= 100)
    .sort((a, b) => b.seuil_ttc - a.seuil_ttc)
}

/**
 * Le taux proposé pour un montant de travaux, ou null si aucun palier n'est atteint.
 *
 * null a un sens précis et différent de 0 : « la grille ne dit rien pour ce montant ».
 * Sous le premier seuil, la commission est nulle (décision du 10/09 : « en dessous de
 * 10 000 €, c'est un restaurant, donc commission nulle ») — mais c'est l'appelant qui
 * traduit ce null en 0, pas la grille, pour qu'une grille vide et un chantier trop
 * petit restent distinguables à l'écran.
 *
 * @param {*} grille contenu brut de societes.grille_apporteur
 * @param {number} totalTravauxTTC total des devis SIGNÉS, TTC
 * @returns {{taux:number, seuil_ttc:number}|null}
 */
export function tauxSelonGrille(grille, totalTravauxTTC) {
  const montant = Number(totalTravauxTTC)
  if (!Number.isFinite(montant)) return null
  const paliers = normaliserGrille(grille)
  // Premier palier atteint en partant du plus élevé : « à partir de X ».
  return paliers.find(p => montant >= p.seuil_ttc) || null
}

/**
 * Phrase affichée à côté du champ, pour que l'agente voie POURQUOI ce taux est proposé.
 * Un chiffre pré-rempli sans justification serait accepté sans réfléchir.
 */
export function expliquerGrille(grille, totalTravauxTTC) {
  const paliers = normaliserGrille(grille)
  if (paliers.length === 0) return null
  const palier = tauxSelonGrille(grille, totalTravauxTTC)
  const euros = (n) => Number(n).toLocaleString('fr-FR') + ' €'
  if (!palier) {
    const plusBas = paliers[paliers.length - 1]
    return `Grille de l'agence : aucune commission en dessous de ${euros(plusBas.seuil_ttc)} de travaux.`
  }
  return `Grille de l'agence : ${palier.taux} % à partir de ${euros(palier.seuil_ttc)} de travaux TTC.`
}

/**
 * Grille → texte pour l'écran de paramètres, et l'inverse.
 * Une ligne par palier, « seuil : taux ». Volontairement tolérant à la saisie
 * (espaces, séparateurs de milliers, virgule décimale, signe %) : un écran de
 * paramètres qui refuse « 10 000 € » est un écran qu'on n'utilise pas.
 */
export function grilleVersTexte(grille) {
  return normaliserGrille(grille)
    .slice().sort((a, b) => a.seuil_ttc - b.seuil_ttc)
    .map(p => `${p.seuil_ttc} : ${p.taux}`)
    .join('\n')
}

/**
 * @returns {{grille:{paliers:Array}, erreurs:string[]}} — les erreurs nomment la LIGNE
 * fautive. « Grille invalide » sans dire laquelle est inutilisable.
 */
export function texteVersGrille(texte) {
  const lignes = String(texte || '').split('\n').map(l => l.trim()).filter(Boolean)
  const paliers = []
  const erreurs = []
  const nombre = (s) => Number(String(s).replace(/[\s %€]/g, '').replace(',', '.'))

  for (const [i, ligne] of lignes.entries()) {
    const m = /^(.+?)\s*[:=]\s*(.+)$/.exec(ligne)
    if (!m) { erreurs.push(`Ligne ${i + 1} : écrire « seuil : taux », par exemple « 10000 : 5 ».`); continue }
    const seuil = nombre(m[1])
    const taux  = nombre(m[2])
    if (!Number.isFinite(seuil) || seuil < 0) { erreurs.push(`Ligne ${i + 1} : le seuil « ${m[1].trim()} » n'est pas un montant.`); continue }
    if (!Number.isFinite(taux) || taux < 0 || taux > 100) { erreurs.push(`Ligne ${i + 1} : le taux « ${m[2].trim()} » doit être entre 0 et 100.`); continue }
    if (paliers.some(p => p.seuil_ttc === seuil)) { erreurs.push(`Ligne ${i + 1} : le seuil ${seuil} est déjà défini plus haut.`); continue }
    paliers.push({ seuil_ttc: seuil, taux })
  }

  paliers.sort((a, b) => a.seuil_ttc - b.seuil_ttc)

  // Une grille où un palier plus haut rapporte MOINS est presque sûrement une faute de
  // frappe. On la signale sans la refuser : c'est peut-être voulu, et c'est son argent.
  for (let i = 1; i < paliers.length; i++) {
    if (paliers[i].taux < paliers[i - 1].taux) {
      erreurs.push(`Attention : à partir de ${paliers[i].seuil_ttc} € le taux (${paliers[i].taux} %) est plus BAS qu'au palier précédent (${paliers[i - 1].taux} %). Volontaire ?`)
    }
  }

  return { grille: { paliers }, erreurs }
}
