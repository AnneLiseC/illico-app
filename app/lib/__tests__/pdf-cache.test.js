import { describe, it, expect } from 'vitest'
import { empreinteDe, cheminCache, jourDEdition, VERSION_GENERATEUR } from '../pdf/cache.js'

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
    // La forme RÉELLEMENT renvoyée par PostgREST pour un numeric : décimales incluses.
    // L'ancien test ne l'exerçait pas, et cette forme-là n'était pas normalisée.
    expect(empreinteDe({ m: 1250 })).toBe(empreinteDe({ m: '1250.00' }))
    expect(empreinteDe({ m: 0.5 })).toBe(empreinteDe({ m: '0.50' }))
  })

  it('ne touche PAS aux identifiants et aux dates qui ressemblent à des nombres', () => {
    // Une référence ou une date ne doit jamais être « normalisée » comme un montant.
    expect(empreinteDe({ r: '2026-AM-001' })).not.toBe(empreinteDe({ r: '2026-AM-1' }))
    expect(empreinteDe({ d: '2026-09-03' })).toBe(empreinteDe({ d: '2026-09-03' }))
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

  // Deux versions d'un même document ne doivent JAMAIS partager un fichier : c'est ce
  // qui permettait à deux générations concurrentes de lier la mauvaise empreinte au
  // mauvais contenu, définitivement.
  it('deux empreintes différentes donnent deux fichiers différents', () => {
    const a = cheminCache('abc', 'dossier_suivi', null, 'a'.repeat(64))
    const b = cheminCache('abc', 'dossier_suivi', null, 'b'.repeat(64))
    expect(a).not.toBe(b)
    expect(a).toContain('cache/abc/dossier_suivi-')
  })
  it('la même empreinte donne le même fichier — l\'écriture est idempotente', () => {
    const e = 'c'.repeat(64)
    expect(cheminCache('abc', 'cr', 'cr1', e)).toBe(cheminCache('abc', 'cr', 'cr1', e))
  })
})

describe('jourDEdition', () => {
  // La date d'édition est imprimée sur le document. Sans elle dans l'empreinte, un
  // document servi trois semaines plus tard porte la date de sa première fabrication.
  it('rend une date au format AAAA-MM-JJ', () => {
    expect(jourDEdition(new Date('2026-09-03T15:42:00Z'))).toBe('2026-09-03')
  })
  it('ne change pas au cours de la même journée', () => {
    expect(jourDEdition(new Date('2026-09-03T00:01:00Z')))
      .toBe(jourDEdition(new Date('2026-09-03T23:59:00Z')))
  })
  it('change d\'un jour sur l\'autre — le document se refait', () => {
    expect(jourDEdition(new Date('2026-09-03T23:59:00Z')))
      .not.toBe(jourDEdition(new Date('2026-09-04T00:01:00Z')))
  })
})

// ── La version du générateur ───────────────────────────────────────────────
//
// Le trou du 09/09, et le seul qui rendait un correctif INVISIBLE. L'empreinte ne
// portait que les données : corriger la mise en page ne périmait rien, et les documents
// fabriqués plus tôt dans la journée continuaient de sortir dans leur ancienne version.
// Le dossier 2026-CT-044, refait après le déploiement, a resservi celui de 09 h 49.
//
// Le risque n'est pas de perdre une minute à régénérer : c'est de croire qu'un correctif
// ne marche pas, ou pire, de laisser un franchisé remettre à son client un document dont
// on a corrigé le défaut le matin même.
describe('version du générateur dans l\'empreinte', () => {
  const donnees = { dossier: { id: 'x' }, devis: [{ id: 'd1' }] }
  const empreinteAvec = (v) => empreinteDe({ ...donnees, jourDEdition: '2026-09-09', versionGenerateur: v })

  it('périme TOUS les documents quand la mise en page change', () => {
    expect(empreinteAvec(1)).not.toBe(empreinteAvec(2))
  })

  it('ne périme rien tant que la version ne bouge pas — sinon le cache ne sert à rien', () => {
    expect(empreinteAvec(2)).toBe(empreinteAvec(2))
  })

  it('est bien une valeur, pas un oubli : une empreinte sans version diffère', () => {
    // La régression à empêcher : retirer la clé de l'appel « parce que ça marche pareil ».
    expect(empreinteDe({ ...donnees, jourDEdition: '2026-09-09' })).not.toBe(empreinteAvec(2))
  })

  it('la constante existe et est un entier — elle sert de compteur, pas de libellé', () => {
    expect(Number.isInteger(VERSION_GENERATEUR)).toBe(true)
    expect(VERSION_GENERATEUR).toBeGreaterThanOrEqual(2)
  })
})
