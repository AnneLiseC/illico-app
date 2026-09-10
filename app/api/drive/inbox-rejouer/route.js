// app/api/drive/inbox-rejouer/route.js
// POST {} → rejoue la décision de rattachement sur les lignes DÉJÀ détectées (« à rattacher »).
//
// POURQUOI CETTE ROUTE EXISTE
//
// Le poller ne voit un fichier qu'une fois : Graph ne le signale que lorsqu'il change. Un
// fichier détecté hier, sur lequel le code ne savait alors rien faire, ne repassera donc
// JAMAIS devant la règle — même quand la règle s'améliore. Le 10/09, 187 photos étaient
// dans ce cas : parfaitement rangées dans « 6. Photos/1. Avant », mais listées avant que la
// destination « table photos » n'existe. Sans cette route, il aurait fallu les traiter à la
// main, ou attendre qu'elles bougent dans le Drive.
//
// C'est donc le pendant du rattrapage sortant (sync-dossier) : à chaque fois qu'on apprend
// au rattachement à traiter un cas de plus, un clic suffit à l'appliquer à l'existant.
//
// Marche par LOTS : chaque import télécharge puis ré-uploade un fichier. On s'arrête au
// budget et on renvoie `done:false` — l'appelant relance. Idempotent : une ligne traitée
// n'est plus 'a_rattacher', elle ne sera pas reprise au tour suivant.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole } from '../../../lib/api-auth'
import { driveModule, loadDriveCompte } from '../../../lib/drive/dispatch'
import { deciderRattachement } from '../../../lib/drive/rattachement'
import { suffixeCollisionDossier } from '../../../lib/drive/collisions'
import { nettoyerSegment } from '../../../lib/drive/taxonomie'
import { importerInbox, importerInboxPhoto } from '../../../lib/drive/import-inbox'

export const maxDuration = 60
const BUDGET_MS = 45_000
const LOT = 60          // lignes examinées par appel — la plupart ne coûtent qu'une décision
// Imports simultanés. Décider est instantané, importer non : un fichier de 5 Mo, c'est un
// téléchargement Graph puis un envoi Storage. En série, 200 photos tiennent plusieurs minutes.
// La limite reste basse : le Storage a déjà répondu 544 sur une salve, et un rattachement à
// moitié fait coûte plus cher que quelques secondes de plus.
const PARALLELE = 4

let _admin
function admin() {
  if (!_admin) _admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _admin
}

