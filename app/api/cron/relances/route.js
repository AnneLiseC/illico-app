// Cron quotidien — 7 automatisations de relance
// Déclenché par Vercel Cron (vercel.json) à 08h00 UTC chaque jour
// Sécurisé par CRON_SECRET en header Authorization
//
// Chaque email est envoyé DEPUIS la boîte de la référente du dossier (@illico-travaux.com).
// Les notifications internes ciblent uniquement la référente concernée.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
// import { sendEmail } from '../../../lib/email' // TODO: activer après config HEXAOM (admin consent Azure)
const sendEmail = async ({ to, subject }) => { /* emails désactivés temporairement */ }

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function today() { return new Date().toISOString().slice(0, 10) }

function dateInDays(n) {
  const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10)
}

function prenomNom(row) {
  if (!row) return ''
  const p = row.prenom ? row.prenom.charAt(0).toUpperCase() + row.prenom.slice(1).toLowerCase() : ''
  return [p, row.nom].filter(Boolean).join(' ')
}

function montantFr(val) {
  return Number(val || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function roleLabel(role) {
  return role === 'admin' ? "Responsable d'Agence" : "Assistante à Maîtrise d'Ouvrage"
}

// Salutation client : "Mme Guerteau, M. Eppinger" ou "M. Chambonnière"
function salutationClient(client) {
  const parts = []
  if (client.civilite || client.nom) {
    parts.push(`${client.civilite ? client.civilite + ' ' : ''}${client.nom || ''}`.trim())
  }
  if (client.nom2) parts.push(client.nom2)
  return parts.join(', ')
}

// Noms pour référence de virement : "GUERTEAU-EPPINGER" ou "CHAMBONNIERE"
function nomsVirement(client) {
  return [client.nom, client.nom2].filter(Boolean).map(n => n.toUpperCase()).join('-')
}

function signatureHtml(referente) {
  if (!referente) return '<p><em>illiCO travaux</em></p>'
  return `
    <p style="margin-top:24px; font-size:13px; line-height:1.6;">
      <strong>${prenomNom(referente).toUpperCase()}</strong><br>
      ${roleLabel(referente.role)}<br>
      ${referente.telephone ? referente.telephone + '<br>' : ''}
      ${referente.email || ''}
    </p>
  `
}

async function notifyUser(userId, { type, titre, message, dossier_id }) {
  if (!userId) return
  await supabase.from('notifications').insert({ user_id: userId, type, titre, message, dossier_id: dossier_id || null })
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
  const agenceVille = process.env.AGENCY_CITY || 'Martigues'

  // ─────────────────────────────────────────────────────────────
  // 1. Devis artisan non reçu — deadline dans 7 jours
  // ─────────────────────────────────────────────────────────────
  try {
    const { data: devis } = await supabase
      .from('devis_artisans')
      .select(`
        id, dossier_id, date_limite,
        artisans(email, entreprise, nom, prenom),
        dossiers(reference, profiles!referente_id(email, prenom, nom, telephone, role))
      `)
      .is('date_reception', null)
      .not('statut', 'in', '("accepte","refuse")')
      .eq('date_limite', in7)

    for (const d of devis || []) {
      const artisan = d.artisans
      if (!artisan?.email) continue
      const ref = d.dossiers?.reference || d.dossier_id
      const referente = d.dossiers?.profiles
      await sendEmail({
        to: artisan.email,
        from: referente?.email,
        subject: `Rappel — devis à remettre avant le ${new Date(d.date_limite).toLocaleDateString('fr-FR')}`,
        html: `
          <p>Bonjour ${prenomNom(artisan) || artisan.entreprise},</p>
          <p>Nous vous rappelons que votre devis pour le dossier <strong>${ref}</strong> doit nous être transmis
          au plus tard le <strong>${new Date(d.date_limite).toLocaleDateString('fr-FR')}</strong>.</p>
          <p>Merci de nous l'adresser dès que possible.</p>
          <p>Cordialement,</p>
          ${signatureHtml(referente)}
        `,
      })
      log.push(`[1] Email artisan ${artisan.email} — dossier ${ref}`)
    }
  } catch (e) { errors.push(`[1] ${e.message}`) }

  // ─────────────────────────────────────────────────────────────
  // 2. Deadline devis dossier dans 7 jours — notification interne
  //    → uniquement la référente du dossier
  // ─────────────────────────────────────────────────────────────
  try {
    const { data: dossiers } = await supabase
      .from('dossiers')
      .select('id, reference, date_limite_devis, referente_id')
      .eq('date_limite_devis', in7)
      .not('statut', 'in', '("annule","termine")')

    for (const d of dossiers || []) {
      if (!d.referente_id) continue
      await notifyUser(d.referente_id, {
        type: 'deadline_devis',
        titre: 'Deadline devis dans 7 jours',
        message: `Dossier ${d.reference} — deadline devis le ${new Date(d.date_limite_devis).toLocaleDateString('fr-FR')}`,
        dossier_id: d.id,
      })
      log.push(`[2] Notification référente — dossier ${d.reference}`)
    }
  } catch (e) { errors.push(`[2] ${e.message}`) }

  // ─────────────────────────────────────────────────────────────
  // 3. Demande d'acompte — UN email par dossier, liste complète
  //    artisans + AMO le cas échéant
  // ─────────────────────────────────────────────────────────────
  try {
    // Acomptes artisans dus aujourd'hui
    const { data: lignesArtisans } = await supabase
      .from('suivi_financier')
      .select(`
        id, dossier_id, montant_ttc, artisan_id,
        artisans(id, entreprise, sans_royalties),
        dossiers(id, reference, referente_id,
          profiles!referente_id(email, prenom, nom, telephone, role),
          clients(email, nom, prenom, civilite, nom2, prenom2, adresse_chantier))
      `)
      .eq('type_echeance', 'acompte_artisan')
      .eq('statut_client', 'en_attente')
      .eq('date_echeance', todayStr)

    // Acomptes AMO/courtage dus aujourd'hui (même email que les artisans)
    const { data: lignesAmo } = await supabase
      .from('suivi_financier')
      .select('dossier_id, montant_ttc, type_echeance')
      .in('type_echeance', ['acompte_amo', 'honoraires_courtage'])
      .eq('statut_client', 'en_attente')
      .eq('date_echeance', todayStr)

    const amoParDossier = {}
    for (const a of lignesAmo || []) {
      amoParDossier[a.dossier_id] = (amoParDossier[a.dossier_id] || 0) + Number(a.montant_ttc || 0)
    }

    // Regrouper les artisans par dossier
    const dossiersMap = {}
    for (const ligne of lignesArtisans || []) {
      const did = ligne.dossier_id
      if (!dossiersMap[did]) {
        dossiersMap[did] = {
          dossier: ligne.dossiers,
          client: ligne.dossiers?.clients,
          referente: ligne.dossiers?.profiles,
          artisans: [],
        }
      }
      dossiersMap[did].artisans.push({
        artisan_id: ligne.artisan_id,
        entreprise: ligne.artisans?.entreprise,
        montant_ttc: ligne.montant_ttc,
        sans_royalties: ligne.artisans?.sans_royalties,
      })
    }

    for (const [dossierId, data] of Object.entries(dossiersMap)) {
      const { client, referente, dossier, artisans } = data
      if (!client?.email) continue

      const ref = dossier?.reference || dossierId

      // Trier les artisans par date_debut d'intervention
      const { data: interventions } = await supabase
        .from('interventions_artisans')
        .select('artisan_id, date_debut')
        .eq('dossier_id', dossierId)
        .order('date_debut', { ascending: true })

      const dateDebutParArtisan = {}
      for (const i of interventions || []) {
        if (!dateDebutParArtisan[i.artisan_id]) dateDebutParArtisan[i.artisan_id] = i.date_debut
      }
      artisans.sort((a, b) => {
        const da = dateDebutParArtisan[a.artisan_id] || '9999'
        const db = dateDebutParArtisan[b.artisan_id] || '9999'
        return da < db ? -1 : da > db ? 1 : 0
      })

      // Artisans PROTECTACOMPTE vs paiement direct
      const artisansProtect = artisans.filter(a => !a.sans_royalties)
      const artisansDirect = artisans.filter(a => a.sans_royalties)

      const clientNoms = nomsVirement(client)
      const salutation = salutationClient(client)
      const montantAmo = amoParDossier[dossierId]

      // Construction du HTML
      const rowsHtml = artisansProtect.map(a => `
        <tr>
          <td style="padding:5px 16px 5px 0; font-weight:500; min-width:200px;">${a.entreprise || '—'}</td>
          <td style="padding:5px 0; text-align:right; white-space:nowrap;">${montantFr(a.montant_ttc)}</td>
        </tr>
      `).join('')

      let html = `<p>Bonjour ${salutation},</p><br>`

      if (artisansProtect.length > 0) {
        html += `
          <p>Vous trouverez ci-dessous les informations relatives aux acomptes à régler.</p>
          <p>Les acomptes artisans sont à effectuer sur le compte sécurisé <strong>PROTECTACOMPTE</strong>.</p>
          <br>
          <table style="border-collapse:collapse; font-family:sans-serif; font-size:14px;">
            ${rowsHtml}
          </table>
          <br>
          <p>Les artisans sont classés par ordre d'intervention.</p>
          <br>
          <p>Vous avez la possibilité d'effectuer les virements un par un, en respectant l'intitulé suivant :<br>
          <strong>NOM DE L'ENTREPRISE – ${clientNoms} – ${agenceVille.toUpperCase()}</strong>.<br>
          Merci de bien vouloir me transmettre une capture d'écran ou l'avis de virement correspondant à chacun.</p>
        `
      }

      // Artisans à paiement direct (sans_royalties)
      for (const a of artisansDirect) {
        html += `
          <br>
          <p>Concernant <strong>${a.entreprise}</strong>, merci d'effectuer le règlement de
          <strong>${montantFr(a.montant_ttc)}</strong> directement sur le compte <strong>${a.entreprise}</strong>.
          Merci de bien vouloir me transmettre une capture d'écran ou l'avis de virement correspondant.</p>
        `
      }

      // Acompte AMO/courtage
      if (montantAmo) {
        html += `
          <br>
          <p>Au sujet de ma prestation, merci de réaliser un acompte de <strong>${montantFr(montantAmo)}</strong>.
          Merci de me faire parvenir une capture d'écran ou l'avis de virement lorsque cela sera réalisé.</p>
        `
      }

      html += `
        <br>
        <p>Je reste bien entendu à votre disposition si vous avez la moindre question.</p>
        <p>Bien cordialement,</p>
        ${signatureHtml(referente)}
      `

      await sendEmail({
        to: client.email,
        from: referente?.email,
        subject: `Demande d'acompte — dossier ${ref}`,
        html,
      })
      log.push(`[3] Email client ${client.email} — acompte dossier ${ref} (${artisans.length} artisan(s), de ${referente?.email})`)
    }
  } catch (e) { errors.push(`[3] ${e.message}`) }

  // ─────────────────────────────────────────────────────────────
  // 4. Facture finale non réglée — relance 7 jours après échéance
  // ─────────────────────────────────────────────────────────────
  try {
    const { data: factures } = await supabase
      .from('suivi_financier')
      .select(`
        id, dossier_id, montant_ttc, date_echeance,
        dossiers(reference, profiles!referente_id(email, prenom, nom, telephone, role),
          clients(email, nom, prenom, civilite, nom2))
      `)
      .eq('type_echeance', 'facture_finale')
      .eq('statut_client', 'en_attente')
      .lte('date_echeance', dateInDays(-7))

    for (const f of factures || []) {
      const client = f.dossiers?.clients
      if (!client?.email) continue
      const ref = f.dossiers?.reference || f.dossier_id
      const referente = f.dossiers?.profiles
      const echeance = new Date(f.date_echeance).toLocaleDateString('fr-FR')
      await sendEmail({
        to: client.email,
        from: referente?.email,
        subject: `Rappel — facture finale en attente de règlement — dossier ${ref}`,
        html: `
          <p>Bonjour ${salutationClient(client)},</p>
          <p>Sauf erreur de notre part, votre facture finale${f.montant_ttc ? ` de <strong>${montantFr(f.montant_ttc)}</strong>` : ''}
          relative au dossier <strong>${ref}</strong>, dont l'échéance était le <strong>${echeance}</strong>, n'a pas encore été réglée.</p>
          <p>Nous vous remercions de bien vouloir procéder au règlement dans les meilleurs délais.</p>
          <p>Cordialement,</p>
          ${signatureHtml(referente)}
        `,
      })
      log.push(`[4] Email client ${client.email} — facture finale dossier ${ref}`)
    }
  } catch (e) { errors.push(`[4] ${e.message}`) }

  // ─────────────────────────────────────────────────────────────
  // 5. Rappel RDV client — J-1
  // ─────────────────────────────────────────────────────────────
  try {
    const { data: rdvs } = await supabase
      .from('rendez_vous')
      .select(`
        id, dossier_id, type_rdv, date_heure,
        dossiers(reference, profiles!referente_id(email, prenom, nom, telephone, role),
          clients(email, nom, prenom, civilite, nom2, adresse_chantier))
      `)
      .gte('date_heure', `${tomorrow}T00:00:00`)
      .lte('date_heure', `${tomorrow}T23:59:59`)

    for (const rdv of rdvs || []) {
      const client = rdv.dossiers?.clients
      if (!client?.email) continue
      const ref = rdv.dossiers?.reference || rdv.dossier_id
      const referente = rdv.dossiers?.profiles
      const heureRdv = new Date(rdv.date_heure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      const dateRdv = new Date(rdv.date_heure).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      await sendEmail({
        to: client.email,
        from: referente?.email,
        subject: `Rappel de votre rendez-vous demain — dossier ${ref}`,
        html: `
          <p>Bonjour ${salutationClient(client)},</p>
          <p>Nous vous rappelons votre rendez-vous <strong>${rdv.type_rdv || ''}</strong> prévu :</p>
          <p>📅 <strong>${dateRdv} à ${heureRdv}</strong>${client.adresse_chantier ? `<br>📍 ${client.adresse_chantier}` : ''}</p>
          <p>En cas d'empêchement, merci de nous contacter dès que possible.</p>
          <p>Cordialement,</p>
          ${signatureHtml(referente)}
        `,
      })
      log.push(`[5] Email client ${client.email} — RDV dossier ${ref}`)
    }
  } catch (e) { errors.push(`[5] ${e.message}`) }

  // ─────────────────────────────────────────────────────────────
  // 6. Décennale artisan expirante dans 30 jours
  //    → boîte générale (pas rattaché à un dossier précis)
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
  } catch (e) { errors.push(`[6] ${e.message}`) }

  // ─────────────────────────────────────────────────────────────
  // 7. Nouveau compte rendu validé — email client AMO
  // ─────────────────────────────────────────────────────────────
  try {
    const { data: crs } = await supabase
      .from('comptes_rendus')
      .select(`
        id, dossier_id, type_visite, date_visite,
        dossiers(reference, profiles!referente_id(email, prenom, nom, telephone, role),
          clients(email, nom, prenom, civilite, nom2))
      `)
      .eq('valide', true)
      .gte('created_at', `${yesterday}T00:00:00`)
      .lt('created_at', `${todayStr}T00:00:00`)

    for (const cr of crs || []) {
      const client = cr.dossiers?.clients
      if (!client?.email) continue
      const ref = cr.dossiers?.reference || cr.dossier_id
      const referente = cr.dossiers?.profiles
      const dateVisite = cr.date_visite ? new Date(cr.date_visite).toLocaleDateString('fr-FR') : ''
      await sendEmail({
        to: client.email,
        from: referente?.email,
        subject: `Votre compte rendu de visite est disponible — dossier ${ref}`,
        html: `
          <p>Bonjour ${salutationClient(client)},</p>
          <p>Le compte rendu de ${cr.type_visite || 'visite'}${dateVisite ? ` du ${dateVisite}` : ''}
          relatif à votre dossier <strong>${ref}</strong> est désormais disponible.</p>
          <p>Vous pouvez le consulter en vous connectant à votre espace client.</p>
          <p>Cordialement,</p>
          ${signatureHtml(referente)}
        `,
      })
      log.push(`[7] Email client ${client.email} — CR dossier ${ref}`)
    }
  } catch (e) { errors.push(`[7] ${e.message}`) }

  return NextResponse.json({ ok: true, date: todayStr, sent: log, errors: errors.length ? errors : undefined })
}
