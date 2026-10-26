// app/lib/__tests__/mcp.test.js
// Tests du connecteur MCP « BATILIS » (lecture seule).
//
// Le client Supabase est SIMULÉ : il ne contient que les lignes que la RLS laisserait voir
// à la personne connectée. Un dossier d'une autre société n'y figure donc pas — exactement
// comme en base — et doit produire le MÊME message qu'un dossier inexistant.
// Le faux client n'a AUCUNE méthode d'écriture : un outil qui tenterait d'écrire planterait.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { dirname, join, normalize } from 'path'
import { calculateDossierFinance } from '../finance'
import { calcStatut } from '../dossiers'
import { retourConsentementSur, CHEMIN_CONSENTEMENT } from '../oauth-consentement'

const CLIENT_OAUTH = 'client-claude-batilis'

// ── Faux client Supabase ──────────────────────────────────────────────────────
function fauxSupabase(tables, { user = { id: 'u-agente' }, erreurUser = false } = {}) {
  const lus = []
  const requete = (table) => {
    let lignes = [...(tables[table] || [])]
    const q = {
      select: () => q, order: () => q, limit: () => q,
      eq: (c, v) => { lignes = lignes.filter(r => r[c] === v); return q },
      in: (c, vs) => { lignes = lignes.filter(r => vs.includes(r[c])); return q },
      is: (c, v) => { lignes = lignes.filter(r => (r[c] ?? null) === v); return q },
      not: (c, op, v) => { const ex = v.slice(1, -1).split(','); lignes = lignes.filter(r => !ex.includes(r[c])); return q },
      gte: (c, v) => { lignes = lignes.filter(r => r[c] >= v); return q },
      lte: (c, v) => { lignes = lignes.filter(r => r[c] <= v); return q },
      maybeSingle: () => Promise.resolve({ data: lignes[0] ?? null, error: null }),
      then: (ok, ko) => Promise.resolve({ data: lignes, error: null }).then(ok, ko),
    }
    return q
  }
  return {
    lus,
    auth: { getUser: async () => (erreurUser ? { data: { user: null }, error: { message: 'jwt expired' } } : { data: { user }, error: null }) },
    from: (t) => { lus.push(t); return requete(t) },
  }
}

