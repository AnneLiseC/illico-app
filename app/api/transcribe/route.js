// app/api/transcribe/route.js
// Transcription d'un audio de visite/RDV en texte (Deepgram Nova-3, français).
// Étape AMONT du CR : le texte produit alimente `notesBrutes` de /api/cr.
//
// Méthode : l'audio est déjà déposé en Storage (bucket `documents`, sous
// chantiers/{dossierId}/audio/) par le client. On donne à Deepgram une URL
// SIGNÉE courte → Deepgram télécharge et transcrit lui-même (aucun gros buffer
// en mémoire dans la fonction serverless).

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole } from '../../lib/api-auth'

export const maxDuration = 300   // transcription d'une longue visite peut durer

let _supabaseAdmin
function getSupabaseAdmin() {
  if (!_supabaseAdmin) _supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _supabaseAdmin
}

// Met en forme la réponse Deepgram : si la diarisation a produit des tours de
// parole, on les rend lisibles (« Interlocuteur 1 : … ») ; sinon transcript brut.
export function formatTranscript(dgJson) {
  const utt = dgJson?.results?.utterances
  if (Array.isArray(utt) && utt.length) {
    return utt.map(u => `Interlocuteur ${(u.speaker ?? 0) + 1} : ${u.transcript}`).join('\n')
  }
  return dgJson?.results?.channels?.[0]?.alternatives?.[0]?.transcript || ''
}

export async function POST(request) {
  const auth = await requireRole(request, ['admin', 'agente'])
  if (auth.error) return auth.error
  try {
    if (!process.env.DEEPGRAM_API_KEY) {
      return NextResponse.json({ error: 'Transcription non configurée (clé Deepgram manquante)' }, { status: 500 })
    }
    const { dossierId, audioPath } = await request.json()
    if (!dossierId || !audioPath) {
      return NextResponse.json({ error: 'Paramètres manquants (dossierId, audioPath)' }, { status: 400 })
    }

    // Contrôle d'appartenance — service_role contourne la RLS, on la reflète ici
    // (identique à /api/cr) : admin = même société, agente = même agence. 404 uniforme.
    const { data: dossier } = await getSupabaseAdmin()
      .from('dossiers').select('id, societe_id, agence_id').eq('id', dossierId).single()
    const dossierAutorise = dossier && (
      auth.profile.role === 'admin'
        ? dossier.societe_id === auth.profile.societe_id
        : dossier.agence_id === auth.profile.agence_id
    )
    if (!dossierAutorise) {
      return NextResponse.json({ error: 'Dossier introuvable' }, { status: 404 })
    }

    // audioPath du body : jamais de confiance. Doit être sous le préfixe tenant.
    if (!audioPath.startsWith(`chantiers/${dossierId}/audio/`)) {
      return NextResponse.json({ error: 'Audio non rattaché au dossier' }, { status: 400 })
    }

    // URL signée courte → Deepgram va chercher le fichier lui-même.
    const { data: signed, error: signErr } = await getSupabaseAdmin()
      .storage.from('documents').createSignedUrl(audioPath, 600)
    if (signErr || !signed?.signedUrl) {
      return NextResponse.json({ error: 'Audio introuvable en Storage' }, { status: 404 })
    }

    const params = new URLSearchParams({
      model: 'nova-3', language: 'fr',
      diarize: 'true', punctuate: 'true', smart_format: 'true', utterances: 'true',
    })
    const dgRes = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: signed.signedUrl }),
    })
    // Deepgram a fini de lire l'audio (succès OU échec) → purge immédiate du
    // fichier en Storage. Aucun audio ne s'accumule : la seule donnée durable est
    // le transcript (sauvegardé dans notes_brutes du CR). Pas besoin de cron.
    try { await getSupabaseAdmin().storage.from('documents').remove([audioPath]) }
    catch (e) { console.error('Purge audio échouée:', audioPath, e.message) }
    if (!dgRes.ok) {
      const errTxt = await dgRes.text()
      console.error('Deepgram error:', dgRes.status, errTxt)
      return NextResponse.json({ error: 'Échec de la transcription' }, { status: 502 })
    }
    const dgJson = await dgRes.json()
    const transcript = formatTranscript(dgJson)
    if (!transcript.trim()) {
      return NextResponse.json({ error: 'Transcription vide (audio inaudible ?)' }, { status: 422 })
    }
    return NextResponse.json({ transcript })
  } catch (err) {
    console.error('Transcribe error:', err.message, err.stack)
    return NextResponse.json({ error: err.message || 'Erreur serveur' }, { status: 500 })
  }
}
