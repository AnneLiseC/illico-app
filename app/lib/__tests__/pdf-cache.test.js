import { describe, it, expect } from 'vitest'
import { empreinteDe, cheminCache } from '../pdf/cache.js'

// L'empreinte est le cœur du cache : elle décide si un document est refait ou servi tel
// quel. Deux exigences opposées, et les deux comptent autant :
//   1. elle DOIT changer dès qu'une donnée du document change (sinon on sert un
//      document périmé à un client) ;
//   2. elle NE DOIT PAS changer quand rien n'a bougé (sinon le cache ne sert à rien).

describe('empreinteDe — stable quand rien ne change', () => {
  it('deux lectures identiques donnent la même empreinte', () => {
    const a = { dossier: { id: 'x', reference: '2026-AM-001' }, devis: [{ id: 'd1', montant_ht: 1000 }] }
    const b = { dossier: { id: 'x', reference: '2026-AM-001' }, devis: [{ id: 'd1', montant_ht: 1000 }] }
    expect(empreinteDe(a)).toBe(empreinteDe(b))
  })

  it("insensible à l'ordre des clés — PostgREST ne le garantit pas", () => {
    const a = { reference: '2026-AM-001', id: 'x', montant: 12 }
    const b = { montant: 12, id: 'x', reference: '2026-AM-001' }
    expect(empreinteDe(a)).toBe(empreinteDe(b))
  })

  it("insensible au nombre écrit en texte — '1250.00' et 1250 sont le même montant", () => {
    expect(empreinteDe({ m: 1250 })).toBe(empreinteDe({ m: '1250' }))
  })

  it('sensible à l\'ordre des LISTES — deux devis inversés, c\'est un autre document', () => {
    expect(empreinteDe({ d: ['a', 'b'] })).not.toBe(empreinteDe({ d: ['b', 'a'] }))
  })
})

describe('empreinteDe — change dès que quelque chose bouge', () => {
  const base = {
    dossier: { id: 'x', reference: '2026-AM-001', client: { nom: 'DELAUNAY' } },
    devis: [{ id: 'd1', montant_ht: 1000, statut: 'accepte' }],
    photos: [{ id: 'p1', url: 'photos/x/1.jpg' }],
  }

  const variantes = {
    'un montant modifié':        { ...base, devis: [{ ...base.devis[0], montant_ht: 1001 }] },
    'un statut de devis changé': { ...base, devis: [{ ...base.devis[0], statut: 'refuse' }] },
    'un nom de client corrigé':  { ...base, dossier: { ...base.dossier, client: { nom: 'DELAUNEY' } } },
    'une photo ajoutée':         { ...base, photos: [...base.photos, { id: 'p2', url: 'photos/x/2.jpg' }] },
    'une photo retirée':         { ...base, photos: [] },
    'un devis ajouté':           { ...base, devis: [...base.devis, { id: 'd2', montant_ht: 500 }] },
  }

  for (const [nom, variante] of Object.entries(variantes)) {
    it(`${nom} → empreinte différente`, () => {
      expect(empreinteDe(variante)).not.toBe(empreinteDe(base))
    })
  }

  it('un champ null n\'est pas la même chose qu\'un champ absent... mais reste stable', () => {
    expect(empreinteDe({ a: null })).toBe(empreinteDe({ a: null }))
  })
})

describe('cheminCache', () => {
  it('range par dossier et par type', () => {
    expect(cheminCache('abc', 'dossier_suivi')).toBe('cache/abc/dossier_suivi.pdf')
  })
  it('distingue deux documents du même type par leur clé', () => {
    expect(cheminCache('abc', 'cr', 'cr1')).not.toBe(cheminCache('abc', 'cr', 'cr2'))
  })
  it('neutralise les caractères qui n\'ont rien à faire dans un chemin', () => {
    expect(cheminCache('abc', 'cr', '../../secret')).toBe('cache/abc/cr-secret.pdf')
  })
})
