// app/api/artisans/specialites/extract/route.js
// Déduit les SPÉCIALITÉS (corps d'état garantis) d'un artisan à partir de son attestation
// d'assurance DÉCENNALE : Claude lit le PDF et renvoie la liste des activités garanties.
// La route (service_role) crée au besoin les spécialités (table `specialites` en lecture
// seule côté client) et les rattache à l'artisan (`artisans_specialites`).
// Mêmes garde-fous IA que /api/fiches/extract : auth, cap taille, signature PDF, timeout, retries.
//
// IN  : { artisanId }
// OUT : { specialites: [nom, ...] }  (la liste finale rattachée à l'artisan)

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireRole } from '../../../../lib/api-auth'

export const maxDuration = 60

const MAX_PDF_BYTES = 10 * 1024 * 1024
const CLAUDE_TIMEOUT_MS = 45_000
const CLAUDE_RETRIES = 2
const RETRIABLE_STATUS = new Set([408, 429, 500, 502, 503, 504, 529])

let _admin
function getSupabaseAdmin() {
  if (!_admin) _admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _admin
}

const SYSTEM_PROMPT = `Tu es un assistant pour une courtière en travaux (illiCO travaux). On te fournit l'attestation d'assurance DÉCENNALE d'un artisan. Ton rôle : lister les ACTIVITÉS / CORPS D'ÉTAT réellement garantis par cette attestation.

Réponds STRICTEMENT par un objet JSON (aucun texte autour, pas de balises markdown) :
{ "specialites": ["chaîne", ...] }

RÈGLES :
- Écris TOUJOURS en FRANÇAIS, même si le document est rédigé dans une autre langue.
- Chaque spécialité = un corps d'état clair et COURT (ex. « Plomberie », « Électricité », « Carrelage », « Peinture », « Menuiserie », « Maçonnerie », « Plâtrerie », « Couverture », « Isolation », « Charpente », « Chauffage », « Terrassement »…).
- Normalise : un nom générique par métier, au singulier, première lettre en majuscule. Aucun doublon, aucune phrase, aucun numéro de garantie ni référence de contrat.
- N'invente RIEN : uniquement les activités effectivement mentionnées comme garanties. Si rien n'est lisible, renvoie une liste vide.`

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
  const artisanId = typeof body.artisanId === 'string' ? body.artisanId : null
  if (!artisanId) return NextResponse.json({ error: 'artisanId manquant' }, { status: 400 })

  const db = getSupabaseAdmin()

  // Artisan + contrôle d'appartenance (service_role contourne la RLS, on la reflète).
  const { data: artisan } = await db.from('artisans')
    .select('id, societe_id, decennale_url').eq('id', artisanId).maybeSingle()
  if (!artisan || artisan.societe_id !== auth.profile.societe_id) {
    return NextResponse.json({ error: 'Artisan introuvable' }, { status: 404 })
  }
  if (!artisan.decennale_url) {
    return NextResponse.json({ error: 'Aucune attestation décennale enregistrée pour cet artisan.' }, { status: 400 })
  }

  // Téléchargement du PDF (bucket documents).
  const { data: blob, error: dlErr } = await db.storage.from('documents').download(artisan.decennale_url)
  if (dlErr || !blob) return NextResponse.json({ error: 'Décennale introuvable en stockage.' }, { status: 404 })
  const buffer = Buffer.from(await blob.arrayBuffer())
  if (!buffer.length) return NextResponse.json({ error: 'Décennale vide' }, { status: 400 })
  if (buffer.length > MAX_PDF_BYTES) return NextResponse.json({ error: 'PDF trop volumineux (max 10 Mo)' }, { status: 413 })
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    return NextResponse.json({ error: "L'attestation décennale n'est pas un PDF." }, { status: 400 })
  }
  const b64 = buffer.toString('base64')

  const claudeBody = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    temperature: 0,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
        { type: 'text', text: "Liste les corps d'état garantis par cette attestation décennale, au format JSON demandé, en français." },
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
      if (RETRIABLE_STATUS.has(res.status) && tentative < CLAUDE_RETRIES) { derniereErreur = new Error(`Claude API ${res.status}`); continue }
      claudeRes = res
      break
    } catch (e) {
      clearTimeout(minuteur)
      derniereErreur = e
    }
  }

  if (!claudeRes) return NextResponse.json({ error: `Service IA indisponible (${derniereErreur?.message || 'timeout'}). Réessaie dans un instant.` }, { status: 503 })
  if (!claudeRes.ok) {
    const err = await claudeRes.json().catch(() => ({}))
    return NextResponse.json({ error: err.error?.message || 'Erreur Claude API' }, { status: 500 })
  }

  const claudeData = await claudeRes.json()
  const rawText = claudeData.content?.[0]?.text || ''
  const raw = parseJsonSafe(rawText)
  const bruts = Array.isArray(raw?.specialites) ? raw.specialites : []

  // Normalisation : trim, une majuscule, longueur bornée, unicité insensible à la casse.
  const seen = new Set()
  const noms = []
  for (let n of bruts) {
    if (typeof n !== 'string') continue
    n = n.trim().replace(/\s+/g, ' ').slice(0, 60)
    if (!n) continue
    const cle = n.toLowerCase()
    if (seen.has(cle)) continue
    seen.add(cle)
    noms.push(n.charAt(0).toUpperCase() + n.slice(1))
  }
  if (!noms.length) return NextResponse.json({ specialites: [], message: 'Aucune spécialité détectée dans la décennale.' })

  // Création/rattachement (service_role : la table specialites n'a pas de policy INSERT côté client).
  const specialiteIds = []
  for (const nom of noms) {
    const { data: sp, error: upErr } = await db.from('specialites')
      .upsert({ nom }, { onConflict: 'nom' }).select('id').single()
    if (!upErr && sp?.id) specialiteIds.push(sp.id)
  }
  if (specialiteIds.length) {
    await db.from('artisans_specialites')
      .upsert(specialiteIds.map(sid => ({ artisan_id: artisanId, specialite_id: sid })), { onConflict: 'artisan_id,specialite_id' })
  }

  return NextResponse.json({ specialites: noms })
}
