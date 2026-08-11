import { describe, it, expect, vi } from 'vitest'
import { fetchRetry } from '../drive/http.js'

// Réponse factice minimale (status + headers + clone().text() pour le cas Google 403).
function fakeRes(status, { retryAfter, body = '' } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (h) => (h.toLowerCase() === 'retry-after' ? (retryAfter ?? null) : null) },
    clone: () => ({ text: async () => body }),
  }
}

const noSleep = () => Promise.resolve()

describe('drive/http fetchRetry', () => {
  it('réussit du premier coup → un seul appel', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeRes(200))
    const res = await fetchRetry('u', {}, { fetchImpl, sleep: noSleep })
    expect(res.status).toBe(200)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('réessaie sur 429 puis réussit', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(fakeRes(429, { retryAfter: '0' }))
      .mockResolvedValueOnce(fakeRes(429))
      .mockResolvedValueOnce(fakeRes(200))
    const res = await fetchRetry('u', {}, { fetchImpl, sleep: noSleep })
    expect(res.status).toBe(200)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('ne réessaie PAS sur une erreur non transitoire (400)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeRes(400))
    const res = await fetchRetry('u', {}, { fetchImpl, sleep: noSleep })
    expect(res.status).toBe(400)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('abandonne après le nombre max de tentatives et renvoie la dernière réponse', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeRes(503))
    const res = await fetchRetry('u', {}, { fetchImpl, sleep: noSleep, tries: 2 })
    expect(res.status).toBe(503)
    expect(fetchImpl).toHaveBeenCalledTimes(3) // 1 essai + 2 ré-essais
  })

  it('Google : 403 « rateLimitExceeded » est traité comme transitoire', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(fakeRes(403, { body: '{"error":{"errors":[{"reason":"userRateLimitExceeded"}]}}' }))
      .mockResolvedValueOnce(fakeRes(200))
    const res = await fetchRetry('u', {}, { fetchImpl, sleep: noSleep, isGoogle: true })
    expect(res.status).toBe(200)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('Google : 403 « permission » (non-throttle) N’est PAS réessayé', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeRes(403, { body: '{"error":{"errors":[{"reason":"insufficientPermissions"}]}}' }))
    const res = await fetchRetry('u', {}, { fetchImpl, sleep: noSleep, isGoogle: true })
    expect(res.status).toBe(403)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('respecte Retry-After pour calculer l’attente', async () => {
    const sleep = vi.fn().mockResolvedValue()
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(fakeRes(429, { retryAfter: '2' }))
      .mockResolvedValueOnce(fakeRes(200))
    await fetchRetry('u', {}, { fetchImpl, sleep })
    expect(sleep).toHaveBeenCalledWith(2000)
  })
})
