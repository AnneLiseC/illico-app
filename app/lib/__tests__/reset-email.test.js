import { describe, it, expect } from 'vitest'
import { buildResetEmail } from '../reset-email.js'

describe('reset-email', () => {
  it('buildResetEmail — sujet Batilis + lien intégré 2 fois (bouton + secours)', () => {
    const link = 'https://xxx.supabase.co/auth/v1/verify?token=abc&redirect_to=https://www.batilis-app.fr/auth/set-password?type=recovery'
    const { subject, html } = buildResetEmail({ actionLink: link })
    expect(subject).toMatch(/Batilis/)
    expect(subject.toLowerCase()).toMatch(/r[eé]initialisation/)
    // Le lien doit apparaître dans le bouton ET dans le lien de secours.
    const occurrences = html.split(link).length - 1
    expect(occurrences).toBe(2)
    // Mention anti-panique « mot de passe reste inchangé ».
    expect(html).toMatch(/reste inchangé/)
  })
})
