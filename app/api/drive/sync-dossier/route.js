// app/api/drive/sync-dossier/route.js
// POST { dossier_id, offset?, batch? } — RE-SYNCHRONISE le Drive d'un dossier PAR LOTS.
// Rejoue chaque push (CR validés, devis, PV, factures, honoraires, contrat, photos, documents,
// fiches liées) en réutilisant les routes push-* EXISTANTES (idempotentes) via un appel interne
// portant le jeton de l'appelant → zéro duplication.
//
// Pourquoi par lots : un dossier avec beaucoup de photos lourdes = beaucoup d'uploads. Tout faire
// dans UNE requête dépasse le timeout serverless (Vercel ~60 s). Le client rappelle donc cette
// route avec l'offset renvoyé jusqu'à done=true (barre de progression). Chaque lot est court.
// Séquentiel dans le lot = pas de rafale (throttling évité). La liste des tâches est ORDONNÉE
// (par id) donc stable entre les appels → l'offset découpe proprement.
//
// Réponse : { total, from, to, done, nextOffset, ok, skipped, failed:[{type,label,error,cause,
// endpoint,body}], drive }. `drive` = condition globale référente (reconnect/no_root/…).

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole, assertDossierAccessible } from '../../../lib/api-auth'
import { POST as pushGeneric } from '../push/route'
import { POST as pushCr } from '../push-cr/route'
import { POST as pushDevis } from '../push-devis/route'
import { POST as pushFacture } from '../push-facture/route'
import { POST as pushPv } from '../push-pv/route'
import { POST as pushHonoraire } from '../push-honoraire-facture/route'
import { POST as pushContrat } from '../push-contrat/route'
import { POST as pushFiche } from '../push-fiche/route'

const BATCH_MAX = 15
const BATCH_DEFAULT = 8

let _admin
function admin() {
  if (!_admin) _admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _admin
}

const HANDLERS = {
  '/api/drive/push': pushGeneric,
  '/api/drive/push-cr': pushCr,
  '/api/drive/push-devis': pushDevis,
  '/api/drive/push-facture': pushFacture,
  '/api/drive/push-pv': pushPv,
  '/api/drive/push-honoraire-facture': pushHonoraire,
  '/api/drive/push-contrat': pushContrat,
  '/api/drive/push-fiche': pushFiche,
}

// Traduit un échec en CAUSE actionnable (le client affiche le message + « Réessayer »).
function classifyCause(status, err) {
  const e = String(err || '').toLowerCase()
  if (status === 404 || e.includes('introuvable')) return 'file_missing'   // fichier source jamais uploadé / supprimé
  if (status === 401 || e.includes('reconnect')) return 'reconnect'        // jeton mort → reconnecter le compte
  return 'drive_error'                                                     // OneDrive a refusé (throttling épuisé, nom, taille…)
}

