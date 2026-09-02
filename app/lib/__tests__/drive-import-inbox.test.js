import { describe, it, expect } from 'vitest'
import { estEchoNom, cheminDriveDoc, importerInbox } from '../drive/import-inbox.js'

// Garde-fou anti-doublon du rattachement automatique : les 13 fichiers qui dormaient dans
// « à rattacher » étaient tous des échos de l'app (factures / contrats déjà en base, revenus
// sous un nouvel item_id après recréation par pushMirror). Sans ce garde-fou, le rattachement
// automatique les aurait ré-importés en doublon silencieux.
describe('estEchoNom — garde-fou anti-echo par nom de fichier', () => {
  const chemins = [
    '01_CLIENTS/1. En cours/2026-06-09 BARLOY-TEPPE/4. Documents artisans/MJ RENOVATION/Factures/Facture_Barloy_MJ.pdf',
    '01_CLIENTS/1. En cours/2026-06-09 BARLOY-TEPPE/1. Administratif/Contrat_Barloy.pdf',
  ]

  it('nom identique au dernier segment d un chemin indexe -> echo', () => {
    expect(estEchoNom('Facture_Barloy_MJ.pdf', chemins)).toBe(true)
    expect(estEchoNom('Contrat_Barloy.pdf', chemins)).toBe(true)
  })

  it('nom absent des chemins -> pas un echo (vrai fichier a rattacher)', () => {
    expect(estEchoNom('Plan_masse.pdf', chemins)).toBe(false)
  })

  it('compare le DERNIER segment, pas le chemin entier', () => {
    // un nom qui apparait au milieu du chemin ne doit pas compter
    expect(estEchoNom('MJ RENOVATION', chemins)).toBe(false)
    expect(estEchoNom('1. Administratif', chemins)).toBe(false)
  })

  it('nom vide ou liste vide -> pas un echo', () => {
    expect(estEchoNom('', chemins)).toBe(false)
    expect(estEchoNom('Facture_Barloy_MJ.pdf', [])).toBe(false)
    expect(estEchoNom('x.pdf', null)).toBe(false)
  })
})

// cheminDriveDoc -- chemin qu'importerInbox ecrit dans doc_index.path : le chemin DRIVE (comme
// les pushes), tronque a partir de RACINE_CLIENTS, PAS le chemin de stockage aleatoire. Son
// dernier segment doit rester le vrai nom du fichier pour que estEchoNom marche durablement.
describe('cheminDriveDoc -- chemin drive ecrit dans doc_index.path', () => {
  it('parent_path deja relatif a 01_CLIENTS + nom', () => {
    expect(cheminDriveDoc('01_CLIENTS/1. En cours/2026-06-09 BARLOY-TEPPE/1. Administratif', 'Contrat.pdf'))
      .toBe('01_CLIENTS/1. En cours/2026-06-09 BARLOY-TEPPE/1. Administratif/Contrat.pdf')
  })
  it('tronque tout prefixe avant RACINE_CLIENTS (racine drive, slash de tete)', () => {
    expect(cheminDriveDoc('/drive/root:/01_CLIENTS/1. En cours/X', 'F.pdf'))
      .toBe('01_CLIENTS/1. En cours/X/F.pdf')
  })
  it('sans 01_CLIENTS -> garde les segments tels quels + nom', () => {
    expect(cheminDriveDoc('un/dossier', 'F.pdf')).toBe('un/dossier/F.pdf')
  })
  it('dernier segment = nom du fichier (invariant pour estEchoNom)', () => {
    const p = cheminDriveDoc('01_CLIENTS/1. En cours/2026-06-09 BARLOY-TEPPE/1. Administratif', 'Contrat.pdf')
    expect(p.split('/').pop()).toBe('Contrat.pdf')
  })
})

