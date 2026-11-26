import { describe, it, expect } from 'vitest'
import { deciderRattachement } from '../drive/rattachement.js'

describe('Drive — textures SketchUp', () => {
  it('ignorées d’office, hors liste « à rattacher »', () => {
    const p = '/drives/X/root:/Illico Travaux/ANNELISE/01_CLIENTS/3. Sans suite/2026/2026-04-10 CARMONA/skp Carmona/skp ext1  _extracted_textures'
    const d = deciderRattachement(p, [], new Map(), 'mur.jpg')
    expect(d.raison).toBe('textures_sketchup')
    expect(d.aLister).toBe(false)
  })
})
