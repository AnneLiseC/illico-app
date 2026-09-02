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
import { deciderRattachement } from '../../../lib/drive/rattachement'
import { suffixeCollisionDossier } from '../../../lib/drive/collisions'
import { nettoyerSegment } from '../../../lib/drive/taxonomie'
import { importerInbox, estEchoNom } from '../../../lib/drive/import-inbox'

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
    const r = { user_id: compte.user_id, fournisseur: compte.fournisseur, detectes: 0, rattaches: 0, echos: 0, rattach_echecs: 0 }
    const mod = driveModule(compte.fournisseur)
    if (!mod) { r.erreur = 'fournisseur'; rapport.push(r); continue }

    let token
    try { token = await mod.getValidAccessToken(compte) }
    catch (e) { r.erreur = e.reconnect ? 'reconnect' : 'token'; rapport.push(r); continue }

    let files, cursor, init, resync
    try {
      ({ files, cursor, init, resync } = await mod.pullInbox(token, compte.drive_root_drive_id, compte.drive_root_id, compte.drive_delta_link))
    } catch (e) { r.erreur = 'pull'; console.error('[pull-drive] pull', compte.fournisseur, e); rapport.push(r); continue }

    // Curseur mort auto-repare pendant l'appel. On le SIGNALE (rapport + log) sans lever
    // d'erreur : une resynchronisation ponctuelle est une reparation reussie. En revanche,
    // si elle revient a CHAQUE passage, c'est que la racine n'est plus atteignable et qu'il
    // faut reconnecter le Drive — d'ou la trace, pour que ca ne redevienne pas invisible.
    if (resync) {
      r.resync = true
      console.error('[pull-drive] resynchronisation du curseur', compte.fournisseur, compte.user_id)
    }

    // Mémorise le nouveau curseur.
    if (cursor && cursor !== compte.drive_delta_link) {
      await db.from('comptes_oauth').update({ drive_delta_link: cursor }).eq('id', compte.id)
    }

    // 1re passe → pas de traitement des items.
    if (init) { r.init = true; rapport.push(r); continue }

    // Candidats de rattachement : tous les chantiers de la référente (propriétaire du Drive),
    // avec client (nom/nom2) et suffixe anti-collision. Chargés UNE fois par compte, pas par
    // fichier. Artisans bornés à la société (nom de dossier nettoyé → id).
    const { data: doss } = await db.from('dossiers')
      .select('id, statut, created_at, date_premier_rdv, date_fin_chantier, date_cloture, client_id, client:clients(nom, nom2)')
      .eq('referente_id', compte.user_id)
    const candidats = []
    for (const d of (doss || [])) candidats.push({ dossier: d, client: d.client, suffixe: await suffixeCollisionDossier(db, d) })
    const artisansParNom = new Map()
    const { data: prof } = await db.from('profiles').select('societe_id').eq('id', compte.user_id).maybeSingle()
    if (prof?.societe_id) {
      const { data: arts } = await db.from('artisans').select('id, entreprise').eq('societe_id', prof.societe_id)
      for (const a of (arts || [])) if (a.entreprise) artisansParNom.set(nettoyerSegment(a.entreprise), a.id)
    }

    for (const f of (files || [])) {
      // Anti-écho (existant) : fichier poussé par l'app, déjà dans doc_index → on ignore.
      const { data: known } = await db.from('doc_index').select('id').eq('item_id', f.itemId).maybeSingle()
      if (known) continue

      // Ligne inbox existante (re-détection). Déjà tranchée (rattachée/ignorée) OU refus
      // humain explicite (refuse_auto, posé par « Annuler ») → la décision humaine prime.
      const { data: dejaInbox } = await db.from('drive_inbox')
        .select('id, statut, refuse_auto').eq('user_id', compte.user_id).eq('item_id', f.itemId).maybeSingle()
      if (dejaInbox && (dejaInbox.statut !== 'a_rattacher' || dejaInbox.refuse_auto)) continue

      const baseRow = {
        user_id: compte.user_id, drive_id: compte.drive_root_drive_id, item_id: f.itemId,
        name: f.name || null, parent_path: f.parentPath || null, web_url: f.webUrl || null,
      }

      const decision = deciderRattachement(f.parentPath || '', candidats, artisansParNom)

      if (decision.dossier_id) {
        // Garde-fou nom-de-fichier : écho d'un doc déjà en base pour ce dossier ? (pushMirror
        // recrée l'item quand le chemin change → nouvel item_id.) Si oui → ignore, pas de doublon.
        const { data: memes } = await db.from('doc_index').select('path').eq('dossier_id', decision.dossier_id)
        if (estEchoNom(f.name, (memes || []).map(x => x.path))) {
          if (dejaInbox) await db.from('drive_inbox').update({ statut: 'ignore' }).eq('id', dejaInbox.id)
          else await db.from('drive_inbox').insert({ ...baseRow, statut: 'ignore' })
          r.echos++
          continue
        }
        // Ligne cible : réutilise la ligne a_rattacher existante, sinon en insère une.
        let ligne = dejaInbox
        if (!ligne) {
          const { data: ins } = await db.from('drive_inbox').insert({ ...baseRow, statut: 'a_rattacher' }).select('id').single()
          ligne = ins
        }
        const res = await importerInbox(db, {
          mod, token,
          inbox: { id: ligne.id, drive_id: compte.drive_root_drive_id, item_id: f.itemId, name: f.name || null, user_id: compte.user_id, parent_path: f.parentPath || null },
          fournisseur: compte.fournisseur,
          dossierId: decision.dossier_id, categorie: decision.categorie, artisanId: decision.artisan_id, auto: true,
        })
        if (res.ok) r.rattaches++
        else r.rattach_echecs++
        continue
      }

      // Décision incomplète → a_rattacher comme aujourd'hui + décompte de la raison.
      if (!dejaInbox) await db.from('drive_inbox').insert({ ...baseRow, statut: 'a_rattacher' })
      r.detectes++
      r.raisons = r.raisons || {}
      r.raisons[decision.raison] = (r.raisons[decision.raison] || 0) + 1
    }
    rapport.push(r)
  }

  const enErreur = rapport.some(r => r.erreur)
  const rattaches_total = rapport.reduce((s, r) => s + (r.rattaches || 0), 0)
  const raisons_total = {}
  for (const r of rapport) for (const [k, v] of Object.entries(r.raisons || {})) raisons_total[k] = (raisons_total[k] || 0) + v
  return NextResponse.json({ ok: !enErreur, comptes: rapport.length, rattaches_total, raisons_total, rapport }, { status: enErreur ? 500 : 200 })
}
