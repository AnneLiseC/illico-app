// app/api/export-societe/route.js
// POST /api/export-societe — renvoie UN classeur Excel contenant toutes les données de
// la société, un onglet par sujet. C'est la RÉVERSIBILITÉ : la garantie qu'un franchisé peut partir avec ce qui
// lui appartient. (R9)
//
// QUI PEUT L'APPELER
//   · un ADMIN : sa propre société, et rien d'autre. Le `societe_id` est lu sur SON
//     profil, jamais sur ce que le corps de la requête prétend — sans quoi la route
//     deviendrait exactement la fuite inter-franchisés que tout le reste s'emploie à
//     empêcher.
//   · le SUPER-ADMIN : n'importe quelle société, en passant `societeId`. C'est la voie
//     de service, pour honorer une demande de réversibilité si le franchisé n'a plus
//     accès à son compte.
//
// Une agente n'y a pas droit : l'export porte sur toute la société, il excède son
// périmètre.
//
// POURQUOI EN SERVICE_ROLE : l'export doit être COMPLET. Passer par la RLS renverrait la
// vue de l'appelant — pour une agente, une fraction ; pour un admin, presque tout, mais
// « presque » n'est pas une garantie de réversibilité. On contrôle donc l'identité en
// amont, puis on lit tout, et on ne rend que la société autorisée.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireUser, requireSuperAdmin } from '../../lib/api-auth'
import { collecterExport, construireExport, nomFichier } from '../../lib/export-societe'

let _admin
function db() {
  if (!_admin) _admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _admin
}

export async function POST(request) {
  // ⚠️ ORDRE VOULU : le super-admin D'ABORD. Le compte de l'éditrice n'a volontairement
  // AUCUN profil (décision D4) — `requireUser` le rejetterait donc en « Profil
  // introuvable », et la voie de service serait inutilisable.
  let societeId = null
  const superAdmin = await requireSuperAdmin(request)

  if (!superAdmin.error) {
    const body = await request.json().catch(() => ({}))
    societeId = body?.societeId || null
    if (!societeId) {
      return NextResponse.json({ error: 'societeId requis pour un export super-admin' }, { status: 400 })
    }
  } else {
    const auth = await requireUser(request)
    if (auth.error) return auth.error
    if (auth.profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Réservé au franchisé de la société.' }, { status: 403 })
    }
    // ⚠️ Lu sur le PROFIL, jamais sur le corps de la requête : sinon n'importe quel
    // franchisé exporterait la société de son concurrent en changeant un identifiant.
    societeId = auth.profile.societe_id
    if (!societeId) {
      return NextResponse.json({ error: 'Aucune société rattachée à ce compte.' }, { status: 400 })
    }
  }

  try {
    const { parTable, resume, societe } = await collecterExport(db(), societeId)
    const buffer = await construireExport({ parTable, resume, societe })
    const nom = nomFichier(societe?.nom_societe)
    const nomAscii = nom.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '_')

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${nomAscii}"; filename*=UTF-8''${encodeURIComponent(nom)}`,
        'X-Export-Onglets': String(resume.length),
        'X-Export-Lignes': String(resume.reduce((s, r) => s + r.lignes, 0)),
      },
    })
  } catch (err) {
    console.error('[export-societe]', err)
    return NextResponse.json({ error: err.message || 'Export impossible' }, { status: 500 })
  }
}
