// app/api/actions/consolider/route.js
// CONSOLIDATION des anciens rapports prose en UNE liste d'actions ouvertes dédoublonnée.
// Contrairement à /api/actions/suggest (qui traite UN texte à la fois et re-crée donc des
// doublons quand on lui donne 6 rapports incrémentaux l'un après l'autre), cet endpoint
// lit TOUS les anciens rapports du dossier EN UNE SEULE passe Claude → il voit l'ensemble
// et peut fusionner un même point qui revient de rapport en rapport, en gardant son statut
// le PLUS RÉCENT. Rien n'est écrit en base : l'humaine COCHE et importe (une fois) dans le
// panneau. L'IA n'est jamais un passage obligé.
//
// IN  : { dossier_id, lots?: [{id, nom}] }
// OUT : { actions: [{ titre, texte, portee, lot_nom, statut, statut_date }], rapports: number }

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole, assertDossierAccessible } from '../../../lib/api-auth'

export const maxDuration = 300     // Vercel Pro : consolidation EXHAUSTIVE de 6+ rapports = génération très longue

const CLAUDE_TIMEOUT_MS = 240_000  // sortie exhaustive (tous les points + clôturés + dates) = 1 à 3 min ; large marge sous maxDuration=300
const CLAUDE_RETRIES = 1           // retry seulement sur statut HTTP retriable (429/5xx), PAS sur un timeout
const RETRIABLE_STATUS = new Set([408, 429, 500, 502, 503, 504, 529])
const MAX_RAPPORTS = 40           // borne de sécurité
const MAX_TOTAL_CHARS = 120_000   // garde-fou taille d'entrée

const STATUTS = ['en_cours', 'date_limite', 'urgent', 'refuse', 'en_retard', 'rappel',
  'en_attente', 'a_surveiller', 'programme', 'a_programmer', 'information',
  'quitus_transmis', 'garder_memoire', 'constate', 'acte', 'cloture']
const STATUT_SET = new Set(STATUTS)

let _admin
function admin() {
  if (!_admin) _admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _admin
}