function jwt(claims) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'HS256' })}.${b64(claims)}.sig`
}
const JETON_OAUTH = jwt({ sub: 'u-agente', role: 'authenticated', client_id: CLIENT_OAUTH })

// ── Données : ce que voit l'agente A (société CTP) ────────────────────────────
const CLIENT_A = { civilite: 'Mme', nom: 'Martin', prenom: 'Julie', type_client: 'particulier', adresse: '1 rue A', email: 'julie@exemple.fr', telephone: '0600000000' }
const DEVIS = [
  { id: 'dv1', artisan_id: 'art1', dossier_id: 'd1', statut: 'accepte', date_signature: '2026-09-01', montant_ht: 10000, montant_ttc: 11000, commission_pourcentage: 0.1, acompte_pourcentage: 30, hors_honoraires: false, numero_devis: 'D-001', devis_pdf_path: 'chantiers/d1/x.pdf', artisan: { id: 'art1', entreprise: 'Plomberie Sud', metier: 'Plombier', paiement_direct: false } },
  { id: 'dv2', artisan_id: 'art2', dossier_id: 'd1', statut: 'recu', montant_ht: 5000, montant_ttc: 5500, commission_pourcentage: 0.1, acompte_pourcentage: -1, acompte_montant_fixe: 1000, hors_honoraires: true, numero_devis: 'D-002', artisan: { id: 'art2', entreprise: 'Élec Provence', metier: 'Électricien', paiement_direct: false } },
  { id: 'dv3', artisan_id: 'art3', dossier_id: 'd1', statut: 'refuse', montant_ht: 800, montant_ttc: 880, artisan: { id: 'art3', entreprise: 'Refusé SARL' } },
]
const SUIVI = [
  { id: 's1', dossier_id: 'd1', type_echeance: 'honoraires_courtage', montant_ttc: 660, statut_client: 'en_attente', statut_ctp: 'x' },
  { id: 's2', dossier_id: 'd1', type_echeance: 'acompte_artisan', artisan_id: 'art1', montant_ttc: 3300, statut_client: 'regle' },
  { id: 's3', dossier_id: 'd1', type_echeance: 'apporteur_agente', montant_ttc: 99, statut_client: 'en_attente' },
]
const D1 = {
  id: 'd1', reference: '2026-AM-043', typologie: 'courtage', statut: null, archive: false, adresse_chantier: '10 av. du Port, Martigues',
  frais_consultation: 150, frais_statut: 'regle', contrat_signe: true, taux_courtage: 0.06, part_agente: 0.5, google_start_event_id: 'g-secret',
  date_demarrage_chantier: null, created_at: '2026-01-01',
  agence: { code: 'MAR', nom: 'illiCO travaux Martigues' }, referente: { id: 'u-agente', prenom: 'Anne', nom: 'Test', role: 'agente' },
  client: CLIENT_A, devis_artisans: DEVIS, suivi_financier: SUIVI,
  rendez_vous: [], interventions_artisans: [{ artisan_id: 'art4', type_intervention: 'chantier', date_debut: '2026-11-02', date_fin: '2026-11-06', artisan: { entreprise: 'Maçon & Fils', metier: 'Maçon' } }],
  lots: [{ artisan_id: 'art1', nom: 'Plomberie', date_debut: '2026-11-02', date_fin: '2026-11-04', avancement: 20, artisan: { entreprise: 'Plomberie Sud' } }],
}
const D_ARCHIVE = { ...D1, id: 'd2', reference: '2026-CT-002', archive: true, devis_artisans: [], suivi_financier: [] }
const PROFIL_AGENTE = { id: 'u-agente', role: 'agente', actif: true, prenom: 'Anne', nom: 'Test' }

function tablesAgente() {
  return {
    profiles: [PROFIL_AGENTE],
    dossiers: [D1, D_ARCHIVE],
    rendez_vous: [
      { id: 'r1', dossier_id: 'd1', titre: 'R3 devis', type_rdv: 'presentation_devis', date_heure: '2026-11-03T08:00:00.000Z', duree_minutes: 60, adresse: null, lieu: null,
        dossier: { reference: '2026-AM-043', adresse_chantier: '10 av. du Port, Martigues', client: CLIENT_A }, artisan: { entreprise: 'Plomberie Sud' },
        rendez_vous_artisans: [{ artisan: { entreprise: 'Élec Provence' } }, { artisan: { entreprise: 'Plomberie Sud' } }], google_event_id: 'g' },
      { id: 'r2', dossier_id: 'd1', titre: 'Plus tard', type_rdv: 'suivi', date_heure: '2027-03-01T08:00:00.000Z', dossier: null, rendez_vous_artisans: [] },
    ],
    comptes_rendus: [
      { id: 'cr1', dossier_id: 'd1', valide: true, type_visite: 'r1', numero_visite: 1, date_visite: '2026-09-01', version: 1, parent_cr_id: null, contenu_final: 'CR R1 v1', notes_brutes: 'brut' },
      { id: 'cr1b', dossier_id: 'd1', valide: true, type_visite: 'r1', numero_visite: 1, date_visite: '2026-09-01', version: 2, parent_cr_id: 'cr1', contenu_final: 'CR R1 v2' },
      { id: 'cr2', dossier_id: 'd1', valide: true, type_visite: 'r2', numero_visite: 2, date_visite: '2026-10-01', version: 1, parent_cr_id: null, contenu_final: 'CR R2' },
      { id: 'cr3', dossier_id: 'd1', valide: false, type_visite: 'suivi', date_visite: '2026-10-20', contenu_final: 'brouillon' },
    ],
    actions: [
      { dossier_id: 'd1', numero: 'A1', portee: 'lot', titre: 'Fuite', texte: 'Reprendre le joint', statut: 'urgent', statut_date: '2026-10-01', supprime_at: null,
        dossier: { reference: '2026-AM-043' }, action_cibles: [{ lot: { nom: 'Plomberie' }, intervenant: { entreprise: 'Plomberie Sud' } }] },
      { dossier_id: 'd1', numero: 'A2', titre: 'Close', statut: 'cloture', supprime_at: null, dossier: { reference: '2026-AM-043' } },
      { dossier_id: 'd1', numero: 'A3', titre: 'Actée', statut: 'acte', supprime_at: null, dossier: { reference: '2026-AM-043' } },
      { dossier_id: 'd1', numero: 'A4', titre: 'Archivée', statut: 'en_cours', supprime_at: '2026-10-02', dossier: { reference: '2026-AM-043' } },
    ],
    artisans: [
      { id: 'art1', entreprise: 'Plomberie Sud', decennale_url: 'x', decennale_expiration: '2026-10-01', qualification_url: null, qualification_expiration: null,
        artisan_documents: [{ type: 'decennale', date_expiration: '2026-10-01', uploaded_at: '2025-10-01T10:00:00' }, { type: 'decennale', date_expiration: '2025-10-01', uploaded_at: '2024-10-01T10:00:00' }] },
      { id: 'art2', entreprise: 'Élec Provence', decennale_url: 'x', decennale_expiration: '2026-11-15', qualification_url: 'q', qualification_expiration: '2027-06-01', artisan_documents: [] },
      { id: 'art3', entreprise: 'Refusé SARL', decennale_url: null, decennale_expiration: null },
      { id: 'art4', entreprise: 'Maçon & Fils', decennale_url: 'x', decennale_expiration: null, qualification_url: null, qualification_expiration: null, artisan_documents: [] },
    ],
  }
}

const MAINTENANT = new Date('2026-10-26T10:00:00Z')

// ── Outils ────────────────────────────────────────────────────────────────────
describe('outils MCP (lecture seule)', async () => {
  const O = await import('../mcp/outils')

  it('mes_dossiers : dossiers visibles, statut calculé, archives exclues par défaut, sans coordonnées', async () => {
    const r = await O.mesDossiers(fauxSupabase(tablesAgente()), {})
    expect(r.dossiers.map(d => d.reference)).toEqual(['2026-AM-043'])
    expect(r.dossiers[0]).toMatchObject({ agence: 'MAR', client: 'Julie Martin', typologie: 'courtage', statut: { code: calcStatut(D1) } })
    expect(JSON.stringify(r)).not.toMatch(/julie@exemple|0600000000/)
    const avec = await O.mesDossiers(fauxSupabase(tablesAgente()), { inclure_archives: true })
    expect(avec.nombre).toBe(2)
    expect((await O.mesDossiers(fauxSupabase(tablesAgente()), { statut: 'termine' })).nombre).toBe(0)
    expect((await O.mesDossiers(fauxSupabase(tablesAgente()), { recherche: 'martigues' })).nombre).toBe(1)
  })

  it('lire_dossier : sans email ni téléphone par défaut, avec si demandé', async () => {
    const r = await O.lireDossier(fauxSupabase(tablesAgente()), { reference: '2026-am-043' })
    expect(r.client).toEqual({ nom: 'Mme Julie Martin', type: 'particulier', adresse: '1 rue A' })
    expect(r.referente).toBe('Anne Test')
    expect(r.taux).toMatchObject({ courtage: 0.06, amo: null })
    expect(JSON.stringify(r)).not.toMatch(/g-secret|part_agente/)
    const avec = await O.lireDossier(fauxSupabase(tablesAgente()), { reference: '2026-AM-043', avec_coordonnees: true })
    expect(avec.client.email).toBe('julie@exemple.fr')
  })

  it('dossier d\'une autre société = même message qu\'un dossier inexistant', async () => {
    // 2026-MR-011 existe chez RÉNOV CONSEIL mais la RLS ne le montre pas à l'agente A.
    const autre = O.lireDossier(fauxSupabase(tablesAgente()), { reference: '2026-MR-011' })
    const inexistant = O.lireDossier(fauxSupabase(tablesAgente()), { reference: '2099-XX-999' })
    await expect(autre).rejects.toThrow(O.DOSSIER_INTROUVABLE)
    await expect(inexistant).rejects.toThrow(O.DOSSIER_INTROUVABLE)
    for (const outil of [O.devisDuDossier, O.financesDuDossier, O.comptesRendus, O.interventions, O.attestationsArtisans]) {
      await expect(outil(fauxSupabase(tablesAgente()), { reference: '2026-MR-011' })).rejects.toThrow(O.DOSSIER_INTROUVABLE)
    }
  })

  it('référence portée par deux dossiers visibles : demande le code agence, puis le trouve', async () => {
    const t = tablesAgente()
    t.dossiers = [{ ...D1, reference: '2026-AM-001' }, { ...D1, id: 'd9', reference: '2026-AM-001', agence: { code: 'AIX', nom: 'Aix' } }]
    await expect(O.lireDossier(fauxSupabase(t), { reference: '2026-AM-001' })).rejects.toThrow(/agences : MAR, AIX/)
    expect((await O.lireDossier(fauxSupabase(t), { reference: '2026-AM-001', agence: 'aix' })).agence.code).toBe('AIX')
  })

  it('devis_du_dossier : montants HT/TTC, acompte, hors_honoraires ; ni chemin de fichier ni commission', async () => {
    const r = await O.devisDuDossier(fauxSupabase(tablesAgente()), { reference: '2026-AM-043' })
    expect(r.devis[0]).toMatchObject({ entreprise: 'Plomberie Sud', numero: 'D-001', signe: true, montant: { ht: 10000, ttc: 11000 }, acompte: { mode: 'pourcentage', pourcentage: 30, montant_ttc: 3300 }, hors_honoraires: false })
    expect(r.devis[1]).toMatchObject({ acompte: { mode: 'fixe', pourcentage: null, montant_ttc: 1000 }, hors_honoraires: true })
    expect(JSON.stringify(r)).not.toMatch(/path|commission/)
  })

  it('finances_du_dossier : chiffres IDENTIQUES à finance.js, sans parts / royalties / apporteur', async () => {
    const r = await O.financesDuDossier(fauxSupabase(tablesAgente()), { reference: '2026-AM-043' })
    const ref = calculateDossierFinance({ ...D1, devis_artisans: DEVIS, suivi_financier: SUIVI })
    expect(r.synthese.travaux_signes_ttc).toBe(ref.honoraires.totalDevisTTCSignes)
    expect(r.synthese.honoraires_signes.courtage).toEqual({ ht: ref.honoraires.courtage.ht, ttc: ref.honoraires.courtage.ttc })
    expect(r.synthese.honoraires_signes.solde_amo).toEqual({ ht: ref.honoraires.soldeAmo.ht, ttc: ref.honoraires.soldeAmo.ttc })
    expect(r.synthese.honoraires_previsionnels.courtage.ttc).toBe(ref.honorairesPrevi.courtage.ttc)
    expect(r.synthese.frais_consultation).toEqual({ ht: ref.frais.fraisHT, ttc: 150, statut: 'regle' })
    expect(r.synthese.honoraires_signes.courtage.ttc).toBe(660)   // 11 000 × 6 %
    expect(r.echeances.map(e => e.type)).toEqual(['honoraires_courtage', 'acompte_artisan'])
    expect(r.echeances[1].artisan).toBe('Plomberie Sud')
    expect(JSON.stringify(r)).not.toMatch(/royalties|"parts"|agente"|admin"|commission|apporteur|statut_ctp/)
  })

  it('rendez_vous : plage en heure de Paris, artisans conviés dédoublonnés, plage max 92 jours', async () => {
    const r = await O.rendezVous(fauxSupabase(tablesAgente()), {}, { maintenant: MAINTENANT })
    expect(r).toMatchObject({ du: '2026-10-26', au: '2026-11-25', nombre: 1 })
    expect(r.rendez_vous[0]).toMatchObject({ debut: '2026-11-03T09:00', adresse: '10 av. du Port, Martigues', dossier: '2026-AM-043', client: 'Julie Martin', artisans_convies: ['Plomberie Sud', 'Élec Provence'] })
    expect(JSON.stringify(r)).not.toMatch(/google/)
    await expect(O.rendezVous(fauxSupabase(tablesAgente()), { du: '2026-01-01', au: '2026-12-31' })).rejects.toThrow(/92 jours/)
    await expect(O.rendezVous(fauxSupabase(tablesAgente()), { du: '2026-12-01', au: '2026-11-01' })).rejects.toThrow(/postérieure/)
    await expect(O.rendezVous(fauxSupabase(tablesAgente()), { reference: '2026-MR-011' })).rejects.toThrow(O.DOSSIER_INTROUVABLE)
  })

  it('comptes_rendus : validés seulement, version remplacée écartée, plus récent d\'abord', async () => {
    const t = tablesAgente()
    // Le faux client ne trie pas : on fournit l'ordre que renverrait la base.
    t.comptes_rendus = [t.comptes_rendus[2], t.comptes_rendus[1], t.comptes_rendus[0], t.comptes_rendus[3]]
    const r = await O.comptesRendus(fauxSupabase(t), { reference: '2026-AM-043', nombre: 5 })
    expect(r.comptes_rendus.map(c => c.contenu)).toEqual(['CR R2', 'CR R1 v2'])
    expect(r.comptes_rendus[0].type_libelle).toBe('R2 – Visite avec artisans')
    expect(JSON.stringify(r)).not.toMatch(/brut|brouillon/)
    expect((await O.comptesRendus(fauxSupabase(t), { reference: '2026-AM-043', nombre: 1 })).comptes_rendus).toHaveLength(1)
  })

  it('interventions : interventions planifiées et lots', async () => {
    const r = await O.interventions(fauxSupabase(tablesAgente()), { reference: '2026-AM-043' })
    expect(r.interventions[0]).toMatchObject({ artisan: 'Maçon & Fils', date_debut: '2026-11-02' })
    expect(r.lots[0]).toMatchObject({ nom: 'Plomberie', avancement_pct: 20 })
  })

  it('actions_ouvertes : ni clôturées, ni actées, ni archivées', async () => {
    const r = await O.actionsOuvertes(fauxSupabase(tablesAgente()), {})
    expect(r.actions.map(a => a.numero)).toEqual(['A1'])
    expect(r.actions[0]).toMatchObject({ dossier: '2026-AM-043', statut_libelle: 'Urgent depuis le', lots: ['Plomberie'], intervenants: ['Plomberie Sud'] })
  })

  it('attestations_artisans : expirée, expire sous 30 j, absente, date manquante ; artisans refusés exclus', async () => {
    const r = await O.attestationsArtisans(fauxSupabase(tablesAgente()), { reference: '2026-AM-043' }, { maintenant: MAINTENANT })
    const par = Object.fromEntries(r.artisans.map(a => [a.entreprise, a]))
    expect(Object.keys(par).sort()).toEqual(['Maçon & Fils', 'Plomberie Sud', 'Élec Provence'].sort())
    expect(par['Plomberie Sud'].decennale.alerte).toBe('expirée')
    expect(par['Plomberie Sud'].decennale.dernier_document).toEqual({ date_expiration: '2026-10-01', depose_le: '2025-10-01' })
    expect(par['Plomberie Sud'].qualification.alerte).toBe('absente')
    expect(par['Élec Provence'].decennale.alerte).toBe('expire sous 30 jours')
    expect(par['Élec Provence'].qualification.alerte).toBe('valide')
    expect(par['Maçon & Fils'].decennale.alerte).toBe('date d\'expiration non renseignée')
    expect(JSON.stringify(r)).not.toMatch(/_url|rib|kbis/)
  })
})

// ── Authentification ──────────────────────────────────────────────────────────
describe('authentification MCP', async () => {
  const { authentifierMcp } = await import('../mcp/auth')
  const req = (jeton) => new Request('https://app.test/api/mcp', { method: 'POST', headers: jeton ? { authorization: `Bearer ${jeton}` } : {} })
  const avec = (tables, opts) => ({ creerClient: () => fauxSupabase(tables, opts) })

  beforeEach(() => { process.env.MCP_OAUTH_CLIENT_ID = CLIENT_OAUTH })
  afterEach(() => { delete process.env.MCP_OAUTH_CLIENT_ID })

  it('sans jeton → 401 invalid_token', async () => {
    expect(await authentifierMcp(req(null), avec(tablesAgente()))).toMatchObject({ ok: false, statut: 401, code: 'invalid_token' })
  })
  it('connecteur non configuré → 503 (fail-closed)', async () => {
    delete process.env.MCP_OAUTH_CLIENT_ID
    expect(await authentifierMcp(req(JETON_OAUTH), avec(tablesAgente()))).toMatchObject({ ok: false, statut: 503 })
  })
  it('jeton de session de l\'app (sans client_id) → 401', async () => {
    const r = await authentifierMcp(req(jwt({ sub: 'u-agente' })), avec(tablesAgente()))
    expect(r).toMatchObject({ ok: false, statut: 401, code: 'invalid_token' })
  })
  it('jeton émis pour un AUTRE client OAuth → 401', async () => {
    const r = await authentifierMcp(req(jwt({ sub: 'u-agente', client_id: 'autre-app' })), avec(tablesAgente()))
    expect(r).toMatchObject({ ok: false, statut: 401, message: 'Jeton non émis pour le connecteur BATILIS.' })
  })
  it('jeton invalide ou expiré → 401', async () => {
    const r = await authentifierMcp(req(JETON_OAUTH), avec(tablesAgente(), { erreurUser: true }))
    expect(r).toMatchObject({ ok: false, statut: 401, message: expect.stringMatching(/invalide ou expiré/) })
  })
  it('rôle client → 403 avec message clair', async () => {
    const t = { profiles: [{ ...PROFIL_AGENTE, role: 'client' }] }
    const r = await authentifierMcp(req(JETON_OAUTH), avec(t))
    expect(r).toMatchObject({ ok: false, statut: 403, code: 'access_denied', message: expect.stringMatching(/réservé aux comptes admin et agente/) })
  })
  it('profil désactivé → 403 avec message clair', async () => {
    const t = { profiles: [{ ...PROFIL_AGENTE, actif: false }] }
    const r = await authentifierMcp(req(JETON_OAUTH), avec(t))
    expect(r).toMatchObject({ ok: false, statut: 403, message: expect.stringMatching(/désactivé/) })
  })
  it('profil absent → 403', async () => {
    expect(await authentifierMcp(req(JETON_OAUTH), avec({ profiles: [] }))).toMatchObject({ ok: false, statut: 403 })
  })
  it('admin et agente actifs → acceptés, client Supabase créé avec LEUR jeton', async () => {
    const vus = []
    for (const role of ['admin', 'agente']) {
      const r = await authentifierMcp(req(JETON_OAUTH), { creerClient: (j) => { vus.push(j); return fauxSupabase({ profiles: [{ ...PROFIL_AGENTE, role }] }) } })
      expect(r.ok).toBe(true)
    }
    expect(vus).toEqual([JETON_OAUTH, JETON_OAUTH])
  })
})

// ── Route /api/mcp de bout en bout (client Supabase réel remplacé) ────────────
const courant = vi.hoisted(() => ({ fabrique: null, appels: [] }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args) => { courant.appels.push(args); return courant.fabrique() },
}))

describe('route /api/mcp', async () => {
  const { POST, GET } = await import('../../api/mcp/route')
  const meta = await import('../../.well-known/oauth-protected-resource/api/mcp/route')
  const metaRacine = await import('../../.well-known/oauth-protected-resource/route')
  const H = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }
  const appel = (corps, jeton = JETON_OAUTH) => POST(new Request('https://batilis.test/api/mcp', {
    method: 'POST', headers: jeton ? { ...H, authorization: `Bearer ${jeton}` } : H, body: JSON.stringify(corps),
  }))

  beforeEach(() => {
    process.env.MCP_OAUTH_CLIENT_ID = CLIENT_OAUTH
    courant.fabrique = () => fauxSupabase(tablesAgente())
    courant.appels.length = 0
  })
  afterEach(() => { delete process.env.MCP_OAUTH_CLIENT_ID })

  it('sans jeton : 401 + WWW-Authenticate vers les métadonnées de ressource protégée', async () => {
    const res = await appel({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, null)
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toBe(
      'Bearer error="invalid_token", resource_metadata="https://batilis.test/.well-known/oauth-protected-resource/api/mcp", scope="email"')
  })

  it('compte client : 403 explicite, sans relancer la connexion', async () => {
    courant.fabrique = () => fauxSupabase({ profiles: [{ ...PROFIL_AGENTE, role: 'client' }] })
    const res = await appel({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    expect(res.status).toBe(403)
    expect(res.headers.get('www-authenticate')).toBeNull()
    expect((await res.json()).error_description).toMatch(/réservé aux comptes admin et agente/)
  })

  it('client Supabase créé avec la clé PUBLIQUE et le jeton de l\'utilisatrice', async () => {
    await appel({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    expect(courant.appels.length).toBeGreaterThan(0)
    for (const [url, cle, options] of courant.appels) {
      expect(url).toBe(process.env.NEXT_PUBLIC_SUPABASE_URL)
      expect(cle).toBe(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
      expect(cle).not.toBe(process.env.SUPABASE_SERVICE_ROLE_KEY)
      expect(options.global.headers.Authorization).toBe(`Bearer ${JETON_OAUTH}`)
    }
  })

  it('tools/list : les 9 outils, tous annotés lecture seule', async () => {
    const res = await appel({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
    const { result } = await res.json()
    expect(result.tools.map(t => t.name).sort()).toEqual(['actions_ouvertes', 'attestations_artisans', 'comptes_rendus', 'devis_du_dossier',
      'finances_du_dossier', 'interventions', 'lire_dossier', 'mes_dossiers', 'rendez_vous'])
    expect(result.tools.every(t => t.annotations.readOnlyHint === true && t.annotations.destructiveHint === false)).toBe(true)
  })

  it('tools/call mes_dossiers : JSON des seuls dossiers visibles', async () => {
    const res = await appel({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'mes_dossiers', arguments: {} } })
    const { result } = await res.json()
    expect(result.isError).toBeUndefined()
    expect(JSON.parse(result.content[0].text).dossiers.map(d => d.reference)).toEqual(['2026-AM-043'])
  })

  it('tools/call lire_dossier sur un dossier hors périmètre : « Dossier introuvable. »', async () => {
    const res = await appel({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'lire_dossier', arguments: { reference: '2026-MR-011' } } })
    const { result } = await res.json()
    expect(result).toMatchObject({ isError: true, content: [{ type: 'text', text: 'Dossier introuvable.' }] })
  })

  it('paramètre invalide refusé par le schéma zod', async () => {
    const res = await appel({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'comptes_rendus', arguments: { reference: '2026-AM-043', nombre: 50 } } })
    expect((await res.json()).result.isError).toBe(true)
  })

  it('GET : 405 (serveur sans état)', async () => {
    expect((await GET()).status).toBe(405)
  })

  it('métadonnées RFC 9728 aux deux emplacements', async () => {
    for (const m of [meta, metaRacine]) {
      const res = m.GET(new Request('https://batilis.test/.well-known/oauth-protected-resource/api/mcp'))
      expect(await res.json()).toEqual({
        resource: 'https://batilis.test/api/mcp',
        authorization_servers: [`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`],
        bearer_methods_supported: ['header'],
        scopes_supported: ['email'],
        resource_name: 'BATILIS',
      })
      expect(m.OPTIONS().status).toBe(204)
    }
  })
})

// ── Arbre de modules du serveur MCP : jamais la service_role ─────────────────
const POINTS_ENTREE = [
  'app/api/mcp/route.js',
  'app/.well-known/oauth-protected-resource/route.js',
  'app/.well-known/oauth-protected-resource/api/mcp/route.js',
  'app/oauth/consent/page.js',
]
const PAQUETS_AUTORISES = new Set(['@supabase/supabase-js', '@modelcontextprotocol/sdk', 'zod', 'luxon', 'react'])

// Retire les commentaires (lignes « // … », blocs « /* … */ », fins de ligne « // … ») : les
// commentaires qui EXPLIQUENT pourquoi la service_role est exclue ne sont pas du code.
function sansCommentaires(code) {
  // Lignes « // » d'abord : un « /api/* » dans un commentaire ouvrirait sinon un faux bloc.
  return code.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map(l => l.replace(/\s\/\/\s.*$/, '')).join('\n')
}

function arbreModules(entrees) {
  const vus = new Set(), paquets = new Set()
  const pile = [...entrees]
  while (pile.length) {
    const f = normalize(pile.pop())
    if (vus.has(f)) continue
    vus.add(f)
    const source = readFileSync(f, 'utf8')
    const specs = [
      ...source.matchAll(/(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]/g),   // import x from '…'
      ...source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm),                      // import '…'
      ...source.matchAll(/(?:import|require)\(\s*['"]([^'"]+)['"]\s*\)/g),       // import('…') / require('…')
    ].map(m => m[1])
    for (const spec of specs) {
      if (spec.startsWith('.')) {
        const base = join(dirname(f), spec)
        const cible = [base, `${base}.js`, `${base}.jsx`, join(base, 'index.js')].find(p => existsSync(p) && !p.endsWith('/'))
        if (!cible) throw new Error(`Import introuvable : ${spec} depuis ${f}`)
        pile.push(cible)
      } else {
        paquets.add(spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0])
      }
    }
  }
  return { fichiers: [...vus].sort(), paquets: [...paquets].sort() }
}

describe('arbre de modules du connecteur MCP', () => {
  const { fichiers, paquets } = arbreModules(POINTS_ENTREE)

  it('aucun module importé n\'utilise la service_role (code hors commentaires)', () => {
    const fautifs = fichiers.filter(f => /service_role|SERVICE_ROLE|SUPABASE_SERVICE/.test(sansCommentaires(readFileSync(f, 'utf8'))))
    expect(fautifs).toEqual([])
  })
  it('n\'importe pas api-auth.js (qui détient la service_role)', () => {
    expect(fichiers.some(f => f.endsWith('api-auth.js'))).toBe(false)
  })
  it('createClient n\'est appelé que dans mcp/auth.js (clé publique) et lib/supabase.js (navigateur)', () => {
    const avecCreate = fichiers.filter(f => /createClient\(/.test(readFileSync(f, 'utf8')))
    expect(avecCreate.map(f => f.replace(/\\/g, '/')).sort()).toEqual(['app/lib/mcp/auth.js', 'app/lib/supabase.js'])
  })
  it('paquets externes limités à la liste autorisée', () => {
    expect(paquets.filter(p => !PAQUETS_AUTORISES.has(p) && !p.startsWith('next'))).toEqual([])
  })
  it('aucune écriture ni accès Storage dans le code des outils', () => {
    for (const f of fichiers.filter(f => f.includes('mcp'))) {
      expect(readFileSync(f, 'utf8')).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(|\.storage\b/)
    }
  })
})

// ── D4 : retour après connexion, uniquement vers /oauth/consent ───────────────
describe('retourConsentementSur (paramètre next de /login)', () => {
  it('accepte le retour vers la page de consentement', () => {
    expect(retourConsentementSur(`${CHEMIN_CONSENTEMENT}?authorization_id=abc-123_X`)).toBe('/oauth/consent?authorization_id=abc-123_X')
  })
  it('ne garde que authorization_id', () => {
    expect(retourConsentementSur('/oauth/consent?authorization_id=abc&redirect=https://evil.com')).toBe('/oauth/consent?authorization_id=abc')
  })
  it.each([
    ['domaine externe', 'https://evil.com/oauth/consent?authorization_id=abc'],
    ['//domaine', '//evil.com/oauth/consent?authorization_id=abc'],
    ['/\\domaine', '/\\evil.com/oauth/consent?authorization_id=abc'],
    ['URL encodée', '%2F%2Fevil.com%2Foauth%2Fconsent%3Fauthorization_id%3Dabc'],
    ['« ? » encodé', '/oauth/consent%3Fauthorization_id=abc'],
    ['javascript:', 'javascript:alert(1)//oauth/consent?authorization_id=abc'],
    ['data:', 'data:text/html,<script>alert(1)</script>'],
    ['autre chemin', '/dashboard'],
    ['chemin voisin', '/oauth/consentX?authorization_id=abc'],
    ['remontée de chemin', '/oauth/consent/../../evil?authorization_id=abc'],
    ['espace en tête', ' /oauth/consent?authorization_id=abc'],
    ['sans authorization_id', '/oauth/consent?x=1'],
    ['authorization_id piégé', '/oauth/consent?authorization_id=abc%22%3E%3Cscript%3E'],
    ['vide', ''],
    ['null', null],
  ])('refuse : %s', (_, valeur) => {
    expect(retourConsentementSur(valeur)).toBeNull()
  })
})
