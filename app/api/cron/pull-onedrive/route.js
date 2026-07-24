// app/api/cron/pull-onedrive/route.js
// Poller ENTRANT OneDrive → Batils (Lot 4, v1 = DÉTECTION seule).
//
// Pour chaque compte 'microsoft' avec une racine définie : delta query sur le sous-arbre
// de la racine. Les FICHIERS nouvellement apparus qui NE viennent PAS de l'app (item_id
// inconnu de doc_index → invariant n°1 anti-écho) sont listés dans drive_inbox
// (« à rattacher »). AUCUN rattachement automatique, AUCune création d'objet app ici :
// on prouve la détection sans risque de corruption. Le rattachement viendra ensuite.
//
// 1re passe d'un compte = token=latest → on mémorise juste le curseur, sans importer
// l'existant (invariant n°2 : pas d'avalanche). Auth : Bearer CRON_SECRET.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { checkBearerSecret } from '../../../lib/http-auth'
import { getValidAccessToken, deltaQuery } from '../../../lib/drive/microsoft'

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
    .select('id, user_id, access_token, refresh_token, expiry_date, drive_root_drive_id, drive_root_id, drive_delta_link')
    .eq('fournisseur', 'microsoft')
    .not('drive_root_id', 'is', null)

  const rapport = []
  for (const compte of (comptes || [])) {
    const r = { user_id: compte.user_id, detectes: 0 }
    let token
    try { token = await getValidAccessToken(compte) }
    catch (e) { r.erreur = e.reconnect ? 'reconnect' : 'token'; rapport.push(r); continue }

    let items, deltaLink
    try {
      ({ items, deltaLink } = await deltaQuery(token, compte.drive_root_drive_id, compte.drive_root_id, compte.drive_delta_link))
    } catch (e) { r.erreur = 'delta'; console.error('[pull-onedrive] delta', e); rapport.push(r); continue }

    // Mémorise le nouveau curseur.
    if (deltaLink) await db.from('comptes_oauth').update({ drive_delta_link: deltaLink }).eq('id', compte.id)

    // 1re passe (init token=latest) → pas de traitement des items.
    if (!compte.drive_delta_link) { r.init = true; rapport.push(r); continue }

    for (const it of items) {
      if (it.deleted || it.folder || !it.file) continue // dossiers / suppressions / non-fichiers ignorés
      // Anti-écho : fichier poussé par l'app (déjà dans doc_index) → on ignore.
      const { data: known } = await db.from('doc_index').select('id').eq('item_id', it.id).maybeSingle()
      if (known) continue
      // Déjà dans la corbeille ?
      const { data: dejaInbox } = await db.from('drive_inbox').select('id').eq('user_id', compte.user_id).eq('item_id', it.id).maybeSingle()
      if (dejaInbox) continue
      await db.from('drive_inbox').insert({
        user_id: compte.user_id,
        drive_id: compte.drive_root_drive_id,
        item_id: it.id,
        name: it.name || null,
        parent_path: it.parentReference?.path || null,
        web_url: it.webUrl || null,
      })
      r.detectes++
    }
    rapport.push(r)
  }

  return NextResponse.json({ ok: true, comptes: rapport.length, rapport })
}
