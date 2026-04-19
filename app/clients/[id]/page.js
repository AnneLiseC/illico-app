'use client'
import { useState, useEffect, use } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'

export default function FicheClient({ params }) {
  const { id } = use(params)
  const [client, setClient] = useState(null)
  const [profiles, setProfiles] = useState([])
  const [profile, setProfile] = useState(null)
  const [dossiers, setDossiers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [erreur, setErreur] = useState('')
  const [succes, setSucces] = useState('')
  const [mode, setMode] = useState('lecture')
  const router = useRouter()

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

      const { data: allProfiles } = await supabase
        .from('profiles')
        .select('id, prenom, nom, role')
        .in('role', ['admin', 'agente'])
      setProfiles(allProfiles || [])

      const { data: clientData } = await supabase
        .from('clients')
        .select('*, referente:profiles!clients_referente_fkey(id, prenom, nom, role)')
        .eq('id', id)
        .single()
      setClient(clientData)

      const { data: dossiersData } = await supabase
        .from('dossiers')
        .select('*, rendez_vous(id, type_rdv, date_heure, duree_minutes)')
        .eq('client_id', id)
        .order('created_at', { ascending: false })
      setDossiers(dossiersData || [])

      setLoading(false)
    }
    init()
  }, [id, router])

  const set = (champ, valeur) => setClient(c => ({ ...c, [champ]: valeur }))

  const handleSave = async () => {
    setSaving(true)
    setErreur('')
    setSucces('')

    const { error } = await supabase
      .from('clients')
      .update({
        civilite: client.civilite,
        nom: client.nom,
        prenom: client.prenom,
        nom2: client.nom2 || null,
        prenom2: client.prenom2 || null,
        email: client.email || null,
        telephone: client.telephone || null,
        adresse: client.adresse || null,
        type_client: client.type_client,
        referente: client.referente?.id || client.referente || null,
        apporteur_affaires: client.apporteur_affaires,
        apporteur_nom: client.apporteur_affaires ? client.apporteur_nom : null,
        apporteur_pourcentage: client.apporteur_affaires ? parseFloat(client.apporteur_pourcentage) : null,
        apporteur_base: client.apporteur_affaires ? client.apporteur_base : null,
      })
      .eq('id', id)

    if (error) {
      setErreur('Erreur : ' + error.message)
    } else {
      setSucces('Modifications enregistrées ✓')
      setMode('lecture')
    }
    setSaving(false)
  }

  const statutLabel = (statut) => {
    const labels = {
      'en_cours': { label: 'En cours', color: 'bg-green-100 text-green-700' },
      'en_attente': { label: 'En attente', color: 'bg-yellow-100 text-yellow-700' },
      'termine': { label: 'Terminé', color: 'bg-gray-100 text-gray-600' },
      'annule': { label: 'Annulé', color: 'bg-red-100 text-red-600' },
    }
    return labels[statut] || { label: statut, color: 'bg-gray-100 text-gray-600' }
  }

  const typologieLabel = (t) => {
    const labels = {
      'courtage': 'Courtage',
      'amo': 'AMO',
      'estimo': 'Estimo',
      'merad': 'MERAD',
      'audit_energetique': 'Audit énergétique',
      'studio_jardin': 'Studio de jardin',
    }
    return labels[t] || t
  }

  const estCouple = ['M. et Mme', 'Mme et Mme', 'M. et M.'].includes(client?.civilite)

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Chargement...</p>
    </div>
  )

  if (!client) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Client introuvable</p>
    </div>
  )

  const nomComplet = estCouple
    ? `${client.civilite} ${client.prenom} ${client.nom} & ${client.prenom2} ${client.nom2}`
    : `${client.civilite} ${client.prenom} ${client.nom}`

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/clients')} className="text-gray-400 hover:text-gray-600 text-sm">
            ← Retour
          </button>
          <div>
            <h1 className="text-lg font-bold text-blue-900">{nomComplet}</h1>
            <p className="text-xs text-gray-400">{client.adresse}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {mode === 'lecture' ? (
            <button
              onClick={() => setMode('edition')}
              className="bg-blue-800 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-900"
            >
              Modifier
            </button>
          ) : (
            <>
              <button
                onClick={() => setMode('lecture')}
                className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-blue-800 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-900 disabled:opacity-50"
              >
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {succes && <p className="text-green-600 text-sm bg-green-50 border border-green-200 rounded-lg px-4 py-2">{succes}</p>}
        {erreur && <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-2">{erreur}</p>}

        {/* Infos client */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">Informations</h2>

          {mode === 'lecture' ? (
            <div className="grid grid-cols-2 gap-4">
              {[
                ['Civilité', client.civilite],
                ['Prénom / Nom', nomComplet.replace(`${client.civilite} `, '')],
                ['Email', client.email || '—'],
                ['Téléphone', client.telephone || '—'],
                ['Adresse', client.adresse || '—'],
                ['Type', client.type_client === 'professionnel' ? 'Professionnel' : 'Particulier'],
                ['Référente', client.referente ? `${client.referente.prenom} ${client.referente.nom}` : '—'],
              ].map(([label, valeur]) => (
                <div key={label}>
                  <p className="text-xs text-gray-400 mb-1">{label}</p>
                  <p className="text-sm font-medium text-gray-800">{valeur}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Civilité</label>
                <select
                  value={client.civilite}
                  onChange={e => set('civilite', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="M.">M.</option>
                  <option value="Mme">Mme</option>
                  <option value="M. et Mme">M. et Mme</option>
                  <option value="Mme et Mme">Mme et Mme</option>
                  <option value="M. et M.">M. et M.</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prénom {estCouple ? '1' : ''}</label>
                  <input type="text" value={client.prenom} onChange={e => set('prenom', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom {estCouple ? '1' : ''}</label>
                  <input type="text" value={client.nom} onChange={e => set('nom', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              {estCouple && (
                <div className="grid grid-cols-2 gap-4 pt-3 border-t border-gray-100">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Prénom 2</label>
                    <input type="text" value={client.prenom2 || ''} onChange={e => set('prenom2', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nom 2</label>
                    <input type="text" value={client.nom2 || ''} onChange={e => set('nom2', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input type="email" value={client.email || ''} onChange={e => set('email', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
                  <input type="tel" value={client.telephone || ''} onChange={e => set('telephone', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Adresse</label>
                <input type="text" value={client.adresse || ''} onChange={e => set('adresse', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select value={client.type_client} onChange={e => set('type_client', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="particulier">Particulier</option>
                    <option value="professionnel">Professionnel</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Référente</label>
                  {profile?.role === 'admin' ? (
                    <select
                      value={client.referente?.id || client.referente || ''}
                      onChange={e => set('referente', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">— Choisir —</option>
                      {profiles.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.prenom} {p.nom} ({p.role === 'admin' ? 'Franchisée' : 'Agente'})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input type="text" disabled
                      value={client.referente ? `${client.referente.prenom} ${client.referente.nom}` : ''}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-400" />
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Apporteur d'affaires */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Apporteur d'affaires</h2>
            {mode === 'edition' && (
            <label className="flex items-center gap-2 cursor-pointer">
                <input
                type="checkbox"
                checked={client.apporteur_affaires || false}
                onChange={e => set('apporteur_affaires', e.target.checked)}
                className="w-4 h-4 accent-blue-700"
                />
                <span className="text-sm text-gray-600">Oui</span>
            </label>
            )}
        </div>

        {/* Mode lecture */}
        {mode === 'lecture' && client.apporteur_affaires && (
            <div className="grid grid-cols-3 gap-4">
            <div>
                <p className="text-xs text-gray-400 mb-1">Nom</p>
                <p className="text-sm font-medium text-gray-800">{client.apporteur_nom || '—'}</p>
            </div>
            <div>
                <p className="text-xs text-gray-400 mb-1">Commission</p>
                <p className="text-sm font-medium text-gray-800">{client.apporteur_pourcentage}%</p>
            </div>
            <div>
                <p className="text-xs text-gray-400 mb-1">Calculé sur</p>
                <p className="text-sm font-medium text-gray-800">
                {client.apporteur_base === 'par_devis' ? 'Par devis signé' : 'Total du chantier HT'}
                </p>
            </div>
            </div>
        )}

        {mode === 'lecture' && !client.apporteur_affaires && (
            <p className="text-sm text-gray-400">Aucun apporteur d'affaires</p>
        )}

        {/* Mode édition */}
        {mode === 'edition' && client.apporteur_affaires && (
            <div className="space-y-4 pt-2 border-t border-gray-100">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom de l'apporteur</label>
                <input
                type="text"
                value={client.apporteur_nom || ''}
                onChange={e => set('apporteur_nom', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Commission (%)</label>
                <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={client.apporteur_pourcentage || ''}
                    onChange={e => set('apporteur_pourcentage', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                </div>
                <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Calculé sur</label>
                <select
                    value={client.apporteur_base || 'total_chantier'}
                    onChange={e => set('apporteur_base', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                    <option value="total_chantier">Total du chantier HT</option>
                    <option value="par_devis">Par devis signé</option>
                </select>
                </div>
            </div>
            </div>
        )}
        </div>

        {/* Dossiers chantiers */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">Chantiers ({dossiers.length})</h2>
            <button
              onClick={() => router.push(`/chantiers/nouveau?client=${id}`)}
              className="text-sm text-blue-600 hover:underline"
            >
              + Nouveau chantier
            </button>
          </div>

          {dossiers.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Aucun chantier pour ce client</p>
          ) : (
            <div className="space-y-2">
              {dossiers.map(d => {
                const s = statutLabel(d.statut)

                return (
                  <div key={d.id} onClick={() => router.push(`/chantiers/${d.id}`)}
                    className="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:border-blue-200 cursor-pointer">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{d.reference}</p>
                      <p className="text-xs text-gray-400">{typologieLabel(d.typologie)}</p>
                    </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${s.color}`}>{s.label}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}