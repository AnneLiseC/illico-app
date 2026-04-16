'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function NouveauChantierForm() {
  const [client, setClient] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [erreur, setErreur] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()
  const clientId = searchParams.get('client')

  const [form, setForm] = useState({
    typologie: 'courtage',
    frais_consultation: '',
    frais_statut: 'offerts',
    date_limite_devis: '',
    part_agente: null,
  })


  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      setProfile(profData)

      setForm(f => ({ ...f, part_agente: parseFloat(profData?.part_agente_defaut) ?? 0.5 }))

      if (clientId) {
        const { data: clientData } = await supabase
          .from('clients')
          .select('*, referente:profiles(prenom, nom)')
          .eq('id', clientId)
          .single()
        setClient(clientData)
      }
    }
    init()
  }, [router, clientId])

  const set = (champ, valeur) => setForm(f => ({ ...f, [champ]: valeur }))

  // Génère la référence automatiquement
  const genererReference = (typologie, nomClient) => {
    const codes = {
      courtage: 'CT',
      amo: 'AM',
      estimo: 'ES',
      audit_energetique: 'AU',
      studio_jardin: 'SJ',
    }
    const code = codes[typologie] || 'XX'
    const annee = new Date().getFullYear()
    const nom = nomClient?.toUpperCase().slice(0, 3) || 'XXX'
    const rand = Math.floor(Math.random() * 100).toString().padStart(2, '0')
    return `${code}-${annee}-${nom}${rand}`
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setErreur('')

    const reference = genererReference(form.typologie, client?.nom)

    const { data, error } = await supabase.from('dossiers').insert({
      reference,
      client_id: clientId,
      referente_id: profile?.id,
      typologie: form.typologie,
      statut: 'en_cours',
      frais_consultation: form.frais_consultation ? parseFloat(form.frais_consultation) : null,
      frais_statut: form.frais_statut,
      date_limite_devis: form.date_limite_devis || null,
      part_agente: form.part_agente ?? profile?.part_agente_defaut ?? 0.5,
      frais_part_agente: profile?.frais_part_agente_defaut ?? null,
    }).select()

    if (error) {
      setErreur('Erreur : ' + error.message)
      setLoading(false)
    } else {
      router.push(`/chantiers/${data[0].id}`)
    }
  }

  const nomComplet = client
    ? `${client.civilite} ${client.prenom} ${client.nom}${client.prenom2 ? ` & ${client.prenom2} ${client.nom2}` : ''}`
    : ''

  return (
    <div className="min-h-screen bg-gray-50">

      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3">
        <button
          onClick={() => client ? router.push(`/clients/${clientId}`) : router.push('/chantiers')}
          className="text-gray-400 hover:text-gray-600 text-sm"
        >
          ← Retour
        </button>
        <div>
          <h1 className="text-lg font-bold text-blue-900">Nouveau chantier</h1>
          {client && <p className="text-xs text-gray-400">{nomComplet}</p>}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Client */}
          {client && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
              <span className="text-2xl">👤</span>
              <div>
                <p className="text-sm font-medium text-blue-900">{nomComplet}</p>
                <p className="text-xs text-blue-600">{client.adresse}</p>
              </div>
            </div>
          )}

          {/* Typologie */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <h2 className="font-semibold text-gray-800">Type de mission</h2>

            <div className="grid grid-cols-1 gap-2">
              {[
                { value: 'courtage', label: 'Courtage', desc: 'Mise en relation avec artisans, commission 6%' },
                { value: 'amo', label: 'AMO', desc: 'Assistance à maîtrise d\'ouvrage, commission 15%' },
                { value: 'estimo', label: 'Estimo', desc: 'Estimation de travaux' },
                { value: 'audit_energetique', label: 'Audit énergétique', desc: 'Audit de performance énergétique' },
                { value: 'studio_jardin', label: 'Studio de jardin', desc: 'Aménagement studio de jardin' },
              ].map(({ value, label, desc }) => (
                <label
                  key={value}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    form.typologie === value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="typologie"
                    value={value}
                    checked={form.typologie === value}
                    onChange={e => set('typologie', e.target.value)}
                    className="mt-0.5 accent-blue-700"
                  />
                  <div>
                    <p className={`text-sm font-medium ${form.typologie === value ? 'text-blue-800' : 'text-gray-800'}`}>
                      {label}
                    </p>
                    <p className="text-xs text-gray-400">{desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Frais de consultation */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <h2 className="font-semibold text-gray-800">Frais de consultation</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
              <select
                value={form.frais_statut}
                onChange={e => set('frais_statut', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="offerts">Offerts</option>
                <option value="rembourse">Remboursés</option>
                <option value="factures">Facturés (à régler)</option>
                <option value="regle">Facturés et réglés</option>
              </select>
            </div>

            {form.frais_statut !== 'offerts' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Montant TTC (€)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.frais_consultation}
                  onChange={e => set('frais_consultation', e.target.value)}
                  placeholder="ex: 300"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {form.frais_statut === 'factures' && (
                  <p className="text-xs text-amber-600 mt-1">
                    ⚠️ Le courtage ne démarrera qu'après règlement des frais de consultation
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Répartition commission */}
          {profile?.parts_agente_disponibles?.length > 1 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-3">
              <h2 className="font-semibold text-gray-800">Répartition commission</h2>
              <div className="flex gap-2">
                {profile.parts_agente_disponibles.map(pct => {
                  const pctFloat = parseFloat(pct)
                  return (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => set('part_agente', pctFloat)}
                      className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${
                        form.part_agente === pctFloat
                          ? 'bg-blue-800 text-white border-blue-800'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {Math.round(pctFloat * 100)} / {Math.round((1 - pctFloat) * 100)}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}

          {/* Date limite devis */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <h2 className="font-semibold text-gray-800">Délai de réception des devis</h2>
            <p className="text-xs text-gray-400">Date limite notée dans le contrat de prestation</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date limite</label>
              <input
                type="date"
                value={form.date_limite_devis}
                onChange={e => set('date_limite_devis', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {erreur && <p className="text-red-500 text-sm">{erreur}</p>}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.push(`/clients/${clientId}`)}
              className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-50 text-sm"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-800 text-white py-2 rounded-lg hover:bg-blue-900 text-sm font-medium disabled:opacity-50"
            >
              {loading ? 'Création...' : 'Créer le chantier →'}
            </button>
          </div>

        </form>
      </main>
    </div>
  )
}

export default function NouveauChantier() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">Chargement...</p>
      </div>
    }>
      <NouveauChantierForm />
    </Suspense>
  )
}