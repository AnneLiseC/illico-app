// app/lib/crRegles.js
// Règles rédactionnelles des comptes-rendus, ADAPTÉES au nouveau système structuré (actions).
// Reprend les consignes éditoriales de l'ancien générateur (api/cr/route.js) + un CONTEXTE par
// type de visite, réécrit pour piloter l'extraction d'ACTIONS (pas de la prose). Utilisé par
// /api/actions/suggest. L'ancien endpoint prose garde ses propres règles (inchangé).

// Consignes de fond, communes à tous les types (même esprit que l'ancien CR).
export const CONSIGNES_GENERALES = `CONSIGNES DE RÉDACTION (à respecter dans chaque action) :
- Ton professionnel, simple et factuel.
- Toujours utiliser le terme « client » / « clients ».
- Corriger l'orthographe, la grammaire et la conjugaison.
- Reprendre EXACTEMENT les noms propres, entreprises, produits, références et matériaux fournis ; ne jamais les modifier.
- Restituer uniquement ce qui est réellement constaté ou indiqué ; ne rien inventer ni déduire.
- Éviter les répétitions : une même information ne doit apparaître qu'une seule fois.
- Mettre en avant les décisions et validations lorsqu'elles existent.
- Signaler les points de vigilance seulement s'ils ont un impact réel.
- Éviter les formulations alarmistes, excessivement administratives ou juridiques.
- Ne jamais utiliser d'emojis ou de pictogrammes.`

export const TYPES_VISITE = {
  r1: 'R1 – Première visite / visite technique',
  r2: 'R2 – Visite avec artisans',
  r3: 'R3 – Présentation des devis',
  suivi: 'Visite de suivi de chantier',
  reception: 'Visite de réception de chantier',
}
export const ORDRE_TYPES = ['r1', 'r2', 'r3', 'suivi', 'reception']

// Contexte + orientation des ACTIONS par type de visite.
const CONTEXTE_ACTIONS = {
  r1: `CONTEXTE R1 — visite courtier + client uniquement : aucun artisan retenu, aucun devis, aucun planning.
Oriente les actions vers : l'état des lieux, le périmètre des travaux (par pièce/zone), les contraintes techniques observées, et surtout les ARTISANS/corps d'état à SOLLICITER (portee "generale").
N'émets AUCUNE date de planning ni montant. Statuts utiles : information, a_programmer, a_surveiller.`,
  r2: `CONTEXTE R2 — visite technique avec les artisans sélectionnés, avant devis.
Oriente les actions vers : les travaux prévus par artisan (portee "lot" quand le corps d'état est clair), les contraintes techniques et les travaux complémentaires à chiffrer. Souligne la VALIDATION des artisans retenus.
Pas de montants ni de devis. Statuts utiles : acte, en_attente, a_surveiller, information.`,
  r3: `CONTEXTE R3 — présentation des devis au client (à l'agence).
Oriente les actions vers les ARBITRAGES : lots/devis validés, refusés ou à compléter, décisions prises, devis signés. Ne décris pas le suivi de chantier.
Statuts utiles : acte (validé/signé), refuse, en_attente (à compléter).`,
  suivi: `CONTEXTE SUIVI — constat d'avancement du chantier.
Oriente les actions vers : les travaux réalisés depuis la dernière visite, l'état par lot, les décisions et les points à suivre, les réserves en cours. N'utilise que des échéances FUTURES pour les dates.`,
  reception: `CONTEXTE RÉCEPTION — réception des travaux.
Oriente les actions vers les RÉSERVES constatées, formulées de façon factuelle, avec un DÉLAI de levée lorsqu'il est connu (statut "date_limite" + statut_date). Mentionne les travaux réceptionnés. Ne refais pas l'historique du chantier.`,
}

// Bloc de règles à injecter dans le prompt de /api/actions/suggest selon le type de visite.
export function reglesActions(type) {
  const ctx = CONTEXTE_ACTIONS[type] || ''
  return ctx ? `${CONSIGNES_GENERALES}\n\n${ctx}` : CONSIGNES_GENERALES
}
