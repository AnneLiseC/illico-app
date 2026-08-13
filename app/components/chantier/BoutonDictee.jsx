'use client'
// Bouton de DICTÉE vocale réutilisable (repris de l'ancien CR). Enregistre l'audio (MediaRecorder,
// compatible iPhone), le dépose en Storage, le fait transcrire par /api/transcribe (Deepgram),
// puis renvoie le texte via onTexte(). Fonctionne SANS IA : le texte dicté peut alimenter des
// notes OU directement le champ d'une action. L'appelant décide quoi en faire.
import { useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { apiFetch } from '../../lib/api-auth-client'

export default function BoutonDictee({ dossierId, onTexte, setErreur, compact = false }) {
  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState(false)
  const mrRef = useRef(null)
  const chunks = useRef([])

  const transcrire = async (blob, ext) => {
    setBusy(true)
    try {
      const path = `chantiers/${dossierId}/audio/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage.from('documents').upload(path, blob, { contentType: blob.type || undefined })
      if (upErr) { setErreur?.('Envoi de l’audio : ' + upErr.message); return }
      const res = await apiFetch('/api/transcribe', { method: 'POST', body: JSON.stringify({ dossierId, audioPath: path }) })
      if (!res.ok) { setErreur?.(`Échec de la transcription (${res.status}) — réessaie.`); return }
      const data = await res.json().catch(() => ({}))
      if (data.error) { setErreur?.('Transcription : ' + data.error); return }
      if (data.transcript) onTexte?.(data.transcript)
    } catch (e) {
      setErreur?.('Erreur transcription : ' + (e?.message || 'réessaie'))
    } finally { setBusy(false) }
  }

  const demarrer = async () => {
    setErreur?.('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      chunks.current = []
      mr.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const type = mr.mimeType || 'audio/webm'
        await transcrire(new Blob(chunks.current, { type }), type.includes('mp4') ? 'mp4' : 'webm')
      }
      mr.start(); mrRef.current = mr; setRecording(true)
    } catch (e) {
      setErreur?.('Micro inaccessible — autorise le micro dans le navigateur. ' + (e?.message || ''))
    }
  }
  const arreter = () => { mrRef.current?.stop(); setRecording(false) }

  // Dépôt d'un fichier audio (mémo vocal iPhone, .m4a…) → même transcription.
  const onFichier = async (file) => {
    if (!file) return
    await transcrire(file, (file.name.split('.').pop() || 'm4a').toLowerCase())
  }

  const btnStyle = { fontSize: compact ? 11 : 12.5, padding: compact ? '3px 8px' : '4px 10px', whiteSpace: 'nowrap' }
  return (
    <span style={{ display: 'inline-flex', gap: 6 }}>
      <button type="button" onClick={recording ? arreter : demarrer} disabled={busy}
        className={recording ? 'btn btn-primary' : 'btn btn-ghost'}
        title="Dictée vocale (transcription automatique)"
        style={{ ...btnStyle, ...(recording ? { background: '#b91c1c', borderColor: '#b91c1c' } : {}) }}>
        {busy ? 'Transcription…' : recording ? '■ Arrêter' : 'Dicter'}
      </button>
      <label className="btn btn-ghost" style={{ ...btnStyle, cursor: busy ? 'wait' : 'pointer' }} title="Importer un fichier audio (mémo vocal) à transcrire">
        Audio
        <input type="file" accept="audio/*" disabled={busy} style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; onFichier(f) }} />
      </label>
    </span>
  )
}
