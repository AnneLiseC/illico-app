'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '../lib/auth-context'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import frLocale from '@fullcalendar/core/locales/fr'

// ─── PALETTE illiCO TRAVAUX ───────────────────────────────────────────────────
const COLORS = {
  navy:   '#0B2D5E',
  blue:   '#1A56DB',
  sky:    '#3B82F6',
  teal:   '#0D9488',
  amber:  '#D97706',
  coral:  '#E05252',
  violet: '#7C3AED',
  slate:  '#475569',
  mint:   '#10B981',
  gold:   '#B45309',
}

const TYPE_CONFIG = {
  visite_technique_client:  { label: 'R1 — Visite client',      short: 'R1',    color: COLORS.blue,   bg: '#EFF6FF' },
  visite_technique_artisan: { label: 'R2 — Visite artisan',     short: 'R2',    color: COLORS.teal,   bg: '#F0FDF9' },
  presentation_devis:       { label: 'R3 — Présentation devis', short: 'R3',    color: COLORS.amber,  bg: '#FFFBEB' },
  autres:                   { label: 'Autre RDV',               short: 'Autre', color: '#64748B',     bg: '#F8FAFC' },
}

const ARTISAN_COLORS = [COLORS.violet, COLORS.coral, COLORS.mint, COLORS.gold, COLORS.sky, COLORS.teal, '#9333EA', '#0891B2']

const fmtDate    = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '—'
const fmtHeure   = (d) => d ? new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—'
const fmtDateLong = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '—'

