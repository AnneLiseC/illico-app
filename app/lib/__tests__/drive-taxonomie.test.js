import { describe, it, expect } from 'vitest'
import { dateDossier, nomDossierChantier, sousDossiers, nettoyerSegment, cheminSegments } from '../drive/taxonomie.js'

describe('drive/taxonomie', () => {
  it('dateDossier — formate created_at (T ou espace) en AAAA.MM.JJ', () => {
    expect(dateDossier('2026-07-19T10:00:00')).toBe('2026.07.19')
    expect(dateDossier('2026-07-19 10:00:00')).toBe('2026.07.19')
    expect(dateDossier(null)).toBe('0000.00.00')
    expect(dateDossier('nawak')).toBe('0000.00.00')
  })

  it('nomDossierChantier — « AAAA.MM.JJ NOM »', () => {
    expect(nomDossierChantier('2026-07-19T00:00:00', 'GUERTEAU')).toBe('2026.07.19 GUERTEAU')
    expect(nomDossierChantier('2026-07-19T00:00:00', null)).toBe('2026.07.19 CLIENT')
  })

  it('sousDossiers — mapping catégorie → arbo', () => {
    expect(sousDossiers('compte_rendu')).toEqual(['Comptes rendus'])
    expect(sousDossiers('avis_virement', 'SARL Toiture')).toEqual(['Documents artisans', 'SARL Toiture'])
    expect(sousDossiers('pv_reception', null)).toEqual(['Documents artisans', 'Sans artisan'])
    expect(sousDossiers('facture_honoraire')).toEqual(['Autres'])
    expect(sousDossiers(null)).toEqual(['Autres'])
    expect(sousDossiers('inconnue')).toEqual(['Autres'])
  })

  it('nettoyerSegment — retire les caractères interdits OneDrive', () => {
    expect(nettoyerSegment('a/b:c*d?e"f<g>h|i')).toBe('a-b-c-d-e-f-g-h-i')
    expect(nettoyerSegment('  x   y  ')).toBe('x y')
    expect(nettoyerSegment('')).toBe('-')
  })

  it('cheminSegments — chemin complet nettoyé', () => {
    expect(cheminSegments('2026-07-19T00:00:00', 'GUERTEAU', 'compte_rendu', null))
      .toEqual(['2026.07.19 GUERTEAU', 'Comptes rendus'])
    expect(cheminSegments('2026-07-19T00:00:00', 'GUERTEAU', 'avis_virement', 'Toiture/Sud'))
      .toEqual(['2026.07.19 GUERTEAU', 'Documents artisans', 'Toiture-Sud'])
  })
})
