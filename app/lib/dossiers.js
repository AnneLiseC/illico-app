// app/lib/dossiers.js

export const STATUT_CONFIG = {
  a_contacter:       { label: 'À contacter',          color: 'bg-blue-100 text-blue-700' },
  a_relancer:        { label: 'À relancer',            color: 'bg-orange-100 text-orange-700' },
  devis_en_attente:  { label: 'Devis en attente',      color: 'bg-yellow-100 text-yellow-700' },
  devis_a_modifier:  { label: 'Devis à modifier',      color: 'bg-red-100 text-red-600' },
  en_cours_chantier: { label: 'En cours de chantier',  color: 'bg-green-100 text-green-700' },
  termine:           { label: 'Terminé',               color: 'bg-gray-100 text-gray-600' },
}

// Calcul du statut en fonction de l'avancement réel du dossier
export function calcStatut(dossier) {
  // Terminé = sélection manuelle
  if (dossier.statut === 'termine') return 'termine'

  // En cours de chantier = date démarrage renseignée
  if (dossier.date_demarrage_chantier) return 'en_cours_chantier'

  const comptes  = dossier.comptes_rendus || []
  const devis    = dossier.devis_artisans || []
  const hasR2    = comptes.some(cr => cr.type_visite === 'r2')
  const hasR3    = comptes.some(cr => cr.type_visite === 'r3')
  const hasPositif = devis.some(d => ['accepte', 'en_attente', 'recu'].includes(d.statut))
  const hasRefuse  = devis.some(d => d.statut === 'refuse')

  // Devis à modifier : R3 effectuée + au moins un devis refusé, aucun positif
  if (hasR3 && hasRefuse && !hasPositif) return 'devis_a_modifier'

  // Devis en attente : R2 effectuée + au moins un devis positif
  if (hasR2 && hasPositif) return 'devis_en_attente'

  // À relancer : frais de consultation renseignés mais pas réglés ni offerts
  const fraisDefinis  = (dossier.frais_consultation ?? 0) > 0
  const fraisNonRegle = dossier.frais_statut !== 'regle' && dossier.frais_statut !== 'offerts'
  if (!dossier.contrat_signe && fraisDefinis && fraisNonRegle && devis.length === 0) return 'a_relancer'

  return 'a_contacter'
}

// 🔹 Filtrage par rôle + onglet
export function getDossiersByScope(dossiers, profile, onglet, agentes) {
  const isAdmin = profile?.role === 'admin'
  if (!isAdmin) return dossiers
  if (onglet === 'tous') return dossiers
  if (onglet === 'moi') return dossiers.filter(d => d.referente?.role === 'admin')
  return dossiers.filter(d => d.referente?.id === onglet)
}

// 🔹 Filtrage global (recherche + statut + typologie)
export function getFilteredDossiers(dossiers, recherche, filtreStatut, filtreTypo, nomClientFn) {
  return dossiers.filter(d => {
    const matchRecherche = `${d.reference} ${nomClientFn(d.client)} ${d.client?.adresse || ''}`
      .toLowerCase()
      .includes(recherche.toLowerCase())

    const matchStatut = filtreStatut === 'tous' || calcStatut(d) === filtreStatut
    const matchTypo = filtreTypo === 'tous' || d.typologie === filtreTypo

    return matchRecherche && matchStatut && matchTypo
  })
}

// 🔹 Alertes devis
export function getAlertesDevis(dossiers, today = new Date()) {
  return dossiers.filter(d => {
    if (!d.date_limite_devis) return false
    if (calcStatut(d) === 'termine') return false
    const limite = new Date(d.date_limite_devis)
    const diff = (limite - today) / (1000 * 60 * 60 * 24)
    return diff <= 7 && diff >= 0
  })
}

// 🔹 Compteurs
export function getCompteurs(dossiers) {
  return {
    aTraiter:   dossiers.filter(d => ['a_contacter', 'a_relancer'].includes(calcStatut(d))).length,
    enDevis:    dossiers.filter(d => ['devis_en_attente', 'devis_a_modifier'].includes(calcStatut(d))).length,
    enChantier: dossiers.filter(d => calcStatut(d) === 'en_cours_chantier').length,
    termines:   dossiers.filter(d => calcStatut(d) === 'termine').length,
    total:      dossiers.length,
  }
}
