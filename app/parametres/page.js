// app/parametres/page.js
'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '../lib/auth-context'
import { authHeaders } from '../lib/api-auth-client'
import MesCalendriers from '../components/MesCalendriers'

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
  const { profile: authProfile, initialized, fetchProfile, agenceActive, agences: agencesCtx, refreshAgences } = useAuth()
  const [profile, setProfile]             = useState(null)
  const [loading, setLoading]             = useState(true)
  const [agentes, setAgentes]             = useState([])
  const [societe, setSociete]             = useState(null)
  const [agences, setAgences]             = useState([])
  const [objectifs, setObjectifs]         = useState([])
  const [objAgenceVal, setObjAgenceVal]   = useState('')
  const [savingObjAgence, setSavingObjAgence] = useState(false)
  const [objAgenceMsg, setObjAgenceMsg]   = useState('')
  // Multi-agence (5b) : saisie/feedback indépendants par agence (objectif 'agence').
  // Branche mono (objAgenceVal) inchangée.
  const [objAbVals, setObjAbVals]         = useState({})   // { agence_id: string }
  const [objAbSaving, setObjAbSaving]     = useState(null) // agence_id en cours, ou null
  const [objAbMsg, setObjAbMsg]           = useState({})   // { agence_id: message }
  const [saving, setSaving]               = useState(false)
  const [erreur, setErreur]               = useState('')
  const [succes, setSucces]               = useState('')
  const [modal, setModal]                 = useState(false)
  const [agenteEditee, setAgenteEditee]   = useState(null)
  const [agenteASupprimer, setAgenteASupprimer] = useState(null)
  const [supprimant, setSupprimant]       = useState(false)
  const [uploadingKbis, setUploadingKbis] = useState(null)
  const [uploadingRib, setUploadingRib]   = useState(false)
  const [uploadingKbisFranchise, setUploadingKbisFranchise] = useState(false)
  const [section, setSection]             = useState('profil')
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
    redevance_mensuelle_ht: '',
    objectif: '',
    agence_id: '',
  }
  const [form, setForm] = useState(emptyForm)

  // Création d'agence (multi-agence) — état séparé de la modale agente.
  const emptyFormAgence = { nom: '', ville: '', adresse: '', code_postal: '', telephone: '', email: '', responsable_nom: '' }
  const [formAgence, setFormAgence] = useState(emptyFormAgence)
  const [savingAgence, setSavingAgence] = useState(false)

  const chargerAgentes = async () => {
    const { data } = await supabase.from('profiles').select('*').eq('role', 'agente').order('prenom')
    setAgentes(data || [])
  }

  const chargerAgence = async (societeId) => {
    if (!societeId) return
    const [{ data: soc }, { data: ags }] = await Promise.all([
      supabase.from('societes').select('nom_societe, siret, rcs').eq('id', societeId).single(),
      supabase.from('agences').select('id, code, nom, ville, adresse, code_postal, telephone, email, responsable_nom, logo_path').eq('societe_id', societeId).order('code'),
    ])
    setSociete(soc || null)
    setAgences(ags || [])
  }

  // Objectifs de CA (grain annuel). Lecture pour pré-remplir, écriture via sauvegarderObjectif.
  const chargerObjectifs = async () => {
    const annee = new Date().getFullYear()
    const { data } = await supabase.from('objectifs_ca').select('*').eq('annee', annee)
    setObjectifs(data || [])
    setObjAgenceVal(String(data?.find(o => o.cible === 'agence' && o.agente_id === null)?.montant || ''))
    // Index par agence pour la branche multi-agence. Ne remplit que les agences
    // PAS déjà en saisie (préserve les éditions en cours après un rechargement).
    setObjAbVals(prev => {
      const next = { ...prev }
      for (const o of (data || [])) {
        if (o.cible === 'agence' && o.agente_id === null && o.agence_id && !(o.agence_id in next)) {
          next[o.agence_id] = String(o.montant ?? '')
        }
      }
      return next
    })
  }

  // Écriture objectif côté client : objectif d'agence ET objectif d'agente (édition).
  // agence_id est REQUIS par la policy (le trigger en dérive societe_id) + NOT NULL.
  // La création d'agente NE passe PAS par ici (agence inconnue côté client → /api/create-agente).
  const sauvegarderObjectif = async (cible, agenteId, agenceId, montant) => {
    if (!agenceId) return
    const annee = new Date().getFullYear()
    const montantNum = parseFloat(montant) || 0

    // Recherche de la ligne existante scopée par la clé d'unicité RÉELLE (sinon, en
    // multi-agence, maybeSingle voit plusieurs lignes et échoue) :
    //  - agence : (annee, cible, agence_id) WHERE agente_id IS NULL
    //  - agente : (annee, cible, agente_id)
    // L'upsert PostgREST ne peut pas cibler ces index PARTIELS (ON CONFLICT sans WHERE
    // → 42P10), d'où le select-puis-update/insert. Toute erreur est levée (plus de ✓ menteur).
    let q = supabase.from('objectifs_ca').select('id').eq('annee', annee).eq('cible', cible)
    q = agenteId ? q.eq('agente_id', agenteId) : q.is('agente_id', null).eq('agence_id', agenceId)
    const { data: existing, error: selErr } = await q.maybeSingle()
    if (selErr) throw new Error(selErr.message)

    if (existing) {
      const { error } = await supabase.from('objectifs_ca').update({ montant: montantNum }).eq('id', existing.id)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await supabase.from('objectifs_ca').insert({ annee, cible, agente_id: agenteId || null, agence_id: agenceId, montant: montantNum })
      if (error) throw new Error(error.message)
    }
    await chargerObjectifs()
  }

  const enregistrerObjAgence = async () => {
    setSavingObjAgence(true); setObjAgenceMsg('')
    try {
      // Mono-agence : agences[0] EST l'unique agence (pas un choix arbitraire).
      await sauvegarderObjectif('agence', null, agences[0]?.id, objAgenceVal)
      setObjAgenceMsg('Enregistré ✓')
    } catch (err) {
      setObjAgenceMsg('Erreur : ' + err.message)
    }
    setSavingObjAgence(false)
  }

  // Enregistrement de l'objectif d'UNE agence (multi-agence). Réutilise le chemin
  // d'écriture sécurisé sauvegarderObjectif (policy objectifs_ca_scope), non modifié.
  const enregistrerObjAb = async (agenceId) => {
    setObjAbSaving(agenceId); setObjAbMsg(m => ({ ...m, [agenceId]: '' }))
    try {
      await sauvegarderObjectif('agence', null, agenceId, objAbVals[agenceId] ?? '')
      setObjAbMsg(m => ({ ...m, [agenceId]: 'Enregistré ✓' }))
    } catch (err) {
      setObjAbMsg(m => ({ ...m, [agenceId]: 'Erreur : ' + err.message }))
    }
    setObjAbSaving(null)
  }

  const ouvrirCreerAgence = () => { setFormAgence(emptyFormAgence); setModal('creer_agence'); setErreur(''); setSucces('') }

  // Édition d'une agence (admin, ses propres agences) — réutilise formAgence + l'id/code
  // de l'agence ciblée. Écriture via route service_role (agences n'a pas de policy UPDATE).
  const ouvrirEditerAgence = (ag) => {
    setFormAgence({
      id: ag.id, code: ag.code || '',
      nom: ag.nom || '', ville: ag.ville || '', adresse: ag.adresse || '',
      code_postal: ag.code_postal || '', telephone: ag.telephone || '',
      email: ag.email || '', responsable_nom: ag.responsable_nom || '',
    })
    setModal('editer_agence'); setErreur(''); setSucces('')
  }

  const modifierAgence = async () => {
    if (!formAgence.nom.trim() || !formAgence.ville.trim()) return
    setSavingAgence(true); setErreur('')
    try {
      const res = await fetch('/api/update-agence', {
        method: 'PATCH', headers: await authHeaders(),
        body: JSON.stringify({
          agence_id: formAgence.id,
          nom: formAgence.nom, ville: formAgence.ville, adresse: formAgence.adresse,
          code_postal: formAgence.code_postal, telephone: formAgence.telephone,
          email: formAgence.email, responsable_nom: formAgence.responsable_nom,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setErreur(data.error || 'Erreur'); setSavingAgence(false); return }
      setModal(false)
      setSucces('Agence mise à jour ✓')
      await chargerAgence(authProfile.societe_id)
      await refreshAgences()   // met à jour la liste du contexte (navbar + sélecteur agente)
    } catch {
      setErreur('Erreur réseau, veuillez réessayer.')
    }
    setSavingAgence(false)
  }

  const creerAgence = async () => {
    if (!formAgence.nom.trim() || !formAgence.ville.trim()) return
    setSavingAgence(true); setErreur('')
    try {
      const res = await fetch('/api/create-agence', { method: 'POST', headers: await authHeaders(), body: JSON.stringify(formAgence) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setErreur(data.error || 'Erreur'); setSavingAgence(false); return }
      setModal(false)
      setSucces('Agence créée ✓')
      await chargerAgence(authProfile.societe_id)
      await refreshAgences()   // met à jour la liste du contexte (navbar + sélecteur agente)
    } catch {
      setErreur('Erreur réseau, veuillez réessayer.')
    }
    setSavingAgence(false)
  }

  useEffect(() => {
    if (!initialized) return
    if (!authProfile) { router.push('/login'); return }
    if (authProfile.role !== 'admin') { router.push('/dashboard'); return }
    setProfile(authProfile)
    chargerAgence(authProfile.societe_id)
    chargerObjectifs()
    // Les calendriers (connexion + état) se gèrent dans /profil (lot 8b) ; plus de
    // détection Google ici (l'ancienne requête sur expiry_date était de toute façon buggée).
    chargerAgentes().then(() => setLoading(false))
  }, [initialized, authProfile, router])

  /* ── Handlers agentes (inchangés) ── */
  // Défaut sélecteur d'agence : la vue active si une agence est sélectionnée, sinon choix forcé.
  const ouvrirCreer = () => { setForm({ ...emptyForm, agence_id: agenceActive || '' }); setAgenteEditee(null); setModal('creer'); setErreur(''); setSucces('') }
  const ouvrirModifier = (agente) => {
    const objAgente = objectifs.find(o => o.cible === 'agente' && o.agente_id === agente.id)?.montant
    setForm({
      prenom: agente.prenom || '', nom: agente.nom || '', email: agente.email || '', telephone: agente.telephone || '',
      frais_part_agente_defaut: Math.round((agente.frais_part_agente_defaut || 0.5) * 100),
      parts_agente_disponibles: agente.parts_agente_disponibles?.length > 0
        ? agente.parts_agente_disponibles.map(p => Math.round(p * 100)).join(', ')
        : String(Math.round((agente.part_agente_defaut || 0.5) * 100)),
      redevance_debut: agente.redevance_debut || '',
      redevance_mensuelle_ht: agente.redevance_mensuelle_ht != null ? String(agente.redevance_mensuelle_ht) : '',
      objectif: objAgente != null ? String(objAgente) : '',
    })
    setAgenteEditee(agente); setModal('modifier'); setErreur(''); setSucces('')
  }
  const ouvrirSupprimer = (agente) => { setAgenteASupprimer(agente); setModal('supprimer'); setErreur('') }

  // Soft delete : DÉSACTIVE l'agente (ban Auth + actif=false), réversible. La ligne
  // profiles reste → attribution (dossiers, clients, CR, redevances…) préservée.
  const desactiverAgente = async () => {
    if (!agenteASupprimer) return
    setSupprimant(true); setErreur('')
    try {
      const res = await fetch('/api/agente-statut', { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ id: agenteASupprimer.id, actif: false }) })
      const data = await res.json()
      if (!res.ok) { setErreur(data.error || 'Erreur lors de la désactivation') }
      else { setSucces(`${agenteASupprimer.prenom} ${agenteASupprimer.nom} désactivée ✓`); setModal(false); setAgenteASupprimer(null); await chargerAgentes() }
    } catch (err) { setErreur(err.message) }
    setSupprimant(false)
  }

  const reactiverAgente = async (agente) => {
    if (!window.confirm(`Réactiver ${agente.prenom} ${agente.nom} ? Elle pourra de nouveau se connecter.`)) return
    setErreur(''); setSucces('')
    try {
      const res = await fetch('/api/agente-statut', { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ id: agente.id, actif: true }) })
      const data = await res.json()
      if (!res.ok) setErreur(data.error || 'Erreur lors de la réactivation')
      else { setSucces(`${agente.prenom} ${agente.nom} réactivée ✓`); await chargerAgentes() }
    } catch (err) { setErreur(err.message) }
  }

  const creerAgente = async () => {
    setSaving(true); setErreur('')
    try {
      const partsArray = form.parts_agente_disponibles.split(',').map(v => parseInt(v.trim()) / 100).filter(v => !isNaN(v) && v > 0 && v <= 1)
      const partDefaut = partsArray[0] ?? 0.5
      const res = await fetch('/api/create-agente', { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ prenom: form.prenom, nom: form.nom, email: form.email, telephone: form.telephone || null, part_agente_defaut: partDefaut, parts_agente_disponibles: partsArray, frais_part_agente_defaut: form.frais_part_agente_defaut / 100, redevance_debut: form.redevance_debut || null, redevance_mensuelle_ht: form.redevance_mensuelle_ht !== '' ? parseFloat(form.redevance_mensuelle_ht) : null, objectif: form.objectif !== '' ? parseFloat(form.objectif) || 0 : null, agence_id: form.agence_id || null }) })
      const data = await res.json()
      if (!res.ok) { setErreur(data.error || 'Erreur') } else { setSucces(`Invitation envoyée à ${form.email} ✓`); setModal(false); await chargerAgentes(); await chargerObjectifs() }
    } catch (err) { setErreur(err.message) }
    setSaving(false)
  }

  const modifierAgente = async () => {
    setSaving(true); setErreur('')
    try {
      const partsArray = form.parts_agente_disponibles.split(',').map(v => parseInt(v.trim()) / 100).filter(v => !isNaN(v) && v > 0 && v <= 1)
      const partDefaut = partsArray[0] ?? 0.5
      const res = await fetch('/api/create-agente', { method: 'PATCH', headers: await authHeaders(), body: JSON.stringify({ id: agenteEditee.id, prenom: form.prenom, nom: form.nom, telephone: form.telephone || null, part_agente_defaut: partDefaut, parts_agente_disponibles: partsArray, frais_part_agente_defaut: form.frais_part_agente_defaut / 100, redevance_debut: form.redevance_debut || null, redevance_mensuelle_ht: form.redevance_mensuelle_ht !== '' ? parseFloat(form.redevance_mensuelle_ht) : null }) })
      const data = await res.json()
      if (!res.ok) { setErreur(data.error || 'Erreur'); setSaving(false); return }
      // Objectif d'agente : écriture côté client (agence_id = celle de l'agente, dispo en state).
      if (agenteEditee.agence_id) {
        await sauvegarderObjectif('agente', agenteEditee.id, agenteEditee.agence_id, form.objectif !== '' ? form.objectif : 0)
      }
      setSucces('Profil mis à jour ✓'); setModal(false); await chargerAgentes()
    } catch (err) { setErreur(err.message) }
    setSaving(false)
  }

  const uploadKbis = async (agenteId, fichier) => {
    setUploadingKbis(agenteId)
    const ext = fichier.name.split('.').pop()
    const chemin = `kbis/${agenteId}.${ext}`
    const { error: uploadError } = await supabase.storage.from('documents').upload(chemin, fichier, { upsert: true })
    if (uploadError) { setErreur('Erreur upload KBIS : ' + uploadError.message); setUploadingKbis(null); return }
    const res = await fetch('/api/create-agente', { method: 'PATCH', headers: await authHeaders(), body: JSON.stringify({ id: agenteId, kbis_url: chemin }) })
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

  const uploadKbisFranchise = async (fichier) => {
    if (!profile) return
    setUploadingKbisFranchise(true)
    const ext = fichier.name.split('.').pop()
    const chemin = `kbis/${profile.id}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from('documents').upload(chemin, fichier, { upsert: true })
    if (uploadError) { setErreur('Erreur upload KBIS : ' + uploadError.message); setUploadingKbisFranchise(false); return }
    const { error } = await supabase.from('profiles').update({ kbis_url: chemin }).eq('id', profile.id)
    if (error) { setErreur('Erreur sauvegarde KBIS : ' + error.message) }
    else { setSucces('KBIS uploadé ✓'); setProfile(p => ({ ...p, kbis_url: chemin })) }
    setUploadingKbisFranchise(false)
  }

  const voirKbisFranchise = async () => {
    if (!profile?.kbis_url) return
    const { data } = await supabase.storage.from('documents').createSignedUrl(profile.kbis_url, 3600)
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

  if (loading) return <div className="page-loading" />

  const NAV = [
    { k:'profil',       l:'Profil franchisé' },
    { k:'agence',       l:'Agence' },
    { k:'equipe',       l:'Équipe & agents', count: agentes.length },
    { k:'parts',        l:'Parts & royalties' },
    { k:'documents',    l:'RIB & Kbis' },
    { k:'notifs',       l:'Notifications' },
    { k:'integrations', l:'Intégrations' },
    { k:'securite',     l:'Sécurité' },
  ]

  return (
    <div className="page-enter page-pad" style={{display:'flex', flexDirection:'column', gap:18}}>

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

          {/* ── Profil franchisé ── */}
          {section === 'profil' && (
            <div style={{display:'flex', flexDirection:'column', gap:18}}>
              <div>
                <h2 className="page" style={{fontSize:18, marginBottom:4}}>Profil franchisé</h2>
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
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-end'}}>
                <div>
                  <h2 className="page" style={{fontSize:18, marginBottom:4}}>Agence</h2>
                  <p style={{color:'var(--ink-500)', fontSize:13}}>Informations légales · données publiques enregistrées au RCS.</p>
                </div>
                <button className="btn btn-primary" onClick={ouvrirCreerAgence}>+ Ajouter une agence</button>
              </div>

              {/* Société (affichée une seule fois) */}
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, maxWidth:680}}>
                {[
                  { l:'Raison sociale', v:societe?.nom_societe },
                  { l:'SIRET',          v:societe?.siret },
                  { l:'RCS',            v:societe?.rcs },
                ].map(({ l, v }) => (
                  <div key={l} style={{padding:'14px 16px', background:'var(--surface-2)', borderRadius:10, border:'1px solid var(--ink-100)'}}>
                    <div className="eyebrow" style={{fontSize:10, marginBottom:6}}>{l}</div>
                    <div style={{fontSize:13.5, fontWeight:700, color:'var(--ink-900)'}}>{v || '—'}</div>
                  </div>
                ))}
              </div>

              {/* Agence(s) — un sous-bloc par agence */}
              {agences.map((ag) => (
                <div key={ag.id} style={{display:'flex', flexDirection:'column', gap:8}}>
                  <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:8}}>
                    <div className="eyebrow" style={{fontSize:11}}>{ag.nom}</div>
                    <button className="btn btn-ghost" style={{fontSize:12, padding:'4px 10px'}} onClick={() => ouvrirEditerAgence(ag)}>Modifier</button>
                  </div>
                  <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, maxWidth:680}}>
                    {[
                      { l:'Rue',              v:ag.adresse },
                      { l:'Code postal',      v:ag.code_postal },
                      { l:'Ville',            v:ag.ville },
                      { l:'Téléphone agence', v:ag.telephone },
                    ].map(({ l, v }) => (
                      <div key={l} style={{padding:'14px 16px', background:'var(--surface-2)', borderRadius:10, border:'1px solid var(--ink-100)'}}>
                        <div className="eyebrow" style={{fontSize:10, marginBottom:6}}>{l}</div>
                        <div style={{fontSize:13.5, fontWeight:700, color:'var(--ink-900)'}}>{v || '—'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

            </div>
          )}

          {/* ── Équipe & agents ── */}
          {section === 'equipe' && (
            <div style={{display:'flex', flexDirection:'column', gap:18}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-end'}}>
                <div>
                  <h2 className="page" style={{fontSize:18, marginBottom:4}}>Équipe & agents</h2>
                  <p style={{color:'var(--ink-500)', fontSize:13}}>Comptes agents, accès et documents. Les parts sont dans "Parts & royalties".</p>
                </div>
                <button className="btn btn-primary" onClick={ouvrirCreer}>+ Nouvel agent</button>
              </div>

              {/* Objectif de CA de l'agence (annuel) */}
              {agences.length > 1 ? (
                <div className="card" style={{padding:'16px 18px', display:'flex', flexDirection:'column', gap:14}}>
                  <div>
                    <div style={{fontSize:14, fontWeight:700, color:'var(--ink-900)'}}>Objectif de CA par agence — {new Date().getFullYear()}</div>
                    <div style={{fontSize:12, color:'var(--ink-500)', marginTop:2}}>Montant annuel (encaissements bruts), par agence.</div>
                  </div>
                  {agences.map(ag => (
                    <div key={ag.id} style={{display:'flex', alignItems:'center', gap:10, flexWrap:'wrap'}}>
                      <div style={{minWidth:160, fontSize:13, fontWeight:600, color:'var(--ink-800)'}}>{ag.nom}</div>
                      <input className="input" type="number" min="0" value={objAbVals[ag.id] ?? ''}
                        onChange={e => setObjAbVals(v => ({ ...v, [ag.id]: e.target.value }))}
                        placeholder="Objectif annuel €" style={{maxWidth:200}}/>
                      <button className="btn btn-primary" onClick={() => enregistrerObjAb(ag.id)} disabled={objAbSaving === ag.id}>
                        {objAbSaving === ag.id ? 'Enregistrement…' : 'Enregistrer'}
                      </button>
                      {objAbMsg[ag.id] && <span style={{fontSize:12.5, color: objAbMsg[ag.id].startsWith('Erreur') ? '#b91c1c' : '#15803d'}}>{objAbMsg[ag.id]}</span>}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="card" style={{padding:'16px 18px', display:'flex', flexDirection:'column', gap:10}}>
                  <div>
                    <div style={{fontSize:14, fontWeight:700, color:'var(--ink-900)'}}>Objectif de CA — agence {new Date().getFullYear()}</div>
                    <div style={{fontSize:12, color:'var(--ink-500)', marginTop:2}}>Montant annuel (encaissements bruts). {agences[0]?.nom || ''}</div>
                  </div>
                  <div style={{display:'flex', alignItems:'center', gap:10, flexWrap:'wrap'}}>
                    <input className="input" type="number" min="0" value={objAgenceVal}
                      onChange={e => setObjAgenceVal(e.target.value)} placeholder="Objectif annuel €" style={{maxWidth:220}}/>
                    <button className="btn btn-primary" onClick={enregistrerObjAgence} disabled={savingObjAgence || !agences[0]?.id}>
                      {savingObjAgence ? 'Enregistrement…' : 'Enregistrer'}
                    </button>
                    {objAgenceMsg && <span style={{fontSize:12.5, color: objAgenceMsg.startsWith('Erreur') ? '#b91c1c' : '#15803d'}}>{objAgenceMsg}</span>}
                  </div>
                </div>
              )}

              {agentes.length === 0 ? (
                <p style={{textAlign:'center', color:'var(--ink-400)', fontSize:13, paddingTop:24}}>Aucun agent</p>
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
                        <span style={{padding:'2px 10px', borderRadius:99, fontSize:11.5, fontWeight:700, flexShrink:0,
                          background: agente.actif === false ? 'var(--ink-100)' : 'rgba(22,163,74,0.1)',
                          color: agente.actif === false ? 'var(--ink-500)' : '#15803d'}}>
                          {agente.actif === false ? 'Désactivée' : 'Actif'}
                        </span>
                        <div style={{display:'flex', gap:6, flexShrink:0}}>
                          <button className="btn btn-ghost" style={{fontSize:12, padding:'5px 10px'}} onClick={() => ouvrirModifier(agente)}>Modifier</button>
                          {agente.actif === false
                            ? <button className="btn btn-ghost" style={{fontSize:12, padding:'5px 10px', color:'#15803d', borderColor:'rgba(22,163,74,0.3)'}} onClick={() => reactiverAgente(agente)}>Réactiver</button>
                            : <button className="btn btn-ghost" style={{fontSize:12, padding:'5px 10px', color:'var(--bad)', borderColor:'rgba(239,68,68,0.3)'}} onClick={() => ouvrirSupprimer(agente)}>Désactiver</button>}
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
                <p style={{color:'var(--ink-500)', fontSize:13}}>Répartitions commission, frais et redevances par agent. Cliquez "Modifier" pour éditer.</p>
              </div>
              {agentes.length === 0 ? (
                <p style={{textAlign:'center', color:'var(--ink-400)', fontSize:13, paddingTop:24}}>Aucun agent</p>
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
                          <div style={{fontSize:11, color:'var(--ink-400)', marginTop:3}}>agent / Société</div>
                        </div>
                        <div style={{background:'var(--surface-2)', borderRadius:8, padding:'10px 14px'}}>
                          <div className="eyebrow" style={{fontSize:10, marginBottom:6}}>Répartition frais</div>
                          <div style={{fontWeight:700, color:'var(--ink-900)', fontSize:13}}>{fmtPct(agente.frais_part_agente_defaut)}</div>
                          <div style={{fontSize:11, color:'var(--ink-400)', marginTop:3}}>agent / Société</div>
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
                      <div style={{fontSize:13.5, fontWeight:700, color:'var(--ink-900)'}}>RIB franchisé</div>
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
                <div style={{padding:'14px 18px', border:'1px solid', borderColor: profile?.kbis_url ? 'var(--ink-200)' : 'rgba(245,158,11,0.3)', borderRadius:12, display:'flex', justifyContent:'space-between', alignItems:'center', gap:14}}>
                  <div style={{display:'flex', alignItems:'center', gap:12}}>
                    <div style={{width:36, height:36, borderRadius:8, background: profile?.kbis_url ? 'var(--brand-50)' : 'rgba(245,158,11,0.12)', color: profile?.kbis_url ? 'var(--brand-800)' : '#a16207', display:'grid', placeItems:'center', fontSize:18}}>📄</div>
                    <div>
                      <div style={{fontSize:13.5, fontWeight:700, color:'var(--ink-900)'}}>KBIS franchisé</div>
                      <div style={{fontSize:11.5, color:'var(--ink-500)', marginTop:2}}>{profile?.kbis_url ? 'Fichier uploadé' : 'Aucun fichier'}</div>
                    </div>
                  </div>
                  {profile?.kbis_url ? (
                    <div style={{display:'flex', gap:8}}>
                      <button className="btn btn-ghost" style={{fontSize:12}} onClick={voirKbisFranchise}>Voir</button>
                      <label className="btn btn-ghost" style={{fontSize:12, cursor:'pointer', opacity: uploadingKbisFranchise ? 0.5 : 1}}>
                        {uploadingKbisFranchise ? 'Upload…' : 'Remplacer'}
                        <input type="file" accept=".pdf,image/*" style={{display:'none'}} disabled={uploadingKbisFranchise} onChange={e => e.target.files[0] && uploadKbisFranchise(e.target.files[0])} />
                      </label>
                    </div>
                  ) : (
                    <label className="btn btn-primary" style={{fontSize:12, cursor:'pointer', opacity: uploadingKbisFranchise ? 0.5 : 1}}>
                      {uploadingKbisFranchise ? 'Upload…' : '+ Uploader'}
                      <input type="file" accept=".pdf,image/*" style={{display:'none'}} disabled={uploadingKbisFranchise} onChange={e => e.target.files[0] && uploadKbisFranchise(e.target.files[0])} />
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
              <MesCalendriers profile={profile} onError={setErreur} onSucces={setSucces} onDefautChange={fetchProfile} />
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

      {/* ── Modal ajouter une agence ── */}
      {modal === 'creer_agence' && (
        <div style={{position:'fixed', inset:0, background:'rgba(15,39,68,0.55)', zIndex:100, display:'grid', placeItems:'center', padding:20}}>
          <div className="card" style={{padding:0, maxWidth:520, width:'100%', maxHeight:'90vh', overflow:'auto'}}>
            <div style={{padding:'18px 22px', borderBottom:'1px solid var(--ink-200)'}}>
              <h2 className="page" style={{fontSize:16}}>Ajouter une agence</h2>
              <div className="eyebrow" style={{marginTop:4}}>Le code agence est généré automatiquement</div>
            </div>
            <div style={{padding:22, display:'flex', flexDirection:'column', gap:14}}>
              {erreur && <div style={{background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:8, padding:'8px 12px', fontSize:13, color:'#b91c1c'}}>{erreur}</div>}
              <div><label style={LS}>Nom de l&apos;agence *</label><input className="input" value={formAgence.nom} onChange={e => setFormAgence(f => ({ ...f, nom: e.target.value }))} placeholder="illiCO travaux [ville]"/></div>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
                <div><label style={LS}>Ville *</label><input className="input" value={formAgence.ville} onChange={e => setFormAgence(f => ({ ...f, ville: e.target.value }))} placeholder="Votre ville"/></div>
                <div><label style={LS}>Code postal</label><input className="input" value={formAgence.code_postal} onChange={e => setFormAgence(f => ({ ...f, code_postal: e.target.value }))}/></div>
              </div>
              <div><label style={LS}>Adresse</label><input className="input" value={formAgence.adresse} onChange={e => setFormAgence(f => ({ ...f, adresse: e.target.value }))}/></div>
              <div><label style={LS}>Téléphone</label><input className="input" type="tel" value={formAgence.telephone} onChange={e => setFormAgence(f => ({ ...f, telephone: e.target.value }))} placeholder="04 00 00 00 00"/></div>
              <div><label style={LS}>Email</label><input className="input" type="email" value={formAgence.email} onChange={e => setFormAgence(f => ({ ...f, email: e.target.value }))} placeholder="agence@illico-travaux.com"/></div>
              <div><label style={LS}>Nom du responsable</label><input className="input" value={formAgence.responsable_nom} onChange={e => setFormAgence(f => ({ ...f, responsable_nom: e.target.value }))}/></div>
            </div>
            <div style={{padding:'14px 22px', borderTop:'1px solid var(--ink-200)', display:'flex', gap:8, justifyContent:'flex-end'}}>
              <button className="btn btn-ghost" onClick={() => { setModal(false); setErreur('') }}>Annuler</button>
              <button className="btn btn-primary" onClick={creerAgence}
                disabled={savingAgence || !formAgence.nom.trim() || !formAgence.ville.trim()}
                style={{opacity: (savingAgence || !formAgence.nom.trim() || !formAgence.ville.trim()) ? 0.5 : 1}}>
                {savingAgence ? 'Création…' : 'Créer l\'agence'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal modifier une agence ── */}
      {modal === 'editer_agence' && (
        <div style={{position:'fixed', inset:0, background:'rgba(15,39,68,0.55)', zIndex:100, display:'grid', placeItems:'center', padding:20}}>
          <div className="card" style={{padding:0, maxWidth:520, width:'100%', maxHeight:'90vh', overflow:'auto'}}>
            <div style={{padding:'18px 22px', borderBottom:'1px solid var(--ink-200)'}}>
              <h2 className="page" style={{fontSize:16}}>Modifier l&apos;agence</h2>
              <div className="eyebrow" style={{marginTop:4}}>Code {formAgence.code || '—'} · non modifiable</div>
            </div>
            <div style={{padding:22, display:'flex', flexDirection:'column', gap:14}}>
              {erreur && <div style={{background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:8, padding:'8px 12px', fontSize:13, color:'#b91c1c'}}>{erreur}</div>}
              <div><label style={LS}>Nom de l&apos;agence *</label><input className="input" value={formAgence.nom} onChange={e => setFormAgence(f => ({ ...f, nom: e.target.value }))} placeholder="illiCO travaux [ville]"/></div>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
                <div><label style={LS}>Ville *</label><input className="input" value={formAgence.ville} onChange={e => setFormAgence(f => ({ ...f, ville: e.target.value }))} placeholder="Votre ville"/></div>
                <div><label style={LS}>Code postal</label><input className="input" value={formAgence.code_postal} onChange={e => setFormAgence(f => ({ ...f, code_postal: e.target.value }))}/></div>
              </div>
              <div><label style={LS}>Adresse</label><input className="input" value={formAgence.adresse} onChange={e => setFormAgence(f => ({ ...f, adresse: e.target.value }))}/></div>
              <div><label style={LS}>Téléphone</label><input className="input" type="tel" value={formAgence.telephone} onChange={e => setFormAgence(f => ({ ...f, telephone: e.target.value }))} placeholder="04 00 00 00 00"/></div>
              <div><label style={LS}>Email</label><input className="input" type="email" value={formAgence.email} onChange={e => setFormAgence(f => ({ ...f, email: e.target.value }))} placeholder="agence@illico-travaux.com"/></div>
              <div><label style={LS}>Nom du responsable</label><input className="input" value={formAgence.responsable_nom} onChange={e => setFormAgence(f => ({ ...f, responsable_nom: e.target.value }))}/></div>
            </div>
            <div style={{padding:'14px 22px', borderTop:'1px solid var(--ink-200)', display:'flex', gap:8, justifyContent:'flex-end'}}>
              <button className="btn btn-ghost" onClick={() => { setModal(false); setErreur('') }}>Annuler</button>
              <button className="btn btn-primary" onClick={modifierAgence}
                disabled={savingAgence || !formAgence.nom.trim() || !formAgence.ville.trim()}
                style={{opacity: (savingAgence || !formAgence.nom.trim() || !formAgence.ville.trim()) ? 0.5 : 1}}>
                {savingAgence ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal créer / modifier ── */}
      {(modal === 'creer' || modal === 'modifier') && (
        <div style={{position:'fixed', inset:0, background:'rgba(15,39,68,0.55)', zIndex:100, display:'grid', placeItems:'center', padding:20}}>
          <div className="card" style={{padding:0, maxWidth:520, width:'100%', maxHeight:'90vh', overflow:'auto'}}>
            <div style={{padding:'18px 22px', borderBottom:'1px solid var(--ink-200)'}}>
              <h2 className="page" style={{fontSize:16}}>{modal === 'creer' ? 'Nouvel agent' : `Modifier — ${agenteEditee?.prenom} ${agenteEditee?.nom}`}</h2>
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
              {modal === 'creer' && agencesCtx.length >= 2 && (
                <div>
                  <label style={LS}>Agence de rattachement *</label>
                  <select className="input" value={form.agence_id} onChange={e => setForm(f => ({ ...f, agence_id: e.target.value }))}>
                    <option value="">— Choisir une agence —</option>
                    {agencesCtx.map(ag => <option key={ag.id} value={ag.id}>{ag.nom}</option>)}
                  </select>
                </div>
              )}
              <div><label style={LS}>Téléphone</label><input className="input" type="tel" value={form.telephone} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))} placeholder="06 00 00 00 00"/></div>
              <div>
                <label style={LS}>Début des redevances</label>
                <input className="input" type="date" value={form.redevance_debut} onChange={e => setForm(f => ({ ...f, redevance_debut: e.target.value }))}/>
                <div style={{fontSize:11.5, color:'var(--ink-400)', marginTop:4}}>Date à partir de laquelle la redevance mensuelle est due.</div>
              </div>
              <div>
                <label style={LS}>Redevance mensuelle (HT)</label>
                <input className="input" type="number" min="0" step="0.01" value={form.redevance_mensuelle_ht} onChange={e => setForm(f => ({ ...f, redevance_mensuelle_ht: e.target.value }))} placeholder="€ / mois"/>
                <div style={{fontSize:11.5, color:'var(--ink-400)', marginTop:4}}>Montant fixe dû chaque mois (à partir de la date ci-dessus). Vide = à paramétrer.</div>
              </div>
              <div>
                <label style={LS}>Répartitions commission disponibles — agent %</label>
                <input className="input" value={form.parts_agente_disponibles} onChange={e => setForm(f => ({ ...f, parts_agente_disponibles: e.target.value }))} placeholder="ex: 60 ou 50, 60"/>
                <div style={{fontSize:11.5, color:'var(--ink-400)', marginTop:4}}>Une valeur = pas de choix. Plusieurs séparées par virgule = l'agent choisit.</div>
              </div>
              <div>
                <label style={LS}>Répartition frais de consultation — agent / Société</label>
                <div style={{display:'flex', alignItems:'center', gap:10}}>
                  <div style={{flex:1}}>
                    <input className="input" type="number" min="0" max="100" value={form.frais_part_agente_defaut} onChange={e => setForm(f => ({ ...f, frais_part_agente_defaut: parseInt(e.target.value) || 0 }))} style={{textAlign:'center'}}/>
                    <div style={{fontSize:11, textAlign:'center', color:'var(--ink-400)', marginTop:3}}>Agente %</div>
                  </div>
                  <span style={{color:'var(--ink-400)', fontWeight:600}}>/</span>
                  <div style={{flex:1}}>
                    <input className="input" type="number" value={100 - form.frais_part_agente_defaut} disabled style={{textAlign:'center', opacity:0.5}}/>
                    <div style={{fontSize:11, textAlign:'center', color:'var(--ink-400)', marginTop:3}}>Société %</div>
                  </div>
                </div>
              </div>
              <div>
                <label style={LS}>Objectif de CA — agent {new Date().getFullYear()}</label>
                <input className="input" type="number" min="0" value={form.objectif} onChange={e => setForm(f => ({ ...f, objectif: e.target.value }))} placeholder="Objectif annuel €"/>
                <div style={{fontSize:11.5, color:'var(--ink-400)', marginTop:4}}>Montant annuel. Modifiable à tout moment.</div>
              </div>
            </div>
            <div style={{padding:'14px 22px', borderTop:'1px solid var(--ink-200)', display:'flex', gap:8, justifyContent:'flex-end'}}>
              <button className="btn btn-ghost" onClick={() => { setModal(false); setErreur(''); setSucces('') }}>Annuler</button>
              <button className="btn btn-primary" onClick={modal === 'creer' ? creerAgente : modifierAgente}
                disabled={saving || !form.prenom || !form.nom || (modal === 'creer' && !form.email) || (modal === 'creer' && agencesCtx.length >= 2 && !form.agence_id)}
                style={{opacity: (saving || !form.prenom || !form.nom || (modal === 'creer' && !form.email) || (modal === 'creer' && agencesCtx.length >= 2 && !form.agence_id)) ? 0.5 : 1}}>
                {saving ? 'Enregistrement…' : modal === 'creer' ? "Envoyer l'invitation" : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal suppression ── */}
      {modal === 'supprimer' && agenteASupprimer && (
        <div style={{position:'fixed', inset:0, background:'rgba(15,39,68,0.55)', zIndex:100, display:'grid', placeItems:'center', padding:20}}>
          <div className="card" style={{padding:24, maxWidth:440, width:'100%'}}>
            <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:16}}>
              <div style={{width:40, height:40, borderRadius:99, background:'rgba(239,68,68,0.1)', color:'#DC2626', display:'grid', placeItems:'center', fontSize:18, flexShrink:0}}>⚠</div>
              <div>
                <div style={{fontWeight:700, color:'var(--ink-900)'}}>Désactiver cet agent ?</div>
                <div style={{fontSize:13, color:'var(--ink-500)', marginTop:2}}>{agenteASupprimer.prenom} {agenteASupprimer.nom}</div>
              </div>
            </div>
            <div style={{background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.3)', borderRadius:10, padding:'12px 16px', fontSize:13, color:'var(--ink-700)', marginBottom:14, lineHeight:1.5}}>
              Elle <strong>ne pourra plus se connecter</strong>. Ses chantiers, clients, dossiers,
              comptes-rendus et documents <strong>restent attribués et conservés</strong>.
              C'est <strong>réversible</strong> : tu pourras la réactiver à tout moment.
            </div>
            {erreur && <div style={{background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:8, padding:'8px 12px', fontSize:13, color:'#b91c1c', marginBottom:12}}>{erreur}</div>}
            <div style={{display:'flex', gap:8}}>
              <button className="btn btn-ghost" style={{flex:1}} onClick={() => { setModal(false); setAgenteASupprimer(null); setErreur('') }}>Annuler</button>
              <button className="btn btn-primary" style={{flex:1, background:'#DC2626', opacity: supprimant ? 0.5 : 1}} onClick={desactiverAgente} disabled={supprimant}>
                {supprimant ? 'Désactivation…' : 'Désactiver'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
