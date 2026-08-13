// app/api/lots/dates/route.js
// Aide IA au PLANNING (Lot 4-6) : Claude lit des NOTES libres (mail d'artisan, compte-rendu,
// texte collé) et en extrait des PÉRIODES d'intervention par lot. Rien n'est écrit : l'humaine
// relit et valide chaque date avant application. L'IA n'est jamais un passage obligé.
//
// IN  : { notes: string, lots: [{id, nom, artisan}], today?: 'YYYY-MM-DD' }
// OUT : { propositions: [{ lot_id, date_debut, date_fin }] }

import { NextResponse } from 'next/server'
import { requireRole } from '../../../lib/api-auth'

export const maxDuration = 60

const CLAUDE_TIMEOUT_MS = 45_000
const CLAUDE_RETRIES = 2
const RETRIABLE_STATUS = new Set([408, 429, 500, 502, 503, 504, 529])
const MAX_NOTES = 12_000

const SYSTEM_PROMPT = `Tu es un assistant de PLANNING pour une courtière en travaux / AMO (illiCO travaux). On te donne des NOTES libres (mail d'artisan, compte-rendu de visite, message…) et la liste des LOTS du chantier. Tu dois en extraire les PÉRIODES d'intervention (date de début et de fin) pour les lots concernés.

Réponds STRICTEMENT par un objet JSON (aucun texte autour, pas de markdown) :
{
  "propositions": [
    { "lot_id": "<id d'un lot de la liste>", "date_debut": "AAAA-MM-JJ", "date_fin": "AAAA-MM-JJ" }
  ]
}

RÈGLES :
- N'INVENTE RIEN : ne propose une période que si les notes indiquent clairement des dates pour ce lot.
- "lot_id" DOIT être un id présent dans la liste fournie (choisis le lot par son nom / son artisan). Si aucun lot ne correspond, n'émets pas de proposition.
- Dates au format AAAA-MM-JJ. Pour une échéance relative ("semaine prochaine", "à partir de lundi"), estime au mieux à partir de la date du jour fournie.
- Si seule une date de début est donnée sans fin, mets date_fin = date_debut.
- date_fin ne peut pas être avant date_debut.`

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
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, MAX_NOTES) : ''
  if (!notes) return NextResponse.json({ error: 'notes manquantes' }, { status: 400 })
  const lots = Array.isArray(body.lots) ? body.lots.filter(l => l?.id && l?.nom).slice(0, 80) : []
  if (!lots.length) return NextResponse.json({ propositions: [] })
  const today = /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : null
  const idSet = new Set(lots.map(l => String(l.id)))

  const listeLots = lots.map(l => `- id=${l.id} · « ${l.nom} »${l.artisan ? ' · ' + l.artisan : ''}`).join('\n')
  const userText = `Date du jour : ${today || 'inconnue'}\n\nLots du chantier :\n${listeLots}\n\nNotes :\n${notes}\n\nRenvoie les périodes au format JSON demandé.`

  const claudeBody = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
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
    } catch (e) { clearTimeout(minuteur); derniereErreur = e }
  }

  if (!claudeRes) return NextResponse.json({ error: `Service IA indisponible (${derniereErreur?.message || 'timeout'}). Réessaie.` }, { status: 503 })
  if (!claudeRes.ok) {
    const err = await claudeRes.json().catch(() => ({}))
    return NextResponse.json({ error: err.error?.message || 'Erreur Claude API' }, { status: 500 })
  }

  const raw = parseJsonSafe((await claudeRes.json()).content?.[0]?.text || '')
  if (!raw || !Array.isArray(raw.propositions)) return NextResponse.json({ error: 'Réponse IA illisible' }, { status: 502 })

  const dateOk = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)) ? s : null
  const propositions = raw.propositions
    .map(p => {
      const lot_id = idSet.has(String(p?.lot_id)) ? String(p.lot_id) : null
      let d = dateOk(p?.date_debut), f = dateOk(p?.date_fin)
      if (!lot_id || !d) return null
      if (!f) f = d
      if (f < d) f = d
      return { lot_id, date_debut: d, date_fin: f }
    })
    .filter(Boolean)
    .slice(0, 80)

  return NextResponse.json({ propositions })
}
