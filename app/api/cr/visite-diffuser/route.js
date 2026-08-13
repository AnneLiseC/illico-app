// app/api/cr/visite-diffuser/route.js
// POST { visite_id, lot_ids?, inclure_client?, filtrer_par_lot? } — ENVOIE le PDF de la visite
// par mail aux artisans des lots sélectionnés (PDF filtré à leur lot si filtrer_par_lot) et,
// si demandé, au client. N'envoie RIEN sans appel explicite (déclenché par un bouton +
// confirmation côté UI). Renvoie un rapport { envoyes, erreurs }.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole } from '../../../lib/api-auth'
import { genererVisitePDF } from '../../../lib/pdf/genererVisite.js'
import { sendEmail } from '../../../lib/email'
import { formatNomClient } from '../../../lib/clients.js'

export const maxDuration = 60

let _admin
function admin() {
  if (!_admin) _admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _admin
}

const b64 = (buf) => Buffer.from(buf).toString('base64')

export async function POST(request) {
  const auth = await requireRole(request, ['admin', 'agente'])
  if (auth.error) return auth.error

  let body; try { body = await request.json() } catch { body = {} }
  const visiteId = body.visite_id
  if (!visiteId) return NextResponse.json({ error: 'visite_id manquant' }, { status: 400 })
  const lotIds = Array.isArray(body.lot_ids) ? body.lot_ids : []
  const inclureClient = !!body.inclure_client
  const filtrerParLot = !!body.filtrer_par_lot

  const db = admin()
  const { data: visite } = await db.from('comptes_rendus')
    .select('id, dossier_id, numero_visite').eq('id', visiteId).maybeSingle()
  if (!visite) return NextResponse.json({ error: 'Visite introuvable' }, { status: 404 })
  const { data: dossier } = await db.from('dossiers')
    .select('id, client:clients(nom, prenom, email, raison_sociale, type_client, forme_juridique, civilite, prenom2, nom2, nom)')
    .eq('id', visite.dossier_id).maybeSingle()
  if (!dossier) return NextResponse.json({ error: 'Dossier introuvable' }, { status: 404 })

  const clientNom = formatNomClient(dossier.client, { civilite: false }) || 'client'
  const nomFichier = (base) => `${base}_Visite_${visite.numero_visite || ''}.pdf`.replace('__', '_')
  const sujet = `Compte-rendu de visite ${visite.numero_visite || ''} — ${clientNom}`.trim()

  const envoyes = []
  const erreurs = []

  // ── Artisans (par lot sélectionné) ──
  if (lotIds.length) {
    const { data: lots } = await db.from('lots').select('id, nom, artisan_id').in('id', lotIds)
    const artisanIds = [...new Set((lots || []).map(l => l.artisan_id).filter(Boolean))]
    let artisansById = {}
    if (artisanIds.length) {
      const { data: arts } = await db.from('artisans').select('id, entreprise, email').in('id', artisanIds)
      artisansById = Object.fromEntries((arts || []).map(a => [a.id, a]))
    }
    const dejaFait = new Set()
    for (const lot of (lots || [])) {
      const artisan = lot.artisan_id ? artisansById[lot.artisan_id] : null
      const cible = filtrerParLot ? `${lot.artisan_id}:${lot.id}` : lot.artisan_id
      if (!artisan) { erreurs.push({ lot: lot.nom, raison: 'aucun artisan' }); continue }
      if (!artisan.email) { erreurs.push({ lot: lot.nom, artisan: artisan.entreprise, raison: 'pas d’email' }); continue }
      if (dejaFait.has(cible)) continue
      dejaFait.add(cible)
      try {
        const { buffer } = await genererVisitePDF(db, visiteId, { filtreLotId: filtrerParLot ? lot.id : null })
        await sendEmail({
          to: artisan.email,
          subject: sujet,
          html: `<p>Bonjour,</p><p>Veuillez trouver ci-joint le compte-rendu de la visite de chantier ${visite.numero_visite || ''} concernant le chantier de ${clientNom}.</p><p>Cordialement,<br/>illiCO travaux</p>`,
          attachments: [{ filename: nomFichier(artisan.entreprise || 'CR'), contentBytes: b64(buffer), contentType: 'application/pdf' }],
        })
        envoyes.push({ artisan: artisan.entreprise, email: artisan.email })
      } catch (e) {
        erreurs.push({ artisan: artisan.entreprise, raison: e?.message || 'envoi échoué' })
      }
    }
  }

  // ── Client (PDF complet + notification) ──
  if (inclureClient) {
    if (!dossier.client?.email) {
      erreurs.push({ client: clientNom, raison: 'pas d’email' })
    } else {
      try {
        const { buffer } = await genererVisitePDF(db, visiteId, {})
        await sendEmail({
          to: dossier.client.email,
          subject: sujet,
          html: `<p>Bonjour,</p><p>Un compte-rendu de visite de votre chantier est disponible. Vous le trouverez en pièce jointe, et également dans votre espace client.</p><p>Cordialement,<br/>illiCO travaux</p>`,
          attachments: [{ filename: nomFichier('CR'), contentBytes: b64(buffer), contentType: 'application/pdf' }],
        })
        envoyes.push({ client: clientNom, email: dossier.client.email })
      } catch (e) {
        erreurs.push({ client: clientNom, raison: e?.message || 'envoi échoué' })
      }
    }
  }

  return NextResponse.json({ envoyes, erreurs, total: envoyes.length })
}
