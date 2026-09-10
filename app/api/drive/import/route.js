// app/api/drive/import/route.js
// POST { inbox_id, dossier_id, categorie } — rattache un fichier DÉPOSÉ dans OneDrive
// (drive_inbox) à un chantier : on télécharge une COPIE dans Supabase (magasin app), on
// crée la ligne chantier_documents, et on indexe avec origine = 'onedrive' | 'googledrive'
// selon le fournisseur (le drive reste le MAÎTRE du fichier ; la suppression app ne fait
// que détacher l'index). Rattachement MANUEL — l'utilisateur choisit le dossier + catégorie.
//
// L'entrée d'index (item_id) neutralise aussi l'écho : le poller ne re-listera plus ce
// fichier (il est désormais connu de doc_index).
//
// DEUX DESTINATIONS (10/09) : `categorie_photo` ('avant' | 'pendant' | 'apres') envoie le
// fichier dans la table PHOTOS plutôt que dans chantier_documents. Sans ce choix, la seule
// action possible sur une photo bien rangée dans le Drive était de la mettre au mauvais
// endroit — invisible dans l'onglet Photos comme dans le dossier de restitution. C'est ce
// qui laissait 362 photos indéfiniment « à rattacher ».

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole, assertDossierAccessible } from '../../../lib/api-auth'
import { driveModule, loadDriveCompte } from '../../../lib/drive/dispatch'
import { importerInbox, importerInboxPhoto } from '../../../lib/drive/import-inbox'
import { estImage } from '../../../lib/drive/rattachement'

const CATS = new Set(['compte_rendu', 'plans', 'administratif']) // catégories libres autorisées ; sinon Autres (null)
const CATS_PHOTO = new Set(['avant', 'pendant', 'apres'])

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
  const categoriePhoto = CATS_PHOTO.has(body.categorie_photo) ? body.categorie_photo : null
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

  if (categoriePhoto) {
    // Un PDF classé « Avant » ne serait pas une photo : on refuse plutôt que de créer une
    // ligne photos qui ne s'affichera nulle part.
    if (!estImage(inbox.name)) {
      return NextResponse.json({ error: "Ce fichier n'est pas une image : choisis une catégorie de document." }, { status: 400 })
    }
    const r = await importerInboxPhoto(db, {
      mod, token, inbox, fournisseur: compte.fournisseur,
      dossierId: dossier_id, categoriePhoto, auto: false,
    })
    if (r.error) return NextResponse.json({ error: r.error }, { status: r.status })
    // Doublon : la photo était déjà dans l'appli. Ce n'est pas un échec — la ligne a été
    // écartée de la liste, ce que l'utilisatrice voulait obtenir.
    if (r.skipped) return NextResponse.json({ ok: true, deja: true, reason: r.reason })
    return NextResponse.json({ ok: true, photo_id: r.photo_id })
  }

  const r = await importerInbox(db, {
    mod, token, inbox, fournisseur: compte.fournisseur,
    dossierId: dossier_id, categorie, artisanId: null, auto: false,
  })
  if (r.error) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ ok: true, document_id: r.document_id })
}
