// app/parametres/page.js
'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '../lib/auth-context'

const LS = { display:'block', fontSize:12, fontWeight:600, color:'var(--ink-600)', marginBottom:5 }

const NOTIFS = [
  { k:'echeances_devis',  l:'Échéances devis < 7 jours' },
  { k:'comptes_rendus',   l:'Nouveaux comptes-rendus' },
  { k:'acomptes_illico',  l:'Acomptes débloqués illiCO' },
  { k:'messages_clients', l:'Messages clients' },
  { k:'decennales',       l:'Décennales expirantes' },
  { k:'redevances',       l:'Redevances dues' },
]

export default function Parametres() {
  const { profile: authProfile, initialized, fetchProfile } = useAuth()
  const [profile, setProfile]             = useState(null)
  const [loading, setLoading]             = useState(true)
  const [agentes, setAgentes]             = useState([])
  const [saving, setSaving]               = useState(false)
  const [erreur, setErreur]               = useState('')
  const [succes, setSucces]               = useState('')
  const [modal, setModal]                 = useState(false)
  const [agenteEditee, setAgenteEditee]   = useState(null)
  const [agenteASupprimer, setAgenteASupprimer] = useState(null)
  const [supprimant, setSupprimant]       = useState(false)
  const [uploadingKbis, setUploadingKbis] = useState(null)
  const [uploadingRib, setUploadingRib]   = useState(false)
  const [section, setSection]             = useState('profil')
  const [gcalConnected, setGcalConnected] = useState(false)
  const [savingProfil, setSavingProfil]   = useState(false)
  const [savingPwd, setSavingPwd]         = useState(false)
  const [newPwd, setNewPwd]               = useState('')
  const [newPwdConfirm, setNewPwdConfirm] = useState('')
  const router = useRouter()

  const emptyForm = {
    prenom: '', nom: '', email: '', telephone: '',
    parts_agente_disponibles: '60',
    frais_part_agente_defaut: 100,
    redevance_debut: '',
  }
  const [form, setForm] = useState(emptyForm)

  const chargerAgentes = async () => {
    const { data } = await supabase.from('profiles').select('*').eq('role', 'agente').order('prenom')
    setAgentes(data || [])
  }

  useEffect(() => {
    if (!initialized) return
    if (!authProfile) { router.push('/login'); return }
    if (authProfile.role !== 'admin') { router.push('/dashboard'); return }
    setProfile(authProfile)
    Promise.all([
      chargerAgentes(),
      supabase.from('google_tokens')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', authProfile.id)
        .gt('expiry_date', Date.now()),
    ]).then(([, { count }]) => {
      setGcalConnected((count || 0) > 0)
      setLoading(false)
    })
  }, [initialized, authProfile, router])

  /* ── Handlers agentes (inchangés) ── */
  const ouvrirCreer = () => { setForm(emptyForm); setAgenteEditee(null); setModal('creer'); setErreur(''); setSucces('') }
  const ouvrirModifier = (agente) => {
    setForm({
      prenom: agente.prenom || '', nom: agente.nom || '', email: agente.email || '', telephone: agente.telephone || '',
      frais_part_agente_defaut: Math.round((agente.frais_part_agente_defaut || 0.5) * 100),
      parts_agente_disponibles: agente.parts_agente_disponibles?.length > 0
        ? agente.parts_agente_disponibles.map(p => Math.round(p * 100)).join(', ')
        : String(Math.round((agente.part_agente_defaut || 0.5) * 100)),
      redevance_debut: agente.redevance_debut || '',
    })
    setAgenteEditee(agente); setModal('modifier'); setErreur(''); setSucces('')
  }
  const ouvrirSupprimer = (agente) => { setAgenteASupprimer(agente); setModal('supprimer'); setErreur('') }

  const supprimerAgente = async () => {
    if (!agenteASupprimer) return
    setSupprimant(true); setErreur('')
    try {
      const res = await fetch('/api/create-agente', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: agenteASupprimer.id }) })
      const data = await res.json()
      if (!res.ok) { setErreur(data.error || 'Erreur lors de la suppression') }
      else { setSucces(`${agenteASupprimer.prenom} ${agenteASupprimer.nom} supprimée ✓`); setModal(false); setAgenteASupprimer(null); await chargerAgentes() }
    } catch (err) { setErreur(err.message) }
    setSupprimant(false)
  }

  const creerAgente = async () => {
    setSaving(true); setErreur('')
    try {
      const partsArray = form.parts_agente_disponibles.split(',').map(v => parseInt(v.trim()) / 100).filter(v => !isNaN(v) && v > 0 && v <= 1)
      const partDefaut = partsArray[0] ?? 0.5
      const res = await fetch('/api/create-agente', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prenom: form.prenom, nom: form.nom, email: form.email, telephone: form.telephone || null, part_agente_defaut: partDefaut, parts_agente_disponibles: partsArray, frais_part_agente_defaut: form.frais_part_agente_defaut / 100 }) })
      const data = await res.json()
      if (!res.ok) { setErreur(data.error || 'Erreur') } else { setSucces(`Invitation envoyée à ${form.email} ✓`); setModal(false); await chargerAgentes() }
    } catch (err) { setErreur(err.message) }
    setSaving(false)
  }

  const modifierAgente = async () => {
    setSaving(true); setErreur('')
    try {
      const partsArray = form.parts_agente_disponibles.split(',').map(v => parseInt(v.trim()) / 100).filter(v => !isNaN(v) && v > 0 && v <= 1)
      const partDefaut = partsArray[0] ?? 0.5
      const res = await fetch('/api/create-agente', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: agenteEditee.id, prenom: form.prenom, nom: form.nom, telephone: form.telephone || null, part_agente_defaut: partDefaut, parts_agente_disponibles: partsArray, frais_part_agente_defaut: form.frais_part_agente_defaut / 100, redevance_debut: form.redevance_debut || null }) })
      const data = await res.json()
      if (!res.ok) { setErreur(data.error || 'Erreur') } else { setSucces('Profil mis à jour ✓'); setModal(false); await chargerAgentes() }
    } catch (err) { setErreur(err.message) }
    setSaving(false)
  }

  const uploadKbis = async (agenteId, fichier) => {
    setUploadingKbis(agenteId)
    const ext = fichier.name.split('.').pop()
    const chemin = `kbis/${agenteId}.${ext}`
    const { error: uploadError } = await supabase.storage.from('documents').upload(chemin, fichier, { upsert: true })
    if (uploadError) { setErreur('Erreur upload KBIS : ' + uploadError.message); setUploadingKbis(null); return }
    const res = await fetch('/api/create-agente', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: agenteId, kbis_url: chemin }) })
    if (res.ok) { setSucces('KBIS uploadé ✓'); await chargerAgentes() } else { setErreur('Erreur sauvegarde KBIS') }
    setUploadingKbis(null)
  }

  const voirKbis = async (kbisUrl) => {
    const { data } = await supabase.storage.from('documents').createSignedUrl(kbisUrl, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const uploadRib = async (fichier) => {
    if (!profile) return
    setUploadingRib(true)
    const chemin = `rib/${profile.id}.pdf`
    const { error: uploadError } = await supabase.storage.from('documents').upload(chemin, fichier, { upsert: true, contentType: 'application/pdf' })
    if (uploadError) { setErreur('Erreur upload RIB : ' + uploadError.message); setUploadingRib(false); return }
    const { error } = await supabase.from('profiles').update({ rib_url: chemin }).eq('id', profile.id)
    if (error) { setErreur('Erreur sauvegarde RIB : ' + error.message) } else { setSucces('RIB uploadé ✓'); setProfile(p => ({ ...p, rib_url: chemin })) }
    setUploadingRib(false)
  }

  const voirRib = async () => {
    if (!profile?.rib_url) return
    const { data } = await supabase.storage.from('documents').createSignedUrl(profile.rib_url, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  /* ── Nouveaux handlers ── */
  const sauvegarderProfil = async () => {
    setSavingProfil(true); setErreur(''); setSucces('')
    const { error } = await supabase.from('profiles')
      .update({ prenom: profile.prenom, nom: profile.nom, telephone: profile.telephone })
      .eq('id', profile.id)
    if (error) setErreur('Erreur : ' + error.message)
    else setSucces('Profil enregistré ✓')
    setSavingProfil(false)
  }

  const toggleNotif = async (key, currentValue) => {
    const newPrefs = { ...(profile.notif_prefs || {}), [key]: !currentValue }
    await supabase.from('profiles').update({ notif_prefs: newPrefs }).eq('id', profile.id)
    fetchProfile()
  }

  const changerMotDePasse = async () => {
    if (!newPwd || newPwd !== newPwdConfirm) { setErreur('Les mots de passe ne correspondent pas'); return }
    if (newPwd.length < 8) { setErreur('8 caractères minimum'); return }
    setSavingPwd(true); setErreur(''); setSucces('')
    const { error } = await supabase.auth.updateUser({ password: newPwd })
    if (error) setErreur('Erreur : ' + error.message)
    else { setSucces('Mot de passe modifié ✓'); setNewPwd(''); setNewPwdConfirm('') }
    setSavingPwd(false)
  }

  const fmtPct = (val) => { if (val === undefined || val === null) return '—'; const pct = Math.round(val * 100); return `${pct} / ${100 - pct}` }

  if (loading) return <div style={{paddingTop:96, textAlign:'center', color:'var(--ink-400)'}}>Chargement…</div>

  const NAV = [
    { k:'profil',       l:'Profil franchisée' },
    { k:'agence',       l:'Agence' },
    { k:'equipe',       l:'Équipe & agentes', count: agentes.length },
    { k:'parts',        l:'Parts & royalties' },
    { k:'documents',    l:'RIB & Kbis' },
    { k:'notifs',       l:'Notifications' },
    { k:'integrations', l:'Intégrations' },
    { k:'securite',     l:'Sécurité' },
  ]

  return (
    <div className="page-enter" style={{padding:'28px 32px', display:'flex', flexDirection:'column', gap:18}}>

      <div>
        <div className="eyebrow" style={{marginBottom:4}}>Système</div>
        <h1 className="page">Paramètres</h1>
        <div style={{color:'var(--ink-500)', fontSize:13, marginTop:6}}>Configuration de l'agence et de l'équipe</div>
      </div>

      {succes && !modal && <div style={{background:'rgba(22,163,74,0.07)', border:'1px solid rgba(22,163,74,0.25)', borderRadius:10, padding:'10px 16px', fontSize:13, color:'#15803d'}}>{succes}</div>}
      {erreur && !modal && <div style={{background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:10, padding:'10px 16px', fontSize:13, color:'#b91c1c'}}>{erreur}</div>}

      <div className="card" style={{padding:0, overflow:'hidden', display:'grid', gridTemplateColumns:'240px 1fr', minHeight:560}}>

        {/* Nav latérale */}
        <nav style={{padding:'10px 0', borderRight:'1px solid var(--ink-200)'}}>
          {NAV.map(({ k, l, count }) => {
            const active = section === k
            return (
              <button key={k} onClick={() => setSection(k)} className={active ? '' : 'row-hover'} style={{
                width:'100%', textAlign:'left', padding:'10px 16px', display:'flex', alignItems:'center', gap:8,
                border:0, cursor:'pointer', fontWeight: active ? 700 : 500, fontSize:13.5,
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

        {/* Contenu */}
        <div style={{padding:28, overflowY:'auto'}}>

          {/* ── Profil franchisée ── */}
          {section === 'profil' && (
            <div style={{display:'flex', flexDirection:'column', gap:18}}>
              <div>
                <h2 className="page" style={{fontSize:18, marginBottom:4}}>Profil franchisée</h2>
                <p style={{color:'var(--ink-500)', fontSize:13}}>Informations affichées sur les documents générés par l'application.</p>
              </div>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, maxWidth:680}}>
                <div>
                  <label style={LS}>Prénom</label>
                  <input className="input" value={profile?.prenom || ''} onChange={e => setProfile(p => ({ ...p, prenom: e.target.value }))}/>
                </div>
                <div>
                  <label style={LS}>Nom</label>
                  <input className="input" value={profile?.nom || ''} onChange={e => setProfile(p => ({ ...p, nom: e.target.value }))}/>
                </div>
                <div>
                  <label style={LS}>Téléphone</label>
                  <input className="input" value={profile?.telephone || ''} onChange={e => setProfile(p => ({ ...p, telephone: e.target.value }))}/>
                </div>
                <div>
                  <label style={LS}>Email</label>
                  <input className="input" value={profile?.email || ''} disabled style={{opacity:0.6}}/>
                  <div style={{fontSize:11, color:'var(--ink-400)', marginTop:3}}>Modifiable dans Sécurité via Supabase Auth</div>
                </div>
              </div>
              <div>
                <button className="btn btn-primary" onClick={sauvegarderProfil} disabled={savingProfil}>
                  {savingProfil ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </div>
          )}

          {/* ── Agence ── */}
          {section === 'agence' && (
            <div style={{display:'flex', flexDirection:'column', gap:18}}>
              <div>
                <h2 className="page" style={{fontSize:18, marginBottom:4}}>Agence</h2>
                <p style={{color:'var(--ink-500)', fontSize:13}}>Informations légales · données publiques enregistrées au RCS.</p>
              </div>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, maxWidth:680}}>
                {[
                  { l:'Raison sociale',    v:'Conseil Travaux Provence' },
                  { l:'Franchise',         v:'illiCO travaux Martigues' },
                  { l:'SIRET',             v:'948 096 888 00011' },
                  { l:'RCS',               v:'Aix-en-Provence (16/01/2023)' },
                  { l:'Adresse',           v:'22 rue Ramade, 13500 Martigues' },
                  { l:'Téléphone agence',  v:'06 59 81 06 81' },
                ].map(({ l, v }) => (
                  <div key={l} style={{padding:'14px 16px', background:'var(--surface-2)', borderRadius:10, border:'1px solid var(--ink-100)'}}>
                    <div className="eyebrow" style={{fontSize:10, marginBottom:6}}>{l}</div>
                    <div style={{fontSize:13.5, fontWeight:700, color:'var(--ink-900)'}}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{fontSize:12, color:'var(--ink-400)'}}>Pour modifier ces informations, contactez le réseau illiCO travaux.</div>
            </div>
          )}

          {/* ── Équipe & agentes ── */}
          {section === 'equipe' && (
            <div style={{display:'flex', flexDirection:'column', gap:18}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-end'}}>
                <div>
                  <h2 className="page" style={{fontSize:18, marginBottom:4}}>Équipe & agentes</h2>
                  <p style={{color:'var(--ink-500)', fontSize:13}}>Comptes agentes, accès et documents. Les parts sont dans "Parts & royalties".</p>
                </div>
                <button className="btn btn-primary" onClick={ouvrirCreer}>+ Nouvelle agente</button>
              </div>
              {agentes.length === 0 ? (
                <p style={{textAlign:'center', color:'var(--ink-400)', fontSize:13, paddingTop:24}}>Aucune agente</p>
              ) : (
                <div style={{display:'flex', flexDirection:'column', gap:10}}>
                  {agentes.map(agente => {
                    const initials = `${(agente.prenom || '').charAt(0)}${(agente.nom || '').charAt(0)}`.toUpperCase()
                    return (
                      <div key={agente.id} style={{padding:'14px 18px', border:'1px solid var(--ink-200)', borderRadius:12, display:'flex', alignItems:'center', gap:14, flexWrap:'wrap'}}>
                        <div style={{width:42, height:42, borderRadius:99, background:'var(--brand-700)', color:'#fff', display:'grid', placeItems:'center', fontSize:14, fontWeight:700, flexShrink:0}}>
                          {initials}
                        </div>
                        <div style={{flex:1, minWidth:180}}>
                          <div style={{fontSize:14, fontWeight:700, color:'var(--ink-900)'}}>{agente.prenom} {agente.nom}</div>
                          <div style={{fontSize:12, color:'var(--ink-500)', marginTop:2}}>{agente.email}</div>
                          {agente.telephone && <div style={{fontSize:12, color:'var(--ink-400)', marginTop:1}}>{agente.telephone}</div>}
                        </div>
                        {/* KBIS */}
                        <div style={{display:'flex', alignItems:'center', gap:8}}>
                          <span className="eyebrow" style={{fontSize:10}}>KBIS</span>
                          {agente.kbis_url ? (
                            <>
                              <button className="btn btn-ghost" style={{fontSize:11.5, padding:'3px 9px'}} onClick={() => voirKbis(agente.kbis_url)}>Voir</button>
                              <label style={{fontSize:11.5, cursor:'pointer', color:'var(--ink-400)'}}>
                                Remplacer
                                <input type="file" accept=".pdf" style={{display:'none'}} onChange={e => e.target.files[0] && uploadKbis(agente.id, e.target.files[0])} />
                              </label>
                            </>
                          ) : (
                            <label style={{fontSize:11.5, cursor:'pointer', padding:'3px 9px', borderRadius:6, border:'1px solid var(--ink-200)', color: uploadingKbis === agente.id ? 'var(--ink-300)' : 'var(--brand-700)'}}>
                              {uploadingKbis === agente.id ? 'Upload…' : '+ KBIS'}
                              <input type="file" accept=".pdf" style={{display:'none'}} disabled={uploadingKbis === agente.id} onChange={e => e.target.files[0] && uploadKbis(agente.id, e.target.files[0])} />
                            </label>
                          )}
                        </div>
                        <span style={{padding:'2px 10px', borderRadius:99, fontSize:11.5, fontWeight:700, background:'rgba(22,163,74,0.1)', color:'#15803d', flexShrink:0}}>Actif</span>
                        <div style={{display:'flex', gap:6, flexShrink:0}}>
                          <button className="btn btn-ghost" style={{fontSize:12, padding:'5px 10px'}} onClick={() => ouvrirModifier(agente)}>Modifier</button>
                          <button className="btn btn-ghost" style={{fontSize:12, padding:'5px 10px', color:'var(--bad)', borderColor:'rgba(239,68,68,0.3)'}} onClick={() => ouvrirSupprimer(agente)}>Supprimer</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Parts & royalties ── */}
          {section === 'parts' && (
            <div style={{display:'flex', flexDirection:'column', gap:18}}>
              <div>
                <h2 className="page" style={{fontSize:18, marginBottom:4}}>Parts & royalties</h2>
                <p style={{color:'var(--ink-500)', fontSize:13}}>Répartitions commission, frais et redevances par agente. Cliquez "Modifier" pour éditer.</p>
              </div>
              {agentes.length === 0 ? (
                <p style={{textAlign:'center', color:'var(--ink-400)', fontSize:13, paddingTop:24}}>Aucune agente</p>
              ) : (
                <div style={{display:'flex', flexDirection:'column', gap:10}}>
                  {agentes.map(agente => (
                    <div key={agente.id} style={{padding:'18px 20px', border:'1px solid var(--ink-200)', borderRadius:12, display:'flex', flexDirection:'column', gap:14}}>
                      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:12}}>
                        <div style={{fontSize:14, fontWeight:700, color:'var(--ink-900)'}}>{agente.prenom} {agente.nom}</div>
                        <button className="btn btn-ghost" style={{fontSize:12, padding:'5px 10px'}} onClick={() => ouvrirModifier(agente)}>Modifier</button>
                      </div>
                      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10}}>
                        <div style={{background:'var(--surface-2)', borderRadius:8, padding:'10px 14px'}}>
                          <div className="eyebrow" style={{fontSize:10, marginBottom:6}}>Répartitions commission</div>
                          <div style={{fontWeight:700, color:'var(--ink-900)', fontSize:13}}>
                            {agente.parts_agente_disponibles?.length > 0
                              ? agente.parts_agente_disponibles.map(p => `${Math.round(p * 100)} / ${Math.round((1 - p) * 100)}`).join(' · ')
                              : fmtPct(agente.part_agente_defaut)}
                          </div>
                          <div style={{fontSize:11, color:'var(--ink-400)', marginTop:3}}>agente / CTP</div>
                        </div>
                        <div style={{background:'var(--surface-2)', borderRadius:8, padding:'10px 14px'}}>
                          <div className="eyebrow" style={{fontSize:10, marginBottom:6}}>Répartition frais</div>
                          <div style={{fontWeight:700, color:'var(--ink-900)', fontSize:13}}>{fmtPct(agente.frais_part_agente_defaut)}</div>
                          <div style={{fontSize:11, color:'var(--ink-400)', marginTop:3}}>agente / CTP</div>
                        </div>
                        <div style={{background:'var(--surface-2)', borderRadius:8, padding:'10px 14px'}}>
                          <div className="eyebrow" style={{fontSize:10, marginBottom:6}}>Redevances depuis</div>
                          <div style={{fontWeight:700, color:'var(--ink-900)', fontSize:13}}>
                            {agente.redevance_debut
                              ? new Date(agente.redevance_debut).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
                              : '—'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── RIB & Kbis ── */}
          {section === 'documents' && (
            <div style={{display:'flex', flexDirection:'column', gap:18}}>
              <div>
                <h2 className="page" style={{fontSize:18, marginBottom:4}}>RIB & Kbis</h2>
                <p style={{color:'var(--ink-500)', fontSize:13}}>Documents PDF utilisés pour les automations par email.</p>
              </div>
              <div style={{display:'flex', flexDirection:'column', gap:10, maxWidth:520}}>
                <div style={{padding:'14px 18px', border:'1px solid', borderColor: profile?.rib_url ? 'var(--ink-200)' : 'rgba(245,158,11,0.3)', borderRadius:12, display:'flex', justifyContent:'space-between', alignItems:'center', gap:14}}>
                  <div style={{display:'flex', alignItems:'center', gap:12}}>
                    <div style={{width:36, height:36, borderRadius:8, background: profile?.rib_url ? 'var(--brand-50)' : 'rgba(245,158,11,0.12)', color: profile?.rib_url ? 'var(--brand-800)' : '#a16207', display:'grid', placeItems:'center', fontSize:18}}>📄</div>
                    <div>
                      <div style={{fontSize:13.5, fontWeight:700, color:'var(--ink-900)'}}>RIB franchisée</div>
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

          {/* ── Notifications ── */}
          {section === 'notifs' && (
            <div style={{display:'flex', flexDirection:'column', gap:18}}>
              <div>
                <h2 className="page" style={{fontSize:18, marginBottom:4}}>Notifications</h2>
                <p style={{color:'var(--ink-500)', fontSize:13}}>Préférences enregistrées dans votre profil.</p>
              </div>
              <div style={{display:'flex', flexDirection:'column', gap:8, maxWidth:520}}>
                {NOTIFS.map(n => {
                  const active = (profile?.notif_prefs?.[n.k]) !== false
                  return (
                    <label key={n.k} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', border:'1px solid var(--ink-200)', borderRadius:10, cursor:'pointer'}}>
                      <span style={{fontSize:13, color:'var(--ink-700)'}}>{n.l}</span>
                      <input type="checkbox" checked={active} onChange={() => toggleNotif(n.k, active)}
                        style={{width:16, height:16, cursor:'pointer', accentColor:'var(--brand-700)'}}/>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Intégrations ── */}
          {section === 'integrations' && (
            <div style={{display:'flex', flexDirection:'column', gap:18}}>
              <div>
                <h2 className="page" style={{fontSize:18, marginBottom:4}}>Intégrations</h2>
                <p style={{color:'var(--ink-500)', fontSize:13}}>Services connectés à l'application.</p>
              </div>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, maxWidth:680}}>
                {[
                  { l:'Google Calendar', desc:'Sync des RDV et interventions',   connected: gcalConnected },
                  { l:'Google Drive',    desc:'Stockage documents chantier',      connected: false },
                  { l:'Supabase',        desc:'Base de données principale',       connected: true },
                  { l:'IA Claude',       desc:'Génération comptes-rendus IA',     connected: true },
                ].map(int => (
                  <div key={int.l} style={{padding:18, border:'1px solid var(--ink-200)', borderRadius:12, display:'flex', flexDirection:'column', gap:8}}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
                      <div style={{fontWeight:700, fontSize:13.5, color:'var(--ink-900)'}}>{int.l}</div>
                      <span style={{fontSize:11.5, fontWeight:700, padding:'2px 8px', borderRadius:99, background: int.connected ? 'rgba(22,163,74,0.1)' : 'var(--ink-100)', color: int.connected ? '#15803d' : 'var(--ink-500)'}}>
                        {int.connected ? 'Connecté' : 'Non connecté'}
                      </span>
                    </div>
                    <div style={{fontSize:12, color:'var(--ink-500)'}}>{int.desc}</div>
                    {!int.connected && (
                      <button className="btn btn-ghost" style={{fontSize:11.5, alignSelf:'flex-start', marginTop:2}}>Connecter</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Sécurité ── */}
          {section === 'securite' && (
            <div style={{display:'flex', flexDirection:'column', gap:18, maxWidth:520}}>
              <div>
                <h2 className="page" style={{fontSize:18, marginBottom:4}}>Sécurité</h2>
                <p style={{color:'var(--ink-500)', fontSize:13}}>Modifier votre mot de passe de connexion.</p>
              </div>
              <div>
                <label style={LS}>Email (identifiant)</label>
                <input className="input" value={profile?.email || ''} disabled style={{opacity:0.6}}/>
              </div>
              <div>
                <label style={LS}>Nouveau mot de passe</label>
                <input className="input" type="password" placeholder="8 caractères minimum" value={newPwd} onChange={e => setNewPwd(e.target.value)}/>
              </div>
              <div>
                <label style={LS}>Confirmer le mot de passe</label>
                <input className="input" type="password" placeholder="Même mot de passe" value={newPwdConfirm} onChange={e => setNewPwdConfirm(e.target.value)}/>
                {newPwd && newPwdConfirm && newPwd !== newPwdConfirm && (
                  <div style={{fontSize:11.5, color:'#b91c1c', marginTop:4}}>Les mots de passe ne correspondent pas</div>
                )}
              </div>
              <div>
                <button className="btn btn-primary" onClick={changerMotDePasse}
                  disabled={savingPwd || !newPwd || newPwd !== newPwdConfirm}>
                  {savingPwd ? 'Enregistrement…' : 'Changer le mot de passe'}
                </button>
              </div>
              <div style={{padding:16, background:'var(--surface-2)', borderRadius:10, border:'1px solid var(--ink-200)'}}>
                <div style={{fontWeight:700, fontSize:13, color:'var(--ink-900)'}}>Authentification à deux facteurs</div>
                <div style={{fontSize:12, color:'var(--ink-500)', marginTop:4}}>Non disponible pour le moment via cette interface.</div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Modal créer / modifier ── */}
      {(modal === 'creer' || modal === 'modifier') && (
        <div style={{position:'fixed', inset:0, background:'rgba(15,39,68,0.55)', zIndex:100, display:'grid', placeItems:'center', padding:20}} onClick={() => { setModal(false); setErreur(''); setSucces('') }}>
          <div className="card" style={{padding:0, maxWidth:520, width:'100%', maxHeight:'90vh', overflow:'auto'}} onClick={e => e.stopPropagation()}>
            <div style={{padding:'18px 22px', borderBottom:'1px solid var(--ink-200)'}}>
              <h2 className="page" style={{fontSize:16}}>{modal === 'creer' ? 'Nouvelle agente' : `Modifier — ${agenteEditee?.prenom} ${agenteEditee?.nom}`}</h2>
              <div className="eyebrow" style={{marginTop:4}}>{modal === 'creer' ? 'Invitation par email' : 'Profil et parts'}</div>
            </div>
            <div style={{padding:22, display:'flex', flexDirection:'column', gap:14}}>
              {erreur && <div style={{background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:8, padding:'8px 12px', fontSize:13, color:'#b91c1c'}}>{erreur}</div>}
              {succes && <div style={{background:'rgba(22,163,74,0.07)', border:'1px solid rgba(22,163,74,0.25)', borderRadius:8, padding:'8px 12px', fontSize:13, color:'#15803d'}}>{succes}</div>}
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
                <div><label style={LS}>Prénom *</label><input className="input" value={form.prenom} onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))} placeholder="Prénom"/></div>
                <div><label style={LS}>Nom *</label><input className="input" value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} placeholder="Nom"/></div>
              </div>
              {modal === 'creer' && (
                <div>
                  <label style={LS}>Email *</label>
                  <input className="input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@exemple.com"/>
                  <div style={{fontSize:11.5, color:'var(--ink-400)', marginTop:4}}>Un email d'invitation sera envoyé à cette adresse</div>
                </div>
              )}
              <div><label style={LS}>Téléphone</label><input className="input" type="tel" value={form.telephone} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))} placeholder="06 00 00 00 00"/></div>
              <div>
                <label style={LS}>Début des redevances</label>
                <input className="input" type="date" value={form.redevance_debut} onChange={e => setForm(f => ({ ...f, redevance_debut: e.target.value }))}/>
                <div style={{fontSize:11.5, color:'var(--ink-400)', marginTop:4}}>Date à partir de laquelle la redevance mensuelle de 540 € est due.</div>
              </div>
              <div>
                <label style={LS}>Répartitions commission disponibles — agente %</label>
                <input className="input" value={form.parts_agente_disponibles} onChange={e => setForm(f => ({ ...f, parts_agente_disponibles: e.target.value }))} placeholder="ex: 60 ou 50, 60"/>
                <div style={{fontSize:11.5, color:'var(--ink-400)', marginTop:4}}>Une valeur = pas de choix. Plusieurs séparées par virgule = l'agente choisit.</div>
              </div>
              <div>
                <label style={LS}>Répartition frais de consultation — agente / CTP</label>
                <div style={{display:'flex', alignItems:'center', gap:10}}>
                  <div style={{flex:1}}>
                    <input className="input" type="number" min="0" max="100" value={form.frais_part_agente_defaut} onChange={e => setForm(f => ({ ...f, frais_part_agente_defaut: parseInt(e.target.value) || 0 }))} style={{textAlign:'center'}}/>
                    <div style={{fontSize:11, textAlign:'center', color:'var(--ink-400)', marginTop:3}}>Agente %</div>
                  </div>
                  <span style={{color:'var(--ink-400)', fontWeight:600}}>/</span>
                  <div style={{flex:1}}>
                    <input className="input" type="number" value={100 - form.frais_part_agente_defaut} disabled style={{textAlign:'center', opacity:0.5}}/>
                    <div style={{fontSize:11, textAlign:'center', color:'var(--ink-400)', marginTop:3}}>CTP %</div>
                  </div>
                </div>
              </div>
            </div>
            <div style={{padding:'14px 22px', borderTop:'1px solid var(--ink-200)', display:'flex', gap:8, justifyContent:'flex-end'}}>
              <button className="btn btn-ghost" onClick={() => { setModal(false); setErreur(''); setSucces('') }}>Annuler</button>
              <button className="btn btn-primary" onClick={modal === 'creer' ? creerAgente : modifierAgente}
                disabled={saving || !form.prenom || !form.nom || (modal === 'creer' && !form.email)}
                style={{opacity: (saving || !form.prenom || !form.nom || (modal === 'creer' && !form.email)) ? 0.5 : 1}}>
                {saving ? 'Enregistrement…' : modal === 'creer' ? "Envoyer l'invitation" : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal suppression ── */}
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
              Cette action est <strong>irréversible</strong>. Le compte de connexion sera supprimé. Les chantiers et données associés seront conservés.
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
