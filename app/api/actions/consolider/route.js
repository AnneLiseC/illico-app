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

export const maxDuration = 120     // Vercel Pro : on peut dépasser 60 s pour cette génération lourde

const CLAUDE_TIMEOUT_MS = 100_000  // 6 rapports d'un coup = génération longue ; marge sous maxDuration=120
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
      "texte": chaîne,        // le point rédigé en UNE seule phrase concise (≤ 200 caractères), à jour
      "portee": "generale" | "lot",
      "lot_nom": chaîne,      // si portee="lot" : nom du lot, choisi PARMI la liste fournie si possible ; sinon ""
      "statut": une des valeurs EXACTES: ${STATUTS.join(', ')},
      "statut_date": "AAAA-MM-JJ" | ""
    }
  ]
}

RÈGLES DE CONSOLIDATION (le cœur du travail) :
- DÉDOUBLONNE : un même point réel qui revient dans plusieurs rapports = UNE SEULE action. Ne le répète JAMAIS. Garde la formulation et surtout le STATUT du rapport le PLUS RÉCENT où il apparaît.
- MET À JOUR : si un point évolue (ex. "en attente" → "en cours" → "réalisé"), reflète UNIQUEMENT son DERNIER état connu.
- EXCLUS ce qui est clairement TERMINÉ / résolu / réceptionné dans un rapport ultérieur : ne le mets pas dans la liste. (Ne garde un point achevé QUE s'il reste une réserve ou un suivi.)
- GARDE tel quel un point mentionné une seule fois et non contredit plus tard.
- N'invente rien : uniquement ce qui est écrit dans les rapports.
- Écris TOUJOURS en FRANÇAIS.
- statut_date : la date d'échéance/statut la plus récente et pertinente si une date est donnée, sinon "".
- Rattache à un lot (portee="lot") seulement si c'est clair, en choisissant "lot_nom" dans la liste fournie quand elle correspond.

OBJECTIF : la liste finale doit être ce qu'une AMO garderait sous les yeux aujourd'hui — chaque point ouvert UNE fois, à jour, sans redite d'un rapport à l'autre.

CONCISION (important pour la rapidité) : sois ÉCONOME. UNE phrase courte par action, pas de paragraphe. Regroupe finement : vise une liste resserrée (idéalement ≤ 50 actions), pas un catalogue.`

function parseJsonSafe(text) {
  if (!text) return null
  try { return JSON.parse(text) } catch { /* isole l'objet */ }
  const i = text.indexOf('{'); const j = text.lastIndexOf('}')
  if (i === -1 || j === -1 || j <= i) return null
  try { return JSON.parse(text.slice(i, j + 1)) } catch { return null }
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

  const lots = Array.isArray(body.lots) ? body.lots.filter(l => l?.nom).map(l => l.nom).slice(0, 60) : []

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

  const userText = `Voici ${blocs.length} rapport(s) de visite du même chantier, du plus ancien au plus récent :\n\n${blocs.join('\n\n')}\n\nLots disponibles (pour "lot_nom") : ${lots.length ? lots.join(', ') : 'aucun'}\n\nConsolide-les en UNE liste d'actions ouvertes dédoublonnée et à jour, au format JSON demandé, en français.`

  const claudeBody = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 6000,
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
  const raw = parseJsonSafe(claudeData.content?.[0]?.text || '')
  if (!raw || !Array.isArray(raw.actions)) return NextResponse.json({ error: 'Réponse IA illisible' }, { status: 502 })

  // Coercition : on ne fait jamais confiance à la sortie brute.
  const dateOk = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)) ? s : null
  const actions = raw.actions.slice(0, 80).map(a => {
    const portee = a?.portee === 'lot' ? 'lot' : 'generale'
    const statut = STATUT_SET.has(a?.statut) ? a.statut : 'en_cours'
    return {
      titre: typeof a?.titre === 'string' ? a.titre.trim().slice(0, 120) : '',
      texte: typeof a?.texte === 'string' ? a.texte.trim().slice(0, 1500) : '',
      portee,
      lot_nom: portee === 'lot' && typeof a?.lot_nom === 'string' ? a.lot_nom.trim().slice(0, 120) : '',
      statut,
      statut_date: dateOk(a?.statut_date),
    }
  }).filter(a => a.texte || a.titre)

  return NextResponse.json({ actions, rapports: blocs.length })
}
