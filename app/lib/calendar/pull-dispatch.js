// app/lib/calendar/pull-dispatch.js
// B9-6 — aiguillage du pull par fournisseur de la cible. Le CRON itère TOUTES les cibles
// actives (tous fournisseurs) et appelle ces fonctions ; derrière, le même moteur agnostique
// (pull-engine.js) applique les écritures. Un fournisseur inconnu -> erreur explicite dans le
// rapport (isolation par cible côté route : n'arrête pas les autres).

import { applyPullCibleGoogle, pullRecurrentsCibleGoogle } from './pull-google'
import { applyPullCibleICloud, pullRecurrentsCibleICloud } from './pull-icloud'
import { applyPullCibleMicrosoft, pullRecurrentsCibleMicrosoft } from './pull-microsoft'

// Pull incrémental (B4-B6) d'une cible, selon son fournisseur. Renvoie { report, applied }.
export async function applyPullCible(cible) {
  if (cible.fournisseur === 'google') return applyPullCibleGoogle(cible)
  if (cible.fournisseur === 'icloud') return applyPullCibleICloud(cible)
  if (cible.fournisseur === 'outlook') return applyPullCibleMicrosoft(cible)
  return { report: { cible_id: cible.id, agenda_nom: cible.agenda_nom, erreur: `fournisseur non supporté: ${cible.fournisseur}` }, applied: {} }
}

// Balayage récurrents (B7 / B9-5) d'une cible, selon son fournisseur. Renvoie { report, applied }.
export async function pullRecurrentsCible(cible) {
  if (cible.fournisseur === 'google') return pullRecurrentsCibleGoogle(cible)
  if (cible.fournisseur === 'icloud') return pullRecurrentsCibleICloud(cible)
  if (cible.fournisseur === 'outlook') return pullRecurrentsCibleMicrosoft(cible)
  return { report: { cible_id: cible.id, agenda_nom: cible.agenda_nom, erreur: `fournisseur non supporté: ${cible.fournisseur}` }, applied: { inserts: 0 } }
}
