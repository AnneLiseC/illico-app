import { describe, it, expect } from 'vitest'
import { isHeicFile } from '../images.js'

describe('isHeicFile', () => {
  it('détecte le HEIC/HEIF par type MIME', () => {
    expect(isHeicFile({ type: 'image/heic', name: 'x' })).toBe(true)
    expect(isHeicFile({ type: 'image/heif', name: 'x' })).toBe(true)
  })
  it('détecte le HEIC/HEIF par extension (iPhone renvoie souvent un type vide)', () => {
    expect(isHeicFile({ type: '', name: 'IMG_1234.HEIC' })).toBe(true)
    expect(isHeicFile({ type: '', name: 'photo.heif' })).toBe(true)
  })
  it('faux pour les formats standards', () => {
    expect(isHeicFile({ type: 'image/jpeg', name: 'photo.jpg' })).toBe(false)
    expect(isHeicFile({ type: 'image/png', name: 'photo.png' })).toBe(false)
    expect(isHeicFile({ type: 'application/pdf', name: 'doc.pdf' })).toBe(false)
  })
  it('robuste au fichier nul/incomplet', () => {
    expect(isHeicFile(null)).toBe(false)
    expect(isHeicFile({})).toBe(false)
  })
})
