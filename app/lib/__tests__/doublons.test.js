import { describe, it, expect } from 'vitest'
import { chercherDoublons, normaliserTexte, normaliserTelephone } from '../doublons.js'

// Un détecteur de doublons se juge sur DEUX erreurs opposées, et la seconde est la
// plus grave :
//   - le faux négatif : on ne voit pas le doublon → deux fiches, deux historiques,
//     deux dossiers Drive jumeaux (c'est arrivé à EPPINGER et BRUNET) ;
//   - le faux POSITIF : on crie au doublon sur deux personnes différentes → on apprend
//     à ignorer l'avertissement, et il ne sert plus à rien.

const EXISTANTS = [
  { id: '1', nom: 'DELAUNAY', prenom: 'Sophie',  email: 'sophie.delaunay@exemple.test', telephone: '06 39 98 50 12', adresse: '14 rue des Volontaires, 75015 Paris' },
  { id: '2', nom: 'MERCIER',  prenom: 'Antoine', email: null, telephone: '0639985113', adresse: '3 allée des Peupliers' },
  { id: '3', nom: 'BRUNET',   prenom: 'Marc',    email: null, telephone: null, adresse: '9 rue Haute' },
  { id: '4', nom: 'BRUNET',   prenom: 'Claire',  email: null, telephone: null, adresse: '77 avenue Basse' },
]

describe('normalisation', () => {
  it('ignore casse, accents et ponctuation', () => {
    expect(normaliserTexte('Jean-Luc DUPONT')).toBe(normaliserTexte('jean luc dupont'))
    expect(normaliserTexte('Éric')).toBe(normaliserTexte('eric'))
  })
  it('compare les téléphones sur leurs chiffres, indicatif compris', () => {
    const attendu = '0612345678'
    for (const v of ['06 12 34 56 78', '0612345678', '+33 6 12 34 56 78', '0033612345678', '06.12.34.56.78']) {
      expect(normaliserTelephone(v)).toBe(attendu)
    }
  })
  it('rejette un numéro trop court plutôt que de le comparer au hasard', () => {
    expect(normaliserTelephone('0612')).toBe('')
  })
})

describe('ce qui DOIT être signalé', () => {
  it('même e-mail, même si le nom est écrit autrement', () => {
    const r = chercherDoublons({ nom: 'Delaunay', prenom: 'S.', email: 'SOPHIE.DELAUNAY@exemple.test' }, EXISTANTS)
    expect(r).toHaveLength(1)
    expect(r[0].client.id).toBe('1')
    expect(r[0].certitude).toBe('certain')
  })

  it('même téléphone écrit différemment', () => {
    const r = chercherDoublons({ nom: 'MERCIE', prenom: 'Antoine', telephone: '+33 6 39 98 51 13' }, EXISTANTS)
    expect(r[0].client.id).toBe('2')
    expect(r[0].motifs.map(m => m.cle)).toContain('telephone')
  })

  it('même nom et même prénom, sans contact', () => {
    const r = chercherDoublons({ nom: 'brunet', prenom: 'marc' }, EXISTANTS)
    expect(r[0].client.id).toBe('3')
    expect(r[0].certitude).toBe('probable')
  })

  it('même nom et même adresse — le conjoint saisi une seconde fois', () => {
    const r = chercherDoublons({ nom: 'DELAUNAY', prenom: 'Paul', adresse: '14 rue des volontaires, 75015 PARIS' }, EXISTANTS)
    expect(r[0].client.id).toBe('1')
    expect(r[0].motifs.map(m => m.cle)).toContain('nom_adresse')
  })
})

describe("ce qui ne doit PAS crier trop fort", () => {
  it('deux BRUNET différents : signalés, mais en certitude faible', () => {
    const r = chercherDoublons({ nom: 'BRUNET', prenom: 'Julien', adresse: 'ailleurs' }, EXISTANTS)
    expect(r).toHaveLength(2)
    expect(r.every(x => x.certitude === 'faible')).toBe(true)
  })

  it('un motif fort absorbe le motif faible — pas de « même nom » sous « même e-mail »', () => {
    const r = chercherDoublons({ nom: 'DELAUNAY', prenom: 'Sophie', email: 'sophie.delaunay@exemple.test' }, EXISTANTS)
    expect(r[0].motifs.map(m => m.cle)).not.toContain('nom')
  })

  it('un client sans rapport ne remonte pas', () => {
    expect(chercherDoublons({ nom: 'ZUCCARELLI', prenom: 'Paul', email: 'z@exemple.test' }, EXISTANTS)).toEqual([])
  })

  it('un formulaire vide ne signale rien — on ne compare pas du vide', () => {
    expect(chercherDoublons({}, EXISTANTS)).toEqual([])
    expect(chercherDoublons({ prenom: 'Sophie' }, EXISTANTS)).toEqual([])
  })

  it('deux clients sans téléphone ne sont pas « le même numéro »', () => {
    const r = chercherDoublons({ nom: 'INCONNU', telephone: '' }, EXISTANTS)
    expect(r).toEqual([])
  })
})

describe('ordre de présentation', () => {
  it('le plus certain en premier', () => {
    const r = chercherDoublons({ nom: 'BRUNET', prenom: 'Marc', email: 'sophie.delaunay@exemple.test' }, EXISTANTS)
    expect(r[0].certitude).toBe('certain')
    expect(r[0].client.id).toBe('1')
  })
})
