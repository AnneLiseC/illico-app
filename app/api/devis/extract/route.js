// app/api/devis/extract/route.js
// Pré-remplissage IA de la modale de création de devis : Claude LIT le PDF du devis et
// renvoie un JSON strict (HT / TVA / TTC, dates, description des travaux, entreprise).
// L'humaine RELIT toujours dans la modale avant d'enregistrer — la sortie n'est jamais
// écrite directement en base. Mêmes garde-fous que /api/cr : auth, cap taille, timeout,
// retries, garde de parse JSON. La normalisation (coercition, règle sans-TVA) est faite
// côté serveur via app/lib/devis.
//
// IN  : { pdf_base64, filename? }   (le PDF n'est pas encore en storage à la création)
// OUT : { extraction: {...normalisé...}, avertissement? }

import { NextResponse } from 'next/server'
import { requireRole } from '../../../lib/api-auth'
import { normaliserExtractionDevis } from '../../../lib/devis'

export const maxDuration = 60

const MAX_PDF_BYTES = 10 * 1024 * 1024        // 10 Mo : un devis PDF tient largement
const CLAUDE_TIMEOUT_MS = 45_000
const CLAUDE_RETRIES = 2                        // 3 tentatives
const RETRIABLE_STATUS = new Set([408, 429, 500, 502, 503, 504, 529])

const SYSTEM_PROMPT = `Tu es un assistant d'extraction de données pour une courtière en travaux (illiCO travaux). On te fournit le PDF d'un DEVIS d'artisan. Extrais UNIQUEMENT les informations réellement présentes dans le document. N'invente RIEN : si une donnée est absente ou illisible, mets null.

Réponds STRICTEMENT par un objet JSON (aucun texte autour, pas de balises markdown) avec ces clés :
{
  "montant_ht": nombre|null,        // total HT en euros (nombre, sans symbole)
  "montant_tva": nombre|null,       // montant de la TVA en euros
  "taux_tva": nombre|null,          // taux de TVA en % si indiqué (ex: 10, 20, 5.5)
  "montant_ttc": nombre|null,       // total TTC en euros
  "date_reception": "AAAA-MM-JJ"|null,  // date d'émission du devis
  "date_limite": "AAAA-MM-JJ"|null,     // date de validité / limite si indiquée
  "entreprise": chaîne|null,        // nom de l'entreprise émettrice du devis
  "siret": chaîne|null,             // SIRET si présent
  "description": chaîne|null        // résumé du PÉRIMÈTRE des travaux : qui fait quoi (lots/postes principaux), en 1 à 4 phrases
}

RÈGLES :
- Lis les lignes HT, TVA et TTC. S'il n'y a PAS de TVA (franchise en base, "TVA non applicable art. 293 B du CGI"), alors HT et TTC sont ÉGAUX.
- Les montants sont des nombres décimaux (point décimal), sans espace ni symbole €.
- Ne prends que le TOTAL du devis (pas les sous-totaux par ligne) pour montant_ht/ttc.
- "description" doit décrire les travaux prévus (le périmètre), pas recopier le devis en entier.`

// Extrait le premier objet JSON d'une réponse (tolère un éventuel enrobage).
function parseJsonSafe(text) {
  if (!text) return null
  try { return JSON.parse(text) } catch { /* essaie d'isoler l'objet */ }
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

  // Taille (la longueur base64 ≈ 4/3 des octets) + signature %PDF (defense in depth :
  // on n'envoie pas n'importe quel binaire à l'IA).
  let buffer
  try { buffer = Buffer.from(b64, 'base64') } catch { return NextResponse.json({ error: 'PDF illisible' }, { status: 400 }) }
  if (!buffer.length) return NextResponse.json({ error: 'PDF vide' }, { status: 400 })
  if (buffer.length > MAX_PDF_BYTES) return NextResponse.json({ error: 'PDF trop volumineux (max 10 Mo)' }, { status: 413 })
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') return NextResponse.json({ error: 'Le fichier n\'est pas un PDF' }, { status: 400 })

  const claudeBody = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    temperature: 0,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
        { type: 'text', text: 'Extrais les données de ce devis au format JSON demandé.' },
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

  // Coercition + validation + règle métier (sans-TVA → HT=TTC) côté serveur : on ne fait
  // JAMAIS confiance aux valeurs brutes de l'IA.
  const extraction = normaliserExtractionDevis(raw)
  const avertissement = extraction.warnings?.includes('ttc_inferieur_ht')
    ? 'Le TTC lu est inférieur au HT — vérifie les montants.'
    : (extraction.montant_ht == null && extraction.montant_ttc == null)
      ? 'Aucun montant lisible dans le PDF — saisis-les à la main.'
      : undefined

  return NextResponse.json({ extraction, avertissement })
}
