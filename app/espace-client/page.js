'use client'
/* eslint-disable @next/next/no-img-element */
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { calcStatut, STATUT_CONFIG } from '../lib/dossiers'
import { authHeaders } from '../lib/api-auth-client'
import MarkdownCR from '../components/MarkdownCR'

// Vue client : les statuts internes de prospection (à contacter / à relancer)
// sont fondus dans une étape neutre « Préparation ».
const ETAPES = [
  { key: 'preparation',       label: 'Préparation',   icon: '📂' },
  { key: 'devis_en_attente',  label: 'Devis',         icon: '📋' },
  { key: 'en_cours_chantier', label: 'Travaux',       icon: '🔨' },
  { key: 'termine',           label: 'Terminé',       icon: '✅' },
]

function calcEtape(dossier) {
  if (!dossier) return 0
  const s = calcStatut(dossier)
  const map = { a_contacter: 0, a_relancer: 0, devis_en_attente: 1, devis_a_modifier: 1, en_cours_chantier: 2, termine: 3 }
  return map[s] ?? 0
}

// Badge statut côté client : libellé neutre à la place des statuts internes.
const STATUT_CLIENT_OVERRIDE = {
  a_contacter: { label: 'Dossier en préparation', color: 'bg-blue-100 text-blue-700' },
  a_relancer:  { label: 'Dossier en préparation', color: 'bg-blue-100 text-blue-700' },
}

