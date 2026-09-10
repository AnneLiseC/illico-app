// app/api/drive/inbox/route.js
// POST { inbox_id | inbox_ids[], action:'ignore' } — écarte des fichiers détectés de la liste
// « à rattacher » (statut='ignore'). Le fichier reste dans le Drive ; on arrête juste de le
// proposer. Écriture via service role (drive_inbox n'a qu'une policy de lecture), scoping par owner.
//
// LE LOT N'EST PAS UN CONFORT (10/09). Une liste de 1294 lignes ne se traite pas à raison d'un
// clic par fichier : elle ne se traite pas du tout, et elle finit par être ignorée en bloc —
// y compris les quelques fichiers qui, eux, méritaient un geste. Un dossier entier écarté
// d'un seul geste, c'est ce qui rend la liste à nouveau lisible, donc utile.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole } from '../../../lib/api-auth'

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
  // Un id seul ou une liste : la route accepte les deux pour ne pas casser l'appel unitaire.
  const ids = Array.isArray(body.inbox_ids) ? body.inbox_ids.filter(Boolean) : (body.inbox_id ? [body.inbox_id] : [])
  if (ids.length === 0 || ids.length > 500 || body.action !== 'ignore') {
    return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 })
  }

  const db = admin()
  const { data: lignes } = await db.from('drive_inbox').select('id, user_id').in('id', ids)
  if (!lignes || lignes.length === 0) return NextResponse.json({ ok: true, nothing: true })

  // Le contrôle d'accès porte sur CHAQUE ligne, pas sur la première : un lot est un endroit
  // commode pour glisser l'id d'un autre tenant au milieu d'ids légitimes.
  const proprietaires = [...new Set(lignes.map(l => l.user_id))].filter(u => u !== auth.user.id)
  if (proprietaires.length > 0) {
    const { data: profs } = await db.from('profiles').select('id, societe_id, agence_id').in('id', proprietaires)
    const parId = new Map((profs || []).map(p => [p.id, p]))
    const autorise = (userId) => {
      if (userId === auth.user.id) return true
      const prop = parId.get(userId)
      return auth.profile?.role === 'admin'
        ? prop?.societe_id === auth.profile.societe_id
        : prop?.agence_id === auth.profile?.agence_id
    }
    if (lignes.some(l => !autorise(l.user_id))) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const { error } = await db.from('drive_inbox').update({ statut: 'ignore' }).in('id', lignes.map(l => l.id))
  if (error) return NextResponse.json({ error: 'Mise à jour impossible' }, { status: 500 })
  return NextResponse.json({ ok: true, ignores: lignes.length })
}
