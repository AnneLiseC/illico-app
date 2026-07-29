'use client'
// Modale de génération de compte-rendu par IA — extraite de chantiers/[id]/page.js et
// chargée à la demande (next/dynamic, ssr:false) : ~510 lignes de JSX + état + handlers
// sortent du bundle initial et ne se téléchargent qu'à l'ouverture de la modale.
// Déplacement VERBATIM : état, refs et handlers internes inchangés ; le parent passe
// ses données et setters (setErreur/setSucces/setComptesRendus/setCrModal) en props.
import { useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { apiFetch } from '../../lib/api-auth-client'
import { compressImageToBlob } from '../../lib/images'
import { Badge } from '../shared'
import ModalShell from '../ModalShell'

// ModalField : dupliqué ici (composant trivial) pour éviter un import croisé avec la page.
function ModalField({ label, children, required }) {
  return (
    <label style={{display:'flex', flexDirection:'column', gap:6, minWidth:0}}>
      <span className="eyebrow">{label}{required && <span style={{color:'#dc2626', marginLeft:4}}>*</span>}</span>
      {children}
    </label>
  )
}

const TONE_BG = { ok: 'rgba(22,163,74,0.12)', warn: 'rgba(245,158,11,0.13)', bad: 'rgba(220,38,38,0.10)', info: 'rgba(99,102,241,0.12)', mute: 'rgba(148,163,184,0.15)' }
const TONE_FG = { ok: '#15803d', warn: '#a16207', bad: '#b91c1c', info: '#4338ca', mute: '#475569' }

export default function CRGenerationModal({ id, dossier, devis, artisans, documents, comptesRendus, photos, categorie, setErreur, setSucces, setComptesRendus, setCrModal, setAnnot }) {
  const [crEtape, setCrEtape] = useState(1) // 1=config, 2=notes, 3=relecture
  const [crForm, setCrForm] = useState({ type_visite: '', date_visite: '', intervenants: '' })
  const [crNotes, setCrNotes] = useState('')
  const [crImages, setCrImages] = useState([]) // [{ path, url_signee }] — photos uploadées dans Storage (chantiers/{id}/cr/)
  const [crPhotosUp, setCrPhotosUp] = useState(false) // upload de photos CR en cours
  const [crPhotosDossier, setCrPhotosDossier] = useState([]) // paths (photos.url) de photos EXISTANTES du dossier — jamais supprimées de Storage
  const [crPhotoCat, setCrPhotoCat] = useState('all')        // filtre catégorie du sélecteur de photos CR
  const [crPhotosAffichees, setCrPhotosAffichees] = useState(12) // pagination du sélecteur de photos CR
  const [crVocal, setCrVocal] = useState(false)
  const [crVocalTexte, setCrVocalTexte] = useState('')
  const [crAudioTexte, setCrAudioTexte] = useState('')       // transcription Deepgram (audio enregistré/déposé)
  const [crRecording, setCrRecording] = useState(false)
  const [crTranscribing, setCrTranscribing] = useState(false)
  const crMediaRec = useRef(null)
  const crAudioChunks = useRef([])
  const [crGenerating, setCrGenerating] = useState(false)
  const [crGenere, setCrGenere] = useState(null) // { titre, sections[] }
  const [crSectionsEditees, setCrSectionsEditees] = useState([])
  const [crSavingFinal, setCrSavingFinal] = useState(false)
  const [crDocsSelectionnes, setCrDocsSelectionnes] = useState([])
  // CR déjà générés, cochés pour être fournis en contexte à l'IA (continuité entre visites).
  const [crCrsSelectionnes, setCrCrsSelectionnes] = useState([])

  const genererCRAvecIA = async () => {
    if (!crForm.type_visite) return
    const notesCombinees = [crNotes, crVocalTexte, crAudioTexte].filter(Boolean).join('\n\n')
    if (!notesCombinees.trim() && crImages.length === 0 && crPhotosDossier.length === 0) return
    setCrGenerating(true)
    setErreur('')
    try {
      const res = await apiFetch('/api/cr', {
        method: 'POST',
        body: JSON.stringify({
          dossierId: id,
          typeVisite: crForm.type_visite,
          dateVisite: crForm.date_visite,
          intervenants: crForm.intervenants ? crForm.intervenants.split(',').map(s => s.trim()).filter(Boolean) : [],
          notesBrutes: notesCombinees,
          // Photos ordi (uploadées) + photos existantes du dossier sélectionnées.
          photosPaths: [...crImages.map(im => im.path), ...crPhotosDossier],
          docsPaths: crDocsSelectionnes.map(d => ({ path: d.path, type_mime: d.type_mime, nom: d.nom })),
          // CR précédents sélectionnés : fournis en contexte (continuité), l'API relit leur contenu.
          crsIds: crCrsSelectionnes.map(c => c.id),
        }),
      })
      // Vérifier res.ok AVANT res.json() : une erreur serveur peut renvoyer du texte/HTML,
      // pas du JSON → res.json() lèverait un SyntaxError qui masque la vraie erreur.
      if (!res.ok) {
        const brut = await res.text().catch(() => '')
        setErreur(`Erreur génération CR (${res.status}) : ${(brut.slice(0, 200) || 'réessayez plus tard')}`)
        return
      }
      const data = await res.json()
      if (data.error) { setErreur('Erreur IA : ' + data.error); return }
      setCrGenere(data.cr)
      setCrSectionsEditees(data.cr.sections.map(s => ({ ...s })))
      setCrEtape(3)
    } catch (e) {
      setErreur('Erreur réseau lors de la génération du CR : ' + (e?.message || 'réessayez'))
    } finally {
      setCrGenerating(false)
    }
  }

  const sauvegarderCRGenere = async (publier = false) => {
    if (!crGenere) return
    setCrSavingFinal(true)
    const contenuFinal = crSectionsEditees.map(s => `## ${s.numero}. ${s.titre}\n\n${s.contenu}`).join('\n\n')
    const notesCombinees = [crNotes, crVocalTexte, crAudioTexte].filter(Boolean).join('\n\n')
    const { error: insertErr } = await supabase.from('comptes_rendus').insert({
      dossier_id: id,
      type_visite: crForm.type_visite,
      date_visite: crForm.date_visite || null,
      notes_brutes: notesCombinees || null,
      contenu_final: contenuFinal,
      photos_paths: [...crImages.map(im => im.path), ...crPhotosDossier], // TOUT ce qu'a analysé l'IA (traçabilité)
      photos_jointes: crPhotosDossier, // affichées dans le PDF — photos du chantier UNIQUEMENT, jamais les photos ordi
      valide: publier,
    })
    // Échec de l'insert : on garde la modale ouverte (sections éditées conservées).
    if (insertErr) { setErreur('Erreur : ' + insertErr.message); setCrSavingFinal(false); return }
    const { data } = await supabase.from('comptes_rendus').select('*').eq('dossier_id', id).order('created_at', { ascending: false })
    setComptesRendus(data || [])
    setCrModal(false)
    setCrEtape(1)
    setCrForm({ type_visite: '', date_visite: '', intervenants: '' })
    setCrNotes('')
    setCrImages([])
    setCrPhotosDossier([]) // vidage simple : ce sont des photos du dossier, jamais de remove Storage
    setCrVocalTexte('')
    setCrAudioTexte('')
    setCrGenere(null)
    setCrSectionsEditees([])
    setCrSavingFinal(false)
    setSucces(publier ? 'CR publié au client ✓' : 'CR sauvegardé ✓')
    setCrDocsSelectionnes([])
    setCrCrsSelectionnes([])
  }

  const demarrerVocal = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setErreur('Reconnaissance vocale non supportée sur ce navigateur (utilisez Chrome)')
      return
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SR()
    recognition.lang = 'fr-FR'
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = (e) => {
      let transcript = ''
      for (let i = 0; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript + ' '
      }
      setCrVocalTexte(transcript.trim())
    }
    recognition.onend = () => setCrVocal(false)
    recognition.start()
    setCrVocal(true)
    window._crRecognition = recognition
  }

  const arreterVocal = () => {
    window._crRecognition?.stop()
    setCrVocal(false)
  }

  // ── Audio → transcription (Deepgram) : marche partout, iPhone compris (≠ Web
  // Speech). L'audio est déposé en Storage puis transcrit par /api/transcribe ;
  // le texte alimente crAudioTexte (combiné aux notes pour le CR). ──
  const transcrireAudioBlob = async (blob, ext = 'webm') => {
    setCrTranscribing(true)
    setErreur('')
    try {
      const path = `chantiers/${id}/audio/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage.from('documents').upload(path, blob, { contentType: blob.type || undefined })
      if (upErr) { setErreur('Échec de l’envoi de l’audio : ' + upErr.message); return }
      const res = await apiFetch('/api/transcribe', {
        method: 'POST',
        body: JSON.stringify({ dossierId: id, audioPath: path }),
      })
      if (!res.ok) {
        const brut = await res.text().catch(() => '')
        setErreur(`Échec de la transcription (${res.status}) : ${brut.slice(0, 200) || 'réessayez'}`)
        return
      }
      const data = await res.json()
      if (data.error) { setErreur('Transcription : ' + data.error); return }
      setCrAudioTexte(prev => [prev, data.transcript].filter(Boolean).join('\n\n'))
    } catch (e) {
      setErreur('Erreur transcription : ' + (e?.message || 'réessayez'))
    } finally {
      setCrTranscribing(false)
    }
  }

  const demarrerEnregistrement = async () => {
    setErreur('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      crAudioChunks.current = []
      mr.ondataavailable = e => { if (e.data.size) crAudioChunks.current.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const type = mr.mimeType || 'audio/webm'
        const blob = new Blob(crAudioChunks.current, { type })
        await transcrireAudioBlob(blob, type.includes('mp4') ? 'mp4' : 'webm')
      }
      mr.start()
      crMediaRec.current = mr
      setCrRecording(true)
    } catch (e) {
      setErreur('Micro inaccessible — autorisez le micro dans le navigateur. ' + (e?.message || ''))
    }
  }

  const arreterEnregistrement = () => {
    crMediaRec.current?.stop()
    setCrRecording(false)
  }

  const onAudioFile = async (file) => {
    if (!file) return
    await transcrireAudioBlob(file, (file.name.split('.').pop() || 'm4a').toLowerCase())
  }

        const TYPES_CR = [
          { value: 'r1',        label: 'R1 — Visite technique',  emoji: '🔍' },
          { value: 'r2',        label: 'R2 — Visite artisans',    emoji: '🔨' },
          { value: 'r3',        label: 'R3 — Présentation devis', emoji: '📋' },
          { value: 'suivi',     label: 'Suivi de chantier',       emoji: '📊' },
          { value: 'reception', label: 'Réception',               emoji: '✓' },
        ]
        const intervenantsDispo = devis.filter(d => ['recu', 'accepte'].includes(d.statut))
        return (
          <ModalShell
            title={<>✨ Nouveau CR avec IA <span style={{fontSize:12, color:'var(--ink-500)', fontWeight:400, marginLeft:8}}>· Étape {crEtape}/3</span></>}
            subtitle={(
              <div style={{display:'flex', gap:6, marginTop:6}}>
                {[1,2,3].map(n => (
                  <div key={n} style={{
                    height:4, width:60, borderRadius:99,
                    background: n <= crEtape ? '#4f46e5' : 'var(--ink-200)',
                    transition:'background 200ms',
                  }} />
                ))}
              </div>
            )}
            onClose={async () => {
              // Fermeture sans CR sauvegardé : les photos uploadées ne sont rattachées
              // à aucun CR → orphelines. Purge best-effort de Storage. Si ça rate (crash,
              // onglet fermé), le filet reste la colonne photos_paths : tout fichier sous
              // chantiers/{id}/cr/ référencé par aucun CR est un déchet purgeable plus tard.
              // (La sauvegarde d'un CR passe par setCrModal(false) direct, jamais par ici.)
              const aPurger = crImages.map(im => im.path)
              if (aPurger.length) { try { await supabase.storage.from('photos').remove(aPurger) } catch {} }
              setCrImages([])
              setCrPhotosDossier([]) // photos du dossier : simple désélection, JAMAIS de remove Storage
              setCrPhotosUp(false)
              setCrModal(false)
            }}
            width="min(1600px, 97vw)"
            maxH="96vh"
          >
            <div style={{padding:24, display:'flex', flexDirection:'column', gap:16}}>

              {/* ── ÉTAPE 1 : Configuration ── */}
              {crEtape === 1 && (
                <div style={{display:'flex', flexDirection:'column', gap:14}}>
                  <div style={{fontSize:13.5, fontWeight:600, color:'var(--ink-700)'}}>Configuration de la visite</div>

                  <ModalField label="Type de visite" required>
                    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:6}}>
                      {TYPES_CR.map(({ value, label, emoji }) => {
                        const active = crForm.type_visite === value
                        return (
                          <button key={value} onClick={() => setCrForm(f => ({ ...f, type_visite: value }))}
                            style={{
                              textAlign:'left', padding:'10px 14px', borderRadius:10,
                              border:'1px solid', cursor:'pointer', fontSize:13, transition:'all 150ms',
                              borderColor: active ? '#4f46e5' : 'var(--ink-200)',
                              background: active ? '#eef2ff' : '#fff',
                              color: active ? 'var(--ink-900)' : 'var(--ink-700)',
                              fontWeight: active ? 600 : 500,
                            }}>
                            {emoji} {label}
                          </button>
                        )
                      })}
                    </div>
                  </ModalField>

                  <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
                    <ModalField label="Date de la visite">
                      <input type="date" value={crForm.date_visite}
                        onChange={e => setCrForm(f => ({ ...f, date_visite: e.target.value }))}
                        className="input" style={{height:38, padding:'0 12px', fontSize:13}} />
                    </ModalField>
                    <ModalField label="Intervenants présents">
                      {intervenantsDispo.length > 0 ? (
                        <div style={{border:'1px solid var(--ink-200)', borderRadius:10, padding:6, display:'flex', flexDirection:'column', gap:2}}>
                          {intervenantsDispo.map(d => {
                            const selected = (crForm.intervenants || '').split(',').map(s => s.trim()).filter(Boolean).includes(d.artisan?.entreprise)
                            return (
                              <label key={d.id} style={{
                                display:'flex', alignItems:'center', gap:8, cursor:'pointer',
                                padding:'4px 8px', borderRadius:6, transition:'background 150ms',
                              }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)' }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                                <input type="checkbox" checked={selected}
                                  onChange={() => {
                                    const current = (crForm.intervenants || '').split(',').map(s => s.trim()).filter(Boolean)
                                    const updated = selected
                                      ? current.filter(n => n !== d.artisan?.entreprise)
                                      : [...current, d.artisan?.entreprise]
                                    setCrForm(f => ({ ...f, intervenants: updated.join(', ') }))
                                  }}
                                  style={{accentColor:'#6366f1'}} />
                                <span style={{fontSize:13, color:'var(--ink-700)'}}>{d.artisan?.entreprise}</span>
                                <span style={{fontSize:11, color:'var(--ink-500)'}}>{d.artisan?.metier}</span>
                                <span style={{
                                  fontSize:11, padding:'2px 8px', borderRadius:99, marginLeft:'auto', fontWeight:700,
                                  background: d.statut === 'accepte' ? TONE_BG.ok : TONE_BG.info,
                                  color: d.statut === 'accepte' ? TONE_FG.ok : TONE_FG.info,
                                }}>
                                  {d.statut === 'accepte' ? 'Signé' : 'Reçu'}
                                </span>
                              </label>
                            )
                          })}
                        </div>
                      ) : (
                        <input type="text" value={crForm.intervenants}
                          onChange={e => setCrForm(f => ({ ...f, intervenants: e.target.value }))}
                          placeholder="Plaquiste, Électricien…"
                          className="input" style={{height:38, padding:'0 12px', fontSize:13}} />
                      )}
                    </ModalField>
                  </div>

                  <button onClick={() => crForm.type_visite && setCrEtape(2)}
                    disabled={!crForm.type_visite}
                    className="btn btn-primary"
                    style={{justifyContent:'center', height:42, fontSize:13, marginTop:4}}>
                    Suivant →
                  </button>
                </div>
              )}

              {/* ── ÉTAPE 2 : Notes brutes ── */}
              {crEtape === 2 && (
                <div style={{display:'flex', flexDirection:'column', gap:14}}>
                  <div>
                    <div style={{fontSize:13.5, fontWeight:600, color:'var(--ink-700)'}}>Saisie des notes brutes</div>
                    <div style={{fontSize:11.5, color:'var(--ink-500)', marginTop:2}}>Combinez plusieurs sources — l&apos;IA synthétise tout</div>
                  </div>

                  {/* 2 colonnes sur large écran (auto-fit → 1 colonne sur mobile) :
                      gauche = sources texte ; droite = photos & documents. */}
                  <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(340px, 1fr))', gap:16, alignItems:'start'}}>
                  <div style={{display:'flex', flexDirection:'column', gap:14, minWidth:0}}>

                  <ModalField label="📝 Texte (copier-coller depuis OneNote, Outlook…)">
                    <textarea value={crNotes} onChange={e => setCrNotes(e.target.value)}
                      rows={5} placeholder="Coller vos notes brutes ici — bullet points, phrases incomplètes, tout est ok…"
                      className="input" style={{minHeight:120, padding:12, fontSize:13, lineHeight:1.5, resize:'vertical'}} />
                  </ModalField>

                  <ModalField label="🎤 Vocal (dictée dans l'app)">
                    <div style={{display:'flex', gap:8, alignItems:'flex-start'}}>
                      <button onClick={crVocal ? arreterVocal : demarrerVocal}
                        style={{
                          flexShrink:0, padding:'8px 16px', borderRadius:10,
                          fontSize:13, fontWeight:600, border:'none', cursor:'pointer', transition:'all 150ms',
                          background: crVocal ? 'rgba(220,38,38,0.12)' : 'var(--surface-2)',
                          color: crVocal ? '#b91c1c' : 'var(--ink-700)',
                          animation: crVocal ? 'fadeIn 1s ease-in-out infinite alternate' : 'none',
                        }}>
                        {crVocal ? '⏹ Arrêter' : '🎙 Dicter'}
                      </button>
                      {crVocalTexte && (
                        <div style={{
                          flex:1, fontSize:12, color:'var(--ink-700)', background:'var(--surface-2)',
                          borderRadius:10, padding:10, minHeight:40,
                        }}>
                          {crVocalTexte}
                        </div>
                      )}
                    </div>
                  </ModalField>

                  <ModalField label="🎙️ Audio de visite (enregistrer ou déposer un fichier — iPhone compris)">
                    <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
                      <button onClick={crRecording ? arreterEnregistrement : demarrerEnregistrement} disabled={crTranscribing}
                        style={{
                          flexShrink:0, padding:'8px 16px', borderRadius:10,
                          fontSize:13, fontWeight:600, border:'none', cursor: crTranscribing ? 'default' : 'pointer', transition:'all 150ms',
                          background: crRecording ? 'rgba(220,38,38,0.12)' : 'var(--surface-2)',
                          color: crRecording ? '#b91c1c' : 'var(--ink-700)',
                          animation: crRecording ? 'fadeIn 1s ease-in-out infinite alternate' : 'none',
                          opacity: crTranscribing ? 0.6 : 1,
                        }}>
                        {crRecording ? '⏹ Arrêter et transcrire' : '🎙 Enregistrer'}
                      </button>
                      <label className="btn btn-ghost" style={{cursor: (crRecording || crTranscribing) ? 'default' : 'pointer', fontSize:13, padding:'8px 14px', opacity:(crRecording || crTranscribing) ? 0.6 : 1}}>
                        📂 Déposer un audio
                        <input type="file" accept="audio/*" style={{display:'none'}} disabled={crRecording || crTranscribing}
                          onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onAudioFile(f) }} />
                      </label>
                      {crTranscribing && <span style={{fontSize:12, color:'var(--ink-500)'}}>Transcription en cours…</span>}
                    </div>
                    <div style={{fontSize:11, color:'var(--ink-500)', marginTop:6}}>
                      ⚠️ Prévenez les participants que la visite est enregistrée.
                    </div>
                    {crAudioTexte && (
                      <textarea value={crAudioTexte} onChange={e => setCrAudioTexte(e.target.value)} rows={4}
                        placeholder="Transcription — relisez et corrigez si besoin avant de générer le CR."
                        className="input" style={{marginTop:8, minHeight:90, padding:10, fontSize:12.5, lineHeight:1.5, resize:'vertical'}} />
                    )}
                  </ModalField>

                  </div>
                  <div style={{display:'flex', flexDirection:'column', gap:14, minWidth:0}}>

                  <ModalField label="📷 Photos (cahier, capture d'écran, document)">
                    <div style={{display:'flex', flexWrap:'wrap', gap:8}}>
                      {crImages.map((img, i) => (
                        <div key={img.path} style={{position:'relative'}}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={img.url_signee} alt="" style={{width:80, height:80, objectFit:'cover', borderRadius:8, border:'1px solid var(--ink-200)'}} />
                          <button onClick={async () => {
                              // Fichier créé pour ce CR et pour lui seul → on le supprime de Storage.
                              try { await supabase.storage.from('photos').remove([img.path]) } catch {}
                              setCrImages(imgs => imgs.filter((_, j) => j !== i))
                            }}
                            style={{
                              position:'absolute', top:-6, right:-6,
                              width:18, height:18, borderRadius:'50%',
                              background:'#dc2626', color:'#fff', border:'none', cursor:'pointer',
                              fontSize:11, display:'grid', placeItems:'center',
                            }}>✕</button>
                          <button title="Annoter" onClick={() => setAnnot({ src: img.url_signee, titre: 'Annoter la photo', onSave: async (blob) => {
                              const path = `chantiers/${id}/cr/${Date.now()}_annot_${Math.random().toString(36).slice(2)}.jpg`
                              const { error } = await supabase.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' })
                              if (error) { setErreur('Annotation : ' + error.message); setAnnot(null); return }
                              const { data: signed } = await supabase.storage.from('photos').createSignedUrl(path, 3600)
                              try { await supabase.storage.from('photos').remove([img.path]) } catch {}
                              setCrImages(imgs => imgs.map((im, j) => j === i ? { path, url_signee: signed?.signedUrl || '' } : im))
                              setAnnot(null)
                            } })}
                            style={{
                              position:'absolute', bottom:-6, right:-6,
                              width:20, height:20, borderRadius:'50%',
                              background:'#2563eb', color:'#fff', border:'none', cursor:'pointer',
                              fontSize:11, display:'grid', placeItems:'center',
                            }}>✏️</button>
                        </div>
                      ))}
                      <label style={{
                        width:80, height:80, borderRadius:8,
                        border:'2px dashed var(--ink-300)', display:'grid', placeItems:'center',
                        cursor: crPhotosUp ? 'wait' : 'pointer', transition:'border-color 150ms',
                      }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#6366f1' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--ink-300)' }}>
                        <span style={{fontSize:24, color:'var(--ink-300)', lineHeight:1}}>{crPhotosUp ? '…' : '+'}</span>
                        <input type="file" accept="image/*" multiple disabled={crPhotosUp} style={{display:'none'}}
                          onChange={async e => {
                            const files = Array.from(e.target.files || [])
                            e.target.value = '' // autorise la re-sélection des mêmes fichiers
                            if (!files.length) return
                            setCrPhotosUp(true)
                            for (const file of files) {
                              try {
                                // Compression puis upload direct dans Storage (bucket photos),
                                // sous chantiers/{id}/cr/ — emplacement dédié aux photos de CR,
                                // SANS insert dans la table `photos` (invisibles onglet Photos).
                                const blob = await compressImageToBlob(file)
                                const path = `chantiers/${id}/cr/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`
                                const { error: upErr } = await supabase.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' })
                                if (upErr) { setErreur('Échec de l’envoi d’une photo : ' + upErr.message); continue }
                                // Vignette : signed URL comme signerPhotos (bucket privé).
                                const { data: signed } = await supabase.storage.from('photos').createSignedUrl(path, 3600)
                                setCrImages(imgs => [...imgs, { path, url_signee: signed?.signedUrl || '' }])
                              } catch {
                                setErreur('Impossible de traiter une photo (format non supporté ?).')
                              }
                            }
                            setCrPhotosUp(false)
                          }} />
                      </label>
                    </div>
                  </ModalField>

                  {photos.some(p => p.type_media !== 'video') && (() => {
                    // Photos triées par catégorie (Avant/Pendant/Après/Maquette) + pagination :
                    // on ne rend jamais toutes les photos d'un coup (miniatures + lazy) → plus de
                    // plantage même avec beaucoup de photos.
                    const CATS_CR = [
                      { k: 'all', l: 'Toutes' },
                      { k: 'avant', l: 'Avant' },
                      { k: 'pendant', l: 'Pendant' },
                      { k: 'apres', l: 'Après' },
                      { k: 'maquette', l: 'Maquette' },
                    ]
                    const dispo = photos.filter(p => p.type_media !== 'video')
                    const filtrees = crPhotoCat === 'all' ? dispo : dispo.filter(p => p.categorie === crPhotoCat)
                    const visibles = filtrees.slice(0, crPhotosAffichees)
                    return (
                    <ModalField label="🖼️ Photos du chantier (jointes au CR)">
                      <div style={{display:'flex', gap:6, flexWrap:'wrap', marginBottom:8}}>
                        {CATS_CR.map(c => {
                          const n = c.k === 'all' ? dispo.length : dispo.filter(p => p.categorie === c.k).length
                          if (n === 0 && c.k !== 'all') return null
                          const active = crPhotoCat === c.k
                          return (
                            <button key={c.k} type="button"
                              onClick={() => { setCrPhotoCat(c.k); setCrPhotosAffichees(12) }}
                              style={{
                                padding:'4px 10px', borderRadius:99, fontSize:11, fontWeight:600, cursor:'pointer',
                                border:'1px solid', borderColor: active ? '#6366f1' : 'var(--ink-200)',
                                background: active ? '#eef2ff' : '#fff',
                                color: active ? 'var(--ink-900)' : 'var(--ink-600)',
                              }}>
                              {c.l} <span style={{opacity:0.6}}>· {n}</span>
                            </button>
                          )
                        })}
                      </div>
                      <div style={{
                        display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(80px, 1fr))', gap:8,
                        border:'1px solid var(--ink-200)', borderRadius:10, padding:8, maxHeight:260, overflowY:'auto',
                      }}>
                        {visibles.map(p => {
                          const selected = crPhotosDossier.includes(p.url)
                          return (
                            // Clic = (dé)sélection. Aucun fichier n'est touché : ce sont des photos
                            // du dossier, on n'envoie que leur path. Jamais de remove Storage ici.
                            <button key={p.url} type="button"
                              onClick={() => setCrPhotosDossier(prev =>
                                selected ? prev.filter(u => u !== p.url) : [...prev, p.url]
                              )}
                              style={{
                                position:'relative', padding:0, border:'none', background:'none',
                                cursor:'pointer', aspectRatio:'1', borderRadius:8, overflow:'hidden',
                              }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={p.url_thumb || p.url_signee} alt="" loading="lazy" decoding="async"
                                onError={e => { if (p.url_signee && e.currentTarget.src !== p.url_signee) e.currentTarget.src = p.url_signee }}
                                style={{
                                width:'100%', height:'100%', objectFit:'cover', display:'block',
                                borderRadius:8,
                                border: selected ? '2px solid #4f46e5' : '1px solid var(--ink-200)',
                                opacity: selected ? 1 : 0.85,
                              }} />
                              {selected && (
                                <span style={{
                                  position:'absolute', top:4, right:4,
                                  width:18, height:18, borderRadius:'50%',
                                  background:'#4f46e5', color:'#fff',
                                  fontSize:11, display:'grid', placeItems:'center',
                                }}>✓</span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                      {filtrees.length > crPhotosAffichees && (
                        <button type="button" onClick={() => setCrPhotosAffichees(n => n + 12)}
                          className="btn btn-ghost" style={{fontSize:11.5, marginTop:8}}>
                          Voir plus ({filtrees.length - crPhotosAffichees} restantes)
                        </button>
                      )}
                      {crPhotosDossier.length > 0 && (
                        <div style={{fontSize:11, color:'var(--ink-500)', marginTop:6}}>
                          {crPhotosDossier.length} photo{crPhotosDossier.length > 1 ? 's' : ''} du chantier jointe{crPhotosDossier.length > 1 ? 's' : ''}
                        </div>
                      )}
                    </ModalField>
                    )
                  })()}

                  {documents.length > 0 && (
                    <ModalField label="📎 Documents du chantier (contexte IA)">
                      <div style={{border:'1px solid var(--ink-200)', borderRadius:10, padding:6, display:'flex', flexDirection:'column', gap:2, maxHeight:144, overflowY:'auto'}}>
                        {documents.map(doc => {
                          const selected = crDocsSelectionnes.some(d => d.id === doc.id)
                          const supported = doc.type_mime?.includes('pdf') || doc.type_mime?.startsWith('image')
                          return (
                            <label key={doc.id} style={{
                              display:'flex', alignItems:'center', gap:8,
                              padding:'4px 8px', borderRadius:6, cursor: supported ? 'pointer' : 'not-allowed',
                              opacity: supported ? 1 : 0.4, transition:'background 150ms',
                            }}
                              onMouseEnter={e => { if (supported) e.currentTarget.style.background = 'var(--surface-2)' }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                              <input type="checkbox" checked={selected} disabled={!supported}
                                onChange={() => {
                                  if (!supported) return
                                  setCrDocsSelectionnes(prev =>
                                    selected ? prev.filter(d => d.id !== doc.id) : [...prev, doc]
                                  )
                                }}
                                style={{accentColor:'#6366f1'}} />
                              <span className="clip-1" style={{fontSize:12, color:'var(--ink-700)', flex:1, minWidth:0}}>{doc.nom}</span>
                              {!supported && <span style={{fontSize:11, color:'var(--ink-500)'}}>non supporté</span>}
                            </label>
                          )
                        })}
                      </div>
                    </ModalField>
                  )}

                  {comptesRendus.length > 0 && (
                    <ModalField label="📄 Comptes rendus précédents (contexte IA)">
                      <div style={{border:'1px solid var(--ink-200)', borderRadius:10, padding:6, display:'flex', flexDirection:'column', gap:2, maxHeight:144, overflowY:'auto'}}>
                        {comptesRendus.map(cr => {
                          const selected = crCrsSelectionnes.some(c => c.id === cr.id)
                          const dateStr = cr.date_visite
                            ? new Date(cr.date_visite).toLocaleDateString('fr-FR')
                            : (cr.created_at ? new Date(cr.created_at).toLocaleDateString('fr-FR') : '')
                          return (
                            <label key={cr.id} style={{
                              display:'flex', alignItems:'center', gap:8,
                              padding:'4px 8px', borderRadius:6, cursor:'pointer', transition:'background 150ms',
                            }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)' }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                              <input type="checkbox" checked={selected}
                                onChange={() => setCrCrsSelectionnes(prev =>
                                  selected ? prev.filter(c => c.id !== cr.id) : [...prev, cr]
                                )}
                                style={{accentColor:'#6366f1'}} />
                              <span className="clip-1" style={{fontSize:12, color:'var(--ink-700)', flex:1, minWidth:0}}>
                                CR {cr.type_visite || ''}{dateStr ? ` — ${dateStr}` : ''}
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    </ModalField>
                  )}

                  </div>
                  </div>

                  <div style={{display:'flex', gap:10, paddingTop:6}}>
                    <button onClick={() => setCrEtape(1)} className="btn btn-ghost" style={{flex:1, justifyContent:'center', height:42}}>
                      ← Retour
                    </button>
                    <button onClick={genererCRAvecIA}
                      disabled={crGenerating || crPhotosUp || crTranscribing || crRecording || (!crNotes.trim() && !crVocalTexte.trim() && !crAudioTexte.trim() && crImages.length === 0 && crPhotosDossier.length === 0)}
                      className="btn btn-primary" style={{flex:2, justifyContent:'center', height:42, fontSize:13}}>
                      {crGenerating ? (
                        <span style={{display:'inline-flex', alignItems:'center', gap:8}}>
                          <span style={{
                            width:14, height:14, borderRadius:'50%',
                            border:'2px solid rgba(255,255,255,0.4)', borderTopColor:'#fff',
                            animation:'spin 0.65s linear infinite',
                          }} />
                          Génération en cours…
                        </span>
                      ) : '✨ Générer le CR'}
                    </button>
                  </div>
                </div>
              )}

              {/* ── ÉTAPE 3 : Relecture ── */}
              {crEtape === 3 && crGenere && (
                <div style={{display:'flex', flexDirection:'column', gap:14}}>
                  <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
                    <span style={{fontSize:14, fontWeight:700, color:'var(--ink-900)'}}>{crGenere.titre}</span>
                    <Badge tone="ok">Généré ✓</Badge>
                  </div>

                  <div style={{display:'flex', flexDirection:'column', gap:12}}>
                    {crSectionsEditees.map((section, idx) => (
                      <div key={idx} style={{
                        border:'1px solid', borderRadius:10, overflow:'hidden',
                        borderColor: section.important ? 'rgba(245,158,11,0.4)' : 'var(--ink-200)',
                      }}>
                        <div style={{
                          padding:'8px 14px', display:'flex', alignItems:'center', gap:8,
                          background: section.important ? 'rgba(245,158,11,0.10)' : 'var(--surface-2)',
                        }}>
                          <span style={{fontSize:11, fontWeight:800, color:'var(--ink-500)'}}>{section.numero}.</span>
                          <input
                            type="text"
                            value={section.titre}
                            onChange={e => setCrSectionsEditees(ss => ss.map((s, i) => i === idx ? { ...s, titre: e.target.value } : s))}
                            style={{flex:1, fontSize:13, fontWeight:600, background:'transparent', border:'none', outline:'none', color:'var(--ink-900)'}} />
                          <button onClick={() => setCrSectionsEditees(ss => ss.map((s, i) => i === idx ? { ...s, important: !s.important } : s))}
                            style={{
                              fontSize:13, padding:'2px 8px', borderRadius:6,
                              background:'transparent', border:'none', cursor:'pointer',
                              color: section.important ? '#a16207' : 'var(--ink-300)',
                            }}>⚠</button>
                        </div>
                        <textarea
                          value={section.contenu}
                          onChange={e => setCrSectionsEditees(ss => ss.map((s, i) => i === idx ? { ...s, contenu: e.target.value } : s))}
                          rows={Math.max(3, Math.ceil(section.contenu.length / 80))}
                          style={{
                            width:'100%', padding:'10px 14px', fontSize:12, color:'var(--ink-700)',
                            border:'none', outline:'none', resize:'vertical', lineHeight:1.55,
                            transition:'background 150ms', fontFamily:'inherit',
                          }}
                          onFocus={e => { e.target.style.background = '#eef2ff' }}
                          onBlur={e => { e.target.style.background = 'transparent' }} />
                      </div>
                    ))}
                  </div>

                  <div style={{display:'flex', gap:10, paddingTop:6, flexWrap:'wrap'}}>
                    <button onClick={() => setCrEtape(2)} className="btn btn-ghost" style={{justifyContent:'center', height:42}}>
                      ← Retravailler
                    </button>
                    <button onClick={() => sauvegarderCRGenere(false)} disabled={crSavingFinal}
                      className="btn btn-ghost" style={{flex:1, justifyContent:'center', height:42, borderColor:'#4f46e5', color:'var(--ink-900)'}}>
                      Sauvegarder brouillon
                    </button>
                    <button onClick={() => sauvegarderCRGenere(true)} disabled={crSavingFinal}
                      className="btn btn-primary" style={{flex:1, justifyContent:'center', height:42, background:'#15803d', borderColor:'#15803d'}}>
                      ✓ Publier au client
                    </button>
                  </div>
                </div>
              )}

            </div>
          </ModalShell>
        )
}
