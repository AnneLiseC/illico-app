// Microsoft Graph API — envoi depuis la boîte @illico-travaux.com
// Vars requises : MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MS_SENDER_EMAIL

async function getAccessToken() {
  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.MS_CLIENT_ID,
        client_secret: process.env.MS_CLIENT_SECRET,
        scope: 'https://graph.microsoft.com/.default',
      }),
    }
  )
  if (!res.ok) throw new Error(`Token fetch failed: ${res.status}`)
  const { access_token } = await res.json()
  return access_token
}

// from : email de la référente (@illico-travaux.com) — fallback sur MS_SENDER_EMAIL
export async function sendEmail({ to, subject, html, from }) {
  if (!to) throw new Error('Destinataire manquant')

  const sender = from || process.env.MS_SENDER_EMAIL
  const token = await getAccessToken()

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: 'HTML', content: html },
          toRecipients: [{ emailAddress: { address: to } }],
          from: { emailAddress: { address: sender } },
        },
        saveToSentItems: true,
      }),
    }
  )

  // Graph renvoie 202 Accepted sans body
  if (!res.ok && res.status !== 202) {
    const err = await res.text().catch(() => '')
    throw new Error(`Envoi email échoué (${res.status}): ${err}`)
  }
}
