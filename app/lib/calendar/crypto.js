// app/lib/calendar/crypto.js
// Chiffrement symétrique AES-256-GCM des credentials calendrier (lot 6b-2).
// Sert à protéger l'app-specific password iCloud (secret long-vécu) avant stockage
// en base. Le déchiffrement se fait UNIQUEMENT côté serveur (service_role), au moment
// de construire le client CalDAV (cf. icloud.js).
//
// Format du tampon stocké (base64) : iv(12) ‖ authTag(16) ‖ ciphertext.
// L'authTag GCM garantit l'intégrité : decrypt() rejette tout tampon altéré.
//
// ⚠️ CLÉ : process.env.CALDAV_ENC_KEY = 32 octets, en base64 (recommandé) ou hex.
//   La GÉNÉRER avec :  openssl rand -base64 32
//   La placer dans les variables d'environnement Vercel (JAMAIS en base ni dans le
//   repo). Le code la LIT seulement ; il ne la génère ni ne la stocke. Absente → throw
//   clair (on ne chiffre jamais « en clair » par défaut).

import crypto from 'crypto'

const ALGO = 'aes-256-gcm'
const IV_LEN = 12 // taille de nonce standard pour GCM
const TAG_LEN = 16

function getKey() {
  const raw = process.env.CALDAV_ENC_KEY
  if (!raw) throw new Error('CALDAV_ENC_KEY manquante (32 octets base64/hex en env Vercel)')
  let key = Buffer.from(raw, 'base64')
  if (key.length !== 32) key = Buffer.from(raw, 'hex')
  if (key.length !== 32) throw new Error('CALDAV_ENC_KEY invalide : 32 octets attendus (base64 ou hex)')
  return key
}

// plaintext (string) → base64(iv ‖ authTag ‖ ciphertext)
export function encrypt(plaintext) {
  const iv = crypto.randomBytes(IV_LEN)
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv)
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ct]).toString('base64')
}

// base64(iv ‖ authTag ‖ ciphertext) → plaintext (string). Throw si altéré (authTag KO).
export function decrypt(b64) {
  const buf = Buffer.from(b64, 'base64')
  const iv = buf.subarray(0, IV_LEN)
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const ct = buf.subarray(IV_LEN + TAG_LEN)
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}
