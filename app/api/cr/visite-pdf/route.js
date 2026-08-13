// app/api/cr/visite-pdf/route.js
// POST { visite_id } — génère et renvoie (inline) le PDF d'une VISITE (nouveau système
// actions/levée de réserve, Lot 3-1). Charge la visite + le dossier riche + les actions
// affichées dans cette visite (créées ici OU reportées via cr_actions, moins retirées),
// leurs photos (téléchargées en base64) et leur checklist, puis rend buildVisiteDocument.

import path from 'path'
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import '../../../lib/pdf/fonts.js'
import { requireRole } from '../../../lib/api-auth'
import { buildVisiteDocument } from '../../../lib/pdf/visiteDocument.js'
import { formatNomClient } from '../../../lib/clients.js'

export const maxDuration = 60

let _admin
function admin() {
  if (!_admin) _admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _admin
}

function getLogoBase64() {
  try {
    const p = path.join(process.cwd(), 'public', 'logo.png')
    if (!fs.existsSync(p)) return null
    return `data:image/png;base64,${fs.readFileSync(p).toString('base64')}`
  } catch { return null }
}

export async function POST(request) {
  const auth = await requireRole(request, ['admin', 'agente'])
  if (auth.error) return auth.error

  let body; try { body = await request.json() } catch { body = {} }
  const visiteId = body.visite_id
  if (!visiteId) return NextResponse.json({ error: 'visite_id manquant' }, { status: 400 })
  const opts = body.options && typeof body.options === 'object' ? body.options : {}
  const filtreLotId = body.filtre_lot_id || null   // null = tous les lots ; sinon un seul lot destinataire

  const db = admin()

  const { data: visite } = await db.from('comptes_rendus')
    .select('id, dossier_id, numero_visite, date_visite').eq('id', visiteId).maybeSingle()
  if (!visite) return NextResponse.json({ error: 'Visite introuvable' }, { status: 404 })

  const { data: dossier } = await db.from('dossiers')
    .select('*, referente:profiles!dossiers_referente_id_fkey(prenom, nom), client:clients(*), agence:agences!dossiers_agence_id_fkey(nom)')
    .eq('id', visite.dossier_id).maybeSingle()
  if (!dossier) return NextResponse.json({ error: 'Dossier introuvable' }, { status: 404 })

  // ── Actions affichées dans cette visite (même logique que le composant) ──
  const { data: links } = await db.from('cr_actions').select('action_id, inclus').eq('cr_id', visiteId)
  const inclus = new Set((links || []).filter(l => l.inclus).map(l => l.action_id))
  const exclus = new Set((links || []).filter(l => !l.inclus).map(l => l.action_id))
  const { data: allActions } = await db.from('actions')
    .select('id, numero, portee, titre, texte, statut, statut_date, cr_origine_id, ordre')
    .eq('dossier_id', visite.dossier_id).order('ordre').order('created_at')
  const actions = (allActions || []).filter(a => (a.cr_origine_id === visiteId || inclus.has(a.id)) && !exclus.has(a.id))
  const actionIds = actions.map(a => a.id)

  // ── Enfants (cibles / photos / checklist) en masse ──
  let cibles = [], photos = [], checklist = []
  if (actionIds.length) {
    ;[cibles, photos, checklist] = await Promise.all([
      db.from('action_cibles').select('action_id, lot_id').in('action_id', actionIds).then(r => r.data || []),
      db.from('action_photos').select('action_id, path, ordre').in('action_id', actionIds).order('ordre').then(r => r.data || []),
      db.from('action_checklist').select('action_id, label, checked, ordre').in('action_id', actionIds).order('ordre').then(r => r.data || []),
    ])
  }

  // Noms de lots
  const lotIds = [...new Set(cibles.map(c => c.lot_id).filter(Boolean))]
  let lotNomById = {}
  if (lotIds.length) {
    const { data: lots } = await db.from('lots').select('id, nom').in('id', lotIds)
    lotNomById = Object.fromEntries((lots || []).map(l => [l.id, l.nom]))
  }

  // Photos → base64 (téléchargement Storage). On limite à 6 photos par action (garde-fou).
  const photosB64ByAction = {}
  for (const ph of photos) {
    if ((photosB64ByAction[ph.action_id]?.length || 0) >= 6) continue
    try {
      const { data: blob } = await db.storage.from('photos').download(ph.path)
      if (blob) {
        const buf = Buffer.from(await blob.arrayBuffer())
        const ext = (ph.path.split('.').pop() || 'jpg').toLowerCase()
        const mime = ext === 'png' ? 'image/png' : 'image/jpeg'
        ;(photosB64ByAction[ph.action_id] ||= []).push(`data:${mime};base64,${buf.toString('base64')}`)
      }
    } catch { /* photo ignorée */ }
  }
  const checklistByAction = {}
  for (const it of checklist) (checklistByAction[it.action_id] ||= []).push({ label: it.label, checked: it.checked })

  // Enrichit + groupe
  const enrich = (a) => ({ ...a, photosB64: photosB64ByAction[a.id] || [], checklist: checklistByAction[a.id] || [] })
  const generales = actions.filter(a => a.portee === 'generale').map(enrich)
  const lotActions = actions.filter(a => a.portee === 'lot').map(enrich)
  const lotIdForAction = (aid) => (cibles.find(x => x.action_id === aid && x.lot_id)?.lot_id) || null
  const parLotMap = new Map() // lotId → { lotNom, actions }
  for (const a of lotActions) {
    const lid = lotIdForAction(a.id)
    if (filtreLotId && lid !== filtreLotId) continue // filtre destinataire : un seul lot
    const key = lid || '_sans'
    if (!parLotMap.has(key)) parLotMap.set(key, { lotNom: lid ? (lotNomById[lid] || 'Sans lot') : 'Sans lot', actions: [] })
    parLotMap.get(key).actions.push(a)
  }
  const parLot = [...parLotMap.values()]

  try {
    const doc = buildVisiteDocument({ dossier, visite, generales, parLot, logo: getLogoBase64(), opts })
    const pdf = await renderToBuffer(doc)
    const slug = (formatNomClient(dossier.client, { civilite: false }) || 'client').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_')
    const nom = `Visite_${visite.numero_visite || ''}_${slug}.pdf`.replace('__', '_')
    return new NextResponse(pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${nom.replace(/[^\x20-\x7e]/g, '')}"; filename*=UTF-8''${encodeURIComponent(nom)}`,
      },
    })
  } catch (e) {
    console.error('[cr/visite-pdf]', e)
    return NextResponse.json({ error: 'Génération PDF échouée' }, { status: 500 })
  }
}
