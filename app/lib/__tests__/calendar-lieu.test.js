// app/lib/__tests__/calendar-lieu.test.js
// L'ADRESSE dans les événements de calendrier (14/09).
//
// Avant ce lot, AUCUN fournisseur ne remplissait le champ Lieu : ni `location` chez Google,
// ni `location.displayName` chez Graph, ni `LOCATION` dans l'ICS. L'artisan ouvrait le
// rendez-vous sur son téléphone et n'avait pas d'adresse, donc pas d'itinéraire.
//
// Deux pièges figés ici :
//   1. `rendez_vous.lieu` n'est PAS une adresse, c'est un TYPE ('client' | 'agence'). Il dit
//      OÙ CHERCHER l'adresse, il ne la contient pas.
//   2. Sans adresse connue, on n'écrit RIEN. Envoyer quelqu'un à l'agence pour un
//      rendez-vous de chantier est pire qu'un calendrier muet.

import { describe, it, expect } from 'vitest'
import { lieuRdv, lieuRdvParDefaut, lieuIntervention, estAdresseCorrigee } from '../calendar/mapping.js'
import { rdvToGoogleEvent, interventionToGoogleEvents } from '../calendar/google.js'
import { rdvToGraphEvent, interventionToGraphEvents } from '../calendar/microsoft.js'
import { rdvToICS, interventionToICS } from '../calendar/icloud.js'

const AGENCE = {
  nom: 'illiCO travaux Martigues', adresse: '22 RUE RAMADE',
  code_postal: '13500', ville: 'Martigues',
}
const DOSSIER = {
  reference: '2026-AM-027',
  adresse_chantier: '12 chemin des Oliviers, 13500 Martigues',
  client: { civilite: 'M.', prenom: 'Johan', nom: 'THOBY' },
}
const rdv = (o = {}) => ({
  id: 'RDV1', type_rdv: 'visite_technique_client', lieu: 'client',
  date_heure: '2026-09-20T08:00:00.000Z', duree_minutes: 60,
  dossier: DOSSIER, agence: AGENCE, ...o,
})
const inter = (o = {}) => ({
  id: 'INT1', type_intervention: 'periode',
  date_debut: '2026-09-20', date_fin: '2026-09-20',
  artisan: { entreprise: 'MJ RENOVATION' },
  dossier: DOSSIER, ...o,
})

describe('résolution du lieu', () => {
  it('lieu = client → l\'adresse du CHANTIER, pas celle du domicile ni de l\'agence', () => {
    expect(lieuRdv(rdv())).toBe('12 chemin des Oliviers, 13500 Martigues')
  })

  it('lieu = agence → l\'adresse de l\'agence, sur une ligne', () => {
    expect(lieuRdv(rdv({ lieu: 'agence' })))
      .toBe('illiCO travaux Martigues, 22 RUE RAMADE, 13500 Martigues')
  })

  it('une agence à moitié renseignée ne laisse pas de virgule orpheline', () => {
    expect(lieuRdv(rdv({ lieu: 'agence', agence: { nom: 'illiCO travaux Aix' } })))
      .toBe('illiCO travaux Aix')
    expect(lieuRdv(rdv({ lieu: 'agence', agence: { code_postal: '13100', ville: 'Aix' } })))
      .toBe('13100 Aix')
  })

  it('sans adresse de chantier, ne se rabat PAS sur l\'agence', () => {
    // Le repli silencieux enverrait l'artisan à 20 km du chantier.
    expect(lieuRdv(rdv({ dossier: { ...DOSSIER, adresse_chantier: null } }))).toBe('')
  })

  it('ne renvoie jamais undefined ni null, même sans donnée', () => {
    expect(lieuRdv({})).toBe('')
    expect(lieuRdv(null)).toBe('')
    expect(lieuIntervention({})).toBe('')
    expect(lieuIntervention(null)).toBe('')
  })

  it('une intervention est toujours au chantier', () => {
    expect(lieuIntervention(inter())).toBe('12 chemin des Oliviers, 13500 Martigues')
  })
})

describe('Google', () => {
  it('pose `location` sur le rendez-vous', () => {
    expect(rdvToGoogleEvent(rdv()).location).toBe('12 chemin des Oliviers, 13500 Martigues')
  })
  it('n\'écrit AUCUN champ location quand l\'adresse manque', () => {
    // Présent et vide, Google afficherait un bloc « Lieu » creux.
    expect('location' in rdvToGoogleEvent(rdv({ dossier: {} }))).toBe(false)
  })
  it('pose `location` sur chaque occurrence d\'intervention', () => {
    const evts = interventionToGoogleEvents(inter())
    expect(evts.length).toBeGreaterThan(0)
    for (const e of evts) expect(e.body.location).toBe('12 chemin des Oliviers, 13500 Martigues')
  })
  it('ne casse ni le titre ni les bornes', () => {
    const e = rdvToGoogleEvent(rdv())
    expect(e.summary).toContain('THOBY')
    expect(e.start.dateTime).toBe('2026-09-20T08:00:00.000Z')
  })
})

