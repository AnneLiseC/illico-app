// app/api/drive/import/route.js
// POST { inbox_id, dossier_id, categorie } — rattache un fichier DÉPOSÉ dans OneDrive
// (drive_inbox) à un chantier : on télécharge une COPIE dans Supabase (magasin app), on
// crée la ligne chantier_documents, et on indexe avec origine='onedrive' — marqueur
// générique « né dans le drive externe » (OneDrive OU Google Drive ; contrainte CHECK
// limitée à 'app'/'onedrive', pas de migration). Le drive reste le MAÎTRE du fichier.
// Rattachement MANUEL — l'utilisateur choisit le dossier + catégorie.
//
// L'entrée d'index (item_id) neutralise aussi l'écho : le poller ne re-listera plus ce
// fichier (il est désormais connu de doc_index).

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole } from '../../../lib/api-auth'
import { driveModule, loadDriveCompte } from '../../../lib/drive/dispatch'

const CATS = new Set(['compte_rendu', 'plans', 'administratif']) // catégories libres autorisées ; sinon Autres (null)

let _admin
function admin() {
  if (!_admin) _admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _admin
}

export async function POST(request) {
  const auth = await requireRole(request, ['admin', 'agente'])
  if (auth.error) return auth.error

  let body
  try { body = await request.json() } catch { body = {} }
  const { inbox_id, dossier_id } = body
  const categorie = CATS.has(body.categorie) ? body.categorie : null
  if (!inbox_id || !dossier_id) return NextResponse.json({ error: 'inbox_id et dossier_id requis' }, { status: 400 })

  const db = admin()

  const { data: inbox } = await db.from('drive_inbox')
    .select('id, user_id, drive_id, item_id, name, statut').eq('id', inbox_id).maybeSingle()
  if (!inbox) return NextResponse.json({ error: 'Élément introuvable' }, { status: 404 })
  if (inbox.user_id !== auth.user.id && auth.profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }
  if (inbox.statut !== 'a_rattacher') return NextResponse.json({ ok: true, already: true })

  const compte = await loadDriveCompte(db, inbox.user_id)
  const mod = compte ? driveModule(compte.fournisseur) : null
  if (!compte || !mod) return NextResponse.json({ error: 'Drive non connecté' }, { status: 400 })

  let token
  try {
    token = await mod.getValidAccessToken(compte)
  } catch (e) {
    if (e.reconnect) return NextResponse.json({ reconnect: true, error: 'Reconnecte ton Drive' }, { status: 409 })
    console.error('[drive/import] token', e)
    return NextResponse.json({ error: 'Erreur Drive' }, { status: 500 })
  }

  try {
    const { buffer, contentType } = await mod.downloadItemContent(token, inbox.drive_id, inbox.item_id)
    const ext = (inbox.name || '').split('.').pop() || 'bin'
    const path = `chantiers/${dossier_id}/documents/onedrive_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`

    const { error: upErr } = await db.storage.from('documents').upload(path, buffer, { contentType })
    if (upErr) { console.error('[drive/import] storage', upErr.message); return NextResponse.json({ error: 'Copie impossible' }, { status: 502 }) }

    const { data: doc, error: insErr } = await db.from('chantier_documents').insert({
      dossier_id, nom: inbox.name || 'Document', path,
      type_mime: contentType, taille: buffer.length,
      dans_restitution: false, categorie, artisan_id: null,
    }).select('id').single()
    if (insErr) {
      await db.storage.from('documents').remove([path]).catch(() => {})
      console.error('[drive/import] insert', insErr.message)
      return NextResponse.json({ error: 'Enregistrement impossible' }, { status: 500 })
    }

    await db.from('doc_index').insert({
      document_id: doc.id, dossier_id, user_id: inbox.user_id,
      origine: 'onedrive', drive_id: inbox.drive_id, item_id: inbox.item_id, path,
    })
    await db.from('drive_inbox').update({ statut: 'rattache' }).eq('id', inbox.id)

    return NextResponse.json({ ok: true, document_id: doc.id })
  } catch (e) {
    console.error('[drive/import] graph', e)
    return NextResponse.json({ error: 'Import échoué' }, { status: 502 })
  }
}
