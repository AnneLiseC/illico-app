// app/parametres/page.js
'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '../lib/auth-context'
import { apiFetch } from '../lib/api-auth-client'
import MesCalendriers from '../components/MesCalendriers'
import MonDrive from '../components/MonDrive'
import ModalShell from '../components/ModalShell'
import { heicToJpegFile } from '../lib/images'
import { DOCS_RGPD } from '../lib/legal'

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
  // Mode « compact » (mobile) : la sidebar 240px devient une barre d'onglets scrollable.
  const [compact, setCompact]             = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(max-width: 720px)')
    const on = () => setCompact(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const [savingProfil, setSavingProfil]   = useState(false)
  const [profilSnap, setProfilSnap]       = useState(null)   // profil chargé → détection « non enregistré »
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

  // Demande d'agent (nouveau modèle) : l'admin ne crée plus, il DEMANDE. Un
  // formulaire minimal (identité + agence) ; l'éditrice honore la demande.
  const emptyDemande = { prenom: '', nom: '', email: '', agence_id: '' }
  const [formDemande, setFormDemande] = useState(emptyDemande)
  const [envoiDemande, setEnvoiDemande]   = useState(false)
  const [demandes, setDemandes]           = useState([])

  // Création d'agence (multi-agence) — état séparé de la modale agente.
  const emptyFormAgence = { nom: '', ville: '', adresse: '', code_postal: '', telephone: '', email: '', responsable_nom: '' }
  const [formAgence, setFormAgence] = useState(emptyFormAgence)
  const [savingAgence, setSavingAgence] = useState(false)

  const chargerAgentes = async () => {
    const { data } = await supabase.from('profiles').select('*').eq('role', 'agente').order('prenom')
    setAgentes(data || [])
  }

  // Demandes d'agents de la société (suivi côté admin). Route service_role.
  const chargerDemandes = async () => {
    try {
      const res = await apiFetch('/api/agent-requests')
      const data = await res.json().catch(() => ({}))
      if (res.ok) setDemandes(data.demandes || [])
    } catch { /* silencieux : le suivi des demandes n'est pas bloquant */ }
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
      const res = await apiFetch('/api/update-agence', {
        method: 'PATCH',
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
      const res = await apiFetch('/api/create-agence', { method: 'POST', body: JSON.stringify(formAgence) })
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
    setProfilSnap({ prenom: authProfile.prenom || '', nom: authProfile.nom || '', telephone: authProfile.telephone || '' })
    chargerAgence(authProfile.societe_id)
    chargerObjectifs()
    // Les calendriers (connexion + état) se gèrent dans /profil (lot 8b) ; plus de
    // détection Google ici (l'ancienne requête sur expiry_date était de toute façon buggée).
    chargerAgentes().then(() => setLoading(false))
    chargerDemandes()
  }, [initialized, authProfile, router])

  /* ── Handlers agentes ── */
  // Demande d'agent : formulaire minimal. Défaut agence = la vue active si sélectionnée.
  const ouvrirDemande = () => { setFormDemande({ ...emptyDemande, agence_id: agenceActive || '' }); setModal('demander'); setErreur(''); setSucces('') }
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
      const res = await apiFetch('/api/agente-statut', { method: 'POST', body: JSON.stringify({ id: agenteASupprimer.id, actif: false }) })
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
      const res = await apiFetch('/api/agente-statut', { method: 'POST', body: JSON.stringify({ id: agente.id, actif: true }) })
      const data = await res.json()
      if (!res.ok) setErreur(data.error || 'Erreur lors de la réactivation')
      else { setSucces(`${agente.prenom} ${agente.nom} réactivée ✓`); await chargerAgentes() }
    } catch (err) { setErreur(err.message) }
  }

  // Dépose une DEMANDE d'agent (l'éditrice la validera → compte créé + invité).
  const demanderAgent = async () => {
    setEnvoiDemande(true); setErreur('')
    try {
      const res = await apiFetch('/api/agent-requests', { method: 'POST', body: JSON.stringify({
        prenom: formDemande.prenom.trim(), nom: formDemande.nom.trim(), email: formDemande.email.trim(),
        agence_id: formDemande.agence_id || null,
      }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setErreur(data.error || 'Erreur') }
      else { setSucces(`Demande envoyée pour ${formDemande.prenom} ${formDemande.nom} ✓`); setModal(false); await chargerDemandes() }
    } catch (err) { setErreur(err.message) }
    setEnvoiDemande(false)
  }

  const modifierAgente = async () => {
    setSaving(true); setErreur('')
    try {
      const partsArray = form.parts_agente_disponibles.split(',').map(v => parseInt(v.trim()) / 100).filter(v => !isNaN(v) && v > 0 && v <= 1)
      const partDefaut = partsArray[0] ?? 0.5
      const res = await apiFetch('/api/create-agente', { method: 'PATCH', body: JSON.stringify({ id: agenteEditee.id, prenom: form.prenom, nom: form.nom, telephone: form.telephone || null, part_agente_defaut: partDefaut, parts_agente_disponibles: partsArray, frais_part_agente_defaut: form.frais_part_agente_defaut / 100, redevance_debut: form.redevance_debut || null, redevance_mensuelle_ht: form.redevance_mensuelle_ht !== '' ? parseFloat(form.redevance_mensuelle_ht) : null }) })
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
    const res = await apiFetch('/api/create-agente', { method: 'PATCH', body: JSON.stringify({ id: agenteId, kbis_url: chemin }) })
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
    const f = await heicToJpegFile(fichier)   // photo iPhone (HEIC) du KBIS → JPEG
    const ext = f.name.split('.').pop()
    const chemin = `kbis/${profile.id}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from('documents').upload(chemin, f, { upsert: true })
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
    else {
      setSucces('Profil enregistré ✓')
      setProfilSnap({ prenom: profile.prenom || '', nom: profile.nom || '', telephone: profile.telephone || '' })
    }
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
    { k:'legal',        l:'Mentions légales' },
  ]

  // « Non enregistré » du profil franchisé (le formulaire libre le plus édité) : compare
  // les champs au snapshot chargé. Sert à avertir avant de changer de section.
  const profilDirty = !!profilSnap && !!profile && (
    String(profile.prenom || '') !== profilSnap.prenom ||
    String(profile.nom || '') !== profilSnap.nom ||
    String(profile.telephone || '') !== profilSnap.telephone
  )
  const changerSection = (k) => {
    if (k === section) return
    if (profilDirty && !window.confirm('Profil : des modifications ne sont pas enregistrées. Changer de section quand même ?')) return
    setSection(k)
  }

  return (
    <div className="page-enter page-pad" style={{display:'flex', flexDirection:'column', gap:18}}>

      <div>
        <div className="eyebrow" style={{marginBottom:4}}>Système</div>
        <h1 className="page">Paramètres</h1>
        <div style={{color:'var(--ink-500)', fontSize:13, marginTop:6}}>Configuration de l&apos;agence et de l&apos;équipe</div>
      </div>

      {succes && !modal && <div style={{background:'rgba(22,163,74,0.07)', border:'1px solid rgba(22,163,74,0.25)', borderRadius:10, padding:'10px 16px', fontSize:13, color:'#15803d'}}>{succes}</div>}
      {erreur && !modal && <div style={{background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:10, padding:'10px 16px', fontSize:13, color:'#b91c1c'}}>{erreur}</div>}

      <div className="card" style={{padding:0, overflow:'hidden', display:'grid', gridTemplateColumns: compact ? '1fr' : '240px 1fr', minHeight: compact ? 0 : 560}}>

        {/* Nav : sidebar (desktop) ↔ barre d'onglets scrollable (mobile). */}
        <nav style={compact
          ? {display:'flex', gap:4, overflowX:'auto', padding:'6px 8px', borderBottom:'1px solid var(--ink-200)'}
          : {padding:'10px 0', borderRight:'1px solid var(--ink-200)'}}>
          {NAV.map(({ k, l, count }) => {
            const active = section === k
            return (
              <button key={k} onClick={() => changerSection(k)} className={active ? '' : 'row-hover'} style={{
                textAlign:'left', display:'flex', alignItems:'center', gap:8,
                border:0, cursor:'pointer', fontWeight: active ? 700 : 500, fontSize:13.5,
                color: active ? 'var(--brand-800)' : 'var(--ink-700)',
                background: active ? 'var(--brand-50)' : 'transparent',
                ...(compact
                  ? { padding:'8px 12px', whiteSpace:'nowrap', flex:'0 0 auto', borderRadius:8,
                      borderBottom:`3px solid ${active ? 'var(--brand-500)' : 'transparent'}` }
                  : { width:'100%', padding:'10px 16px',
                      borderLeft:`3px solid ${active ? 'var(--brand-500)' : 'transparent'}` }),
              }}>
                <span style={compact ? undefined : {flex:1}}>{l}</span>
                {count != null && <span style={{background:'var(--ink-200)', color:'var(--ink-700)', fontSize:11, fontWeight:700, padding:'1px 6px', borderRadius:99}}>{count}</span>}
              </button>
            )
          })}
        </nav>

        {/* Contenu */}
        <div style={{padding: compact ? 18 : 28, overflowY:'auto'}}>

          {/* ── Profil franchisé ── */}
          {section === 'profil' && (
            <div style={{display:'flex', flexDirection:'column', gap:18}}>
              <div>
                <h2 className="page" style={{fontSize:18, marginBottom:4}}>Profil franchisé</h2>
                <p style={{color:'var(--ink-500)', fontSize:13}}>Informations affichées sur les documents générés par l&apos;application.</p>
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
              <div style={{display:'flex', alignItems:'center', gap:12, flexWrap:'wrap'}}>
                <button className="btn btn-primary" onClick={sauvegarderProfil} disabled={savingProfil || !profilDirty}>
                  {savingProfil ? 'Enregistrement…' : 'Enregistrer'}
                </button>
                {profilDirty && !savingProfil && (
                  <span style={{fontSize:12.5, fontWeight:600, color:'#a16207', display:'inline-flex', alignItems:'center', gap:6}}>
                    <span style={{width:7, height:7, borderRadius:'50%', background:'#d97706', display:'inline-block'}} />
                    Modifications non enregistrées
                  </span>
                )}
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
                    <div className="eyebrow" style={{fontSize:11, marginBottom:6}}>{l}</div>
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
                        <div className="eyebrow" style={{fontSize:11, marginBottom:6}}>{l}</div>
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
                  <p style={{color:'var(--ink-500)', fontSize:13}}>La création d&apos;un compte est validée par Batilis. Demande un agent : il sera créé et invité après validation.</p>
                </div>
                <button className="btn btn-primary" onClick={ouvrirDemande}>Demander un agent</button>
              </div>

              {/* Demandes d'agents en attente / récentes */}
              {demandes.some(d => d.statut === 'en_attente') && (
                <div className="card" style={{padding:'14px 18px', display:'flex', flexDirection:'column', gap:10, borderColor:'rgba(245,158,11,0.3)'}}>
                  <div style={{fontSize:13.5, fontWeight:700, color:'var(--ink-900)'}}>Demandes en attente de validation</div>
                  {demandes.filter(d => d.statut === 'en_attente').map(d => (
                    <div key={d.id} style={{display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', fontSize:13}}>
                      <span style={{fontWeight:600, color:'var(--ink-800)'}}>{d.prenom} {d.nom}</span>
                      <span style={{color:'var(--ink-500)'}}>{d.email}</span>
                      <span style={{marginLeft:'auto', padding:'2px 10px', borderRadius:99, fontSize:11.5, fontWeight:700, background:'rgba(245,158,11,0.12)', color:'#a16207'}}>En attente</span>
                    </div>
                  ))}
                  <div style={{fontSize:11.5, color:'var(--ink-500)'}}>Une fois validée par Batilis, l&apos;agent apparaîtra dans la liste ci-dessous (redevances et parts à régler ensuite via « Modifier »).</div>
                </div>
              )}

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
                <p style={{textAlign:'center', color:'var(--ink-500)', fontSize:13, paddingTop:24}}>Aucun agent</p>
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
                          {agente.telephone && <div style={{fontSize:12, color:'var(--ink-500)', marginTop:1}}>{agente.telephone}</div>}
                        </div>
                        {/* KBIS */}
                        <div style={{display:'flex', alignItems:'center', gap:8}}>
                          <span className="eyebrow" style={{fontSize:11}}>KBIS</span>
                          {agente.kbis_url ? (
                            <>
                              <button className="btn btn-ghost" style={{fontSize:11.5, padding:'3px 9px'}} onClick={() => voirKbis(agente.kbis_url)}>Voir</button>
                              <label style={{fontSize:11.5, cursor:'pointer', color:'var(--ink-500)'}}>
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
                <p style={{color:'var(--ink-500)', fontSize:13}}>Répartitions commission, frais et redevances par agent. Cliquez &quot;Modifier&quot; pour éditer.</p>
              </div>
              {agentes.length === 0 ? (
                <p style={{textAlign:'center', color:'var(--ink-500)', fontSize:13, paddingTop:24}}>Aucun agent</p>
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
                          <div className="eyebrow" style={{fontSize:11, marginBottom:6}}>Répartitions commission</div>
                          <div style={{fontWeight:700, color:'var(--ink-900)', fontSize:13}}>
                            {agente.parts_agente_disponibles?.length > 0
                              ? agente.parts_agente_disponibles.map(p => `${Math.round(p * 100)} / ${Math.round((1 - p) * 100)}`).join(' · ')
                              : fmtPct(agente.part_agente_defaut)}
                          </div>
                          <div style={{fontSize:11, color:'var(--ink-500)', marginTop:3}}>agent / Société</div>
                        </div>
                        <div style={{background:'var(--surface-2)', borderRadius:8, padding:'10px 14px'}}>
                          <div className="eyebrow" style={{fontSize:11, marginBottom:6}}>Répartition frais</div>
                          <div style={{fontWeight:700, color:'var(--ink-900)', fontSize:13}}>{fmtPct(agente.frais_part_agente_defaut)}</div>
                          <div style={{fontSize:11, color:'var(--ink-500)', marginTop:3}}>agent / Société</div>
                        </div>
                        <div style={{background:'var(--surface-2)', borderRadius:8, padding:'10px 14px'}}>
                          <div className="eyebrow" style={{fontSize:11, marginBottom:6}}>Redevances depuis</div>
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
              {/* 🚧 EN COURS DE DÉVELOPPEMENT — les notifications sont à l'arrêt pour le
                  moment. Les préférences ci-dessous sont masquées le temps du dev pour ne
                  pas laisser croire qu'elles sont actives. Pour réactiver : décommenter le
                  bloc <div> des toggles ci-dessous et retirer le bandeau. */}
              <div style={{
                display:'flex', alignItems:'center', gap:12, maxWidth:520,
                padding:'16px 18px', borderRadius:12,
                background:'var(--surface-2)', border:'1px dashed var(--ink-300)',
              }}>
                <span style={{fontSize:22}}>🚧</span>
                <div>
                  <div style={{fontWeight:700, fontSize:13.5, color:'var(--ink-900)'}}>En cours de développement</div>
                  <div style={{fontSize:12.5, color:'var(--ink-500)', marginTop:2}}>
                    Les notifications sont temporairement à l&apos;arrêt. Le réglage des préférences reviendra prochainement.
                  </div>
                </div>
              </div>
              {/*
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
              */}
            </div>
          )}

          {/* ── Intégrations ── */}
          {section === 'integrations' && (
            <div style={{display:'flex', flexDirection:'column', gap:18}}>
              <div>
                <h2 className="page" style={{fontSize:18, marginBottom:4}}>Intégrations</h2>
                <p style={{color:'var(--ink-500)', fontSize:13}}>Services connectés à l&apos;application.</p>
              </div>
              <MesCalendriers profile={profile} onError={setErreur} onSucces={setSucces} onDefautChange={fetchProfile} />
              <MonDrive profile={profile} onError={setErreur} onSucces={setSucces} />
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

          {/* ── Mentions légales & RGPD ── */}
          {section === 'legal' && (
            <div style={{display:'flex', flexDirection:'column', gap:18, maxWidth:560}}>
              <div>
                <h2 className="page" style={{fontSize:18, marginBottom:4}}>Mentions légales &amp; RGPD</h2>
                <p style={{color:'var(--ink-500)', fontSize:13}}>Documents publics et de conformité de l&apos;application.</p>
              </div>
              <div style={{display:'flex', flexDirection:'column', gap:10}}>
                <a href="/confidentialite" target="_blank" rel="noreferrer" className="btn btn-ghost" style={{justifyContent:'space-between'}}>
                  <span>Politique de confidentialité</span><span style={{fontSize:12, color:'var(--ink-500)'}}>Page publique ↗</span>
                </a>
                <a href="/cgu" target="_blank" rel="noreferrer" className="btn btn-ghost" style={{justifyContent:'space-between'}}>
                  <span>Conditions d&apos;utilisation (CGU)</span><span style={{fontSize:12, color:'var(--ink-500)'}}>Page publique ↗</span>
                </a>
              </div>
              <div>
                <div className="eyebrow" style={{marginBottom:8}}>Documents de conformité</div>
                <div style={{display:'flex', flexDirection:'column', gap:10}}>
                  {DOCS_RGPD.map(d => (
                    <a key={d.fichier} href={d.fichier} target="_blank" rel="noreferrer"
                      style={{display:'block', padding:'12px 14px', border:'1px solid var(--ink-200)', borderRadius:10, textDecoration:'none'}}>
                      <div style={{fontWeight:700, fontSize:13, color:'var(--ink-900)'}}>{d.titre} <span style={{fontWeight:500, color:'var(--ink-900)'}}>↓ PDF</span></div>
                      <div style={{fontSize:12, color:'var(--ink-500)', marginTop:2}}>{d.desc}</div>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Modal ajouter une agence ── */}
      {modal === 'creer_agence' && (
        <ModalShell
          title="Ajouter une agence"
          subtitle="Le code agence est généré automatiquement"
          onClose={() => { setModal(false); setErreur('') }}
          width={520}
          footer={<>
            <button className="btn btn-ghost" onClick={() => { setModal(false); setErreur('') }}>Annuler</button>
            <button className="btn btn-primary" onClick={creerAgence}
              disabled={savingAgence || !formAgence.nom.trim() || !formAgence.ville.trim()}
              style={{opacity: (savingAgence || !formAgence.nom.trim() || !formAgence.ville.trim()) ? 0.5 : 1}}>
              {savingAgence ? 'Création…' : 'Créer l\'agence'}
            </button>
          </>}
        >
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
        </ModalShell>
      )}

      {/* ── Modal modifier une agence ── */}
      {modal === 'editer_agence' && (
        <ModalShell
          title="Modifier l&apos;agence"
          subtitle={`Code ${formAgence.code || '—'} · non modifiable`}
          onClose={() => { setModal(false); setErreur('') }}
          width={520}
          footer={<>
            <button className="btn btn-ghost" onClick={() => { setModal(false); setErreur('') }}>Annuler</button>
            <button className="btn btn-primary" onClick={modifierAgence}
              disabled={savingAgence || !formAgence.nom.trim() || !formAgence.ville.trim()}
              style={{opacity: (savingAgence || !formAgence.nom.trim() || !formAgence.ville.trim()) ? 0.5 : 1}}>
              {savingAgence ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </>}
        >
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
        </ModalShell>
      )}

      {/* ── Modal demander un agent ── */}
      {modal === 'demander' && (
        <ModalShell
          title="Demander un agent"
          subtitle="Batilis créera et invitera le compte après validation"
          onClose={() => { setModal(false); setErreur(''); setSucces('') }}
          width={480}
          footer={<>
            <button className="btn btn-ghost" onClick={() => { setModal(false); setErreur(''); setSucces('') }}>Annuler</button>
            <button className="btn btn-primary" onClick={demanderAgent}
              disabled={envoiDemande || !formDemande.prenom.trim() || !formDemande.nom.trim() || !formDemande.email.trim() || (agencesCtx.length >= 2 && !formDemande.agence_id)}
              style={{opacity: (envoiDemande || !formDemande.prenom.trim() || !formDemande.nom.trim() || !formDemande.email.trim() || (agencesCtx.length >= 2 && !formDemande.agence_id)) ? 0.5 : 1}}>
              {envoiDemande ? 'Envoi…' : 'Envoyer la demande'}
            </button>
          </>}
        >
          <div style={{padding:22, display:'flex', flexDirection:'column', gap:14}}>
            {erreur && <div style={{background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:8, padding:'8px 12px', fontSize:13, color:'#b91c1c'}}>{erreur}</div>}
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
              <div><label style={LS}>Prénom *</label><input className="input" value={formDemande.prenom} onChange={e => setFormDemande(f => ({ ...f, prenom: e.target.value }))} placeholder="Prénom"/></div>
              <div><label style={LS}>Nom *</label><input className="input" value={formDemande.nom} onChange={e => setFormDemande(f => ({ ...f, nom: e.target.value }))} placeholder="Nom"/></div>
            </div>
            <div>
              <label style={LS}>Email *</label>
              <input className="input" type="email" value={formDemande.email} onChange={e => setFormDemande(f => ({ ...f, email: e.target.value }))} placeholder="prenom@illico-travaux.com"/>
              <div style={{fontSize:11.5, color:'var(--ink-500)', marginTop:4}}>Adresse @illico-travaux.com. L&apos;invitation part une fois la demande validée.</div>
            </div>
            {agencesCtx.length >= 2 && (
              <div>
                <label style={LS}>Agence de rattachement *</label>
                <select className="input" value={formDemande.agence_id} onChange={e => setFormDemande(f => ({ ...f, agence_id: e.target.value }))}>
                  <option value="">— Choisir une agence —</option>
                  {agencesCtx.map(ag => <option key={ag.id} value={ag.id}>{ag.nom}</option>)}
                </select>
              </div>
            )}
            <div style={{fontSize:12, color:'var(--ink-500)', background:'var(--surface-2)', borderRadius:8, padding:'10px 12px', lineHeight:1.5}}>
              Les redevances, parts et objectif se règlent <strong>après création</strong>, via « Modifier » sur la fiche de l&apos;agent.
            </div>
          </div>
        </ModalShell>
      )}

      {/* ── Modal modifier ── */}
      {modal === 'modifier' && (
        <ModalShell
          title={`Modifier — ${agenteEditee?.prenom} ${agenteEditee?.nom}`}
          subtitle="Profil et parts"
          onClose={() => { setModal(false); setErreur(''); setSucces('') }}
          width={520}
          footer={<>
            <button className="btn btn-ghost" onClick={() => { setModal(false); setErreur(''); setSucces('') }}>Annuler</button>
            <button className="btn btn-primary" onClick={modifierAgente}
              disabled={saving || !form.prenom || !form.nom}
              style={{opacity: (saving || !form.prenom || !form.nom) ? 0.5 : 1}}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </>}
        >
            <div style={{padding:22, display:'flex', flexDirection:'column', gap:14}}>
              {erreur && <div style={{background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:8, padding:'8px 12px', fontSize:13, color:'#b91c1c'}}>{erreur}</div>}
              {succes && <div style={{background:'rgba(22,163,74,0.07)', border:'1px solid rgba(22,163,74,0.25)', borderRadius:8, padding:'8px 12px', fontSize:13, color:'#15803d'}}>{succes}</div>}
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
                <div><label style={LS}>Prénom *</label><input className="input" value={form.prenom} onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))} placeholder="Prénom"/></div>
                <div><label style={LS}>Nom *</label><input className="input" value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} placeholder="Nom"/></div>
              </div>
              <div><label style={LS}>Téléphone</label><input className="input" type="tel" value={form.telephone} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))} placeholder="06 00 00 00 00"/></div>
              <div>
                <label style={LS}>Début des redevances</label>
                <input className="input" type="date" value={form.redevance_debut} onChange={e => setForm(f => ({ ...f, redevance_debut: e.target.value }))}/>
                <div style={{fontSize:11.5, color:'var(--ink-500)', marginTop:4}}>Date à partir de laquelle la redevance mensuelle est due.</div>
              </div>
              <div>
                <label style={LS}>Redevance mensuelle (HT)</label>
                <input className="input" type="number" min="0" step="0.01" value={form.redevance_mensuelle_ht} onChange={e => setForm(f => ({ ...f, redevance_mensuelle_ht: e.target.value }))} placeholder="€ / mois"/>
                <div style={{fontSize:11.5, color:'var(--ink-500)', marginTop:4}}>Montant fixe dû chaque mois (à partir de la date ci-dessus). Vide = à paramétrer.</div>
              </div>
              <div>
                <label style={LS}>Répartitions commission disponibles — agent %</label>
                <input className="input" value={form.parts_agente_disponibles} onChange={e => setForm(f => ({ ...f, parts_agente_disponibles: e.target.value }))} placeholder="ex: 60 ou 50, 60"/>
                <div style={{fontSize:11.5, color:'var(--ink-500)', marginTop:4}}>Une valeur = pas de choix. Plusieurs séparées par virgule = l&apos;agent choisit.</div>
              </div>
              <div>
                <label style={LS}>Répartition frais de consultation — agent / Société</label>
                <div style={{display:'flex', alignItems:'center', gap:10}}>
                  <div style={{flex:1}}>
                    <input className="input" type="number" min="0" max="100" value={form.frais_part_agente_defaut} onChange={e => setForm(f => ({ ...f, frais_part_agente_defaut: parseInt(e.target.value) || 0 }))} style={{textAlign:'center'}}/>
                    <div style={{fontSize:11, textAlign:'center', color:'var(--ink-500)', marginTop:3}}>Agente %</div>
                  </div>
                  <span style={{color:'var(--ink-500)', fontWeight:600}}>/</span>
                  <div style={{flex:1}}>
                    <input className="input" type="number" value={100 - form.frais_part_agente_defaut} disabled style={{textAlign:'center', opacity:0.5}}/>
                    <div style={{fontSize:11, textAlign:'center', color:'var(--ink-500)', marginTop:3}}>Société %</div>
                  </div>
                </div>
              </div>
              <div>
                <label style={LS}>Objectif de CA — agent {new Date().getFullYear()}</label>
                <input className="input" type="number" min="0" value={form.objectif} onChange={e => setForm(f => ({ ...f, objectif: e.target.value }))} placeholder="Objectif annuel €"/>
                <div style={{fontSize:11.5, color:'var(--ink-500)', marginTop:4}}>Montant annuel. Modifiable à tout moment.</div>
              </div>
            </div>
        </ModalShell>
      )}

      {/* ── Modal suppression ── */}
      {modal === 'supprimer' && agenteASupprimer && (
        <ModalShell
          onClose={() => { setModal(false); setAgenteASupprimer(null); setErreur('') }}
          width={440}
          footer={<>
            <button className="btn btn-ghost" style={{flex:1}} onClick={() => { setModal(false); setAgenteASupprimer(null); setErreur('') }}>Annuler</button>
            <button className="btn btn-primary" style={{flex:1, background:'#DC2626', opacity: supprimant ? 0.5 : 1}} onClick={desactiverAgente} disabled={supprimant}>
              {supprimant ? 'Désactivation…' : 'Désactiver'}
            </button>
          </>}
        >
          <div style={{padding:24}}>
            <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:16}}>
              <div style={{width:40, height:40, borderRadius:99, background:'rgba(239,68,68,0.1)', color:'#DC2626', display:'grid', placeItems:'center', fontSize:18, flexShrink:0}}>⚠</div>
              <div>
                <div style={{fontWeight:700, color:'var(--ink-900)'}}>Désactiver cet agent ?</div>
                <div style={{fontSize:13, color:'var(--ink-500)', marginTop:2}}>{agenteASupprimer.prenom} {agenteASupprimer.nom}</div>
              </div>
            </div>
            <div style={{background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.3)', borderRadius:10, padding:'12px 16px', fontSize:13, color:'var(--ink-700)', marginBottom:14, lineHeight:1.5}}>
              Elle <strong>ne pourra plus se connecter</strong>. Ses chantiers, clients, dossiers,
              rapports de visite et documents <strong>restent attribués et conservés</strong>.
              C&apos;est <strong>réversible</strong> : tu pourras la réactiver à tout moment.
            </div>
            {erreur && <div style={{background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:8, padding:'8px 12px', fontSize:13, color:'#b91c1c', marginBottom:12}}>{erreur}</div>}
          </div>
        </ModalShell>
      )}
    </div>
  )
}