describe('Outlook / Graph', () => {
  it('utilise location.displayName — le nom du champ Graph, pas celui de Google', () => {
    // Se tromper de forme ne lève AUCUNE erreur : Graph ignore le champ inconnu.
    expect(rdvToGraphEvent(rdv()).location)
      .toEqual({ displayName: '12 chemin des Oliviers, 13500 Martigues' })
  })
  it('omet le champ sans adresse', () => {
    expect('location' in rdvToGraphEvent(rdv({ dossier: {} }))).toBe(false)
  })
  it('pose le lieu sur les interventions', () => {
    for (const e of interventionToGraphEvents(inter())) {
      expect(e.body.location).toEqual({ displayName: '12 chemin des Oliviers, 13500 Martigues' })
    }
  })
})

describe('iCloud / ICS', () => {
  it('écrit une ligne LOCATION', () => {
    expect(rdvToICS(rdv())).toMatch(/LOCATION[:;]/)
  })
  it('n\'écrit AUCUNE ligne LOCATION sans adresse', () => {
    expect(rdvToICS(rdv({ dossier: {} }))).not.toMatch(/LOCATION[:;]/)
  })
  it('pose le lieu sur les interventions', () => {
    for (const e of interventionToICS(inter())) expect(e.body).toMatch(/LOCATION[:;]/)
  })
})

// ── Adresse propre au rendez-vous, et retour depuis l'agenda ─────────────────────────
//
// Le lien allait dans un seul sens : corriger l'adresse dans Google Agenda ne remontait
// nulle part. La règle posée le 14/09 tient en une phrase : on n'enregistre QUE ce qui
// diffère du calcul. Sans elle, chaque rendez-vous se figerait une copie de l'adresse du
// chantier au premier pull, et un déménagement de chantier ne se propagerait plus jamais.
describe('adresse propre au rendez-vous', () => {
  it('l\'adresse saisie prime sur le calcul', () => {
    const r = rdv({ adresse: '3 rue du Notaire, 13500 Martigues' })
    expect(lieuRdv(r)).toBe('3 rue du Notaire, 13500 Martigues')
    expect(lieuRdvParDefaut(r)).toBe('12 chemin des Oliviers, 13500 Martigues')
  })

  it('vide ou blanche, on retombe sur le calcul — pas sur du vide', () => {
    expect(lieuRdv(rdv({ adresse: '' }))).toBe('12 chemin des Oliviers, 13500 Martigues')
    expect(lieuRdv(rdv({ adresse: '   ' }))).toBe('12 chemin des Oliviers, 13500 Martigues')
    expect(lieuRdv(rdv({ adresse: null }))).toBe('12 chemin des Oliviers, 13500 Martigues')
  })

  it('elle part bien dans les trois calendriers', () => {
    const r = rdv({ adresse: '3 rue du Notaire, 13500 Martigues' })
    expect(rdvToGoogleEvent(r).location).toBe('3 rue du Notaire, 13500 Martigues')
    expect(rdvToGraphEvent(r).location.displayName).toBe('3 rue du Notaire, 13500 Martigues')
    expect(rdvToICS(r)).toContain('3 rue du Notaire')
  })
})

describe('retour de l\'agenda vers BATILIS', () => {
  it('reconnaît une VRAIE correction humaine', () => {
    expect(estAdresseCorrigee(rdv(), '3 rue du Notaire, 13500 Martigues')).toBe(true)
  })

  it('ignore l\'écho de notre propre push — LE piège de ce lot', () => {
    // C'est ce test qui empêche chaque rendez-vous de se figer une copie de l'adresse du
    // chantier, ce qui bloquerait toute propagation future.
    expect(estAdresseCorrigee(rdv(), '12 chemin des Oliviers, 13500 Martigues')).toBe(false)
  })

  it('ignore l\'écho même reformaté par l\'agenda (casse et espaces)', () => {
    expect(estAdresseCorrigee(rdv(), '12 Chemin Des Oliviers,  13500 MARTIGUES')).toBe(false)
  })

  it('ignore une adresse déjà enregistrée — pas d\'écriture inutile à chaque pull', () => {
    const r = rdv({ adresse: '3 rue du Notaire, 13500 Martigues' })
    expect(estAdresseCorrigee(r, '3 rue du Notaire, 13500 Martigues')).toBe(false)
    expect(estAdresseCorrigee(r, '9 rue de la Mairie, 13500 Martigues')).toBe(true)
  })

  it('un champ VIDÉ dans l\'agenda n\'efface rien', () => {
    // On ne sait pas distinguer « j'enlève l'adresse » d'un agenda qui ne renvoie pas le
    // champ. Effacer sur un doute est pire que ne rien faire.
    const r = rdv({ adresse: '3 rue du Notaire, 13500 Martigues' })
    expect(estAdresseCorrigee(r, '')).toBe(false)
    expect(estAdresseCorrigee(r, null)).toBe(false)
    expect(estAdresseCorrigee(r, undefined)).toBe(false)
  })

  it('sur un rendez-vous à l\'agence, la référence est l\'adresse de l\'agence', () => {
    const r = rdv({ lieu: 'agence' })
    expect(estAdresseCorrigee(r, 'illiCO travaux Martigues, 22 RUE RAMADE, 13500 Martigues')).toBe(false)
    expect(estAdresseCorrigee(r, '1 place Jean Jaurès, 13500 Martigues')).toBe(true)
  })
})
