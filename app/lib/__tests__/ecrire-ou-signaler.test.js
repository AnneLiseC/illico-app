import { describe, it, expect, vi } from 'vitest'
import { ecrireOuSignaler } from '../erreurs'

describe('ecrireOuSignaler', () => {
  it('succès : true, aucun message', async () => {
    const setErreur = vi.fn()
    expect(await ecrireOuSignaler(Promise.resolve({ error: null }), setErreur, 'Photo')).toBe(true)
    expect(setErreur).not.toHaveBeenCalled()
  })
  it('échec : false et message préfixé', async () => {
    const setErreur = vi.fn()
    expect(await ecrireOuSignaler(Promise.resolve({ error: { message: 'Failed to fetch' } }), setErreur, 'Photo')).toBe(false)
    expect(setErreur).toHaveBeenCalledTimes(1)
    expect(setErreur.mock.calls[0][0]).toMatch(/^Photo : /)
  })
})
