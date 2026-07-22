import { describe, it, expect } from 'vitest'
import { validateAgentIdentity } from '../agent-provisioning'

describe('validateAgentIdentity', () => {
  it('accepte une identité complète et valide', () => {
    expect(validateAgentIdentity({ prenom: 'Marine', nom: 'Durand', email: 'marine@illico-travaux.com' })).toBeNull()
  })

  it('refuse un prénom manquant ou vide', () => {
    expect(validateAgentIdentity({ prenom: '', nom: 'Durand', email: 'a@b.fr' })).toBe('Prénom requis')
    expect(validateAgentIdentity({ prenom: '   ', nom: 'Durand', email: 'a@b.fr' })).toBe('Prénom requis')
  })

  it('refuse un nom manquant', () => {
    expect(validateAgentIdentity({ prenom: 'Marine', nom: '', email: 'a@b.fr' })).toBe('Nom requis')
  })

  it('refuse un email manquant', () => {
    expect(validateAgentIdentity({ prenom: 'Marine', nom: 'Durand', email: '' })).toBe('Email requis')
  })

  it('refuse un email mal formé', () => {
    for (const bad of ['pasunemail', 'a@b', 'a @b.fr', 'a@b c.fr', '@b.fr', 'a@.fr']) {
      expect(validateAgentIdentity({ prenom: 'M', nom: 'D', email: bad })).toBe('Email invalide')
    }
  })
})
