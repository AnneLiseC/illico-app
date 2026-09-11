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
import { salutationClient, nomClientPourArtisan, libelleRdv, destinatairesRappel, heureRdvFR, dateRdvFR, adresseArtisan, mentionReglement } from '../../../lib/relances-texte'
import { signatureComplete } from '../../../lib/email-signature'
import { renderToBuffer } from '@react-pdf/renderer'
import { buildRecapitulatifDocument } from '../../../lib/pdf/recapitulatifDocument.js'

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

// Salutation client et intitulé de rendez-vous : voir lib/relances-texte.js — extraits
// là-bas le 09/09 pour être testés. L'ancienne version répétait le patronyme quand les
// deux conjoints portent le même nom (« M. et Mme Brunet, Brunet »).

// Noms pour référence de virement : "GUERTEAU-EPPINGER" ou "CHAMBONNIERE"
// Nom d'un dossier tel qu'on en parle À VOIX HAUTE : « le dossier BRUNET ». La référence
// interne (« 2026-AM-002 ») ne dit rien à un artisan qui suit cinq chantiers, ni à un
// client qui n'en a qu'un. Même règle que les dossiers du Drive. (11/09)
function nomDossierClient(client, repli) {
  const noms = [client?.nom, client?.nom2].filter(Boolean).map(n => String(n).trim().toUpperCase())
  const uniques = [...new Set(noms)]
  return uniques.length ? uniques.join('-') : (repli || '')
}

function nomsVirement(client) {
  return [client.nom, client.nom2].filter(Boolean).map(n => n.toUpperCase()).join('-')
}

// ── PIÈCES JOINTES DE LA DEMANDE D'ACOMPTE ───────────────────────────────────────────
//
// Le mail annonce « en pièces jointes le récapitulatif financier à jour, les RIB des
// artisans en paiement direct ainsi que le RIB de <société> ». Tant que rien n'est
// attaché, cette phrase est un mensonge — et le client cherche une pièce absente.
//
// BEST EFFORT ASSUMÉ : une pièce jointe introuvable (RIB pas encore téléversé, fichier
// supprimé du stockage) ne doit PAS empêcher la demande d'acompte de partir. Le client a
// besoin des montants ; il réclamera un RIB manquant. L'inverse — pas de mail du tout
// parce qu'un fichier manque — retarderait un encaissement pour un détail réparable.
async function pieceJointeStorage(chemin, nomFichier) {
  if (!chemin) return null
  try {
    const { data, error } = await getSupabaseAdmin().storage.from('documents').download(chemin)
    if (error || !data) return null
    const buffer = Buffer.from(await data.arrayBuffer())
    // Graph plafonne un envoi simple autour de 4 Mo : un RIB scanné en haute définition
    // ferait échouer TOUT le mail, montants compris. On l'écarte plutôt que de tout perdre.
    if (buffer.length > 3_000_000) return null
    return { filename: nomFichier, contentBytes: buffer.toString('base64'), contentType: 'application/pdf' }
  } catch { return null }
}

// Agences chargées UNE fois chacune : le cron traite des dizaines de dossiers et la
// plupart partagent la même agence. Un cache mémoire évite autant de requêtes que de mails.
const _agences = new Map()
async function agenceDe(agenceId) {
  if (!agenceId) return null
  if (_agences.has(agenceId)) return _agences.get(agenceId)
  const { data } = await getSupabaseAdmin().from('agences')
    .select('nom, adresse, code_postal, ville, telephone').eq('id', agenceId).maybeSingle()
  _agences.set(agenceId, data || null)
  return data || null
}

