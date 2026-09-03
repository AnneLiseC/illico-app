import { describe, it, expect } from 'vitest'
import { preparerEnvoi, modeEnvoi, destinationEssai, MODE_ESSAI, MODE_REEL } from '../relances-envoi.js'

// Le garde-fou d'envoi des relances. Ce que ces tests protègent, c'est UNE règle :
// il ne doit pas exister de chemin par lequel un mail part vers un vrai client sans
// que RELANCES_ENVOI=reel ait été posé DÉLIBÉRÉMENT.

const CLIENT = 'client.reel@exemple.test'
const ESSAI = 'moi@exemple.test'

describe('modeEnvoi — le défaut est ESSAI, quoi qu\'il arrive', () => {
  it('sans variable → essai', () => {
    expect(modeEnvoi({})).toBe(MODE_ESSAI)
  })
  it('valeur vide, inconnue ou farfelue → essai', () => {
    for (const v of ['', '   ', 'oui', 'true', 'production', 'REELLE', '1']) {
      expect(modeEnvoi({ RELANCES_ENVOI: v })).toBe(MODE_ESSAI)
    }
  })
  it('« reel » exactement → réel, casse et espaces tolérés', () => {
    expect(modeEnvoi({ RELANCES_ENVOI: 'reel' })).toBe(MODE_REEL)
    expect(modeEnvoi({ RELANCES_ENVOI: '  REEL  ' })).toBe(MODE_REEL)
  })
})

describe('destinationEssai', () => {
  it('absente ou vide → null', () => {
    expect(destinationEssai({})).toBeNull()
    expect(destinationEssai({ RELANCES_ESSAI_EMAIL: '   ' })).toBeNull()
  })
  it('renvoie l\'adresse débarrassée de ses espaces', () => {
    expect(destinationEssai({ RELANCES_ESSAI_EMAIL: ` ${ESSAI} ` })).toBe(ESSAI)
  })
})

describe('preparerEnvoi — mode essai (le défaut)', () => {
  const env = { RELANCES_ESSAI_EMAIL: ESSAI }

  it('redirige vers l\'adresse d\'essai', () => {
    const p = preparerEnvoi({ to: CLIENT, subject: 'Demande d\'acompte' }, env)
    expect(p.envoyer).toBe(true)
    expect(p.to).toBe(ESSAI)
    expect(p.to).not.toBe(CLIENT)
  })

  it('préfixe l\'objet du destinataire réel — on sait pour qui c\'était', () => {
    const p = preparerEnvoi({ to: CLIENT, subject: 'Demande d\'acompte' }, env)
    expect(p.subject).toBe(`[ESSAI → ${CLIENT}] Demande d'acompte`)
    expect(p.reel).toBe(CLIENT)
  })

  it('SANS adresse d\'essai, n\'envoie RIEN plutôt que de tomber sur le vrai client', () => {
    const p = preparerEnvoi({ to: CLIENT, subject: 'x' }, {})
    expect(p.envoyer).toBe(false)
    expect(p.raison).toMatch(/RELANCES_ESSAI_EMAIL/)
    expect(p.to).toBeUndefined()
  })
})

describe('preparerEnvoi — mode réel', () => {
  const env = { RELANCES_ENVOI: 'reel', RELANCES_ESSAI_EMAIL: ESSAI }

  it('écrit au vrai destinataire, objet intact', () => {
    const p = preparerEnvoi({ to: CLIENT, subject: 'Demande d\'acompte' }, env)
    expect(p).toMatchObject({ envoyer: true, to: CLIENT, subject: 'Demande d\'acompte' })
  })

  it('l\'adresse d\'essai est ignorée une fois en réel', () => {
    const p = preparerEnvoi({ to: CLIENT, subject: 'x' }, env)
    expect(p.to).not.toBe(ESSAI)
  })
})

describe('preparerEnvoi — destinataire manquant', () => {
  it('n\'envoie rien, dans les deux modes', () => {
    for (const env of [{ RELANCES_ESSAI_EMAIL: ESSAI }, { RELANCES_ENVOI: 'reel' }]) {
      for (const to of [undefined, null, '', '   ']) {
        expect(preparerEnvoi({ to, subject: 'x' }, env).envoyer).toBe(false)
      }
    }
  })
})

// Le test qui compte vraiment : aucune combinaison d'environnement, hors « reel »
// explicite, ne doit produire un envoi vers l'adresse du client.
describe('aucune fuite vers le vrai destinataire hors mode réel', () => {
  it('balaie les combinaisons plausibles de mauvaise configuration', () => {
    const valeurs = [undefined, '', ' ', 'essai', 'test', 'oui', 'true', 'PROD', 'production', '1']
    for (const mode of valeurs) {
      for (const dest of [undefined, '', ESSAI]) {
        const env = {}
        if (mode !== undefined) env.RELANCES_ENVOI = mode
        if (dest !== undefined) env.RELANCES_ESSAI_EMAIL = dest
        const p = preparerEnvoi({ to: CLIENT, subject: 'x' }, env)
        expect(p.to === CLIENT && p.envoyer === true).toBe(false)
      }
    }
  })
})
