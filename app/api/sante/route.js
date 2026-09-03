// app/api/sante/route.js
// GET /api/sante — état de santé de l'application, en une requête.
//
// R9 — POURQUOI. Il n'existait aucun moyen de savoir si BATILIS allait bien, sinon
// l'ouvrir et cliquer. C'est ce qui a laissé 1 710 exécutions de cron échouer à
// l'identique pendant trois semaines cet été sans que personne l'apprenne.
//
// Cette route est faite pour être appelée par un surveillant extérieur — le contrôle
// gratuit d'UptimeRobot, de Better Stack, ou n'importe quel service qui sait envoyer un
// SMS quand une URL cesse de répondre 200. C'est la supervision la moins chère qui
// existe : zéro euro, cinq minutes de configuration, et elle couvre le scénario qui fait
// vraiment mal — l'application est tombée et tu l'apprends par ton client.
//
// CE QU'ELLE NE DIT PAS, VOLONTAIREMENT. Elle est publique : n'importe qui peut
// l'appeler. Elle ne révèle donc AUCUN chiffre d'affaires, AUCUN nom, AUCUN volume —
// seulement « la base répond » ou « la base ne répond pas ». Un état de santé qui fuit
// des données devient lui-même un problème de sécurité.
//
// Le détail (fraîcheur des crons) n'est servi qu'avec le secret des crons, qui existe
// déjà. Un même point d'entrée, deux niveaux de lecture selon qui demande.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

let _admin
function db() {
  if (!_admin) _admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _admin
}

function porteLeSecret(request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = request.headers.get('authorization') || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  return !!match && match[1].trim() === secret
}

export async function GET(request) {
  const debut = Date.now()
  const reponse = { ok: true, horodatage: new Date().toISOString() }

  // 1. La base répond-elle ? Une lecture minuscule sur une table qui existe toujours.
  //    On ne compte rien : un COUNT sur une grosse table ferait de la surveillance une
  //    charge, et une sonde qui pèse finit par être coupée.
  try {
    const { error } = await db().from('societes').select('id').limit(1)
    if (error) throw new Error(error.message)
    reponse.base = 'ok'
  } catch (err) {
    reponse.ok = false
    reponse.base = 'indisponible'
    reponse.detail = err?.message?.slice(0, 120) || 'erreur inconnue'
  }

  // 2. Les variables d'environnement indispensables sont-elles posées ? Leur absence ne
  //    se voit qu'au moment où une fonctionnalité échoue, c'est-à-dire trop tard.
  const requises = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'CRON_SECRET']
  const manquantes = requises.filter(v => !process.env[v])
  if (manquantes.length > 0) {
    reponse.ok = false
    reponse.configuration = 'incomplète'
    if (porteLeSecret(request)) reponse.variables_manquantes = manquantes
  }

  reponse.duree_ms = Date.now() - debut

  // 3. Détail réservé à l'appelant qui connaît le secret des crons.
  if (porteLeSecret(request)) {
    try {
      const [{ count: nbSocietes }, { data: dernierCache }] = await Promise.all([
        db().from('societes').select('id', { count: 'exact', head: true }),
        db().from('documents_cache').select('genere_le').order('genere_le', { ascending: false }).limit(1).maybeSingle(),
      ])
      reponse.societes = nbSocietes ?? null
      reponse.dernier_document_genere = dernierCache?.genere_le || null
      reponse.mode_relances = String(process.env.RELANCES_ENVOI || 'essai').toLowerCase()
      reponse.boite_envoi_configuree = !!process.env.MICROSOFT_CLIENT_ID
    } catch { /* le détail est un bonus, jamais une raison d'échouer */ }
  }

  // Le CODE HTTP est le message : un surveillant extérieur ne lit pas le corps, il
  // regarde 200 ou pas 200. C'est lui qui déclenche l'alerte.
  return NextResponse.json(reponse, {
    status: reponse.ok ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  })
}
