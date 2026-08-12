// app/api/actions/suggest/route.js
// Aide IA à la rédaction d'ACTIONS de compte-rendu (Lot 1c-3). Claude lit des NOTES brutes
// (texte collé, dictée…) et renvoie une LISTE d'actions candidates structurées. L'humaine
// COCHE et valide avant insertion — rien n'est écrit en base ici. L'IA n'est jamais un
// passage obligé (le système marche sans). Mêmes garde-fous que /api/fiches/extract.
//
// IN  : { notes: string, lots?: [{id, nom}] }
// OUT : { actions: [{ titre, texte, portee, lot_nom, statut, statut_date }] }

import { NextResponse } from 'next/server'
import { requireRole } from '../../../lib/api-auth'

export const maxDuration = 60

const CLAUDE_TIMEOUT_MS = 45_000
const CLAUDE_RETRIES = 2
const RETRIABLE_STATUS = new Set([408, 429, 500, 502, 503, 504, 529])
const MAX_NOTES = 12_000

// 16 statuts figés (mêmes clés que le CHECK de la table `actions`).
const STATUTS = ['en_cours', 'date_limite', 'urgent', 'refuse', 'en_retard', 'rappel',
  'en_attente', 'a_surveiller', 'programme', 'a_programmer', 'information',
  'quitus_transmis', 'garder_memoire', 'constate', 'acte', 'cloture']
const STATUT_SET = new Set(STATUTS)

const SYSTEM_PROMPT = `Tu es un assistant pour une courtière en travaux / AMO (illiCO travaux). On te donne des NOTES BRUTES prises pendant une visite de chantier (bullet points, phrases incomplètes, dictée…). Tu dois en extraire une LISTE d'ACTIONS / remarques de compte-rendu, structurées.

Réponds STRICTEMENT par un objet JSON (aucun texte autour, pas de markdown) :
{
  "actions": [
    {
      "titre": chaîne,        // titre court de l'action (~60 caractères), optionnel ("" si rien)
      "texte": chaîne,        // la remarque rédigée clairement, 1 à 3 phrases
      "portee": "generale" | "lot",   // "lot" si l'action concerne un corps d'état / artisan précis, sinon "generale"
      "lot_nom": chaîne,      // si portee="lot" : le nom du lot concerné, choisi PARMI la liste fournie si possible ; sinon ""
      "statut": une des valeurs EXACTES: ${STATUTS.join(', ')},
      "statut_date": "AAAA-MM-JJ" | ""   // date d'échéance/statut si une date est mentionnée dans les notes, sinon ""
    }
  ]
}

RÈGLES :
- Écris TOUJOURS en FRANÇAIS, même si les notes sont dans une autre langue.
- N'invente rien : uniquement ce qui est dans les notes. Une note = potentiellement une action.
- "statut" par défaut = "en_cours". Utilise "date_limite" ou "a_programmer" si une échéance est donnée ; "information" pour une simple info ; "cloture" seulement si la note dit explicitement que c'est réglé.
- Si une DATE est mentionnée (ex. "avant le 12/02", "semaine prochaine" → estime au mieux en AAAA-MM-JJ), mets-la dans "statut_date".
- Rattache à un lot (portee="lot") seulement si c'est clair, en choisissant "lot_nom" dans la liste fournie quand elle correspond.`

function parseJsonSafe(text) {
  if (!text) return null
  try { return JSON.parse(text) } catch { /* isole l'objet */ }
  const i = text.indexOf('{')
  const j = text.lastIndexOf('}')
  if (i === -1 || j === -1 || j <= i) return null
  try { return JSON.parse(text.slice(i, j + 1)) } catch { return null }
}

export async function POST(request) {
  const auth = await requireRole(request, ['admin', 'agente'])
  if (auth.error) return auth.error

  let body
  try { body = await request.json() } catch { body = {} }
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, MAX_NOTES) : ''
  if (!notes) return NextResponse.json({ error: 'notes manquantes' }, { status: 400 })
  const lots = Array.isArray(body.lots) ? body.lots.filter(l => l?.nom).map(l => l.nom).slice(0, 60) : []

  const userText = `Notes de visite :\n${notes}\n\nLots disponibles (pour "lot_nom") : ${lots.length ? lots.join(', ') : 'aucun'}\n\nRenvoie les actions au format JSON demandé, en français.`

  const claudeBody = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 2500,
    temperature: 0,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }],
  })

  let claudeRes = null
  let derniereErreur = null
  for (let tentative = 0; tentative <= CLAUDE_RETRIES; tentative++) {
    if (tentative > 0) await new Promise(r => setTimeout(r, 800 * 2 ** (tentative - 1)))
    const ctrl = new AbortController()
    const minuteur = setTimeout(() => ctrl.abort(), CLAUDE_TIMEOUT_MS)
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: claudeBody,
        signal: ctrl.signal,
      })
      clearTimeout(minuteur)
      if (res.ok) { claudeRes = res; break }
      if (RETRIABLE_STATUS.has(res.status) && tentative < CLAUDE_RETRIES) { derniereErreur = new Error(`Claude API ${res.status}`); continue }
      claudeRes = res
      break
    } catch (e) {
      clearTimeout(minuteur)
      derniereErreur = e
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
  const actions = raw.actions.slice(0, 40).map(a => {
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

  return NextResponse.json({ actions })
}
