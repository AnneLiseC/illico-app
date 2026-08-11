import { describe, it, expect } from 'vitest'
import { RACINE_CLIENTS, RACINE_ARTISANS, dateDossier, nomDossierChantier, bucketSegments, devisSousDossier, sousDossiers, photoSousDossiers, nettoyerSegment, chantierBaseSegments, cheminChantier, cheminChantierPhoto, cheminArtisanGlobal } from '../drive/taxonomie.js'

describe('drive/taxonomie', () => {
  it('racines — 01_CLIENTS / 02_ARTISANS', () => {
    expect(RACINE_CLIENTS).toBe('01_CLIENTS')
    expect(RACINE_ARTISANS).toBe('02_ARTISANS')
  })

  it('dateDossier — formate created_at (T ou espace) en AAAA-MM-JJ', () => {
    expect(dateDossier('2026-07-19T10:00:00')).toBe('2026-07-19')
    expect(dateDossier('2026-07-19 10:00:00')).toBe('2026-07-19')
    expect(dateDossier(null)).toBe('0000-00-00')
    expect(dateDossier('nawak')).toBe('0000-00-00')
  })

  it('nomDossierChantier — « AAAA-MM-JJ NOM » (MAJUSCULES)', () => {
    expect(nomDossierChantier('2026-07-19T00:00:00', 'Guerteau')).toBe('2026-07-19 GUERTEAU')
    expect(nomDossierChantier('2026-07-19T00:00:00', null)).toBe('2026-07-19 CLIENT')
  })

  it('bucketSegments — statut dossier → bucket 01_CLIENTS', () => {
    expect(bucketSegments('annule')).toEqual(['3. Sans suite'])
    expect(bucketSegments('en_cours')).toEqual(['1. En cours'])
    expect(bucketSegments(null)).toEqual(['1. En cours'])
    expect(bucketSegments(undefined)).toEqual(['1. En cours'])
    // Terminés → année de fin de chantier si fournie, sinon année de création.
    expect(bucketSegments('termine', { dateFin: '2025-12-01', createdAt: '2026-07-19T00:00:00' })).toEqual(['2. Terminés', '2025'])
    expect(bucketSegments('termine', { createdAt: '2026-07-19T00:00:00' })).toEqual(['2. Terminés', '2026'])
  })

  it('devisSousDossier — statut devis → sous-dossier Devis', () => {
    expect(devisSousDossier('accepte')).toBe('2. Signés')
    expect(devisSousDossier('signe')).toBe('2. Signés')
    expect(devisSousDossier('refuse')).toBe('3. Refusés')
    expect(devisSousDossier('recu')).toBe('1. Reçus')
    expect(devisSousDossier(null)).toBe('1. Reçus')
  })

  it('sousDossiers — mapping catégorie → arbo', () => {
    expect(sousDossiers('compte_rendu')).toEqual(['2. Comptes rendus'])
    // Documents artisans : PV, attestations, acomptes… par artisan.
    expect(sousDossiers('avis_virement', 'SARL Toiture')).toEqual(['4. Documents artisans', 'SARL Toiture'])
    expect(sousDossiers('pv_reception', null)).toEqual(['4. Documents artisans', 'Sans artisan'])
    expect(sousDossiers('facture_artisan', 'SARL Toiture')).toEqual(['4. Documents artisans', 'SARL Toiture', 'Factures'])
    expect(sousDossiers('autre_artisan', 'SARL Toiture')).toEqual(['4. Documents artisans', 'SARL Toiture', 'Autre'])
    // Plans & techniques : plans, estimations, fiches techniques liées au chantier.
    expect(sousDossiers('plans')).toEqual(['5. Plans & techniques'])
    expect(sousDossiers('estimation')).toEqual(['5. Plans & techniques'])
    expect(sousDossiers('fiche_technique')).toEqual(['5. Plans & techniques'])
    // Administratif : facture honoraires illiCO, contrat, admin client.
    expect(sousDossiers('facture_honoraire')).toEqual(['1. Administratif'])
    expect(sousDossiers('administratif')).toEqual(['1. Administratif'])
    expect(sousDossiers(null)).toEqual(['1. Administratif'])
    expect(sousDossiers('inconnue')).toEqual(['1. Administratif'])
  })

  it('photoSousDossiers — 6. Photos/<catégorie numérotée>', () => {
    expect(photoSousDossiers('avant')).toEqual(['6. Photos', '1. Avant'])
    expect(photoSousDossiers('pendant')).toEqual(['6. Photos', '2. Pendant'])
    expect(photoSousDossiers('apres')).toEqual(['6. Photos', '3. Après'])
    expect(photoSousDossiers('maquette')).toEqual(['6. Photos', '4. Maquette'])
    expect(photoSousDossiers(null)).toEqual(['6. Photos', 'Autres'])
  })

  it('nettoyerSegment — retire les caractères interdits OneDrive', () => {
    expect(nettoyerSegment('a/b:c*d?e"f<g>h|i')).toBe('a-b-c-d-e-f-g-h-i')
    expect(nettoyerSegment('  x   y  ')).toBe('x y')
    expect(nettoyerSegment('')).toBe('-')
  })

  it('chantierBaseSegments — 01_CLIENTS/<bucket>/AAAA-MM-JJ NOM', () => {
    expect(chantierBaseSegments('en_cours', '2026-07-20T00:00:00', 'Martin'))
      .toEqual(['01_CLIENTS', '1. En cours', '2026-07-20 MARTIN'])
    expect(chantierBaseSegments('termine', '2026-07-25T00:00:00', 'Dupont', { dateFin: '2026-08-01' }))
      .toEqual(['01_CLIENTS', '2. Terminés', '2026', '2026-07-25 DUPONT'])
    expect(chantierBaseSegments('annule', '2026-07-25T00:00:00', 'Durand'))
      .toEqual(['01_CLIENTS', '3. Sans suite', '2026-07-25 DURAND'])
  })

  it('cheminChantier — document dans le bon bucket', () => {
    expect(cheminChantier('en_cours', '2026-07-20T00:00:00', 'Martin', 'compte_rendu', null))
      .toEqual(['01_CLIENTS', '1. En cours', '2026-07-20 MARTIN', '2. Comptes rendus'])
    expect(cheminChantier('en_cours', '2026-07-25T00:00:00', 'Dupont', 'facture_artisan', 'SARL Toiture'))
      .toEqual(['01_CLIENTS', '1. En cours', '2026-07-25 DUPONT', '4. Documents artisans', 'SARL Toiture', 'Factures'])
    // facture honoraires illiCO → 1. Administratif
    expect(cheminChantier('en_cours', '2026-07-25T00:00:00', 'Dupont', 'facture_honoraire', null))
      .toEqual(['01_CLIENTS', '1. En cours', '2026-07-25 DUPONT', '1. Administratif'])
  })

  it('cheminChantierPhoto — photo dans 6. Photos/<catégorie> du bon bucket', () => {
    expect(cheminChantierPhoto('en_cours', '2026-07-20T00:00:00', 'Martin', 'avant'))
      .toEqual(['01_CLIENTS', '1. En cours', '2026-07-20 MARTIN', '6. Photos', '1. Avant'])
    expect(cheminChantierPhoto('annule', '2026-07-25T00:00:00', 'Durand', null))
      .toEqual(['01_CLIENTS', '3. Sans suite', '2026-07-25 DURAND', '6. Photos', 'Autres'])
  })

  it('cheminArtisanGlobal — 02_ARTISANS/<Artisan>/<sous-dossier>', () => {
    expect(cheminArtisanGlobal('SARL Toiture', 'Fiches techniques'))
      .toEqual(['02_ARTISANS', 'SARL Toiture', 'Fiches techniques'])
    expect(cheminArtisanGlobal('Toiture/Sud', 'Documents administratif'))
      .toEqual(['02_ARTISANS', 'Toiture-Sud', 'Documents administratif'])
    expect(cheminArtisanGlobal(null, 'Fiches techniques'))
      .toEqual(['02_ARTISANS', 'Sans artisan', 'Fiches techniques'])
  })
})
