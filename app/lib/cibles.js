// app/lib/cibles.js
// Résolution de la cible de calendrier (= calendrier externe où pousser un
// RDV / une intervention). Fonctions PURES : pas de React, pas de fetch, pas
// d'effet de bord. Partagées par le planning (3a) et la fiche chantier (3b).
//
// ⚠️ INERTE au runtime : tant que le push lit process.env.GOOGLE_CALENDAR_ID
// (lot 4 non fait), écrire/résoudre cible_id n'a aucun effet sur la sync.

// Détermine l'agence qui pilote la résolution de la cible, par priorité
// décroissante :
//   1. l'agence du DOSSIER choisi (un événement rattaché appartient à son agence) ;
//   2. l'agence ACTIVE de la navbar (admin ayant sélectionné une agence) ;
//   3. l'agence du SÉLECTEUR de la modale (admin en vue « toutes agences ») ;
//   4. l'agence de la PERSONNE (cas agente, mono-agence).
// Renvoie un uuid d'agence ou null (admin vue toutes, sans dossier ni sélection).
export function determinerAgenceConcernee({ dossier, agenceActive, formAgenceId, profileAgenceId }) {
  return dossier?.agence_id || agenceActive || formAgenceId || profileAgenceId || null
}

// Résout la cible par défaut à pré-sélectionner. Renvoie un cible_id (uuid) ou null.
// Règle (dans l'ordre) :
//   1. le DÉFAUT PERSO de la personne gagne, s'il pointe une cible visible ;
//   2. sinon, la première cible d'AGENCE active de l'agence concernée
//      (la plus ancienne = premier calendrier partagé, tri created_at) ;
//   3. sinon null → aucune pré-sélection (le front imposera le choix).
export function resoudreCibleDefaut({ profile, cibles, agenceConcernee }) {
  const liste = cibles || []

  // 1. Défaut perso de la personne (prioritaire), s'il existe dans la liste visible.
  const perso = profile?.cible_calendrier_defaut_id
  if (perso && liste.some(c => c.id === perso)) return perso

  // 2. Première cible d'agence active de l'agence concernée.
  if (agenceConcernee) {
    const dAgence = liste
      .filter(c => c.agence_id === agenceConcernee && c.actif)
      .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
    if (dAgence.length) return dAgence[0].id
  }

  // 3. Rien à pré-sélectionner.
  return null
}

// Libellé d'affichage d'une cible dans un <select> : libellé + nature (perso/agence).
export function libelleCible(cible) {
  if (!cible) return ''
  return `${cible.libelle}${cible.user_id ? ' (perso)' : ' (agence)'}`
}
