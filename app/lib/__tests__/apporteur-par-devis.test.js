// Apporteur par devis (26/11/2026) : case « pris en compte », mode sur honoraires.
import { describe, it, expect } from 'vitest'
import { calculateApporteurFinance, estInclusApporteur } from '../finance.js'
import { ligneApporteur } from '../ca-reel.js'

const dv = (o = {}) => ({ id: 'a', artisan_id: 'art1', montant_ht: 10000, montant_ttc: 11000, commission_pourcentage: 0.1, statut: 'accepte', ...o })
const dossier = (o = {}) => ({
  typologie: 'courtage', part_agente: 0, taux_courtage: 0.06, apporteur_actif: true, apporteur_pourcentage: 5,
  client: { apporteur_base: null }, suivi_financier: [],
  devis_artisans: [dv(), dv({ id: 'b', artisan_id: 'art2', commission_pourcentage: 0 })], ...o,
})

describe('estInclusApporteur', () => {
  it('colonne absente → ancienne règle (commission > 0)', () => {
    expect(estInclusApporteur(dv())).toBe(true)
    expect(estInclusApporteur(dv({ commission_pourcentage: 0 }))).toBe(false)
  })
  it('la case prime sur la commission', () => {
    expect(estInclusApporteur(dv({ commission_pourcentage: 0, apporteur_inclus: true }))).toBe(true)
    expect(estInclusApporteur(dv({ apporteur_inclus: false }))).toBe(false)
  })
})

describe('calculateApporteurFinance', () => {
  it('par devis : un devis décoché ne compte pas', () => {
    const d = dossier({ devis_artisans: [dv({ apporteur_inclus: true }), dv({ id: 'b', apporteur_inclus: false })] })
    const r = calculateApporteurFinance(d)
    expect(r.lines.map(l => l.devisId)).toEqual(['a'])
    expect(r.totalHT).toBe(500)
  })
  it('sur honoraires : la base est réduite au prorata des devis pris en compte', () => {
    const base = { client: { apporteur_base: 'honoraires' } }
    const tous = calculateApporteurFinance(dossier({ ...base, devis_artisans: [dv({ apporteur_inclus: true }), dv({ id: 'b', apporteur_inclus: true })] }))
    const moitie = calculateApporteurFinance(dossier({ ...base, devis_artisans: [dv({ apporteur_inclus: true }), dv({ id: 'b', apporteur_inclus: false })] }))
    expect(tous.lines[0].type).toBe('honoraires')
    expect(moitie.totalHT).toBeCloseTo(tous.totalHT / 2, 1)
  })
})

describe('ligneApporteur', () => {
  const lines = [{ type: 'par_devis', devisId: 'a' }, { type: 'par_devis', devisId: 'b' }]
  it('règlement par devis', () => {
    expect(ligneApporteur(lines, { devis_id: 'b', artisan_id: 'art2' }, { devis_artisans: [] })).toBe(lines[1])
  })
  it('mode sur honoraires : la ligne unique', () => {
    const l = [{ type: 'honoraires' }]
    expect(ligneApporteur(l, { devis_id: null, artisan_id: null }, {})).toBe(l[0])
  })
})
