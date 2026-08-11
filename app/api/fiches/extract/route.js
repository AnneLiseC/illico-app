// app/api/fiches/extract/route.js
// Pré-remplissage IA d'une FICHE TECHNIQUE : Claude LIT le PDF de la fiche et renvoie un
// nom court + une description CLAIRE EN FRANÇAIS (même si la fiche est dans une autre
// langue). L'humaine relit toujours avant d'enregistrer — rien n'est écrit en base ici.
// Mêmes garde-fous que /api/devis/extract : auth, cap taille, signature PDF, timeout,
// retries, garde de parse JSON.
//
// IN  : { pdf_base64, filename? }
// OUT : { nom, description }

import { NextResponse } from 'next/server'
import { requireRole } from '../../../lib/api-auth'

export const maxDuration = 60

const MAX_PDF_BYTES = 10 * 1024 * 1024
const CLAUDE_TIMEOUT_MS = 45_000
const CLAUDE_RETRIES = 2
const RETRIABLE_STATUS = new Set([408, 429, 500, 502, 503, 504, 529])

const SYSTEM_PROMPT = `Tu es un assistant pour une courtière en travaux (illiCO travaux). On te fournit le PDF d'une FICHE TECHNIQUE (produit, matériau, équipement, système…). Résume-la pour l'ajouter à un dossier chantier.

Réponds STRICTEMENT par un objet JSON (aucun texte autour, pas de balises markdown) avec ces clés :
{
  "nom": chaîne,          // titre court et clair de la fiche (le produit / matériau / équipement concerné), ~60 caractères max
  "description": chaîne   // explication claire de ce dont il s'agit et des caractéristiques utiles (usage, dimensions, matière, performance, référence…), 1 à 4 phrases
}

RÈGLES :
- Écris TOUJOURS en FRANÇAIS, MÊME si la fiche est rédigée dans une autre langue : traduis, ne recopie pas la langue d'origine.
- N'invente rien : base-toi uniquement sur le document. Si aucun nom clair n'apparaît, propose un titre générique cohérent avec le contenu.
- La "description" doit aider une personne non spécialiste à comprendre le produit, sans recopier toute la fiche.`

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
  const b64 = typeof body.pdf_base64 === 'string' ? body.pdf_base64.replace(/^data:.*;base64,/, '') : null
  if (!b64) return NextResponse.json({ error: 'pdf_base64 manquant' }, { status: 400 })

  let buffer
  try { buffer = Buffer.from(b64, 'base64') } catch { return NextResponse.json({ error: 'PDF illisible' }, { status: 400 }) }
  if (!buffer.length) return NextResponse.json({ error: 'PDF vide' }, { status: 400 })
  if (buffer.length > MAX_PDF_BYTES) return NextResponse.json({ error: 'PDF trop volumineux (max 10 Mo)' }, { status: 413 })
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') return NextResponse.json({ error: 'Le fichier n\'est pas un PDF' }, { status: 400 })

  const claudeBody = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    temperature: 0,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
        { type: 'text', text: 'Résume cette fiche technique au format JSON demandé, en français.' },
      ],
    }],
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
      if (RETRIABLE_STATUS.has(res.status) && tentative < CLAUDE_RETRIES) {
        derniereErreur = new Error(`Claude API ${res.status}`)
        continue
      }
      claudeRes = res
      break
    } catch (e) {
      clearTimeout(minuteur)
      derniereErreur = e
    }
  }

  if (!claudeRes) {
    return NextResponse.json({ error: `Service IA indisponible (${derniereErreur?.message || 'timeout'}). Réessaie dans un instant.` }, { status: 503 })
  }
  if (!claudeRes.ok) {
    const err = await claudeRes.json().catch(() => ({}))
    return NextResponse.json({ error: err.error?.message || 'Erreur Claude API' }, { status: 500 })
  }

  const claudeData = await claudeRes.json()
  const rawText = claudeData.content?.[0]?.text || ''
  const raw = parseJsonSafe(rawText)
  if (!raw) return NextResponse.json({ error: 'Réponse IA illisible', raw: rawText }, { status: 502 })

  // Coercition simple (on ne fait jamais confiance à la sortie brute) + garde-fous de taille.
  const nom = typeof raw.nom === 'string' ? raw.nom.trim().slice(0, 120) : ''
  const description = typeof raw.description === 'string' ? raw.description.trim().slice(0, 1500) : ''

  return NextResponse.json({ nom, description })
}
