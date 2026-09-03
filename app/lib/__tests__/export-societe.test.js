import { describe, it, expect } from 'vitest'
import {
  humaniserColonne, ordonnerColonnes, colonnesDepuisLignes, nomFichier,
  ongletAccueil, TABLES_SOCIETE, TABLES_DOSSIER, TABLES_PETITES_FILLES, ONGLETS,
} from '../export-societe.js'
import { typeDeValeur, serieExcel, nomOngletValide } from '../xlsx-simple.js'

// L'export est une promesse contractuelle : « tu peux partir avec tes données ». Deux
// façons de la trahir sans bruit — livrer un fichier illisible, ou livrer un fichier
// lisible dont les valeurs sont fausses. Les deux se testent ici.

describe('libellés des colonnes', () => {
  it('met les accents que la base ne porte pas — c\'est ce qui sépare un document d\'un vidage', () => {
    expect(humaniserColonne('prenom')).toBe('Prénom')
    expect(humaniserColonne('telephone')).toBe('Téléphone')
    expect(humaniserColonne('civilite')).toBe('Civilité')
    expect(humaniserColonne('decennale_expiration')).toBe('Décennale — expiration')
  })

  it('traduit vers le métier, pas vers le nom technique', () => {
    expect(humaniserColonne('dossier_id')).toBe('Chantier (id)')
    expect(humaniserColonne('date_signature')).toBe('Signé le')
    expect(humaniserColonne('hors_honoraires')).toBe('Sans honoraires')
  })

  it('nomme l\'unité des taux — la confusion points/fraction a déjà coûté cher', () => {
    expect(humaniserColonne('taux_courtage')).toContain('fraction')
    expect(humaniserColonne('honoraires_amo_taux')).toContain('points')
    expect(humaniserColonne('apporteur_pourcentage')).toContain('points')
    expect(humaniserColonne('commission_pourcentage')).toContain('fraction')
  })

  it('reste lisible sur une colonne inconnue plutôt que de planter', () => {
    expect(humaniserColonne('champ_ajoute_demain')).toBe('Champ ajoute demain')
  })
})

describe('ordre des colonnes', () => {
  it('met en tête ce qu\'on cherche en ouvrant le classeur', () => {
    const ordre = ordonnerColonnes(['societe_id', 'id', 'created_at', 'nom', 'reference'])
    expect(ordre[0]).toBe('reference')
    expect(ordre[1]).toBe('nom')
  })

  it('renvoie les identifiants techniques en fin de ligne', () => {
    const ordre = ordonnerColonnes(['societe_id', 'id', 'nom', 'dossier_id'])
    expect(ordre.slice(-3).sort()).toEqual(['dossier_id', 'id', 'societe_id'])
  })

  it('ne perd aucune colonne au passage', () => {
    const entree = ['a', 'nom', 'id', 'zzz', 'montant_ht', 'client_id']
    expect(ordonnerColonnes(entree).sort()).toEqual([...entree].sort())
  })
})

describe('typage des valeurs — là où un export ment sans le dire', () => {
  it('garde un téléphone en TEXTE : « 0612345678 » ne doit pas perdre son zéro', () => {
    expect(typeDeValeur('0612345678')).toBe('texte')
    expect(typeDeValeur('0491000000')).toBe('texte')
  })

  it('garde une référence en texte plutôt que de la voir devenir une date', () => {
    expect(typeDeValeur('2026-AM-001')).toBe('texte')
  })

  it('convertit en nombre les montants que PostgREST rend en texte', () => {
    expect(typeDeValeur('1250.00')).toBe('nombre')
    expect(typeDeValeur('37175.6')).toBe('nombre')
    expect(typeDeValeur(490)).toBe('nombre')
  })

  it('reconnaît les dates et les horodatages', () => {
    expect(typeDeValeur('2026-04-02')).toBe('date')
    expect(typeDeValeur('2026-09-03T07:30:00+00:00')).toBe('horodatage')
  })

  it('ne confond pas le vide avec zéro', () => {
    expect(typeDeValeur(null)).toBe('vide')
    expect(typeDeValeur('')).toBe('vide')
    expect(typeDeValeur(0)).toBe('nombre')
  })
})

describe('dates dans le classeur', () => {
  // Excel ignore les fuseaux : un horodatage doit être converti en heure de Paris AVANT
  // d'être écrit, sinon un rendez-vous de 9 h 30 s'affiche à 7 h 30.
  it('convertit un horodatage UTC en heure de Paris', () => {
    const serie = serieExcel('2026-09-03T07:30:00+00:00', true)
    const heures = (serie - Math.floor(serie)) * 24
    expect(Math.round(heures * 60) / 60).toBeCloseTo(9.5, 2)   // 09:30 à Paris
  })

  it('ne décale PAS une date sans heure', () => {
    const serie = serieExcel('2026-04-02', false)
    expect(serie % 1).toBe(0)   // minuit pile, aucun décalage de fuseau
  })

  it('rend null sur une date illisible plutôt qu\'une cellule aberrante', () => {
    expect(serieExcel('pas une date', true)).toBe(null)
  })
})

