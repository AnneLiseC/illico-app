// app/api/cr/visite-diffuser/route.js
// POST { visite_id, lot_ids?, inclure_client?, filtrer_par_lot? } — ENVOIE le PDF de la visite
// par mail aux artisans des lots sélectionnés (PDF filtré à leur lot si filtrer_par_lot) et,
// si demandé, au client. N'envoie RIEN sans appel explicite (déclenché par un bouton +
// confirmation côté UI). Renvoie un rapport { envoyes, erreurs }.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { preparerEnvoi, modeEnvoi, MODE_ESSAI } from '../../../lib/relances-envoi'
import { gabaritEmail } from '../../../lib/email-signature'
import { requireRole, assertDossierAccessible } from '../../../lib/api-auth'
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
  // Appartenance au tenant (service_role contourne la RLS + on envoie des mails).
  const acces = await assertDossierAccessible(visite.dossier_id, auth.profile)
  if (acces.error) return acces.error
  const { data: dossier } = await db.from('dossiers')
    .select('id, client:clients(nom, prenom, email, raison_sociale, type_client, forme_juridique, civilite, prenom2, nom2, nom)')
    .eq('id', visite.dossier_id).maybeSingle()
  if (!dossier) return NextResponse.json({ error: 'Dossier introuvable' }, { status: 404 })

  // AGENCE du dossier : c'est ELLE qui signe le mail, pas BATILIS. Le client doit savoir
  // qui lui écrit et qui appeler. La référente reste jointe par le replyTo.
  let agence = null
  {
    const { data: d2 } = await db.from('dossiers').select('referente_id').eq('id', visite.dossier_id).maybeSingle()
    if (d2?.referente_id) {
      const { data: prof } = await db.from('profiles').select('agence_id').eq('id', d2.referente_id).maybeSingle()
      if (prof?.agence_id) {
        const { data: ag } = await db.from('agences')
          .select('nom, adresse, code_postal, ville, telephone').eq('id', prof.agence_id).maybeSingle()
        agence = ag || null
      }
    }
  }

  const clientNom = formatNomClient(dossier.client, { civilite: false }) || 'client'
  const nomFichier = (base) => `${base}_Visite_${visite.numero_visite || ''}.pdf`.replace('__', '_')
  const sujet = `Rapport de visite ${visite.numero_visite || ''} — ${clientNom}`.trim()

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
        // GARDE-FOU : en mode essai, le mail part vers l'adresse d'essai avec l'objet
        // préfixé du vrai destinataire. Rien n'atteint un artisan tant que
        // RELANCES_ENVOI=reel n'est pas posé.
        const envoi = preparerEnvoi({ to: artisan.email, subject: sujet })
        if (!envoi.envoyer) { erreurs.push({ artisan: artisan.entreprise, raison: `non envoyé (${envoi.raison})` }); continue }
        const { buffer } = await genererVisitePDF(db, visiteId, { filtreLotId: filtrerParLot ? lot.id : null })
        await sendEmail({
          to: envoi.to,
          subject: envoi.subject,
          html: gabaritEmail({
            agence,
            contenu: `<p>Bonjour,</p><p>Veuillez trouver ci-joint le rapport de la visite de chantier ${visite.numero_visite || ''} concernant le chantier de ${clientNom}.</p>`,
          }),
          attachments: [{ filename: nomFichier(artisan.entreprise || 'CR'), contentBytes: b64(buffer), contentType: 'application/pdf' }],
        })
        envoyes.push({ artisan: artisan.entreprise, email: envoi.to, reel: envoi.reel })
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
        const envoi = preparerEnvoi({ to: dossier.client.email, subject: sujet })
        if (!envoi.envoyer) {
          erreurs.push({ client: clientNom, raison: `non envoyé (${envoi.raison})` })
        } else {
          const { buffer } = await genererVisitePDF(db, visiteId, {})
          await sendEmail({
            to: envoi.to,
            subject: envoi.subject,
            html: gabaritEmail({
              agence,
              contenu: `<p>Bonjour,</p><p>Un rapport de visite de votre chantier est disponible. Vous le trouverez en pièce jointe, et également dans votre espace client.</p>`,
            }),
            attachments: [{ filename: nomFichier('CR'), contentBytes: b64(buffer), contentType: 'application/pdf' }],
          })
          envoyes.push({ client: clientNom, email: envoi.to, reel: envoi.reel })
        }
      } catch (e) {
        erreurs.push({ client: clientNom, raison: e?.message || 'envoi échoué' })
      }
    }
  }

  // `mode` remonte jusqu'à l'écran : sans lui, on clique « Diffuser », on lit « 3 envoyés »
  // et on croit que le client a reçu son rapport alors que tout est parti dans la boîte
  // d'essai. Un garde-fou muet est un piège, pas une protection.
  return NextResponse.json({ envoyes, erreurs, total: envoyes.length, mode: modeEnvoi() })
}
