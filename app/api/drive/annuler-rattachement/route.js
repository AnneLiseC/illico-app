// app/api/drive/annuler-rattachement/route.js
// POST { inbox_id } — ANNULE un rattachement AUTOMATIQUE. Ne supprime rien définitivement du
// Drive : retire la copie côté app (chantier_documents + doc_index + fichier du stockage),
// remet la ligne inbox en 'a_rattacher', et pose refuse_auto=true pour que le cron ne la
// re-rattache pas au passage suivant (sinon l'annulation serait défaite 30 min plus tard).

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole, assertDossierAccessible } from '../../../lib/api-auth'

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
  const { inbox_id } = body
  if (!inbox_id) return NextResponse.json({ error: 'inbox_id requis' }, { status: 400 })

  const db = admin()

  const { data: inbox } = await db.from('drive_inbox')
    .select('id, user_id, item_id, statut, rattachement_auto').eq('id', inbox_id).maybeSingle()
  if (!inbox) return NextResponse.json({ error: 'Élément introuvable' }, { status: 404 })

  // Cloisonnement tenant (même contrôle que /import).
  if (inbox.user_id !== auth.user.id) {
    const { data: prop } = await db.from('profiles')
      .select('societe_id, agence_id').eq('id', inbox.user_id).maybeSingle()
    const memeTenant = auth.profile?.role === 'admin'
      ? prop?.societe_id === auth.profile.societe_id
      : prop?.agence_id === auth.profile?.agence_id
    if (!memeTenant) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  // Copie app rattachée à ce fichier : on la localise par item_id (posé à l'import).
  const { data: idx } = await db.from('doc_index')
    .select('id, document_id, dossier_id').eq('item_id', inbox.item_id).eq('user_id', inbox.user_id).maybeSingle()

  if (idx) {
    // Contrôle d'appartenance du dossier avant toute suppression.
    const acces = await assertDossierAccessible(idx.dossier_id, auth.profile)
    if (acces.error) return acces.error
    // Le chemin de STOCKAGE app est dans chantier_documents.path (doc_index.path = chemin drive).
    // On le lit AVANT de supprimer la ligne, sinon on ne peut plus retirer le fichier du bucket.
    let storagePath = null
    if (idx.document_id) {
      const { data: docRow } = await db.from('chantier_documents').select('path').eq('id', idx.document_id).maybeSingle()
      storagePath = docRow?.path || null
    }
    await db.from('doc_index').delete().eq('id', idx.id)
    if (idx.document_id) await db.from('chantier_documents').delete().eq('id', idx.document_id)
    if (storagePath) await db.storage.from('documents').remove([storagePath]).catch(() => {})
  }

  // Remet la ligne à rattacher + verrou anti re-rattachement automatique.
  await db.from('drive_inbox').update({
    statut: 'a_rattacher', refuse_auto: true, rattachement_auto: false, rattache_le: null,
  }).eq('id', inbox.id)

  return NextResponse.json({ ok: true })
}
