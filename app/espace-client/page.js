'use client'
/* eslint-disable @next/next/no-img-element */
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'

const ETAPES = [
  { key: 'contact',  label: 'Prise de contact',  icon: '📞' },
  { key: 'visite',   label: 'Visite technique',   icon: '🏠' },
  { key: 'devis',    label: 'Devis artisans',      icon: '📋' },
  { key: 'travaux',  label: 'Travaux en cours',    icon: '🔨' },
  { key: 'reception',label: 'Réception chantier',  icon: '✅' },
]

// Étape calculée dynamiquement selon l'avancement réel du dossier
function calcEtape(dossier) {
  if (!dossier) return 0
  if (dossier.statut === 'termine') return 5 // tout coché

  const arts = dossier.devis_artisans || []
  const nonRefuse = arts.filter(d => d.statut !== 'refuse')
  const hasAccepte = arts.some(d => d.statut === 'accepte')
  // R2 faite = au moins un devis a changé de statut (reçu/accepté/refusé)
  const r2Done = arts.some(d => ['recu', 'accepte', 'refuse'].includes(d.statut))
  // Tous les devis reçus = aucun encore en attente parmi les non-refusés
  const allRecus = nonRefuse.length > 0 && nonRefuse.every(d => ['recu', 'accepte'].includes(d.statut))
  const demarre = dossier.date_demarrage_chantier && new Date(dossier.date_demarrage_chantier) <= new Date()

  if (hasAccepte && demarre) return 4  // Réception active
  if (allRecus)              return 3  // Travaux en cours active
  if (r2Done)                return 2  // Devis artisans active
  if (dossier.contrat_signe) return 1  // Visite technique active
  return 0                             // Prise de contact active
}

const CAT_LABELS = {
  avant: 'Avant', pendant: 'Pendant', apres: 'Après',
  maquette: 'Maquette', illustration: 'Illustration',
}

const TYPE_VISITE_LABELS = {
  r1: 'R1 — Visite client',
  r2: 'R2 — Visite avec artisan',
  r3: 'R3 — Présentation devis',
  suivi: 'Visite de suivi',
  reception: 'Réception chantier',
}

