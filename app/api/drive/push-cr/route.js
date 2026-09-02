// app/api/drive/push-cr/route.js
// POST { cr_id } — génère le PDF d'un compte-rendu et le range dans le OneDrive de la
// référente sous <racine>/AAAA.MM.JJ NOM/Comptes rendus/, nommé « CR AAAA.MM.JJ NOM.pdf ».
// Déclenché à la VALIDATION du CR (publier au client). Nom déterministe → une
// re-validation REMPLACE le fichier (on supprime l'ancien item avant de ré-uploader).
//
// Le CR n'est pas un fichier stocké (markdown en base) : on le génère ici, comme /api/pdf.

import path from 'path'
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import '../../../lib/pdf/fonts.js'
import { requireRole, assertDossierAccessible } from '../../../lib/api-auth'
import { buildCRDocument } from '../../../lib/pdf/crDocument.js'
import { stripEmojiPdf } from '../../../lib/pdf/stripEmoji.js'
import { driveModule, loadDriveCompte } from '../../../lib/drive/dispatch'
import { cheminChantier, nettoyerSegment, dateDossier, slugNom } from '../../../lib/drive/taxonomie'
import { formatNomClient } from '../../../lib/clients'

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

  let body
  try { body = await request.json() } catch { body = {} }
  const crId = body.cr_id
  if (!crId) return NextResponse.json({ error: 'cr_id manquant' }, { status: 400 })

  const db = admin()

  const { data: cr } = await db.from('comptes_rendus')
    .select('id, dossier_id, contenu_final, photos_jointes, type_visite, created_at, date_visite')
    .eq('id', crId).maybeSingle()
  if (!cr) return NextResponse.json({ error: 'CR introuvable' }, { status: 404 })

  const acces = await assertDossierAccessible(cr.dossier_id, auth.profile)
  if (acces.error) return acces.error

  // Dossier RICHE (client, référente, agence) pour le rendu PDF.
  const { data: dossier } = await db.from('dossiers')
    .select('*, referente:profiles!dossiers_referente_id_fkey(id, prenom, nom), client:clients(*), agence:agences!dossiers_agence_id_fkey(nom)')
    .eq('id', cr.dossier_id).maybeSingle()
  if (!dossier) return NextResponse.json({ error: 'Dossier introuvable' }, { status: 404 })
  if (!dossier.referente_id) return NextResponse.json({ skipped: true, reason: 'no_referente' })

  const compte = await loadDriveCompte(db, dossier.referente_id)
  if (!compte || !compte.drive_root_drive_id || !compte.drive_root_id) {
    return NextResponse.json({ skipped: true, reason: 'no_root' })
  }
  const mod = driveModule(compte.fournisseur)
  if (!mod) return NextResponse.json({ skipped: true, reason: 'fournisseur' })

  let token
  try {
    token = await mod.getValidAccessToken(compte)
  } catch (e) {
    if (e.reconnect) return NextResponse.json({ skipped: true, reason: 'reconnect' })
    console.error('[drive/push-cr] token', e)
    return NextResponse.json({ error: 'Erreur Drive' }, { status: 500 })
  }

  try {
    // ── Génération du PDF (même logique que /api/pdf type='cr') ──
    const sections = stripEmojiPdf(cr.contenu_final || '').split(/(?=## \d+\.)/).map(block => {
      const m = block.match(/^## (\d+)\. (.+?)\n([\s\S]*)/)
      if (m) return { numero: m[1], titre: m[2].trim(), contenu: m[3].trim() }
      const t = block.trim()
      return t ? { numero: '', titre: '', contenu: t } : null
    }).filter(Boolean).filter(s => s.contenu)

    // Map chemin → id de photo : le repère [[photo:ID]] du texte référence l'id stable.
    const { data: photosDossier } = await db.from('photos').select('id, url').eq('dossier_id', cr.dossier_id)
    const idParChemin = new Map((photosDossier || []).map(p => [p.url, p.id]))

    const photosJointes = await Promise.all((cr.photos_jointes || []).map(async (ph) => {
      const id = idParChemin.get(ph) ?? null
      try {
        const { data: fileData } = await db.storage.from('photos').download(ph)
        if (fileData) {
          const buf = Buffer.from(await fileData.arrayBuffer())
          const ext = (ph || '').split('.').pop().toLowerCase()
          const mime = ext === 'png' ? 'image/png' : 'image/jpeg'
          return { id, path: ph, base64: `data:${mime};base64,${buf.toString('base64')}` }
        }
      } catch { /* ignore */ }
      return { id, path: ph }
    }))

    const pdfBuffer = await renderToBuffer(buildCRDocument({ dossier, cr, sections, logo: getLogoBase64(), photos: photosJointes }))

    // ── Nom + chemin ── « AAAA-MM-JJ_CR_<client>.pdf »
    const clientNom = dossier.client?.nom || 'CLIENT'
    const clientSlug = slugNom(formatNomClient(dossier.client, { civilite: false }))
    const crDate = dateDossier(cr.date_visite || cr.created_at)
    const fileName = `${nettoyerSegment(`${crDate}_CR_${clientSlug}`)}.pdf`
    const dateFin = dossier.date_fin_chantier || dossier.date_cloture || null
    const segments = cheminChantier(dossier.statut, dossier.created_at, clientNom, 'compte_rendu', null, { dateFin })

    // Déjà miroité → on supprime l'ancien item (le nom a pu changer) avant de remplacer.
    const { data: dejaIdx } = await db.from('doc_index').select('id, item_id, drive_id').eq('cr_id', crId).maybeSingle()
    if (dejaIdx) { try { await mod.deleteItem(token, dejaIdx.drive_id, dejaIdx.item_id) } catch { /* best effort */ } }

    const leafId = await mod.ensureFolderPath(token, compte.drive_root_drive_id, compte.drive_root_id, segments)
    const up = await mod.uploadSmallFile(token, compte.drive_root_drive_id, leafId, fileName, pdfBuffer, 'application/pdf', 'replace')

    const cheminLogique = [...segments, up.name].join('/')
    await db.from('doc_index').upsert({
      cr_id: crId,
      dossier_id: dossier.id,
      user_id: dossier.referente_id,
      origine: 'app',
      drive_id: compte.drive_root_drive_id,
      item_id: up.id,
      path: cheminLogique,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'cr_id' })

    return NextResponse.json({ ok: true, path: cheminLogique })
  } catch (e) {
    console.error('[drive/push-cr] generation/push', e)
    return NextResponse.json({ error: 'Push CR échoué' }, { status: 502 })
  }
}