export default function Planning() {
  const [rdvs, setRdvs]                   = useState([])
  const [interventions, setInterventions] = useState([])
  const [dossiers, setDossiers]           = useState([])
  const [artisans, setArtisans]           = useState([])
  const [agentes, setAgentes]             = useState([])
  const [devis, setDevis]                 = useState([])
  const [loading, setLoading]             = useState(true)

  const [vue, setVue]                 = useState('tous')
  const [typeFiltre, setTypeFiltre]   = useState('')
  const [artisanFiltre, setArtisanFiltre] = useState('')
  const [agenteFiltre, setAgenteFiltre]   = useState('')
  const [recherche, setRecherche]         = useState('')

  const [modalOuvert, setModalOuvert]         = useState(false)
  const [modalType, setModalType]             = useState('rdv')
  const [elementSelectionne, setElementSelectionne] = useState(null)
  const [modeEdition, setModeEdition]         = useState(false)
  const [saving, setSaving]                   = useState(false)
  const [erreur, setErreur]                   = useState('')

  const [googleConnected, setGoogleConnected] = useState(false)
  const [syncing, setSyncing]                 = useState(false)
  const [syncMessage, setSyncMessage]         = useState('')
  const [sidebarOuverte, setSidebarOuverte]   = useState(false)
  const [calendarView, setCalendarView]       = useState('timeGridWeek')
  const [quickMenu, setQuickMenu]             = useState(null) // { date, x, y }

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 640) {
      setCalendarView('listWeek')
    }
  }, [])

  const [formRdv, setFormRdv] = useState({
    dossier_id: '', type_rdv: 'visite_technique_client',
    date_heure: '', duree_minutes: 60, artisan_id: '', notes: '', titre: '',
  })
  const [formIntervention, setFormIntervention] = useState({
    dossier_id: '', artisan_id: '', type_intervention: 'periode',
    date_debut: '', date_fin: '', jours_specifiques: [], notes: '',
    heure_debut: '', duree_minutes: 60,
  })
  const [formDateCle, setFormDateCle] = useState({ date_demarrage_chantier: '', date_fin_chantier: '' })

  const router = useRouter()
  const { user, profile, initialized } = useAuth()

  const chargerTout = async () => {
    const [rdvRes, intRes, dosRes, artRes, devRes, agRes] = await Promise.all([
      supabase.from('rendez_vous').select('*, dossier:dossiers(id, reference, referente_id, client:clients(civilite, prenom, nom)), artisan:artisans(id, entreprise)').order('date_heure'),
      supabase.from('interventions_artisans').select('*, dossier:dossiers(id, reference, referente_id, client:clients(civilite, prenom, nom)), artisan:artisans(id, entreprise)').order('date_debut'),
      supabase.from('dossiers').select('id, reference, referente_id, date_demarrage_chantier, date_fin_chantier, client:clients(civilite, prenom, nom)').order('reference'),
      supabase.from('artisans').select('id, entreprise').order('entreprise'),
      supabase.from('devis_artisans').select('*, artisan:artisans(id, entreprise)'),
      supabase.from('profiles').select('id, prenom, nom, role').in('role', ['admin', 'agente']).order('prenom'),
    ])
    setRdvs(rdvRes.data || [])
    setInterventions(intRes.data || [])
    setDossiers(dosRes.data || [])
    setArtisans(artRes.data || [])
    setDevis(devRes.data || [])
    setAgentes(agRes.data || [])
  }

  useEffect(() => {
    if (!initialized) return
    if (!user) { router.push('/login'); return }
    if (!profile) return
    const init = async () => {
      await chargerTout()
      try {
        const res = await fetch(`/api/google/calendar/sync?userId=${profile.id}`)
        if (res.ok) { const d = await res.json(); setGoogleConnected(d.connected) }
      } catch { setGoogleConnected(false) }
      const params = new URLSearchParams(window.location.search)
      if (params.get('google') === 'connected') {
        setSyncMessage('✅ Google Calendar connecté avec succès !')
        setGoogleConnected(true)
        window.history.replaceState({}, '', '/planning')
      } else if (params.get('google') === 'error') {
        setSyncMessage('❌ Erreur de connexion Google Calendar')
        window.history.replaceState({}, '', '/planning')
      }
      setLoading(false)
    }
    init()
  }, [initialized, user?.id, profile?.id, router])

  const couleurArtisan = useCallback((artisanId) => {
    const idx = artisans.findIndex(a => a.id === artisanId)
    return ARTISAN_COLORS[idx % ARTISAN_COLORS.length] || COLORS.slate
  }, [artisans])

  // ── ÉVÉNEMENTS CALENDRIER ──────────────────────────────────────────────────

  const evenementsRdv = useMemo(() => rdvs
    .filter(r => vue === 'tous' || (vue === 'moi' && r.dossier?.referente_id === profile?.id) || (vue === 'artisan' && r.artisan_id))
    .filter(r => !typeFiltre   || r.type_rdv === typeFiltre)
    .filter(r => !artisanFiltre || r.artisan_id === artisanFiltre)
    .filter(r => !agenteFiltre  || r.dossier?.referente_id === agenteFiltre)
    .map(r => {
      const cfg = TYPE_CONFIG[r.type_rdv] || TYPE_CONFIG.visite_technique_client
      const client = `${r.dossier?.client?.prenom || ''} ${r.dossier?.client?.nom || ''}`.trim()
      const titre = r.type_rdv === 'autres' && r.titre
        ? `${cfg.short} · ${r.titre}`
        : r.type_rdv === 'visite_technique_artisan'
          ? `${cfg.short} · ${client} × ${r.artisan?.entreprise || ''}`
          : `${cfg.short} · ${client}`
      return {
        id: 'rdv-' + r.id, title: titre,
        start: r.date_heure,
        end: new Date(new Date(r.date_heure).getTime() + (r.duree_minutes || 60) * 60000).toISOString(),
        backgroundColor: cfg.color, borderColor: cfg.color, textColor: '#fff',
        extendedProps: { type: 'rdv', data: r, cfg },
      }
    }), [rdvs, vue, typeFiltre, artisanFiltre, agenteFiltre, profile?.id])

  const evenementsInterventions = useMemo(() => interventions
    .filter(i => !artisanFiltre || i.artisan_id === artisanFiltre)
    .filter(i => !agenteFiltre  || i.dossier?.referente_id === agenteFiltre)
    .flatMap(i => {
      const color = couleurArtisan(i.artisan_id)
      const client = `${i.dossier?.client?.prenom || ''} ${i.dossier?.client?.nom || ''}`.trim()
      const titre = ` ${i.artisan?.entreprise || ''} · ${client}`
      if (i.type_intervention === 'periode') {
        const endExclusive = (() => { const d = new Date(i.date_fin); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) })()
        return [{ id: 'int-' + i.id, title: titre, start: i.date_debut, end: endExclusive, backgroundColor: color + '28', borderColor: color, textColor: color, allDay: true, extendedProps: { type: 'intervention', data: i } }]
      }
      return (i.jours_specifiques || []).map((jour, idx) => {
        const d = jour.slice(0, 10)
        const endD = new Date(d + 'T00:00:00'); endD.setDate(endD.getDate() + 1)
        return { id: 'int-' + i.id + '-' + idx, title: titre, start: d, end: endD.toISOString().slice(0, 10), backgroundColor: color + '28', borderColor: color, textColor: color, allDay: true, extendedProps: { type: 'intervention', data: i } }
      })
    }), [interventions, artisanFiltre, agenteFiltre, couleurArtisan])

  const evenementsDates = useMemo(() => dossiers
    .filter(d => !agenteFiltre || d.referente_id === agenteFiltre)
    .flatMap(d => {
      const evts = []
      if (d.date_demarrage_chantier) evts.push({ id: 'start-' + d.id, title: `▶ ${d.reference}`, start: d.date_demarrage_chantier, allDay: true, backgroundColor: '#ECFDF5', borderColor: COLORS.mint, textColor: COLORS.mint, extendedProps: { type: 'date_cle', data: d } })
      if (d.date_fin_chantier) evts.push({ id: 'end-' + d.id, title: `■ ${d.reference}`, start: d.date_fin_chantier, allDay: true, backgroundColor: '#FFF7ED', borderColor: COLORS.amber, textColor: COLORS.gold, extendedProps: { type: 'date_cle', data: d } })
      return evts
    }), [dossiers, agenteFiltre])

  const tousEvenements = useMemo(() => [...evenementsRdv, ...evenementsInterventions, ...evenementsDates],
    [evenementsRdv, evenementsInterventions, evenementsDates])

  // ── AGENDA SIDEBAR ─────────────────────────────────────────────────────────

  const agendaItems = useMemo(() => {
    const maintenant = new Date()
    const dans30j = new Date(maintenant.getTime() + 30 * 24 * 3600000)

    const rdvItems = rdvs
      .filter(r => { const d = new Date(r.date_heure); return d >= maintenant && d <= dans30j })
      .filter(r => !artisanFiltre || r.artisan_id === artisanFiltre)
      .filter(r => !agenteFiltre  || r.dossier?.referente_id === agenteFiltre)
      .filter(r => !typeFiltre    || r.type_rdv === typeFiltre)
      .map(r => {
        const cfg = TYPE_CONFIG[r.type_rdv] || TYPE_CONFIG.visite_technique_client
        const client = `${r.dossier?.client?.prenom || ''} ${r.dossier?.client?.nom || ''}`.trim()
        return {
          id: r.id, type: 'rdv', date: new Date(r.date_heure),
          titre: `${cfg.short} · ${client}`,
          sous: r.type_rdv === 'visite_technique_artisan' && r.artisan?.entreprise ? `avec ${r.artisan.entreprise}` : fmtHeure(r.date_heure),
          color: cfg.color, data: r,
        }
      })

    const intItems = interventions
      .filter(i => { const d = new Date(i.date_debut); return d >= maintenant && d <= dans30j })
      .filter(i => !artisanFiltre || i.artisan_id === artisanFiltre)
      .filter(i => !agenteFiltre  || i.dossier?.referente_id === agenteFiltre)
      .map(i => {
        const color = couleurArtisan(i.artisan_id)
        return {
          id: i.id, type: 'intervention', date: new Date(i.date_debut),
          titre: `🔨 ${i.artisan?.entreprise || ''}`,
          sous: `${i.dossier?.client?.prenom || ''} ${i.dossier?.client?.nom || ''} · ${i.type_intervention === 'periode' ? `${fmtDate(i.date_debut)} → ${fmtDate(i.date_fin)}` : `${i.jours_specifiques?.length || 0} j`}`,
          color, data: i,
        }
      })

    return [...rdvItems, ...intItems]
      .filter(item => !recherche || [item.titre, item.sous].join(' ').toLowerCase().includes(recherche.toLowerCase()))
      .sort((a, b) => a.date - b.date)
  }, [rdvs, interventions, artisanFiltre, agenteFiltre, typeFiltre, recherche, couleurArtisan])

  // ── HANDLERS ──────────────────────────────────────────────────────────────

  const handleDateClick = (info) => {
    if (modalType === 'intervention' && formIntervention.type_intervention === 'jours_specifiques') {
      const date = info.dateStr.slice(0, 10)
      setFormIntervention(f => ({ ...f, jours_specifiques: f.jours_specifiques.includes(date) ? f.jours_specifiques.filter(j => j !== date) : [...f.jours_specifiques, date] }))
      return
    }
    // Mini-menu : choisir entre RDV et Intervention
    const rect = info.jsEvent?.target?.getBoundingClientRect?.() || {}
    const x = Math.min(info.jsEvent?.clientX ?? 200, window.innerWidth - 200)
    const y = Math.min(info.jsEvent?.clientY ?? 200, window.innerHeight - 120)
    setQuickMenu({ date: info.dateStr, x, y })
  }

  const ouvrirDepuisMenu = (type) => {
    if (!quickMenu) return
    const date = quickMenu.date.slice(0, 10)
    setElementSelectionne(null); setModeEdition(false); setQuickMenu(null)
    if (type === 'rdv') {
      setFormRdv(f => ({ ...f, date_heure: date + 'T09:00' }))
      setModalType('rdv'); setModalOuvert(true)
    } else {
      setFormIntervention(f => ({ ...f, date_debut: date }))
      setModalType('intervention'); setModalOuvert(true)
    }
  }

  const handleEventClick = (info) => {
    const { type, data, cfg } = info.event.extendedProps
    setElementSelectionne({ type, data, cfg }); setModalType(type); setModeEdition(false)
    if (type === 'rdv') setFormRdv({ dossier_id: data.dossier_id, type_rdv: data.type_rdv, date_heure: data.date_heure?.slice(0, 16), duree_minutes: data.duree_minutes || 60, artisan_id: data.artisan_id || '', notes: data.notes || '', titre: data.titre || '' })
    else if (type === 'intervention') setFormIntervention({ dossier_id: data.dossier_id, artisan_id: data.artisan_id, type_intervention: data.type_intervention, date_debut: data.date_debut || '', date_fin: data.date_fin || '', jours_specifiques: data.jours_specifiques || [], notes: data.notes || '' })
    else if (type === 'date_cle') setFormDateCle({ date_demarrage_chantier: data.date_demarrage_chantier || '', date_fin_chantier: data.date_fin_chantier || '' })
    setModalOuvert(true)
  }

  const ouvrirSidebar = (item) => {
    setElementSelectionne({ type: item.type, data: item.data })
    setModalType(item.type); setModeEdition(false)
    if (item.type === 'rdv') setFormRdv({ dossier_id: item.data.dossier_id, type_rdv: item.data.type_rdv, date_heure: item.data.date_heure?.slice(0, 16), duree_minutes: item.data.duree_minutes || 60, artisan_id: item.data.artisan_id || '', notes: item.data.notes || '', titre: item.data.titre || '' })
    else if (item.type === 'intervention') setFormIntervention({ dossier_id: item.data.dossier_id, artisan_id: item.data.artisan_id, type_intervention: item.data.type_intervention, date_debut: item.data.date_debut || '', date_fin: item.data.date_fin || '', jours_specifiques: item.data.jours_specifiques || [], notes: item.data.notes || '' })
    setModalOuvert(true)
  }

  const fermerModal = () => {
    setModalOuvert(false); setElementSelectionne(null); setModeEdition(false); setErreur('')
    setFormRdv({ dossier_id: '', type_rdv: 'visite_technique_client', date_heure: '', duree_minutes: 60, artisan_id: '', notes: '', titre: '' })
    setFormIntervention({ dossier_id: '', artisan_id: '', type_intervention: 'periode', date_debut: '', date_fin: '', jours_specifiques: [], notes: '' })
  }

  const pushToGoogle = (type, id) => {
    if (!googleConnected || !id) return
    fetch('/api/google/calendar/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: profile?.id, type, id }),
    }).catch(() => {})
  }

  const sauvegarderRdv = async () => {
    if (!formRdv.date_heure) return
    setSaving(true); setErreur('')
    const payload = { type_rdv: formRdv.type_rdv, date_heure: formRdv.date_heure, duree_minutes: parseInt(formRdv.duree_minutes), artisan_id: formRdv.artisan_id || null, notes: formRdv.notes || null, titre: formRdv.type_rdv === 'autres' ? (formRdv.titre || null) : null }
    let savedId = elementSelectionne?.data?.id
    if (elementSelectionne?.type === 'rdv' && modeEdition) {
      const { error } = await supabase.from('rendez_vous').update(payload).eq('id', savedId)
      if (error) { setErreur(error.message); setSaving(false); return }
    } else {
      const { data, error } = await supabase.from('rendez_vous').insert({ ...payload, dossier_id: formRdv.dossier_id }).select('id').single()
      if (error) { setErreur(error.message); setSaving(false); return }
      savedId = data?.id
    }
    pushToGoogle('rdv', savedId)
    fermerModal(); setSaving(false)
    chargerTout()
  }

  const sauvegarderIntervention = async () => {
    if (!formIntervention.artisan_id) return
    setSaving(true); setErreur('')
    const payload = { dossier_id: formIntervention.dossier_id, artisan_id: formIntervention.artisan_id, type_intervention: formIntervention.type_intervention, date_debut: formIntervention.date_debut || null, date_fin: formIntervention.type_intervention === 'periode' ? formIntervention.date_fin || null : null, jours_specifiques: formIntervention.type_intervention === 'jours_specifiques' ? formIntervention.jours_specifiques : null, notes: formIntervention.notes || null, heure_debut: formIntervention.heure_debut || null, duree_minutes: formIntervention.heure_debut ? (formIntervention.duree_minutes || 60) : null }
    let savedId = elementSelectionne?.data?.id
    if (elementSelectionne?.type === 'intervention' && modeEdition) {
      const { error } = await supabase.from('interventions_artisans').update(payload).eq('id', savedId)
      if (error) { setErreur(error.message); setSaving(false); return }
    } else {
      const { data, error } = await supabase.from('interventions_artisans').insert(payload).select('id').single()
      if (error) { setErreur(error.message); setSaving(false); return }
      savedId = data?.id
    }
    pushToGoogle('intervention', savedId)
    fermerModal(); setSaving(false)
    chargerTout()
  }

  const sauvegarderDateCle = async () => {
    if (!elementSelectionne?.data?.id) return
    setSaving(true); setErreur('')
    const { error } = await supabase.from('dossiers').update({ date_demarrage_chantier: formDateCle.date_demarrage_chantier || null, date_fin_chantier: formDateCle.date_fin_chantier || null }).eq('id', elementSelectionne.data.id)
    if (error) { setErreur(error.message); setSaving(false); return }
    pushToGoogle('dossier', elementSelectionne.data.id)
    setDossiers(prev => prev.map(d => d.id === elementSelectionne.data.id ? { ...d, ...formDateCle } : d))
    fermerModal(); setSaving(false)
  }

  const supprimer = async () => {
    if (!elementSelectionne || !confirm('Supprimer cet élément ?')) return
    // Supprimer l'événement Google Calendar en premier (non bloquant)
    const googleEventId = elementSelectionne.data.google_event_id
    if (googleConnected && googleEventId) {
      fetch('/api/google/calendar/event', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: profile?.id, googleEventId }),
      }).catch(() => {})
    }
    if (elementSelectionne.type === 'rdv') await supabase.from('rendez_vous').delete().eq('id', elementSelectionne.data.id)
    else await supabase.from('interventions_artisans').delete().eq('id', elementSelectionne.data.id)
    fermerModal()
    chargerTout()
  }

  const syncGoogle = async () => {
    setSyncing(true); setSyncMessage('')
    try {
      const res = await fetch('/api/google/calendar/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: profile?.id }) })
      const data = await res.json()
      if (!res.ok) {
        setSyncMessage(`❌ ${data.error || 'Erreur de synchronisation'}`)
        if (data.needsReconnect) setGoogleConnected(false)
      } else if (data.hasErrors && !data.pushed && !data.updated && !data.pulled && !data.deleted) {
        setSyncMessage(`❌ ${data.message}`)
      } else {
        setSyncMessage(`✅ ${data.message}`)
        if (data.deleted > 0 || data.pulled > 0) await chargerTout()
      }
    } catch { setSyncMessage('❌ Google Calendar non configuré') }
    setSyncing(false)
  }

  if (loading) return <div className="page-loading" />

  const inputCls = "input"
  const labelCls = "eyebrow"

  return (
    <div className="page-enter" style={{ background: 'var(--bg)' }}>

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header style={{ background: COLORS.navy, padding:'12px 24px', position:'sticky', top:0, zIndex:40 }}>
        <div style={{maxWidth:'100%', display:'flex', flexDirection:'column', gap:8}}>

          {/* Ligne 1 : nav + boutons */}
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
            <div style={{display:'flex', alignItems:'center', gap:16}}>
              {/* Bouton sidebar — mobile uniquement */}
              <button onClick={() => setSidebarOuverte(o => !o)}
                className="sm:hidden" style={{color:'#93c5fd', background:'none', border:'none', cursor:'pointer', padding:4}}>
                <svg width={20} height={20} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <button onClick={() => router.push('/dashboard')}
                className="hidden sm:block"
                style={{color:'#93c5fd', fontSize:13, background:'none', border:'none', cursor:'pointer'}}>← Retour</button>
              <div className="hidden sm:block" style={{width:1, height:16, background:'rgba(255,255,255,0.15)'}}/>
              <h1 style={{color:'#fff', fontWeight:700, fontSize:15, letterSpacing:-0.02}}>Planning</h1>
            </div>
            <div style={{display:'flex', alignItems:'center', gap:8}}>
              {googleConnected ? (
                <button onClick={syncGoogle} disabled={syncing}
                  style={{display:'flex', alignItems:'center', gap:6, fontSize:12, padding:'6px 12px', borderRadius:8, border:'1px solid #34d399', color:'#34d399', background:'transparent', cursor:'pointer', opacity: syncing ? 0.6 : 1}}>
                  <span style={{width:6, height:6, borderRadius:'50%', background:'#34d399', flexShrink:0, animation: syncing ? 'pulse 1s infinite' : undefined}}/>
                  <span className="hidden sm:inline">{syncing ? 'Sync…' : 'Google Calendar'}</span>
                  <span className="sm:hidden">{syncing ? '…' : '📅'}</span>
                </button>
              ) : (
                <a href={`/api/auth/google?userId=${profile?.id}`}
                  style={{display:'flex', alignItems:'center', gap:6, fontSize:12, padding:'6px 12px', borderRadius:8, border:'1px solid rgba(147,197,253,0.4)', color:'#93c5fd', textDecoration:'none'}}>
                  <span className="hidden sm:inline">📅 Google Calendar</span>
                  <span className="sm:hidden">📅</span>
                </a>
              )}
              <div className="hidden sm:block" style={{width:1, height:16, background:'rgba(255,255,255,0.15)'}}/>
              <button onClick={() => { setModalType('intervention'); setElementSelectionne(null); setModeEdition(false); setModalOuvert(true) }}
                style={{fontSize:12, padding:'6px 12px', borderRadius:8, border:'1px solid rgba(255,255,255,0.25)', color:'#fff', background:'transparent', cursor:'pointer'}}>
                + <span className="hidden sm:inline">Intervention</span><span className="sm:hidden">Int.</span>
              </button>
              <button onClick={() => { setModalType('rdv'); setElementSelectionne(null); setModeEdition(false); setModalOuvert(true) }}
                style={{fontSize:12, padding:'6px 16px', borderRadius:8, fontWeight:600, color:'#fff', background:COLORS.blue, border:'none', cursor:'pointer'}}>
                + RDV
              </button>
            </div>
          </div>

          {/* Ligne 2 : filtres */}
          <div style={{display:'flex', alignItems:'center', gap:8, overflowX:'auto', paddingBottom:2}}>

            {/* Vue */}
            <div style={{display:'flex', gap:2, borderRadius:8, padding:2, background:'rgba(255,255,255,0.08)', flexShrink:0}}>
              {[{ k: 'tous', l: 'Tous' }, { k: 'moi', l: 'Mes RDV' }, { k: 'artisan', l: 'Avec artisans' }].map(({ k, l }) => (
                <button key={k} onClick={() => setVue(k)}
                  style={{padding:'4px 12px', borderRadius:6, fontSize:12, fontWeight:600, cursor:'pointer', border:'none',
                    background: vue === k ? COLORS.blue : 'transparent',
                    color: vue === k ? '#fff' : 'rgba(147,197,253,0.9)'}}>
                  {l}
                </button>
              ))}
            </div>

            <div style={{width:1, height:16, background:'rgba(255,255,255,0.15)', flexShrink:0}}/>

            {/* Type RDV */}
            <div style={{display:'flex', gap:2, borderRadius:8, padding:2, background:'rgba(255,255,255,0.08)', flexShrink:0}}>
              {[{ k: '', l: 'Tous types' }, { k: 'visite_technique_client', l: 'R1' }, { k: 'visite_technique_artisan', l: 'R2' }, { k: 'presentation_devis', l: 'R3' }, { k: 'autres', l: 'Autres' }].map(({ k, l }) => (
                <button key={k} onClick={() => setTypeFiltre(k)}
                  style={{padding:'4px 12px', borderRadius:6, fontSize:12, fontWeight:600, cursor:'pointer', border:'none',
                    background: typeFiltre === k ? COLORS.blue : 'transparent',
                    color: typeFiltre === k ? '#fff' : 'rgba(147,197,253,0.9)'}}>
                  {l}
                </button>
              ))}
            </div>

            <div style={{width:1, height:16, background:'rgba(255,255,255,0.15)', flexShrink:0}}/>

            {/* Filtre agente (admin seulement) */}
            {profile?.role === 'admin' && (
              <select value={agenteFiltre} onChange={e => setAgenteFiltre(e.target.value)}
                style={{fontSize:12, borderRadius:8, padding:'6px 10px', border:'none', background:'rgba(255,255,255,0.12)', color:'#93c5fd', cursor:'pointer'}}>
                <option value="" style={{ background: COLORS.navy }}>Toute l'agence</option>
                {agentes.map(a => <option key={a.id} value={a.id} style={{ background: COLORS.navy }}>{a.prenom} {a.nom}</option>)}
              </select>
            )}

            {/* Filtre artisan */}
            <select value={artisanFiltre} onChange={e => setArtisanFiltre(e.target.value)}
              style={{fontSize:12, borderRadius:8, padding:'6px 10px', border:'none', background:'rgba(255,255,255,0.12)', color:'#93c5fd', cursor:'pointer'}}>
              <option value="" style={{ background: COLORS.navy }}>Tous les artisans</option>
              {artisans.map(a => <option key={a.id} value={a.id} style={{ background: COLORS.navy }}>{a.entreprise}</option>)}
            </select>

            {/* Reset filtres */}
            {(typeFiltre || artisanFiltre || agenteFiltre || vue !== 'tous') && (
              <button onClick={() => { setTypeFiltre(''); setArtisanFiltre(''); setAgenteFiltre(''); setVue('tous') }}
                style={{fontSize:12, color:'rgba(147,197,253,0.8)', background:'none', border:'none', cursor:'pointer', textDecoration:'underline', flexShrink:0}}>
                Réinitialiser
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── SYNC MESSAGE ───────────────────────────────────────────────────── */}
      {syncMessage && (
        <div style={{
          fontSize:12, padding:'10px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid',
          background: syncMessage.startsWith('✅') ? 'rgba(22,163,74,0.06)' : 'rgba(239,68,68,0.06)',
          color: syncMessage.startsWith('✅') ? '#15803d' : '#b91c1c',
          borderColor: syncMessage.startsWith('✅') ? 'rgba(22,163,74,0.15)' : 'rgba(239,68,68,0.15)',
        }}>
          <span style={{fontWeight:600}}>{syncMessage}</span>
          <button onClick={() => setSyncMessage('')} style={{marginLeft:16, opacity:0.5, background:'none', border:'none', cursor:'pointer', fontSize:18, lineHeight:1}}>×</button>
        </div>
      )}

      {/* ── LAYOUT ─────────────────────────────────────────────────────────── */}
      <div className="sm:flex" style={{gap:16, padding:'16px 16px', maxWidth:'100%'}}>

        {/* ── SIDEBAR ──────────────────────────────────────────────────────── */}
        <aside className={`sm:flex-shrink-0 ${sidebarOuverte ? 'block' : 'hidden'} sm:block`}
          style={{width:288, display:'flex', flexDirection:'column', gap:12, marginBottom:16}}>

          {/* Recherche */}
          <div style={{position:'relative'}}>
            <span style={{position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--ink-400)', fontSize:14, pointerEvents:'none'}}>🔍</span>
            <input value={recherche} onChange={e => setRecherche(e.target.value)}
              placeholder="Rechercher client, artisan…"
              className="input" style={{paddingLeft:32, width:'100%'}}/>
            {recherche && (
              <button onClick={() => setRecherche('')}
                style={{position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', color:'var(--ink-400)', background:'none', border:'none', cursor:'pointer', fontSize:16, lineHeight:1}}>×</button>
            )}
          </div>

          {/* Légende */}
          <div className="card" style={{padding:16}}>
            <div className="eyebrow" style={{marginBottom:12}}>Légende</div>
            <div style={{display:'flex', flexDirection:'column', gap:10}}>
              {Object.entries(TYPE_CONFIG).map(([, cfg]) => (
                <div key={cfg.label} style={{display:'flex', alignItems:'center', gap:10}}>
                  <div style={{width:24, height:24, borderRadius:6, flexShrink:0, display:'grid', placeItems:'center', color:'#fff', fontSize:11, fontWeight:700, background:cfg.color}}>
                    {cfg.short}
                  </div>
                  <span style={{fontSize:12, color:'var(--ink-600)'}}>{cfg.label}</span>
                </div>
              ))}
              <div style={{borderTop:'1px solid var(--ink-100)', paddingTop:10, marginTop:2, display:'flex', flexDirection:'column', gap:8}}>
                {[
                  { icon: '🔨', label: 'Intervention artisan', border: COLORS.violet, bg: COLORS.violet + '20', color: COLORS.violet },
                  { icon: '▶',  label: 'Démarrage chantier',  border: COLORS.mint,   bg: '#ECFDF5',           color: COLORS.mint },
                  { icon: '■',  label: 'Fin de chantier',      border: COLORS.amber,  bg: '#FFF7ED',           color: COLORS.amber },
                ].map(({ icon, label, border, bg, color }) => (
                  <div key={label} style={{display:'flex', alignItems:'center', gap:10}}>
                    <div style={{width:24, height:24, borderRadius:6, flexShrink:0, border:`2px solid ${border}`, background:bg, color, display:'grid', placeItems:'center', fontSize:11, fontWeight:700}}>
                      {icon}
                    </div>
                    <span style={{fontSize:12, color:'var(--ink-600)'}}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Agenda À venir */}
          <div className="card" style={{padding:0, overflow:'hidden'}}>
            <div style={{padding:'12px 16px', borderBottom:'1px solid var(--ink-100)', display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--surface-2)'}}>
              <div className="eyebrow">À venir</div>
              <span style={{fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:99, background: COLORS.blue + '15', color: COLORS.blue}}>
                {agendaItems.length} évén.
              </span>
            </div>
            <div style={{maxHeight:320, overflowY:'auto'}}>
              {agendaItems.length === 0 && (
                <div style={{padding:'24px 16px', textAlign:'center'}}>
                  <p style={{fontSize:12, color:'var(--ink-400)'}}>{recherche ? 'Aucun résultat' : 'Aucun événement à venir'}</p>
                </div>
              )}
              {agendaItems.map(item => (
                <button key={item.id + item.type} onClick={() => ouvrirSidebar(item)}
                  className="row-hover"
                  style={{width:'100%', textAlign:'left', padding:'12px 16px', borderBottom:'1px solid var(--ink-50)', border:0, background:'transparent', cursor:'pointer', display:'block'}}>
                  <div style={{display:'flex', alignItems:'flex-start', gap:10}}>
                    <div style={{width:3, borderRadius:99, marginTop:2, alignSelf:'stretch', flexShrink:0, background:item.color, minHeight:28}}/>
                    <div style={{flex:1, minWidth:0}}>
                      <div style={{fontSize:12, fontWeight:600, color:'var(--ink-800)'}} className="clip-1">{item.titre}</div>
                      <div style={{fontSize:11.5, color:'var(--ink-400)', marginTop:2}} className="clip-1">{item.sous}</div>
                      <div style={{fontSize:11.5, fontWeight:700, marginTop:4, color:item.color}}>{fmtDate(item.date)}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Stats */}
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
            {[
              { label: 'RDV ce mois', value: rdvs.filter(r => { const d = new Date(r.date_heure), m = new Date(); return d.getMonth() === m.getMonth() && d.getFullYear() === m.getFullYear() }).length, color: COLORS.blue },
              { label: 'Interventions', value: interventions.length, color: COLORS.violet },
              { label: 'Chantiers actifs', value: dossiers.filter(d => d.date_demarrage_chantier && !d.date_fin_chantier).length, color: COLORS.mint},
              { label: 'À venir 30j', value: agendaItems.length, color: COLORS.amber },
            ].map(({ label, value, color }) => (
              <div key={label} className="card" style={{padding:12, textAlign:'center'}}>
                <div className="tnum" style={{fontSize:20, fontWeight:800, color}}>{value}</div>
                <div className="eyebrow" style={{marginTop:4}}>{label}</div>
              </div>
            ))}
          </div>
        </aside>

        {/* ── CALENDRIER ───────────────────────────────────────────────────── */}
        <div style={{flex:1, minWidth:0, width:'100%'}}>
          <div className="card" style={{padding:0, overflow:'hidden'}}>
            <style>{`
              .fc { font-family: system-ui, -apple-system, sans-serif; }
              .fc-toolbar { padding: 14px 18px !important; background: white; border-bottom: 1px solid #F1F5F9 !important; }
              .fc-toolbar-title { font-size: 1rem !important; font-weight: 700 !important; color: ${COLORS.navy} !important; letter-spacing: -0.02em; }
              .fc-button-group .fc-button, .fc-button { background: white !important; border: 1px solid #E2E8F0 !important; color: #475569 !important; border-radius: 8px !important; font-size: 12px !important; font-weight: 600 !important; padding: 5px 12px !important; box-shadow: none !important; transition: all 0.15s !important; margin: 0 1px !important; }
              .fc-button:hover { background: #F8FAFC !important; color: ${COLORS.navy} !important; border-color: #CBD5E1 !important; }
              .fc-button-primary:not(:disabled).fc-button-active, .fc-button-primary:not(:disabled):active { background: ${COLORS.navy} !important; color: white !important; border-color: ${COLORS.navy} !important; }
              .fc-today-button { background: ${COLORS.blue} !important; color: white !important; border-color: ${COLORS.blue} !important; }
              .fc-today-button:hover { background: #1447C0 !important; border-color: #1447C0 !important; }
              .fc-col-header-cell { background: #F8FAFC !important; border-color: #F1F5F9 !important; }
              .fc-col-header-cell-cushion { font-size: 11px !important; font-weight: 700 !important; color: #94A3B8 !important; text-transform: uppercase !important; letter-spacing: 0.08em !important; text-decoration: none !important; padding: 8px 4px !important; }
              .fc-daygrid-day-number { font-size: 12px !important; font-weight: 600 !important; color: #64748B !important; padding: 5px 8px !important; text-decoration: none !important; }
              .fc-day-today .fc-daygrid-day-number { color: ${COLORS.blue} !important; font-weight: 800 !important; }
              .fc-day-today { background: #EFF6FF !important; }
              .fc-event { border-radius: 5px !important; font-size: 11px !important; font-weight: 600 !important; padding: 1px 5px !important; cursor: pointer !important; transition: all 0.12s !important; }
              .fc-event:hover { filter: brightness(1.08) !important; box-shadow: 0 2px 8px rgba(0,0,0,0.2) !important; transform: translateY(-1px) !important; }
              .fc-timegrid-slot-label { font-size: 11px !important; color: #94A3B8 !important; font-weight: 500 !important; }
              .fc-timegrid-now-indicator-line { border-color: ${COLORS.coral} !important; border-width: 2px !important; }
              .fc-timegrid-now-indicator-arrow { border-top-color: ${COLORS.coral} !important; border-bottom-color: ${COLORS.coral} !important; }
              .fc-list-day-cushion { background: #F8FAFC !important; }
              .fc-list-day-text, .fc-list-day-side-text { font-size: 12px !important; font-weight: 700 !important; color: ${COLORS.navy} !important; text-decoration: none !important; }
              .fc-list-event:hover td { background: #F8FAFC !important; cursor: pointer; }
              .fc-list-event-title a { font-size: 12px !important; font-weight: 600 !important; text-decoration: none !important; }
              .fc-scrollgrid { border: none !important; }
              .fc-scrollgrid td, .fc-scrollgrid th { border-color: #F1F5F9 !important; }
              .fc-daygrid-day { min-height: 80px !important; }
              .fc-more-link { font-size: 10px !important; font-weight: 700 !important; color: ${COLORS.blue} !important; }
            `}</style>
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
              initialView={calendarView}
              locale={frLocale}
              headerToolbar={{
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,listWeek'
              }}
              buttonText={{ today: "Auj.", month: 'Mois', week: 'Sem.', list: 'Liste' }}
              events={tousEvenements}
              dateClick={handleDateClick}
              eventClick={handleEventClick}
              height="calc(100vh - 180px)"
              slotMinTime="06:00:00"
              slotMaxTime="23:00:00"
              slotDuration="00:30:00"
              allDayText="Journée"
              nowIndicator={true}
              dayMaxEvents={3}
              eventTimeFormat={{ hour: '2-digit', minute: '2-digit', meridiem: false }}
            />
          </div>
        </div>
      </div>

      {/* ── MODAL ──────────────────────────────────────────────────────────── */}
      {modalOuvert && (
        <div style={{position:'fixed', inset:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:16, background:'rgba(11,45,94,0.65)', backdropFilter:'blur(6px)'}}
          onClick={fermerModal}>
          <div className="card" style={{width:'100%', maxWidth:448, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 25px 70px rgba(11,45,94,0.3)', padding:0}}
            onClick={e => e.stopPropagation()}>

            {/* Header modal */}
            <div style={{
              padding:'16px 24px', borderBottom:'1px solid var(--ink-100)', display:'flex', alignItems:'center', justifyContent:'space-between',
              background: elementSelectionne?.type === 'rdv' ? (TYPE_CONFIG[elementSelectionne.data.type_rdv]?.bg || 'var(--surface-2)') : 'var(--surface-2)',
            }}>
              <div>
                {elementSelectionne?.type === 'rdv' && !modeEdition && (() => {
                  const cfg = TYPE_CONFIG[elementSelectionne.data.type_rdv]
                  return <>
                    <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:4}}>
                      <div style={{width:20, height:20, borderRadius:6, display:'grid', placeItems:'center', color:'#fff', fontSize:11, fontWeight:700, background:cfg?.color}}>{cfg?.short}</div>
                      <div className="eyebrow" style={{color:cfg?.color}}>{cfg?.label}</div>
                    </div>
                    <div style={{fontWeight:700, color:'var(--ink-900)', fontSize:15}}>
                      {elementSelectionne.data.type_rdv === 'autres' && elementSelectionne.data.titre
                        ? elementSelectionne.data.titre
                        : `${elementSelectionne.data.dossier?.client?.prenom || ''} ${elementSelectionne.data.dossier?.client?.nom || ''}`.trim() || 'Autre RDV'}
                    </div>
                  </>
                })()}
                {elementSelectionne?.type === 'intervention' && !modeEdition && <>
                  <div className="eyebrow" style={{marginBottom:4}}>Intervention artisan</div>
                  <div style={{fontWeight:700, color:'var(--ink-900)', fontSize:15}}>{elementSelectionne.data.artisan?.entreprise}</div>
                </>}
                {elementSelectionne?.type === 'date_cle' && <>
                  <div className="eyebrow" style={{marginBottom:4}}>Dates chantier</div>
                  <div style={{fontWeight:700, color:'var(--ink-900)', fontSize:15}}>{elementSelectionne.data.reference}</div>
                </>}
                {!elementSelectionne && modalType === 'rdv' && <div style={{fontWeight:700, color:'var(--ink-900)', fontSize:15}}>Nouveau rendez-vous</div>}
                {!elementSelectionne && modalType === 'intervention' && <div style={{fontWeight:700, color:'var(--ink-900)', fontSize:15}}>Nouvelle intervention artisan</div>}
              </div>
              <button onClick={fermerModal} style={{width:32, height:32, borderRadius:'50%', display:'grid', placeItems:'center', color:'var(--ink-400)', background:'none', border:'none', cursor:'pointer', fontSize:20, lineHeight:1}}>×</button>
            </div>

            <div style={{padding:24, display:'flex', flexDirection:'column', gap:16}}>
              {erreur && <div style={{background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', color:'#b91c1c', fontSize:13, padding:'8px 12px', borderRadius:8}}>{erreur}</div>}

              {/* Détail RDV */}
              {elementSelectionne?.type === 'rdv' && !modeEdition && (
                <div style={{display:'flex', flexDirection:'column', gap:12}}>
                  <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
                    <div style={{background:'var(--surface-2)', borderRadius:10, padding:12}}><div className={labelCls}>Chantier</div><div style={{fontSize:13, fontWeight:600, color:'var(--ink-800)', marginTop:4}}>{elementSelectionne.data.dossier?.reference}</div></div>
                    <div style={{background:'var(--surface-2)', borderRadius:10, padding:12}}><div className={labelCls}>Durée</div><div style={{fontSize:13, fontWeight:600, color:'var(--ink-800)', marginTop:4}}>{elementSelectionne.data.duree_minutes} min</div></div>
                  </div>
                  <div style={{background:'var(--surface-2)', borderRadius:10, padding:12}}>
                    <div className={labelCls}>Date & heure</div>
                    <div style={{fontSize:13, fontWeight:600, color:'var(--ink-800)', marginTop:4, textTransform:'capitalize'}}>{fmtDateLong(elementSelectionne.data.date_heure)}</div>
                    <div style={{fontSize:12, color:'var(--ink-500)', marginTop:2}}>{fmtHeure(elementSelectionne.data.date_heure)}</div>
                  </div>
                  {elementSelectionne.data.type_rdv === 'autres' && elementSelectionne.data.titre && <div style={{background:'var(--surface-2)', borderRadius:10, padding:12}}><div className={labelCls}>Titre</div><div style={{fontSize:13, fontWeight:600, color:'var(--ink-800)', marginTop:4}}>{elementSelectionne.data.titre}</div></div>}
                  {elementSelectionne.data.artisan && <div style={{background:'var(--surface-2)', borderRadius:10, padding:12}}><div className={labelCls}>Artisan présent</div><div style={{fontSize:13, fontWeight:600, color:'var(--ink-800)', marginTop:4}}>{elementSelectionne.data.artisan.entreprise}</div></div>}
                  {elementSelectionne.data.notes && <div style={{background:'var(--surface-2)', borderRadius:10, padding:12}}><div className={labelCls}>Notes</div><div style={{fontSize:13, color:'var(--ink-700)', marginTop:4}}>{elementSelectionne.data.notes}</div></div>}
                  <div style={{display:'flex', gap:8, paddingTop:4}}>
                    <button onClick={() => setModeEdition(true)} className="btn btn-ghost" style={{flex:1}}>Modifier</button>
                    <button onClick={() => router.push(`/chantiers/${elementSelectionne.data.dossier_id}`)} className="btn btn-primary" style={{flex:1}}>Voir le chantier →</button>
                    <button onClick={supprimer} className="btn btn-ghost" style={{color:'#b91c1c', borderColor:'rgba(220,38,38,0.2)'}}>🗑</button>
                  </div>
                </div>
              )}

              {/* Détail Intervention */}
              {elementSelectionne?.type === 'intervention' && !modeEdition && (
                <div style={{display:'flex', flexDirection:'column', gap:12}}>
                  <div style={{background:'var(--surface-2)', borderRadius:10, padding:12}}><div className={labelCls}>Chantier</div><div style={{fontSize:13, fontWeight:600, color:'var(--ink-800)', marginTop:4}}>{elementSelectionne.data.dossier?.reference} — {elementSelectionne.data.dossier?.client?.prenom} {elementSelectionne.data.dossier?.client?.nom}</div></div>
                  <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
                    <div style={{background:'var(--surface-2)', borderRadius:10, padding:12}}><div className={labelCls}>Type</div><div style={{fontSize:13, fontWeight:600, color:'var(--ink-800)', marginTop:4}}>{elementSelectionne.data.type_intervention === 'periode' ? 'Période continue' : 'Jours spécifiques'}</div></div>
                    <div style={{background:'var(--surface-2)', borderRadius:10, padding:12}}>
                      {elementSelectionne.data.type_intervention === 'periode' ? (<><div className={labelCls}>Période</div><div style={{fontSize:12, fontWeight:600, color:'var(--ink-800)', marginTop:4}}>{fmtDate(elementSelectionne.data.date_debut)} → {fmtDate(elementSelectionne.data.date_fin)}</div></>) : (<><div className={labelCls}>Jours</div><div style={{fontSize:13, fontWeight:600, color:'var(--ink-800)', marginTop:4}}>{elementSelectionne.data.jours_specifiques?.length || 0} jour(s)</div></>)}
                    </div>
                  </div>
                  {elementSelectionne.data.notes && <div style={{background:'var(--surface-2)', borderRadius:10, padding:12}}><div className={labelCls}>Notes</div><div style={{fontSize:13, color:'var(--ink-700)', marginTop:4}}>{elementSelectionne.data.notes}</div></div>}
                  <div style={{display:'flex', gap:8, paddingTop:4}}>
                    <button onClick={() => setModeEdition(true)} className="btn btn-ghost" style={{flex:1}}>Modifier</button>
                    <button onClick={() => router.push(`/chantiers/${elementSelectionne.data.dossier_id}`)} className="btn btn-primary" style={{flex:1}}>Voir le chantier →</button>
                    <button onClick={supprimer} className="btn btn-ghost" style={{color:'#b91c1c', borderColor:'rgba(220,38,38,0.2)'}}>🗑</button>
                  </div>
                </div>
              )}

              {/* Formulaire RDV */}
              {(modalType === 'rdv' || (elementSelectionne?.type === 'rdv' && modeEdition)) && (!elementSelectionne || modeEdition) && (
                <div style={{display:'flex', flexDirection:'column', gap:16}}>
                  <div><label className={labelCls}>Type de rendez-vous</label>
                    <select value={formRdv.type_rdv} onChange={e => {
                      const newType = e.target.value
                      setFormRdv(f => ({
                        ...f,
                        type_rdv: newType,
                        titre: newType !== 'autres' ? '' : f.titre,
                        dossier_id: newType === 'autres' ? '' : (f.type_rdv === 'autres' ? '' : f.dossier_id),
                      }))
                    }} className={inputCls} style={{marginTop:6}}>
                      <option value="visite_technique_client">R1 — Visite technique client</option>
                      <option value="visite_technique_artisan">R2 — Visite technique avec artisan</option>
                      <option value="presentation_devis">R3 — Présentation devis</option>
                      <option value="autres">Autre rendez-vous</option>
                    </select>
                  </div>
                  {formRdv.type_rdv === 'autres' && <div><label className={labelCls}>Titre du rendez-vous *</label>
                    <input type="text" value={formRdv.titre} onChange={e => setFormRdv(f => ({ ...f, titre: e.target.value }))} placeholder="Ex : Réunion de chantier, Appel fournisseur…" className={inputCls} style={{marginTop:6}}/>
                  </div>}
                  {formRdv.type_rdv !== 'autres' && !formRdv.dossier_id && <div><label className={labelCls}>Chantier *</label>
                    <select value={formRdv.dossier_id} onChange={e => setFormRdv(f => ({ ...f, dossier_id: e.target.value }))} className={inputCls} style={{marginTop:6}}>
                      <option value="">— Choisir un chantier —</option>
                      {dossiers.map(d => <option key={d.id} value={d.id}>{d.reference} — {d.client?.prenom} {d.client?.nom}</option>)}
                    </select>
                  </div>}
                  <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
                    <div><label className={labelCls}>Date et heure *</label><input type="datetime-local" value={formRdv.date_heure} onChange={e => setFormRdv(f => ({ ...f, date_heure: e.target.value }))} className={inputCls} style={{marginTop:6}}/></div>
                    <div><label className={labelCls}>Durée</label>
                      <select value={formRdv.duree_minutes} onChange={e => setFormRdv(f => ({ ...f, duree_minutes: e.target.value }))} className={inputCls} style={{marginTop:6}}>
                        <option value={30}>30 min</option><option value={60}>1h</option><option value={90}>1h30</option><option value={120}>2h</option><option value={180}>3h</option>
                      </select>
                    </div>
                  </div>
                  {formRdv.type_rdv === 'visite_technique_artisan' && <div><label className={labelCls}>Artisan</label>
                    <select value={formRdv.artisan_id} onChange={e => setFormRdv(f => ({ ...f, artisan_id: e.target.value }))} className={inputCls} style={{marginTop:6}}>
                      <option value="">— Choisir —</option>
                      {artisans.map(a => <option key={a.id} value={a.id}>{a.entreprise}</option>)}
                    </select>
                  </div>}
                  <div><label className={labelCls}>Notes</label><textarea value={formRdv.notes} onChange={e => setFormRdv(f => ({ ...f, notes: e.target.value }))} rows={2} className={inputCls} style={{marginTop:6}}/></div>
                  <div style={{display:'flex', gap:8, paddingTop:4}}>
                    <button onClick={fermerModal} className="btn btn-ghost" style={{flex:1}}>Annuler</button>
                    <button onClick={sauvegarderRdv} disabled={(!formRdv.dossier_id && formRdv.type_rdv !== 'autres') || !formRdv.date_heure || saving} className="btn btn-primary" style={{flex:1, opacity: ((!formRdv.dossier_id && formRdv.type_rdv !== 'autres') || !formRdv.date_heure || saving) ? 0.5 : 1}}>
                      {saving ? 'Enregistrement…' : modeEdition ? 'Enregistrer' : 'Créer le RDV'}
                    </button>
                  </div>
                </div>
              )}

              {/* Formulaire Intervention */}
              {(modalType === 'intervention' || (elementSelectionne?.type === 'intervention' && modeEdition)) && (!elementSelectionne || modeEdition) && (
                <div style={{display:'flex', flexDirection:'column', gap:16}}>
                  {!modeEdition && <div><label className={labelCls}>Chantier *</label>
                    <select value={formIntervention.dossier_id} onChange={e => setFormIntervention(f => ({ ...f, dossier_id: e.target.value }))} className={inputCls} style={{marginTop:6}}>
                      <option value="">— Choisir un chantier —</option>
                      {dossiers.map(d => <option key={d.id} value={d.id}>{d.reference} — {d.client?.prenom} {d.client?.nom}</option>)}
                    </select>
                  </div>}
                  <div><label className={labelCls}>Artisan *</label>
                    <select value={formIntervention.artisan_id} onChange={e => setFormIntervention(f => ({ ...f, artisan_id: e.target.value }))} className={inputCls} style={{marginTop:6}}>
                      <option value="">— Choisir —</option>
                      {(formIntervention.dossier_id ? devis.filter(d => d.dossier_id === formIntervention.dossier_id).map(d => d.artisan).filter(Boolean) : artisans).map(a => (
                        <option key={a.id} value={a.id}>{a.entreprise}</option>
                      ))}
                    </select>
                  </div>
                  <div><label className={labelCls}>Type d'intervention</label>
                    <div style={{display:'flex', gap:16, marginTop:8}}>
                      {[{ v: 'periode', l: 'Période continue' }, { v: 'jours_specifiques', l: 'Jours spécifiques' }].map(({ v, l }) => (
                        <label key={v} style={{display:'flex', alignItems:'center', gap:8, cursor:'pointer'}}>
                          <input type="radio" name="type_int" value={v} checked={formIntervention.type_intervention === v} onChange={e => setFormIntervention(f => ({ ...f, type_intervention: e.target.value, jours_specifiques: [] }))} style={{accentColor:'var(--brand-700)'}}/>
                          <span style={{fontSize:13, color:'var(--ink-700)'}}>{l}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  {formIntervention.type_intervention === 'periode' && (
                    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
                      <div><label className={labelCls}>Début</label><input type="date" value={formIntervention.date_debut} onChange={e => setFormIntervention(f => ({ ...f, date_debut: e.target.value }))} className={inputCls} style={{marginTop:6}}/></div>
                      <div><label className={labelCls}>Fin</label><input type="date" value={formIntervention.date_fin} onChange={e => setFormIntervention(f => ({ ...f, date_fin: e.target.value }))} className={inputCls} style={{marginTop:6}}/></div>
                    </div>
                  )}
                  {formIntervention.type_intervention === 'jours_specifiques' && (
                    <div>
                      <label className={labelCls}>Ajouter des jours</label>
                      <input type="date" className={inputCls} style={{marginTop:6}} onChange={e => { const d = e.target.value; if (!d) return; setFormIntervention(f => ({ ...f, jours_specifiques: f.jours_specifiques.includes(d) ? f.jours_specifiques.filter(j => j !== d) : [...f.jours_specifiques, d].sort() })); e.target.value = '' }} />
                      {formIntervention.jours_specifiques.length > 0 && (
                        <div style={{display:'flex', flexWrap:'wrap', gap:6, marginTop:8}}>
                          {formIntervention.jours_specifiques.map(j => (
                            <span key={j} style={{display:'inline-flex', alignItems:'center', gap:4, fontSize:11.5, padding:'4px 10px', borderRadius:8, fontWeight:600, background: COLORS.blue + '15', color: COLORS.blue}}>
                              {fmtDate(j)}
                              <button onClick={() => setFormIntervention(f => ({ ...f, jours_specifiques: f.jours_specifiques.filter(d => d !== j) }))} style={{opacity:0.5, background:'none', border:'none', cursor:'pointer', fontSize:14, lineHeight:1}}>×</button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div>
                    <label className={labelCls}>Horaire</label>
                    <div style={{display:'flex', alignItems:'center', gap:8, marginTop:8, marginBottom:8}}>
                      <input type="checkbox" id="int-journee" checked={!formIntervention.heure_debut} onChange={e => setFormIntervention(f => ({ ...f, heure_debut: e.target.checked ? '' : '08:00' }))} style={{accentColor:'var(--brand-700)'}}/>
                      <label htmlFor="int-journee" style={{fontSize:13, color:'var(--ink-700)', cursor:'pointer'}}>Journée entière</label>
                    </div>
                    {formIntervention.heure_debut && (
                      <div style={{display:'flex', gap:8}}>
                        <div style={{flex:1}}><label className={labelCls}>Heure de début</label><input type="time" value={formIntervention.heure_debut} onChange={e => setFormIntervention(f => ({ ...f, heure_debut: e.target.value }))} className={inputCls} style={{marginTop:6}}/></div>
                        <div style={{flex:1}}><label className={labelCls}>Durée</label>
                          <select value={formIntervention.duree_minutes} onChange={e => setFormIntervention(f => ({ ...f, duree_minutes: Number(e.target.value) }))} className={inputCls} style={{marginTop:6}}>
                            {[30,60,90,120,180,240,300,360,480].map(m => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m/60}h${m%60 ? m%60 : ''}`}</option>)}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                  <div><label className={labelCls}>Notes</label><textarea value={formIntervention.notes} onChange={e => setFormIntervention(f => ({ ...f, notes: e.target.value }))} rows={2} className={inputCls} style={{marginTop:6}}/></div>
                  <div style={{display:'flex', gap:8, paddingTop:4}}>
                    <button onClick={fermerModal} className="btn btn-ghost" style={{flex:1}}>Annuler</button>
                    <button onClick={sauvegarderIntervention} disabled={(!formIntervention.dossier_id && !modeEdition) || !formIntervention.artisan_id || saving}
                      style={{flex:1, padding:'8px 16px', borderRadius:8, fontSize:13, fontWeight:600, color:'#fff', background:COLORS.teal, border:'none', cursor:'pointer', opacity:((!formIntervention.dossier_id && !modeEdition) || !formIntervention.artisan_id || saving) ? 0.5 : 1}}>
                      {saving ? 'Enregistrement…' : modeEdition ? 'Enregistrer' : 'Planifier'}
                    </button>
                  </div>
                </div>
              )}

              {/* Dates clés */}
              {elementSelectionne?.type === 'date_cle' && (
                <div style={{display:'flex', flexDirection:'column', gap:16}}>
                  <div style={{fontSize:13, color:'var(--ink-500)'}}>{elementSelectionne.data.client?.prenom} {elementSelectionne.data.client?.nom}</div>
                  <div><label className={labelCls}>🏗 Démarrage</label><input type="date" value={formDateCle.date_demarrage_chantier} onChange={e => setFormDateCle(f => ({ ...f, date_demarrage_chantier: e.target.value }))} className={inputCls} style={{marginTop:6}}/></div>
                  <div><label className={labelCls}>🏁 Fin</label><input type="date" value={formDateCle.date_fin_chantier} onChange={e => setFormDateCle(f => ({ ...f, date_fin_chantier: e.target.value }))} className={inputCls} style={{marginTop:6}}/></div>
                  <div style={{display:'flex', gap:8, paddingTop:4}}>
                    <button onClick={fermerModal} className="btn btn-ghost" style={{flex:1}}>Annuler</button>
                    <button onClick={sauvegarderDateCle} disabled={saving} className="btn btn-primary" style={{flex:1, opacity: saving ? 0.5 : 1}}>
                      {saving ? 'Enregistrement…' : 'Enregistrer'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── QUICK MENU (clic sur une date) ─────────────────────────────────── */}
      {quickMenu && (
        <>
          <div style={{position:'fixed', inset:0, zIndex:40}} onClick={() => setQuickMenu(null)} />
          <div className="card" style={{position:'fixed', zIndex:50, minWidth:180, overflow:'hidden', padding:0, top: quickMenu.y + 8, left: quickMenu.x}}>
            <div className="eyebrow" style={{padding:'12px 16px 6px'}}>
              {new Date(quickMenu.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
            </div>
            <button onClick={() => ouvrirDepuisMenu('rdv')}
              className="row-hover"
              style={{width:'100%', textAlign:'left', padding:'10px 16px', fontSize:13, fontWeight:500, color:'var(--ink-700)', background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:10}}>
              <span style={{width:20, height:20, borderRadius:6, display:'grid', placeItems:'center', color:'#fff', fontSize:11, fontWeight:700, background:COLORS.blue, flexShrink:0}}>R</span>
              Rendez-vous
            </button>
            <button onClick={() => ouvrirDepuisMenu('intervention')}
              className="row-hover"
              style={{width:'100%', textAlign:'left', padding:'10px 16px', fontSize:13, fontWeight:500, color:'var(--ink-700)', background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:10, borderTop:'1px solid var(--ink-100)'}}>
              <span style={{width:20, height:20, borderRadius:6, display:'grid', placeItems:'center', color:'#fff', fontSize:11, fontWeight:700, background:COLORS.teal, flexShrink:0}}>I</span>
              Intervention artisan
            </button>
          </div>
        </>
      )}
    </div>
  )
}
