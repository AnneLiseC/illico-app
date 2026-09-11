import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Le transport du courrier. Se tromper ici, c'est perdre en silence une invitation, une
// réinitialisation de mot de passe ou une demande d'acompte — et personne ne le voit avant
// que quelqu'un se plaigne de ne rien avoir reçu.

vi.mock('../email-sender', () => ({
  getSenderAccessToken: vi.fn(async () => 'jeton-graph'),
}))

const envInitial = { ...process.env }
let appels

beforeEach(() => {
  appels = []
  global.fetch = vi.fn(async (url, opts) => {
    appels.push({ url, opts, corps: JSON.parse(opts.body) })
    return { ok: true, status: 200, text: async () => '' }
  })
})
afterEach(() => {
  process.env = { ...envInitial }
  vi.resetModules()
})

async function charger() {
  vi.resetModules()
  return await import('../email.js')
}

describe('choix du transport', () => {
  it('Resend dès que la clé existe', async () => {
    process.env.RESEND_API_KEY = 're_test'
    const { transportEmail } = await charger()
    expect(transportEmail()).toBe('resend')
  })

  it('retombe sur Graph sans clé — l\'interrupteur de retour arrière', async () => {
    // Retirer UNE variable d'environnement rebascule tout le courrier, sans déploiement.
    delete process.env.RESEND_API_KEY
    const { transportEmail } = await charger()
    expect(transportEmail()).toBe('graph')
  })
})

describe('envoi via Resend', () => {
  beforeEach(() => { process.env.RESEND_API_KEY = 're_test' })

  it('part de contact@batilis-app.fr, pas d\'une boîte Outlook personnelle', async () => {
    const { sendEmail } = await charger()
    await sendEmail({ to: 'client@exemple.test', subject: 'Objet', html: '<p>x</p>' })
    expect(appels[0].url).toContain('api.resend.com')
    expect(appels[0].corps.from).toContain('contact@batilis-app.fr')
    expect(appels[0].corps.to).toEqual(['client@exemple.test'])
  })

  it('EMAIL_FROM permet de changer d\'adresse sans redéployer', async () => {
    process.env.EMAIL_FROM = 'Agence <hello@batilis-app.fr>'
    const { sendEmail } = await charger()
    await sendEmail({ to: 'a@b.test', subject: 'x', html: 'y' })
    expect(appels[0].corps.from).toBe('Agence <hello@batilis-app.fr>')
  })

  it('le replyTo devient reply_to — le nom du champ REST, pas celui du SDK', async () => {
    // Se tromper de casse ne produit AUCUNE erreur : Resend ignore le champ inconnu et la
    // réponse du client partirait dans le vide.
    const { sendEmail } = await charger()
    await sendEmail({ to: 'a@b.test', subject: 'x', html: 'y', replyTo: 'referente@exemple.test' })
    expect(appels[0].corps.reply_to).toBe('referente@exemple.test')
    expect(appels[0].corps.replyTo).toBeUndefined()
  })

  it('traduit les pièces jointes du vocabulaire Graph vers celui de Resend', async () => {
    // Les sept appelants parlent `contentBytes` ; la traduction vit ici, à un seul endroit.
    const { sendEmail } = await charger()
    await sendEmail({
      to: 'a@b.test', subject: 'x', html: 'y',
      attachments: [{ filename: 'RIB.pdf', contentBytes: 'QUJD', contentType: 'application/pdf' }],
    })
    expect(appels[0].corps.attachments).toEqual([
      { filename: 'RIB.pdf', content: 'QUJD', content_type: 'application/pdf' },
    ])
  })

  it('sans pièce jointe, aucun champ attachments vide', async () => {
    const { sendEmail } = await charger()
    await sendEmail({ to: 'a@b.test', subject: 'x', html: 'y' })
    expect(appels[0].corps.attachments).toBeUndefined()
  })

  it('remonte le DÉTAIL de l\'erreur, pas seulement le code HTTP', async () => {
    // « domaine non vérifié », « quota atteint » : sans le corps, il faudrait deviner.
    global.fetch = vi.fn(async () => ({ ok: false, status: 422, text: async () => 'domain not verified' }))
    const { sendEmail } = await charger()
    await expect(sendEmail({ to: 'a@b.test', subject: 'x', html: 'y' }))
      .rejects.toThrow(/422.*domain not verified/)
  })
})

describe('envoi via Graph (repli)', () => {
  beforeEach(() => { delete process.env.RESEND_API_KEY })

  it('garde exactement l\'ancien comportement', async () => {
    const { sendEmail } = await charger()
    await sendEmail({ to: 'a@b.test', subject: 'x', html: 'y', replyTo: 'r@b.test' })
    expect(appels[0].url).toContain('graph.microsoft.com')
    expect(appels[0].corps.message.toRecipients[0].emailAddress.address).toBe('a@b.test')
    expect(appels[0].corps.message.replyTo[0].emailAddress.address).toBe('r@b.test')
  })

  it('accepte le 202 sans corps que Graph renvoie', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 202, text: async () => '' }))
    const { sendEmail } = await charger()
    await expect(sendEmail({ to: 'a@b.test', subject: 'x', html: 'y' })).resolves.toBeUndefined()
  })
})

describe('garde-fou commun aux deux transports', () => {
  it('refuse un envoi sans destinataire', async () => {
    process.env.RESEND_API_KEY = 're_test'
    const { sendEmail } = await charger()
    await expect(sendEmail({ subject: 'x', html: 'y' })).rejects.toThrow('Destinataire manquant')
    expect(appels).toHaveLength(0)
  })
})
