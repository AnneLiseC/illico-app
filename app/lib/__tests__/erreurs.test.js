import { describe, it, expect, vi, afterEach } from 'vitest'
import { messageErreur, journaliserErreur, erreurAffichable } from '../erreurs.js'

// Ces phrases s'affichent à des CLIENTS, sur des dossiers de travaux à plusieurs dizaines
// de milliers d'euros. Deux exigences, et la seconde est une exigence de sécurité :
//   · c'est du français lisible ;
//   · ça ne laisse JAMAIS filtrer un nom de table, de colonne ou de contrainte.

afterEach(() => { vi.restoreAllMocks() })

describe('la fuite qu\'on ferme', () => {
  it('ne recopie JAMAIS le message technique, même sur une erreur inconnue', () => {
    // Le vrai message vu en production le 14/09.
    const brut = 'duplicate key value violates unique constraint "devis_artisans_dossier_id_key"'
    const affiche = messageErreur({ code: '23505', message: brut })
    expect(affiche).not.toContain('devis_artisans')
    expect(affiche).not.toContain('constraint')
    expect(affiche).not.toContain('duplicate')
    expect(affiche).toContain('existe déjà')
  })

  it('ne laisse rien filtrer non plus quand le code est inconnu', () => {
    const brut = 'relation "suivi_financier" does not exist'
    const affiche = messageErreur({ code: 'XX999', message: brut })
    expect(affiche).not.toContain('suivi_financier')
    expect(affiche).not.toContain('relation')
    expect(affiche).toContain('Une erreur est survenue')
  })

  it('ne laisse rien filtrer sur une erreur sans code du tout', () => {
    const affiche = messageErreur(new Error('column clients.code_postal does not exist'))
    expect(affiche).not.toContain('clients')
    expect(affiche).not.toContain('code_postal')
  })
})

describe('le code pour la capture d\'écran', () => {
  it('porte le code Postgres quand il existe', () => {
    expect(messageErreur({ code: '23505', message: 'x' })).toContain('[ERR-23505]')
  })

  it('porte un repère nommé quand l\'erreur n\'a pas de code', () => {
    expect(messageErreur(new Error('Failed to fetch'))).toContain('[ERR-RESEAU]')
  })

  it('donne TOUJOURS le même repère pour la même erreur inconnue', () => {
    // Deux captures d'écran du même problème doivent porter le même repère, sinon il ne
    // sert à rien.
    const a = messageErreur(new Error('boom inattendu'))
    const b = messageErreur(new Error('boom inattendu'))
    expect(a).toBe(b)
    expect(a).toMatch(/\[ERR-[0-9A-Z]{4}\]/)
  })

  it('donne des repères DIFFÉRENTS pour des erreurs différentes', () => {
    expect(messageErreur(new Error('premier problème')))
      .not.toBe(messageErreur(new Error('second problème')))
  })
})

describe('traductions', () => {
  const cas = [
    ['23505', /existe déjà/],
    ['23503', /introuvable, ou il est encore utilisé/],
    ['23502', /champ obligatoire/],
    ['23514', /n’est pas autorisée/],
    ['22001', /trop long/],
    ['22P02', /bon format/],
    ['42501', /droits nécessaires/],
    ['PGRST116', /introuvable/],
    ['PGRST301', /session a expiré/],
    ['PGRST204', /rechargée/],
    ['413', /trop volumineux/],
    ['429', /Trop de demandes/],
  ]
  for (const [code, attendu] of cas) {
    it(`${code} devient une phrase française`, () => {
      expect(messageErreur({ code, message: 'peu importe' })).toMatch(attendu)
    })
  }

  it('reconnaît une session morte au message quand le code manque', () => {
    expect(messageErreur(new Error('JWT expired'))).toMatch(/session a expiré/)
  })

  it('reconnaît une coupure réseau', () => {
    expect(messageErreur(new Error('TypeError: Failed to fetch'))).toMatch(/connexion internet/)
  })

  it('reconnaît un fichier trop lourd côté Storage', () => {
    expect(messageErreur({ message: 'The object exceeded the maximum allowed size' }))
      .toMatch(/trop volumineux/)
  })
})

describe('forme du message', () => {
  it('préfixe avec le contexte quand il est donné', () => {
    expect(messageErreur({ code: '413' }, 'Erreur upload PV'))
      .toBe('Erreur upload PV : Le fichier est trop volumineux. [ERR-413]')
  })

  it('nettoie un contexte qui traîne déjà ses deux-points', () => {
    expect(messageErreur({ code: '413' }, 'Erreur upload PV : '))
      .toBe('Erreur upload PV : Le fichier est trop volumineux. [ERR-413]')
  })

  it('se passe très bien de contexte', () => {
    expect(messageErreur({ code: '23505' })).toBe('Cet enregistrement existe déjà. [ERR-23505]')
  })

  it('ne rend jamais « undefined » ni « null » à l\'écran', () => {
    for (const entree of [null, undefined, {}, '', 0, new Error()]) {
      const m = messageErreur(entree)
      expect(m).not.toMatch(/undefined|null|\[object/)
      expect(m.length).toBeGreaterThan(0)
    }
  })

  it('accepte une simple chaîne comme erreur', () => {
    expect(messageErreur('Failed to fetch')).toMatch(/connexion internet/)
  })

  it('lit aussi status et statusCode, pas seulement code', () => {
    expect(messageErreur({ status: 403 })).toMatch(/droits nécessaires/)
    expect(messageErreur({ statusCode: 404 })).toMatch(/introuvable/)
  })
})

describe('le détail technique, pour toi', () => {
  it('part dans la console, jamais à l\'écran', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const err = { code: '23505', message: 'duplicate key ... "devis_artisans_pkey"' }
    const affiche = erreurAffichable(err, 'Enregistrement du devis')

    expect(spy).toHaveBeenCalled()
    expect(JSON.stringify(spy.mock.calls)).toContain('devis_artisans_pkey')   // console : tout
    expect(affiche).not.toContain('devis_artisans_pkey')                       // écran : rien
  })

  it('une console indisponible ne casse rien', () => {
    vi.spyOn(console, 'error').mockImplementation(() => { throw new Error('console morte') })
    expect(() => journaliserErreur('test', new Error('x'))).not.toThrow()
  })
})
