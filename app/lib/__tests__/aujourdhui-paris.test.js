import { describe, it, expect } from 'vitest'
import { aujourdhuiParis } from '../dates'

describe('aujourdhuiParis', () => {
  it('donne la date de Paris, pas la date UTC, juste après minuit (hiver, UTC+1)', () => {
    // 26/11/2026 00:30 à Paris = 25/11/2026 23:30 UTC
    expect(aujourdhuiParis(new Date('2026-11-25T23:30:00Z'))).toBe('2026-11-26')
  })
  it('idem en été (UTC+2)', () => {
    // 15/07/2026 01:30 à Paris = 14/07/2026 23:30 UTC
    expect(aujourdhuiParis(new Date('2026-07-14T23:30:00Z'))).toBe('2026-07-15')
  })
  it('format AAAA-MM-JJ', () => {
    expect(aujourdhuiParis(new Date('2026-03-05T12:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
