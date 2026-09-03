// Cron quotidien — 7 automatisations de relance
// Déclenché par Vercel Cron (vercel.json) à 08h00 UTC chaque jour
// Sécurisé par CRON_SECRET en header Authorization
//
// EXPÉDITEUR — l'ancien commentaire annonçait un envoi « depuis la boîte de la référente ».
// C'est impossible : Graph envoie depuis la boîte connectée et ne sait pas écrire au nom
// d'un autre. Un essai du 03/09 l'a confirmé côté illiCO — le locataire Entra refuse à ses
// utilisateurs de connecter leur boîte sans approbation d'un administrateur. On passe donc
// par `replyTo` : l'expéditeur technique est la boîte BATILIS, la RÉPONSE part chez la
// bonne personne. Voir docs/cadrage_relances_notifications.md § 3 bis.
//
// GARDE-FOU — le mode ESSAI est le DÉFAUT (lib/relances-envoi.js) : aucun mail ne part
// vers un vrai destinataire tant que RELANCES_ENVOI=reel n'est pas posé. Un oubli de
// configuration laisse le robinet fermé, il ne peut pas l'ouvrir.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { checkBearerSecret } from '../../../lib/http-auth'
import { sendEmail } from '../../../lib/email'
import { preparerEnvoi, modeEnvoi } from '../../../lib/relances-envoi'

let _supabaseAdmin
function getSupabaseAdmin() {
  if (!_supabaseAdmin) _supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _supabaseAdmin
}

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
  await getSupabaseAdmin().from('notifications').insert({ user_id: userId, type, titre, message, dossier_id: dossier_id || null })
}

// Tous les utilisateurs (admin + agentes) d'une société — pour les notifications
// qui concernent tout le monde, comme l'expiration d'une décennale.
async function membresSociete(societeId) {
  if (!societeId) return []
  const { data } = await getSupabaseAdmin()
    .from('profiles').select('id').eq('societe_id', societeId).in('role', ['admin', 'agente'])
  return (data || []).map(p => p.id)
}

// Envoi passé par le garde-fou : en mode essai, tout part vers l'adresse d'essai avec
// l'objet préfixé du destinataire réel. Renvoie une ligne de journal (jamais d'exception
// pour un simple « non envoyé » : le mode essai sans adresse n'est pas une erreur).
async function envoyer(log, tag, { to, subject, html, replyTo }) {
  const plan = preparerEnvoi({ to, subject })
  if (!plan.envoyer) {
    log.push(`[${tag}] NON ENVOYÉ (${plan.raison}) — destinataire réel ${plan.reel || '—'}`)
    return false
  }
  await sendEmail({ to: plan.to, subject: plan.subject, html, replyTo: replyTo || undefined })
  log.push(`[${tag}] ${plan.to}${plan.to !== plan.reel ? ` (essai, réel ${plan.reel})` : ''}`)
  return true
}

