// app/lib/legal.js
// Informations légales centralisées, utilisées par les pages PUBLIQUES /confidentialite
// et /cgu et par la section « Mentions légales » des paramètres.
//
// Valeurs renseignées par l'éditrice. Les documents source (CGS, DPA, politique de
// confidentialité, registre) sont tenus à jour dans OneDrive et relus par un conseil
// juridique ; toute modification de fond doit rester cohérente avec eux.

export const EDITEUR = {
  nom: 'Anne-Lise Caillet',
  formeJuridique: 'Entreprise individuelle (micro-entrepreneur)',
  siret: '99040978100020',
  adresse: '22 rue Ramade, 13500 Martigues',
  contactEmail: 'anne-lise.caillet@outlook.com',
}

// Date de dernière mise à jour affichée en tête des pages légales.
// MAJ_DATE : conditions générales d'utilisation (/cgu).
// MAJ_CONF : politique de confidentialité (/confidentialite), alignée sur le document source.
export const MAJ_DATE = '26/07/2026 — date de mise en ligne'
export const MAJ_CONF = '24/09/2026'

// Durées de conservation — alignées sur la politique de confidentialité et le registre (art. 30).
export const DUREES = {
  compteApresResiliation: '3 mois après la fin du contrat, puis suppression ou anonymisation définitive',
  journauxConnexion: 'objectif : ne pas dépasser 6 mois',
}

export const APP_URL = 'https://www.batilis-app.fr'

// Documents RGPD téléchargeables (déposés dans /public/legal).
export const DOCS_RGPD = [
  { fichier: '/legal/registre-des-traitements.pdf', titre: 'Registre des activités de traitement', desc: 'Document interne (art. 30 RGPD).' },
  { fichier: '/legal/contrat-sous-traitance-dpa.pdf', titre: 'Contrat de sous-traitance (DPA)', desc: 'Modèle art. 28 RGPD, à signer avec chaque client.' },
]