export async function POST(request) {
  const auth = await requireRole(request, ['admin', 'agente'])
  if (auth.error) return auth.error
  let body
  try { body = await request.json() } catch { body = {} }
  const debut = Date.now()
  const db = admin()
  const userId = auth.user.id

  const compte = await loadDriveCompte(db, userId)
  const mod = compte ? driveModule(compte.fournisseur) : null
  if (!compte || !mod) return NextResponse.json({ error: 'Drive non connecté' }, { status: 400 })

  let token
  try { token = await mod.getValidAccessToken(compte) }
  catch (e) {
    if (e.reconnect) return NextResponse.json({ reconnect: true, error: 'Reconnecte ton Drive' }, { status: 409 })
    return NextResponse.json({ error: 'Erreur Drive' }, { status: 500 })
  }

  // Candidats de rattachement : chargés UNE fois pour tout le lot, comme dans le cron.
  const { data: doss } = await db.from('dossiers')
    .select('id, statut, created_at, date_premier_rdv, date_fin_chantier, date_cloture, client_id, client:clients(nom, nom2)')
    .eq('referente_id', userId)
  const candidats = []
  for (const d of (doss || [])) candidats.push({ dossier: d, client: d.client, suffixe: await suffixeCollisionDossier(db, d) })
  const artisansParNom = new Map()
  if (auth.profile?.societe_id) {
    const { data: arts } = await db.from('artisans').select('id, entreprise').eq('societe_id', auth.profile.societe_id)
    for (const a of (arts || [])) if (a.entreprise) artisansParNom.set(nettoyerSegment(a.entreprise), a.id)
  }

  // CURSEUR : offset dans la file, avancé du seul nombre de lignes LAISSÉES.
  //
  // Le piège, ici, c'est de repartir du début à chaque appel : les lignes qu'on laisse (une
  // décision humaine est nécessaire) restent en tête de file et on ré-examine indéfiniment
  // les mêmes, sans jamais atteindre les photos plus loin. À l'inverse, un offset qui
  // avancerait de tout le lot sauterait des lignes, puisque celles qu'on traite quittent la
  // file et décalent les suivantes. Le seul décalage juste est donc le nombre de lignes
  // restées en place.
  const offset = Math.max(0, Number(body?.offset) || 0)
  const { data: lignes } = await db.from('drive_inbox')
    .select('id, user_id, drive_id, item_id, name, parent_path, refuse_auto')
    .eq('user_id', userId).eq('statut', 'a_rattacher')
    .order('created_at', { ascending: true }).range(offset, offset + LOT - 1)

  let rattaches = 0, photos = 0, ecartes = 0, echecs = 0, laisses = 0, vus = 0

  // La DÉCISION est pure et instantanée : on la prend pour toute la file d'abord, ce qui
  // sépare nettement le travail gratuit (trier) du travail coûteux (télécharger).
  const aImporter = []
  for (const ligne of (lignes || [])) {
    vus++
    // Refus humain explicite (bouton « Annuler ») : la décision de l'utilisatrice prime,
    // y compris sur une règle améliorée.
    if (ligne.refuse_auto) { laisses++; continue }

    const decision = deciderRattachement(ligne.parent_path || '', candidats, artisansParNom, ligne.name)

    if (decision.aLister === false) {
      await db.from('drive_inbox').update({ statut: 'ignore' }).eq('id', ligne.id)
      ecartes++
      continue
    }
    if (!decision.destination) { laisses++; continue }
    aImporter.push({ ligne, decision })
  }

  // Les imports, eux, partent par paquets de PARALLELE. Le budget se vérifie entre deux
  // paquets : on ne coupe jamais un import en cours, et ce qui n'a pas été fait reste
  // 'a_rattacher' pour l'appel suivant.
  let tentes = 0
  for (let i = 0; i < aImporter.length; i += PARALLELE) {
    if (Date.now() - debut > BUDGET_MS) break
    const paquet = aImporter.slice(i, i + PARALLELE)
    tentes += paquet.length
    const resultats = await Promise.all(paquet.map(({ ligne, decision }) => {
      const commun = { mod, token, inbox: ligne, fournisseur: compte.fournisseur, dossierId: decision.dossier_id, auto: true }
      return decision.destination === 'photos'
        ? importerInboxPhoto(db, { ...commun, categoriePhoto: decision.categorie_photo })
        : importerInbox(db, { ...commun, categorie: decision.categorie, artisanId: decision.artisan_id })
    }))
    for (const [j, res] of resultats.entries()) {
      if (res.ok) { rattaches++; if (paquet[j].decision.destination === 'photos') photos++ }
      else if (res.skipped) ecartes++
      else echecs++
    }
  }

  const { count: restant } = await db.from('drive_inbox')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('statut', 'a_rattacher')

  // Fin de file : le lot complet a été traité (imports compris) ET la requête rendait moins
  // qu'un lot plein. Si le budget a coupé les imports, on n'est pas au bout — même si la
  // file paraissait courte.
  const complet = tentes === aImporter.length
  const done = complet && (lignes || []).length < LOT

  // Curseur. Budget coupé → on RENVOIE LE MÊME offset : les lignes déjà traitées ont quitté
  // la file, donc relire au même endroit avance réellement, sans risquer de sauter une ligne
  // non tentée. Lot complet → on avance du nombre de lignes restées en place.
  //
  // C'est volontairement prudent : relire quelques lignes coûte une décision pure, sauter
  // une ligne la laisse invisible pour toujours — le poller, lui, ne la représentera jamais.
  const prochain_offset = complet ? offset + laisses : offset

  return NextResponse.json({
    ok: true, done, vus, rattaches, photos, ecartes, echecs, laisses,
    prochain_offset, restant: restant ?? 0,
  })
}
