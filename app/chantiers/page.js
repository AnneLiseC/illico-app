'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { getDossiersByScope, getFilteredDossiers, getAlertesDevis, getCompteurs, calcStatut, STATUT_CONFIG } from '../lib/dossiers'

export default function Chantiers() {
  const [dossiers, setDossiers] = useState([])
  const [profile, setProfile] = useState(null)
  const [agentes, setAgentes] = useState([])
  const [loading, setLoading] = useState(true)
  const [recherche, setRecherche] = useState('')
  const [filtreStatut, setFiltreStatut] = useState('tous')
  const [filtreTypo, setFiltreTypo] = useState('tous')
  const [onglet, setOnglet] = useState('moi')
  const router = useRouter()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profData } = await supabase
        .from('profiles').select('*').eq('id', user.id).single()
      setProfile(profData)

      let query = supabase
        .from('dossiers')
        .select('*, client:clients(civilite, prenom, nom, prenom2, nom2, adresse), referente:profiles!dossiers_referente_id_fkey(id, prenom, nom, role), devis_artisans(id, statut), comptes_rendus(id, type_visite)')
        .order('created_at', { ascending: false })
      if (profData.role === 'agente') query = query.eq('referente_id', profData.id)

      const [{ data }, { data: agentesData }] = await Promise.all([
        query,
        profData.role === 'admin'
          ? supabase.from('profiles').select('id, prenom, nom').eq('role', 'agente').order('prenom')
          : Promise.resolve({ data: [] }),
      ])
      setDossiers(data || [])
      setAgentes(agentesData || [])
      setLoading(false)
    }
    init()
  }, [router])

  const typologieLabel = (t) => ({
    courtage: 'Courtage',
    amo: 'AMO',
    estimo: 'Estimo',
    merad: 'MERAD',
    audit_energetique: 'Audit énergétique',
    studio_jardin: 'Studio de jardin',
  })[t] || t

  const nomClient = (c) => c
    ? `${c.civilite} ${c.prenom} ${c.nom}${c.prenom2 ? ` & ${c.prenom2} ${c.nom2}` : ''}`
    : '—'

  const isMarine = profile?.role === 'admin'

  // Filtrage par onglet — dynamique par ID d'agente
  const dossiersFiltresOnglet = getDossiersByScope(dossiers, profile, onglet, agentes)

  const dossiersFiltres = getFilteredDossiers(dossiersFiltresOnglet, recherche, filtreStatut, filtreTypo, nomClient )

  const aujourdhui = new Date()

  const alertes = getAlertesDevis(dossiersFiltresOnglet)

  const compteurs = getCompteurs(dossiersFiltresOnglet)

  // Onglets dynamiques : "Mes chantiers" + une tab par agente + "Tous"
  const ongletsList = isMarine ? [
    { key: 'moi', label: 'Mes chantiers' },
    ...agentes.map(a => ({ key: a.id, label: `Chantiers ${a.prenom} ${a.nom}` })),
    { key: 'tous', label: 'Tous les chantiers' },
  ] : []

  // Afficher la colonne référente si on est sur "tous" ou un onglet agente
  const afficherReferente = isMarine && (onglet === 'tous' || agentes.some(a => a.id === onglet))

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Chargement...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')} className="text-gray-400 hover:text-gray-600 text-sm">
            ← Retour
          </button>
          <h1 className="text-lg font-bold text-blue-900">Chantiers</h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-4 sm:space-y-6">

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

        {/* Alertes devis */}
        {alertes.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
            <p className="text-sm font-medium text-amber-800">⚠️ Devis à relancer dans moins de 7 jours</p>
            {alertes.map(d => (
              <div key={d.id}
                onClick={() => router.push(`/chantiers/${d.id}`)}
                className="flex items-center justify-between bg-white border border-amber-100 rounded-lg px-3 py-2 cursor-pointer hover:border-amber-300">
                <span className="text-sm text-gray-800">{d.reference} — {nomClient(d.client)}</span>
                <span className="text-xs text-amber-600">
                  Limite : {new Date(d.date_limite_devis).toLocaleDateString('fr-FR')}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Filtres */}
        <div className="flex gap-3 flex-wrap">
          <input
            type="text"
            placeholder="Rechercher..."
            value={recherche}
            onChange={e => setRecherche(e.target.value)}
            className="flex-1 min-w-48 border border-gray-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select value={filtreStatut} onChange={e => setFiltreStatut(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="tous">Tous les statuts</option>
            <option value="a_contacter">À contacter</option>
            <option value="a_relancer">À relancer</option>
            <option value="devis_en_attente">Devis en attente</option>
            <option value="devis_a_modifier">Devis à modifier</option>
            <option value="en_cours_chantier">En cours de chantier</option>
            <option value="termine">Terminé</option>
            <option value="annule">Annulé</option>
          </select>
          <select value={filtreTypo} onChange={e => setFiltreTypo(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="tous">Toutes typologies</option>
            <option value="courtage">Courtage</option>
            <option value="amo">AMO</option>
            <option value="estimo">Estimo</option>
            <option value="merad">MERAD</option>
            <option value="audit_energetique">Audit énergétique</option>
            <option value="studio_jardin">Studio de jardin</option>
          </select>
        </div>

        {/* Compteurs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'À traiter', count: compteurs.aTraiter },
            { label: 'En devis', count: compteurs.enDevis },
            { label: 'En chantier', count: compteurs.enChantier },
            { label: 'Terminés', count: compteurs.termines },
          ].map(({ label, count, color }) => (
            <div key={label} className="bg-white border border-gray-200 rounded-xl p-4 text-center">
              <p className={`text-2xl font-bold ${color}`}>{count}</p>
              <p className="text-xs text-gray-400 mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* Liste */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {dossiersFiltres.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <p className="text-4xl mb-3">📁</p>
              <p>Aucun chantier</p>
            </div>
          ) : (
            <>
              {/* Vue carte — mobile uniquement */}
              <div className="divide-y divide-gray-100 sm:hidden">
                {dossiersFiltres.map(d => {
                  const s = STATUT_CONFIG[calcStatut(d)]
                  const limiteDevis = d.date_limite_devis ? new Date(d.date_limite_devis) : null
                  const diff = limiteDevis ? (limiteDevis - aujourdhui) / (1000 * 60 * 60 * 24) : null
                  const urgent = diff !== null && diff <= 7 && diff >= 0
                  return (
                    <button key={d.id} onClick={() => router.push(`/chantiers/${d.id}`)}
                      className="w-full text-left px-4 py-4 hover:bg-gray-50 active:bg-gray-100">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-gray-800 text-sm">{d.reference}</p>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.color}`}>{s.label}</span>
                          </div>
                          <p className="text-sm text-gray-600 mt-0.5 truncate">{nomClient(d.client)}</p>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className="text-xs text-gray-500">{typologieLabel(d.typologie)}</span>
                            {limiteDevis && (
                              <span className={`text-xs font-medium ${urgent ? 'text-amber-600' : 'text-gray-400'}`}>
                                {urgent ? '⚠️ ' : ''}Limite {limiteDevis.toLocaleDateString('fr-FR')}
                              </span>
                            )}
                            {afficherReferente && d.referente && (
                              <span className="text-xs text-gray-500">{d.referente.prenom} {d.referente.nom}</span>
                            )}
                          </div>
                        </div>
                        <span className="text-blue-600 text-sm flex-shrink-0">→</span>
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Vue tableau — desktop */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Référence</th>
                      <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Client</th>
                      <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Typologie</th>
                      {afficherReferente && (
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Référente</th>
                      )}
                      <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Statut</th>
                      <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Limite devis</th>
                      <th className="px-6 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {dossiersFiltres.map(d => {
                      const s = STATUT_CONFIG[calcStatut(d)]
                      const limiteDevis = d.date_limite_devis ? new Date(d.date_limite_devis) : null
                      const diff = limiteDevis ? (limiteDevis - aujourdhui) / (1000 * 60 * 60 * 24) : null
                      const urgent = diff !== null && diff <= 7 && diff >= 0
                      return (
                        <tr key={d.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4">
                            <p className="font-medium text-gray-800 text-sm">{d.reference}</p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm text-gray-800">{nomClient(d.client)}</p>
                            <p className="text-xs text-gray-400">{d.client?.adresse}</p>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-xs text-gray-600">{typologieLabel(d.typologie)}</span>
                          </td>
                          {afficherReferente && (
                            <td className="px-6 py-4 text-sm text-gray-600">
                              {d.referente ? `${d.referente.prenom} ${d.referente.nom}` : '—'}
                            </td>
                          )}
                          <td className="px-6 py-4">
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${s.color}`}>{s.label}</span>
                          </td>
                          <td className="px-6 py-4">
                            {limiteDevis ? (
                              <span className={`text-xs font-medium ${urgent ? 'text-amber-600' : 'text-gray-500'}`}>
                                {urgent ? '⚠️ ' : ''}{limiteDevis.toLocaleDateString('fr-FR')}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <button onClick={() => router.push(`/chantiers/${d.id}`)}
                              className="text-blue-600 text-sm hover:underline">Voir →</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}