describe('noms d\'onglets', () => {
  it('retire les caractères qu\'Excel refuse', () => {
    expect(nomOngletValide('Devis / PV : 2026 ?')).not.toMatch(/[:\\/?*[\]]/)
  })
  it('coupe à 31 caractères', () => {
    expect(nomOngletValide('a'.repeat(60)).length).toBeLessThanOrEqual(31)
  })
  it('dédoublonne au lieu d\'écraser un onglet', () => {
    const vus = new Set()
    const a = nomOngletValide('Clients', vus)
    const b = nomOngletValide('Clients', vus)
    expect(a).not.toBe(b)
  })
})

describe('couverture des tables', () => {
  // Le risque d'un export n'est pas qu'il plante : c'est qu'il soit INCOMPLET sans le
  // dire. Ces tests figent la liste — ajouter une table oblige à y penser.
  it('couvre les tables de la société et celles des dossiers', () => {
    for (const t of ['clients', 'dossiers', 'artisans', 'rendez_vous']) expect(TABLES_SOCIETE).toContain(t)
    for (const t of ['devis_artisans', 'suivi_financier', 'comptes_rendus', 'messages']) expect(TABLES_DOSSIER).toContain(t)
  })

  it('n\'exporte JAMAIS les jetons d\'accès ni la sécurité de compte', () => {
    const toutes = [...TABLES_SOCIETE, ...TABLES_DOSSIER, ...TABLES_PETITES_FILLES.map(x => x[0])]
    for (const interdite of ['comptes_oauth', 'email_sender_oauth', 'admin_invitations', 'reset_cooldown']) {
      expect(toutes).not.toContain(interdite)
    }
  })

  it('n\'exporte pas la mécanique interne, qui se reconstruit seule', () => {
    const toutes = [...TABLES_SOCIETE, ...TABLES_DOSSIER, ...TABLES_PETITES_FILLES.map(x => x[0])]
    for (const inutile of ['documents_cache', 'cible_sync_state', 'drive_inbox']) {
      expect(toutes).not.toContain(inutile)
    }
  })

  it('rattache chaque petite-fille à une table réellement exportée', () => {
    const exportees = new Set([...TABLES_SOCIETE, ...TABLES_DOSSIER])
    for (const [, , parente] of TABLES_PETITES_FILLES) expect(exportees.has(parente)).toBe(true)
  })

  it('donne un onglet à chaque table collectée — aucune ne disparaît en silence', () => {
    const collectees = new Set([...TABLES_SOCIETE, ...TABLES_DOSSIER,
      ...TABLES_PETITES_FILLES.map(x => x[0]), 'societe', 'utilisateurs'])
    const enOnglet = new Set(ONGLETS.map(o => o[0]))
    for (const t of collectees) expect(enOnglet.has(t)).toBe(true)
    expect(enOnglet.size).toBe(collectees.size)
  })
})

describe('colonnes construites depuis les lignes', () => {
  it('marque les montants pour qu\'ils s\'affichent avec deux décimales', () => {
    const cols = colonnesDepuisLignes([{ montant_ttc: '1250.00', nom: 'X' }])
    expect(cols.find(c => c.cle === 'montant_ttc').montant).toBe(true)
    expect(cols.find(c => c.cle === 'nom').montant).toBe(false)
  })
  it('élargit les colonnes de texte long', () => {
    const cols = colonnesDepuisLignes([{ notes: 'texte', nom: 'X' }])
    expect(cols.find(c => c.cle === 'notes').largeur).toBeGreaterThan(cols.find(c => c.cle === 'nom').largeur)
  })
})

describe('onglet d\'accueil', () => {
  const resume = [
    { table: 'clients', lignes: 12, tronque: false },
    { table: 'dossiers', lignes: 49, tronque: false },
  ]

  it('annonce la société, la date et les volumes', () => {
    const o = ongletAccueil({ societe: { nom_societe: 'CTP' }, resume, maintenant: new Date('2026-09-03T10:00:00Z') })
    const texte = JSON.stringify(o.lignes)
    expect(texte).toContain('CTP')
    expect(texte).toContain('61')
  })

  it('dit ce qui MANQUE, pas seulement ce qui est là', () => {
    const texte = JSON.stringify(ongletAccueil({ societe: {}, resume }).lignes)
    expect(texte).toContain("CE QU'IL NE CONTIENT PAS")
    expect(texte).toContain('jetons de connexion')
  })

  it('crie quand une table est tronquée — un export incomplet muet serait pire que rien', () => {
    const texte = JSON.stringify(ongletAccueil({
      societe: {}, resume: [...resume, { table: 'photos', lignes: 50000, tronque: true }],
    }).lignes)
    expect(texte).toContain('ATTENTION')
    expect(texte).toContain('INCOMPLET')
  })

  it('ne crie pas quand tout est complet', () => {
    expect(JSON.stringify(ongletAccueil({ societe: {}, resume }).lignes)).not.toContain('ATTENTION')
  })
})

describe('nom du fichier', () => {
  it('est lisible, daté, sans accent ni espace', () => {
    expect(nomFichier('CONSEIL TRAVAUX PROVENCE — CTP', new Date('2026-09-03T10:00:00Z')))
      .toBe('Export_BATILIS_CONSEIL_TRAVAUX_PROVENCE_CTP_2026-09-03.xlsx')
  })
  it('résiste à un nom de société vide', () => {
    expect(nomFichier('', new Date('2026-09-03T10:00:00Z'))).toBe('Export_BATILIS_societe_2026-09-03.xlsx')
  })
})
