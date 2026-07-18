'use client'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '../lib/auth-context'
import { authHeaders } from '../lib/api-auth-client'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import luxonPlugin from '@fullcalendar/luxon3'
import frLocale from '@fullcalendar/core/locales/fr'
import { parisLocalToInstant, instantToParisLocal } from '../lib/dates'
import { determinerAgenceConcernee, resoudreCibleDefaut, libelleCible } from '../lib/cibles'

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
  visite_technique_client:  { label: 'R1 — Visite client',      short: 'R1',     color: COLORS.blue,   bg: '#EFF6FF' },
  visite_technique_artisan: { label: 'R2 — Visite artisan',     short: 'R2',     color: COLORS.teal,   bg: '#F0FDF9' },
  presentation_devis:       { label: 'R3 — Présentation devis', short: 'R3',     color: COLORS.amber,  bg: '#FFFBEB' },
  suivi:                    { label: 'Suivi de chantier',       short: 'Suivi',  color: COLORS.violet, bg: '#F5F3FF' },
  reception:                { label: 'Réception',               short: 'Récept.',color: COLORS.mint,   bg: '#ECFDF5' },
  etude:                    { label: 'Étude/conception',        short: 'Étude',  color: COLORS.coral,  bg: '#FEF2F2' },
  autres:                   { label: 'Autre RDV',               short: 'Autre',  color: '#64748B',     bg: '#F8FAFC' },
}

const ARTISAN_COLORS = [COLORS.violet, COLORS.coral, COLORS.mint, COLORS.gold, COLORS.sky, COLORS.teal, '#9333EA', '#0891B2']

// date_heure est désormais un timestamptz (ISO offsetté) → new Date(d) donne le bon
// instant ; on force l'affichage en Europe/Paris. (Sur les dates `date` pures des
// interventions, ce pin Paris ne décale pas le jour pour un usage FR.)
// ⚠️ Ne PAS passer par lib/dates.parseUTC : il ajoute 'Z' et casserait une valeur déjà suffixée +00:00.
const fmtDate    = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', timeZone: 'Europe/Paris' }) : '—'
const fmtHeure   = (d) => d ? new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }) : '—'
const fmtDateLong = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }) : '—'

