// app/lib/dossiers.js

// 🔹 Filtrage par rôle + onglet
export function getDossiersByScope(dossiers, profile, onglet, agentes) {
  const isAdmin = profile?.role === 'admin'
  if (!isAdmin) {
    return dossiers
  }
  if (onglet === 'tous') return dossiers
  if (onglet === 'moi') {
    return dossiers.filter(d => d.referente?.role === 'admin')
  }
  // Onglet agente (ID)
  return dossiers.filter(d => d.referente?.id === onglet)
}

// 🔹 Filtrage global (recherche + statut + typologie)
export function getFilteredDossiers(dossiers, recherche, filtreStatut, filtreTypo, nomClientFn) {
  return dossiers.filter(d => {
    const matchRecherche = `${d.reference} ${nomClientFn(d.client)} ${d.client?.adresse || ''}`
      .toLowerCase()
      .includes(recherche.toLowerCase())

    const matchStatut = filtreStatut === 'tous' || d.statut === filtreStatut
    const matchTypo = filtreTypo === 'tous' || d.typologie === filtreTypo

    return matchRecherche && matchStatut && matchTypo
  })
}

// 🔹 Alertes devis
export function getAlertesDevis(dossiers, today = new Date()) {
  return dossiers.filter(d => {
    if (!d.date_limite_devis) return false

    const limite = new Date(d.date_limite_devis)
    const diff = (limite - today) / (1000 * 60 * 60 * 24)

    return diff <= 7 && diff >= 0 && d.statut === 'en_cours'
  })
}

// 🔹 Compteurs
export function getCompteurs(dossiers) {
  return {
    enCours: dossiers.filter(d => d.statut === 'en_cours').length,
    enAttente: dossiers.filter(d => d.statut === 'en_attente').length,
    termines: dossiers.filter(d => d.statut === 'termine').length,
    total: dossiers.length,
  }
}