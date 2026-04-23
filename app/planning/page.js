'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
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
  visite_technique_client:  { label: 'R1 — Visite client',      short: 'R1', color: COLORS.blue,   bg: '#EFF6FF' },
  visite_technique_artisan: { label: 'R2 — Visite artisan',     short: 'R2', color: COLORS.teal,   bg: '#F0FDF9' },
  presentation_devis:       { label: 'R3 — Présentation devis', short: 'R3', color: COLORS.amber,  bg: '#FFFBEB' },
}

const ARTISAN_COLORS = [COLORS.violet, COLORS.coral, COLORS.mint, COLORS.gold, COLORS.sky, COLORS.teal, '#9333EA', '#0891B2']

const fmtDate    = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '—'
const fmtHeure   = (d) => d ? new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—'
const fmtDateLong = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '—'

export default function Planning() {
  const [rdvs, setRdvs]                   = useState([])
  const [interventions, setInterventions] = useState([])
  const [profile, setProfile]             = useState(null)
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
  const [quickMenu, setQuickMenu]             = useState(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 640) {
      setCalendarView('listWeek')
    }
  }, [])

  const [formRdv, setFormRdv] = useState({
    dossier_id: '', type_rdv: 'visite_technique_client',
    date_heure: '', duree_minutes: 60, artisan_id: '', notes: '',
  })
  const [formIntervention, setFormIntervention] = useState({
    dossier_id: '', artisan_id: '', type_intervention: 'periode',
    date_debut: '', date_fin: '', jours_specifiques: [], notes: '',
  })
  const [formDateCle, setFormDateCle] = useState({ date_demarrage_chantier: '', date_fin_chantier: '' })

  const router = useRouter()

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
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profData } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(profData)
      await chargerTout()
      try {
        const res = await fetch(`/api/google/calendar/sync?userId=${profData.id}`)
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
  }, [router])

  const couleurArtisan = useCallback((artisanId) => {
    const idx = artisans.findIndex(a => a.id === artisanId)
    return ARTISAN_COLORS[idx % ARTISAN_COLORS.length] || COLORS.slate
  }, [artisans])

  // ── ÉVÉNEMENTS CALENDRIER ──────────────────────────────────────────────────

  const evenementsRdv = rdvs
    .filter(r => vue === 'tous' || (vue === 'moi' && r.dossier?.referente_id === profile?.id) || (vue === 'artisan' && r.artisan_id))
    .filter(r => !typeFiltre   || r.type_rdv === typeFiltre)
    .filter(r => !artisanFiltre || r.artisan_id === artisanFiltre)
    .filter(r => !agenteFiltre  || r.dossier?.referente_id === agenteFiltre)
    .map(r => {
      const cfg = TYPE_CONFIG[r.type_rdv] || TYPE_CONFIG.visite_technique_client
      const client = `${r.dossier?.client?.prenom || ''} ${r.dossier?.client?.nom || ''}`.trim()
      const titre = r.type_rdv === 'visite_technique_artisan'
        ? `${cfg.short} · ${client} × ${r.artisan?.entreprise || ''}`
        : `${cfg.short} · ${client}`
      return {
        id: 'rdv-' + r.id, title: titre,
        start: r.date_heure,
        end: new Date(new Date(r.date_heure).getTime() + (r.duree_minutes || 60) * 60000).toISOString(),
        backgroundColor: cfg.color, borderColor: cfg.color, textColor: '#fff',
        extendedProps: { type: 'rdv', data: r, cfg },
      }
    })

  const evenementsInterventions = interventions
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
      return (i.jours_specifiques || []).map((jour, idx) => ({
        id: 'int-' + i.id + '-' + idx, title: titre, start: jour,
        backgroundColor: color + '28', borderColor: color, textColor: color,
        allDay: true, extendedProps: { type: 'intervention', data: i }
      }))
    })

  const evenementsDates = dossiers
    .filter(d => !agenteFiltre || d.referente_id === agenteFiltre)
    .flatMap(d => {
      const evts = []
      if (d.date_demarrage_chantier) evts.push({ id: 'start-' + d.id, title: `▶ ${d.reference}`, start: d.date_demarrage_chantier, allDay: true, backgroundColor: '#ECFDF5', borderColor: COLORS.mint, textColor: COLORS.mint, extendedProps: { type: 'date_cle', data: d } })
      if (d.date_fin_chantier) evts.push({ id: 'end-' + d.id, title: `■ ${d.reference}`, start: d.date_fin_chantier, allDay: true, backgroundColor: '#FFF7ED', borderColor: COLORS.amber, textColor: COLORS.gold, extendedProps: { type: 'date_cle', data: d } })
      return evts
    })

  const tousEvenements = [...evenementsRdv, ...evenementsInterventions, ...evenementsDates]

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
    if (type === 'rdv') setFormRdv({ dossier_id: data.dossier_id, type_rdv: data.type_rdv, date_heure: data.date_heure?.slice(0, 16), duree_minutes: data.duree_minutes || 60, artisan_id: data.artisan_id || '', notes: data.notes || '' })
    else if (type === 'intervention') setFormIntervention({ dossier_id: data.dossier_id, artisan_id: data.artisan_id, type_intervention: data.type_intervention, date_debut: data.date_debut || '', date_fin: data.date_fin || '', jours_specifiques: data.jours_specifiques || [], notes: data.notes || '' })
    else if (type === 'date_cle') setFormDateCle({ date_demarrage_chantier: data.date_demarrage_chantier || '', date_fin_chantier: data.date_fin_chantier || '' })
    setModalOuvert(true)
  }

  const ouvrirSidebar = (item) => {
    setElementSelectionne({ type: item.type, data: item.data })
    setModalType(item.type); setModeEdition(false)
    if (item.type === 'rdv') setFormRdv({ dossier_id: item.data.dossier_id, type_rdv: item.data.type_rdv, date_heure: item.data.date_heure?.slice(0, 16), duree_minutes: item.data.duree_minutes || 60, artisan_id: item.data.artisan_id || '', notes: item.data.notes || '' })
    else if (item.type === 'intervention') setFormIntervention({ dossier_id: item.data.dossier_id, artisan_id: item.data.artisan_id, type_intervention: item.data.type_intervention, date_debut: item.data.date_debut || '', date_fin: item.data.date_fin || '', jours_specifiques: item.data.jours_specifiques || [], notes: item.data.notes || '' })
    setModalOuvert(true)
  }

  const fermerModal = () => {
    setModalOuvert(false); setElementSelectionne(null); setModeEdition(false); setErreur('')
    setFormRdv({ dossier_id: '', type_rdv: 'visite_technique_client', date_heure: '', duree_minutes: 60, artisan_id: '', notes: '' })
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
    const payload = { type_rdv: formRdv.type_rdv, date_heure: formRdv.date_heure, duree_minutes: parseInt(formRdv.duree_minutes), artisan_id: formRdv.artisan_id || null, notes: formRdv.notes || null }
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
    await chargerTout(); fermerModal(); setSaving(false)
  }

  const sauvegarderIntervention = async () => {
    if (!formIntervention.artisan_id) return
    setSaving(true); setErreur('')
    const payload = { dossier_id: formIntervention.dossier_id, artisan_id: formIntervention.artisan_id, type_intervention: formIntervention.type_intervention, date_debut: formIntervention.date_debut || null, date_fin: formIntervention.type_intervention === 'periode' ? formIntervention.date_fin || null : null, jours_specifiques: formIntervention.type_intervention === 'jours_specifiques' ? formIntervention.jours_specifiques : null, notes: formIntervention.notes || null }
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
    await chargerTout(); fermerModal(); setSaving(false)
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
    await chargerTout(); fermerModal()
  }

  const syncGoogle = async () => {
    setSyncing(true); setSyncMessage('')
    try {
      const res = await fetch('/api/google/calendar/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: profile?.id }) })
      const data = await res.json()
      if (!res.ok) {
        setSyncMessage(`❌ ${data.error || 'Erreur de synchronisation'}`)
      } else if (data.hasErrors && !data.pushed && !data.updated && !data.pulled && !data.deleted) {
        setSyncMessage(`❌ ${data.message}`)
      } else {
        setSyncMessage(`✅ ${data.message}`)
        if (data.deleted > 0 || data.pulled > 0) await chargerTout()
      }
    } catch { setSyncMessage('❌ Google Calendar non configuré') }
    setSyncing(false)
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F1F5F9' }}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-blue-200 border-t-blue-700 animate-spin" />
        <p className="text-sm text-slate-400 tracking-wide">Chargement du planning…</p>
      </div>
    </div>
  )

  const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
  const labelCls = "block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5"

  return (
    <div className="min-h-screen" style={{ background: '#F1F5F9' }}>

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header style={{ background: COLORS.navy }} className="px-4 sm:px-6 py-3 sticky top-0 z-40">
        <div className="max-w-screen-2xl mx-auto space-y-2">

          {/* Ligne 1 : nav + boutons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-4">
              {/* Bouton sidebar — mobile uniquement */}
              <button onClick={() => setSidebarOuverte(o => !o)}
                className="sm:hidden text-blue-300 hover:text-white p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <button onClick={() => router.push('/dashboard')} className="text-blue-300 hover:text-white text-sm transition-colors hidden sm:block">← Retour</button>
              <div className="h-4 w-px bg-blue-800 hidden sm:block" />
              <h1 className="text-white font-bold tracking-tight text-sm sm:text-base">Planning</h1>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              {googleConnected ? (
                <button onClick={syncGoogle} disabled={syncing}
                  className="flex items-center gap-1.5 text-xs px-2 sm:px-3 py-1.5 rounded-lg border border-emerald-500 text-emerald-300 hover:bg-emerald-900 transition-all disabled:opacity-50">
                  <span className={`w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0 ${syncing ? 'animate-pulse' : ''}`} />
                  <span className="hidden sm:inline">{syncing ? 'Sync…' : 'Google Calendar'}</span>
                  <span className="sm:hidden">{syncing ? '…' : '📅'}</span>
                </button>
              ) : (
                <a href={`/api/auth/google?userId=${profile?.id}`}
                  className="flex items-center gap-1.5 text-xs px-2 sm:px-3 py-1.5 rounded-lg border border-blue-600 text-blue-300 hover:bg-blue-800 transition-all">
                  <span className="hidden sm:inline">📅 Google Calendar</span>
                  <span className="sm:hidden">📅</span>
                </a>
              )}
              <div className="h-4 w-px bg-blue-800 hidden sm:block" />
              <button onClick={() => { setModalType('intervention'); setElementSelectionne(null); setModeEdition(false); setModalOuvert(true) }}
                className="text-xs px-2.5 sm:px-3 py-1.5 rounded-lg border border-blue-500 text-white hover:bg-blue-800 transition-all">
                + <span className="hidden sm:inline">Intervention</span><span className="sm:hidden">Int.</span>
              </button>
              <button onClick={() => { setModalType('rdv'); setElementSelectionne(null); setModeEdition(false); setModalOuvert(true) }}
                className="text-xs px-3 sm:px-4 py-1.5 rounded-lg font-semibold text-white transition-all shadow-sm"
                style={{ background: COLORS.blue }}>
                + RDV
              </button>
            </div>
          </div>

          {/* Ligne 2 : filtres */}
          <div className="flex items-center gap-2 pb-0.5 overflow-x-auto scrollbar-none">

            {/* Vue */}
            <div className="flex gap-0.5 rounded-lg p-0.5" style={{ background: 'rgba(255,255,255,0.08)' }}>
              {[{ k: 'tous', l: 'Tous' }, { k: 'moi', l: 'Mes RDV' }, { k: 'artisan', l: 'Avec artisans' }].map(({ k, l }) => (
                <button key={k} onClick={() => setVue(k)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${vue === k ? 'bg-blue-600 text-white shadow' : 'text-blue-300 hover:text-white'}`}>
                  {l}
                </button>
              ))}
            </div>

            <div className="h-4 w-px bg-blue-800" />

            {/* Type RDV */}
            <div className="flex gap-0.5 rounded-lg p-0.5" style={{ background: 'rgba(255,255,255,0.08)' }}>
              {[{ k: '', l: 'Tous types' }, { k: 'visite_technique_client', l: 'R1' }, { k: 'visite_technique_artisan', l: 'R2' }, { k: 'presentation_devis', l: 'R3' }].map(({ k, l }) => (
                <button key={k} onClick={() => setTypeFiltre(k)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${typeFiltre === k ? 'bg-blue-600 text-white shadow' : 'text-blue-300 hover:text-white'}`}>
                  {l}
                </button>
              ))}
            </div>

            <div className="h-4 w-px bg-blue-800" />

            {/* Filtre agente (admin seulement) */}
            {profile?.role === 'admin' && (
              <select value={agenteFiltre} onChange={e => setAgenteFiltre(e.target.value)}
                className="text-xs rounded-lg px-3 py-1.5 focus:outline-none font-medium border-0 focus:ring-1 focus:ring-blue-400"
                style={{ background: 'rgba(255,255,255,0.12)', color: '#93C5FD' }}>
                <option value="" style={{ background: COLORS.navy }}>Toute l'agence</option>
                {agentes.map(a => <option key={a.id} value={a.id} style={{ background: COLORS.navy }}>{a.prenom} {a.nom}</option>)}
              </select>
            )}

            {/* Filtre artisan */}
            <select value={artisanFiltre} onChange={e => setArtisanFiltre(e.target.value)}
              className="text-xs rounded-lg px-3 py-1.5 focus:outline-none font-medium border-0 focus:ring-1 focus:ring-blue-400"
              style={{ background: 'rgba(255,255,255,0.12)', color: '#93C5FD' }}>
              <option value="" style={{ background: COLORS.navy }}>Tous les artisans</option>
              {artisans.map(a => <option key={a.id} value={a.id} style={{ background: COLORS.navy }}>{a.entreprise}</option>)}
            </select>

            {/* Reset filtres */}
            {(typeFiltre || artisanFiltre || agenteFiltre || vue !== 'tous') && (
              <button onClick={() => { setTypeFiltre(''); setArtisanFiltre(''); setAgenteFiltre(''); setVue('tous') }}
                className="text-xs text-blue-400 hover:text-white transition-colors underline underline-offset-2">
                Réinitialiser
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── SYNC MESSAGE ───────────────────────────────────────────────────── */}
      {syncMessage && (
        <div className={`text-xs px-6 py-2.5 flex items-center justify-between border-b ${syncMessage.startsWith('✅') ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
          <span className="font-medium">{syncMessage}</span>
          <button onClick={() => setSyncMessage('')} className="ml-4 opacity-40 hover:opacity-100 text-lg leading-none">×</button>
        </div>
      )}

      {/* ── LAYOUT ─────────────────────────────────────────────────────────── */}
      <div className="max-w-screen-2xl mx-auto px-2 sm:px-4 py-4 sm:flex gap-4">

        {/* ── SIDEBAR ──────────────────────────────────────────────────────── */}
        <aside className={`w-full sm:w-72 sm:flex-shrink-0 space-y-3 mb-4 sm:mb-0 ${sidebarOuverte ? 'block' : 'hidden'} sm:block`}>

          {/* Recherche */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm select-none"></span>
            <input value={recherche} onChange={e => setRecherche(e.target.value)}
              placeholder="      Rechercher client, artisan…"
              className="w-full pl-9 pr-9 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" />
            {recherche && (
              <button onClick={() => setRecherche('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-base leading-none">×</button>
            )}
          </div>

          {/* Légende */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Légende</p>
            <div className="space-y-2.5">
              {Object.entries(TYPE_CONFIG).map(([, cfg]) => (
                <div key={cfg.label} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded flex-shrink-0 flex items-center justify-center text-white text-xs font-bold" style={{ background: cfg.color }}>
                    {cfg.short}
                  </div>
                  <span className="text-xs text-slate-600">{cfg.label}</span>
                </div>
              ))}
              <div className="border-t border-slate-100 pt-2.5 mt-1 space-y-2">
                {[
                  { icon: '🔨', label: 'Intervention artisan', border: COLORS.violet, bg: COLORS.violet + '20', color: COLORS.violet },
                  { icon: '▶',  label: 'Démarrage chantier',  border: COLORS.mint,   bg: '#ECFDF5',           color: COLORS.mint },
                  { icon: '■',  label: 'Fin de chantier',      border: COLORS.amber,  bg: '#FFF7ED',           color: COLORS.amber },
                ].map(({ icon, label, border, bg, color }) => (
                  <div key={label} className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded flex-shrink-0 border-2 flex items-center justify-center text-xs font-bold"
                      style={{ borderColor: border, background: bg, color }}>
                      {icon}
                    </div>
                    <span className="text-xs text-slate-600">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Agenda À venir */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between" style={{ background: '#F8FAFC' }}>
              <p className="text-xs font-bold text-slate-700 uppercase tracking-widest">À venir</p>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: COLORS.blue + '15', color: COLORS.blue }}>
                {agendaItems.length} évén.
              </span>
            </div>
            <div className="divide-y divide-slate-50 max-h-80 overflow-y-auto">
              {agendaItems.length === 0 && (
                <div className="px-4 py-8 text-center">
                  <p className="text-xs text-slate-400">{recherche ? 'Aucun résultat' : 'Aucun événement à venir'}</p>
                </div>
              )}
              {agendaItems.map(item => (
                <button key={item.id + item.type} onClick={() => ouvrirSidebar(item)}
                  className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors group">
                  <div className="flex items-start gap-3">
                    <div className="w-1 rounded-full mt-1 self-stretch flex-shrink-0" style={{ background: item.color, minHeight: 28 }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate group-hover:text-blue-700 transition-colors">{item.titre}</p>
                      <p className="text-xs text-slate-400 mt-0.5 truncate">{item.sous}</p>
                      <p className="text-xs font-bold mt-1" style={{ color: item.color }}>{fmtDate(item.date)}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'RDV ce mois', value: rdvs.filter(r => { const d = new Date(r.date_heure), m = new Date(); return d.getMonth() === m.getMonth() && d.getFullYear() === m.getFullYear() }).length, color: COLORS.blue },
              { label: 'Interventions', value: interventions.length, color: COLORS.violet },
              { label: 'Chantiers actifs', value: dossiers.filter(d => d.date_demarrage_chantier && !d.date_fin_chantier).length, color: COLORS.mint},
              { label: 'À venir 30j', value: agendaItems.length, color: COLORS.amber },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm text-center">
                <p className="text-xl font-bold leading-none" style={{ color }}>{value}</p>
                <p className="text-xs text-slate-400 mt-1 leading-tight">{label}</p>
              </div>
            ))}
          </div>
        </aside>

        {/* ── CALENDRIER ───────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 w-full">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(11,45,94,0.65)', backdropFilter: 'blur(6px)' }}
          onClick={fermerModal}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
            style={{ boxShadow: '0 25px 70px rgba(11,45,94,0.3)' }}
            onClick={e => e.stopPropagation()}>

            {/* Header modal */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between"
              style={{ background: elementSelectionne?.type === 'rdv' ? (TYPE_CONFIG[elementSelectionne.data.type_rdv]?.bg || '#F8FAFC') : '#F8FAFC' }}>
              <div>
                {elementSelectionne?.type === 'rdv' && !modeEdition && (() => {
                  const cfg = TYPE_CONFIG[elementSelectionne.data.type_rdv]
                  return <>
                    <div className="flex items-center gap-2 mb-0.5">
                      <div className="w-5 h-5 rounded flex items-center justify-center text-white text-xs font-bold" style={{ background: cfg?.color }}>{cfg?.short}</div>
                      <p className="text-xs font-bold uppercase tracking-widest" style={{ color: cfg?.color }}>{cfg?.label}</p>
                    </div>
                    <h2 className="font-bold text-slate-800 text-base">{elementSelectionne.data.dossier?.client?.prenom} {elementSelectionne.data.dossier?.client?.nom}</h2>
                  </>
                })()}
                {elementSelectionne?.type === 'intervention' && !modeEdition && <>
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-0.5">Intervention artisan</p>
                  <h2 className="font-bold text-slate-800 text-base">{elementSelectionne.data.artisan?.entreprise}</h2>
                </>}
                {elementSelectionne?.type === 'date_cle' && <>
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-0.5">Dates chantier</p>
                  <h2 className="font-bold text-slate-800 text-base">{elementSelectionne.data.reference}</h2>
                </>}
                {!elementSelectionne && modalType === 'rdv' && <h2 className="font-bold text-slate-800 text-base">Nouveau rendez-vous</h2>}
                {!elementSelectionne && modalType === 'intervention' && <h2 className="font-bold text-slate-800 text-base">Nouvelle intervention artisan</h2>}
              </div>
              <button onClick={fermerModal} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all text-xl leading-none">×</button>
            </div>

            <div className="p-6 space-y-4">
              {erreur && <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2 rounded-lg">{erreur}</div>}

              {/* Détail RDV */}
              {elementSelectionne?.type === 'rdv' && !modeEdition && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 rounded-xl p-3"><p className={labelCls}>Chantier</p><p className="text-sm font-semibold text-slate-800">{elementSelectionne.data.dossier?.reference}</p></div>
                    <div className="bg-slate-50 rounded-xl p-3"><p className={labelCls}>Durée</p><p className="text-sm font-semibold text-slate-800">{elementSelectionne.data.duree_minutes} min</p></div>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className={labelCls}>Date & heure</p>
                    <p className="text-sm font-semibold text-slate-800 capitalize">{fmtDateLong(elementSelectionne.data.date_heure)}</p>
                    <p className="text-xs text-slate-500 mt-0.5 font-medium">{fmtHeure(elementSelectionne.data.date_heure)}</p>
                  </div>
                  {elementSelectionne.data.artisan && <div className="bg-slate-50 rounded-xl p-3"><p className={labelCls}>Artisan présent</p><p className="text-sm font-semibold text-slate-800">{elementSelectionne.data.artisan.entreprise}</p></div>}
                  {elementSelectionne.data.notes && <div className="bg-slate-50 rounded-xl p-3"><p className={labelCls}>Notes</p><p className="text-sm text-slate-700">{elementSelectionne.data.notes}</p></div>}
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => setModeEdition(true)} className="flex-1 border border-slate-200 text-slate-700 py-2 rounded-xl text-sm font-medium hover:bg-slate-50 transition-all">Modifier</button>
                    <button onClick={() => router.push(`/chantiers/${elementSelectionne.data.dossier_id}`)} className="flex-1 py-2 rounded-xl text-sm font-semibold text-white transition-all" style={{ background: COLORS.blue }}>Voir le chantier →</button>
                    <button onClick={supprimer} className="px-3 py-2 rounded-xl text-sm text-red-500 border border-red-100 hover:bg-red-50 transition-all">🗑</button>
                  </div>
                </div>
              )}

              {/* Détail Intervention */}
              {elementSelectionne?.type === 'intervention' && !modeEdition && (
                <div className="space-y-3">
                  <div className="bg-slate-50 rounded-xl p-3"><p className={labelCls}>Chantier</p><p className="text-sm font-semibold text-slate-800">{elementSelectionne.data.dossier?.reference} — {elementSelectionne.data.dossier?.client?.prenom} {elementSelectionne.data.dossier?.client?.nom}</p></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 rounded-xl p-3"><p className={labelCls}>Type</p><p className="text-sm font-semibold text-slate-800">{elementSelectionne.data.type_intervention === 'periode' ? 'Période continue' : 'Jours spécifiques'}</p></div>
                    <div className="bg-slate-50 rounded-xl p-3">
                      {elementSelectionne.data.type_intervention === 'periode' ? (<><p className={labelCls}>Période</p><p className="text-xs font-semibold text-slate-800">{fmtDate(elementSelectionne.data.date_debut)} → {fmtDate(elementSelectionne.data.date_fin)}</p></>) : (<><p className={labelCls}>Jours</p><p className="text-sm font-semibold text-slate-800">{elementSelectionne.data.jours_specifiques?.length || 0} jour(s)</p></>)}
                    </div>
                  </div>
                  {elementSelectionne.data.notes && <div className="bg-slate-50 rounded-xl p-3"><p className={labelCls}>Notes</p><p className="text-sm text-slate-700">{elementSelectionne.data.notes}</p></div>}
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => setModeEdition(true)} className="flex-1 border border-slate-200 text-slate-700 py-2 rounded-xl text-sm font-medium hover:bg-slate-50">Modifier</button>
                    <button onClick={() => router.push(`/chantiers/${elementSelectionne.data.dossier_id}`)} className="flex-1 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: COLORS.blue }}>Voir le chantier →</button>
                    <button onClick={supprimer} className="px-3 py-2 rounded-xl text-sm text-red-500 border border-red-100 hover:bg-red-50">🗑</button>
                  </div>
                </div>
              )}

              {/* Formulaire RDV */}
              {(modalType === 'rdv' || (elementSelectionne?.type === 'rdv' && modeEdition)) && (!elementSelectionne || modeEdition) && (
                <div className="space-y-4">
                  <div><label className={labelCls}>Type de rendez-vous</label>
                    <select value={formRdv.type_rdv} onChange={e => setFormRdv(f => ({ ...f, type_rdv: e.target.value }))} className={inputCls}>
                      <option value="visite_technique_client">R1 — Visite technique client</option>
                      <option value="visite_technique_artisan">R2 — Visite technique avec artisan</option>
                      <option value="presentation_devis">R3 — Présentation devis</option>
                    </select>
                  </div>
                  {!modeEdition && <div><label className={labelCls}>Chantier *</label>
                    <select value={formRdv.dossier_id} onChange={e => setFormRdv(f => ({ ...f, dossier_id: e.target.value }))} className={inputCls}>
                      <option value="">— Choisir un chantier —</option>
                      {dossiers.map(d => <option key={d.id} value={d.id}>{d.reference} — {d.client?.prenom} {d.client?.nom}</option>)}
                    </select>
                  </div>}
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className={labelCls}>Date et heure *</label><input type="datetime-local" value={formRdv.date_heure} onChange={e => setFormRdv(f => ({ ...f, date_heure: e.target.value }))} className={inputCls} /></div>
                    <div><label className={labelCls}>Durée</label>
                      <select value={formRdv.duree_minutes} onChange={e => setFormRdv(f => ({ ...f, duree_minutes: e.target.value }))} className={inputCls}>
                        <option value={30}>30 min</option><option value={60}>1h</option><option value={90}>1h30</option><option value={120}>2h</option><option value={180}>3h</option>
                      </select>
                    </div>
                  </div>
                  {formRdv.type_rdv === 'visite_technique_artisan' && <div><label className={labelCls}>Artisan</label>
                    <select value={formRdv.artisan_id} onChange={e => setFormRdv(f => ({ ...f, artisan_id: e.target.value }))} className={inputCls}>
                      <option value="">— Choisir —</option>
                      {artisans.map(a => <option key={a.id} value={a.id}>{a.entreprise}</option>)}
                    </select>
                  </div>}
                  <div><label className={labelCls}>Notes</label><textarea value={formRdv.notes} onChange={e => setFormRdv(f => ({ ...f, notes: e.target.value }))} rows={2} className={inputCls} /></div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={fermerModal} className="flex-1 border border-slate-200 text-slate-700 py-2 rounded-xl text-sm font-medium hover:bg-slate-50">Annuler</button>
                    <button onClick={sauvegarderRdv} disabled={(!formRdv.dossier_id && !modeEdition) || !formRdv.date_heure || saving} className="flex-1 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: COLORS.blue }}>
                      {saving ? 'Enregistrement…' : modeEdition ? 'Enregistrer' : 'Créer le RDV'}
                    </button>
                  </div>
                </div>
              )}

              {/* Formulaire Intervention */}
              {(modalType === 'intervention' || (elementSelectionne?.type === 'intervention' && modeEdition)) && (!elementSelectionne || modeEdition) && (
                <div className="space-y-4">
                  {!modeEdition && <div><label className={labelCls}>Chantier *</label>
                    <select value={formIntervention.dossier_id} onChange={e => setFormIntervention(f => ({ ...f, dossier_id: e.target.value }))} className={inputCls}>
                      <option value="">— Choisir un chantier —</option>
                      {dossiers.map(d => <option key={d.id} value={d.id}>{d.reference} — {d.client?.prenom} {d.client?.nom}</option>)}
                    </select>
                  </div>}
                  <div><label className={labelCls}>Artisan *</label>
                    <select value={formIntervention.artisan_id} onChange={e => setFormIntervention(f => ({ ...f, artisan_id: e.target.value }))} className={inputCls}>
                      <option value="">— Choisir —</option>
                      {(formIntervention.dossier_id ? devis.filter(d => d.dossier_id === formIntervention.dossier_id).map(d => d.artisan).filter(Boolean) : artisans).map(a => (
                        <option key={a.id} value={a.id}>{a.entreprise}</option>
                      ))}
                    </select>
                  </div>
                  <div><label className={labelCls}>Type d'intervention</label>
                    <div className="flex gap-4">
                      {[{ v: 'periode', l: 'Période continue' }, { v: 'jours_specifiques', l: 'Jours spécifiques' }].map(({ v, l }) => (
                        <label key={v} className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" name="type_int" value={v} checked={formIntervention.type_intervention === v} onChange={e => setFormIntervention(f => ({ ...f, type_intervention: e.target.value, jours_specifiques: [] }))} className="accent-blue-700" />
                          <span className="text-sm text-slate-700">{l}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  {formIntervention.type_intervention === 'periode' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className={labelCls}>Début</label><input type="date" value={formIntervention.date_debut} onChange={e => setFormIntervention(f => ({ ...f, date_debut: e.target.value }))} className={inputCls} /></div>
                      <div><label className={labelCls}>Fin</label><input type="date" value={formIntervention.date_fin} onChange={e => setFormIntervention(f => ({ ...f, date_fin: e.target.value }))} className={inputCls} /></div>
                    </div>
                  )}
                  {formIntervention.type_intervention === 'jours_specifiques' && (
                    <div>
                      <label className={labelCls}>Ajouter des jours</label>
                      <input type="date" className={inputCls} onChange={e => { const d = e.target.value; if (!d) return; setFormIntervention(f => ({ ...f, jours_specifiques: f.jours_specifiques.includes(d) ? f.jours_specifiques.filter(j => j !== d) : [...f.jours_specifiques, d].sort() })); e.target.value = '' }} />
                      {formIntervention.jours_specifiques.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {formIntervention.jours_specifiques.map(j => (
                            <span key={j} className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-medium" style={{ background: COLORS.blue + '15', color: COLORS.blue }}>
                              {fmtDate(j)}
                              <button onClick={() => setFormIntervention(f => ({ ...f, jours_specifiques: f.jours_specifiques.filter(d => d !== j) }))} className="ml-0.5 opacity-50 hover:opacity-100">×</button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div><label className={labelCls}>Notes</label><textarea value={formIntervention.notes} onChange={e => setFormIntervention(f => ({ ...f, notes: e.target.value }))} rows={2} className={inputCls} /></div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={fermerModal} className="flex-1 border border-slate-200 text-slate-700 py-2 rounded-xl text-sm font-medium hover:bg-slate-50">Annuler</button>
                    <button onClick={sauvegarderIntervention} disabled={(!formIntervention.dossier_id && !modeEdition) || !formIntervention.artisan_id || saving} className="flex-1 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: COLORS.teal }}>
                      {saving ? 'Enregistrement…' : modeEdition ? 'Enregistrer' : 'Planifier'}
                    </button>
                  </div>
                </div>
              )}

              {/* Dates clés */}
              {elementSelectionne?.type === 'date_cle' && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-500">{elementSelectionne.data.client?.prenom} {elementSelectionne.data.client?.nom}</p>
                  <div><label className={labelCls}>🏗 Démarrage</label><input type="date" value={formDateCle.date_demarrage_chantier} onChange={e => setFormDateCle(f => ({ ...f, date_demarrage_chantier: e.target.value }))} className={inputCls} /></div>
                  <div><label className={labelCls}>🏁 Fin</label><input type="date" value={formDateCle.date_fin_chantier} onChange={e => setFormDateCle(f => ({ ...f, date_fin_chantier: e.target.value }))} className={inputCls} /></div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={fermerModal} className="flex-1 border border-slate-200 text-slate-700 py-2 rounded-xl text-sm font-medium hover:bg-slate-50">Annuler</button>
                    <button onClick={sauvegarderDateCle} disabled={saving} className="flex-1 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: COLORS.blue }}>
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
          <div className="fixed inset-0 z-40" onClick={() => setQuickMenu(null)} />
          <div className="fixed z-50 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden"
            style={{ top: quickMenu.y + 8, left: quickMenu.x, minWidth: 180 }}>
            <p className="px-4 pt-3 pb-1.5 text-xs font-bold text-slate-400 uppercase tracking-widest">
              {new Date(quickMenu.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
            </p>
            <button onClick={() => ouvrirDepuisMenu('rdv')}
              className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2.5 transition-colors">
              <span className="w-5 h-5 rounded flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ background: COLORS.blue }}>R</span>
              Rendez-vous
            </button>
            <button onClick={() => ouvrirDepuisMenu('intervention')}
              className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-teal-50 hover:text-teal-700 flex items-center gap-2.5 transition-colors border-t border-slate-100">
              <span className="w-5 h-5 rounded flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ background: COLORS.teal }}>I</span>
              Intervention artisan
            </button>
          </div>
        </>
      )}
    </div>
  )
}
