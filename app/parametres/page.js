// app/parametres/page.js
'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'

export default function Parametres() {
  const [profile, setProfile]       = useState(null)
  const [loading, setLoading]       = useState(true)
  const [agentes, setAgentes]       = useState([])
  const [saving, setSaving]         = useState(false)
  const [erreur, setErreur]         = useState('')
  const [succes, setSucces]         = useState('')
  const [modal, setModal]           = useState(false) // 'creer' | 'modifier' | false
  const [agenteEditee, setAgenteEditee] = useState(null)
  const [uploadingKbis, setUploadingKbis] = useState(null)
  const router = useRouter()

  const emptyForm = {
    prenom: '', nom: '', email: '', telephone: '',
    parts_agente_disponibles: '60',
    frais_part_agente_defaut: 100,
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
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profData } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (profData?.role !== 'admin') { router.push('/dashboard'); return }
      setProfile(profData)
      await chargerAgentes()
      setLoading(false)
    }
    init()
  }, [router])

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

    })
    setAgenteEditee(agente)
    setModal('modifier')
    setErreur('')
    setSucces('')
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
    // Sauvegarder le chemin via l'API PATCH
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

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Chargement...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/dashboard')} className="text-gray-400 hover:text-gray-600 text-sm">← Retour</button>
        <h1 className="text-lg font-bold text-blue-900">Paramètres</h1>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {succes && !modal && (
          <p className="text-green-600 text-sm bg-green-50 border border-green-200 rounded-lg px-4 py-3">{succes}</p>
        )}
        {erreur && !modal && (
          <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">{erreur}</p>
        )}

        {/* Section agentes */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div>
              <h2 className="font-semibold text-gray-800">Agentes</h2>
              <p className="text-xs text-gray-400 mt-0.5">Gérer les profils et paramètres des agentes</p>
            </div>
            <button
              onClick={ouvrirCreer}
              className="bg-blue-800 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-900 transition-colors"
            >
              + Inviter une agente
            </button>
          </div>

          {agentes.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-8">Aucune agente</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {agentes.map(agente => (
                <div key={agente.id} className="px-6 py-4 space-y-3">
                  {/* Infos principales */}
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="font-medium text-gray-800">{agente.prenom} {agente.nom}</p>
                      <p className="text-sm text-gray-500">{agente.email}</p>
                      {agente.telephone && <p className="text-sm text-gray-400">{agente.telephone}</p>}
                    </div>
                    <button
                      onClick={() => ouvrirModifier(agente)}
                      className="text-sm text-blue-600 hover:text-blue-800 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                    >
                      Modifier
                    </button>
                  </div>

                  {/* Paramètres financiers */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-400 mb-1">Répartitions commission disponibles</p>
                      <p className="font-semibold text-gray-800">
                        {agente.parts_agente_disponibles?.length > 0
                          ? agente.parts_agente_disponibles
                              .map(p => `${Math.round(p * 100)} / ${Math.round((1 - p) * 100)}`)
                              .join(' · ')
                          : fmtPct(agente.part_agente_defaut)
                        }
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-400 mb-1">Répartition frais consultation (agente / CTP)</p>
                      <p className="font-semibold text-gray-800">{fmtPct(agente.frais_part_agente_defaut)}</p>
                    </div>
                  </div>

                  {/* KBIS */}
                  <div className="flex items-center gap-3">
                    <p className="text-xs text-gray-500 font-medium">KBIS :</p>
                    {agente.kbis_url ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => voirKbis(agente.kbis_url)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          📄 Voir le KBIS
                        </button>
                        <label className="text-xs text-gray-400 cursor-pointer hover:text-blue-600">
                          Remplacer
                          <input
                            type="file" accept=".pdf" className="hidden"
                            onChange={e => e.target.files[0] && uploadKbis(agente.id, e.target.files[0])}
                          />
                        </label>
                      </div>
                    ) : (
                      <label className={`text-xs cursor-pointer px-2 py-1 rounded border transition-all ${
                        uploadingKbis === agente.id
                          ? 'text-gray-400 border-gray-200'
                          : 'text-blue-600 border-blue-200 hover:bg-blue-50'
                      }`}>
                        {uploadingKbis === agente.id ? 'Upload...' : '+ Uploader le KBIS'}
                        <input
                          type="file" accept=".pdf" className="hidden"
                          disabled={uploadingKbis === agente.id}
                          onChange={e => e.target.files[0] && uploadKbis(agente.id, e.target.files[0])}
                        />
                      </label>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Modal créer / modifier */}
      {modal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="font-semibold text-gray-800">
              {modal === 'creer' ? 'Inviter une nouvelle agente' : `Modifier — ${agenteEditee?.prenom} ${agenteEditee?.nom}`}
            </h2>

            {erreur && <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erreur}</p>}
            {succes && <p className="text-green-600 text-sm bg-green-50 border border-green-200 rounded-lg px-3 py-2">{succes}</p>}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prénom *</label>
                <input
                  type="text" value={form.prenom}
                  onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Prénom"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
                <input
                  type="text" value={form.nom}
                  onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Nom"
                />
              </div>
            </div>

            {modal === 'creer' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email" value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="email@exemple.com"
                />
                <p className="text-xs text-gray-400 mt-1">Un email d'invitation sera envoyé à cette adresse</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
              <input
                type="tel" value={form.telephone}
                onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="06 00 00 00 00"
              />
            </div>

           <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Répartitions commission disponibles — agente %
              </label>
              <input
                type="text"
                value={form.parts_agente_disponibles}
                onChange={e => setForm(f => ({ ...f, parts_agente_disponibles: e.target.value }))}
                placeholder="ex: 60 ou 50, 60"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">
                Une valeur = pas de choix. Plusieurs séparées par virgule = l'agente choisit à la création du chantier.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Répartition frais de consultation — agente / CTP
              </label>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <input
                    type="number" min="0" max="100" value={form.frais_part_agente_defaut}
                    onChange={e => setForm(f => ({ ...f, frais_part_agente_defaut: parseInt(e.target.value) || 0 }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-center"
                  />
                  <p className="text-xs text-center text-gray-400 mt-1">Agente %</p>
                </div>
                <span className="text-gray-400 font-medium">/</span>
                <div className="flex-1">
                  <input
                    type="number" value={100 - form.frais_part_agente_defaut} disabled
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-center text-gray-500"
                  />
                  <p className="text-xs text-center text-gray-400 mt-1">CTP %</p>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setModal(false); setErreur(''); setSucces('') }}
                className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                onClick={modal === 'creer' ? creerAgente : modifierAgente}
                disabled={saving || !form.prenom || !form.nom || (modal === 'creer' && !form.email)}
                className="flex-1 bg-blue-800 text-white py-2 rounded-lg text-sm hover:bg-blue-900 disabled:opacity-50"
              >
                {saving
                  ? 'Enregistrement...'
                  : modal === 'creer' ? 'Envoyer l\'invitation' : 'Enregistrer'
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}