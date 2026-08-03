// app/lib/__tests__/auth-errors.test.js
import { describe, it, expect } from 'vitest'
import { estErreurAuth } from '../auth-errors'

describe('estErreurAuth', () => {
  it('reconnaît un JWT expiré / 401', () => {
    expect(estErreurAuth({ code: 'PGRST301' })).toBe(true)
    expect(estErreurAuth({ code: '401' })).toBe(true)
    expect(estErreurAuth({ message: 'JWT expired' })).toBe(true)
    expect(estErreurAuth({ message: 'Invalid authentication credentials' })).toBe(true)
    expect(estErreurAuth({ message: 'invalid token' })).toBe(true)
  })

  it('ne confond PAS un refus RLS (42501) avec un jeton mort', () => {
    expect(estErreurAuth({ code: '42501', message: 'permission denied for table profiles' })).toBe(false)
  })

  it('ne confond PAS une panne réseau / autre erreur', () => {
    expect(estErreurAuth({ code: 'PGRST116', message: 'no rows' })).toBe(false)
    expect(estErreurAuth({ message: 'Failed to fetch' })).toBe(false)
    expect(estErreurAuth(null)).toBe(false)
    expect(estErreurAuth(undefined)).toBe(false)
  })
})
