'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import frLocale from '@fullcalendar/core/locales/fr'

export default function Planning() {
  const [rdvs, setRdvs] = useState([])
  const [interventions, setInterventions] = useState([])
  const [profile, setProfile] = useState(null)
  const [dossiers, setDossiers] = useState([])
  const [artisans, setArtisans] = useState([])
  const [vue, setVue] = useState('tous')
  const [artisanFiltre, setArtisanFiltre] = useState('')
  const [loading, setLoading] = useState(true)
  const [modalOuvert, setModalOuvert] = useState(false)
  const [modalType, setModalType] = useState('rdv') // 'rdv' | 'intervention'
  const [elementSelectionne, setElementSelectionne] = useState(null)
  const [modeEdition, setModeEdition] = useState(false)
  const [saving, setSaving] = useState(false)
  const [erreur, setErreur] = useState('')
  const [devis, setDevis] = useState([])
  const [googleConnected, setGoogleConnected] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  const [googleParam, setGoogleParam] = useState('')

  const [formRdv, setFormRdv] = useState({
    dossier_id: '',
    type_rdv: 'visite_technique_client',
    date_heure: '',
    duree_minutes: 60,
    artisan_id: '',
    notes: '',
  })

  const [formIntervention, setFormIntervention] = useState({
    dossier_id: '',
    artisan_id: '',
    type_intervention: 'periode',
    date_debut: '',
    date_fin: '',
    jours_specifiques: [],
    notes: '',
  })

    const chargerTout = async () => {
    const { data: rdvData } = await supabase
      .from('rendez_vous')
      .select('*, dossier:dossiers(id, reference, referente_id, client:clients(civilite, prenom, nom)), artisan:artisans(id, entreprise)')
      .order('date_heure')
    setRdvs(rdvData || [])

    const { data: interventionsData } = await supabase
      .from('interventions_artisans')
      .select('*, dossier:dossiers(id, reference, client:clients(civilite, prenom, nom)), artisan:artisans(id, entreprise)')
      .order('date_debut')
    setInterventions(interventionsData || [])

    const { data: dossiersData } = await supabase
      .from('dossiers')
      .select('id, reference, referente_id, date_demarrage_chantier, date_fin_chantier, client:clients(civilite, prenom, nom)')
      .order('reference')
    setDossiers(dossiersData || [])

    const { data: artisansData } = await supabase
      .from('artisans')
      .select('id, entreprise')
      .order('entreprise')
    setArtisans(artisansData || [])

    const { data: devisData } = await supabase
      .from('devis_artisans')
      .select('*, artisan:artisans(id, entreprise)')
    setDevis(devisData || [])
  }

  const router = useRouter()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profData } = await supabase
        .from('profiles').select('*').eq('id', user.id).single()
      setProfile(profData)

      await chargerTout()

      // Vérifier connexion Google Calendar
      const res = await fetch(`/api/google/calendar/sync?userId=${profData.id}`)
      const googleData = await res.json()
      setGoogleConnected(googleData.connected)

      // Détecter les params URL (retour OAuth)
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

  const typeConfig = {
    visite_technique_client: { label: 'R1 — Visite technique client', color: '#2E75B6' },
    visite_technique_artisan: { label: 'R2 — Visite technique avec artisan', color: '#1D6A39' },
    presentation_devis: { label: 'R3 — Présentation devis', color: '#E67E22' },
  }

  // Couleurs par artisan pour les interventions
  const couleurArtisan = (artisanId) => {
    const colors = ['#7F77DD', '#D85A30', '#BA7517', '#1D9E75', '#378ADD', '#993556', '#3B6D11']
    const index = artisans.findIndex(a => a.id === artisanId) % colors.length
    return colors[index] || '#888'
  }

  const evenementsRdv = rdvs
    .filter(r => {
      if (vue === 'moi') return r.dossier?.referente_id === profile?.id
      if (vue === 'artisan') return r.artisan_id !== null
      return true
    })
    .filter(r => !artisanFiltre || r.artisan_id === artisanFiltre)
    .map(r => ({
      id: 'rdv-' + r.id,
      title: r.type_rdv === 'visite_technique_artisan'
        ? `R2 — ${r.dossier?.client?.prenom || ''} ${r.dossier?.client?.nom || ''} x ${r.artisan?.entreprise || ''}`
        : r.type_rdv === 'visite_technique_client'
        ? `R1 — ${r.dossier?.client?.prenom || ''} ${r.dossier?.client?.nom || ''}`
        : `R3 — ${r.dossier?.client?.prenom || ''} ${r.dossier?.client?.nom || ''}`,
      start: r.date_heure,
      end: new Date(new Date(r.date_heure).getTime() + (r.duree_minutes || 60) * 60000).toISOString(),
      backgroundColor: typeConfig[r.type_rdv]?.color || '#888',
      borderColor: typeConfig[r.type_rdv]?.color || '#888',
      extendedProps: { type: 'rdv', data: r },
    }))

  const evenementsInterventions = interventions
    .filter(i => !artisanFiltre || i.artisan_id === artisanFiltre)
    .flatMap(i => {
      const color = couleurArtisan(i.artisan_id)
      const titre = `🔨 ${i.artisan?.entreprise || ''} — ${i.dossier?.client?.prenom || ''} ${i.dossier?.client?.nom || ''}`
      if (i.type_intervention === 'periode') {
        const endDateExclusive = (() => { const d = new Date(i.date_fin); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) })()
        return [{
          id: 'int-' + i.id,
          title: titre,
          start: i.date_debut,
          end: endDateExclusive,
          backgroundColor: color + '33',
          borderColor: color,
          textColor: color,
          extendedProps: { type: 'intervention', data: i },
          allDay: true,
        }]
      } else {
        return (i.jours_specifiques || []).map((jour, idx) => ({
          id: 'int-' + i.id + '-' + idx,
          title: titre,
          start: jour,
          backgroundColor: color + '33',
          borderColor: color,
          textColor: color,
          extendedProps: { type: 'intervention', data: i },
          allDay: true,
        }))
      }
    })

  // Événements dates clés chantiers (démarrage + fin)
  const evenementsDates = dossiers.flatMap(d => {
    const evts = []
    if (d.date_demarrage_chantier) {
      evts.push({
        id: 'start-' + d.id,
        title: `🏗 Démarrage — ${d.reference}`,
        start: d.date_demarrage_chantier,
        allDay: true,
        backgroundColor: '#F0FDF4',
        borderColor: '#16A34A',
        textColor: '#15803D',
        display: 'block',
        extendedProps: { type: 'date_cle', data: d },
      })
    }
    if (d.date_fin_chantier) {
      evts.push({
        id: 'end-' + d.id,
        title: `🏁 Fin — ${d.reference}`,
        start: d.date_fin_chantier,
        allDay: true,
        backgroundColor: '#FFF7ED',
        borderColor: '#EA580C',
        textColor: '#C2410C',
        display: 'block',
        extendedProps: { type: 'date_cle', data: d },
      })
    }
    return evts
  })

  const tousEvenements = [...evenementsRdv, ...evenementsInterventions, ...evenementsDates]

  const handleDateClick = (info) => {
    if (modalType === 'intervention') {
      const date = info.dateStr.slice(0, 10)
      if (formIntervention.type_intervention === 'jours_specifiques') {
        setFormIntervention(f => ({
          ...f,
          jours_specifiques: f.jours_specifiques.includes(date)
            ? f.jours_specifiques.filter(j => j !== date)
            : [...f.jours_specifiques, date]
        }))
      }
    } else {
      setFormRdv(f => ({ ...f, date_heure: info.dateStr.slice(0, 10) + 'T09:00' }))
      setElementSelectionne(null)
      setModeEdition(false)
      setModalOuvert(true)
    }
  }

  const handleEventClick = (info) => {
    const { type, data } = info.event.extendedProps
    setElementSelectionne({ type, data })
    setModalType(type)
    setModeEdition(false)
    if (type === 'rdv') {
      setFormRdv({
        dossier_id: data.dossier_id,
        type_rdv: data.type_rdv,
        date_heure: data.date_heure?.slice(0, 16),
        duree_minutes: data.duree_minutes || 60,
        artisan_id: data.artisan_id || '',
        notes: data.notes || '',
      })
    } else {
      setFormIntervention({
        dossier_id: data.dossier_id,
        artisan_id: data.artisan_id,
        type_intervention: data.type_intervention,
        date_debut: data.date_debut || '',
        date_fin: data.date_fin || '',
        jours_specifiques: data.jours_specifiques || [],
        notes: data.notes || '',
      })
    }
    setModalOuvert(true)
  }

  const sauvegarderRdv = async () => {
    if (!formRdv.dossier_id || !formRdv.date_heure) return
    setSaving(true)
    setErreur('')

    if (elementSelectionne?.type === 'rdv' && modeEdition) {
      const { error } = await supabase.from('rendez_vous').update({
        type_rdv: formRdv.type_rdv,
        date_heure: formRdv.date_heure,
        duree_minutes: parseInt(formRdv.duree_minutes),
        artisan_id: formRdv.artisan_id || null,
        notes: formRdv.notes || null,
      }).eq('id', elementSelectionne.data.id)
      if (error) { setErreur('Erreur : ' + error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('rendez_vous').insert({
        dossier_id: formRdv.dossier_id,
        type_rdv: formRdv.type_rdv,
        date_heure: formRdv.date_heure,
        duree_minutes: parseInt(formRdv.duree_minutes),
        artisan_id: formRdv.artisan_id || null,
        notes: formRdv.notes || null,
      })
      if (error) { setErreur('Erreur : ' + error.message); setSaving(false); return }
    }

    await chargerTout()
    fermerModal()
    setSaving(false)
  }

  const sauvegarderIntervention = async () => {
    if (!formIntervention.dossier_id || !formIntervention.artisan_id) return
    setSaving(true)
    setErreur('')

    const payload = {
      dossier_id: formIntervention.dossier_id,
      artisan_id: formIntervention.artisan_id,
      type_intervention: formIntervention.type_intervention,
      date_debut: formIntervention.date_debut || null,
      date_fin: formIntervention.type_intervention === 'periode' ? formIntervention.date_fin || null : null,
      jours_specifiques: formIntervention.type_intervention === 'jours_specifiques' ? formIntervention.jours_specifiques : null,
      notes: formIntervention.notes || null,
    }

    if (elementSelectionne?.type === 'intervention' && modeEdition) {
      const { error } = await supabase.from('interventions_artisans').update(payload).eq('id', elementSelectionne.data.id)
      if (error) { setErreur('Erreur : ' + error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('interventions_artisans').insert(payload)
      if (error) { setErreur('Erreur : ' + error.message); setSaving(false); return }
    }

    await chargerTout()
    fermerModal()
    setSaving(false)
  }

  const supprimer = async () => {
    if (!elementSelectionne) return
    if (!confirm('Supprimer ?')) return
    const googleEventId = elementSelectionne.data.google_event_id
    if (elementSelectionne.type === 'rdv') {
      await supabase.from('rendez_vous').delete().eq('id', elementSelectionne.data.id)
    } else {
      await supabase.from('interventions_artisans').delete().eq('id', elementSelectionne.data.id)
    }
    // Supprimer aussi dans Google Calendar si synchronisé
    if (googleEventId) await deleteGoogleEvent(googleEventId)
    await chargerTout()
    fermerModal()
  }

  const syncGoogle = async () => {
    setSyncing(true)
    setSyncMessage('')
    try {
      const res = await fetch('/api/google/calendar/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: profile?.id }),
      })
      const data = await res.json()
      if (data.success) {
        setSyncMessage(`✅ ${data.message}`)
      } else {
        setSyncMessage(`❌ ${data.error}`)
      }
    } catch {
      setSyncMessage('❌ Erreur lors de la synchronisation')
    }
    setSyncing(false)
  }

  const deleteGoogleEvent = async (googleEventId) => {
    if (!googleEventId || !profile?.id) return
    try {
      await fetch('/api/google/calendar/event', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: profile.id, googleEventId }),
      })
    } catch (err) {
      console.error('Erreur suppression Google event:', err)
    }
  }

  const fermerModal = () => {
    setModalOuvert(false)
    setElementSelectionne(null)
    setModeEdition(false)
    setErreur('')
    setFormRdv({ dossier_id: '', type_rdv: 'visite_technique_client', date_heure: '', duree_minutes: 60, artisan_id: '', notes: '' })
    setFormIntervention({ dossier_id: '', artisan_id: '', type_intervention: 'periode', date_debut: '', date_fin: '', jours_specifiques: [], notes: '' })
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Chargement...</p>
    </div>
  )

  const afficherFormulaireRdv = !elementSelectionne || (elementSelectionne?.type === 'rdv' && modeEdition)
  const afficherFormulaireIntervention = !elementSelectionne || (elementSelectionne?.type === 'intervention' && modeEdition)

  return (
    <div className="min-h-screen bg-gray-50">

      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')} className="text-gray-400 hover:text-gray-600 text-sm">
            ← Retour
          </button>
          <h1 className="text-lg font-bold text-blue-900">Planning</h1>
        </div>
        <div className="flex gap-2">
          {/* Boutons Google Calendar */}
          {!googleConnected ? (
            <a href={`/api/auth/google?userId=${profile?.id}`}
              className="flex items-center gap-2 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-50">
              <span>📅</span> Connecter Google Calendar
            </a>
          ) : (
            <button onClick={syncGoogle} disabled={syncing}
              className="flex items-center gap-2 border border-green-300 text-green-700 px-3 py-2 rounded-lg text-sm hover:bg-green-50 disabled:opacity-50">
              {syncing ? '⏳ Synchro...' : '🔄 Sync Google'}
            </button>
          )}
          <button
            onClick={() => { setModalType('intervention'); setElementSelectionne(null); setModeEdition(false); setModalOuvert(true) }}
            className="border border-green-300 text-green-700 px-4 py-2 rounded-lg text-sm hover:bg-green-50">
            + Intervention artisan
          </button>
          <button
            onClick={() => { setModalType('rdv'); setElementSelectionne(null); setModeEdition(false); setModalOuvert(true) }}
            className="bg-blue-800 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-900">
            + RDV
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {syncMessage && (
          <div className={`text-sm px-4 py-2 rounded-lg border ${syncMessage.startsWith('✅') ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-600'}`}>
            {syncMessage}
            <button onClick={() => setSyncMessage('')} className="ml-3 opacity-50 hover:opacity-100">✕</button>
          </div>
        )}
        {googleConnected && (
          <div className="flex items-center gap-2 text-xs text-green-600">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
            Google Calendar connecté
          </div>
        )}

        {/* Filtres */}
        <div className="flex gap-3 flex-wrap items-center">
          <div className="flex gap-2">
            {[
              { key: 'tous', label: '🗓 Tous' },
              { key: 'moi', label: '👤 Mes RDV' },
              { key: 'artisan', label: '🔨 Avec artisans' },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => setVue(key)}
                className={`text-sm px-3 py-1.5 rounded-lg border transition-all ${
                  vue === key ? 'bg-blue-800 text-white border-blue-800' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                }`}>
                {label}
              </button>
            ))}
          </div>
          <select value={artisanFiltre} onChange={e => setArtisanFiltre(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Tous les artisans</option>
            {artisans.map(a => (
              <option key={a.id} value={a.id}>{a.entreprise}</option>
            ))}
          </select>
        </div>

        {/* Légende */}
        <div className="flex gap-4 flex-wrap">
          {Object.entries(typeConfig).map(([key, { label, color }]) => (
            <div key={key} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }}></div>
              <span className="text-xs text-gray-500">{label}</span>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded border-2" style={{ backgroundColor: '#7F77DD33', borderColor: '#7F77DD' }}></div>
            <span className="text-xs text-gray-500">Intervention artisan</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#F0FDF4', border: '2px solid #16A34A' }}></div>
            <span className="text-xs text-gray-500">Démarrage chantier</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#FFF7ED', border: '2px solid #EA580C' }}></div>
            <span className="text-xs text-gray-500">Fin de chantier</span>
          </div>
        </div>

        {/* Calendrier */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            locale={frLocale}
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,listWeek'
            }}
            events={tousEvenements}
            dateClick={handleDateClick}
            eventClick={handleEventClick}
            height="auto"
            buttonText={{
              today: "Aujourd'hui",
              month: 'Mois',
              week: 'Semaine',
              list: 'Liste',
            }}
          />
        </div>
      </main>

      {/* Modal */}
      {modalOuvert && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
          onClick={fermerModal}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg space-y-4 max-h-screen overflow-y-auto"
            onClick={e => e.stopPropagation()}>

            {/* Vue détail RDV */}
            {elementSelectionne?.type === 'rdv' && !modeEdition && (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-gray-800">{typeConfig[elementSelectionne.data.type_rdv]?.label}</h2>
                  <span className="text-xs text-blue-600 cursor-pointer hover:underline" onClick={() => setModeEdition(true)}>Modifier</span>
                </div>
                <div className="space-y-3 text-sm">
                  <div><p className="text-xs text-gray-400">Chantier</p><p className="font-medium">{elementSelectionne.data.dossier?.reference} — {elementSelectionne.data.dossier?.client?.prenom} {elementSelectionne.data.dossier?.client?.nom}</p></div>
                  <div><p className="text-xs text-gray-400">Date et heure</p><p className="font-medium">{new Date(elementSelectionne.data.date_heure).toLocaleString('fr-FR')}</p></div>
                  <div><p className="text-xs text-gray-400">Durée</p><p className="font-medium">{elementSelectionne.data.duree_minutes} min</p></div>
                  {elementSelectionne.data.artisan && <div><p className="text-xs text-gray-400">Artisan</p><p className="font-medium">{elementSelectionne.data.artisan.entreprise}</p></div>}
                  {elementSelectionne.data.notes && <div><p className="text-xs text-gray-400">Notes</p><p className="font-medium">{elementSelectionne.data.notes}</p></div>}
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={fermerModal} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50">Fermer</button>
                  <button onClick={() => router.push(`/chantiers/${elementSelectionne.data.dossier_id}`)} className="flex-1 bg-blue-800 text-white py-2 rounded-lg text-sm hover:bg-blue-900">Voir le chantier →</button>
                  <button onClick={supprimer} className="bg-red-50 text-red-500 border border-red-200 py-2 px-3 rounded-lg text-sm hover:bg-red-100">Supprimer</button>
                </div>
              </>
            )}

            {/* Vue détail Intervention */}
            {elementSelectionne?.type === 'intervention' && !modeEdition && (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-gray-800">Intervention artisan</h2>
                  <span className="text-xs text-blue-600 cursor-pointer hover:underline" onClick={() => setModeEdition(true)}>Modifier</span>
                </div>
                <div className="space-y-3 text-sm">
                  <div><p className="text-xs text-gray-400">Artisan</p><p className="font-medium">{elementSelectionne.data.artisan?.entreprise}</p></div>
                  <div><p className="text-xs text-gray-400">Chantier</p><p className="font-medium">{elementSelectionne.data.dossier?.reference} — {elementSelectionne.data.dossier?.client?.prenom} {elementSelectionne.data.dossier?.client?.nom}</p></div>
                  <div><p className="text-xs text-gray-400">Type</p><p className="font-medium">{elementSelectionne.data.type_intervention === 'periode' ? 'Période continue' : 'Jours spécifiques'}</p></div>
                  {elementSelectionne.data.type_intervention === 'periode' && (
                    <div><p className="text-xs text-gray-400">Période</p><p className="font-medium">{new Date(elementSelectionne.data.date_debut).toLocaleDateString('fr-FR')} → {new Date(elementSelectionne.data.date_fin).toLocaleDateString('fr-FR')}</p></div>
                  )}
                  {elementSelectionne.data.type_intervention === 'jours_specifiques' && (
                    <div><p className="text-xs text-gray-400">Jours ({elementSelectionne.data.jours_specifiques?.length})</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {elementSelectionne.data.jours_specifiques?.map(j => (
                          <span key={j} className="text-xs bg-gray-100 px-2 py-0.5 rounded">{new Date(j).toLocaleDateString('fr-FR')}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {elementSelectionne.data.notes && <div><p className="text-xs text-gray-400">Notes</p><p className="font-medium">{elementSelectionne.data.notes}</p></div>}
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={fermerModal} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50">Fermer</button>
                  <button onClick={() => router.push(`/chantiers/${elementSelectionne.data.dossier_id}`)} className="flex-1 bg-blue-800 text-white py-2 rounded-lg text-sm hover:bg-blue-900">Voir le chantier →</button>
                  <button onClick={supprimer} className="bg-red-50 text-red-500 border border-red-200 py-2 px-3 rounded-lg text-sm hover:bg-red-100">Supprimer</button>
                </div>
              </>
            )}

            {/* Formulaire RDV (création ou édition) */}
            {(modalType === 'rdv' || (elementSelectionne?.type === 'rdv' && modeEdition)) && (!elementSelectionne || modeEdition) && (
              <>
                <h2 className="font-semibold text-gray-800">{modeEdition ? 'Modifier le RDV' : 'Nouveau rendez-vous'}</h2>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type de RDV *</label>
                  <select value={formRdv.type_rdv} onChange={e => setFormRdv(f => ({ ...f, type_rdv: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="visite_technique_client">R1 — Visite technique client</option>
                    <option value="visite_technique_artisan">R2 — Visite technique avec artisan</option>
                    <option value="presentation_devis">R3 — Présentation devis</option>
                  </select>
                </div>

                {!modeEdition && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Chantier *</label>
                    <select value={formRdv.dossier_id} onChange={e => setFormRdv(f => ({ ...f, dossier_id: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">— Choisir un chantier —</option>
                      {dossiers.map(d => (
                        <option key={d.id} value={d.id}>{d.reference} — {d.client?.prenom} {d.client?.nom}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date et heure *</label>
                    <input type="datetime-local" value={formRdv.date_heure}
                      onChange={e => setFormRdv(f => ({ ...f, date_heure: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Durée</label>
                    <select value={formRdv.duree_minutes} onChange={e => setFormRdv(f => ({ ...f, duree_minutes: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value={30}>30 min</option>
                      <option value={60}>1h</option>
                      <option value={90}>1h30</option>
                      <option value={120}>2h</option>
                      <option value={180}>3h</option>
                    </select>
                  </div>
                </div>

                {formRdv.type_rdv === 'visite_technique_artisan' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Artisan</label>
                    <select value={formRdv.artisan_id} onChange={e => setFormRdv(f => ({ ...f, artisan_id: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">— Choisir —</option>
                      {artisans.map(a => <option key={a.id} value={a.id}>{a.entreprise}</option>)}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea value={formRdv.notes} onChange={e => setFormRdv(f => ({ ...f, notes: e.target.value }))}
                    rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                {erreur && <p className="text-red-500 text-sm">{erreur}</p>}

                <div className="flex gap-2">
                  <button onClick={fermerModal} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50">Annuler</button>
                  <button onClick={sauvegarderRdv} disabled={(!formRdv.dossier_id && !modeEdition) || !formRdv.date_heure || saving}
                    className="flex-1 bg-blue-800 text-white py-2 rounded-lg text-sm hover:bg-blue-900 disabled:opacity-50">
                    {saving ? 'Enregistrement...' : modeEdition ? 'Enregistrer' : 'Créer le RDV'}
                  </button>
                </div>
              </>
            )}

            {/* Formulaire Intervention */}
            {(modalType === 'intervention' || (elementSelectionne?.type === 'intervention' && modeEdition)) && (!elementSelectionne || modeEdition) && (
              <>
                <h2 className="font-semibold text-gray-800">{modeEdition ? "Modifier l'intervention" : 'Nouvelle intervention artisan'}</h2>

                {!modeEdition && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Chantier *</label>
                    <select value={formIntervention.dossier_id} onChange={e => setFormIntervention(f => ({ ...f, dossier_id: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">— Choisir un chantier —</option>
                      {dossiers.map(d => <option key={d.id} value={d.id}>{d.reference} — {d.client?.prenom} {d.client?.nom}</option>)}
                    </select>
                  </div>
                )}

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Artisan *</label>
                    <select value={formIntervention.artisan_id} onChange={e => setFormIntervention(f => ({ ...f, artisan_id: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">— Choisir —</option>
                        {(formIntervention.dossier_id
                        ? devis.filter(d => d.dossier_id === formIntervention.dossier_id).map(d => d.artisan).filter(Boolean)
                        : []
                        ).map(a => (
                        <option key={a.id} value={a.id}>{a.entreprise}</option>
                        ))}
                        {!formIntervention.dossier_id && (
                        <option disabled value="">— Choisissez d'abord un chantier —</option>
                        )}
                    </select>
                </div> 

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type d'intervention</label>
                  <div className="flex gap-3">
                    {[
                      { value: 'periode', label: 'Période continue' },
                      { value: 'jours_specifiques', label: 'Jours spécifiques' },
                    ].map(({ value, label }) => (
                      <label key={value} className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="type_intervention" value={value}
                          checked={formIntervention.type_intervention === value}
                          onChange={e => setFormIntervention(f => ({ ...f, type_intervention: e.target.value, jours_specifiques: [] }))}
                          className="accent-blue-700" />
                        <span className="text-sm text-gray-700">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {formIntervention.type_intervention === 'periode' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Date de début *</label>
                      <input type="date" value={formIntervention.date_debut}
                        onChange={e => setFormIntervention(f => ({ ...f, date_debut: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Date de fin *</label>
                      <input type="date" value={formIntervention.date_fin}
                        onChange={e => setFormIntervention(f => ({ ...f, date_fin: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                )}

                {formIntervention.type_intervention === 'jours_specifiques' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Sélectionne les jours en cliquant sur le calendrier ou ajoute manuellement
                    </label>
                    <input type="date"
                      onChange={e => {
                        const date = e.target.value
                        if (!date) return
                        setFormIntervention(f => ({
                          ...f,
                          jours_specifiques: f.jours_specifiques.includes(date)
                            ? f.jours_specifiques.filter(j => j !== date)
                            : [...f.jours_specifiques, date].sort()
                        }))
                        e.target.value = ''
                      }}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2" />
                    {formIntervention.jours_specifiques.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {formIntervention.jours_specifiques.map(j => (
                          <span key={j} className="flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                            {new Date(j).toLocaleDateString('fr-FR')}
                            <button onClick={() => setFormIntervention(f => ({ ...f, jours_specifiques: f.jours_specifiques.filter(d => d !== j) }))}
                              className="text-blue-400 hover:text-red-500 ml-1">×</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea value={formIntervention.notes} onChange={e => setFormIntervention(f => ({ ...f, notes: e.target.value }))}
                    rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                {erreur && <p className="text-red-500 text-sm">{erreur}</p>}

                <div className="flex gap-2">
                  <button onClick={fermerModal} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50">Annuler</button>
                  <button onClick={sauvegarderIntervention}
                    disabled={(!formIntervention.dossier_id && !modeEdition) || !formIntervention.artisan_id || saving}
                    className="flex-1 bg-green-700 text-white py-2 rounded-lg text-sm hover:bg-green-800 disabled:opacity-50">
                    {saving ? 'Enregistrement...' : modeEdition ? 'Enregistrer' : "Planifier l'intervention"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}