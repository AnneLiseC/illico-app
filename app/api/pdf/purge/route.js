// app/api/pdf/purge/route.js
// Purge le cache PDF d'un dossier : les fichiers du Storage ET les lignes documents_cache.
//
// POURQUOI UNE ROUTE SERVEUR — la suppression d'un chantier balayait déjà le préfixe
// `cache/<dossier>` depuis le NAVIGATEUR. Les règles de stockage ne couvrent pas ce
// préfixe (elles n'autorisent que `chantiers/`, `artisans/`, `factures_agente/`, `kbis/`
// et `rib/`), donc la suppression était refusée EN SILENCE : la ligne tombait par
// cascade, le PDF restait dans le bucket pour toujours. Récapitulatifs financiers et
// dossiers de suivi complets de chantiers effacés. (R15)
//
// Le cloisonnement est celui des autres routes PDF : `assertDossierAccessible` AVANT
// toute opération. La purge elle-même tourne ensuite en service_role, seule identité
// autorisée sur ce préfixe.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireRole, assertDossierAccessible } from '../../../lib/api-auth'
import { purgerCache } from '../../../lib/pdf/cache.js'

let _admin
function getSupabaseAdmin() {
  if (!_admin) _admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _admin
}

export async function POST(request) {
  // Purger le cache est un geste d'exploitation : réservé au franchisé et à ses agentes,
  // jamais au client final.
  const auth = await requireRole(request, ['admin', 'agente'])
  if (auth.error) return auth.error

  let dossierId
  try {
    ({ dossierId } = await request.json())
  } catch {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  }
  if (!dossierId) return NextResponse.json({ error: 'dossierId manquant' }, { status: 400 })

  const acces = await assertDossierAccessible(dossierId, auth.profile)
  if (acces?.error) return acces.error

  const supprimes = await purgerCache(getSupabaseAdmin(), dossierId)
  return NextResponse.json({ ok: true, supprimes })
}
