// app/api/transcribe/route.js
// Transcription d'un audio de visite/RDV en texte (Deepgram Nova-3, français),
// sur le point d'accès EUROPÉEN et avec exclusion de l'entraînement — voir le bloc
// de commentaires devant l'appel, plus bas : ces deux points sont contractuels.
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

    // ═════════════════════════════════════════════════════════════════════════════════
    // À PARTIR D'ICI, LA PURGE EST GARANTIE (corrigé le 16/09).
    //
    // `audioPath` vient d'être prouvé appartenir au dossier, et le dossier à l'appelant :
    // on peut donc supprimer ce fichier sans risque, et on DOIT le supprimer quoi qu'il
    // arrive ensuite.
    //
    // Avant, la purge était posée après l'appel Deepgram. Trois chemins la sautaient :
    // une exception réseau sur le `fetch` (on partait au catch), l'absence de clé d'API
    // (on sortait avant), et un échec de signature d'URL. L'audio restait alors en
    // Storage, sans rien pour le rattraper — il n'y a pas de cron de nettoyage. Le DPA
    // écrit « aucun audio ne s'accumule » : c'est le `finally` ci-dessous qui le tient,
    // pas une intention.
    //
    // `finally` s'exécute aussi sur un `return`, donc tous les chemins sont couverts.
    // ═════════════════════════════════════════════════════════════════════════════════
    try {
      if (!process.env.DEEPGRAM_API_KEY) {
        return NextResponse.json({ error: 'Transcription non configurée (clé Deepgram manquante)' }, { status: 500 })
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
        // ═══════════════════════════════════════════════════════════════════════════════
        // NE JAMAIS RETIRER CE PARAMÈTRE (16/09).
        //
        // Chez Deepgram, la participation au « Model Improvement Program » est le
        // comportement PAR DÉFAUT : sans ce paramètre, la requête est CONSERVÉE et
        // peut servir à entraîner leurs modèles. Leur liste publique de sous-traitants
        // (deepgram.com/privacy/subprocessors) porte d'ailleurs la mention « Interactive
        // Text & Audio » en face d'OpenAI et d'Anthropic — c'est cette exposition-là que
        // l'exclusion ferme.
        //
        // Avec mip_opt_out=true : zéro conservation. Deepgram ne stocke ni l'audio ni
        // le transcript après avoir rendu la réponse. Seules les métadonnées d'usage
        // (durée, modèle, code de retour) restent 90 jours, sans contenu.
        //
        // L'exclusion se demande REQUÊTE PAR REQUÊTE, et c'est ce paramètre qui la porte.
        // Une exclusion au niveau du COMPTE peut par ailleurs être obtenue auprès de
        // Deepgram, notamment par un accord de traitement limitant le traitement à la
        // seule fourniture du service. Elle vient EN COMPLÉMENT de ce paramètre, jamais
        // en remplacement : tant qu'on n'a pas la preuve écrite qu'elle couvre chaque
        // requête, c'est cette ligne qui garantit le résultat.
        //
        // Un enregistrement de visite contient la voix du client final. Le retirer
        // ferait sortir cette voix du périmètre décrit au DPA signé avec le franchisé.
        // ═══════════════════════════════════════════════════════════════════════════════
        mip_opt_out: 'true',
      })
      // Point d'accès EUROPÉEN, en dur, et sans variable d'environnement.
      //
      // `api.eu.deepgram.com` traite ET stocke dans l'Union européenne, et ne route pas
      // hors région : si la région est indisponible, la requête ÉCHOUE au lieu de
      // basculer ailleurs. C'est exactement ce qu'on veut — un repli silencieux vers les
      // États-Unis annulerait la résidence des données sans que personne s'en aperçoive.
      //
      // En dur, et pas dans une variable d'environnement : une variable mal renseignée un
      // jour de mise en production suffirait à renvoyer la voix des clients hors d'Europe.
      // La clé d'API, elle, n'est PAS régionale : la même fonctionne sur tous les points
      // d'accès, il n'y a donc rien d'autre à changer.
      //
      // Résidence complète = les DEUX : le point d'accès européen ET mip_opt_out.
      // L'un sans l'autre ne suffit pas.
      const dgRes = await fetch(`https://api.eu.deepgram.com/v1/listen?${params}`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: signed.signedUrl }),
      })
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
    } finally {
      // Succès, échec Deepgram, coupure réseau, clé absente, URL non signable : dans
      // TOUS les cas l'audio quitte le Storage ici. La seule donnée durable est le
      // transcrit, enregistré dans notes_brutes du CR. Pas besoin de cron de nettoyage.
      // Une purge qui échoue est journalisée sans masquer la réponse en cours.
      try { await getSupabaseAdmin().storage.from('documents').remove([audioPath]) }
      catch (e) { console.error('Purge audio échouée:', audioPath, e?.message) }
    }
  } catch (err) {
    // Le détail reste dans les journaux Vercel ; le client reçoit une phrase française.
    console.error('Transcribe error:', err.message, err.stack)
    return NextResponse.json({ error: 'La transcription a échoué.' }, { status: 500 })
  }
}