// Rejoue un push : forge une requête interne portant le MÊME jeton, appelle le handler, classe.
async function replay(endpoint, bearer, body) {
  const req = new Request('http://internal' + endpoint, {
    method: 'POST',
    headers: { authorization: bearer, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const res = await HANDLERS[endpoint](req)
  let j = {}
  try { j = await res.json() } catch { /* réponse sans corps */ }
  if (res.status >= 400 || j.error) return { state: 'failed', error: j.error || `HTTP ${res.status}`, cause: classifyCause(res.status, j.error) }
  if (j.skipped && ['no_root', 'no_referente', 'reconnect', 'fournisseur'].includes(j.reason)) return { state: 'skipped', drive: j.reason }
  if (j.skipped || j.nothing || j.removed) return { state: 'skipped' }
  return { state: 'ok' }
}

export async function POST(request) {
  const auth = await requireRole(request, ['admin', 'agente'])
  if (auth.error) return auth.error

  const bearer = request.headers.get('authorization') || ''
  let body; try { body = await request.json() } catch { body = {} }
  const dossierId = body.dossier_id
  if (!dossierId) return NextResponse.json({ error: 'dossier_id manquant' }, { status: 400 })

  const acces = await assertDossierAccessible(dossierId, auth.profile)
  if (acces.error) return acces.error
  const offset = Math.max(0, Number(body.offset) || 0)
  const batch = Math.min(BATCH_MAX, Math.max(1, Number(body.batch) || BATCH_DEFAULT))

  const db = admin()
  const { data: dossier } = await db.from('dossiers').select('id, contrat_url').eq('id', dossierId).maybeSingle()
  if (!dossier) return NextResponse.json({ error: 'Dossier introuvable' }, { status: 404 })

  // ── Énumère (ORDONNÉ par id → stable entre appels) tout ce qui est poussable ──
  const tasks = []

  const { data: crs } = await db.from('comptes_rendus')
    .select('id, date_visite, created_at').eq('dossier_id', dossierId).eq('valide', true).order('id')
  for (const cr of (crs || [])) tasks.push({ type: 'CR', label: `CR ${(cr.date_visite || cr.created_at || '').slice(0, 10)}`, endpoint: '/api/drive/push-cr', body: { cr_id: cr.id } })

  const { data: devisList } = await db.from('devis_artisans')
    .select('id, artisan:artisans(entreprise)').eq('dossier_id', dossierId).order('id')
  for (const d of (devisList || [])) {
    const a = d.artisan?.entreprise || 'artisan'
    tasks.push({ type: 'Devis', label: `Devis ${a}`, endpoint: '/api/drive/push-devis', body: { devis_id: d.id } })
    tasks.push({ type: 'PV', label: `PV ${a}`, endpoint: '/api/drive/push-pv', body: { devis_id: d.id } })
  }

  const { data: factures } = await db.from('factures_artisans')
    .select('id, libelle, artisan:artisans(entreprise)').eq('dossier_id', dossierId).order('id')
  for (const f of (factures || [])) tasks.push({ type: 'Facture', label: `Facture ${f.libelle || f.artisan?.entreprise || ''}`.trim(), endpoint: '/api/drive/push-facture', body: { facture_id: f.id } })

  const { data: honos } = await db.from('honoraires_factures').select('id, cle').eq('dossier_id', dossierId).order('id')
  for (const h of (honos || [])) tasks.push({ type: 'Honoraire', label: `Facture honoraire ${h.cle || ''}`.trim(), endpoint: '/api/drive/push-honoraire-facture', body: { honoraire_facture_id: h.id } })

  if (dossier.contrat_url) tasks.push({ type: 'Contrat', label: 'Contrat', endpoint: '/api/drive/push-contrat', body: { dossier_id: dossierId } })

  const { data: photos } = await db.from('photos').select('id, categorie').eq('dossier_id', dossierId).eq('type_media', 'photo').order('id')
  for (const p of (photos || [])) tasks.push({ type: 'Photo', label: `Photo ${p.categorie || ''}`.trim(), endpoint: '/api/drive/push', body: { photo_id: p.id } })

  const { data: docs } = await db.from('chantier_documents').select('id, nom').eq('dossier_id', dossierId).order('id')
  for (const d of (docs || [])) tasks.push({ type: 'Document', label: `Document ${d.nom || ''}`.trim(), endpoint: '/api/drive/push', body: { document_id: d.id } })

  const { data: fiches } = await db.from('chantier_fiches_techniques')
    .select('fiche_technique_id, fiche:fiches_techniques(nom)').eq('dossier_id', dossierId).order('fiche_technique_id')
  for (const cf of (fiches || [])) tasks.push({ type: 'Fiche', label: `Fiche ${cf.fiche?.nom || ''}`.trim(), endpoint: '/api/drive/push-fiche', body: { fiche_id: cf.fiche_technique_id, dossier_id: dossierId } })

  // ── Traite UNIQUEMENT le lot [offset, offset+batch) ──
  const slice = tasks.slice(offset, offset + batch)
  let ok = 0, skipped = 0
  const failed = []
  let driveIssue = null
  for (const t of slice) {
    let r
    try { r = await replay(t.endpoint, bearer, t.body) }
    catch (e) { r = { state: 'failed', error: e?.message || 'exception', cause: 'drive_error' } }
    if (r.drive && !driveIssue) driveIssue = r.drive
    if (r.state === 'ok') ok++
    else if (r.state === 'skipped') skipped++
    else failed.push({ type: t.type, label: t.label, error: r.error, cause: r.cause, endpoint: t.endpoint, body: t.body })
  }

  const to = Math.min(offset + batch, tasks.length)
  return NextResponse.json({
    total: tasks.length,
    from: offset,
    to,
    done: to >= tasks.length,
    nextOffset: to,
    ok, skipped, failed,
    drive: driveIssue,
  })
}
