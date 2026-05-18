// app/parametres/page.js
'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '../lib/auth-context'

export default function Parametres() {
  const { profile: authProfile, initialized } = useAuth()
  const [profile, setProfile]       = useState(null)
  const [loading, setLoading]       = useState(true)
  const [agentes, setAgentes]       = useState([])
  const [saving, setSaving]         = useState(false)
  const [erreur, setErreur]         = useState('')
  const [succes, setSucces]         = useState('')
  const [modal, setModal]           = useState(false) // 'creer' | 'modifier' | 'supprimer' | false
  const [agenteEditee, setAgenteEditee] = useState(null)
  const [agenteASupprimer, setAgenteASupprimer] = useState(null)
  const [supprimant, setSupprimant] = useState(false)
  const [uploadingKbis, setUploadingKbis] = useState(null)
  const [uploadingRib, setUploadingRib]   = useState(false)
  const [section, setSection] = useState('equipe')
  const router = useRouter()

  const emptyForm = {
    prenom: '', nom: '', email: '', telephone: '',
    parts_agente_disponibles: '60',
    frais_part_agente_defaut: 100,
    redevance_debut: '',
  }
  const [form, setForm] = useState(emptyForm)

  const chargerAgentes = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'agente')
      .order('prenom')
    setAgentes(data || [])
  }

  useEffect(() => {
    if (!initialized) return
    if (!authProfile) { router.push('/login'); return }
    if (authProfile.role !== 'admin') { router.push('/dashboard'); return }
    setProfile(authProfile)
    chargerAgentes().then(() => setLoading(false))
  }, [initialized, authProfile, router])

  const ouvrirCreer = () => {
    setForm(emptyForm)
    setAgenteEditee(null)
    setModal('creer')
    setErreur('')
    setSucces('')
  }

  const ouvrirModifier = (agente) => {
    setForm({
      prenom: agente.prenom || '',
      nom: agente.nom || '',
      email: agente.email || '',
      telephone: agente.telephone || '',
      frais_part_agente_defaut: Math.round((agente.frais_part_agente_defaut || 0.5) * 100),
      parts_agente_disponibles: agente.parts_agente_disponibles?.length > 0
        ? agente.parts_agente_disponibles.map(p => Math.round(p * 100)).join(', ')
        : String(Math.round((agente.part_agente_defaut || 0.5) * 100)),
      redevance_debut: agente.redevance_debut || '',
    })
    setAgenteEditee(agente)
    setModal('modifier')
    setErreur('')
    setSucces('')
  }

  const ouvrirSupprimer = (agente) => {
    setAgenteASupprimer(agente)
    setModal('supprimer')
    setErreur('')
  }

  const supprimerAgente = async () => {
    if (!agenteASupprimer) return
    setSupprimant(true)
    setErreur('')
    try {
      const res = await fetch('/api/create-agente', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: agenteASupprimer.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErreur(data.error || 'Erreur lors de la suppression')
      } else {
        setSucces(`${agenteASupprimer.prenom} ${agenteASupprimer.nom} a été supprimée ✓`)
        setModal(false)
        setAgenteASupprimer(null)
        await chargerAgentes()
      }
    } catch (err) {
      setErreur(err.message)
    }
    setSupprimant(false)
  }

  const uploadRib = async (fichier) => {
    if (!profile) return
    setUploadingRib(true)
    const chemin = `rib/${profile.id}.pdf`
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(chemin, fichier, { upsert: true, contentType: 'application/pdf' })
    if (uploadError) {
      setErreur('Erreur upload RIB : ' + uploadError.message)
      setUploadingRib(false)
      return
    }
    const { error } = await supabase.from('profiles').update({ rib_url: chemin }).eq('id', profile.id)
    if (error) {
      setErreur('Erreur sauvegarde RIB : ' + error.message)
    } else {
      setSucces('RIB uploadé ✓')
      setProfile(p => ({ ...p, rib_url: chemin }))
    }
    setUploadingRib(false)
  }

  const voirRib = async () => {
    if (!profile?.rib_url) return
    const { data } = await supabase.storage.from('documents').createSignedUrl(profile.rib_url, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const creerAgente = async () => {
    setSaving(true)
    setErreur('')
    try {
      const partsArray = form.parts_agente_disponibles
        .split(',')
        .map(v => parseInt(v.trim()) / 100)
        .filter(v => !isNaN(v) && v > 0 && v <= 1)
      const partDefaut = partsArray[0] ?? 0.5
      const res = await fetch('/api/create-agente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prenom: form.prenom,
          nom: form.nom,
          email: form.email,
          telephone: form.telephone || null,
          part_agente_defaut: partDefaut,
          parts_agente_disponibles: partsArray,
          frais_part_agente_defaut: form.frais_part_agente_defaut / 100,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErreur(data.error || 'Erreur lors de la création')
      } else {
        setSucces(`Invitation envoyée à ${form.email} ✓`)
        setModal(false)
        await chargerAgentes()
      }
    } catch (err) {
      setErreur(err.message)
    }
    setSaving(false)
  }

  const modifierAgente = async () => {
    setSaving(true)
    setErreur('')
    try {
      const partsArray = form.parts_agente_disponibles
        .split(',')
        .map(v => parseInt(v.trim()) / 100)
        .filter(v => !isNaN(v) && v > 0 && v <= 1)
      const partDefaut = partsArray[0] ?? 0.5
      const res = await fetch('/api/create-agente', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: agenteEditee.id,
          prenom: form.prenom,
          nom: form.nom,
          telephone: form.telephone || null,
          part_agente_defaut: partDefaut,
          parts_agente_disponibles: partsArray,
          frais_part_agente_defaut: form.frais_part_agente_defaut / 100,
          redevance_debut: form.redevance_debut || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErreur(data.error || 'Erreur lors de la modification')
      } else {
        setSucces('Profil mis à jour ✓')
        setModal(false)
        await chargerAgentes()
      }
    } catch (err) {
      setErreur(err.message)
    }
    setSaving(false)
  }

  const uploadKbis = async (agenteId, fichier) => {
    setUploadingKbis(agenteId)
    const ext    = fichier.name.split('.').pop()
    const chemin = `kbis/${agenteId}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(chemin, fichier, { upsert: true })
    if (uploadError) {
      setErreur('Erreur upload KBIS : ' + uploadError.message)
      setUploadingKbis(null)
      return
    }
    const res = await fetch('/api/create-agente', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: agenteId, kbis_url: chemin }),
    })
    if (res.ok) {
      setSucces('KBIS uploadé ✓')
      await chargerAgentes()
    } else {
      setErreur('Erreur sauvegarde KBIS')
    }
    setUploadingKbis(null)
  }

  const voirKbis = async (kbisUrl) => {
    const { data } = await supabase.storage.from('documents').createSignedUrl(kbisUrl, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const fmtPct = (val) => {
    if (val === undefined || val === null) return '—'
    const pct = Math.round(val * 100)
    return `${pct} / ${100 - pct}`
  }

  if (loading) return <div style={{paddingTop:96, textAlign:'center', color:'var(--ink-400)'}}>Chargement…</div>

  return (
    <div className="page-enter" style={{display:'flex', flexDirection:'column', gap:18}}>

      {/* En-tête */}
      <div>
        <div className="eyebrow" style={{marginBottom:4}}>Système</div>
        <h1 className="page">Paramètres</h1>
        <div style={{color:'var(--ink-500)', fontSize:13, marginTop:6}}>Configuration de l'agence et de l'équipe</div>
      </div>

      {succes && !modal && (
        <div style={{background:'rgba(22,163,74,0.07)', border:'1px solid rgba(22,163,74,0.25)', borderRadius:10, padding:'10px 16px', fontSize:13, color:'#15803d'}}>{succes}</div>
      )}
      {erreur && !modal && (
        <div style={{background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:10, padding:'10px 16px', fontSize:13, color:'#b91c1c'}}>{erreur}</div>
      )}

      {/* Layout sidebar + contenu */}
      <div className="card" style={{padding:0, overflow:'hidden', display:'grid', gridTemplateColumns:'240px 1fr', minHeight:560}}>

        {/* ── Navigation latérale ── */}
        <nav style={{padding:'10px 0', borderRight:'1px solid var(--ink-200)'}}>
          {[
            { k:'equipe',    l:'Équipe & agentes', count: agentes.length },
            { k:'documents', l:'RIB & documents' },
            { k:'profil',    l:'Profil franchisée' },
            { k:'agence',    l:'Agence' },
            { k:'parts',     l:'Parts & royalties' },
            { k:'notifs',    l:'Notifications' },
            { k:'securite',  l:'Sécurité' },
          ].map(({ k, l, count }) => {
            const active = section === k
            return (
              <button key={k} onClick={() => setSection(k)} className={active ? '' : 'row-hover'} style={{
                width:'100%', textAlign:'left', padding:'10px 16px',
                display:'flex', alignItems:'center', gap:8, border:0, cursor:'pointer',
                fontWeight: active ? 700 : 500, fontSize:13.5,
                color: active ? 'var(--brand-800)' : 'var(--ink-700)',
                borderLeft: `3px solid ${active ? 'var(--brand-500)' : 'transparent'}`,
                background: active ? 'var(--brand-50)' : 'transparent',
              }}>
                <span style={{flex:1}}>{l}</span>
                {count != null && <span style={{background:'var(--ink-200)', color:'var(--ink-700)', fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:99}}>{count}</span>}
              </button>
            )
          })}
        </nav>

        {/* ── Contenu de section ── */}
        <div style={{padding:28, overflowY:'auto'}}>

          {/* Équipe & agentes */}
          {section === 'equipe' && (
            <div style={{display:'flex', flexDirection:'column', gap:18}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-end'}}>
                <div>
                  <h2 className="page" style={{fontSize:18, marginBottom:4}}>Équipe & agentes</h2>
                  <p style={{color:'var(--ink-500)', fontSize:13}}>Gestion des comptes agentes, parts par défaut et redevances.</p>
                </div>
                <button className="btn btn-primary" onClick={ouvrirCreer}>+ Nouvelle agente</button>
              </div>

              {agentes.length === 0 ? (
                <p style={{textAlign:'center', color:'var(--ink-400)', fontSize:13, paddingTop:24}}>Aucune agente</p>
              ) : (
                <div style={{display:'flex', flexDirection:'column', gap:10}}>
                  {agentes.map(agente => (
                    <div key={agente.id} style={{padding:'14px 18px', border:'1px solid var(--ink-200)', borderRadius:12, display:'flex', flexDirection:'column', gap:12}}>
                      {/* Infos principales */}
                      <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12}}>
                        <div>
                          <div style={{fontSize:14, fontWeight:700, color:'var(--ink-900)'}}>{agente.prenom} {agente.nom}</div>
                          <div style={{fontSize:12.5, color:'var(--ink-500)', marginTop:3}}>{agente.email}</div>
                          {agente.telephone && <div style={{fontSize:12, color:'var(--ink-400)', marginTop:2}}>{agente.telephone}</div>}
                        </div>
                        <div style={{display:'flex', gap:6, flexShrink:0}}>
                          <button className="btn btn-ghost" style={{fontSize:12, padding:'5px 10px'}} onClick={() => ouvrirModifier(agente)}>Modifier</button>
                          <button className="btn btn-ghost" style={{fontSize:12, padding:'5px 10px', color:'var(--bad)', borderColor:'rgba(239,68,68,0.3)'}} onClick={() => ouvrirSupprimer(agente)}>Supprimer</button>
                        </div>
                      </div>

                      {/* Paramètres financiers */}
                      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
                        <div style={{background:'var(--surface-2)', borderRadius:8, padding:'10px 12px'}}>
                          <div className="eyebrow" style={{fontSize:10, marginBottom:4}}>Répartitions commission</div>
                          <div style={{fontWeight:700, color:'var(--ink-900)', fontSize:13}}>
                            {agente.parts_agente_disponibles?.length > 0
                              ? agente.parts_agente_disponibles.map(p => `${Math.round(p * 100)} / ${Math.round((1 - p) * 100)}`).join(' · ')
                              : fmtPct(agente.part_agente_defaut)}
                          </div>
                        </div>
                        <div style={{background:'var(--surface-2)', borderRadius:8, padding:'10px 12px'}}>
                          <div className="eyebrow" style={{fontSize:10, marginBottom:4}}>Répartition frais (agente / CTP)</div>
                          <div style={{fontWeight:700, color:'var(--ink-900)', fontSize:13}}>{fmtPct(agente.frais_part_agente_defaut)}</div>
                        </div>
                        {agente.redevance_debut && (
                          <div style={{background:'var(--surface-2)', borderRadius:8, padding:'10px 12px'}}>
                            <div className="eyebrow" style={{fontSize:10, marginBottom:4}}>Redevances depuis</div>
                            <div style={{fontWeight:700, color:'var(--ink-900)', fontSize:13}}>
                              {new Date(agente.redevance_debut).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* KBIS */}
                      <div style={{display:'flex', alignItems:'center', gap:10}}>
                        <span className="eyebrow" style={{fontSize:10}}>KBIS :</span>
                        {agente.kbis_url ? (
                          <div style={{display:'flex', alignItems:'center', gap:8}}>
                            <button className="btn btn-ghost" style={{fontSize:11.5, padding:'3px 9px'}} onClick={() => voirKbis(agente.kbis_url)}>📄 Voir le KBIS</button>
                            <label style={{fontSize:11.5, color:'var(--ink-400)', cursor:'pointer'}}>
                              Remplacer
                              <input type="file" accept=".pdf" style={{display:'none'}} onChange={e => e.target.files[0] && uploadKbis(agente.id, e.target.files[0])} />
                            </label>
                          </div>
                        ) : (
                          <label style={{fontSize:11.5, cursor:'pointer', padding:'3px 9px', borderRadius:6, border:'1px solid var(--ink-200)', color: uploadingKbis === agente.id ? 'var(--ink-300)' : 'var(--brand-700)'}}>
                            {uploadingKbis === agente.id ? 'Upload…' : '+ Uploader le KBIS'}
                            <input type="file" accept=".pdf" style={{display:'none'}} disabled={uploadingKbis === agente.id} onChange={e => e.target.files[0] && uploadKbis(agente.id, e.target.files[0])} />
                          </label>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Documents (RIB) */}
          {section === 'documents' && (
            <div style={{display:'flex', flexDirection:'column', gap:18}}>
              <div>
                <h2 className="page" style={{fontSize:18, marginBottom:4}}>RIB & documents</h2>
                <p style={{color:'var(--ink-500)', fontSize:13}}>Documents PDF utilisés pour les automations par email.</p>
              </div>
              <div style={{display:'flex', flexDirection:'column', gap:10, maxWidth:520}}>
                <div style={{
                  padding:'14px 18px', border:'1px solid', borderColor: profile?.rib_url ? 'var(--ink-200)' : 'rgba(245,158,11,0.3)',
                  borderRadius:12, display:'flex', justifyContent:'space-between', alignItems:'center', gap:14
                }}>
                  <div style={{display:'flex', alignItems:'center', gap:12}}>
                    <div style={{width:36, height:36, borderRadius:8, background: profile?.rib_url ? 'var(--brand-50)' : 'rgba(245,158,11,0.12)', color: profile?.rib_url ? 'var(--brand-800)' : '#a16207', display:'grid', placeItems:'center', fontSize:18}}>📄</div>
                    <div>
                      <div style={{fontSize:13.5, fontWeight:700, color:'var(--ink-900)'}}>RIB</div>
                      <div style={{fontSize:11.5, color:'var(--ink-500)', marginTop:2}}>{profile?.rib_url ? 'Fichier uploadé' : 'Aucun fichier'}</div>
                    </div>
                  </div>
                  {profile?.rib_url ? (
                    <div style={{display:'flex', gap:8}}>
                      <button className="btn btn-ghost" style={{fontSize:12}} onClick={voirRib}>Voir</button>
                      <label className="btn btn-ghost" style={{fontSize:12, cursor:'pointer', opacity: uploadingRib ? 0.5 : 1}}>
                        {uploadingRib ? 'Upload…' : 'Remplacer'}
                        <input type="file" accept=".pdf" style={{display:'none'}} disabled={uploadingRib} onChange={e => e.target.files[0] && uploadRib(e.target.files[0])} />
                      </label>
                    </div>
                  ) : (
                    <label className="btn btn-primary" style={{fontSize:12, cursor:'pointer', opacity: uploadingRib ? 0.5 : 1}}>
                      {uploadingRib ? 'Upload…' : '+ Uploader'}
                      <input type="file" accept=".pdf" style={{display:'none'}} disabled={uploadingRib} onChange={e => e.target.files[0] && uploadRib(e.target.files[0])} />
                    </label>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Sections stub — à implémenter */}
          {['profil', 'agence', 'parts', 'notifs', 'securite'].includes(section) && (
            <div style={{display:'flex', alignItems:'center', justifyContent:'center', height:200}}>
              <div style={{textAlign:'center', color:'var(--ink-400)', fontSize:13}}>
                <div style={{fontSize:28, marginBottom:12}}>🔧</div>
                <div>Cette section est en cours de développement.</div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Modal créer / modifier */}
      {(modal === 'creer' || modal === 'modifier') && (
        <div style={{position:'fixed', inset:0, background:'rgba(15,39,68,0.55)', zIndex:100, display:'grid', placeItems:'center', padding:20}} onClick={() => { setModal(false); setErreur(''); setSucces('') }}>
          <div className="card" style={{padding:0, maxWidth:520, width:'100%', maxHeight:'90vh', overflow:'auto'}} onClick={e => e.stopPropagation()}>
            <div style={{padding:'18px 22px', borderBottom:'1px solid var(--ink-200)', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <div>
                <h2 className="page" style={{fontSize:16}}>{modal === 'creer' ? 'Nouvelle agente' : `Modifier — ${agenteEditee?.prenom} ${agenteEditee?.nom}`}</h2>
                <div className="eyebrow" style={{marginTop:4}}>{modal === 'creer' ? 'Invitation par email' : 'Profil et parts'}</div>
              </div>
            </div>
            <div style={{padding:22, display:'flex', flexDirection:'column', gap:14}}>
              {erreur && <div style={{background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:8, padding:'8px 12px', fontSize:13, color:'#b91c1c'}}>{erreur}</div>}
              {succes && <div style={{background:'rgba(22,163,74,0.07)', border:'1px solid rgba(22,163,74,0.25)', borderRadius:8, padding:'8px 12px', fontSize:13, color:'#15803d'}}>{succes}</div>}
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
                <div><label style={{display:'block', fontSize:12, fontWeight:600, color:'var(--ink-600)', marginBottom:5}}>Prénom *</label><input className="input" type="text" value={form.prenom} onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))} placeholder="Prénom" /></div>
                <div><label style={{display:'block', fontSize:12, fontWeight:600, color:'var(--ink-600)', marginBottom:5}}>Nom *</label><input className="input" type="text" value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} placeholder="Nom" /></div>
              </div>
              {modal === 'creer' && (
                <div>
                  <label style={{display:'block', fontSize:12, fontWeight:600, color:'var(--ink-600)', marginBottom:5}}>Email *</label>
                  <input className="input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@exemple.com" />
                  <div style={{fontSize:11.5, color:'var(--ink-400)', marginTop:4}}>Un email d'invitation sera envoyé à cette adresse</div>
                </div>
              )}
              <div><label style={{display:'block', fontSize:12, fontWeight:600, color:'var(--ink-600)', marginBottom:5}}>Téléphone</label><input className="input" type="tel" value={form.telephone} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))} placeholder="06 00 00 00 00" /></div>
              <div>
                <label style={{display:'block', fontSize:12, fontWeight:600, color:'var(--ink-600)', marginBottom:5}}>Début des redevances</label>
                <input className="input" type="date" value={form.redevance_debut} onChange={e => setForm(f => ({ ...f, redevance_debut: e.target.value }))} />
                <div style={{fontSize:11.5, color:'var(--ink-400)', marginTop:4}}>Date à partir de laquelle la redevance mensuelle de 540 € est due.</div>
              </div>
              <div>
                <label style={{display:'block', fontSize:12, fontWeight:600, color:'var(--ink-600)', marginBottom:5}}>Répartitions commission disponibles — agente %</label>
                <input className="input" type="text" value={form.parts_agente_disponibles} onChange={e => setForm(f => ({ ...f, parts_agente_disponibles: e.target.value }))} placeholder="ex: 60 ou 50, 60" />
                <div style={{fontSize:11.5, color:'var(--ink-400)', marginTop:4}}>Une valeur = pas de choix. Plusieurs séparées par virgule = l'agente choisit à la création.</div>
              </div>
              <div>
                <label style={{display:'block', fontSize:12, fontWeight:600, color:'var(--ink-600)', marginBottom:8}}>Répartition frais de consultation — agente / CTP</label>
                <div style={{display:'flex', alignItems:'center', gap:10}}>
                  <div style={{flex:1}}>
                    <input className="input" type="number" min="0" max="100" value={form.frais_part_agente_defaut} onChange={e => setForm(f => ({ ...f, frais_part_agente_defaut: parseInt(e.target.value) || 0 }))} style={{textAlign:'center'}} />
                    <div style={{fontSize:11, textAlign:'center', color:'var(--ink-400)', marginTop:3}}>Agente %</div>
                  </div>
                  <span style={{color:'var(--ink-400)', fontWeight:600}}>/</span>
                  <div style={{flex:1}}>
                    <input className="input" type="number" value={100 - form.frais_part_agente_defaut} disabled style={{textAlign:'center', opacity:0.5}} />
                    <div style={{fontSize:11, textAlign:'center', color:'var(--ink-400)', marginTop:3}}>CTP %</div>
                  </div>
                </div>
              </div>
            </div>
            <div style={{padding:'14px 22px', borderTop:'1px solid var(--ink-200)', display:'flex', gap:8, justifyContent:'flex-end'}}>
              <button className="btn btn-ghost" onClick={() => { setModal(false); setErreur(''); setSucces('') }}>Annuler</button>
              <button className="btn btn-primary" onClick={modal === 'creer' ? creerAgente : modifierAgente} disabled={saving || !form.prenom || !form.nom || (modal === 'creer' && !form.email)} style={{opacity: (saving || !form.prenom || !form.nom || (modal === 'creer' && !form.email)) ? 0.5 : 1}}>
                {saving ? 'Enregistrement…' : modal === 'creer' ? "Envoyer l'invitation" : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal suppression agente */}
      {modal === 'supprimer' && agenteASupprimer && (
        <div style={{position:'fixed', inset:0, background:'rgba(15,39,68,0.55)', zIndex:100, display:'grid', placeItems:'center', padding:20}} onClick={() => { setModal(false); setAgenteASupprimer(null); setErreur('') }}>
          <div className="card" style={{padding:24, maxWidth:440, width:'100%'}} onClick={e => e.stopPropagation()}>
            <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:16}}>
              <div style={{width:40, height:40, borderRadius:99, background:'rgba(239,68,68,0.1)', color:'#DC2626', display:'grid', placeItems:'center', fontSize:18, flexShrink:0}}>⚠</div>
              <div>
                <div style={{fontWeight:700, color:'var(--ink-900)'}}>Supprimer cette agente ?</div>
                <div style={{fontSize:13, color:'var(--ink-500)', marginTop:2}}>{agenteASupprimer.prenom} {agenteASupprimer.nom}</div>
              </div>
            </div>
            <div style={{background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.3)', borderRadius:10, padding:'12px 16px', fontSize:13, color:'var(--ink-700)', marginBottom:14}}>
              Cette action est <strong>irréversible</strong>. Le compte de connexion sera supprimé. Les chantiers et données associés seront conservés mais l'agente ne pourra plus se connecter.
            </div>
            {erreur && <div style={{background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:8, padding:'8px 12px', fontSize:13, color:'#b91c1c', marginBottom:12}}>{erreur}</div>}
            <div style={{display:'flex', gap:8}}>
              <button className="btn btn-ghost" style={{flex:1}} onClick={() => { setModal(false); setAgenteASupprimer(null); setErreur('') }}>Annuler</button>
              <button className="btn btn-primary" style={{flex:1, background:'#DC2626', opacity: supprimant ? 0.5 : 1}} onClick={supprimerAgente} disabled={supprimant}>
                {supprimant ? 'Suppression…' : 'Supprimer définitivement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
