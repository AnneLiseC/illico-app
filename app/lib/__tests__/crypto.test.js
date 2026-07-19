import { describe, it, expect, afterEach } from 'vitest'
import crypto from 'crypto'
import { encrypt, decrypt } from '../calendar/crypto.js'

// Clé id 1 = celle injectée par vitest.config.mjs (CALDAV_ENC_KEY).
const KEY1 = Buffer.from(process.env.CALDAV_ENC_KEY, 'base64')

// Reproduit le format LEGACY (pré-versionnage) : iv ‖ authTag ‖ ciphertext, SANS octet
// de version. Sert à prouver que decrypt() lit encore les blobs déjà en base.
function legacyEncrypt(plaintext, key) {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([c.update(String(plaintext), 'utf8'), c.final()])
  const tag = c.getAuthTag()
  return Buffer.concat([iv, tag, ct]).toString('base64')
}

describe('crypto — chiffrement versionné (key_id)', () => {
  afterEach(() => {
    delete process.env.CALDAV_ENC_KEY_2
    delete process.env.CALDAV_ENC_KEY_ACTIVE
  })

  it('roundtrip encrypt→decrypt (avec accents)', () => {
    const s = 'ya29.token-secret-éàç-🔑'
    expect(decrypt(encrypt(s))).toBe(s)
  })

  it('écrit bien le format versionné (1er octet = id actif = 1)', () => {
    const buf = Buffer.from(encrypt('x'), 'base64')
    expect(buf[0]).toBe(1)
    expect(buf.length).toBeGreaterThanOrEqual(1 + 12 + 16 + 1) // version+iv+tag+≥1 octet
  })

  it('déchiffre un blob LEGACY (sans octet de version) — rétrocompat', () => {
    const s = 'refresh-token-deja-en-base'
    expect(decrypt(legacyEncrypt(s, KEY1))).toBe(s)
  })

  it('déchiffre un blob legacy dont le 1er octet vaut 1 (collision d’id)', () => {
    // On force un IV commençant par 0x01 : le 1er octet ressemble à un id versionné,
    // la tentative versionnée doit échouer (authTag) et retomber en legacy proprement.
    let legacy
    do {
      legacy = legacyEncrypt('collision', KEY1)
    } while (Buffer.from(legacy, 'base64')[0] !== 1)
    expect(decrypt(legacy)).toBe('collision')
  })

  it('rejette un tampon altéré (authTag KO)', () => {
    const buf = Buffer.from(encrypt('abc'), 'base64')
    buf[buf.length - 1] ^= 0xff
    expect(() => decrypt(buf.toString('base64'))).toThrow()
  })

  it('rotation de clé : nouvelle clé active, anciens blobs toujours lisibles', () => {
    const s = 'secret-a-conserver'
    const blobK1 = encrypt(s) // chiffré avec la clé id 1

    // Introduit une clé id 2 et la rend active.
    process.env.CALDAV_ENC_KEY_2 = crypto.randomBytes(32).toString('base64')
    process.env.CALDAV_ENC_KEY_ACTIVE = '2'

    const blobK2 = encrypt(s)
    expect(Buffer.from(blobK2, 'base64')[0]).toBe(2) // écrit avec la clé 2
    expect(decrypt(blobK2)).toBe(s)                  // relu avec la clé 2
    expect(decrypt(blobK1)).toBe(s)                  // ANCIEN blob (clé 1) toujours lisible
  })
})
