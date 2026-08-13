// app/api/lots/suggest/route.js
// Aide IA au pré-remplissage des LOTS / SOUS-LOTS (Lot 4-1b). Comme /api/devis/extract lit le
// PDF pour pré-remplir les montants, ici Claude LIT chaque PDF de devis déjà en storage et en
// déduit UN lot (corps d'état) + ses SOUS-LOTS (postes réels du devis). Rien n'est écrit en
// base : l'humaine RELIT et valide dans le panneau avant insertion. L'IA n'est jamais un
// passage obligé (le bouton déterministe reste). Mêmes garde-fous que /api/devis/extract.
//
// IN  : { dossier_id }
// OUT : { propositions: [{ artisan_id, artisan_nom, lot_nom, sous_lots: [string], source: 'pdf'|'metier', note? }] }

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole, assertDossierAccessible } from '../../../lib/api-auth'

export const maxDuration = 60

const MAX_PDF_BYTES = 10 * 1024 * 1024
const MAX_DEVIS = 20                      // borne : on ne lit pas 100 PDF d'un coup
const CLAUDE_TIMEOUT_MS = 40_000
const CLAUDE_RETRIES = 1
const RETRIABLE_STATUS = new Set([408, 429, 500, 502, 503, 504, 529])

let _admin
function admin() {
  if (!_admin) _admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _admin
}

const SYSTEM_PROMPT = `Tu es un assistant pour une courtière en travaux / AMO (illiCO travaux). On te donne le PDF d'un DEVIS d'artisan. Tu dois en déduire la structure d'un LOT de chantier et de ses SOUS-LOTS, pour un planning (Gantt).

Réponds STRICTEMENT par un objet JSON (aucun texte autour, pas de markdown) :
{
  "lot_nom": chaîne,        // nom du lot = corps d'état / nature des travaux (ex: "Plomberie", "Électricité", "Menuiseries extérieures")
  "sous_lots": [chaîne]     // les POSTES PRINCIPAUX réellement présents dans le devis, 0 à 8 items courts (ex: "Alimentation eau", "Évacuation", "Pose sanitaires")
}

RÈGLES :
- Écris en FRANÇAIS.
- N'INVENTE RIEN : les sous-lots doivent correspondre à des postes/lignes réellement présents dans le devis. Si le devis n'a pas de détail exploitable, renvoie "sous_lots": [].
- Regroupe les lignes similaires en un sous-lot cohérent (ne recopie pas chaque ligne unitaire). Vise des tâches planifiables, pas des références produit.
- "lot_nom" court et clair (le corps d'état), pas la raison sociale de l'entreprise.`

function parseJsonSafe(text) {
  if (!text) return null
  try { return JSON.parse(text) } catch { /* isole l'objet */ }
  const i = text.indexOf('{'); const j = text.lastIndexOf('}')
  if (i === -1 || j === -1 || j <= i) return null
  try { return JSON.parse(text.slice(i, j + 1)) } catch { return null }
}

async function claudeExtraireLot(b64) {
  const claudeBody = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    temperature: 0,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
        { type: 'text', text: 'Déduis le lot et ses sous-lots de ce devis, au format JSON demandé.' },
      ],
    }],
  })
  for (let t = 0; t <= CLAUDE_RETRIES; t++) {
    if (t > 0) await new Promise(r => setTimeout(r, 800))
    const ctrl = new AbortController()
    const minuteur = setTimeout(() => ctrl.abort(), CLAUDE_TIMEOUT_MS)
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: claudeBody, signal: ctrl.signal,
      })
      clearTimeout(minuteur)
      if (res.ok) return parseJsonSafe((await res.json()).content?.[0]?.text || '')
      if (RETRIABLE_STATUS.has(res.status) && t < CLAUDE_RETRIES) continue
      return null
    } catch { clearTimeout(minuteur) }
  }
  return null
}