const SYSTEM_PROMPT = `Tu es un assistant pour une courtière en travaux / AMO (illiCO travaux). On te donne PLUSIEURS rapports de visite d'un MÊME chantier, en ordre CHRONOLOGIQUE (du plus ancien au plus récent). Tu dois produire UNE liste CONSOLIDÉE des actions / points ACTUELLEMENT ouverts ou à suivre.

Réponds STRICTEMENT par un objet JSON (aucun texte autour, pas de markdown) :
{
  "actions": [
    {
      "titre": chaîne,        // titre court (~60 caractères), optionnel ("" si rien)
      "texte": chaîne,        // le point rédigé en UNE phrase TÉLÉGRAPHIQUE et courte (≤ 130 caractères), à jour
      "portee": "generale" | "lot",
      "artisan": chaîne,      // l'ENTREPRISE/artisan EXACT de la liste (ex. "ESPRIT CUISINE", "D2M", "MJ RENOVATION") ; "" si aucun. C'EST LE CHAMP qui rattache au bon lot — le serveur en déduit le lot.
      "lot_nom": chaîne,      // facultatif : nom du lot s'il figure dans la liste fournie ; sinon "". Ne l'invente pas.
      "statut": une des valeurs EXACTES: ${STATUTS.join(', ')},
      "statut_date": "AAAA-MM-JJ" | ""
    }
  ],
  "dates": [
    {
      "lot_nom": chaîne,        // nom du lot concerné, choisi PARMI la liste fournie
      "date_debut": "AAAA-MM-JJ",
      "date_fin": "AAAA-MM-JJ"  // = date_debut si une seule date connue
    }
  ]
}

RÈGLES DE CONSOLIDATION (le cœur du travail) :
- PRIORITÉ = EXHAUSTIVITÉ. Il vaut BEAUCOUP mieux garder un point de trop (que l'utilisatrice décochera) qu'en oublier un. EN CAS DE DOUTE, GARDE le point.
- Ne FUSIONNE que des points VRAIMENT IDENTIQUES (même sujet, même travail). Deux points liés mais DISTINCTS restent SÉPARÉS — ex. « tirage électrique à 98 %, 2 % restants » et « finitions/appareillages en fin de chantier » et « passage de contrôle » sont TROIS actions différentes, pas une seule.
- Quand un même point revient à l'identique dans plusieurs rapports, garde-le UNE fois, avec le STATUT du rapport le PLUS RÉCENT.
- N'EXCLUS JAMAIS un point de la liste, même terminé. Un point réalisé/réceptionné/soldé reste AFFICHÉ, avec le statut "cloture" (ou "quitus_transmis" si un quitus est mentionné) — c'est l'historique. On NE SUPPRIME pas, on change le statut.
- GARDE tout : ouvert, en cours, en attente, à programmer, à surveiller, à venir, ET terminé — y compris les points de coordination / co-activité et les points de vigilance.
- N'invente rien : uniquement ce qui est écrit dans les rapports.
- Écris TOUJOURS en FRANÇAIS. UNE phrase COURTE et télégraphique par action (≤ 130 caractères) — pas de paragraphe, va à l'essentiel.
- ORTHOGRAPHE, GRAMMAIRE, CONJUGAISON — PRIORITÉ ABSOLUE : français IMPECCABLE (orthographe, accords, conjugaison, ponctuation, majuscules). Corrige toutes les fautes des rapports d'origine. Le compte-rendu est envoyé au client : aucune faute n'est tolérée.
- STATUT — choisis le PLUS PRÉCIS parmi les 16, il y a de la nuance : "en_attente", "a_surveiller", "a_programmer", "programme", "en_cours", "en_retard", "date_limite", "urgent", "rappel", "information", "acte", "constate", "garder_memoire"…
- ATTENTION "cloture" et "quitus_transmis" FERMENT le point : il sort du suivi et ne se reporte plus. Ne les utilise QUE si un rapport dit EXPLICITEMENT que c'est terminé/soldé. Dans le doute, choisis un statut OUVERT (jamais "cloture" par précaution). Un point simplement ancien n'est PAS clôturé.
- statut_date : la date d'échéance/statut la plus récente et pertinente si une date est donnée, sinon "".
- "lot_nom" doit être COPIÉ EXACTEMENT depuis la LISTE DE LOTS fournie (le texte entre guillemets) — jamais inventé, jamais reformulé en corps d'état (n'écris PAS « Peinture », « Carrelage », « Meubles de cuisine » si ce n'est pas dans la liste). Pour choisir le bon lot, utilise l'ARTISAN de la liste. Si aucun lot ne correspond vraiment → portee="generale" et lot_nom="".

DATES DE PLANNING ("dates") : liste TOUTES les périodes d'intervention distinctes mentionnées, par lot. Un lot peut intervenir en PLUSIEURS phases → sors-les TOUTES (ne garde pas seulement la plus récente). Ne dédoublonne QUE des périodes strictement identiques (mêmes dates, même lot). N'invente aucune date. "lot_nom" doit venir de la liste fournie. Si aucune date n'est donnée pour un lot, ne l'inclus pas dans "dates".

OBJECTIF : une liste de suivi COMPLÈTE et à jour — chaque point réel présent, sans redite littérale. Mieux vaut 60 points justes que 20 qui en oublient.`

function parseJsonSafe(text) {
  if (!text) return null
  try { return JSON.parse(text) } catch { /* isole l'objet */ }
  const i = text.indexOf('{'); const j = text.lastIndexOf('}')
  if (i === -1 || j === -1 || j <= i) return null
  try { return JSON.parse(text.slice(i, j + 1)) } catch { return null }
}

// Renvoie les objets {...} ÉQUILIBRÉS trouvés au 1er niveau d'un segment (ignore chaînes/échappements).
// Sert à récupérer une liste JSON même si la fin a été TRONQUÉE (dernier objet incomplet ignoré).
function objetsBalances(segment) {
  const objets = []
  let prof = 0, debut = -1, dansStr = false, echap = false
  for (let k = 0; k < segment.length; k++) {
    const ch = segment[k]
    if (dansStr) {
      if (echap) echap = false
      else if (ch === '\\') echap = true
      else if (ch === '"') dansStr = false
      continue
    }
    if (ch === '"') dansStr = true
    else if (ch === '{') { if (prof === 0) debut = k; prof++ }
    else if (ch === '}') { if (prof > 0) { prof--; if (prof === 0 && debut !== -1) { objets.push(segment.slice(debut, k + 1)); debut = -1 } } }
  }
  return objets
}

