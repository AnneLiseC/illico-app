'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'

export default function Clients() {
  const [clients, setClients] = useState([])
  const [profile, setProfile] = useState(null)
  const [agentes, setAgentes] = useState([])
  const [loading, setLoading] = useState(true)
  const [recherche, setRecherche] = useState('')
  const [onglet, setOnglet] = useState('moi')
  const router = useRouter()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: prof } = await supabase
        .from('profiles').select('*').eq('id', user.id).single()
      setProfile(prof)

      let query = supabase
        .from('clients')
        .select('*, referente:profiles(id, prenom, nom, role)')
        .order('created_at', { ascending: false })

      // Agente → uniquement ses clients
      if (prof.role === 'agente') {
        query = query.eq('referente', prof.id)
      }

      const { data } = await query
      setClients(data || [])

      // Charger les agentes dynamiquement (admin seulement)
      if (prof.role === 'admin') {
        const { data: agentesData } = await supabase
          .from('profiles').select('id, prenom, nom').eq('role', 'agente').order('prenom')
        setAgentes(agentesData || [])
      }

      setLoading(false)
    }
    init()
  }, [router])

  const isMarine = profile?.role === 'admin'

  // Filtrage par onglet (Marine uniquement) — dynamique par ID d'agente
  const clientsFiltresOnglet = clients.filter(c => {
    if (!isMarine) return true
    if (onglet === 'tous') return true
    if (onglet === 'moi') return c.referente?.role === 'admin'
    // Onglet dynamique par agente : clé = ID de l'agente
    return c.referente?.id === onglet
  })

  const clientsFiltres = clientsFiltresOnglet.filter(c =>
    `${c.nom} ${c.prenom} ${c.email} ${c.adresse}`.toLowerCase()
      .includes(recherche.toLowerCase())
  )

  // Onglets dynamiques : "Mes clients" + une tab par agente + "Tous"
  const ongletsList = isMarine ? [
    { key: 'moi', label: 'Mes clients' },
    ...agentes.map(a => ({ key: a.id, label: `Clients ${a.prenom} ${a.nom}` })),
    { key: 'tous', label: 'Tous les clients' },
  ] : []

  // Afficher la colonne référente si on est sur "tous" ou sur un onglet agente
  const afficherReferente = isMarine && (onglet === 'tous' || agentes.some(a => a.id === onglet))

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Chargement...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')} className="text-gray-400 hover:text-gray-600 text-sm">
            ← Retour
          </button>
          <h1 className="text-lg font-bold text-blue-900">Clients</h1>
        </div>
        <button
          onClick={() => router.push('/clients/nouveau')}
          className="bg-blue-800 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-900">
          + Nouveau client
        </button>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {/* Onglets Marine uniquement — dynamiques */}
        {isMarine && (
          <div className="flex gap-2 border-b border-gray-200 overflow-x-auto">
            {ongletsList.map(({ key, label }) => (
              <button key={key} onClick={() => setOnglet(key)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                  onglet === key ? 'border-blue-800 text-blue-800' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}>
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Barre de recherche */}
        <input
          type="text"
          placeholder="Rechercher un client..."
          value={recherche}
          onChange={e => setRecherche(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {/* Compteur */}
        <p className="text-sm text-gray-400">{clientsFiltres.length} client(s)</p>

        {/* Liste */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {clientsFiltres.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <p className="text-4xl mb-3">👤</p>
              <p>Aucun client pour le moment</p>
              <button
                onClick={() => router.push('/clients/nouveau')}
                className="mt-4 text-blue-600 text-sm hover:underline">
                Ajouter le premier client
              </button>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Client</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Contact</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Type</th>
                  {afficherReferente && (
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Référente</th>
                  )}
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Apporteur</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {clientsFiltres.map(client => (
                  <tr key={client.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-800">
                        {client.civilite} {client.prenom} {client.nom}
                        {client.prenom2 && ` & ${client.prenom2} ${client.nom2}`}
                      </p>
                      <p className="text-xs text-gray-400">{client.adresse}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-600">{client.email}</p>
                      <p className="text-sm text-gray-400">{client.telephone}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        client.type_client === 'professionnel'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {client.type_client === 'professionnel' ? 'Pro' : 'Particulier'}
                      </span>
                    </td>
                    {afficherReferente && (
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {client.referente ? `${client.referente.prenom} ${client.referente.nom}` : '—'}
                      </td>
                    )}
                    <td className="px-6 py-4">
                      {client.apporteur_affaires ? (
                        <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 font-medium">
                          Oui — {client.apporteur_pourcentage}%
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Non</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => router.push(`/clients/${client.id}`)}
                        className="text-blue-600 text-sm hover:underline">
                        Voir →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  )
}