// app/lib/pdf/genererVisite.js
// Génère le PDF d'une VISITE (nouveau système actions). Extrait de /api/cr/visite-pdf pour
// être réutilisé par l'export ET la diffusion (/api/cr/visite-diffuser). Reçoit un client
// Supabase admin déjà construit. Renvoie { buffer, dossier, visite }.

import path from 'path'
import fs from 'fs'
import { renderToBuffer } from '@react-pdf/renderer'
import './fonts.js'
import { buildVisiteDocument } from './visiteDocument.js'

function getLogoBase64() {
  try {
    const p = path.join(process.cwd(), 'public', 'logo.png')
    if (!fs.existsSync(p)) return null
    return `data:image/png;base64,${fs.readFileSync(p).toString('base64')}`
  } catch { return null }
}

// Redimensionne chaque photo avant de l'incruster dans le PDF : les JPEG bruts d'iPhone
// (plusieurs Mo) faisaient planter @react-pdf → pages blanches. On les ramène à 1400 px max,
// qualité 72, orientation EXIF corrigée. Import dynamique de sharp. Repli sur l'original si
// sharp indisponible, null si l'image est illisible (elle est alors simplement omise).
let _sharp
async function photoDataURL(buf) {
  try {
    if (!_sharp) _sharp = (await import('sharp')).default
    const out = await _sharp(buf).rotate().resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer()
    return `data:image/jpeg;base64,${out.toString('base64')}`
  } catch {
    try { return `data:image/jpeg;base64,${buf.toString('base64')}` } catch { return null }
  }
}

// db : client Supabase (service_role). opts : { options, filtreLotId }.
export async function genererVisitePDF(db, visiteId, { options = {}, filtreLotId = null, filtreLotIds = null } = {}) {
  const { data: visite } = await db.from('comptes_rendus')
    .select('id, dossier_id, numero_visite, date_visite, type_visite').eq('id', visiteId).maybeSingle()
  if (!visite) throw new Error('Visite introuvable')
  // Filtre lot : liste (multi) prioritaire, sinon l'ancien filtre unique.
  const lotFiltre = Array.isArray(filtreLotIds) && filtreLotIds.length ? new Set(filtreLotIds.map(String))
    : (filtreLotId ? new Set([String(filtreLotId)]) : null)

  const { data: dossier } = await db.from('dossiers')
    .select('*, referente:profiles!dossiers_referente_id_fkey(prenom, nom), client:clients(*), agence:agences!dossiers_agence_id_fkey(nom)')
    .eq('id', visite.dossier_id).maybeSingle()
  if (!dossier) throw new Error('Dossier introuvable')

  // Actions affichées dans la visite (créées ici OU reportées, moins retirées).
  const { data: links } = await db.from('cr_actions').select('action_id, inclus').eq('cr_id', visiteId)
  const inclus = new Set((links || []).filter(l => l.inclus).map(l => l.action_id))
  const exclus = new Set((links || []).filter(l => !l.inclus).map(l => l.action_id))
  const { data: allActions } = await db.from('actions')
    .select('id, numero, portee, titre, texte, statut, statut_date, cr_origine_id, ordre, journal')
    .eq('dossier_id', visite.dossier_id).order('ordre').order('created_at')
  const actions = (allActions || []).filter(a => (a.cr_origine_id === visiteId || inclus.has(a.id)) && !exclus.has(a.id))
  const actionIds = actions.map(a => a.id)

  let cibles = [], photos = [], checklist = []
  if (actionIds.length) {
    ;[cibles, photos, checklist] = await Promise.all([
      db.from('action_cibles').select('action_id, lot_id').in('action_id', actionIds).then(r => r.data || []),
      db.from('action_photos').select('action_id, path, ordre').in('action_id', actionIds).order('ordre').then(r => r.data || []),
      db.from('action_checklist').select('action_id, label, checked, ordre').in('action_id', actionIds).order('ordre').then(r => r.data || []),
    ])
  }

  const lotIds = [...new Set(cibles.map(c => c.lot_id).filter(Boolean))]
  let lotInfoById = {}
  if (lotIds.length) {
    // service_role → l'embed artisan fonctionne (RLS contournée, FK lots→artisans présente).
    const { data: lots } = await db.from('lots').select('id, nom, artisan:artisans(entreprise, metier)').in('id', lotIds)
    lotInfoById = Object.fromEntries((lots || []).map(l => [l.id, { nom: l.nom, entreprise: l.artisan?.entreprise || l.artisan?.metier || '' }]))
  }

  const photosB64ByAction = {}
  for (const ph of photos) {
    try {
      const { data: blob } = await db.storage.from('photos').download(ph.path)
      if (blob) {
        const buf = Buffer.from(await blob.arrayBuffer())
        const dataUrl = await photoDataURL(buf)
        if (dataUrl) (photosB64ByAction[ph.action_id] ||= []).push(dataUrl)
      }
    } catch { /* photo ignorée */ }
  }
  const checklistByAction = {}
  for (const it of checklist) (checklistByAction[it.action_id] ||= []).push({ label: it.label, checked: it.checked })

  const enrich = (a) => ({ ...a, photosB64: photosB64ByAction[a.id] || [], checklist: checklistByAction[a.id] || [] })
  const generales = actions.filter(a => a.portee === 'generale').map(enrich)
  const lotActions = actions.filter(a => a.portee === 'lot').map(enrich)
  const lotIdForAction = (aid) => (cibles.find(x => x.action_id === aid && x.lot_id)?.lot_id) || null
  const parLotMap = new Map()
  for (const a of lotActions) {
    const lid = lotIdForAction(a.id)
    if (lotFiltre && !lotFiltre.has(String(lid))) continue
    const key = lid || '_sans'
    if (!parLotMap.has(key)) parLotMap.set(key, { lotNom: lid ? (lotInfoById[lid]?.nom || 'Sans lot') : 'Sans lot', lotEntreprise: lid ? (lotInfoById[lid]?.entreprise || '') : '', actions: [] })
    parLotMap.get(key).actions.push(a)
  }
  const parLot = [...parLotMap.values()]

  // Intervenants présents (pour l'en-tête « identification ») : uniquement ceux
  // marqués « présent » dans cr_presences (absents / excusés non listés ici).
  const { data: pres } = await db.from('cr_presences').select('presence, artisan:artisans(entreprise, metier)').eq('cr_id', visiteId)
  const presences = (pres || []).filter(p => p.presence === 'present').map(p => p.artisan?.entreprise || p.artisan?.metier).filter(Boolean)

  const doc = buildVisiteDocument({ dossier, visite, generales, parLot, presences, logo: getLogoBase64(), opts: options })
  const buffer = await renderToBuffer(doc)
  return { buffer, dossier, visite }
}
