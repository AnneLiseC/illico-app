// app/lib/cr-photos.js
// Repères de positionnement des photos dans le texte d'un CR : « [[photo:ID]] » où ID est
// l'IDENTIFIANT STABLE de la photo (photos.id, uuid). Inséré par l'éditrice là où elle
// veut la photo ; le PDF le remplace par l'image (rendu inline). Un id stable (≠ numéro
// de position) survit à l'ajout/retrait d'autres photos jointes. Les photos sans repère
// restent empilées à la fin. Logique pure (partagée PDF + affichage), testable.

// Une regex par appel (pas de lastIndex partagé). ID = uuid ou tout token [\w-].
const RE = () => /\[\[photo:([\w-]+)\]\]/g

// Vrai si la ligne contient au moins un repère.
export function contientMarqueurPhoto(ligne) {
  return RE().test(String(ligne || ''))
}

// Sépare une ligne en { texte (sans les repères), ids (identifiants de photo, ordre d'apparition) }.
export function extraireMarqueursPhoto(ligne) {
  const s = String(ligne || '')
  const ids = []
  let m
  const re = RE()
  while ((m = re.exec(s)) !== null) ids.push(m[1])
  const texte = s.replace(RE(), ' ').replace(/[ \t]{2,}/g, ' ').trim()
  return { texte, ids }
}

// Retire les repères d'un texte (aperçus « stripMarkdown » : on ne veut pas voir
// « [[photo:…]] » brut). Remplacés par rien, espaces normalisés.
export function retirerMarqueursPhoto(texte) {
  return String(texte || '').replace(RE(), '').replace(/[ \t]{2,}/g, ' ')
}
