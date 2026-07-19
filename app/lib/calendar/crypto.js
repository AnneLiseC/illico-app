// app/lib/calendar/crypto.js
// Chiffrement symétrique AES-256-GCM des credentials (calendrier + Drive) avant
// stockage en base : app-specific password iCloud, tokens OAuth Google, et bientôt
// tokens Microsoft/OneDrive (Files.ReadWrite = accès à TOUS les fichiers → secret
// critique). Le déchiffrement se fait UNIQUEMENT côté serveur (service_role).
//
// ── VERSIONNAGE DE CLÉ (key_id) ──
// Format stocké (base64) : version(1) ‖ iv(12) ‖ authTag(16) ‖ ciphertext
//   • version = id de la clé qui a chiffré (1 octet). Permet la ROTATION en douceur :
//     on introduit une nouvelle clé, on la rend active pour les nouvelles écritures,
//     et les anciens blobs restent lisibles avec leur clé d'origine. Zéro reconnexion
//     de masse le jour où on tourne la clé.
//
// Format LEGACY (antérieur au versionnage, encore présent en base) :
//   iv(12) ‖ authTag(16) ‖ ciphertext  (SANS octet de version, chiffré avec la clé id 1)
//   → decrypt() le lit toujours : il bascule en legacy si le 1er octet n'est pas un id
//     connu, ou si la lecture versionnée échoue. L'authTag GCM est le juge de paix
//     (une mauvaise interprétation échoue à la vérification → on retombe proprement).
//   → AUCUNE migration de données requise : les blobs se ré-écrivent au format versionné
//     naturellement, au fil des refresh de tokens.
//
// ⚠️ CLÉS (env Vercel, JAMAIS en base ni repo) : 32 octets chacune, base64 (recommandé)
//   ou hex. Générer avec :  openssl rand -base64 32
//   • CALDAV_ENC_KEY          = clé id 1 (historique, TOUJOURS requise)
//   • CALDAV_ENC_KEY_2 … _15  = clés de rotation (optionnelles)
//   • CALDAV_ENC_KEY_ACTIVE   = id de la clé qui chiffre les NOUVELLES écritures (défaut 1)
//   Le code LIT seulement les clés ; il ne les génère ni ne les stocke. Clé absente → throw
//   clair (on ne chiffre jamais « en clair » par défaut).

import crypto from 'crypto'

const ALGO = 'aes-256-gcm'
const IV_LEN = 12 // taille de nonce standard pour GCM
const TAG_LEN = 16
const MAX_KEY_ID = 15

function parseKey(raw, label) {
  if (!raw) return null
  let key = Buffer.from(raw, 'base64')
  if (key.length !== 32) key = Buffer.from(raw, 'hex')
  if (key.length !== 32) throw new Error(`${label} invalide : 32 octets attendus (base64 ou hex)`)
  return key
}

// Registre { id -> Buffer(32) }. id 1 obligatoire, 2..15 optionnels.
function keyring() {
  const k1 = parseKey(process.env.CALDAV_ENC_KEY, 'CALDAV_ENC_KEY')
  if (!k1) throw new Error('CALDAV_ENC_KEY manquante (32 octets base64/hex en env Vercel)')
  const ring = { 1: k1 }
  for (let id = 2; id <= MAX_KEY_ID; id++) {
    const k = parseKey(process.env[`CALDAV_ENC_KEY_${id}`], `CALDAV_ENC_KEY_${id}`)
    if (k) ring[id] = k
  }
  return ring
}

function activeId(ring) {
  const id = process.env.CALDAV_ENC_KEY_ACTIVE ? parseInt(process.env.CALDAV_ENC_KEY_ACTIVE, 10) : 1
  if (!ring[id]) throw new Error(`CALDAV_ENC_KEY_ACTIVE=${id} mais aucune clé pour cet id`)
  return id
}

// plaintext (string) → base64( version ‖ iv ‖ authTag ‖ ciphertext ) avec la clé ACTIVE.
export function encrypt(plaintext) {
  const ring = keyring()
  const id = activeId(ring)
  const iv = crypto.randomBytes(IV_LEN)
  const cipher = crypto.createCipheriv(ALGO, ring[id], iv)
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([Buffer.from([id]), iv, tag, ct]).toString('base64')
}

// base64 → plaintext (string). Essaie le format versionné (1er octet = id connu) ;
// sinon LEGACY (clé id 1). Throw si le tampon est altéré (authTag KO dans les deux voies).
export function decrypt(b64) {
  const ring = keyring()
  const buf = Buffer.from(b64, 'base64')
  const v = buf[0]

  // 1) Tentative VERSIONNÉE : le 1er octet correspond à une clé du registre.
  if (ring[v] && buf.length >= 1 + IV_LEN + TAG_LEN) {
    try {
      const iv = buf.subarray(1, 1 + IV_LEN)
      const tag = buf.subarray(1 + IV_LEN, 1 + IV_LEN + TAG_LEN)
      const ct = buf.subarray(1 + IV_LEN + TAG_LEN)
      const d = crypto.createDecipheriv(ALGO, ring[v], iv)
      d.setAuthTag(tag)
      return Buffer.concat([d.update(ct), d.final()]).toString('utf8')
    } catch {
      // authTag KO → ce n'était pas un blob versionné (ou clé fausse) : on tente le legacy.
    }
  }

  // 2) LEGACY : iv ‖ authTag ‖ ciphertext, chiffré avec la clé id 1.
  const iv = buf.subarray(0, IV_LEN)
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const ct = buf.subarray(IV_LEN + TAG_LEN)
  const d = crypto.createDecipheriv(ALGO, ring[1], iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8')
}
