// app/api/drive/delete/route.js
// POST { document_id } — supprime la COPIE OneDrive d'un document (miroir) et sa ligne
// doc_index. Suppression maître→miroir : c'est Batilis (le maître pour un fichier né dans
// l'app) qui commande la suppression de la copie Drive.
//
// À appeler AVANT de supprimer la ligne chantier_documents côté app (sinon le cascade FK
// retire doc_index et on perd l'item_id à supprimer).

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole, assertDossierAccessible } from '../../../lib/api-auth'
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
  let q = db.from('doc_index').select('id, drive_id, item_id, user_id, origine, dossier_id, artisan_id')
  if (body.document_id) q = q.eq('document_id', body.document_id)
  else if (body.photo_id) q = q.eq('photo_id', body.photo_id)
  else if (body.cr_id) q = q.eq('cr_id', body.cr_id)
  else if (body.devis_id) q = q.eq('devis_id', body.devis_id)
  else if (body.facture_id) q = q.eq('facture_id', body.facture_id)
  else if (body.honoraire_facture_id) q = q.eq('honoraire_facture_id', body.honoraire_facture_id)
  else if (body.contrat_dossier_id) q = q.eq('contrat_dossier_id', body.contrat_dossier_id)
  else if (body.pv_devis_id) q = q.eq('pv_devis_id', body.pv_devis_id)
  else if (body.fiche_id) q = q.eq('fiche_id', body.fiche_id)
  else if (body.artisan_id && body.artisan_doc_type) q = q.eq('artisan_id', body.artisan_id).eq('artisan_doc_type', body.artisan_doc_type)
  else return NextResponse.json({ error: 'clé de suppression requise' }, { status: 400 })

  const { data: idx } = await q.maybeSingle()
  if (!idx) return NextResponse.json({ ok: true, nothing: true }) // jamais miroité → rien à faire

  // Cloisonnement tenant : la ligne résolue doit appartenir au tenant de l'appelant.
  // Dossier-scopée → contrôle par dossier_id ; artisan/fiche sans dossier → société de l'artisan.
  if (idx.dossier_id) {
    const acces = await assertDossierAccessible(idx.dossier_id, auth.profile)
    if (acces.error) return acces.error
  } else if (idx.artisan_id) {
    const { data: art } = await db.from('artisans').select('societe_id').eq('id', idx.artisan_id).maybeSingle()
    if (!art || art.societe_id !== auth.profile?.societe_id) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
  } else {
    return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
  }

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
