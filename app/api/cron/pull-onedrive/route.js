// app/api/cron/pull-onedrive/route.js
// Poller ENTRANT Drive → Batilis (DÉTECTION seule). OneDrive ('microsoft') ET Google Drive
// ('googledrive') via le dispatch : chaque module expose pullInbox(token, driveId, rootId,
// cursor) → { files, cursor, init } (delta OneDrive vs changes API Google, ascendance filtrée
// côté Google). Interface commune → une seule boucle.
//
// Les FICHIERS nouvellement apparus qui NE viennent PAS de l'app (item_id inconnu de doc_index
// → invariant n°1 anti-écho) sont listés dans drive_inbox (« à rattacher »). AUCUN rattachement
// automatique ici. 1re passe d'un compte = init (token/startPageToken mémorisé sans importer
// l'existant → invariant n°2). Curseur persisté dans comptes_oauth.drive_delta_link.
//
// Auth : Bearer CRON_SECRET. (Non planifié dans vercel.json : activer la fréquence quand prêt.)

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { checkBearerSecret } from '../../../lib/http-auth'
import { driveModule } from '../../../lib/drive/dispatch'

const DRIVE_FOURNISSEURS = ['microsoft', 'googledrive']

let _admin
function admin() {
  if (!_admin) _admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _admin
}

export async function GET(req) {
  if (!checkBearerSecret(req, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const db = admin()

  const { data: comptes } = await db.from('comptes_oauth')
    .select('id, user_id, fournisseur, access_token, refresh_token, expiry_date, drive_root_drive_id, drive_root_id, drive_delta_link')
    .in('fournisseur', DRIVE_FOURNISSEURS)
    .not('drive_root_id', 'is', null)

  const rapport = []
  for (const compte of (comptes || [])) {
    const r = { user_id: compte.user_id, fournisseur: compte.fournisseur, detectes: 0 }
    const mod = driveModule(compte.fournisseur)
    if (!mod) { r.erreur = 'fournisseur'; rapport.push(r); continue }

    let token
    try { token = await mod.getValidAccessToken(compte) }
    catch (e) { r.erreur = e.reconnect ? 'reconnect' : 'token'; rapport.push(r); continue }

    let files, cursor, init
    try {
      ({ files, cursor, init } = await mod.pullInbox(token, compte.drive_root_drive_id, compte.drive_root_id, compte.drive_delta_link))
    } catch (e) { r.erreur = 'pull'; console.error('[pull-drive] pull', compte.fournisseur, e); rapport.push(r); continue }

    // Mémorise le nouveau curseur.
    if (cursor && cursor !== compte.drive_delta_link) {
      await db.from('comptes_oauth').update({ drive_delta_link: cursor }).eq('id', compte.id)
    }

    // 1re passe → pas de traitement des items.
    if (init) { r.init = true; rapport.push(r); continue }

    for (const f of (files || [])) {
      // Anti-écho : fichier poussé par l'app (déjà dans doc_index) → on ignore.
      const { data: known } = await db.from('doc_index').select('id').eq('item_id', f.itemId).maybeSingle()
      if (known) continue
      // Déjà dans la liste à rattacher ?
      const { data: dejaInbox } = await db.from('drive_inbox').select('id').eq('user_id', compte.user_id).eq('item_id', f.itemId).maybeSingle()
      if (dejaInbox) continue
      await db.from('drive_inbox').insert({
        user_id: compte.user_id,
        drive_id: compte.drive_root_drive_id,
        item_id: f.itemId,
        name: f.name || null,
        parent_path: f.parentPath || null,
        web_url: f.webUrl || null,
      })
      r.detectes++
    }
    rapport.push(r)
  }

  return NextResponse.json({ ok: true, comptes: rapport.length, rapport })
}
