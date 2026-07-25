// app/api/drive/delete/route.js
// POST { document_id } — supprime la COPIE OneDrive d'un document (miroir) et sa ligne
// doc_index. Suppression maître→miroir : c'est Batilis (le maître pour un fichier né dans
// l'app) qui commande la suppression de la copie Drive.
//
// À appeler AVANT de supprimer la ligne chantier_documents côté app (sinon le cascade FK
// retire doc_index et on perd l'item_id à supprimer).

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole } from '../../../lib/api-auth'
import { driveModule, loadDriveCompte } from '../../../lib/drive/dispatch'

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
  const db = admin()

  // Cible par document_id, photo_id OU cr_id.
  let q = db.from('doc_index').select('id, drive_id, item_id, user_id, origine')
  if (body.document_id) q = q.eq('document_id', body.document_id)
  else if (body.photo_id) q = q.eq('photo_id', body.photo_id)
  else if (body.cr_id) q = q.eq('cr_id', body.cr_id)
  else if (body.devis_id) q = q.eq('devis_id', body.devis_id)
  else return NextResponse.json({ error: 'document_id, photo_id, cr_id ou devis_id requis' }, { status: 400 })

  const { data: idx } = await q.maybeSingle()
  if (!idx) return NextResponse.json({ ok: true, nothing: true }) // jamais miroité → rien à faire

  // Fichier NÉ dans le drive externe (origine='onedrive' = OneDrive OU Google Drive) :
  // le drive en est le MAÎTRE. On ne supprime JAMAIS le master depuis l'app — on retire
  // seulement le pointeur d'index.
  if (idx.origine !== 'app') {
    await db.from('doc_index').delete().eq('id', idx.id)
    return NextResponse.json({ ok: true, detached: true })
  }

  // Compte Drive de la référente propriétaire du miroir (OneDrive OU Google Drive).
  const compte = await loadDriveCompte(db, idx.user_id)
  const mod = compte ? driveModule(compte.fournisseur) : null
  if (!compte || !mod) {
    // Plus de compte : on retire au moins l'index (la copie Drive, s'il en reste une, est
    // hors de notre portée).
    await db.from('doc_index').delete().eq('id', idx.id)
    return NextResponse.json({ ok: true, no_drive: true })
  }

  let token
  try {
    token = await mod.getValidAccessToken(compte)
  } catch (e) {
    if (e.reconnect) return NextResponse.json({ ok: false, reconnect: true })
    console.error('[drive/delete] token', e)
    return NextResponse.json({ error: 'Erreur Drive' }, { status: 500 })
  }

  try {
    await mod.deleteItem(token, idx.drive_id, idx.item_id)
  } catch (e) {
    console.error('[drive/delete] graph', e)
    return NextResponse.json({ error: 'Suppression OneDrive échouée' }, { status: 502 })
  }

  await db.from('doc_index').delete().eq('id', idx.id)
  return NextResponse.json({ ok: true })
}
