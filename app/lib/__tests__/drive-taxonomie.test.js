import { describe, it, expect } from 'vitest'
import { RACINE_CLIENTS, RACINE_ARTISANS, dateDossier, nomDossierChantier, bucketSegments, devisSousDossier, sousDossiers, photoSousDossiers, nettoyerSegment, chantierBaseSegments, cheminChantier, cheminChantierPhoto, cheminArtisanGlobal, patronymeDossier } from '../drive/taxonomie.js'
import { suffixeDepuisGroupe } from '../drive/collisions.js'

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
    // Circuit a 4 etapes du _MODELE DOSSIER CLIENT (02/09), noms SANS accent.
    expect(devisSousDossier('accepte')).toBe('3. Signes')
    expect(devisSousDossier('signe')).toBe('3. Signes')
    expect(devisSousDossier('refuse')).toBe('4. Refuses')
    expect(devisSousDossier('en_attente')).toBe('2. Presentes')
    expect(devisSousDossier('recu')).toBe('1. Recus')
    expect(devisSousDossier(null)).toBe('1. Recus')
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
    expect(photoSousDossiers('apres')).toEqual(['6. Photos', '3. Apres'])
    // La maquette est un livrable technique, pas une photo de chantier (arbitrage 02/09).
    expect(photoSousDossiers('maquette')).toEqual(['5. Plans & techniques'])
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

  it('patronymeDossier — NOM seul, ou NOM-NOM2 pour un couple', () => {
    expect(patronymeDossier('Ziat', 'Lefevre')).toBe('ZIAT-LEFEVRE')
    expect(patronymeDossier('Dupont', null)).toBe('DUPONT')
    expect(patronymeDossier('Dupont', '')).toBe('DUPONT')
    // meme nom, casse differente -> pas de doublon NOM-NOM
    expect(patronymeDossier('Brunet', 'brunet')).toBe('BRUNET')
    // espaces de fin coupes (valeurs reelles « Teppe », « Joel »)
    expect(patronymeDossier('Teppe ', null)).toBe('TEPPE')
    expect(patronymeDossier('Ziat ', 'Lefevre ')).toBe('ZIAT-LEFEVRE')
    expect(patronymeDossier(null, null)).toBe('CLIENT')
  })

  it('nomDossierChantier — couple + date metier fournie par l appelant', () => {
    // la date passee est la date metier choisie en amont (date_premier_rdv || created_at)
    expect(nomDossierChantier('2026-03-12T00:00:00', 'Ziat', 'Lefevre')).toBe('2026-03-12 ZIAT-LEFEVRE')
    expect(nomDossierChantier('2026-03-12', 'Teppe ', ' ')).toBe('2026-03-12 TEPPE')
    // retrocompat : sans nom2 -> NOM seul
    expect(nomDossierChantier('2026-07-19T00:00:00', 'Guerteau')).toBe('2026-07-19 GUERTEAU')
  })

  it('chantierBaseSegments — couple via opts.nom2', () => {
    expect(chantierBaseSegments('en_cours', '2026-03-12T00:00:00', 'Ziat', { nom2: 'Lefevre' }))
      .toEqual(['01_CLIENTS', '1. En cours', '2026-03-12 ZIAT-LEFEVRE'])
    expect(chantierBaseSegments('en_cours', '2026-03-12T00:00:00', 'Ziat'))
      .toEqual(['01_CLIENTS', '1. En cours', '2026-03-12 ZIAT'])
  })

  it('nomDossierChantier — suffixe anti-collision accole au nom', () => {
    expect(nomDossierChantier('2026-03-12', 'Ziat', 'Lefevre', '_1')).toBe('2026-03-12 ZIAT-LEFEVRE_1')
    expect(nomDossierChantier('2026-03-12', 'Dupont', null, '')).toBe('2026-03-12 DUPONT')
  })

  it('chantierBaseSegments — suffixe via opts.suffixe', () => {
    expect(chantierBaseSegments('en_cours', '2026-03-12', 'Tundidor', { suffixe: '_1' }))
      .toEqual(['01_CLIENTS', '1. En cours', '2026-03-12 TUNDIDOR_1'])
  })
})

describe('drive/collisions — suffixe anti-collision (pur)', () => {
  it('client a un seul dossier -> aucun suffixe (regression la plus probable)', () => {
    const d = { id: 'a', created_at: '2026-01-05', date_premier_rdv: '2026-06-01' }
    expect(suffixeDepuisGroupe([d], d)).toBe('')
  })

  it('collision -> premier (created_at le plus ancien) nu, suivant _1', () => {
    // cas reel ZIAT-LEFEVRE (2026-AM-010 / 2026-AM-011)
    const g = [
      { id: 'z1', reference: '2026-AM-010', created_at: '2026-01-05T09:00:00', date_premier_rdv: '2026-06-01' },
      { id: 'z2', reference: '2026-AM-011', created_at: '2026-01-06T09:00:00', date_premier_rdv: '2026-06-01' },
    ]
    expect(suffixeDepuisGroupe(g, g[0])).toBe('')
    expect(suffixeDepuisGroupe(g, g[1])).toBe('_1')
  })

  it('cle = created_at, PAS reference (prefixes AM/CT ne doivent pas decider)', () => {
    const g = [
      { id: 'x', reference: '2026-AM-010', created_at: '2026-01-10', date_premier_rdv: '2026-06-01' },
      { id: 'y', reference: '2026-CT-041', created_at: '2026-01-05', date_premier_rdv: '2026-06-01' },
    ]
    // y est le plus ancien -> nu ; x -> _1 (l'inverse d'un tri par reference)
    expect(suffixeDepuisGroupe(g, g[1])).toBe('')
    expect(suffixeDepuisGroupe(g, g[0])).toBe('_1')
  })

  it('dates metier differentes -> pas de collision', () => {
    const g = [
      { id: 'a', created_at: '2026-01-05', date_premier_rdv: '2026-06-01' },
      { id: 'b', created_at: '2026-01-06', date_premier_rdv: '2026-07-15' },
    ]
    expect(suffixeDepuisGroupe(g, g[0])).toBe('')
    expect(suffixeDepuisGroupe(g, g[1])).toBe('')
  })

  it('date metier via created_at quand date_premier_rdv absent', () => {
    const g = [
      { id: 'a', created_at: '2026-03-12T08:00:00' },
      { id: 'b', created_at: '2026-03-12T20:00:00' },
    ]
    expect(suffixeDepuisGroupe(g, g[0])).toBe('')
    expect(suffixeDepuisGroupe(g, g[1])).toBe('_1')
  })
})
