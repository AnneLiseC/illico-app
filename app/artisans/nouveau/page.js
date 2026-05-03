'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'

export default function NouvelArtisan() {
  const [profile, setProfile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [erreur, setErreur] = useState('')
  const [form, setForm] = useState({
    entreprise: '',
    prenom: '',
    nom: '',
    email: '',
    telephone: '',
    metier: '',
    code_postal: '',
    ville: '',
    decennale_expiration: '',
    sans_royalties: false,
  })
  const [fichiers, setFichiers] = useState({
    kbis: null,
    decennale: null,
  })
  const router = useRouter()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profData } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(profData)
    }
    init()
  }, [router])

  const set = (champ, valeur) => setForm(f => ({ ...f, [champ]: valeur }))

  const handleSubmit = async () => {
    if (!form.entreprise.trim()) {
      setErreur('Le nom de l\'entreprise est obligatoire.')
      return
    }
    setSaving(true)
    setErreur('')

    // Créer l'artisan
    const { data: artisanInsere, error } = await supabase
      .from('artisans')
      .insert({
        entreprise: form.entreprise.trim(),
        prenom: form.prenom.trim() || null,
        nom: form.nom.trim() || null,
        email: form.email.trim() || null,
        telephone: form.telephone.trim() || null,
        metier: form.metier.trim() || null,
        code_postal: form.code_postal.trim() || null,
        ville: form.ville.trim() || null,
        decennale_expiration: form.decennale_expiration || null,
        sans_royalties: form.sans_royalties,
      })
      .select()
      .single()

    if (error) {
      setErreur('Erreur : ' + error.message)
      setSaving(false)
      return
    }

    const artisanId = artisanInsere.id

    // Upload Kbis si fourni
    if (fichiers.kbis) {
      const ext = fichiers.kbis.name.split('.').pop()
      const chemin = `artisans/${artisanId}/kbis.${ext}`
      const { error: uploadError } = await supabase.storage.from('documents').upload(chemin, fichiers.kbis)
      if (!uploadError) {
        await supabase.from('artisans').update({ kbis_url: chemin }).eq('id', artisanId)
      }
    }

    // Upload Décennale si fournie
    if (fichiers.decennale) {
      const ext = fichiers.decennale.name.split('.').pop()
      const chemin = `artisans/${artisanId}/decennale.${ext}`
      const { error: uploadError } = await supabase.storage.from('documents').upload(chemin, fichiers.decennale)
      if (!uploadError) {
        await supabase.from('artisans').update({ decennale_url: chemin }).eq('id', artisanId)
      }
    }

    router.push(`/artisans/${artisanId}`)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/artisans')} className="text-gray-400 hover:text-gray-600 text-sm">
            ← Retour
          </button>
          <h1 className="text-lg font-bold text-blue-900">Nouvel artisan</h1>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/artisans')}
            className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">
            Annuler
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="bg-blue-800 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-900 disabled:opacity-50">
            {saving ? 'Enregistrement...' : 'Créer l\'artisan'}
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {erreur && <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-2">{erreur}</p>}

        {/* Informations */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">Informations</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Entreprise *</label>
            <input type="text" value={form.entreprise} onChange={e => set('entreprise', e.target.value)}
              placeholder="Nom de l'entreprise"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prénom contact</label>
              <input type="text" value={form.prenom} onChange={e => set('prenom', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom contact</label>
              <input type="text" value={form.nom} onChange={e => set('nom', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
              <input type="tel" value={form.telephone} onChange={e => set('telephone', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Métier</label>
              <input type="text" value={form.metier} onChange={e => set('metier', e.target.value)}
                placeholder="ex: Plombier"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Code postal</label>
              <input type="text" value={form.code_postal} onChange={e => set('code_postal', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ville</label>
              <input type="text" value={form.ville} onChange={e => set('ville', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <label className="flex items-center gap-3 cursor-pointer select-none pt-1">
            <input type="checkbox" checked={form.sans_royalties} onChange={e => set('sans_royalties', e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <span className="text-sm text-gray-700">Sans royalties illiCO <span className="text-gray-400">(architectes, BET…)</span></span>
          </label>
        </div>

        {/* Documents administratifs */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">Documents administratifs</h2>

          {/* Kbis */}
          <div className="flex items-center justify-between p-3 border border-gray-100 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-800">Kbis</p>
              <p className="text-xs text-gray-400">Extrait Kbis de l'entreprise</p>
            </div>
            <label className="cursor-pointer text-xs px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-700">
              {fichiers.kbis ? `✓ ${fichiers.kbis.name}` : '+ Ajouter PDF'}
              <input type="file" accept=".pdf" className="hidden"
                onChange={e => setFichiers(f => ({ ...f, kbis: e.target.files[0] || null }))} />
            </label>
          </div>

          {/* Décennale */}
          <div className="flex items-center justify-between p-3 border border-gray-100 rounded-lg">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-800">Décennale</p>
              <div className="mt-1 flex items-center gap-2">
                <label className="text-xs text-gray-500">Expiration</label>
                <input type="date" value={form.decennale_expiration}
                  onChange={e => set('decennale_expiration', e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
            </div>
            <label className="cursor-pointer text-xs px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-700">
              {fichiers.decennale ? `✓ ${fichiers.decennale.name}` : '+ Ajouter PDF'}
              <input type="file" accept=".pdf" className="hidden"
                onChange={e => setFichiers(f => ({ ...f, decennale: e.target.files[0] || null }))} />
            </label>
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={() => router.push('/artisans')}
            className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm hover:bg-gray-50">
            Annuler
          </button>
          <button onClick={handleSubmit} disabled={saving || !form.entreprise.trim()}
            className="flex-1 bg-blue-800 text-white py-2.5 rounded-lg text-sm hover:bg-blue-900 disabled:opacity-50">
            {saving ? 'Enregistrement...' : 'Créer l\'artisan'}
          </button>
        </div>
      </main>
    </div>
  )
}