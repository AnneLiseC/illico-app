// app/lib/relances-envoi.js
// Garde-fou d'envoi des relances automatiques.
//
// POURQUOI — le cron de relances écrit à de VRAIS clients et à de VRAIS artisans.
// Tant que les textes, les déclencheurs et les destinataires n'ont pas été vus en
// conditions réelles, un envoi direct est une prise de risque inutile : une erreur
// n'est pas rattrapable une fois le mail parti.
//
// PRINCIPE — le mode ESSAI est le DÉFAUT. Il faut un geste délibéré
// (RELANCES_ENVOI=reel) pour écrire à un vrai destinataire. Un oubli de configuration
// ne peut donc jamais ouvrir le robinet, seulement le laisser fermé.
//
// En mode ESSAI, tout est redirigé vers RELANCES_ESSAI_EMAIL, et l'objet est préfixé
// par le destinataire réel : on lit dans sa propre boîte exactement ce que le client
// aurait reçu, et on sait pour qui c'était.
//
// Fonctions PURES (env injectable) → testables sans réseau ni base.

export const MODE_ESSAI = 'essai'
export const MODE_REEL = 'reel'

export function modeEnvoi(env = process.env) {
  return String(env.RELANCES_ENVOI || '').trim().toLowerCase() === MODE_REEL ? MODE_REEL : MODE_ESSAI
}

export function destinationEssai(env = process.env) {
  const v = String(env.RELANCES_ESSAI_EMAIL || '').trim()
  return v || null
}

/**
 * Décide ce qui part réellement pour un mail donné.
 *
 * @returns {{envoyer: true, to: string, subject: string, reel: string}}
 *        | {envoyer: false, raison: string, reel: string}
 *
 * Trois cas, et un seul écrit à un vrai destinataire :
 *   - mode réel                     → on écrit à `to`, objet inchangé ;
 *   - mode essai + adresse d'essai  → on écrit à l'adresse d'essai, objet préfixé ;
 *   - mode essai sans adresse       → ON N'ENVOIE RIEN (fail-closed, jamais d'erreur).
 */
export function preparerEnvoi({ to, subject } = {}, env = process.env) {
  const reel = String(to || '').trim()
  if (!reel) return { envoyer: false, raison: 'destinataire manquant', reel: '' }

  if (modeEnvoi(env) === MODE_REEL) {
    return { envoyer: true, to: reel, subject: String(subject || ''), reel }
  }

  const essai = destinationEssai(env)
  if (!essai) {
    return { envoyer: false, raison: 'mode essai sans RELANCES_ESSAI_EMAIL', reel }
  }

  return { envoyer: true, to: essai, subject: `[ESSAI → ${reel}] ${String(subject || '')}`, reel }
}
