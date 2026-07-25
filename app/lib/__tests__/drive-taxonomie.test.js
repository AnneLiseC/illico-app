import { describe, it, expect } from 'vitest'
import { dateDossier, nomDossierChantier, sousDossiers, photoSousDossiers, nettoyerSegment, cheminSegments, bucketStatut, chantierBaseSegments, cheminChantier, cheminChantierPhoto, cheminArtisanGlobal } from '../drive/taxonomie.js'

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
    // Documents artisans : factures + « Autre » par artisan.
    expect(sousDossiers('facture_artisan', 'SARL Toiture')).toEqual(['Documents artisans', 'SARL Toiture', 'Factures'])
    expect(sousDossiers('autre_artisan', 'SARL Toiture')).toEqual(['Documents artisans', 'SARL Toiture', 'Autre'])
    // Autres : sous-dossiers dédiés.
    expect(sousDossiers('plans')).toEqual(['Autres', 'Plans'])
    expect(sousDossiers('facture_honoraire')).toEqual(['Autres', 'Factures honoraires'])
    expect(sousDossiers('administratif')).toEqual(['Autres', 'Administratif'])
    expect(sousDossiers(null)).toEqual(['Autres'])
    expect(sousDossiers('inconnue')).toEqual(['Autres'])
  })

  it('photoSousDossiers — Photos/<catégorie de prise de vue>', () => {
    expect(photoSousDossiers('avant')).toEqual(['Photos', 'Avant'])
    expect(photoSousDossiers('pendant')).toEqual(['Photos', 'Pendant'])
    expect(photoSousDossiers('apres')).toEqual(['Photos', 'Après'])
    expect(photoSousDossiers('maquette')).toEqual(['Photos', 'Maquette'])
    expect(photoSousDossiers(null)).toEqual(['Photos', 'Autres'])
  })

  it('nettoyerSegment — retire les caractères interdits OneDrive', () => {
    expect(nettoyerSegment('a/b:c*d?e"f<g>h|i')).toBe('a-b-c-d-e-f-g-h-i')
    expect(nettoyerSegment('  x   y  ')).toBe('x y')
    expect(nettoyerSegment('')).toBe('-')
  })

  it('cheminSegments — chemin complet nettoyé (déprécié, sans bucket)', () => {
    expect(cheminSegments('2026-07-19T00:00:00', 'GUERTEAU', 'compte_rendu', null))
      .toEqual(['2026.07.19 GUERTEAU', 'Comptes rendus'])
    expect(cheminSegments('2026-07-19T00:00:00', 'GUERTEAU', 'avis_virement', 'Toiture/Sud'))
      .toEqual(['2026.07.19 GUERTEAU', 'Documents artisans', 'Toiture-Sud'])
  })

  it('bucketStatut — statut dossier → bucket Clients', () => {
    expect(bucketStatut('annule')).toBe('Annulés')
    expect(bucketStatut('termine')).toBe('Terminés')
    expect(bucketStatut('en_cours')).toBe('En cours')
    expect(bucketStatut(null)).toBe('En cours')
    expect(bucketStatut(undefined)).toBe('En cours')
  })

  it('chantierBaseSegments — Clients/<bucket>/AAAA.MM.JJ NOM', () => {
    expect(chantierBaseSegments('en_cours', '2026-07-20T00:00:00', 'Martin'))
      .toEqual(['Clients', 'En cours', '2026.07.20 Martin'])
    expect(chantierBaseSegments('termine', '2026-07-25T00:00:00', 'Dupont'))
      .toEqual(['Clients', 'Terminés', '2026.07.25 Dupont'])
    expect(chantierBaseSegments('annule', '2026-07-25T00:00:00', 'Durand'))
      .toEqual(['Clients', 'Annulés', '2026.07.25 Durand'])
  })

  it('cheminChantier — document dans le bon bucket', () => {
    expect(cheminChantier('en_cours', '2026-07-20T00:00:00', 'Martin', 'compte_rendu', null))
      .toEqual(['Clients', 'En cours', '2026.07.20 Martin', 'Comptes rendus'])
    expect(cheminChantier('termine', '2026-07-25T00:00:00', 'Dupont', 'facture_artisan', 'SARL Toiture'))
      .toEqual(['Clients', 'Terminés', '2026.07.25 Dupont', 'Documents artisans', 'SARL Toiture', 'Factures'])
  })

  it('cheminChantierPhoto — photo dans Photos/<catégorie> du bon bucket', () => {
    expect(cheminChantierPhoto('en_cours', '2026-07-20T00:00:00', 'Martin', 'avant'))
      .toEqual(['Clients', 'En cours', '2026.07.20 Martin', 'Photos', 'Avant'])
    expect(cheminChantierPhoto('annule', '2026-07-25T00:00:00', 'Durand', null))
      .toEqual(['Clients', 'Annulés', '2026.07.25 Durand', 'Photos', 'Autres'])
  })

  it('cheminArtisanGlobal — Artisans/<Artisan>/<sous-dossier>', () => {
    expect(cheminArtisanGlobal('SARL Toiture', 'Fiches techniques'))
      .toEqual(['Artisans', 'SARL Toiture', 'Fiches techniques'])
    expect(cheminArtisanGlobal('Toiture/Sud', 'Documents administratif'))
      .toEqual(['Artisans', 'Toiture-Sud', 'Documents administratif'])
    expect(cheminArtisanGlobal(null, 'Fiches techniques'))
      .toEqual(['Artisans', 'Sans artisan', 'Fiches techniques'])
  })
})
