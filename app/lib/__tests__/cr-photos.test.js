// app/lib/__tests__/cr-photos.test.js
import { describe, it, expect } from 'vitest'
import { contientMarqueurPhoto, extraireMarqueursPhoto, retirerMarqueursPhoto } from '../cr-photos'

const ID1 = 'a1b2c3d4-0000-4000-8000-000000000001'
const ID2 = 'a1b2c3d4-0000-4000-8000-000000000002'

describe('cr-photos — repères [[photo:ID]] (id stable)', () => {
  it('détecte un repère', () => {
    expect(contientMarqueurPhoto(`voir [[photo:${ID1}]] ici`)).toBe(true)
    expect(contientMarqueurPhoto('pas de photo')).toBe(false)
    expect(contientMarqueurPhoto('')).toBe(false)
  })

  it('extrait texte + ids (marqueur seul)', () => {
    expect(extraireMarqueursPhoto(`[[photo:${ID1}]]`)).toEqual({ texte: '', ids: [ID1] })
  })

  it('extrait texte + ids (marqueur en fin de phrase)', () => {
    const r = extraireMarqueursPhoto(`Fissure au plafond [[photo:${ID1}]]`)
    expect(r.ids).toEqual([ID1])
    expect(r.texte).toBe('Fissure au plafond')
  })

  it('gère plusieurs repères sur une ligne', () => {
    const r = extraireMarqueursPhoto(`avant [[photo:${ID1}]] après [[photo:${ID2}]]`)
    expect(r.ids).toEqual([ID1, ID2])
    expect(r.texte).toBe('avant après')
  })

  it('retire les repères pour l’aperçu', () => {
    expect(retirerMarqueursPhoto(`texte [[photo:${ID1}]] suite`).trim()).toBe('texte suite')
    expect(retirerMarqueursPhoto('rien')).toBe('rien')
  })
})
