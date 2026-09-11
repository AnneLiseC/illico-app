// app/lib/email.js
// Envoi des emails de BATILIS. UN SEUL POINT DE SORTIE pour les huit déclencheurs de
// l'application (invitations, mot de passe, relances, diffusion des comptes rendus).
//
// ═══════════════════════════════════════════════════════════════════════════════════════
// DEUX TRANSPORTS, ET POURQUOI LES DEUX COEXISTENT (11/09)
//
//   · RESEND  — dès que RESEND_API_KEY existe. Expéditeur : contact@batilis-app.fr,
//               domaine vérifié (DKIM + SPF).
//   · GRAPH   — sinon. L'ancien envoi délégué depuis la boîte Outlook de l'éditrice.
//
// Ce n'est pas de l'indécision : c'est un interrupteur de retour arrière. Poser ou retirer
// UNE variable d'environnement bascule tout le courrier de l'application, sans déploiement.
// Le jour où Resend refuse un envoi, on ne cherche pas un correctif dans l'urgence.
//
// CE QUE LA BASCULE RÈGLE, mesuré le 11/09 sur les huit points d'envoi :
//
//   1. L'EXPÉDITEUR. Graph envoie depuis la boîte connectée et ne sait PAS écrire « au nom
//      de » quelqu'un d'autre. Les franchisés, leurs clients et leurs artisans recevaient
//      donc des mails partant d'une adresse Outlook personnelle — y compris les invitations
//      et les réinitialisations de mot de passe du produit qu'on leur vend.
//
//   2. LE POINT DE DÉFAILLANCE UNIQUE. Un seul jeton OAuth délégué (email_sender_oauth).
//      Microsoft l'invalide sur un changement de mot de passe, un MFA, une révocation : TOUT
//      le courrier s'arrête d'un coup, invitations et récupérations de compte comprises, et
//      RIEN ne le signale. Une clé d'API ne se révoque pas toute seule.
//
//   3. LE MULTI-TENANT. Avec Graph en délégué, donner à chaque franchisé sa propre adresse
//      d'expédition supposerait que chacun connecte SA boîte Outlook. Ingérable à vendre.
//      Avec un domaine vérifié, l'expéditeur est un réglage, pas une connexion.
//
// CE QUE LA BASCULE NE RÈGLE PAS, et c'est voulu : l'adresse d'expédition reste unique
// (contact@batilis-app.fr). C'est la SIGNATURE qui porte l'agence (lib/email-signature.js)
// et le `replyTo` qui ramène la réponse chez la bonne personne — la référente du dossier,
// l'admin de la société pour la décennale.
//
// Signature stable, inchangée pour les sept appelants :
//   sendEmail({ to, subject, html, replyTo?, attachments? })
//   attachments : [{ filename, contentBytes(base64), contentType }]
// SERVEUR UNIQUEMENT.
// ═══════════════════════════════════════════════════════════════════════════════════════

import { getSenderAccessToken } from './email-sender'

const GRAPH = 'https://graph.microsoft.com/v1.0'
const RESEND = 'https://api.resend.com/emails'

// Adresse d'expédition. Réglable sans redéployer, parce qu'un changement d'adresse ne doit
// pas demander une modification de code — mais le défaut est celui décidé le 11/09.
const EXPEDITEUR = process.env.EMAIL_FROM || 'BATILIS <contact@batilis-app.fr>'

export function transportEmail() {
  return process.env.RESEND_API_KEY ? 'resend' : 'graph'
}

export async function sendEmail({ to, subject, html, replyTo, attachments }) {
  if (!to) throw new Error('Destinataire manquant')
  return transportEmail() === 'resend'
    ? envoyerViaResend({ to, subject, html, replyTo, attachments })
    : envoyerViaGraph({ to, subject, html, replyTo, attachments })
}

// ── Resend ────────────────────────────────────────────────────────────────────────────
async function envoyerViaResend({ to, subject, html, replyTo, attachments }) {
  const corps = {
    from: EXPEDITEUR,
    to: [to],
    subject: subject || '',
    html: html || '',
  }
  // `reply_to` en snake_case : c'est le nom du champ dans l'API REST, différent du SDK.
  if (replyTo) corps.reply_to = replyTo
  if (Array.isArray(attachments) && attachments.length) {
    // Nos appelants parlent le vocabulaire de Graph (`contentBytes`). On traduit ICI plutôt
    // que dans sept routes : le jour d'un troisième transport, une seule traduction change.
    corps.attachments = attachments.map(a => ({
      filename: a.filename,
      content: a.contentBytes,
      content_type: a.contentType || undefined,
    }))
  }

  const res = await fetch(RESEND, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(corps),
  })

  if (!res.ok) {
    // Le corps d'erreur de Resend nomme la cause (domaine non vérifié, destinataire
    // invalide, quota). Le perdre obligerait à deviner depuis un simple code HTTP.
    const detail = await res.text().catch(() => '')
    throw new Error(`Envoi email échoué (Resend ${res.status}): ${detail}`)
  }
}

// ── Microsoft Graph (repli) ───────────────────────────────────────────────────────────
async function envoyerViaGraph({ to, subject, html, replyTo, attachments }) {
  const token = await getSenderAccessToken()

  const message = {
    subject,
    body: { contentType: 'HTML', content: html },
    toRecipients: [{ emailAddress: { address: to } }],
  }
  if (replyTo) {
    message.replyTo = [{ emailAddress: { address: replyTo } }]
  }
  if (Array.isArray(attachments) && attachments.length) {
    message.attachments = attachments.map(a => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: a.filename,
      contentType: a.contentType || 'application/octet-stream',
      contentBytes: a.contentBytes,
    }))
  }

  const res = await fetch(`${GRAPH}/me/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, saveToSentItems: true }),
  })

  // Graph renvoie 202 Accepted sans body.
  if (!res.ok && res.status !== 202) {
    const err = await res.text().catch(() => '')
    throw new Error(`Envoi email échoué (${res.status}): ${err}`)
  }
}
