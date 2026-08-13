// app/lib/email.js
// Envoi d'email système via Microsoft Graph en DÉLÉGUÉ (/me/sendMail), depuis la
// « boîte d'envoi » connectée par l'éditrice (email-sender.js). Sender = le compte
// Outlook connecté. Remplace l'ancien envoi app-only (client_credentials), devenu
// impossible : Microsoft a coupé l'auth basique/app-only sur les comptes perso.
//
// Signature stable : sendEmail({ to, subject, html, attachments? }). SERVEUR UNIQUEMENT.
// attachments (optionnel) : [{ filename, contentBytes(base64), contentType }].

import { getSenderAccessToken } from './email-sender'

const GRAPH = 'https://graph.microsoft.com/v1.0'

export async function sendEmail({ to, subject, html, attachments }) {
  if (!to) throw new Error('Destinataire manquant')

  const token = await getSenderAccessToken()

  const message = {
    subject,
    body: { contentType: 'HTML', content: html },
    toRecipients: [{ emailAddress: { address: to } }],
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