export async function POST(request) {
  const auth = await requireRole(request, ['admin', 'agente'])
  if (auth.error) return auth.error

  let body; try { body = await request.json() } catch { body = {} }
  const dossierId = body.dossier_id
  if (!dossierId) return NextResponse.json({ error: 'dossier_id manquant' }, { status: 400 })
  // Appartenance au tenant AVANT toute lecture service_role (téléchargement des PDF de devis).
  const acces = await assertDossierAccessible(dossierId, auth.profile)
  if (acces.error) return acces.error

  const db = admin()
  const { data: devis, error } = await db.from('devis_artisans')
    .select('id, artisan_id, statut, devis_pdf_path, lots_ia_cache, artisan:artisans(id, entreprise, metier)')
    .eq('dossier_id', dossierId)
    .order('ordre').order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 1 lot par ARTISAN (on dédoublonne), devis non refusés, PDF prioritaire.
  const parArtisan = new Map()
  for (const d of (devis || [])) {
    if (d.statut === 'refuse') continue
    if (!d.artisan_id) continue
    const prev = parArtisan.get(d.artisan_id)
    if (!prev || (!prev.devis_pdf_path && d.devis_pdf_path)) parArtisan.set(d.artisan_id, d)
  }
  const liste = [...parArtisan.values()].slice(0, MAX_DEVIS)
  if (!liste.length) return NextResponse.json({ propositions: [] })

  const traiterDevis = async (d) => {
    const nom = d.artisan?.entreprise || d.artisan?.metier || 'Artisan'
    const base = { artisan_id: d.artisan_id, artisan_nom: nom }
    // Pas de PDF → repli sur le métier, sans sous-lots (on n'invente pas).
    if (!d.devis_pdf_path) {
      return { ...base, lot_nom: d.artisan?.metier || nom, sous_lots: [], source: 'metier', note: 'Pas de PDF — nom déduit du métier.' }
    }
    // CACHE : si CE MÊME PDF (même chemin) a déjà été analysé, on réutilise le résultat →
    // 0 appel Claude facturé. Profite aussi aux autres utilisateurs (cache posé sur la ligne).
    // Le chemin storage est un UUID : remplacer le PDF crée un nouveau chemin → le cache
    // devient automatiquement caduc (miss) sans invalidation manuelle.
    const cache = d.lots_ia_cache
    if (cache && cache.pdf_path === d.devis_pdf_path && typeof cache.lot_nom === 'string') {
      return {
        ...base,
        lot_nom: cache.lot_nom,
        sous_lots: Array.isArray(cache.sous_lots) ? cache.sous_lots : [],
        source: 'cache',
      }
    }
    try {
      const { data: blob, error: dlErr } = await db.storage.from('documents').download(d.devis_pdf_path)
      if (dlErr || !blob) throw new Error('download')
      const buffer = Buffer.from(await blob.arrayBuffer())
      if (!buffer.length || buffer.length > MAX_PDF_BYTES || buffer.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error('pdf')
      const raw = await claudeExtraireLot(buffer.toString('base64'))
      if (!raw) throw new Error('ia')
      const lotNom = typeof raw.lot_nom === 'string' && raw.lot_nom.trim() ? raw.lot_nom.trim().slice(0, 120) : (d.artisan?.metier || nom)
      const sousLots = Array.isArray(raw.sous_lots)
        ? raw.sous_lots.filter(s => typeof s === 'string' && s.trim()).map(s => s.trim().slice(0, 120)).slice(0, 8)
        : []
      // Écrit le cache pour ce PDF (réutilisé aux prochains clics et par les autres utilisateurs).
      // Best-effort : un échec d'écriture ne casse pas la proposition (on a déjà le résultat).
      try {
        await db.from('devis_artisans')
          .update({ lots_ia_cache: { pdf_path: d.devis_pdf_path, lot_nom: lotNom, sous_lots: sousLots, at: new Date().toISOString() } })
          .eq('id', d.id)
      } catch { /* best-effort */ }
      return { ...base, lot_nom: lotNom, sous_lots: sousLots, source: 'pdf' }
    } catch {
      return { ...base, lot_nom: d.artisan?.metier || nom, sous_lots: [], source: 'metier', note: 'PDF illisible — nom déduit du métier.' }
    }
  }

  // Pool de concurrence borné : évite la rafale de N appels Claude + N PDF de 10 Mo en mémoire.
  const CONCURRENCE = 4
  const propositions = new Array(liste.length)
  let curseur = 0
  const worker = async () => {
    while (curseur < liste.length) {
      const i = curseur++
      propositions[i] = await traiterDevis(liste[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCE, liste.length) }, worker))

  return NextResponse.json({ propositions })
}