export default function Planning() {
  const [rdvs, setRdvs]                   = useState([])
  const [interventions, setInterventions] = useState([])
  const [dossiers, setDossiers]           = useState([])
  const [artisans, setArtisans]           = useState([])
  const [agentes, setAgentes]             = useState([])
  const [agences, setAgences]             = useState([])
  const [cibles, setCibles]               = useState([])
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
  const [fournisseursConnectes, setFournisseursConnectes] = useState([])
  const [syncMessage, setSyncMessage]         = useState('')
  const [calendarView, setCalendarView]       = useState('timeGridWeek')
  const [quickMenu, setQuickMenu]             = useState(null) // { date, x, y }

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 640) {
      setCalendarView('listWeek')
    }
  }, [])

  const [formRdv, setFormRdv] = useState({
    dossier_id: '', type_rdv: 'visite_technique_client',
    date_heure: '', duree_minutes: 60, artisan_id: '', notes: '', titre: '', agence_id: '', cible_id: '',
  })
  const [formIntervention, setFormIntervention] = useState({
    dossier_id: '', artisan_id: '', type_intervention: 'periode',
    date_debut: '', date_fin: '', jours_specifiques: [], notes: '',
    heure_debut: '', duree_minutes: 60, agence_id: '', cible_id: '',
  })
  // Jour en cours de saisie pour le mode "jours spécifiques". Séparé de la liste :
  // ajouter un jour exige un clic explicite sur "Ajouter" -> naviguer dans le
  // calendrier natif (changer de mois) ne coche plus jamais un jour par accident.
  const [nouveauJour, setNouveauJour] = useState('')
  // Mémorise la dernière cible auto-résolue, pour ne pas écraser un choix manuel.
  const lastAutoCibleRdv = useRef('')
  const lastAutoCibleInt = useRef('')
  const [formDateCle, setFormDateCle] = useState({ date_demarrage_chantier: '', date_fin_chantier: '' })

  const router = useRouter()
  const { user, profile, initialized, agenceActive } = useAuth()

  const chargerTout = async () => {
    const [rdvRes, intRes, dosRes, artRes, devRes, agRes, agencesRes, ciblesRes] = await Promise.all([
      supabase.from('rendez_vous').select('*, dossier:dossiers(id, reference, referente_id, client:clients(civilite, prenom, nom)), artisan:artisans(id, entreprise)').order('date_heure'),
      supabase.from('interventions_artisans').select('*, dossier:dossiers(id, reference, referente_id, client:clients(civilite, prenom, nom)), artisan:artisans(id, entreprise)').order('date_debut'),
      supabase.from('dossiers').select('id, reference, referente_id, agence_id, date_demarrage_chantier, date_fin_chantier, client:clients(civilite, prenom, nom)').order('reference'),
      supabase.from('artisans').select('id, entreprise').order('entreprise'),
      supabase.from('devis_artisans').select('*, artisan:artisans(id, entreprise)'),
      supabase.from('profiles').select('id, prenom, nom, role').in('role', ['admin', 'agente']).order('prenom'),
      // Agences de la société (RLS agences_select_ma_societe filtre déjà) — pour le sélecteur admin
      supabase.from('agences').select('id, nom, code').order('nom'),
      // Cibles de calendrier visibles (RLS = perso ∪ agence ∪ admin-société) — pour le sélecteur calendrier
      supabase.from('cibles_calendrier').select('*').eq('actif', true).order('created_at'),
    ])
    // Masquage archive : on retire RDV/interventions rattachés à un dossier archivé,
    // tout en CONSERVANT ceux sans dossier (dossier?.archive === undefined → gardés :
    // RDV prospect/standalone). Condition de retrait stricte : dossier?.archive === true.
    setRdvs((rdvRes.data || []).filter(r => r.dossier?.archive !== true))
    setInterventions((intRes.data || []).filter(i => i.dossier?.archive !== true))
    setDossiers(dosRes.data || [])
    setArtisans(artRes.data || [])
    setDevis(devRes.data || [])
    setAgentes(agRes.data || [])
    setAgences(agencesRes.data || [])
    setCibles(ciblesRes.data || [])
  }

  useEffect(() => {
    if (!initialized) return
    if (!user) { router.push('/login'); return }
    if (!profile) return
    const init = async () => {
      await chargerTout()
      // Comptes calendrier connectés du user (PRÉSENCE du compte, pas l'expiry) :
      // Google = refresh_token présent ; iCloud = caldav_username présent. Alimente le
      // badge multi-fournisseur ET le gate de push (googleConnected = ≥ 1 fournisseur).
      try {
        const { data: comptesCal } = await supabase.from('comptes_oauth')
          .select('fournisseur, refresh_token, caldav_username').eq('user_id', profile.id)
        const f = []
        if ((comptesCal || []).some(c => c.fournisseur === 'google' && c.refresh_token)) f.push('google')
        if ((comptesCal || []).some(c => c.fournisseur === 'icloud' && c.caldav_username)) f.push('icloud')
        setFournisseursConnectes(f)
        setGoogleConnected(f.length > 0)
      } catch { setFournisseursConnectes([]); setGoogleConnected(false) }
      const params = new URLSearchParams(window.location.search)
      if (params.get('google') === 'connected') {
        setSyncMessage('✅ Google Calendar connecté avec succès !')
        setFournisseursConnectes(f => f.includes('google') ? f : [...f, 'google'])
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

  // Realtime : rafraîchit le planning quand rendez_vous / interventions_artisans
  // changent en base (utilisateur, autre agente, ou sync cron Google/iCloud entrante),
  // sans recharger la page. La RLS filtre déjà les lignes poussées (visibilité). On
  // réutilise chargerTout() via une ref (pour ne pas recréer le canal à chaque render),
  // débouncé à 500 ms : une rafale d'événements (ex. sync cron multi-lignes) ne déclenche
  // qu'UN seul re-fetch. Même pattern que la messagerie (removeChannel au cleanup).
  const chargerToutRef = useRef(chargerTout)
  useEffect(() => { chargerToutRef.current = chargerTout })
  const realtimeDebounceRef = useRef(null)
  useEffect(() => {
    if (!profile?.id) return
    const scheduleRefetch = () => {
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current)
      realtimeDebounceRef.current = setTimeout(() => { chargerToutRef.current() }, 500)
    }
    const channel = supabase
      .channel('planning')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rendez_vous' }, scheduleRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'interventions_artisans' }, scheduleRefetch)
      .subscribe()
    return () => {
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current)
      supabase.removeChannel(channel)
    }
  }, [profile?.id])

  const couleurArtisan = useCallback((artisanId) => {
    const idx = artisans.findIndex(a => a.id === artisanId)
    return ARTISAN_COLORS[idx % ARTISAN_COLORS.length] || COLORS.slate
  }, [artisans])

  // ── SCOPING MULTI-AGENCE (UX, pas sécurité — la RLS reste la frontière) ─────
  // RDV/interventions sont filles du dossier (pas d'agence_id propre) : le filtre
  // passe par le parent. agenceActive null = pas de filtre (Consolidé / agente).
  // Un item SANS dossier (transverse : RDV prospect/standalone) reste TOUJOURS visible.
  const matchAgence = useCallback(
    (item) => !agenceActive || !item.dossier_id || item.dossier?.agence_id === agenceActive,
    [agenceActive]
  )
  const rdvsScoped          = useMemo(() => rdvs.filter(matchAgence), [rdvs, matchAgence])
  const interventionsScoped = useMemo(() => interventions.filter(matchAgence), [interventions, matchAgence])
  // Les dossiers ont un agence_id propre (NOT NULL) → règle directe 4a, sans le cas
  // « transverse ». Source des jalons chantier, de la stat et des dropdowns de création.
  const dossiersScoped      = useMemo(
    () => (agenceActive ? dossiers.filter(d => d.agence_id === agenceActive) : dossiers),
    [dossiers, agenceActive]
  )

  // ── CALENDRIER (cible) : filtrage dossier modale + résolution du défaut ──────
  // En vue « toutes agences » (admin, agenceActive null), le sélecteur d'agence de
  // la modale réduit en plus la liste dossier. Sinon dossiersScoped (déjà filtré navbar).
  const dossiersRdvModale = useMemo(
    () => (profile?.role === 'admin' && agenceActive === null && formRdv.agence_id
      ? dossiersScoped.filter(d => d.agence_id === formRdv.agence_id) : dossiersScoped),
    [dossiersScoped, profile?.role, agenceActive, formRdv.agence_id]
  )
  const dossiersIntModale = useMemo(
    () => (profile?.role === 'admin' && agenceActive === null && formIntervention.agence_id
      ? dossiersScoped.filter(d => d.agence_id === formIntervention.agence_id) : dossiersScoped),
    [dossiersScoped, profile?.role, agenceActive, formIntervention.agence_id]
  )
  // Artisans proposés dans les modales : restreints aux artisans ayant un DEVIS ACCEPTÉ
  // (statut === 'accepte') sur le dossier choisi. `devis` est global (tous dossiers) au
  // planning → on filtre sur dossier_id ET statut. Hors de ce cas → tous les artisans.
  const artisansRdvModale = useMemo(() => {
    if (formRdv.type_rdv === 'reception' && formRdv.dossier_id) {
      const ids = new Set(devis.filter(d => d.dossier_id === formRdv.dossier_id && d.statut === 'accepte').map(d => d.artisan_id))
      return artisans.filter(a => ids.has(a.id))
    }
    return artisans
  }, [formRdv.type_rdv, formRdv.dossier_id, devis, artisans])
  const artisansIntModale = useMemo(() => {
    if (formIntervention.dossier_id) {
      const ids = new Set(devis.filter(d => d.dossier_id === formIntervention.dossier_id && d.statut === 'accepte').map(d => d.artisan_id))
      return artisans.filter(a => ids.has(a.id))
    }
    return artisans
  }, [formIntervention.dossier_id, devis, artisans])

  // Pré-sélection de la cible (création seulement). Recalcule quand le dossier ou
  // l'agence change ; n'écrase JAMAIS un choix manuel (compare au dernier auto).
  useEffect(() => {
    if (!modalOuvert || modalType !== 'rdv' || modeEdition) return
    const dossier = dossiers.find(d => d.id === formRdv.dossier_id)
    const agenceConcernee = determinerAgenceConcernee({ dossier, agenceActive, formAgenceId: formRdv.agence_id, profileAgenceId: profile?.agence_id })
    const def = resoudreCibleDefaut({ profile, cibles, agenceConcernee }) || ''
    setFormRdv(f => {
      if (f.cible_id === '' || f.cible_id === lastAutoCibleRdv.current) { lastAutoCibleRdv.current = def; return { ...f, cible_id: def } }
      return f
    })
  }, [modalOuvert, modalType, modeEdition, formRdv.dossier_id, formRdv.agence_id, agenceActive, cibles, profile, dossiers])

  useEffect(() => {
    if (!modalOuvert || modalType !== 'intervention' || modeEdition) return
    const dossier = dossiers.find(d => d.id === formIntervention.dossier_id)
    const agenceConcernee = determinerAgenceConcernee({ dossier, agenceActive, formAgenceId: formIntervention.agence_id, profileAgenceId: profile?.agence_id })
    const def = resoudreCibleDefaut({ profile, cibles, agenceConcernee }) || ''
    setFormIntervention(f => {
      if (f.cible_id === '' || f.cible_id === lastAutoCibleInt.current) { lastAutoCibleInt.current = def; return { ...f, cible_id: def } }
      return f
    })
  }, [modalOuvert, modalType, modeEdition, formIntervention.dossier_id, formIntervention.agence_id, agenceActive, cibles, profile, dossiers])

  // Pré-remplissage de l'agence en CRÉATION quand la société n'a qu'UNE agence : le select
  // est alors masqué (cf. JSX) → on fixe l'agence unique pour (1) éviter le soft-lock de la
  // validation « autres sans dossier » (l'agence devient obligatoire) et (2) alimenter la
  // résolution du calendrier. Idempotent (n'écrase jamais un choix), robuste au timing de
  // chargement des agences (se redéclenche quand `agences` arrive), édition non concernée.
  useEffect(() => {
    if (!modalOuvert || modeEdition || agences.length !== 1) return
    const uniqueId = agences[0].id
    setFormRdv(f => f.agence_id ? f : { ...f, agence_id: uniqueId })
    setFormIntervention(f => f.agence_id ? f : { ...f, agence_id: uniqueId })
  }, [modalOuvert, modeEdition, agences])

  // ── ÉVÉNEMENTS CALENDRIER ──────────────────────────────────────────────────

  const evenementsRdv = useMemo(() => rdvsScoped
    .filter(r => vue === 'tous' || (vue === 'moi' && r.dossier?.referente_id === profile?.id) || (vue === 'artisan' && r.artisan_id))
    .filter(r => !typeFiltre   || r.type_rdv === typeFiltre)
    .filter(r => !artisanFiltre || r.artisan_id === artisanFiltre)
    .filter(r => !agenteFiltre  || r.dossier?.referente_id === agenteFiltre)
    .map(r => {
      const cfg = TYPE_CONFIG[r.type_rdv] || TYPE_CONFIG.visite_technique_client
      const client = `${r.dossier?.client?.prenom || ''} ${r.dossier?.client?.nom || ''}`.trim()
      // Typé sans client (ex. import Google typé mais non rattaché) : on retombe sur le
      // titre Google stocké plutôt que d'afficher un libellé tronqué "R3 · ".
      const titre = r.type_rdv === 'autres'
        ? (r.titre || cfg.label)
        : r.type_rdv === 'visite_technique_artisan'
          ? `${cfg.short} · ${client || r.titre || ''} × ${r.artisan?.entreprise || ''}`
          : `${cfg.short} · ${client || r.titre || ''}`
      return {
        id: 'rdv-' + r.id, title: titre,
        start: r.date_heure,
        end: new Date(new Date(r.date_heure).getTime() + (r.duree_minutes || 60) * 60000).toISOString(),
        backgroundColor: cfg.color, borderColor: cfg.color, textColor: '#fff',
        extendedProps: { type: 'rdv', data: r, cfg },
      }
    }), [rdvsScoped, vue, typeFiltre, artisanFiltre, agenteFiltre, profile?.id])

  const evenementsInterventions = useMemo(() => interventionsScoped
    .filter(i => !artisanFiltre || i.artisan_id === artisanFiltre)
    .filter(i => !agenteFiltre  || i.dossier?.referente_id === agenteFiltre)
    .flatMap(i => {
      const color = couleurArtisan(i.artisan_id)
      const client = `${i.dossier?.client?.prenom || ''} ${i.dossier?.client?.nom || ''}`.trim()
      const titre = `${i.artisan?.entreprise || ''}${client ? ' x ' + client : ''}`
      if (i.type_intervention === 'periode') {
        // Barre continue journée entière du 1er au dernier jour (fin exclusive = date_fin + 1).
        // date_fin absente -> intervention d'un seul jour (borne = date_debut).
        const finDate = i.date_fin || i.date_debut
        const endExclusive = (() => { const d = new Date(finDate); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) })()
        return [{ id: 'int-' + i.id, title: titre, start: i.date_debut, end: endExclusive, backgroundColor: color + '28', borderColor: color, textColor: color, allDay: true, extendedProps: { type: 'intervention', data: i } }]
      }
      return (i.jours_specifiques || []).map((jour, idx) => {
        const d = jour.slice(0, 10)
        const endD = new Date(d + 'T00:00:00'); endD.setDate(endD.getDate() + 1)
        return { id: 'int-' + i.id + '-' + idx, title: titre, start: d, end: endD.toISOString().slice(0, 10), backgroundColor: color + '28', borderColor: color, textColor: color, allDay: true, extendedProps: { type: 'intervention', data: i } }
      })
    }), [interventionsScoped, artisanFiltre, agenteFiltre, couleurArtisan])

  const evenementsDates = useMemo(() => dossiersScoped
    .filter(d => !agenteFiltre || d.referente_id === agenteFiltre)
    .flatMap(d => {
      const evts = []
      if (d.date_demarrage_chantier) evts.push({ id: 'start-' + d.id, title: `▶ ${d.reference}`, start: d.date_demarrage_chantier, allDay: true, backgroundColor: '#ECFDF5', borderColor: COLORS.mint, textColor: COLORS.mint, extendedProps: { type: 'date_cle', data: d } })
      if (d.date_fin_chantier) evts.push({ id: 'end-' + d.id, title: `■ ${d.reference}`, start: d.date_fin_chantier, allDay: true, backgroundColor: '#FFF7ED', borderColor: COLORS.amber, textColor: COLORS.gold, extendedProps: { type: 'date_cle', data: d } })
      return evts
    }), [dossiersScoped, agenteFiltre])

  const tousEvenements = useMemo(() => [...evenementsRdv, ...evenementsInterventions, ...evenementsDates],
    [evenementsRdv, evenementsInterventions, evenementsDates])

  // ── AGENDA SIDEBAR ─────────────────────────────────────────────────────────

  const agendaItems = useMemo(() => {
    const maintenant = new Date()
    const dans30j = new Date(maintenant.getTime() + 30 * 24 * 3600000)

    const rdvItems = rdvsScoped
      .filter(r => { const d = new Date(r.date_heure); return d >= maintenant && d <= dans30j })
      .filter(r => !artisanFiltre || r.artisan_id === artisanFiltre)
      .filter(r => !agenteFiltre  || r.dossier?.referente_id === agenteFiltre)
      .filter(r => !typeFiltre    || r.type_rdv === typeFiltre)
      .map(r => {
        const cfg = TYPE_CONFIG[r.type_rdv] || TYPE_CONFIG.visite_technique_client
        const client = `${r.dossier?.client?.prenom || ''} ${r.dossier?.client?.nom || ''}`.trim()
        return {
          id: r.id, type: 'rdv', date: new Date(r.date_heure),
          titre: r.type_rdv === 'autres' ? (r.titre || cfg.label) : `${cfg.short} · ${client}`,
          sous: r.type_rdv === 'visite_technique_artisan' && r.artisan?.entreprise ? `avec ${r.artisan.entreprise}` : fmtHeure(r.date_heure),
          color: cfg.color, data: r,
        }
      })

    const intItems = interventionsScoped
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
  }, [rdvsScoped, interventionsScoped, artisanFiltre, agenteFiltre, typeFiltre, recherche, couleurArtisan])

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
    if (type === 'rdv') setFormRdv({ dossier_id: data.dossier_id, type_rdv: data.type_rdv, date_heure: data.date_heure ? instantToParisLocal(data.date_heure) : '', duree_minutes: data.duree_minutes || 60, artisan_id: data.artisan_id || '', notes: data.notes || '', titre: data.titre || '', agence_id: data.agence_id || '', cible_id: data.cible_id || '' })
    else if (type === 'intervention') setFormIntervention({ dossier_id: data.dossier_id, artisan_id: data.artisan_id, type_intervention: data.type_intervention, date_debut: data.date_debut || '', date_fin: data.date_fin || '', jours_specifiques: data.jours_specifiques || [], notes: data.notes || '', agence_id: data.agence_id || '', cible_id: data.cible_id || '' })
    else if (type === 'date_cle') setFormDateCle({ date_demarrage_chantier: data.date_demarrage_chantier || '', date_fin_chantier: data.date_fin_chantier || '' })
    setModalOuvert(true)
  }

  const ouvrirSidebar = (item) => {
    setElementSelectionne({ type: item.type, data: item.data })
    setModalType(item.type); setModeEdition(false)
    if (item.type === 'rdv') setFormRdv({ dossier_id: item.data.dossier_id, type_rdv: item.data.type_rdv, date_heure: item.data.date_heure ? instantToParisLocal(item.data.date_heure) : '', duree_minutes: item.data.duree_minutes || 60, artisan_id: item.data.artisan_id || '', notes: item.data.notes || '', titre: item.data.titre || '', agence_id: item.data.agence_id || '', cible_id: item.data.cible_id || '' })
    else if (item.type === 'intervention') setFormIntervention({ dossier_id: item.data.dossier_id, artisan_id: item.data.artisan_id, type_intervention: item.data.type_intervention, date_debut: item.data.date_debut || '', date_fin: item.data.date_fin || '', jours_specifiques: item.data.jours_specifiques || [], notes: item.data.notes || '', agence_id: item.data.agence_id || '', cible_id: item.data.cible_id || '' })
    setModalOuvert(true)
  }

  const fermerModal = () => {
    setModalOuvert(false); setElementSelectionne(null); setModeEdition(false); setErreur('')
    setFormRdv({ dossier_id: '', type_rdv: 'visite_technique_client', date_heure: '', duree_minutes: 60, artisan_id: '', notes: '', titre: '', agence_id: '', cible_id: '' })
    setFormIntervention({ dossier_id: '', artisan_id: '', type_intervention: 'periode', date_debut: '', date_fin: '', jours_specifiques: [], notes: '', agence_id: '', cible_id: '' })
    lastAutoCibleRdv.current = ''; lastAutoCibleInt.current = ''
  }

  const pushToGoogle = (type, id) => {
    if (!googleConnected || !id) return
    authHeaders().then(headers => fetch('/api/google/calendar/push', {
      method: 'POST',
      headers,
      body: JSON.stringify({ type, id }),
    })).catch(() => {})
  }

  const sauvegarderRdv = async () => {
    if (!formRdv.date_heure) return
    const estAutresSansDossier = formRdv.type_rdv === 'autres' && !formRdv.dossier_id
    const adminVueToutes = profile?.role === 'admin' && agenceActive === null
    // Admin en vue « toutes agences », RDV libre sans dossier : l'agence est obligatoire
    // (le trigger ne peut pas la dériver ; sans elle la RLS rejetterait l'insert).
    if (adminVueToutes && estAutresSansDossier && !formRdv.agence_id) {
      setErreur('Il manque une agence'); return
    }
    // Admin en vue toutes : un calendrier doit être choisi (pas de défaut résolu sans agence).
    if (adminVueToutes && cibles.length && !formRdv.cible_id) {
      setErreur('Choisissez un calendrier'); return
    }
    setSaving(true); setErreur('')
    // agence_id : du dossier si présent ; sinon (RDV libre) du sélecteur de modale ou de
    // l'agence active (navbar). Agente sans dossier → null (le trigger met son agence).
    const agence_id = formRdv.dossier_id
      ? (dossiers.find(d => d.id === formRdv.dossier_id)?.agence_id || null)
      : (formRdv.agence_id || agenceActive || null)
    // date_heure : la saisie <input datetime-local> est en heure de Paris -> convertir en instant UTC pour la colonne timestamptz (le garde `if (!formRdv.date_heure) return` ci-dessus protège le cas vide)
    const payload = { type_rdv: formRdv.type_rdv, date_heure: parisLocalToInstant(formRdv.date_heure), duree_minutes: parseInt(formRdv.duree_minutes), artisan_id: formRdv.artisan_id || null, notes: formRdv.notes || null, titre: formRdv.type_rdv === 'autres' ? (formRdv.titre || null) : null, agence_id, cible_id: formRdv.cible_id || null }
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
    // Admin en vue toutes : un calendrier doit être choisi.
    if (profile?.role === 'admin' && agenceActive === null && cibles.length && !formIntervention.cible_id) {
      setErreur('Choisissez un calendrier'); return
    }
    setSaving(true); setErreur('')
    // Une intervention a toujours un dossier → agence dérivée du dossier (le trigger fait foi, on l'envoie par cohérence).
    const agence_id = dossiers.find(d => d.id === formIntervention.dossier_id)?.agence_id || null
    const payload = { dossier_id: formIntervention.dossier_id, artisan_id: formIntervention.artisan_id, type_intervention: formIntervention.type_intervention, date_debut: formIntervention.date_debut || null, date_fin: formIntervention.type_intervention === 'periode' ? formIntervention.date_fin || null : null, jours_specifiques: formIntervention.type_intervention === 'jours_specifiques' ? formIntervention.jours_specifiques : null, notes: formIntervention.notes || null, heure_debut: formIntervention.heure_debut || null, duree_minutes: formIntervention.heure_debut ? (formIntervention.duree_minutes || 60) : null, agence_id, cible_id: formIntervention.cible_id || null }
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
      authHeaders().then(headers => fetch('/api/google/calendar/event', {
        method: 'DELETE',
        headers,
        // cible_id de l'item (lot 5c) : /event résout le bon calendrier. L'item existe
        // encore ici (appel non bloquant fired avant le delete DB) → cible_id dispo.
        // googleEndEventId : 2e marqueur (fin) d'une intervention période, s'il existe.
        body: JSON.stringify({ googleEventId, googleEndEventId: elementSelectionne.data.google_end_event_id, cibleId: elementSelectionne.data.cible_id }),
      })).catch(() => {})
    }
    const { error } = elementSelectionne.type === 'rdv'
      ? await supabase.from('rendez_vous').delete().eq('id', elementSelectionne.data.id)
      : await supabase.from('interventions_artisans').delete().eq('id', elementSelectionne.data.id)
    if (error) { setErreur(error.message); return }
    fermerModal()
    chargerTout()
  }

  if (loading) return <div className="page-loading" />

  const inputCls = "input"
  const labelCls = "eyebrow"

  const rdvCeMois = rdvsScoped.filter(r => {
    const d = new Date(r.date_heure), m = new Date()
    return d.getMonth() === m.getMonth() && d.getFullYear() === m.getFullYear()
  }).length

  return (
    <div className="page-enter page-pad" style={{ display:'flex', flexDirection:'column', gap:18, maxWidth:1400, margin:'0 auto' }}>

      {/* ── HEADER (style maquette) ─────────────────────────────────────── */}
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-end', gap:16, flexWrap:'wrap'}}>
        <div>
          <div className="eyebrow" style={{marginBottom:4}}>Pilotage</div>
          <h1 className="page" style={{fontSize:28}}>Planning</h1>
          <div style={{color:'var(--ink-500)', fontSize:13, marginTop:6}}>
            <strong style={{color:'var(--ink-700)'}}>{rdvCeMois}</strong> RDV ce mois ·{' '}
            <strong style={{color:'var(--ink-700)'}}>{interventionsScoped.length}</strong> interventions ·{' '}
            <strong style={{color:'var(--ink-700)'}}>{agendaItems.length}</strong> à venir 30j
          </div>
        </div>
        <div style={{display:'flex', gap:8, flexWrap:'wrap', alignItems:'center'}}>
          {googleConnected ? (
            // Indicateur passif : le push est désormais automatique à chaque sauvegarde
            // (lot 4c). Plus de bouton de synchronisation complète (la route /sync POST
            // reste pour l'étage 3 pull, mais n'est plus déclenchée depuis l'UI).
            <span className="btn btn-ghost" style={{display:'inline-flex', alignItems:'center', gap:10, cursor:'default'}}>
              {(fournisseursConnectes.length ? fournisseursConnectes : ['calendrier']).map(f => (
                <span key={f} style={{display:'inline-flex', alignItems:'center', gap:5}}>
                  <span style={{width:6, height:6, borderRadius:'50%', background:'#15803d', flexShrink:0}}/>
                  {f === 'google' ? 'Google' : f === 'icloud' ? 'iCloud' : 'Connecté'}
                </span>
              ))}
            </span>
          ) : (
            <button
              onClick={async () => {
                try {
                  const res = await fetch('/api/auth/google', { method: 'POST', headers: await authHeaders() })
                  const data = await res.json()
                  if (res.ok && data.url) window.location.href = data.url
                  else setSyncMessage(`❌ ${data.error || 'Erreur de connexion Google'}`)
                } catch {
                  setSyncMessage('❌ Erreur de connexion Google')
                }
              }}
              className="btn btn-ghost"
              style={{display:'inline-flex', alignItems:'center', gap:6}}>
              📅 Google Calendar
            </button>
          )}
          <button className="btn btn-ghost"
            onClick={() => { setModalType('intervention'); setElementSelectionne(null); setModeEdition(false); setModalOuvert(true) }}>
            + Intervention
          </button>
          <button className="btn btn-primary"
            onClick={() => { setModalType('rdv'); setElementSelectionne(null); setModeEdition(false); setModalOuvert(true) }}>
            + Nouveau RDV
          </button>
        </div>
      </div>

      {/* ── SYNC MESSAGE ─────────────────────────────────────────────── */}
      {syncMessage && (
        <div style={{
          fontSize:12, padding:'10px 14px', borderRadius:10, border:'1px solid',
          display:'flex', alignItems:'center', justifyContent:'space-between',
          background: syncMessage.startsWith('✅') ? 'rgba(22,163,74,0.06)' : 'rgba(239,68,68,0.06)',
          color: syncMessage.startsWith('✅') ? '#15803d' : '#b91c1c',
          borderColor: syncMessage.startsWith('✅') ? 'rgba(22,163,74,0.15)' : 'rgba(239,68,68,0.15)',
        }}>
          <span style={{fontWeight:600}}>{syncMessage}</span>
          <button onClick={() => setSyncMessage('')} style={{marginLeft:16, opacity:0.5, background:'none', border:'none', cursor:'pointer', fontSize:18, lineHeight:1}}>×</button>
        </div>
      )}

      {/* ── BARRE FILTRES (carte blanche) ─────────────────────────────── */}
      <div className="card" style={{padding:'12px 16px', display:'flex', gap:10, alignItems:'center', flexWrap:'wrap'}}>

        {/* Vue (segmented) */}
        <div style={{display:'flex', gap:4, background:'var(--ink-100)', padding:3, borderRadius:9}}>
          {[{ k: 'tous', l: 'Tous' }, { k: 'moi', l: 'Mes RDV' }, { k: 'artisan', l: 'Avec artisans' }].map(({ k, l }) => (
            <button key={k} onClick={() => setVue(k)} style={{
              padding:'6px 14px', fontSize:12.5, fontWeight:600, borderRadius:7, cursor:'pointer', border:0,
              background: vue === k ? '#fff' : 'transparent',
              color: vue === k ? 'var(--brand-800)' : 'var(--ink-500)',
              boxShadow: vue === k ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}>{l}</button>
          ))}
        </div>

        {/* Type RDV */}
        <select className="input" value={typeFiltre} onChange={e => setTypeFiltre(e.target.value)} style={{height:34, minWidth:140}}>
          <option value="">Tous les types</option>
          <option value="visite_technique_client">R1 — Visite client</option>
          <option value="visite_technique_artisan">R2 — Visite artisan</option>
          <option value="presentation_devis">R3 — Devis</option>
          <option value="autres">Autres</option>
        </select>

        <select className="input" value={artisanFiltre} onChange={e => setArtisanFiltre(e.target.value)} style={{height:34, minWidth:140}}>
          <option value="">Tous artisans</option>
          {artisans.map(a => <option key={a.id} value={a.id}>{a.entreprise}</option>)}
        </select>

        {profile?.role === 'admin' && (
          <select className="input" value={agenteFiltre} onChange={e => setAgenteFiltre(e.target.value)} style={{height:34, minWidth:140}}>
            <option value="">Tous les agents</option>
            {agentes.map(a => <option key={a.id} value={a.id}>{a.prenom} {a.nom}</option>)}
          </select>
        )}

        {(typeFiltre || artisanFiltre || agenteFiltre || vue !== 'tous') && (
          <button onClick={() => { setTypeFiltre(''); setArtisanFiltre(''); setAgenteFiltre(''); setVue('tous') }}
            className="btn btn-ghost" style={{fontSize:12}}>
            Réinitialiser
          </button>
        )}

        {/* Légende */}
        <div style={{marginLeft:'auto', display:'flex', gap:14, fontSize:11.5, color:'var(--ink-500)', flexWrap:'wrap'}}>
          {Object.entries(TYPE_CONFIG).map(([, cfg]) => (
            <span key={cfg.label} style={{display:'inline-flex', gap:5, alignItems:'center'}}>
              <span style={{width:10, height:10, background:cfg.color, borderRadius:3}}/>{cfg.short}
            </span>
          ))}
          <span style={{display:'inline-flex', gap:5, alignItems:'center'}}>
            <span style={{width:10, height:10, background:`${COLORS.violet}26`, border:`1px solid ${COLORS.violet}`, borderRadius:3}}/>Intervention
          </span>
        </div>
      </div>

      {/* ── LAYOUT 2 colonnes (calendrier · sidebar à droite) ─────────── */}
      <div className="sm:grid" style={{display:'grid', gridTemplateColumns:'1fr 320px', gap:18, minHeight:0}}>

        {/* ── CALENDRIER ───────────────────────────────────────────── */}
        <div style={{minWidth:0}}>
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
              /* Zone "journée entière" (interventions, dates-clés) agrandie et scrollable
                 en vue semaine, pour voir plusieurs marqueurs sans les tronquer. */
              .fc-timegrid .fc-daygrid-body { min-height: 64px !important; }
              .fc-timegrid-axis { min-height: 64px !important; }
              .fc .fc-timegrid-axis-cushion { font-weight: 700 !important; }
            `}</style>
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin, luxonPlugin]}
              initialView={calendarView}
              locale={frLocale}
              timeZone="Europe/Paris"
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

        {/* ── SIDEBAR (à droite, style maquette) ─────────────────────── */}
        <aside style={{display:'flex', flexDirection:'column', gap:14, minWidth:0}}>

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

          {/* Prochains événements · 30 jours */}
          <div className="card" style={{padding:18}}>
            <div className="eyebrow" style={{marginBottom:12}}>Prochains événements · 30 jours</div>
            <div style={{display:'flex', flexDirection:'column', gap:10, maxHeight:480, overflow:'auto'}}>
              {agendaItems.length === 0 && (
                <div style={{padding:20, textAlign:'center', color:'var(--ink-400)', fontSize:12}}>
                  {recherche ? 'Aucun résultat' : "Pas d'événement prévu"}
                </div>
              )}
              {agendaItems.map(item => {
                const dt = new Date(item.date)
                return (
                  <button key={item.id + item.type} onClick={() => ouvrirSidebar(item)}
                    style={{display:'grid', gridTemplateColumns:'auto 1fr', gap:10, alignItems:'flex-start',
                      background:'transparent', border:0, padding:0, cursor:'pointer', textAlign:'left'}}>
                    <div style={{
                      width:48, padding:'6px 0', background:'var(--surface-2)', borderRadius:8,
                      textAlign:'center', borderLeft:`3px solid ${item.color}`
                    }}>
                      <div className="tnum" style={{fontSize:16, fontWeight:800, color:'var(--ink-900)', lineHeight:1}}>{dt.toLocaleDateString('fr-FR',{day:'2-digit', timeZone:'Europe/Paris'})}</div>
                      <div style={{fontSize:8.5, fontWeight:700, color:'var(--ink-500)', textTransform:'uppercase', marginTop:2}}>{dt.toLocaleDateString('fr-FR',{month:'short', timeZone:'Europe/Paris'}).replace('.','')}</div>
                    </div>
                    <div style={{minWidth:0}}>
                      <div className="clip-1" style={{fontSize:12, fontWeight:600, color:'var(--ink-900)'}}>{item.titre}</div>
                      <div className="clip-1" style={{fontSize:10.5, color:'var(--ink-500)', marginTop:2}}>{item.sous}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Filtres rapides (agentes) — admin seulement */}
          {profile?.role === 'admin' && agentes.length > 0 && (
            <div className="card" style={{padding:18}}>
              <div className="eyebrow" style={{marginBottom:10}}>Filtres rapides</div>
              <div style={{display:'flex', flexDirection:'column', gap:8}}>
                {agentes.map(a => {
                  const active = agenteFiltre === a.id
                  const initials = `${a.prenom?.[0] || ''}${a.nom?.[0] || ''}`.toUpperCase()
                  return (
                    <button key={a.id} onClick={() => setAgenteFiltre(active ? '' : a.id)} style={{
                      display:'flex', alignItems:'center', gap:8, padding:'8px 10px', borderRadius:8,
                      border:'1px solid', borderColor: active ? 'var(--brand-500)' : 'var(--ink-200)',
                      background: active ? 'var(--brand-50)' : '#fff',
                      cursor:'pointer', fontSize:12, fontWeight:600, color:'var(--ink-700)', textAlign:'left',
                    }}>
                      <span style={{
                        width:22, height:22, borderRadius:'50%', background:'var(--brand-500)', color:'#fff',
                        fontSize:10, fontWeight:700, display:'grid', placeItems:'center', flexShrink:0,
                      }}>{initials}</span>
                      <span>{a.prenom} {a.nom}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Stats compactes */}
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
            {[
              { label: 'RDV ce mois', value: rdvCeMois, color: COLORS.blue },
              { label: 'Interventions', value: interventionsScoped.length, color: COLORS.violet },
              { label: 'Chantiers actifs', value: dossiersScoped.filter(d => d.date_demarrage_chantier && !d.date_fin_chantier).length, color: COLORS.mint},
              { label: 'À venir 30j', value: agendaItems.length, color: COLORS.amber },
            ].map(({ label, value, color }) => (
              <div key={label} className="card" style={{padding:12, textAlign:'center'}}>
                <div className="tnum" style={{fontSize:20, fontWeight:800, color}}>{value}</div>
                <div className="eyebrow" style={{marginTop:4}}>{label}</div>
              </div>
            ))}
          </div>
        </aside>
      </div>

      {/* ── MODAL ──────────────────────────────────────────────────────────── */}
      {modalOuvert && (
        <div style={{position:'fixed', inset:0, zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16, background:'rgba(15,39,68,0.55)', backdropFilter:'blur(6px)'}}>
          <div className="card" style={{width:'100%', maxWidth:448, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 25px 70px rgba(11,45,94,0.3)', padding:0}}>

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
                        // La liste d'artisans dépend du type (réception = filtrée par devis accepté,
                        // R2 = tous) → on réinitialise pour éviter un artisan fantôme hors liste.
                        artisan_id: '',
                      }))
                    }} className={inputCls} style={{marginTop:6}}>
                      <option value="visite_technique_client">R1 — Visite technique client</option>
                      <option value="visite_technique_artisan">R2 — Visite technique avec artisan</option>
                      <option value="presentation_devis">R3 — Présentation devis</option>
                      <option value="suivi">Suivi de chantier</option>
                      <option value="reception">Réception</option>
                      <option value="etude">Étude/conception</option>
                      <option value="autres">Autre rendez-vous</option>
                    </select>
                  </div>
                  {formRdv.type_rdv === 'autres' && <div><label className={labelCls}>Titre du rendez-vous *</label>
                    <input type="text" value={formRdv.titre} onChange={e => setFormRdv(f => ({ ...f, titre: e.target.value }))} placeholder="Ex : Réunion de chantier, Appel fournisseur…" className={inputCls} style={{marginTop:6}}/>
                  </div>}
                  {/* Sélecteur d'agence (admin en vue « toutes agences ») : filtre les dossiers,
                      détermine l'agence d'un RDV libre et pilote la résolution du calendrier.
                      Société à 1 agence → select masqué, agence pré-remplie (effet ci-dessus). */}
                  {profile?.role === 'admin' && agenceActive === null && agences.length > 1 && <div><label className={labelCls}>Agence{formRdv.type_rdv === 'autres' && !formRdv.dossier_id ? ' *' : ''}</label>
                    <select value={formRdv.agence_id} onChange={e => setFormRdv(f => ({ ...f, agence_id: e.target.value, dossier_id: '', artisan_id: '' }))} className={inputCls} style={{marginTop:6}}>
                      <option value="">— Choisir une agence —</option>
                      {agences.map(a => <option key={a.id} value={a.id}>{a.nom}</option>)}
                    </select>
                  </div>}
                  {profile?.role === 'admin' && agenceActive === null && agences.length === 1 && <div><label className={labelCls}>Agence</label>
                    <div style={{marginTop:6, fontSize:13, color:'var(--ink-700)'}}>{agences[0].nom}</div>
                  </div>}
                  {formRdv.type_rdv !== 'autres' && <div><label className={labelCls}>Chantier *</label>
                    <select value={formRdv.dossier_id} onChange={e => setFormRdv(f => ({ ...f, dossier_id: e.target.value, artisan_id: '' }))} className={inputCls} style={{marginTop:6}}>
                      <option value="">— Choisir un chantier —</option>
                      {dossiersRdvModale.map(d => <option key={d.id} value={d.id}>{d.reference} — {d.client?.prenom} {d.client?.nom}</option>)}
                    </select>
                  </div>}
                  {/* Sélecteur de calendrier (cible) — visible pour tout le monde */}
                  {cibles.length > 0 && <div><label className={labelCls}>Calendrier</label>
                    <select value={formRdv.cible_id} onChange={e => setFormRdv(f => ({ ...f, cible_id: e.target.value }))} className={inputCls} style={{marginTop:6}}>
                      <option value="">— Choisir un calendrier —</option>
                      {cibles.map(c => <option key={c.id} value={c.id}>{libelleCible(c)}</option>)}
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
                  {['visite_technique_artisan', 'reception'].includes(formRdv.type_rdv) && <div><label className={labelCls}>Artisan</label>
                    <select value={formRdv.artisan_id} onChange={e => setFormRdv(f => ({ ...f, artisan_id: e.target.value }))} className={inputCls} style={{marginTop:6}}>
                      <option value="">— Choisir —</option>
                      {artisansRdvModale.map(a => <option key={a.id} value={a.id}>{a.entreprise}</option>)}
                    </select>
                    {formRdv.type_rdv === 'reception' && formRdv.dossier_id && artisansRdvModale.length === 0 && (
                      <div style={{fontSize:11.5, color:'var(--ink-500)', marginTop:4}}>Aucun artisan avec devis signé sur ce chantier</div>
                    )}
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
                  {!modeEdition && profile?.role === 'admin' && agenceActive === null && agences.length > 1 && <div><label className={labelCls}>Agence</label>
                    <select value={formIntervention.agence_id} onChange={e => setFormIntervention(f => ({ ...f, agence_id: e.target.value, dossier_id: '', artisan_id: '' }))} className={inputCls} style={{marginTop:6}}>
                      <option value="">— Choisir une agence —</option>
                      {agences.map(a => <option key={a.id} value={a.id}>{a.nom}</option>)}
                    </select>
                  </div>}
                  {!modeEdition && profile?.role === 'admin' && agenceActive === null && agences.length === 1 && <div><label className={labelCls}>Agence</label>
                    <div style={{marginTop:6, fontSize:13, color:'var(--ink-700)'}}>{agences[0].nom}</div>
                  </div>}
                  {!modeEdition && <div><label className={labelCls}>Chantier *</label>
                    <select value={formIntervention.dossier_id} onChange={e => setFormIntervention(f => ({ ...f, dossier_id: e.target.value, artisan_id: '' }))} className={inputCls} style={{marginTop:6}}>
                      <option value="">— Choisir un chantier —</option>
                      {dossiersIntModale.map(d => <option key={d.id} value={d.id}>{d.reference} — {d.client?.prenom} {d.client?.nom}</option>)}
                    </select>
                  </div>}
                  {/* Sélecteur de calendrier (cible) — visible aussi en édition */}
                  {cibles.length > 0 && <div><label className={labelCls}>Calendrier</label>
                    <select value={formIntervention.cible_id} onChange={e => setFormIntervention(f => ({ ...f, cible_id: e.target.value }))} className={inputCls} style={{marginTop:6}}>
                      <option value="">— Choisir un calendrier —</option>
                      {cibles.map(c => <option key={c.id} value={c.id}>{libelleCible(c)}</option>)}
                    </select>
                  </div>}
                  <div><label className={labelCls}>Artisan *</label>
                    <select value={formIntervention.artisan_id} onChange={e => setFormIntervention(f => ({ ...f, artisan_id: e.target.value }))} className={inputCls} style={{marginTop:6}}>
                      <option value="">— Choisir —</option>
                      {artisansIntModale.map(a => (
                        <option key={a.id} value={a.id}>{a.entreprise}</option>
                      ))}
                    </select>
                    {formIntervention.dossier_id && artisansIntModale.length === 0 && (
                      <div style={{fontSize:11.5, color:'var(--ink-500)', marginTop:4}}>Aucun artisan avec devis signé sur ce chantier</div>
                    )}
                  </div>
                  <div><label className={labelCls}>Type d&apos;intervention</label>
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
                      <div style={{display:'flex', gap:8, marginTop:6}}>
                        <input type="date" className={inputCls} value={nouveauJour} onChange={e => setNouveauJour(e.target.value)} style={{flex:1}} />
                        <button type="button" className="btn btn-ghost" style={{whiteSpace:'nowrap'}}
                          onClick={() => {
                            const d = nouveauJour
                            if (!d) return
                            setFormIntervention(f => ({ ...f, jours_specifiques: f.jours_specifiques.includes(d) ? f.jours_specifiques : [...f.jours_specifiques, d].sort() }))
                            setNouveauJour('')
                          }}>+ Ajouter</button>
                      </div>
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
              {new Date(quickMenu.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Paris' })}
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
