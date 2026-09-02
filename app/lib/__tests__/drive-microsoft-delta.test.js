import { describe, it, expect } from 'vitest'
import { curseurMort } from '../drive/microsoft.js'

// Le curseur delta d'OneDrive : quels statuts signifient « ce curseur est perime, repars
// de zero » plutot que « vraie panne » ? Constate en prod le 02/09 : OneDrive GRAND PUBLIC
// renvoie 404 la ou la documentation Graph annonce 410 (resyncRequired). Les deux doivent
// declencher une resynchronisation ; tout le reste doit remonter comme une erreur.
describe('drive/microsoft curseurMort', () => {
  it('404 = curseur perime chez OneDrive grand public (cas reel du 02/09)', () => {
    expect(curseurMort(404)).toBe(true)
  })

  it('410 Gone = resyncRequired, le cas documente par Graph', () => {
    expect(curseurMort(410)).toBe(true)
  })

  it('400 = curseur malforme, on repart aussi de zero', () => {
    expect(curseurMort(400)).toBe(true)
  })

  it('401 et 403 ne sont PAS des curseurs morts : jeton ou droits', () => {
    expect(curseurMort(401)).toBe(false)
    expect(curseurMort(403)).toBe(false)
  })

  it('429 et 5xx ne sont PAS des curseurs morts : transitoire, fetchRetry s en occupe', () => {
    expect(curseurMort(429)).toBe(false)
    expect(curseurMort(500)).toBe(false)
    expect(curseurMort(503)).toBe(false)
  })

  it('200 n est evidemment pas un curseur mort', () => {
    expect(curseurMort(200)).toBe(false)
  })
})
