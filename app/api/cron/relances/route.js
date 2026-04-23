// Cron quotidien — 7 automatisations de relance
// Déclenché par Vercel Cron (vercel.json) à 08h00 UTC chaque jour
// Sécurisé par CRON_SECRET en header Authorization

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { sendEmail } from '../../../lib/email'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function today() {
  return new Date().toISOString().slice(0, 10)
}

function dateInDays(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function prenomNom(row) {
  if (!row) return ''
  const p = row.prenom ? row.prenom.charAt(0).toUpperCase() + row.prenom.slice(1).toLowerCase() : ''
  return [p, row.nom].filter(Boolean).join(' ')
}

async function notifyInterne(userIds, { type, titre, message, dossier_id }) {
  if (!userIds.length) return
  const rows = userIds.map(uid => ({ user_id: uid, type, titre, message, dossier_id: dossier_id || null }))
  await supabase.from('notifications').insert(rows)
}

export async function GET(req) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const log = []
  const errors = []

  const todayStr = today()
  const in7 = dateInDays(7)
  const in30 = dateInDays(30)
  const yesterday = dateInDays(-1)
  const tomorrow = dateInDays(1)

  // Charger les profils admin/agentes pour les notifications internes
  const { data: staffProfiles } = await supabase
    .from('profiles')
    .select('id, email, role, prenom, nom')
    .in('role', ['admin', 'agente'])

  const staffIds = (staffProfiles || []).map(p => p.id)

  // ─────────────────────────────────────────────────────────────
  // 1. Devis artisan non reçu — deadline dans 7 jours
  // ─────────────────────────────────────────────────────────────
  try {
    const { data: devis } = await supabase
      .from('devis_artisans')
      .select('id, dossier_id, artisan_id, date_limite, artisans(email, entreprise, prenom, nom), dossiers(reference)')
      .is('date_reception', null)
      .not('statut', 'in', '("accepte","refuse")')
      .eq('date_limite', in7)

    for (const d of devis || []) {
      const artisan = d.artisans
      if (!artisan?.email) continue
      const dossierRef = d.dossiers?.reference || d.dossier_id
      await sendEmail({
        to: artisan.email,
        subject: `Rappel — devis à remettre avant le ${new Date(d.date_limite).toLocaleDateString('fr-FR')}`,
        html: `
          <p>Bonjour ${prenomNom(artisan) || artisan.entreprise},</p>
          <p>Nous vous rappelons que votre devis pour le dossier <strong>${dossierRef}</strong> doit nous être transmis
          au plus tard le <strong>${new Date(d.date_limite).toLocaleDateString('fr-FR')}</strong>.</p>
          <p>Merci de nous l'adresser dès que possible.</p>
          <p>Cordialement,<br>L'équipe illiCO travaux</p>
        `,
      })
      log.push(`[1] Email artisan ${artisan.email} — dossier ${dossierRef}`)
    }
  } catch (e) {
    errors.push(`[1] ${e.message}`)
  }

  // ─────────────────────────────────────────────────────────────
  // 2. Alerte deadline devis dossier dans 7 jours — notification interne
  // ─────────────────────────────────────────────────────────────
  try {
    const { data: dossiers } = await supabase
      .from('dossiers')
      .select('id, reference, date_limite_devis')
      .eq('date_limite_devis', in7)
      .not('statut', 'in', '("annule","termine")')

    for (const d of dossiers || []) {
      const msg = `Dossier ${d.reference} — deadline devis le ${new Date(d.date_limite_devis).toLocaleDateString('fr-FR')}`
      await notifyInterne(staffIds, {
        type: 'deadline_devis',
        titre: 'Deadline devis dans 7 jours',
        message: msg,
        dossier_id: d.id,
      })
      log.push(`[2] Notification interne — dossier ${d.reference}`)
    }
  } catch (e) {
    errors.push(`[2] ${e.message}`)
  }

  // ─────────────────────────────────────────────────────────────
  // 3. Demande d'acompte — échéance aujourd'hui, non réglée
  // ─────────────────────────────────────────────────────────────
  try {
    const { data: echeances } = await supabase
      .from('suivi_financier')
      .select('id, dossier_id, type_echeance, montant_ttc, date_echeance, dossiers(reference, clients(email, nom, prenom, civilite))')
      .in('type_echeance', ['acompte_amo', 'acompte_artisan'])
      .eq('statut_client', 'en_attente')
      .eq('date_echeance', todayStr)

    for (const e of echeances || []) {
      const client = e.dossiers?.clients
      if (!client?.email) continue
      const ref = e.dossiers?.reference || e.dossier_id
      const montant = e.montant_ttc ? `${Number(e.montant_ttc).toLocaleString('fr-FR')} € TTC` : ''
      const civilite = client.civilite === 'M.' ? 'M.' : client.civilite === 'Mme' ? 'Mme' : ''
      await sendEmail({
        to: client.email,
        subject: `Demande d'acompte — dossier ${ref}`,
        html: `
          <p>Bonjour ${civilite} ${prenomNom(client)},</p>
          <p>Dans le cadre de votre projet <strong>${ref}</strong>, nous vous adressons notre demande d'acompte${montant ? ` d'un montant de <strong>${montant}</strong>` : ''}.</p>
          <p>Merci de procéder au règlement selon les modalités convenues.</p>
          <p>Pour toute question, n'hésitez pas à nous contacter.</p>
          <p>Cordialement,<br>L'équipe illiCO travaux</p>
        `,
      })
      log.push(`[3] Email client ${client.email} — acompte dossier ${ref}`)
    }
  } catch (e) {
    errors.push(`[3] ${e.message}`)
  }

  // ─────────────────────────────────────────────────────────────
  // 4. Facture finale non réglée — relance 7 jours après échéance
  // ─────────────────────────────────────────────────────────────
  try {
    const { data: factures } = await supabase
      .from('suivi_financier')
      .select('id, dossier_id, montant_ttc, date_echeance, dossiers(reference, clients(email, nom, prenom, civilite))')
      .eq('type_echeance', 'facture_finale')
      .eq('statut_client', 'en_attente')
      .lte('date_echeance', dateInDays(-7))

    for (const f of factures || []) {
      const client = f.dossiers?.clients
      if (!client?.email) continue
      const ref = f.dossiers?.reference || f.dossier_id
      const montant = f.montant_ttc ? `${Number(f.montant_ttc).toLocaleString('fr-FR')} € TTC` : ''
      const echeance = new Date(f.date_echeance).toLocaleDateString('fr-FR')
      const civilite = client.civilite === 'M.' ? 'M.' : client.civilite === 'Mme' ? 'Mme' : ''
      await sendEmail({
        to: client.email,
        subject: `Rappel — facture finale en attente de règlement — dossier ${ref}`,
        html: `
          <p>Bonjour ${civilite} ${prenomNom(client)},</p>
          <p>Sauf erreur de notre part, votre facture finale${montant ? ` de <strong>${montant}</strong>` : ''}
          relative au dossier <strong>${ref}</strong>, dont l'échéance était le <strong>${echeance}</strong>, n'a pas encore été réglée.</p>
          <p>Nous vous remercions de bien vouloir procéder au règlement dans les meilleurs délais.</p>
          <p>Cordialement,<br>L'équipe illiCO travaux</p>
        `,
      })
      log.push(`[4] Email client ${client.email} — facture finale dossier ${ref}`)
    }
  } catch (e) {
    errors.push(`[4] ${e.message}`)
  }

  // ─────────────────────────────────────────────────────────────
  // 5. Rappel RDV client — J-1
  // ─────────────────────────────────────────────────────────────
  try {
    const tomorrowStart = `${tomorrow}T00:00:00`
    const tomorrowEnd = `${tomorrow}T23:59:59`

    const { data: rdvs } = await supabase
      .from('rendez_vous')
      .select('id, dossier_id, type_rdv, date_heure, duree_minutes, dossiers(reference, clients(email, nom, prenom, civilite, adresse_chantier))')
      .gte('date_heure', tomorrowStart)
      .lte('date_heure', tomorrowEnd)

    for (const rdv of rdvs || []) {
      const client = rdv.dossiers?.clients
      if (!client?.email) continue
      const ref = rdv.dossiers?.reference || rdv.dossier_id
      const heureRdv = new Date(rdv.date_heure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      const dateRdv = new Date(rdv.date_heure).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      const civilite = client.civilite === 'M.' ? 'M.' : client.civilite === 'Mme' ? 'Mme' : ''
      await sendEmail({
        to: client.email,
        subject: `Rappel de votre rendez-vous demain — dossier ${ref}`,
        html: `
          <p>Bonjour ${civilite} ${prenomNom(client)},</p>
          <p>Nous vous rappelons votre rendez-vous <strong>${rdv.type_rdv || ''}</strong> prévu :</p>
          <p>📅 <strong>${dateRdv} à ${heureRdv}</strong>${client.adresse_chantier ? `<br>📍 ${client.adresse_chantier}` : ''}</p>
          <p>En cas d'empêchement, merci de nous contacter dès que possible.</p>
          <p>Cordialement,<br>L'équipe illiCO travaux</p>
        `,
      })
      log.push(`[5] Email client ${client.email} — RDV dossier ${ref} le ${dateRdv}`)
    }
  } catch (e) {
    errors.push(`[5] ${e.message}`)
  }

  // ─────────────────────────────────────────────────────────────
  // 6. Décennale artisan expirante dans 30 jours
  // ─────────────────────────────────────────────────────────────
  try {
    const { data: artisans } = await supabase
      .from('artisans')
      .select('id, email, entreprise, nom, prenom, decennale_expiration')
      .eq('decennale_expiration', in30)

    for (const a of artisans || []) {
      if (!a.email) continue
      const expDate = new Date(a.decennale_expiration).toLocaleDateString('fr-FR')
      await sendEmail({
        to: a.email,
        subject: `Votre assurance décennale expire dans 30 jours`,
        html: `
          <p>Bonjour ${prenomNom(a) || a.entreprise},</p>
          <p>Nous vous informons que votre assurance décennale arrive à expiration le <strong>${expDate}</strong>.</p>
          <p>Afin de maintenir notre partenariat, merci de renouveler votre assurance et de nous transmettre
          la nouvelle attestation avant cette date.</p>
          <p>Cordialement,<br>L'équipe illiCO travaux</p>
        `,
      })
      log.push(`[6] Email artisan ${a.email} — décennale expire ${expDate}`)
    }
  } catch (e) {
    errors.push(`[6] ${e.message}`)
  }

  // ─────────────────────────────────────────────────────────────
  // 7. Nouveau compte rendu validé — email client AMO
  // ─────────────────────────────────────────────────────────────
  try {
    const { data: crs } = await supabase
      .from('comptes_rendus')
      .select('id, dossier_id, type_visite, date_visite, dossiers(reference, clients(email, nom, prenom, civilite))')
      .eq('valide', true)
      .gte('created_at', `${yesterday}T00:00:00`)
      .lt('created_at', `${todayStr}T00:00:00`)

    for (const cr of crs || []) {
      const client = cr.dossiers?.clients
      if (!client?.email) continue
      const ref = cr.dossiers?.reference || cr.dossier_id
      const dateVisite = cr.date_visite ? new Date(cr.date_visite).toLocaleDateString('fr-FR') : ''
      const civilite = client.civilite === 'M.' ? 'M.' : client.civilite === 'Mme' ? 'Mme' : ''
      await sendEmail({
        to: client.email,
        subject: `Votre compte rendu de visite est disponible — dossier ${ref}`,
        html: `
          <p>Bonjour ${civilite} ${prenomNom(client)},</p>
          <p>Le compte rendu de ${cr.type_visite || 'visite'}${dateVisite ? ` du ${dateVisite}` : ''}
          relatif à votre dossier <strong>${ref}</strong> est désormais disponible.</p>
          <p>Vous pouvez le consulter en vous connectant à votre espace client.</p>
          <p>Cordialement,<br>L'équipe illiCO travaux</p>
        `,
      })
      log.push(`[7] Email client ${client.email} — CR dossier ${ref}`)
    }
  } catch (e) {
    errors.push(`[7] ${e.message}`)
  }

  // ─────────────────────────────────────────────────────────────

  return NextResponse.json({
    ok: true,
    date: todayStr,
    sent: log,
    errors: errors.length ? errors : undefined,
  })
}
