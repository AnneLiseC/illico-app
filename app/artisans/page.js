'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'

export default function Artisans() {
  const [artisans, setArtisans] = useState([])
  const [loading, setLoading] = useState(true)
  const [recherche, setRecherche] = useState('')
  const [filtreMetier, setFiltreMetier] = useState('tous')
  const router = useRouter()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data } = await supabase
        .from('artisans')
        .select('*')
        .order('entreprise')
      setArtisans(data || [])
      setLoading(false)
    }
    init()
  }, [router])

  const metiers = ['tous', ...new Set(artisans.map(a => a.metier).filter(Boolean).sort())]

  const artisansFiltres = artisans.filter(a => {
    const matchRecherche = `${a.entreprise} ${a.nom} ${a.prenom} ${a.ville} ${a.metier}`
      .toLowerCase().includes(recherche.toLowerCase())
    const matchMetier = filtreMetier === 'tous' || a.metier === filtreMetier
    return matchRecherche && matchMetier
  })

  // Alertes décennale expirante dans moins de 30 jours
  const aujourdhui = new Date()
  const alertesDecennale = artisans.filter(a => {
    if (!a.decennale_expiration) return false
    const exp = new Date(a.decennale_expiration)
    const diff = (exp - aujourdhui) / (1000 * 60 * 60 * 24)
    return diff <= 30
  })

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
          <h1 className="text-lg font-bold text-blue-900">Artisans</h1>
        </div>
        <button
          onClick={() => router.push('/artisans/nouveau')}
          className="bg-blue-800 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-900"
        >
          + Nouvel artisan
        </button>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {/* Alertes décennale */}
        {alertesDecennale.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
            <p className="text-sm font-medium text-red-800">⚠️ Décennales expirantes dans moins de 30 jours</p>
            {alertesDecennale.map(a => (
              <div key={a.id}
                onClick={() => router.push(`/artisans/${a.id}`)}
                className="flex items-center justify-between bg-white border border-red-100 rounded-lg px-3 py-2 cursor-pointer hover:border-red-300"
              >
                <span className="text-sm text-gray-800">{a.entreprise}</span>
                <span className="text-xs text-red-600">
                  Expire le {new Date(a.decennale_expiration).toLocaleDateString('fr-FR')}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Filtres */}
        <div className="flex gap-3 flex-wrap">
          <input
            type="text"
            placeholder="Rechercher un artisan..."
            value={recherche}
            onChange={e => setRecherche(e.target.value)}
            className="flex-1 min-w-48 border border-gray-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select value={filtreMetier} onChange={e => setFiltreMetier(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {metiers.map(m => (
              <option key={m} value={m}>{m === 'tous' ? 'Tous les métiers' : m}</option>
            ))}
          </select>
        </div>

        {/* Compteur */}
        <p className="text-sm text-gray-400">{artisansFiltres.length} artisan(s)</p>

        {/* Liste */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {artisansFiltres.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <p className="text-4xl mb-3">🔨</p>
              <p>Aucun artisan trouvé</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Entreprise</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Métier</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Localisation</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Téléphone</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Décennale</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {artisansFiltres.map(a => {
                  const decennaleExp = a.decennale_expiration ? new Date(a.decennale_expiration) : null
                  const diff = decennaleExp ? (decennaleExp - aujourdhui) / (1000 * 60 * 60 * 24) : null
                  const decennaleUrgent = diff !== null && diff <= 30
                  const decennaleExpiree = diff !== null && diff < 0

                  return (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <p className="font-medium text-gray-800 text-sm">{a.entreprise}</p>
                        {a.nom && <p className="text-xs text-gray-400">{a.prenom} {a.nom}</p>}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">
                          {a.metier || '—'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {a.code_postal} {a.ville}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {a.telephone || '—'}
                      </td>
                      <td className="px-6 py-4">
                        {decennaleExpiree ? (
                          <span className="text-xs font-medium text-red-600">
                            ❌ Expirée
                          </span>
                        ) : decennaleUrgent ? (
                          <span className="text-xs font-medium text-amber-600">
                            ⚠️ {decennaleExp.toLocaleDateString('fr-FR')}
                          </span>
                        ) : decennaleExp ? (
                          <span className="text-xs text-green-600">
                            ✓ {decennaleExp.toLocaleDateString('fr-FR')}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => router.push(`/artisans/${a.id}`)}
                          className="text-blue-600 text-sm hover:underline"
                        >
                          Voir →
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  )
}