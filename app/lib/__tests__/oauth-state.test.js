import { describe, it, expect, beforeEach } from 'vitest'
import { signState, verifyState } from '../oauth-state'

describe('oauth-state', () => {
  beforeEach(() => { process.env.OAUTH_STATE_SECRET = 'test-secret-123' })

  it('signe puis vérifie : renvoie l\'uid', () => {
    const state = signState('user-abc')
    expect(verifyState(state)).toBe('user-abc')
  })

  it('rejette une signature falsifiée', () => {
    const state = signState('user-abc')
    const [payload] = state.split('.')
    expect(verifyState(`${payload}.mauvaisesignature`)).toBeNull()
  })

  it('rejette un state malformé', () => {
    expect(verifyState('')).toBeNull()
    expect(verifyState('sanspoint')).toBeNull()
    expect(verifyState(null)).toBeNull()
  })

  it('rejette un state signé avec un autre secret', () => {
    const state = signState('user-abc')
    process.env.OAUTH_STATE_SECRET = 'un-autre-secret'
    expect(verifyState(state)).toBeNull()
  })

  it('rejette un state expiré', () => {
    // payload manuel avec exp dans le passé, signé avec le bon secret.
    const crypto = require('crypto')
    const payload = JSON.stringify({ uid: 'u', nonce: 'n', exp: Date.now() - 1000 })
    const b64 = Buffer.from(payload).toString('base64url')
    const sig = crypto.createHmac('sha256', process.env.OAUTH_STATE_SECRET).update(b64).digest('base64url')
    expect(verifyState(`${b64}.${sig}`)).toBeNull()
  })
})