export default function EspaceClient() {
  const [profile, setProfile]         = useState(null)
  const [dossier, setDossier]         = useState(null)
  const [photos, setPhotos]           = useState([])
  const [comptesRendus, setComptesRendus] = useState([])
  const [messages, setMessages]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [accesDenied, setAccesDenied]  = useState(false)
  const [onglet, setOnglet]           = useState('accueil')
  const [categoriePhoto, setCategoriePhoto] = useState('avant')
  const [lightbox, setLightbox]       = useState({ open: false, index: 0 })
  const [nouveauMessage, setNouveauMessage] = useState('')
  const [sendingMsg, setSendingMsg]   = useState(false)
  const [crOuvert, setCrOuvert]       = useState(null)
  const messagesEndRef                = useRef(null)
  const router                        = useRouter()

  const chargerPhotos = async (dossierId) => {
    const { data } = await supabase
      .from('photos').select('*').eq('dossier_id', dossierId).order('created_at', { ascending: false })
    const withUrls = await Promise.all((data || []).map(async (p) => {
      const { data: u } = await supabase.storage.from('photos').createSignedUrl(p.url, 3600)
      return { ...p, url_signee: u?.signedUrl }
    }))
    setPhotos(withUrls)
  }

  const chargerComptesRendus = async (dossierId) => {
    // Afficher seulement les CR validés (valide = true)
    const { data } = await supabase
      .from('comptes_rendus')
      .select('*, auteur:profiles(prenom, nom)')
      .eq('dossier_id', dossierId)
      .eq('valide', true)
      .eq('type_visite', 'suivi')
      .order('created_at', { ascending: false })
    setComptesRendus(data || [])
  }

  const chargerMessages = async (dossierId, userId) => {
    const { data } = await supabase
      .from('messages')
      .select('*, auteur:profiles(prenom, nom, role)')
      .eq('dossier_id', dossierId)
      .order('created_at', { ascending: true })
    setMessages(data || [])
    // Marquer les messages agence comme lus par le client (colonne lu)
    await supabase.from('messages')
      .update({ lu: true })
      .eq('dossier_id', dossierId)
      .neq('auteur_id', userId)
      .eq('lu', false)
  }

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }

      // Charger d'abord le profil seul (sans join pour éviter l'échec si FK manquante)
      const { data: profData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (!profData || profData.role !== 'client' || !profData.client_id) {
        setAccesDenied(true)
        setLoading(false)
        return
      }

      // Charger ensuite les infos du client séparément
      const { data: clientData } = await supabase
        .from('clients')
        .select('id, prenom, nom, civilite, email')
        .eq('id', profData.client_id)
        .single()

      setProfile({ ...profData, client: clientData })

      // Dossier AMO du client
      const { data: dossierData } = await supabase
        .from('dossiers')
        .select('*, referente:profiles!dossiers_referente_id_fkey(prenom, nom), devis_artisans(id, statut, artisan:artisans(entreprise))')
        .eq('client_id', profData.client_id)
        .eq('typologie', 'amo')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (dossierData) {
        setDossier(dossierData)
        await Promise.all([
          chargerPhotos(dossierData.id),
          chargerComptesRendus(dossierData.id),
          chargerMessages(dossierData.id, user.id),
        ])
      }
      setLoading(false)
    }
    init()
  }, [router])



  const envoyerMessage = async () => {
    if (!nouveauMessage.trim() || !dossier || !profile) return
    setSendingMsg(true)
    await supabase.from('messages').insert({
      dossier_id: dossier.id,
      auteur_id: profile.id,
      auteur_role: 'client',
      contenu: nouveauMessage.trim(),
      lu: true,       // lu par le client (lui-même)
      lu_agence: false,
    })
    setNouveauMessage('')
    await chargerMessages(dossier.id, profile.id)
    setSendingMsg(false)
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Chargement...</p>
    </div>
  )

  if (accesDenied) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <p className="text-4xl mb-4">🔒</p>
        <p className="text-gray-600 font-medium">Accès non autorisé</p>
        <button onClick={handleLogout} className="mt-6 text-sm text-blue-600 hover:underline">
          Se déconnecter
        </button>
      </div>
    </div>
  )

  if (!dossier) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <p className="text-4xl mb-4">🏠</p>
        <p className="text-gray-600 font-medium">Aucun dossier AMO en cours</p>
        <p className="text-gray-400 text-sm mt-2">Votre espace sera disponible dès l&apos;ouverture de votre dossier.</p>
        <button onClick={handleLogout} className="mt-6 text-sm text-gray-400 hover:text-red-500">Se déconnecter</button>
      </div>
    </div>
  )

  // ── Données calculées ──
  const etapeActuelle     = calcEtape(dossier)
  const photosCatActuelle = photos.filter(p => p.categorie === categoriePhoto)
  const nbMsgNonLus       = messages.filter(m => m.auteur_role !== 'client' && !m.lu).length
  const devisAcceptes     = (dossier.devis_artisans || []).filter(d => d.statut === 'accepte')

  const onglets = [
    { key: 'accueil',   label: 'Mon chantier',                                    icon: '🏠' },
    { key: 'photos',    label: `Photos (${photos.length})`,                        icon: '📸' },
    { key: 'cr',        label: `Comptes-rendus (${comptesRendus.length})`,          icon: '📄' },
    { key: 'messages',  label: `Messages${nbMsgNonLus > 0 ? ` (${nbMsgNonLus})` : ''}`, icon: '💬' },
  ]

  // ── Rendu markdown simplifié ──
  const renderInline = (text) => {
    const parts = text.split(/\*\*(.+?)\*\*/g)
    return parts.map((part, i) => i % 2 === 1 ? <strong key={i}>{part}</strong> : part)
  }
  const renderMarkdown = (text) => {
    if (!text) return null
    const lines = text.split('\n')
    const els = []
    let listItems = []
    const flushList = () => {
      if (!listItems.length) return
      els.push(<ul key={`l${els.length}`} className="list-disc list-inside space-y-1 ml-2 mb-3">{listItems.map((it, i) => <li key={i} className="text-sm text-gray-700">{renderInline(it)}</li>)}</ul>)
      listItems = []
    }
    lines.forEach((line, i) => {
      const h = line.match(/^## +(?:\d+\.\s*)?(.+)/)
      if (h) { flushList(); els.push(<p key={i} className="font-bold text-blue-900 text-sm mt-4 mb-1 pb-1 border-b border-gray-100">{h[1].trim()}</p>); return }
      if (line.match(/^[-–] /)) { listItems.push(line.slice(2)); return }
      if (!line.trim()) { flushList(); return }
      flushList()
      els.push(<p key={i} className="text-sm text-gray-700 mb-2 leading-relaxed">{renderInline(line)}</p>)
    })
    flushList()
    return els
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-blue-900">illiCO travaux Martigues</h1>
            <p className="text-xs text-gray-400">
              Espace client — {profile?.client?.prenom} {profile?.client?.nom}
            </p>
          </div>
          <button onClick={handleLogout} className="text-xs text-gray-400 hover:text-red-500">Déconnexion</button>
        </div>
      </header>

      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex overflow-x-auto">
          {onglets.map(({ key, label, icon }) => (
            <button key={key} onClick={() => setOnglet(key)}
              className={`flex-shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-all ${onglet === key ? 'border-blue-800 text-blue-800' : 'border-transparent text-gray-500'}`}>
              {icon} {label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* ── ACCUEIL ── */}
        {onglet === 'accueil' && (
          <div className="space-y-5">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-xs text-gray-400 mb-1">Référence dossier</p>
                  <p className="font-bold text-blue-900 text-lg">{dossier.reference}</p>
                </div>
                <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                  dossier.statut === 'en_cours' ? 'bg-green-100 text-green-700' :
                  dossier.statut === 'termine'  ? 'bg-gray-100 text-gray-600' :
                  'bg-yellow-100 text-yellow-700'
                }`}>
                  {dossier.statut === 'en_cours' ? 'En cours' :
                   dossier.statut === 'termine'  ? 'Terminé' : 'En attente'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {dossier.referente && (
                  <div>
                    <p className="text-xs text-gray-400">Votre référente</p>
                    <p className="font-medium text-gray-800">{dossier.referente.prenom} {dossier.referente.nom}</p>
                  </div>
                )}
                {dossier.date_demarrage_chantier && (
                  <div>
                    <p className="text-xs text-gray-400">Démarrage</p>
                    <p className="font-medium text-gray-800">{new Date(dossier.date_demarrage_chantier).toLocaleDateString('fr-FR')}</p>
                  </div>
                )}
                {dossier.date_fin_chantier && (
                  <div>
                    <p className="text-xs text-gray-400">Fin prévue</p>
                    <p className="font-medium text-gray-800">{new Date(dossier.date_fin_chantier).toLocaleDateString('fr-FR')}</p>
                  </div>
                )}
                {devisAcceptes.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400">Artisans</p>
                    <p className="font-medium text-gray-800">{devisAcceptes.length} devis signé{devisAcceptes.length > 1 ? 's' : ''}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Progression */}
            {dossier.statut !== 'annule' && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h2 className="font-semibold text-gray-800 mb-6">Avancement de votre projet</h2>
                <div className="relative">
                  <div className="absolute top-5 left-5 right-5 h-0.5 bg-gray-200 z-0" />
                  <div className="absolute top-5 left-5 h-0.5 bg-blue-600 z-0 transition-all duration-500"
                    style={{ width: etapeActuelle >= 0 ? `${(etapeActuelle / (ETAPES.length - 1)) * 100}%` : '0%' }} />
                  <div className="relative z-10 flex justify-between">
                    {ETAPES.map((etape, idx) => {
                      const done   = idx < etapeActuelle
                      const active = idx === etapeActuelle
                      return (
                        <div key={etape.key} className="flex flex-col items-center gap-2" style={{ width: '20%' }}>
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg border-2 transition-all ${
                            done   ? 'bg-blue-600 border-blue-600 text-white' :
                            active ? 'bg-white border-blue-600' :
                            'bg-white border-gray-200'}`}>
                            {done ? '✓' : etape.icon}
                          </div>
                          <p className={`text-xs text-center leading-tight ${active ? 'font-bold text-blue-800' : done ? 'text-gray-600' : 'text-gray-400'}`}>
                            {etape.label}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Artisans */}
            {devisAcceptes.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h2 className="font-semibold text-gray-800 mb-3">Artisans sélectionnés</h2>
                <div className="space-y-2">
                  {devisAcceptes.map(dv => (
                    <div key={dv.id} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                      <span className="text-xl">🔨</span>
                      <p className="text-sm font-medium text-gray-800">{dv.artisan?.entreprise}</p>
                      <span className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Devis signé</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Aperçu photos */}
            {photos.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-gray-800">Dernières photos</h2>
                  <button onClick={() => setOnglet('photos')} className="text-xs text-blue-600 hover:underline">Voir toutes →</button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {photos.slice(0, 3).map((p) => (
                    <div key={p.id}
                      onClick={() => { setCategoriePhoto(p.categorie); setOnglet('photos') }}
                      className="cursor-pointer rounded-lg overflow-hidden aspect-square bg-gray-100">
                      <img src={p.url_signee} alt=""
                        className="w-full h-full object-cover hover:scale-105 transition-transform" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── PHOTOS ── */}
        {onglet === 'photos' && (
          <div className="space-y-4">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {Object.entries(CAT_LABELS).map(([cat, label]) => {
                const count = photos.filter(p => p.categorie === cat).length
                if (count === 0) return null
                return (
                  <button key={cat} onClick={() => setCategoriePhoto(cat)}
                    className={`flex-shrink-0 text-sm px-3 py-1.5 rounded-full border transition-all ${
                      categoriePhoto === cat ? 'bg-blue-800 text-white border-blue-800' : 'bg-white text-gray-600 border-gray-200'}`}>
                    {label} ({count})
                  </button>
                )
              })}
            </div>

            {photosCatActuelle.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
                <p className="text-4xl mb-3">📸</p>
                <p className="text-gray-400">Aucune photo dans cette catégorie</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {photosCatActuelle.map((p, idx) => (
                    <div key={p.id} onClick={() => setLightbox({ open: true, index: idx })}
                      className="cursor-pointer rounded-xl overflow-hidden aspect-square bg-gray-100">
                      <img src={p.url_signee} alt="" className="w-full h-full object-cover hover:scale-105 transition-transform" />
                    </div>
                  ))}
                </div>

                {lightbox.open && photosCatActuelle[lightbox.index]?.url_signee && (
                  <div className="fixed inset-0 bg-black bg-opacity-95 z-50 flex items-center justify-center p-4"
                    onClick={() => setLightbox(l => ({ ...l, open: false }))}>
                    <button className="absolute top-4 right-4 text-white text-3xl z-10 w-10 h-10 flex items-center justify-center hover:bg-white hover:bg-opacity-20 rounded-full"
                      onClick={e => { e.stopPropagation(); setLightbox(l => ({ ...l, open: false })) }}>✕</button>
                    {photosCatActuelle.length > 1 && (
                      <button className="absolute left-4 text-white text-4xl z-10 p-3 hover:bg-white hover:bg-opacity-20 rounded-full"
                        onClick={e => { e.stopPropagation(); setLightbox(l => ({ ...l, index: l.index > 0 ? l.index - 1 : photosCatActuelle.length - 1 })) }}>‹</button>
                    )}
                    <img
                      src={photosCatActuelle[lightbox.index].url_signee}
                      alt=""
                      className="max-h-[85vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
                      onClick={e => e.stopPropagation()}
                    />
                    {photosCatActuelle.length > 1 && (
                      <button className="absolute right-4 text-white text-4xl z-10 p-3 hover:bg-white hover:bg-opacity-20 rounded-full"
                        onClick={e => { e.stopPropagation(); setLightbox(l => ({ ...l, index: (l.index + 1) % photosCatActuelle.length })) }}>›</button>
                    )}
                    <p className="absolute bottom-4 text-white text-sm opacity-70">{lightbox.index + 1} / {photosCatActuelle.length}</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── COMPTES-RENDUS ── */}
        {onglet === 'cr' && (
          <div className="space-y-3">
            {comptesRendus.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
                <p className="text-4xl mb-3">📄</p>
                <p className="text-gray-400">Aucun compte-rendu disponible</p>
                <p className="text-xs text-gray-300 mt-1">Votre référente les publiera après chaque visite</p>
              </div>
            ) : (
              comptesRendus.map(cr => (
                <div key={cr.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                    onClick={() => setCrOuvert(crOuvert === cr.id ? null : cr.id)}>
                    <div className="flex items-center gap-3">
                      <span className="text-xl">📄</span>
                      <div>
                        <p className="font-medium text-gray-800 text-sm">
                          {TYPE_VISITE_LABELS[cr.type_visite] || cr.type_visite || 'Compte-rendu de visite'}
                        </p>
                        <p className="text-xs text-gray-400">
                          {cr.date_visite
                            ? new Date(cr.date_visite).toLocaleDateString('fr-FR')
                            : new Date(cr.created_at).toLocaleDateString('fr-FR')}
                          {cr.auteur && ` — ${cr.auteur.prenom} ${cr.auteur.nom}`}
                        </p>
                      </div>
                    </div>
                    <span className="text-gray-400 text-sm">{crOuvert === cr.id ? '▲' : '▼'}</span>
                  </div>
                  {crOuvert === cr.id && (cr.contenu_final || cr.notes_brutes) && (
                    <div className="border-t border-gray-100 px-4 py-4 space-y-3">
                      <div className="prose prose-sm max-w-none">
                        {renderMarkdown(cr.contenu_final || cr.notes_brutes)}
                      </div>
                      {cr.contenu_final && (
                        <button
                          onClick={async () => {
                            const res = await fetch('/api/pdf', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ dossierId: dossier.id, type: 'cr', crId: cr.id }),
                            })
                            if (!res.ok) return
                            const blob = await res.blob()
                            const url = URL.createObjectURL(blob)
                            const a = document.createElement('a')
                            a.href = url
                            a.download = `CR_${dossier.reference}.pdf`
                            a.click()
                            URL.revokeObjectURL(url)
                          }}
                          className="text-xs text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50">
                          📄 Télécharger en PDF
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ── MESSAGERIE ── */}
        {onglet === 'messages' && (
          <div className="space-y-4">
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <p className="font-medium text-gray-800 text-sm">Échanges avec votre référente</p>
                <p className="text-xs text-gray-400">{dossier.referente?.prenom} {dossier.referente?.nom}</p>
              </div>
              <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
                {messages.length === 0 ? (
                  <p className="text-center text-gray-400 text-sm py-8">Aucun message pour le moment.<br/>N&apos;hésitez pas à nous écrire !</p>
                ) : (
                  messages.map(msg => {
                    const isClient = msg.auteur_role === 'client'
                    return (
                      <div key={msg.id} className={`flex ${isClient ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-xs rounded-2xl px-4 py-2.5 ${isClient ? 'bg-blue-800 text-white' : 'bg-gray-100 text-gray-800'}`}>
                          {!isClient && (
                            <p className="text-xs font-medium mb-1 opacity-70">{msg.auteur?.prenom || 'Équipe illiCO'}</p>
                          )}
                          <p className="text-sm">{msg.contenu}</p>
                          <p className={`text-xs mt-1 opacity-60 ${isClient ? 'text-right' : ''}`}>
                            {new Date(msg.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <textarea
                value={nouveauMessage}
                onChange={e => setNouveauMessage(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyerMessage() }}}
                placeholder="Écrivez votre message..."
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <div className="flex justify-between items-center mt-2">
                <p className="text-xs text-gray-400">Entrée pour envoyer</p>
                <button onClick={envoyerMessage} disabled={!nouveauMessage.trim() || sendingMsg}
                  className="bg-blue-800 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-900 disabled:opacity-50">
                  {sendingMsg ? 'Envoi...' : 'Envoyer →'}
                </button>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}