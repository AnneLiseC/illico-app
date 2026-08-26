// app/lib/statutLibelle.js
// Libellé daté d'un statut d'action, pour l'app ET le PDF.
//
// La plupart des statuts ont un libellé fixe. Trois d'entre eux décrivent tantôt
// un événement à VENIR, tantôt un événement PASSÉ selon que `statut_date` est
// dans le futur ou le passé — le libellé s'adapte donc à la date :
//   - rappel      : futur → « À relancer le »      / passé → « Relancé le »
//   - en_attente  : futur → « En attente pour le »  / passé → « En attente depuis le »
//   - programme   : futur → « Programmé pour le »   / passé → « Programmé le »
// (« aujourd'hui » est traité comme le présent/à venir, pas comme du passé.)

const STATIQUES = {
  en_cours: 'Créée le',
  date_limite: 'À réaliser avant le',
  urgent: 'Urgent depuis le',
  refuse: 'Refusé le',
  en_retard: 'En retard depuis le',
  a_surveiller: 'À surveiller depuis le',
  a_programmer: 'À programmer pour le',
  information: 'Info du',
  quitus_transmis: 'Quitus transmis le',
  garder_memoire: 'Noté le',
  constate: 'Constaté le',
  acte: 'Acté le',
  cloture: 'Clôturé le',
}

const DYNAMIQUES = {
  rappel:     { futur: 'À relancer le',      passe: 'Relancé le' },
  en_attente: { futur: 'En attente pour le', passe: 'En attente depuis le' },
  programme:  { futur: 'Programmé pour le',  passe: 'Programmé le' },
}

// Renvoie le libellé (sans la date) pour un statut donné et sa date.
export function libelleStatut(statut, statutDate) {
  const dyn = DYNAMIQUES[statut]
  if (dyn) {
    const aujourdhui = new Date(); aujourdhui.setHours(0, 0, 0, 0)
    let passe = false
    if (statutDate) {
      const d = new Date(statutDate); d.setHours(0, 0, 0, 0)
      passe = d < aujourdhui // strictement avant → passé ; aujourd'hui = présent → futur
    }
    return passe ? dyn.passe : dyn.futur
  }
  return STATIQUES[statut] || ''
}
