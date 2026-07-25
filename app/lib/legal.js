// app/lib/legal.js
// Informations légales centralisées, utilisées par les pages PUBLIQUES /confidentialite
// et /cgu et par la section « Mentions légales » des paramètres.
//
// ⚠️ À COMPLÉTER par l'éditrice avant publication (valeurs que je ne peux pas inventer) :
//    formeJuridique, siret, adresse, majDate. Une relecture par un conseil juridique est
//    recommandée (comme indiqué en tête des documents source).

export const EDITEUR = {
  nom: 'Anne-Lise Caillet',
  formeJuridique: '[À COMPLÉTER — ex. entreprise individuelle]',
  siret: '[À COMPLÉTER — SIRET]',
  adresse: '[À COMPLÉTER — adresse professionnelle]',
  contactEmail: 'anne-lise.caillet@outlook.com',
}

// Date de dernière mise à jour affichée en tête des pages légales.
export const MAJ_DATE = '[À COMPLÉTER — date de mise en ligne]'

// Durées de conservation (valeurs par défaut recommandées — modifiables).
export const DUREES = {
  compteApresResiliation: 'anonymisation ou suppression dans un délai de 12 mois après la fin du contrat',
  journauxConnexion: '12 mois',
}

export const APP_URL = 'https://www.batilis-app.fr'

// Documents RGPD téléchargeables (déposés dans /public/legal).
export const DOCS_RGPD = [
  { fichier: '/legal/registre-des-traitements.pdf', titre: 'Registre des activités de traitement', desc: 'Document interne (art. 30 RGPD).' },
  { fichier: '/legal/contrat-sous-traitance-dpa.pdf', titre: 'Contrat de sous-traitance (DPA)', desc: 'Modèle art. 28 RGPD, à signer avec chaque client.' },
]