const CAT_LABELS = {
  avant: 'Avant', pendant: 'Pendant', apres: 'Après',
  maquette: 'Maquette',
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
  const [devis, setDevis]             = useState([])
  const [comptesRendus, setComptesRendus] = useState([])
  const [messages, setMessages]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [accesDenied, setAccesDenied]  = useState(false)
  const [onglet, setOnglet]           = useState('accueil')
  const [categoriePhoto, setCategoriePhoto] = useState('avant')
  const [lightbox, setLightbox]       = useState({ open: false, index: 0 })
  const [nouveauMessage, setNouveauMessage] = useState('')
  const [msgErreur, setMsgErreur]     = useState('')
  const [sendingMsg, setSendingMsg]   = useState(false)
  const [crOuvert, setCrOuvert]       = useState(null)
  const [pdfErreur, setPdfErreur]     = useState('')
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

  // Devis acceptés du dossier, lus via la vue scopée client_devis_acceptes
  // (la table devis_artisans n'est pas lisible côté client). Colonnes exposées :
  // devis_id, dossier_id, statut ('accepte'), artisan_entreprise.
  const chargerDevis = async (dossierId) => {
    const { data } = await supabase
      .from('client_devis_acceptes').select('*').eq('dossier_id', dossierId)
    setDevis(data || [])
  }

  const chargerComptesRendus = async (dossierId) => {
    // CR visibles client via la vue scopée client_comptes_rendus : elle porte déjà
    // valide=true ET type_visite NOT IN (r1,r2,r3) → suivi + reception, colonnes
    // limitées (ni notes_brutes ni contenu_ia). On ne refiltre PAS le type ici.
    const { data } = await supabase
      .from('client_comptes_rendus')
      .select('*')
      .eq('dossier_id', dossierId)
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
        .select('*, agence:agences(nom)')
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
        .select('*, referente:profiles!dossiers_referente_id_fkey(prenom, nom)')
        .eq('client_id', profData.client_id)
        .eq('typologie', 'amo')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (dossierData) {
        setDossier(dossierData)
        await Promise.all([
          chargerPhotos(dossierData.id),
          chargerDevis(dossierData.id),
          chargerComptesRendus(dossierData.id),
          chargerMessages(dossierData.id, user.id),
        ])
      }
      setLoading(false)
    }
    init()
  }, [router])

  // Realtime : nouveaux messages côté client (réponse de l'agence).
  // Plus de realtime CR : la table comptes_rendus est fail-closed pour le client
  // (lecture via la vue client_comptes_rendus) → l'abonnement ne recevrait rien.
  // Les CR se rechargent à l'ouverture (chargerComptesRendus dans le Promise.all).
  useEffect(() => {
    if (!dossier?.id || !profile?.id) return
    const channel = supabase
      .channel(`espace-client:${dossier.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `dossier_id=eq.${dossier.id}` },
        () => chargerMessages(dossier.id, profile.id))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [dossier?.id, profile?.id])



  const envoyerMessage = async () => {
    if (!nouveauMessage.trim() || !dossier || !profile) return
    setSendingMsg(true)
    setMsgErreur('')
    const { error } = await supabase.from('messages').insert({
      dossier_id: dossier.id,
      auteur_id: profile.id,
      auteur_role: 'client',
      contenu: nouveauMessage.trim(),
      lu: true,       // lu par le client (lui-même)
      lu_agence: false,
    })
    if (error) {
      // On garde le texte saisi pour que le client puisse réessayer.
      setMsgErreur('Votre message n\'a pas pu être envoyé — réessayez.')
      setSendingMsg(false)
      return
    }
    setNouveauMessage('')
    await chargerMessages(dossier.id, profile.id)
    setSendingMsg(false)
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // Ouvre le PDF du devis signé (servi inline par /api/pdf, type='devis').
  // Même pattern que le téléchargement CR (authHeaders + blob), mais window.open
  // (inline) au lieu d'un <a download>.
  const ouvrirDevis = async (devisId) => {
    setPdfErreur('')
    try {
      const res = await fetch('/api/pdf', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ dossierId: dossier.id, type: 'devis', devisId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setPdfErreur('Devis indisponible : ' + (data.error || `code ${res.status}`))
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (err) {
      setPdfErreur('Devis indisponible : ' + (err.message || 'réseau'))
    }
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
  // comptes_rendus chargés séparément → on les intègre dans le dossier pour calcStatut
  const dossierComplet    = dossier ? { ...dossier, comptes_rendus: comptesRendus } : null
  const etapeActuelle     = calcEtape(dossierComplet)
  const statutClient      = STATUT_CLIENT_OVERRIDE[calcStatut(dossierComplet)] || STATUT_CONFIG[calcStatut(dossierComplet)]
  const photosCatActuelle = photos.filter(p => p.categorie === categoriePhoto)
  const nbMsgNonLus       = messages.filter(m => m.auteur_role !== 'client' && !m.lu).length

  const onglets = [
    { key: 'accueil',   label: 'Mon chantier',                                    icon: '🏠' },
    { key: 'photos',    label: `Photos (${photos.length})`,                        icon: '📸' },
    { key: 'cr',        label: `Comptes-rendus (${comptesRendus.length})`,          icon: '📄' },
    { key: 'messages',  label: `Messages${nbMsgNonLus > 0 ? ` (${nbMsgNonLus})` : ''}`, icon: '💬' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-blue-900">{profile?.agence?.nom || 'illiCO travaux'}</h1>
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
                <span className={`text-xs px-3 py-1 rounded-full font-medium ${statutClient.color}`}>
                  {statutClient.label}
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
                {devis.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400">Artisans</p>
                    <p className="font-medium text-gray-800">{devis.length} devis signé{devis.length > 1 ? 's' : ''}</p>
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
                        <div key={etape.key} className="flex flex-col items-center gap-2" style={{ width: '25%' }}>
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
            {devis.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h2 className="font-semibold text-gray-800 mb-3">Artisans sélectionnés</h2>
                <div className="space-y-2">
                  {devis.map(dv => (
                    dv.a_devis_signe ? (
                      <button key={dv.devis_id} onClick={() => ouvrirDevis(dv.devis_id)}
                        className="w-full flex items-center gap-3 py-2 px-2 -mx-2 rounded-lg border-b border-gray-100 last:border-0 hover:bg-blue-50 transition-colors text-left">
                        <span className="text-xl">📄</span>
                        <p className="text-sm font-medium text-gray-800">{dv.artisan_entreprise}</p>
                        <span className="ml-auto text-xs text-blue-700">Voir le devis →</span>
                      </button>
                    ) : (
                      <div key={dv.devis_id} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                        <span className="text-xl">🔨</span>
                        <p className="text-sm font-medium text-gray-800">{dv.artisan_entreprise}</p>
                        <span className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Devis signé</span>
                      </div>
                    )
                  ))}
                </div>
                {pdfErreur && (
                  <p className="text-xs text-red-600 mt-2">{pdfErreur}</p>
                )}
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
                <div key={cr.cr_id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                    onClick={() => setCrOuvert(crOuvert === cr.cr_id ? null : cr.cr_id)}>
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
                          {(cr.auteur_prenom || cr.auteur_nom) && ` — ${cr.auteur_prenom || ''} ${cr.auteur_nom || ''}`.trimEnd()}
                        </p>
                      </div>
                    </div>
                    <span className="text-gray-400 text-sm">{crOuvert === cr.cr_id ? '▲' : '▼'}</span>
                  </div>
                  {crOuvert === cr.cr_id && (
                    <div className="border-t border-gray-100 px-4 py-4 space-y-3">
                      {cr.contenu_final ? (
                        <div className="prose prose-sm max-w-none">
                          <MarkdownCR text={cr.contenu_final} variant="client" />
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400 italic">Compte-rendu en cours de rédaction.</p>
                      )}
                      {cr.contenu_final && (
                        <div className="space-y-2">
                          <button
                            onClick={async () => {
                              setPdfErreur('')
                              try {
                                const res = await fetch('/api/pdf', {
                                  method: 'POST',
                                  headers: await authHeaders(),
                                  body: JSON.stringify({ dossierId: dossier.id, type: 'cr', crId: cr.cr_id }),
                                })
                                if (!res.ok) {
                                  const data = await res.json().catch(() => ({}))
                                  setPdfErreur('Erreur PDF : ' + (data.error || `code ${res.status}`))
                                  return
                                }
                                const blob = await res.blob()
                                const url = URL.createObjectURL(blob)
                                const a = document.createElement('a')
                                a.href = url
                                a.download = `CR_${dossier.reference}.pdf`
                                a.click()
                                URL.revokeObjectURL(url)
                              } catch (err) {
                                setPdfErreur('Erreur PDF : ' + (err.message || 'réseau'))
                              }
                            }}
                            className="text-xs text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50">
                            📄 Télécharger en PDF
                          </button>
                          {pdfErreur && (
                            <p className="text-xs text-red-600">{pdfErreur}</p>
                          )}
                        </div>
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
              {msgErreur && (
                <p className="text-xs text-red-600 mt-2">{msgErreur}</p>
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  )
}