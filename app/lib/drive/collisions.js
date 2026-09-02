// app/lib/drive/collisions.js
// Suffixe anti-collision pour le NOM du dossier chantier. Deux chantiers du MÊME client à la
// MÊME date métier (date_premier_rdv || created_at) produisent le même « AAAA-MM-JJ NOM » →
// un seul dossier physique pour deux chantiers. On désambigüe : le PREMIER garde le nom nu,
// les suivants reçoivent « _1 », « _2 »… (pas de renommage de l'existant).
//
// Clé de tri = created_at (id en départage), et SURTOUT PAS reference : les références portent
// un préfixe par référente (AM / CT / ES / MR). Un tri alphabétique de reference mélangerait
// les préfixes — un nouveau « 2026-AM-050 » passerait avant un « 2026-CT-040 » existant, lui
// volerait le nom nu et forcerait le renommage d'un dossier déjà miroité. created_at est
// immuable et monotone : un dossier créé plus tard prend toujours le rang suivant, quel que
// soit son préfixe de référence. NE PAS « simplifier » cette clé en reference.

import { dateDossier } from './taxonomie'

// Date métier d'un dossier (celle qui nomme le dossier) : date_premier_rdv sinon created_at.
function dateMetier(d) {
  return dateDossier(d?.date_premier_rdv || d?.created_at)
}

// PUR et testable : à partir de la liste des dossiers d'un client et du dossier courant,
// renvoie le suffixe ('' | '_1' | '_2'…). Ne retient que les dossiers de MÊME date métier,
// trie par created_at (id en départage), et attribue le rang (0 → nom nu).
export function suffixeDepuisGroupe(dossiers, dossierCourant) {
  const cle = dateMetier(dossierCourant)
  const groupe = (dossiers || []).filter(d => dateMetier(d) === cle)
  if (groupe.length <= 1) return ''
  groupe.sort((a, b) =>
    String(a.created_at || '').localeCompare(String(b.created_at || '')) ||
    String(a.id || '').localeCompare(String(b.id || ''))
  )
  const rang = groupe.findIndex(d => d.id === dossierCourant.id)
  return rang <= 0 ? '' : `_${rang}`
}

// Effet de bord (requête) : charge les dossiers du client puis délègue au pur. Non testé en
// unitaire (comme les routes) — toute la logique décidable est dans suffixeDepuisGroupe.
export async function suffixeCollisionDossier(db, dossier) {
  if (!dossier?.client_id) return ''
  const { data } = await db.from('dossiers')
    .select('id, created_at, date_premier_rdv')
    .eq('client_id', dossier.client_id)
  return suffixeDepuisGroupe(data || [], dossier)
}