// Fake Supabase minimal (thenable query-builder) pour tester concurrence/rollback.
// db.from(t).update(x).eq().eq().select() -> await {data,error}
// db.from(t).insert(x).select().single()  -> {data,error}
// db.from(t).insert(x)  (await direct)     -> {error}
// db.from(t).delete().eq()                 -> await {}
function makeDb(opts = {}) {
  const calls = {
    claim: 0, reset: 0, cdDelete: [], docIndexInserts: 0, docIndexPath: undefined,
    storageRemove: [], uploadPath: undefined, cdInsert: 0,
  }
  class QB {
    constructor(table) { this.table = table; this._op = null; this._payload = null; this._eqs = [] }
    update(p) { this._op = 'update'; this._payload = p; return this }
    insert(p) { this._op = 'insert'; this._payload = p; return this }
    delete() { this._op = 'delete'; return this }
    eq(f, v) { this._eqs.push([f, v]); return this }
    select() { this._select = true; return this }
    single() { return this._resolveInsert() }
    maybeSingle() { return this._resolve() }
    then(res, rej) { return this._resolve().then(res, rej) }
    _resolveInsert() {
      if (this.table === 'chantier_documents' && this._op === 'insert') {
        calls.cdInsert++
        return Promise.resolve({ data: opts.insErr ? null : { id: 'doc1' }, error: opts.insErr || null })
      }
      return Promise.resolve({ data: null, error: null })
    }
    async _resolve() {
      const t = this.table, op = this._op, p = this._payload || {}
      if (t === 'drive_inbox' && op === 'update') {
        if (p.statut === 'rattache') { // prise atomique
          calls.claim++
          return { data: opts.claimErr ? null : (opts.claimRows ?? [{ id: 'inbox1' }]), error: opts.claimErr || null }
        }
        if (p.statut === 'a_rattacher') { calls.reset++; return { data: null, error: null } } // relacher
      }
      if (t === 'chantier_documents' && op === 'delete') { calls.cdDelete.push(this._eqs); return { data: null, error: null } }
      if (t === 'doc_index' && op === 'insert') {
        calls.docIndexInserts++; calls.docIndexPath = p.path
        return { data: null, error: opts.idxErr || null }
      }
      return { data: null, error: null }
    }
  }
  const db = {
    from(table) { return new QB(table) },
    storage: {
      from() {
        return {
          async upload(path) { calls.uploadPath = path; return { error: opts.uploadErr || null } },
          remove(paths) { calls.storageRemove.push(...paths); return Promise.resolve({ error: null }) },
        }
      },
    },
  }
  return { db, calls }
}

function makeMod(state = {}) {
  return {
    async downloadItemContent() { state.downloaded = true; return { buffer: Buffer.from('xx'), contentType: 'application/pdf' } },
  }
}

const INBOX = {
  id: 'inbox1', user_id: 'u1', drive_id: 'd1', item_id: 'it1', name: 'Contrat.pdf',
  parent_path: '01_CLIENTS/1. En cours/2026-06-09 BARLOY-TEPPE/1. Administratif',
}

describe('importerInbox -- prise atomique & rollback tout-ou-rien', () => {
  it('prise perdue (0 ligne affectee) -> skipped, aucun telechargement ni ecriture', async () => {
    const { db, calls } = makeDb({ claimRows: [] })
    const state = {}
    const r = await importerInbox(db, {
      mod: makeMod(state), token: 't', inbox: INBOX, fournisseur: 'onedrive', dossierId: 'ch1', auto: true,
    })
    expect(r).toEqual({ skipped: true, reason: 'deja_pris' })
    expect(state.downloaded).toBeUndefined()
    expect(calls.uploadPath).toBeUndefined()
    expect(calls.cdInsert).toBe(0)
    expect(calls.docIndexInserts).toBe(0)
    expect(calls.reset).toBe(0)
  })

  it('echec insert doc_index apres chantier_documents -> supprime chantier_documents + stockage + relache', async () => {
    const { db, calls } = makeDb({ idxErr: { message: 'boom' } })
    const r = await importerInbox(db, {
      mod: makeMod(), token: 't', inbox: INBOX, fournisseur: 'onedrive', dossierId: 'ch1', auto: true,
    })
    expect(r.error).toBeTruthy()
    expect(calls.cdInsert).toBe(1)
    expect(calls.cdDelete.length).toBe(1)
    expect(calls.cdDelete[0]).toEqual([['id', 'doc1']])
    expect(calls.storageRemove).toContain(calls.uploadPath)
    expect(calls.reset).toBe(1)
  })

  it('happy path -> ok + doc_index.path = chemin DRIVE, pas de rollback', async () => {
    const { db, calls } = makeDb()
    const r = await importerInbox(db, {
      mod: makeMod(), token: 't', inbox: INBOX, fournisseur: 'onedrive', dossierId: 'ch1', auto: true,
    })
    expect(r).toEqual({ ok: true, document_id: 'doc1' })
    expect(calls.docIndexInserts).toBe(1)
    expect(calls.docIndexPath).toBe('01_CLIENTS/1. En cours/2026-06-09 BARLOY-TEPPE/1. Administratif/Contrat.pdf')
    expect(calls.cdDelete.length).toBe(0)
    expect(calls.reset).toBe(0)
    expect(calls.storageRemove.length).toBe(0)
  })

  it('exception (telechargement Graph) -> relache, pas de demi-rattachement', async () => {
    const { db, calls } = makeDb()
    const mod = { async downloadItemContent() { throw new Error('graph down') } }
    const r = await importerInbox(db, {
      mod, token: 't', inbox: INBOX, fournisseur: 'onedrive', dossierId: 'ch1', auto: true,
    })
    expect(r.error).toBeTruthy()
    expect(calls.claim).toBe(1)
    expect(calls.reset).toBe(1)
    expect(calls.cdInsert).toBe(0)
  })
})