export async function GET(req) {
  if (!checkBearerSecret(req, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const log = []
  const errors = []
  const todayStr = today()
  const in7 = dateInDays(7)
  const in14 = dateInDays(14)   // décennale : mail à l'artisan (décision du 03/09)
  const in15 = dateInDays(15)   // décennale : notification interne, la veille du mail
  const tomorrow = dateInDays(1)

  // ─────────────────────────────────────────────────────────────
  // 1. Devis artisan non reçu — deadline dans 7 jours
  // ─────────────────────────────────────────────────────────────
  try {
    const { data: devis } = await getSupabaseAdmin()
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
      await envoyer(log, '1', {
        to: artisan.email,
        replyTo: referente?.email,
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
    }
  } catch (e) { errors.push(`[1] ${e.message}`) }

  // ─────────────────────────────────────────────────────────────
  // 2. Deadline devis dossier dans 7 jours — notification interne
  //    → uniquement la référente du dossier
  // ─────────────────────────────────────────────────────────────
  try {
    const { data: dossiers } = await getSupabaseAdmin()
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
  //
  //    DÉCLENCHEUR (décision du 03/09) : J+5 après la DATE DE SIGNATURE du devis, et
  //    non plus la date d'échéance de la ligne de suivi. La signature est le fait
  //    métier ; l'échéance était une donnée saisie à la main, donc absente la plupart
  //    du temps.
  //
  //    CONTENU : uniquement les acomptes NON RÉGLÉS. Une case déjà cochée ne figure
  //    pas dans le mail — on ne réclame pas ce qui est payé. Si tout est réglé, aucun
  //    mail ne part : il n'y a rien à demander.
  // ─────────────────────────────────────────────────────────────
  try {
    const { data: devisSignes } = await getSupabaseAdmin()
      .from('devis_artisans')
      .select('id, dossier_id')
      .eq('statut', 'accepte')
      .eq('date_signature', dateInDays(-5))

    const dossiersConcernes = [...new Set((devisSignes || []).map(d => d.dossier_id).filter(Boolean))]

    for (const dossierId of dossiersConcernes) {
      const { data: dossier } = await getSupabaseAdmin()
        .from('dossiers')
        .select(`
          id, reference, agences(ville),
          profiles!referente_id(email, prenom, nom, telephone, role),
          clients(email, nom, prenom, civilite, nom2, prenom2)
        `)
        .eq('id', dossierId).maybeSingle()

      const client = dossier?.clients
      const referente = dossier?.profiles
      if (!client?.email) continue

      // Acomptes artisans encore dus sur CE dossier (statut client ≠ réglé).
      const { data: lignesArtisans } = await getSupabaseAdmin()
        .from('suivi_financier')
        .select('id, montant_ttc, artisan_id, artisans(id, entreprise, paiement_direct)')
        .eq('dossier_id', dossierId)
        .eq('type_echeance', 'acompte_artisan')
        .eq('statut_client', 'en_attente')

      // Acompte AMO / courtage encore dû sur CE dossier (même mail que les artisans).
      const { data: lignesAmo } = await getSupabaseAdmin()
        .from('suivi_financier')
        .select('montant_ttc, type_echeance')
        .eq('dossier_id', dossierId)
        .in('type_echeance', ['acompte_amo', 'honoraires_courtage'])
        .eq('statut_client', 'en_attente')

      const artisans = (lignesArtisans || []).map(ligne => ({
        artisan_id: ligne.artisan_id,
        entreprise: ligne.artisans?.entreprise,
        montant_ttc: ligne.montant_ttc,
        paiement_direct: ligne.artisans?.paiement_direct,
      }))
      const montantAmoDu = (lignesAmo || []).reduce((s, a) => s + Number(a.montant_ttc || 0), 0)

      const ref = dossier?.reference || dossierId

      // Tout est déjà encaissé → rien à réclamer, pas de mail.
      if (artisans.length === 0 && !montantAmoDu) {
        log.push(`[3] Dossier ${ref} — tous les acomptes réglés, aucun mail`)
        continue
      }

      // Trier les artisans par date_debut d'intervention
      const { data: interventions } = await getSupabaseAdmin()
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
      const artisansProtect = artisans.filter(a => !a.paiement_direct)
      const artisansDirect = artisans.filter(a => a.paiement_direct)

      const clientNoms = nomsVirement(client)
      const salutation = salutationClient(client)
      const montantAmo = montantAmoDu
      const agenceVille = dossier?.agences?.ville || ''

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
          <strong>NOM DE L'ENTREPRISE – ${clientNoms}${agenceVille ? ` – ${agenceVille.toUpperCase()}` : ''}</strong>.<br>
          Merci de bien vouloir me transmettre une capture d'écran ou l'avis de virement correspondant à chacun.</p>
        `
      }

      // Artisans à paiement direct
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

      await envoyer(log, '3', {
        to: client.email,
        replyTo: referente?.email,
        subject: `Demande d'acompte — dossier ${ref}`,
        html,
      })
    }
  } catch (e) { errors.push(`[3] ${e.message}`) }

  // ─────────────────────────────────────────────────────────────
  // 3 bis. Garde-fou de la demande d'acompte — notification interne à J+4
  //
  //   Le mail de demande d'acompte part à J+5 après signature. La veille, on vérifie
  //   que le suivi financier est COMPLET : chaque devis signé du dossier doit avoir sa
  //   ligne d'acompte. S'il en manque une, le mail listerait un artisan de moins que
  //   la réalité — c'est exactement l'oubli de saisie qu'on veut attraper.
  //
  //   Si le suivi est complet : AUCUNE notification. On ne prévient pas que tout va
  //   bien (décision du 03/09). Et dans les deux cas, le mail part le lendemain.
  // ─────────────────────────────────────────────────────────────
  try {
    const { data: devisVeille } = await getSupabaseAdmin()
      .from('devis_artisans')
      .select('id, dossier_id')
      .eq('statut', 'accepte')
      .eq('date_signature', dateInDays(-4))

    const dossiersVeille = [...new Set((devisVeille || []).map(d => d.dossier_id).filter(Boolean))]

    for (const dossierId of dossiersVeille) {
      // TOUS les devis signés du dossier, pas seulement ceux signés la veille :
      // un suivi incomplet peut porter sur un devis signé le mois dernier.
      const [{ data: tousDevis }, { data: lignes }, { data: dossier }] = await Promise.all([
        getSupabaseAdmin().from('devis_artisans').select('id').eq('dossier_id', dossierId).eq('statut', 'accepte'),
        getSupabaseAdmin().from('suivi_financier').select('devis_id, artisan_id')
          .eq('dossier_id', dossierId).eq('type_echeance', 'acompte_artisan'),
        getSupabaseAdmin().from('dossiers').select('id, reference, referente_id, clients(nom, prenom)').eq('id', dossierId).maybeSingle(),
      ])

      const nbDevis = (tousDevis || []).length
      const nbLignes = (lignes || []).length
      if (nbLignes >= nbDevis) continue // suivi complet → silence

      if (!dossier?.referente_id) continue
      const nomClient = [dossier?.clients?.prenom, dossier?.clients?.nom].filter(Boolean).join(' ') || dossier?.reference
      await notifyUser(dossier.referente_id, {
        type: 'acompte_a_verifier',
        titre: 'Demande d\'acompte demain',
        message: `Le mail pour le paiement de l'acompte de ${nomClient} part demain, vérifie le suivi financier (${nbLignes} ligne(s) d'acompte pour ${nbDevis} devis signé(s)).`,
        dossier_id: dossierId,
      })
      log.push(`[3bis] Notification référente — dossier ${dossier.reference} (${nbLignes}/${nbDevis})`)
    }
  } catch (e) { errors.push(`[3bis] ${e.message}`) }

  // ─────────────────────────────────────────────────────────────
  // 4. Facture finale non réglée — relance 7 jours après échéance
  //
  //    ⏸ MISE DE CÔTÉ (décision du 03/09) : « il faut la réception de la facture ET le
  //    règlement client, pas de date préprogrammée, ça dépend des chantiers ». Le
  //    déclencheur actuel (J+7 après une échéance saisie à la main) ne correspond pas
  //    au métier. Le code reste en place, désactivé par un drapeau explicite plutôt
  //    que supprimé : il sera rebranché après cadrage, pas réécrit.
  // ─────────────────────────────────────────────────────────────
  const FACTURE_FINALE_ACTIVE = false
  try {
    if (!FACTURE_FINALE_ACTIVE) {
      log.push('[4] Relance facture finale — désactivée, en attente de cadrage')
    } else {
    const { data: factures } = await getSupabaseAdmin()
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
      await envoyer(log, '4', {
        to: client.email,
        replyTo: referente?.email,
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
    }
    }
  } catch (e) { errors.push(`[4] ${e.message}`) }

  // ─────────────────────────────────────────────────────────────
  // 5. Rappel RDV — J-1, au client ET à l'artisan DU rendez-vous
  //
  //    « Les artisans concernés » = `rendez_vous.artisan_id`, l'artisan du rendez-vous
  //    lui-même (décision du 03/09) — PAS les intervenants du chantier ce jour-là.
  //    Conséquence assumée : un rendez-vous de suivi sans artisan désigné ne prévient
  //    aucun artisan.
  // ─────────────────────────────────────────────────────────────
  try {
    const { data: rdvs } = await getSupabaseAdmin()
      .from('rendez_vous')
      .select(`
        id, dossier_id, type_rdv, date_heure, artisan_id,
        artisans(email, entreprise, nom, prenom),
        dossiers(reference, adresse_chantier, profiles!referente_id(email, prenom, nom, telephone, role),
          clients(email, nom, prenom, civilite, nom2))
      `)
      .gte('date_heure', `${tomorrow}T00:00:00`)
      .lte('date_heure', `${tomorrow}T23:59:59`)

    for (const rdv of rdvs || []) {
      const client = rdv.dossiers?.clients
      const artisan = rdv.artisans
      const ref = rdv.dossiers?.reference || rdv.dossier_id
      const referente = rdv.dossiers?.profiles
      const heureRdv = new Date(rdv.date_heure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      const dateRdv = new Date(rdv.date_heure).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      const lieuHtml = rdv.dossiers?.adresse_chantier ? `<br>📍 ${rdv.dossiers.adresse_chantier}` : ''

      if (client?.email) {
        await envoyer(log, '5', {
          to: client.email,
          replyTo: referente?.email,
          subject: `Rappel de votre rendez-vous demain — dossier ${ref}`,
          html: `
            <p>Bonjour ${salutationClient(client)},</p>
            <p>Nous vous rappelons votre rendez-vous <strong>${rdv.type_rdv || ''}</strong> prévu :</p>
            <p>📅 <strong>${dateRdv} à ${heureRdv}</strong>${lieuHtml}</p>
            <p>En cas d'empêchement, merci de nous contacter dès que possible.</p>
            <p>Cordialement,</p>
            ${signatureHtml(referente)}
          `,
        })
      }

      if (artisan?.email) {
        await envoyer(log, '5', {
          to: artisan.email,
          replyTo: referente?.email,
          subject: `Rappel — rendez-vous demain sur le dossier ${ref}`,
          html: `
            <p>Bonjour ${prenomNom(artisan) || artisan.entreprise},</p>
            <p>Nous vous rappelons le rendez-vous <strong>${rdv.type_rdv || ''}</strong> prévu :</p>
            <p>📅 <strong>${dateRdv} à ${heureRdv}</strong>${lieuHtml}</p>
            <p>En cas d'empêchement, merci de nous prévenir dès que possible.</p>
            <p>Cordialement,</p>
            ${signatureHtml(referente)}
          `,
        })
      }
    }
  } catch (e) { errors.push(`[5] ${e.message}`) }

  // ─────────────────────────────────────────────────────────────
  // 6. Décennale artisan expirante dans 14 jours (décision du 03/09 — 30 auparavant)
  //    → boîte générale (pas rattaché à un dossier précis)
  // ─────────────────────────────────────────────────────────────
  try {
    const { data: artisans } = await getSupabaseAdmin()
      .from('artisans')
      .select('id, email, entreprise, nom, prenom, decennale_expiration, societe_id')
      .eq('decennale_expiration', in14)

    // L'artisan est société-wide (pas d'agence). On signe au niveau société :
    // admin de la société comme expéditeur + villes de ses agences dans la signature.
    // Cache par société pour éviter de refetcher quand plusieurs artisans la partagent.
    const societeCache = {}
    const chargerSociete = async (societeId) => {
      if (!societeId) return { admin: null, villes: [] }
      if (societeCache[societeId]) return societeCache[societeId]
      let admin = null, villes = []
      try {
        const [{ data: adm }, { data: ags }] = await Promise.all([
          // `limit(1)` SANS ordre laissait Postgres libre de rendre l'un ou l'autre
          // admin quand une société en compte deux : le destinataire de réponse aurait
          // pu changer d'un mois sur l'autre. Ordre explicite = choix stable.
          getSupabaseAdmin().from('profiles').select('email, prenom, nom')
            .eq('role', 'admin').eq('societe_id', societeId)
            .order('created_at', { ascending: true }).limit(1).maybeSingle(),
          getSupabaseAdmin().from('agences').select('ville').eq('societe_id', societeId),
        ])
        admin = adm || null
        villes = (ags || []).map(a => a.ville).filter(Boolean)
      } catch {
        // fetch société en échec → on retombe sur la signature générique
      }
      societeCache[societeId] = { admin, villes }
      return societeCache[societeId]
    }

    for (const a of artisans || []) {
      if (!a.email) continue
      const expDate = new Date(a.decennale_expiration).toLocaleDateString('fr-FR')
      const { admin, villes } = await chargerSociete(a.societe_id)
      const signatureVilles = villes.length ? ` ${villes.join(' - ')}` : ''
      await envoyer(log, '6', {
        to: a.email,
        replyTo: admin?.email,   // la décennale est une affaire de société → le franchisé
        subject: `Votre assurance décennale expire dans 14 jours`,
        html: `
          <p>Bonjour ${prenomNom(a) || a.entreprise},</p>
          <p>Nous vous informons que votre assurance décennale arrive à expiration le <strong>${expDate}</strong>.</p>
          <p>Afin de maintenir notre partenariat, merci de renouveler votre assurance et de nous transmettre
          la nouvelle attestation avant cette date.</p>
          <p>Cordialement,<br>L'équipe illiCO travaux${signatureVilles}</p>
        `,
      })
    }
  } catch (e) { errors.push(`[6] ${e.message}`) }

  // ─────────────────────────────────────────────────────────────
  // 6 bis. Décennale — notification interne la VEILLE du mail (J-15)
  //    Destinataires : TOUT LE MONDE dans la société (décision du 03/09). Un artisan
  //    n'appartient pas à une agente : n'importe qui peut avoir besoin de le savoir
  //    avant de le placer sur un chantier.
  // ─────────────────────────────────────────────────────────────
  try {
    const { data: artisansVeille } = await getSupabaseAdmin()
      .from('artisans')
      .select('id, entreprise, nom, prenom, decennale_expiration, societe_id')
      .eq('decennale_expiration', in15)

    const membresCache = {}
    for (const a of artisansVeille || []) {
      if (!a.societe_id) continue
      if (!membresCache[a.societe_id]) membresCache[a.societe_id] = await membresSociete(a.societe_id)
      const expDate = new Date(a.decennale_expiration).toLocaleDateString('fr-FR')
      const nom = a.entreprise || prenomNom(a) || 'un artisan'
      for (const userId of membresCache[a.societe_id]) {
        await notifyUser(userId, {
          type: 'decennale_expire',
          titre: 'Décennale — relance demain',
          message: `Le mail pour la nouvelle décennale de ${nom} part demain (expiration le ${expDate}).`,
        })
      }
      log.push(`[6bis] Notification société — décennale ${nom} (${membresCache[a.societe_id].length} destinataire(s))`)
    }
  } catch (e) { errors.push(`[6bis] ${e.message}`) }

  // ─────────────────────────────────────────────────────────────
  // 7. Nouveau compte rendu validé — SUPPRIMÉ le 03/09
  //
  //    Un compte rendu n'est pas une relance : c'est un ENVOI, et il a son moment —
  //    le clic sur « Publier au client ». Le mail part donc désormais depuis cette
  //    action, immédiatement, au lieu d'attendre le cron du lendemain matin.
  //    (Et la diffusion du PDF aux artisans garde sa route dédiée,
  //     POST /api/cr/visite-diffuser, déclenchée à part.)
  // ─────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────
  // 8. Désactivation des accès client expirés depuis +14j
  //    → RPC desactiver_acces_expires() (service_role ; garde-fou multi-dossiers
  //      côté SQL). Pas d'email : action base uniquement.
  // ─────────────────────────────────────────────────────────────
  try {
    const { data, error } = await getSupabaseAdmin().rpc('desactiver_acces_expires')
    if (error) throw error
    log.push(`[8] Désactivation accès : ${data ?? 0} compte(s) désactivé(s)`)
  } catch (e) { errors.push(`[8] désactivation accès : ${e.message}`) }

  const enErreur = errors.length > 0
  // `mode` en clair dans la réponse : en lisant le journal Vercel, on sait tout de suite
  // si les mails sont partis pour de vrai ou s'ils ont été redirigés vers la boîte d'essai.
  return NextResponse.json(
    { ok: !enErreur, mode: modeEnvoi(), date: todayStr, sent: log, errors: errors.length ? errors : undefined },
    { status: enErreur ? 500 : 200 }
  )
}
