'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'

export default function NouveauClient() {
  const [profiles, setProfiles] = useState([])
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [erreur, setErreur] = useState('')
  const router = useRouter()

  const [form, setForm] = useState({
    civilite: 'M.',
    nom: '',
    prenom: '',
    nom2: '',
    prenom2: '',
    email: '',
    telephone: '',
    adresse: '',
    adresse_chantier: '',
    adresse_chantier_identique: true,
    type_client: 'particulier',
    referente: '',
    apporteur_affaires: false,
    apporteur_nom: '',
    apporteur_pourcentage: '',
    apporteur_base: 'total_chantier',
  })

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      // Récupérer le profil connecté
      const { data: profData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      setProfile(profData)

      // Récupérer tous les profils agente/admin
      const { data } = await supabase
        .from('profiles')
        .select('id, prenom, nom, role')
        .in('role', ['admin', 'agente'])
      setProfiles(data || [])

      // Pré-sélectionner l'utilisateur connecté
      if (profData) {
        setForm(f => ({ ...f, referente: profData.id }))
      }
    }
    init()
  }, [router])

  const set = (champ, valeur) => setForm(f => ({ ...f, [champ]: valeur }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setErreur('')

    const adresseChantier = form.adresse_chantier_identique
      ? form.adresse || null
      : form.adresse_chantier || null

    const { data, error } = await supabase.from('clients').insert({
      civilite: form.civilite,
      nom: form.nom,
      prenom: form.prenom,
      nom2: form.nom2 || null,
      prenom2: form.prenom2 || null,
      email: form.email || null,
      telephone: form.telephone || null,
      adresse: form.adresse || null,
      adresse_chantier: adresseChantier,
      type_client: form.type_client,
      referente: form.referente || null,
      apporteur_affaires: form.apporteur_affaires,
      apporteur_nom: form.apporteur_affaires ? form.apporteur_nom : null,
      apporteur_pourcentage: form.apporteur_affaires ? parseFloat(form.apporteur_pourcentage) : null,
      apporteur_base: form.apporteur_affaires ? form.apporteur_base : null,
    }).select()

    if (error) {
      setErreur('Erreur : ' + error.message)
      setLoading(false)
    } else {
      router.push(`/chantiers/nouveau?client=${data[0].id}`)
    }
  }

  const estCouple = ['M. et Mme', 'Mme et Mme', 'M. et M.'].includes(form.civilite)

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/clients')} className="text-gray-400 hover:text-gray-600 text-sm">
          ← Retour
        </button>
        <h1 className="text-lg font-bold text-blue-900">Nouveau client</h1>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Identité */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <h2 className="font-semibold text-gray-800">Identité</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Civilité *</label>
              <select
                value={form.civilite}
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

            {/* Personne 1 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Prénom {estCouple ? '1' : ''} *
                </label>
                <input
                  type="text"
                  required
                  value={form.prenom}
                  onChange={e => set('prenom', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nom {estCouple ? '1' : ''} *
                </label>
                <input
                  type="text"
                  required
                  value={form.nom}
                  onChange={e => set('nom', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Personne 2 — couple uniquement */}
            {estCouple && (
              <div className="grid grid-cols-2 gap-4 pt-3 border-t border-gray-100">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prénom 2 *</label>
                  <input
                    type="text"
                    required
                    value={form.prenom2}
                    onChange={e => set('prenom2', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom 2 *</label>
                  <input
                    type="text"
                    required
                    value={form.nom2}
                    onChange={e => set('nom2', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}

            {/* Contact */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
                <input
                  type="tel"
                  value={form.telephone}
                  onChange={e => set('telephone', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Adresse Client</label>
              <input
                type="text"
                value={form.adresse}
                onChange={e => set('adresse', e.target.value)}
                placeholder="13500 Martigues"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">Adresse chantier</label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.adresse_chantier_identique}
                    onChange={e => set('adresse_chantier_identique', e.target.checked)}
                    className="w-4 h-4 accent-blue-700"
                  />
                  <span className="text-xs text-gray-500">Identique à l'adresse client</span>
                </label>
              </div>
              {!form.adresse_chantier_identique && (
                <input
                  type="text"
                  value={form.adresse_chantier}
                  onChange={e => set('adresse_chantier', e.target.value)}
                  placeholder="Adresse du chantier"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
              {form.adresse_chantier_identique && (
                <p className="text-xs text-gray-400 py-2">= {form.adresse || 'Adresse client non renseignée'}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type de client</label>
                <select
                  value={form.type_client}
                  onChange={e => set('type_client', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="particulier">Particulier</option>
                  <option value="professionnel">Professionnel</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Référente</label>
                {profile?.role === 'admin' ? (
                  <select
                    value={form.referente}
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
                  <input
                    type="text"
                    disabled
                    value={profile ? `${profile.prenom} ${profile.nom}` : ''}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-400"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Apporteur d'affaires */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">Apporteur d'affaires</h2>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.apporteur_affaires}
                  onChange={e => set('apporteur_affaires', e.target.checked)}
                  className="w-4 h-4 accent-blue-700"
                />
                <span className="text-sm text-gray-600">Oui</span>
              </label>
            </div>

            {form.apporteur_affaires && (
              <div className="space-y-4 pt-2 border-t border-gray-100">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom de l'apporteur</label>
                  <input
                    type="text"
                    value={form.apporteur_nom}
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
                      value={form.apporteur_pourcentage}
                      onChange={e => set('apporteur_pourcentage', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Calculé sur</label>
                    <select
                      value={form.apporteur_base}
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

          {erreur && <p className="text-red-500 text-sm">{erreur}</p>}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.push('/clients')}
              className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-50 text-sm"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-800 text-white py-2 rounded-lg hover:bg-blue-900 text-sm font-medium disabled:opacity-50"
            >
              {loading ? 'Enregistrement...' : 'Créer le client'}
            </button>
          </div>

        </form>
      </main>
    </div>
  )
}