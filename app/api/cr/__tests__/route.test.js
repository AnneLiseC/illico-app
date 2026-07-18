import { describe, it, expect } from 'vitest'
import { buildSystemPrompt, buildUserPrompt, imageMediaType, parseCrJson } from '../route.js'

describe('buildSystemPrompt', () => {
  // Garde-fou du bug corrigé : `reglesSpecifiques` non défini faisait lever une
  // ReferenceError → 500 sur toute génération. Ce test échouerait si ça revenait.
  it('ne lève pas et injecte les règles spécifiques du type', () => {
    const p = buildSystemPrompt('r1', 'illiCO travaux')
    expect(p).toContain('CONTEXTE R1')
    expect(p).toContain('illiCO travaux')
  })

  it('injecte les bonnes règles pour chaque type', () => {
    expect(buildSystemPrompt('r2', 'X')).toContain('CONTEXTE R2')
    expect(buildSystemPrompt('r3', 'X')).toContain('CONTEXTE R3')
    expect(buildSystemPrompt('suivi', 'X')).toContain('CONTEXTE VISITE DE SUIVI')
    expect(buildSystemPrompt('reception', 'X')).toContain('CONTEXTE RÉCEPTION')
  })

  it('type inconnu : pas de crash, sections de repli (suivi)', () => {
    const p = buildSystemPrompt('inconnu', 'X')
    expect(typeof p).toBe('string')
    expect(p).toContain('Identification du chantier') // sections suivi (fallback)
  })

  it("l'exemple JSON du prompt est un JSON valide", () => {
    const p = buildSystemPrompt('r1', 'X')
    const start = p.lastIndexOf('{', p.indexOf('"titre"'))
    const end = p.lastIndexOf('}')
    expect(() => JSON.parse(p.slice(start, end + 1))).not.toThrow()
  })
})

describe('imageMediaType', () => {
  it('mappe les formats supportés', () => {
    expect(imageMediaType('photo.png')).toBe('image/png')
    expect(imageMediaType('photo.JPG')).toBe('image/jpeg')
    expect(imageMediaType('image/jpeg')).toBe('image/jpeg')
    expect(imageMediaType('scan.webp')).toBe('image/webp')
    expect(imageMediaType('anim.gif')).toBe('image/gif')
  })
  it('retourne null pour un format non supporté (HEIC) ou vide', () => {
    expect(imageMediaType('IMG_1234.HEIC')).toBeNull()
    expect(imageMediaType('')).toBeNull()
    expect(imageMediaType(null)).toBeNull()
  })
})

describe('parseCrJson', () => {
  it('parse un JSON propre', () => {
    expect(parseCrJson('{"a":1}')).toEqual({ a: 1 })
  })
  it('retire les fences ```json', () => {
    expect(parseCrJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })
  it('répare un préambule/suffixe parasite', () => {
    expect(parseCrJson('Voici le CR :\n{"a":1}\nVoilà.')).toEqual({ a: 1 })
  })
  it('retourne null si irrécupérable', () => {
    expect(parseCrJson('pas du json du tout')).toBeNull()
    expect(parseCrJson('')).toBeNull()
  })
})

describe('buildUserPrompt', () => {
  it('inclut la référence, le client et les notes brutes', () => {
    const dossier = {
      reference: 'AM-2026-001',
      client: { civilite: 'M', nom: 'Bresson', prenom: 'Jean' },
      typologie: 'amo',
      referente: { prenom: 'Anne', nom: 'C' },
    }
    const p = buildUserPrompt({ dossier, devis: [], typeVisite: 'r1', dateVisite: null, intervenants: [], notesBrutes: 'compteur au sous-sol' })
    expect(p).toContain('AM-2026-001')
    expect(p).toContain('compteur au sous-sol')
  })
})