// Signature d'un mail métier : la personne qui suit le dossier, PUIS son agence.
//
// Ce qui change le 11/09 — l'agence apparaît sous la référente (nom, adresse, téléphone).
// Un client à qui l'on demande un acompte doit pouvoir vérifier à qui il envoie son
// argent ; un portable seul ne le lui dit pas. Et le repli n'est plus « illiCO travaux »
// tout court : quand la référente manque, c'est l'AGENCE qui signe, pas un anonyme.
//
// Le texte des mails, lui, n'est pas touché : il était juste.
//
// `agence` est chargée par l'appelant (une requête par dossier, mise en cache) — la
// fonction reste purement de la mise en forme.
async function signatureHtml(referente) {
  const agence = await agenceDe(referente?.agence_id)
  const html = signatureComplete({
    personne: referente,
    agence,
    roleLabel: referente ? roleLabel(referente.role) : null,
    formule: null,   // les textes disent déjà « Cordialement, » juste au-dessus
  })
  return html || ''
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
//
// ANTI-DOUBLON (10/09) — `cle` rend l'envoi IDEMPOTENT. Sans elle, le comportement est
// celui d'avant : on envoie, sans mémoire. Avec elle :
//
//   1. on RÉSERVE la place dans `relances_envoyees` AVANT d'envoyer. L'insertion est le
//      verrou : la contrainte UNIQUE rejette la seconde tentative, y compris si deux
//      exécutions du cron se chevauchent. Vérifier puis envoyer aurait laissé la fenêtre
//      ouverte entre les deux ;
//   2. si l'envoi échoue ensuite, on LIBÈRE la réservation. Sinon un incident réseau
//      d'une seconde condamnerait le rappel pour toujours — et ne pas prévenir un client
//      d'un rendez-vous est bien pire que le prévenir deux fois.
//
// Le destinataire enregistré est le destinataire RÉEL, jamais l'adresse d'essai : les
// essais se comportent ainsi exactement comme la production.
async function envoyer(log, tag, { to, subject, html, replyTo, cle, attachments }) {
  const plan = preparerEnvoi({ to, subject })
  if (!plan.envoyer) {
    log.push(`[${tag}] NON ENVOYÉ (${plan.raison}) — destinataire réel ${plan.reel || '—'}`)
    return false
  }

  let reserve = false
  if (cle) {
    const { error } = await getSupabaseAdmin().from('relances_envoyees')
      .insert({ bloc: String(tag), cle, destinataire: plan.reel || plan.to })
    if (error) {
      // 23505 = conflit d'unicité → ce rappel est déjà parti. Tout autre code est une
      // panne du journal : on envoie quand même. Un journal en panne ne doit pas
      // supprimer des rappels, il doit seulement cesser de protéger.
      if (error.code === '23505') {
        log.push(`[${tag}] DÉJÀ ENVOYÉ (${cle}) — ignoré`)
        return false
      }
      log.push(`[${tag}] journal indisponible (${error.message}) — envoi quand même`)
    } else {
      reserve = true
    }
  }

  try {
    await sendEmail({ to: plan.to, subject: plan.subject, html, replyTo: replyTo || undefined, attachments })
  } catch (e) {
    if (reserve) {
      await getSupabaseAdmin().from('relances_envoyees')
        .delete().eq('bloc', String(tag)).eq('cle', cle).eq('destinataire', plan.reel || plan.to)
    }
    throw e
  }

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
        artisans(email, entreprise, nom, prenom, civilite),
        dossiers(reference, clients(nom, nom2), profiles!referente_id(email, prenom, nom, telephone, role, agence_id))
      `)
      .is('date_reception', null)
      .not('statut', 'in', '("accepte","refuse")')
      .eq('date_limite', in7)

    for (const d of devis || []) {
      const artisan = d.artisans
      if (!artisan?.email) continue
      const ref = d.dossiers?.reference || d.dossier_id
      const nomDossier = nomDossierClient(d.dossiers?.clients, ref)
      const referente = d.dossiers?.profiles
      await envoyer(log, '1', {
        // La date limite entre dans la clé : la repousser vaut nouvelle échéance,
        // donc nouveau rappel légitime.
        cle: `devis-limite:${d.id}:${d.date_limite}`,
        to: artisan.email,
        replyTo: referente?.email,
        // Le dossier se désigne par le NOM DU CLIENT, pas par sa référence interne :
        // « 2026-AM-002 » ne dit rien à un artisan qui suit cinq chantiers. (11/09)
        subject: `Relance devis, dossier ${nomDossier}`,
        html: `
          <p>Bonjour ${adresseArtisan(artisan) || ''},</p>
          <p>Nous n'avons pas encore reçu votre devis pour le dossier <strong>${nomDossier}</strong>,
          attendu au plus tard le <strong>${new Date(d.date_limite).toLocaleDateString('fr-FR')}</strong>.</p>
          <p>Merci de nous l'adresser dès que possible.</p>
          <p>Cordialement,</p>
          ${await signatureHtml(referente)}
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
          id, reference, agences(ville, societes(nom_societe, rib_url)),
          profiles!referente_id(email, prenom, nom, telephone, role, agence_id),
          clients(email, nom, prenom, civilite, nom2, prenom2)
        `)
        .eq('id', dossierId).maybeSingle()

      const client = dossier?.clients
      const referente = dossier?.profiles
      if (!client?.email) continue

      // Acomptes artisans encore dus sur CE dossier (statut client ≠ réglé).
      const { data: lignesArtisans } = await getSupabaseAdmin()
        .from('suivi_financier')
        .select('id, montant_ttc, artisan_id, artisans(id, entreprise, paiement_direct, rib_url)')
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
        rib_url: ligne.artisans?.rib_url,
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
      // Le RIB joint est celui de la SOCIÉTÉ (le franchisé), pas de l'agence : c'est elle
      // qui encaisse les honoraires. Repli neutre si le nom n'est pas renseigné, pour ne
      // pas écrire « le RIB de  » avec un trou au milieu de la phrase.
      const nomSociete = dossier?.agences?.societes?.nom_societe || 'notre société'
      const societeRibUrl = dossier?.agences?.societes?.rib_url || null

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
          <p>Vous trouverez ci-dessous les informations relatives aux acomptes à régler, et en
          pièces jointes le récapitulatif financier à jour, les RIB des artisans en paiement
          direct ainsi que le RIB de ${nomSociete}.</p>
          <p>Les acomptes artisans sont à effectuer sur le RIB du <strong>PROTECTACOMPTE</strong>
          figurant dans le contrat de prestation signé lors de notre premier rendez-vous.
          Merci d'effectuer si possible un virement par artisan. Merci de bien vouloir me
          transmettre une capture d'écran ou l'avis de virement correspondant.</p>
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
          <p>Concernant <strong>${a.entreprise}</strong>, le règlement de
          <strong>${montantFr(a.montant_ttc)}</strong> est à effectuer directement sur son compte,
          dont vous trouverez le RIB en pièce jointe.</p>
        `
      }

      // Acompte AMO/courtage
      if (montantAmo) {
        html += `
          <br>
          <p>Au sujet de ma prestation, merci de réaliser un acompte de <strong>${montantFr(montantAmo)}</strong>,
          à régler sur le RIB de ${nomSociete} joint à ce message.
          Merci de me faire parvenir une capture d'écran ou l'avis de virement lorsque cela sera réalisé.</p>
        `
      }

      html += `
        <br>
        <p>Je reste bien entendu à votre disposition si vous avez la moindre question.</p>
        <p>Bien cordialement,</p>
        ${await signatureHtml(referente)}
      `

      // Les trois pièces annoncées dans le texte, dans l'ordre où il les cite.
      const pieces = []
      try {
        const { data: sfDossier } = await getSupabaseAdmin()
          .from('suivi_financier').select('*').eq('dossier_id', dossierId)
        const { data: facturesDossier } = await getSupabaseAdmin()
          .from('factures_artisans').select('*').eq('dossier_id', dossierId).order('date_paiement')
        const { data: devisDossier } = await getSupabaseAdmin()
          .from('devis_artisans').select('*, artisan:artisans(*)').eq('dossier_id', dossierId)
        const { data: dossierComplet } = await getSupabaseAdmin()
          .from('dossiers').select('*, client:clients(*), referente:profiles!referente_id(*), agences(*)')
          .eq('id', dossierId).maybeSingle()
        if (dossierComplet) {
          // Rendu À L'INSTANT de l'envoi : « le récapitulatif à jour au moment du mail »
          // (Anne-Lise, 11/09). Un PDF mis en cache la veille afficherait des montants
          // périmés à côté de ceux du corps du message.
          const buffer = await renderToBuffer(buildRecapitulatifDocument({
            dossier: dossierComplet, devis: devisDossier || [],
            suiviFinancier: sfDossier || [], factures: facturesDossier || [],
          }))
          pieces.push({
            filename: `Recapitulatif_financier_${clientNoms || 'dossier'}.pdf`,
            contentBytes: Buffer.from(buffer).toString('base64'),
            contentType: 'application/pdf',
          })
        }
      } catch (e) { log.push(`[3] recapitulatif non joint : ${e.message}`) }

      for (const a of artisansDirect) {
        const rib = await pieceJointeStorage(a.rib_url, `RIB_${(a.entreprise || 'artisan').replace(/[^\w -]/g, '')}.pdf`)
        if (rib) pieces.push(rib)
      }
      const ribSociete = await pieceJointeStorage(societeRibUrl, `RIB_${nomSociete.replace(/[^\w -]/g, '')}.pdf`)
      if (ribSociete) pieces.push(ribSociete)

      await envoyer(log, '3', {
        attachments: pieces.length ? pieces : undefined,
        // ⚠️ PAS de clé anti-doublon ici, et c'est un choix, pas un oubli. Ce bloc
        // regroupe TOUS les devis signés du dossier dans un seul mail : son contenu
        // change quand un devis s'ajoute, alors qu'une clé « dossier + date » le
        // figerait. Poser une clé sans avoir cadré la récurrence attendue risquerait de
        // supprimer une demande d'acompte légitime — bien pire qu'un doublon.
        to: client.email,
        replyTo: referente?.email,
        subject: `Demande d'acompte`,
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
  // ─────────────────────────────────────────────────────────────
  // 4. Factures non réglées — relance J+7 après enregistrement
  //
  //    LE DÉCLENCHEUR EST LA DATE D'ENREGISTREMENT, pas une échéance devinée.
  //
  //    Ce bloc était désactivé depuis le 03/09 : « il faut la réception de la facture ET
  //    le règlement client, pas de date préprogrammée, ça dépend des chantiers ». La
  //    version rebranchée le 11/09 respecte cette règle sans rien inventer, parce que le
  //    flux réel la porte déjà : « on reçoit la facture de l'artisan, on l'envoie au
  //    client et on la met dans l'application ; quand le client paye on coche réglé ».
  //
  //    Donc `created_at` EST la date d'envoi au client, et `statut` porte le règlement.
  //    Les deux conditions du 03/09 sont réunies sans nouvelle saisie ni nouvel état.
  //
  //    L'échéance saisie à la main, quand il y en a une, PRIME sur le délai : une facture
  //    qui porte « payable au 30/09 » ne se relance pas le 18 parce qu'un compteur de
  //    sept jours s'est écoulé.
  //
  //    UNE SEULE RELANCE par facture (clé anti-doublon). Deux rappels automatiques sur la
  //    même somme, sans que personne ne décide entre les deux, se lisent comme du
  //    harcèlement — et c'est au client qu'on écrit, pas à un fournisseur.
  //
  //    ─── AJOUTS DU 11/09, APRÈS MESURE EN PRODUCTION ───
  //
  //    LE RIB EST RÉELLEMENT JOINT. La première version annonçait « sur le RIB de X joint
  //    à ce message » sans aucune pièce jointe : le texte avait été écrit, l'envoi oublié.
  //    La phrase est désormais calculée à partir de la pièce jointe constituée
  //    (`mentionReglement`), jamais en parallèle. Pas de RIB, pas de promesse.
  //
  //    4c RAPPORTE CE QUI N'A PAS PU PARTIR. Le `continue` sur un client sans email était
  //    muet. Mesure du 11/09 sur Martigues : sur trois factures impayées, DEUX étaient
  //    dans ce cas, dont 3 894 € en souffrance depuis 119 jours. La relance automatique
  //    donnait donc un sentiment de couverture qu'elle n'avait pas, et personne ne pouvait
  //    s'en apercevoir. Un trou signalé vaut mieux qu'un trou silencieux.
  // ─────────────────────────────────────────────────────────────
  const DELAI_RELANCE_FACTURE = 7

  // Ce que la relance n'a PAS pu faire, collecté pendant le parcours et rapporté à la
  // référente en 4c. Sans ce relevé, le saut est totalement silencieux : le 11/09, deux
  // des trois factures impayées de Martigues étaient dans ce cas, dont 3 894 € en
  // souffrance depuis 119 jours, et rien nulle part ne le signalait.
  const empeches = []   // { referenteId, referente, quoi, detail }

  try {
    // ── 4a. Factures des artisans (acompte, situation, solde) ──
    const { data: facturesArtisans } = await getSupabaseAdmin()
      .from('factures_artisans')
      .select(`
        id, dossier_id, montant_ttc, libelle, created_at, date_echeance,
        artisans(entreprise, rib_url),
        dossiers(reference, profiles!referente_id(id, email, prenom, nom, telephone, role, agence_id),
          clients(email, nom, prenom, civilite, nom2))
      `)
      .eq('statut', 'en_attente')

    for (const f of facturesArtisans || []) {
      const client = f.dossiers?.clients
      const referente = f.dossiers?.profiles
      const entreprise = f.artisans?.entreprise || 'votre artisan'

      // Échéance effective : celle saisie, sinon enregistrement + 7 jours.
      const base = f.date_echeance || f.created_at
      const echeanceEff = new Date(base)
      if (!f.date_echeance) echeanceEff.setDate(echeanceEff.getDate() + DELAI_RELANCE_FACTURE)
      if (echeanceEff > new Date()) continue

      // Le client sans adresse : on ne peut rien envoyer, mais on le DIT. L'ordre compte,
      // ce test vient après le test d'échéance pour ne signaler que ce qui est réellement
      // relançable aujourd'hui, pas toutes les factures ouvertes du portefeuille.
      if (!client?.email) {
        const jours = Math.floor((Date.now() - new Date(f.created_at).getTime()) / 86400000)
        empeches.push({
          referenteId: referente?.id, referente,
          quoi: 'client_sans_email',
          detail: `${[client?.nom, client?.nom2].filter(Boolean).join(' et ') || f.dossiers?.reference}, facture ${entreprise}`
            + `${f.montant_ttc ? `, ${montantFr(f.montant_ttc)}` : ''}, en attente depuis ${jours} jour${jours > 1 ? 's' : ''}`,
        })
        continue
      }

      // « Facture solde » → « la facture de solde ». Le libellé est saisi librement :
      // on ne le triture que sur les trois formes connues, sinon on le cite tel quel.
      const libelleLu = /acompte/i.test(f.libelle) ? "la facture d'acompte"
        : /situation/i.test(f.libelle) ? 'la facture de situation'
        : /solde/i.test(f.libelle) ? 'la facture de solde'
        : `la facture « ${f.libelle || 'sans libellé'} »`

      // LE RIB EST JOINT, OU LA PHRASE CHANGE.
      //
      // Défaut livré le 11/09 : le texte annonçait « sur le RIB de X joint à ce message »
      // et aucune pièce jointe ne partait. Un client qui cherche un fichier absent
      // rappelle, ou ne paye pas. Ici la phrase SUIT la pièce jointe, elle ne la précède
      // jamais : pas de RIB en base, pas de promesse.
      //
      // Le repli reste nécessaire même quand tous les RIB seront collectés : un artisan
      // est toujours créé avant que son RIB n'arrive. L'état « pas encore de RIB » est
      // permanent dans le temps, même si chaque cas est temporaire.
      const rib = await pieceJointeStorage(
        f.artisans?.rib_url, `RIB_${entreprise.replace(/[^\w -]/g, '')}.pdf`)
      if (!rib) {
        // Pas de distinction entre « aucun RIB en base » et « fichier introuvable dans le
        // stockage » : dans les deux cas le client ne reçoit pas de RIB, et c'est cela
        // qu'il faut signaler. La cause se voit sur la fiche artisan.
        empeches.push({
          referenteId: referente?.id, referente,
          quoi: 'rib_manquant',
          detail: `${entreprise}, relance envoyée sans RIB`,
        })
      }
      const ouRegler = mentionReglement(Boolean(rib), entreprise)

      await envoyer(log, '4', {
        // L'échéance entre dans la clé : la repousser vaut nouvelle échéance, donc
        // nouveau rappel légitime.
        cle: `facture-artisan:${f.id}:${echeanceEff.toISOString().slice(0, 10)}`,
        to: client.email,
        replyTo: referente?.email,
        subject: `Relance de règlement, facture ${entreprise}`,
        attachments: rib ? [rib] : undefined,
        html: `
          <p>Bonjour ${salutationClient(client)},</p>
          <p>Sauf erreur de notre part, ${libelleLu} de <strong>${entreprise}</strong>${f.montant_ttc ? `,
          d'un montant de <strong>${montantFr(f.montant_ttc)}</strong>,` : ','}
          n'a pas encore été réglée.</p>
          <p>Nous vous remercions de bien vouloir procéder au règlement dans les meilleurs délais,
          ${ouRegler}, et de me transmettre l'avis de virement
          correspondant.</p>
          <p>Cordialement,</p>
          ${await signatureHtml(referente)}
        `,
      })
    }

    // ── 4b. Honoraires de l'agence ──
    //
    // Autre famille, autre table : ce que le CLIENT doit à l'agence (courtage, acompte et
    // solde AMO). Ici `date_echeance` existe déjà dans le modèle ; quand elle est vide, on
    // applique le même délai depuis la création de la ligne.
    const LIBELLE_HONORAIRE = {
      honoraires_courtage: 'nos honoraires de courtage',
      acompte_amo: "l'acompte de nos honoraires d'assistance à maîtrise d'ouvrage",
      solde_amo_paiement: "le solde de nos honoraires d'assistance à maîtrise d'ouvrage",
    }
    const { data: honoraires } = await getSupabaseAdmin()
      .from('suivi_financier')
      .select(`
        id, dossier_id, montant_ttc, type_echeance, date_echeance, created_at,
        dossiers(reference, agences(societes(nom_societe, rib_url)),
          profiles!referente_id(id, email, prenom, nom, telephone, role, agence_id),
          clients(email, nom, prenom, civilite, nom2))
      `)
      .in('type_echeance', Object.keys(LIBELLE_HONORAIRE))
      .eq('statut_client', 'en_attente')

    for (const h of honoraires || []) {
      const client = h.dossiers?.clients
      const referente = h.dossiers?.profiles
      const societe = h.dossiers?.agences?.societes?.nom_societe || 'notre société'

      const base = h.date_echeance || h.created_at
      const echeanceEff = new Date(base)
      if (!h.date_echeance) echeanceEff.setDate(echeanceEff.getDate() + DELAI_RELANCE_FACTURE)
      if (echeanceEff > new Date()) continue

      if (!client?.email) {
        const jours = Math.floor((Date.now() - new Date(h.created_at).getTime()) / 86400000)
        empeches.push({
          referenteId: referente?.id, referente,
          quoi: 'client_sans_email',
          detail: `${[client?.nom, client?.nom2].filter(Boolean).join(' et ') || h.dossiers?.reference}, ${LIBELLE_HONORAIRE[h.type_echeance]}`
            + `${h.montant_ttc ? `, ${montantFr(h.montant_ttc)}` : ''}, en attente depuis ${jours} jour${jours > 1 ? 's' : ''}`,
        })
        continue
      }

      // Même règle qu'en 4a : la phrase suit la pièce jointe.
      const ribSociete = await pieceJointeStorage(
        h.dossiers?.agences?.societes?.rib_url, `RIB_${societe.replace(/[^\w -]/g, '')}.pdf`)
      if (!ribSociete) {
        empeches.push({
          referenteId: referente?.id, referente,
          quoi: 'rib_manquant',
          detail: `${societe}, relance d'honoraires envoyée sans RIB de la société`,
        })
      }
      const ouRegler = mentionReglement(Boolean(ribSociete), societe)

      await envoyer(log, '4', {
        cle: `honoraire:${h.id}:${echeanceEff.toISOString().slice(0, 10)}`,
        to: client.email,
        replyTo: referente?.email,
        subject: `Relance de règlement, honoraires`,
        attachments: ribSociete ? [ribSociete] : undefined,
        html: `
          <p>Bonjour ${salutationClient(client)},</p>
          <p>Sauf erreur de notre part, <strong>${LIBELLE_HONORAIRE[h.type_echeance]}</strong>${h.montant_ttc ? `,
          d'un montant de <strong>${montantFr(h.montant_ttc)}</strong>,` : ','}
          n'a pas encore été réglé.</p>
          <p>Nous vous remercions de bien vouloir procéder au règlement dans les meilleurs délais,
          ${ouRegler}.</p>
          <p>Cordialement,</p>
          ${await signatureHtml(referente)}
        `,
      })
    }

    // ── 4c. Ce qui n'a PAS pu partir, rapporté à la référente ──
    //
    // Décision d'Anne-Lise le 11/09 : un client sans adresse email ne doit plus être sauté
    // en silence. La relance automatique donnait un sentiment de couverture qu'elle
    // n'avait pas — on croit le portefeuille relancé alors qu'une facture de 3 894 €
    // dormait depuis 119 jours sans qu'aucun mail ne soit jamais parti.
    //
    // UN MAIL PAR RÉFÉRENTE, et seulement les dossiers QU'ELLE suit : en multi-tenant,
    // la liste des impayés d'une agence n'a rien à faire dans la boîte d'une autre.
    //
    // Ce mail ne part QUE s'il y a quelque chose à signaler. Un rapport quotidien vide
    // finit par ne plus être lu, et le jour où il contient quelque chose, il est ignoré.
    const parReferente = new Map()
    for (const e of empeches) {
      if (!e.referente?.email) continue
      if (!parReferente.has(e.referenteId)) parReferente.set(e.referenteId, { referente: e.referente, lignes: [] })
      parReferente.get(e.referenteId).lignes.push(e)
    }

    for (const [, { referente, lignes }] of parReferente) {
      const sansEmail = lignes.filter(l => l.quoi === 'client_sans_email').map(l => l.detail)
      const sansRib = [...new Set(lignes.filter(l => l.quoi === 'rib_manquant').map(l => l.detail))]
      const bloquantes = sansEmail.length

      const listeHtml = (titre, items) => items.length ? `
        <p><strong>${titre}</strong></p>
        <ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>` : ''

      await envoyer(log, '4c', {
        // Une alerte par référente et par jour. La clé porte la DATE : le même trou
        // signalé demain est un nouveau rappel légitime, tant qu'il n'est pas comblé.
        cle: `alerte-relances:${referente.id}:${todayStr}`,
        to: referente.email,
        subject: bloquantes
          ? `BATILIS, ${bloquantes} relance${bloquantes > 1 ? 's' : ''} n'${bloquantes > 1 ? 'ont' : 'a'} pas pu partir ce matin`
          : `BATILIS, relances envoyées sans RIB`,
        html: `
          <p>Bonjour ${referente.prenom || ''},</p>
          ${listeHtml(
            "Ces règlements sont en retard, mais aucune relance n'a pu partir : le client n'a pas d'adresse email.",
            sansEmail)}
          ${listeHtml(
            'Ces relances sont parties sans RIB en pièce jointe, faute de RIB enregistré :',
            sansRib)}
          <p>Ce message est automatique. Il ne part que les jours où il y a quelque chose à signaler.</p>
        `,
      })
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
        id, dossier_id, type_rdv, titre, date_heure, artisan_id, prevenir_client,
        artisans(email, entreprise, nom, prenom, civilite),
        rendez_vous_artisans(artisans(email, entreprise, nom, prenom, civilite)),
        dossiers(reference, adresse_chantier, profiles!referente_id(email, prenom, nom, telephone, role, agence_id),
          clients(email, nom, prenom, civilite, nom2))
      `)
      .gte('date_heure', `${tomorrow}T00:00:00`)
      .lte('date_heure', `${tomorrow}T23:59:59`)

    for (const rdv of rdvs || []) {
      const client = rdv.dossiers?.clients
      const ref = rdv.dossiers?.reference || rdv.dossier_id
      const referente = rdv.dossiers?.profiles
      // ⚠️ Heure de PARIS, pas celle du serveur. Vercel tourne en UTC : sans fuseau
      // explicite, les rappels annonçaient 07:00 pour un rendez-vous de 09:00.
      const heureRdv = heureRdvFR(rdv.date_heure)
      const dateRdv = dateRdvFR(rdv.date_heure)
      const lieuHtml = rdv.dossiers?.adresse_chantier ? `<br>📍 ${rdv.dossiers.adresse_chantier}` : ''
      const destinataires = destinatairesRappel(rdv)

      // TOUS les artisans conviés, pas seulement l'artisan principal : une réunion de
      // chantier à deux entreprises devait pouvoir les prévenir toutes les deux.
      //
      // Repli sur `artisan_id` quand la liaison est vide : un chemin d'écriture qui
      // oublierait de la remplir ne doit jamais faire DISPARAÎTRE un rappel. Le repli
      // est la position sûre, pas la position normale.
      const artisansLies = (rdv.rendez_vous_artisans || [])
        .map(l => l.artisans)
        .filter(a => a?.email)
      const artisansConvies = artisansLies.length > 0
        ? artisansLies
        : (rdv.artisans?.email ? [rdv.artisans] : [])

      // Dédoublonnage par adresse : le principal figure aussi dans la liaison depuis la
      // reprise du 09/09, et deux mails identiques valent pire qu'un.
      const parEmail = new Map()
      for (const a of artisansConvies) if (!parEmail.has(a.email)) parEmail.set(a.email, a)
      const artisans = [...parEmail.values()]

      const entreprises = artisans.map(a => a.entreprise).filter(Boolean).join(' et ')
      const nomClient = nomClientPourArtisan(client)

      // L'intitulé est sur SA PROPRE LIGNE, pas au milieu de la phrase. Deux raisons :
      // il peut être absent (type `autres` sans titre saisi), et hors de la phrase il
      // n'a plus d'accord de genre à respecter — « visite prévuE » contre « rendez-vous
      // prévU » était une faute qui serait revenue au premier type ajouté.
      const intituleHtml = (libelle) => (libelle ? `<strong>${libelle}</strong><br>` : '')

      if (client?.email && destinataires.client) {   // `client` est désormais toujours vrai : le garde-fou utile est l'adresse
        await envoyer(log, '5', {
          // L'HEURE du rendez-vous entre dans la clé : un report change la clé, donc un
          // nouveau rappel part. Sans elle, un rendez-vous déplacé n'aurait plus jamais
          // été rappelé — le client se serait présenté au mauvais moment, ou pas du tout.
          cle: `rdv:${rdv.id}:${rdv.date_heure}:client`,
          to: client.email,
          replyTo: referente?.email,
          subject: `Rappel de votre rendez-vous demain`,
          html: `
            <p>Bonjour ${salutationClient(client)},</p>
            <p>${destinataires.clientPresent
              ? 'Nous vous rappelons ce rendez-vous :'
              : 'Nous vous informons de ce rendez-vous sur votre chantier :'}</p>
            <p>${intituleHtml(libelleRdv(rdv, 'client', entreprises))}📅 <strong>${dateRdv} à ${heureRdv}</strong>${lieuHtml}</p>
            <p>${destinataires.clientPresent
              ? "En cas d'empêchement, merci de nous contacter dès que possible."
              : `Nous serons présents sur place${entreprises ? ` avec ${entreprises}` : ''} : votre présence n'est pas nécessaire.`}</p>
            <p>Cordialement,</p>
            ${await signatureHtml(referente)}
          `,
        })
      }

      if (destinataires.artisan) {
        for (const artisan of artisans) {
          await envoyer(log, '5', {
            // L'artisan est dans la clé : sur une réunion à deux entreprises, chacune a
            // droit à son rappel, et le passage de l'une ne doit pas bâillonner l'autre.
            cle: `rdv:${rdv.id}:${rdv.date_heure}:artisan:${artisan.email}`,
            to: artisan.email,
            replyTo: referente?.email,
            subject: `Rappel, rendez-vous demain sur le dossier ${nomDossier}`,
            html: `
              <p>Bonjour ${prenomNom(artisan) || artisan.entreprise},</p>
              <p>Nous vous rappelons ce rendez-vous :</p>
              <p>${intituleHtml(libelleRdv(rdv, 'artisan', nomClient))}📅 <strong>${dateRdv} à ${heureRdv}</strong>${lieuHtml}</p>
              ${destinataires.clientPresent ? '<p>Le client sera présent.</p>' : ''}
              <p>En cas d'empêchement, merci de nous prévenir dès que possible.</p>
              <p>Cordialement,</p>
              ${await signatureHtml(referente)}
            `,
          })
        }
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
    // admin de la société : c'est LUI qui signe la relance de décennale (décision du
    // 11/09) — la décennale est une affaire de société, pas de dossier, et c'est le
    // franchisé qui décide de garder un artisan à son catalogue.
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
          getSupabaseAdmin().from('profiles').select('email, prenom, nom, telephone, role, agence_id')
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
      const { admin } = await chargerSociete(a.societe_id)
      await envoyer(log, '6', {
        // La date d'expiration entre dans la clé : une décennale renouvelée porte une
        // nouvelle date, donc l'artisan sera bien re-prévenu l'année suivante.
        cle: `decennale:${a.id}:${a.decennale_expiration}`,
        to: a.email,
        replyTo: admin?.email,   // la décennale est une affaire de société → le franchisé
        subject: `Votre assurance décennale expire le ${expDate}`,   // une date ne périme pas dans la boîte de réception, « dans 14 jours » si
        html: `
          <p>Bonjour ${adresseArtisan(a) || ''},</p>
          <p>Nous vous informons que votre assurance décennale arrive à expiration le <strong>${expDate}</strong>.</p>
          <p>Afin de maintenir notre partenariat, merci de renouveler votre assurance et de nous transmettre
          la nouvelle attestation avant cette date.</p>
          <p>Cordialement,</p>
          ${await signatureHtml(admin)}
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
