import { describe, it, expect } from 'vitest'
import { buildSystemPrompt, buildUserPrompt, imageMediaType, parseCrJson, isHeic } from '../route.js'

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
  it('retourne null pour un format non directement supporté (HEIC → sera converti) ou vide', () => {
    expect(imageMediaType('IMG_1234.HEIC')).toBeNull()
    expect(imageMediaType('')).toBeNull()
    expect(imageMediaType(null)).toBeNull()
  })
})

describe('isHeic', () => {
  it('détecte les photos iPhone (HEIC/HEIF) par extension ou mime', () => {
    expect(isHeic('IMG_1234.HEIC')).toBe(true)
    expect(isHeic('photo.heif')).toBe(true)
    expect(isHeic('image/heic')).toBe(true)
  })
  it('faux pour les formats standards', () => {
    expect(isHeic('photo.jpg')).toBe(false)
    expect(isHeic('image/png')).toBe(false)
    expect(isHeic('')).toBe(false)
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

  const dossierBase = { reference: 'AM-1', client: { nom: 'X' }, typologie: 'amo', referente: null }
  const devisEx = [
    { statut: 'recu', montant_ttc: 5000, notes: 'Plomberie salle de bain', artisan: { entreprise: 'Dupont', metier: 'Plombier' } },
    { statut: 'accepte', montant_ttc: 8000, notes: 'Peinture séjour', artisan: { entreprise: 'Martin' } },
    { statut: 'refuse', montant_ttc: 9999, notes: 'Devis refusé', artisan: { entreprise: 'Nope' } },
    { statut: 'en_attente', montant_ttc: 1234, notes: 'Pas encore reçu', artisan: { entreprise: 'Wait' } },
  ]

  it('R1/R2/R3 : injecte le périmètre de TOUS les devis reçus (reçu + accepté)', () => {
    const p = buildUserPrompt({ dossier: dossierBase, devis: devisEx, typeVisite: 'r2', dateVisite: null, intervenants: [], notesBrutes: '' })
    expect(p).toContain('DEVIS DU CHANTIER')
    expect(p).toContain('Plomberie salle de bain')  // reçu → inclus en R2
    expect(p).toContain('Peinture séjour')
    expect(p).toContain('ne PAS inventer')       // ancrage anti-hallucination
  })

  it('exclut les devis refusés et en attente', () => {
    const p = buildUserPrompt({ dossier: dossierBase, devis: devisEx, typeVisite: 'r2', dateVisite: null, intervenants: [], notesBrutes: '' })
    expect(p).not.toContain('Devis refusé')
    expect(p).not.toContain('Pas encore reçu')
  })

  it('suivi & réception : ne se basent QUE sur les devis SIGNÉS', () => {
    for (const tv of ['suivi', 'reception']) {
      const p = buildUserPrompt({ dossier: dossierBase, devis: devisEx, typeVisite: tv, dateVisite: null, intervenants: [], notesBrutes: '' })
      expect(p).toContain('DEVIS SIGNÉS')
      expect(p).toContain('Peinture séjour')              // accepté = signé → inclus
      expect(p).not.toContain('Plomberie salle de bain')  // reçu non signé → exclu
    }
  })

  it('suivi : un devis « reçu » AVEC date de signature compte comme signé', () => {
    const p = buildUserPrompt({ dossier: dossierBase, devis: [{ statut: 'recu', date_signature: '2026-01-10', notes: 'Élec signée', artisan: { entreprise: 'E' } }], typeVisite: 'suivi', dateVisite: null, intervenants: [], notesBrutes: '' })
    expect(p).toContain('Élec signée')
  })

  it('ne montre PAS les montants hors R3 (R2 interdit les montants)', () => {
    const p = buildUserPrompt({ dossier: dossierBase, devis: devisEx, typeVisite: 'r2', dateVisite: null, intervenants: [], notesBrutes: '' })
    expect(p).not.toContain('TTC')
  })

  it('montre les montants en R3 (présentation des devis)', () => {
    const p = buildUserPrompt({ dossier: dossierBase, devis: devisEx, typeVisite: 'r3', dateVisite: null, intervenants: [], notesBrutes: '' })
    expect(p).toContain('TTC')
  })

  it('devis reçu sans description → « périmètre non précisé » (jamais vide)', () => {
    const p = buildUserPrompt({ dossier: dossierBase, devis: [{ statut: 'recu', notes: null, artisan: { entreprise: 'Sansdesc' } }], typeVisite: 'r2', dateVisite: null, intervenants: [], notesBrutes: '' })
    expect(p).toContain('périmètre non précisé')
  })
})
