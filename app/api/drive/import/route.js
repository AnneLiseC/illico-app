// app/api/drive/import/route.js
// POST { inbox_id, dossier_id, categorie } — rattache un fichier DÉPOSÉ dans OneDrive
// (drive_inbox) à un chantier : on télécharge une COPIE dans Supabase (magasin app), on
// crée la ligne chantier_documents, et on indexe avec origine = 'onedrive' | 'googledrive'
// selon le fournisseur (le drive reste le MAÎTRE du fichier ; la suppression app ne fait
// que détacher l'index). Rattachement MANUEL — l'utilisateur choisit le dossier + catégorie.
//
// L'entrée d'index (item_id) neutralise aussi l'écho : le poller ne re-listera plus ce
// fichier (il est désormais connu de doc_index).

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole, assertDossierAccessible } from '../../../lib/api-auth'
import { driveModule, loadDriveCompte } from '../../../lib/drive/dispatch'
import { importerInbox } from '../../../lib/drive/import-inbox'

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
    .select('id, user_id, drive_id, item_id, name, statut, parent_path').eq('id', inbox_id).maybeSingle()
  if (!inbox) return NextResponse.json({ error: 'Élément introuvable' }, { status: 404 })
  if (inbox.user_id !== auth.user.id) {
    const { data: prop } = await db.from('profiles')
      .select('societe_id, agence_id').eq('id', inbox.user_id).maybeSingle()
    const memeTenant = auth.profile?.role === 'admin'
      ? prop?.societe_id === auth.profile.societe_id
      : prop?.agence_id === auth.profile?.agence_id
    if (!memeTenant) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const acces = await assertDossierAccessible(dossier_id, auth.profile)
  if (acces.error) return acces.error
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

  const r = await importerInbox(db, {
    mod, token, inbox, fournisseur: compte.fournisseur,
    dossierId: dossier_id, categorie, artisanId: null, auto: false,
  })
  if (r.error) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ ok: true, document_id: r.document_id })
}