// Récupération d'une sortie TRONQUÉE : on lit ce qu'on peut des tableaux "actions" et "dates".
function recupererConsolidation(text) {
  if (!text) return null
  const iAct = text.indexOf('"actions"')
  const iDat = text.indexOf('"dates"')
  const tryParse = (s) => { try { return JSON.parse(s) } catch { return null } }
  const segAct = iAct === -1 ? '' : text.slice(text.indexOf('[', iAct) + 1, iDat > iAct ? iDat : undefined)
  const segDat = iDat === -1 ? '' : text.slice(text.indexOf('[', iDat) + 1)
  const actions = objetsBalances(segAct).map(tryParse).filter(Boolean)
  const dates = objetsBalances(segDat).map(tryParse).filter(Boolean)
  return actions.length ? { actions, dates } : null
}

export async function POST(request) {
  const auth = await requireRole(request, ['admin', 'agente'])
  if (auth.error) return auth.error

  let body; try { body = await request.json() } catch { body = {} }
  const dossierId = body.dossier_id
  if (!dossierId) return NextResponse.json({ error: 'dossier_id manquant' }, { status: 400 })
  // Appartenance au tenant AVANT toute lecture service_role.
  const acces = await assertDossierAccessible(dossierId, auth.profile)
  if (acces.error) return acces.error

  // Lots AVEC artisan : "lot_nom" doit être copié EXACTEMENT depuis cette liste (jamais inventé),
  // l'artisan sert à router vers le bon lot.
  const lots = Array.isArray(body.lots)
    ? body.lots.filter(l => l?.nom).slice(0, 60).map(l => ({
        nom: String(l.nom).slice(0, 120),
        artisan: typeof l.artisan === 'string' ? l.artisan.slice(0, 120) : '',
      }))
    : []

  const db = admin()
  // Rapports PROSE (ancien système) = ceux qui ont un contenu_final. Ordre chronologique
  // (plus ancien → plus récent) : la règle « le plus récent gagne » repose dessus.
  const { data: reports, error } = await db.from('comptes_rendus')
    .select('numero_visite, type_visite, date_visite, contenu_final, created_at')
    .eq('dossier_id', dossierId)
    .not('contenu_final', 'is', null)
    .order('date_visite', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const utiles = (reports || []).filter(r => (r.contenu_final || '').trim()).slice(0, MAX_RAPPORTS)
  if (!utiles.length) return NextResponse.json({ actions: [], rapports: 0 })

  // Concaténation avec en-tête daté par rapport, bornée en taille.
  let total = 0
  const blocs = []
  for (const r of utiles) {
    const dateFr = r.date_visite ? new Date(r.date_visite).toLocaleDateString('fr-FR') : 'date inconnue'
    const type = (r.type_visite || 'visite').toUpperCase()
    const corps = (r.contenu_final || '').trim()
    const bloc = `=== Rapport ${type}${r.numero_visite ? ' n°' + r.numero_visite : ''} du ${dateFr} ===\n${corps}`
    if (total + bloc.length > MAX_TOTAL_CHARS) break
    total += bloc.length
    blocs.push(bloc)
  }

  const lotsListe = lots.length
    ? lots.map(l => `- "${l.nom}"${l.artisan ? ` (artisan : ${l.artisan})` : ''}`).join('\n')
    : 'aucun'
  const userText = `Voici ${blocs.length} rapport(s) de visite du même chantier, du plus ancien au plus récent :\n\n${blocs.join('\n\n')}\n\nLOTS DISPONIBLES — "lot_nom" doit être COPIÉ EXACTEMENT depuis cette liste (le texte entre guillemets), jamais inventé ni reformulé en corps d'état. Utilise l'artisan pour choisir le bon lot :\n${lotsListe}\n\nConsolide-les en UNE liste d'actions ouvertes dédoublonnée et à jour, au format JSON demandé, en français.`

  const claudeBody = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 12000,  // exhaustivité : large marge pour ne pas tronquer (+ parseur de récupération en filet)
    temperature: 0,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }],
  })

  let claudeRes = null, derniereErreur = null
  for (let t = 0; t <= CLAUDE_RETRIES; t++) {
    if (t > 0) await new Promise(r => setTimeout(r, 800 * 2 ** (t - 1)))
    const ctrl = new AbortController()
    const minuteur = setTimeout(() => ctrl.abort(), CLAUDE_TIMEOUT_MS)
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: claudeBody, signal: ctrl.signal,
      })
      clearTimeout(minuteur)
      if (res.ok) { claudeRes = res; break }
      if (RETRIABLE_STATUS.has(res.status) && t < CLAUDE_RETRIES) { derniereErreur = new Error(`Claude API ${res.status}`); continue }
      claudeRes = res; break
    } catch (e) {
      clearTimeout(minuteur); derniereErreur = e
      if (e?.name === 'AbortError') break  // timeout : inutile (et trop long) de relancer une passe complète
    }
  }

  if (!claudeRes) return NextResponse.json({ error: `Service IA indisponible (${derniereErreur?.message || 'timeout'}). Réessaie.` }, { status: 503 })
  if (!claudeRes.ok) {
    const err = await claudeRes.json().catch(() => ({}))
    return NextResponse.json({ error: err.error?.message || 'Erreur Claude API' }, { status: 500 })
  }

  const claudeData = await claudeRes.json()
  const claudeText = claudeData.content?.[0]?.text || ''
  const tronquee = claudeData.stop_reason === 'max_tokens'   // sortie coupée par le plafond de tokens
  let raw = parseJsonSafe(claudeText)
  // Filet : si le JSON strict échoue (souvent = fin tronquée), on récupère les objets complets.
  if (!raw || !Array.isArray(raw.actions)) raw = recupererConsolidation(claudeText)
  if (!raw || !Array.isArray(raw.actions)) return NextResponse.json({ error: 'Réponse IA illisible' }, { status: 502 })

  // Coercition : on ne fait jamais confiance à la sortie brute.
  const dateOk = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)) ? s : null
  // Mapping DÉTERMINISTE artisan → lot RÉEL (cf. /api/actions/suggest) : un lot_nom inventé est
  // impossible, il ne passe que s'il correspond à un vrai lot du dossier.
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim()
  const lotsNorm = lots.map(l => ({ nom: l.nom, nomN: norm(l.nom), artN: norm(l.artisan) }))
  const lotsParArtisan = (hint) => {
    const h = norm(hint)
    if (!h) return []
    return lotsNorm.filter(l => l.artN && (l.artN === h || l.artN.includes(h) || h.includes(l.artN))).map(l => l.nom)
  }
  const lotParNom = (nom) => {
    const n = norm(nom)
    if (!n) return ''
    const hit = lotsNorm.find(l => l.nomN === n)
    return hit ? hit.nom : ''
  }
  // Artisan → 1 lot : on le prend. Plusieurs lots du même artisan → on ne devine pas (lot_nom du
  // modèle seulement s'il est l'un d'eux, sinon "generale"). Pas d'artisan → lot_nom s'il est réel.
  const resoudreLot = (artisan, lotNom) => {
    const parArt = lotsParArtisan(artisan)
    const parNom = lotParNom(lotNom)
    if (parArt.length === 1) return parArt[0]
    if (parArt.length > 1) return parArt.includes(parNom) ? parNom : ''
    return parNom
  }
  const actions = raw.actions.slice(0, 80).map(a => {
    const statut = STATUT_SET.has(a?.statut) ? a.statut : 'en_cours'
    const lot_nom = resoudreLot(a?.artisan, a?.lot_nom)
    return {
      titre: typeof a?.titre === 'string' ? a.titre.trim().slice(0, 120) : '',
      texte: typeof a?.texte === 'string' ? a.texte.trim().slice(0, 1500) : '',
      portee: lot_nom ? 'lot' : 'generale',
      lot_nom,
      statut,
      statut_date: dateOk(a?.statut_date),
    }
  }).filter(a => a.texte || a.titre)

  // Dates de planning consolidées : une période par lot. lot_nom coercé sur un vrai lot (sinon ignoré).
  const dates = (Array.isArray(raw.dates) ? raw.dates : []).slice(0, 80).map(d => {
    const lot_nom = lotParNom(d?.lot_nom)
    let debut = dateOk(d?.date_debut), fin = dateOk(d?.date_fin)
    if (!lot_nom || !debut) return null
    if (!fin || fin < debut) fin = debut
    return { lot_nom, date_debut: debut, date_fin: fin }
  }).filter(Boolean)

  return NextResponse.json({ actions, dates, rapports: blocs.length, tronquee })
}
