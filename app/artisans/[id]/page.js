'use client'
import { useState, useEffect, use } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'

export default function FicheArtisan({ params }) {
  const { id } = use(params)
  const [artisan, setArtisan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [erreur, setErreur] = useState('')
  const [succes, setSucces] = useState('')
  const [mode, setMode] = useState('lecture')
  const [fichesTechniques, setFichesTechniques] = useState([])
  const [ajouterFiche, setAjouterFiche] = useState(false)
  const [savingFiche, setSavingFiche] = useState(false)
  const [nouvelleFiche, setNouvelleFiche] = useState({ nom: '', description: '', fichier: null })
  const [UploadEnCours, setUploadEnCours] = useState({})
  const router = useRouter()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data } = await supabase
        .from('artisans')
        .select('*')
        .eq('id', id)
        .single()
      setArtisan(data)

      const { data: fichesData } = await supabase
        .from('fiches_techniques')
        .select('*')
        .eq('artisan_id', id)
        .order('nom')
      setFichesTechniques(fichesData || [])

      setLoading(false)
    }
    init()
  }, [id, router])

  const set = (champ, valeur) => setArtisan(a => ({ ...a, [champ]: valeur }))

  const chargerFiches = async () => {
    const { data } = await supabase
      .from('fiches_techniques')
      .select('*')
      .eq('artisan_id', id)
      .order('nom')
    setFichesTechniques(data || [])
  }

  const handleSave = async () => {
    setSaving(true)
    setErreur('')
    setSucces('')

    const { error } = await supabase
      .from('artisans')
      .update({
        entreprise: artisan.entreprise,
        nom: artisan.nom,
        prenom: artisan.prenom,
        email: artisan.email,
        telephone: artisan.telephone,
        code_postal: artisan.code_postal,
        ville: artisan.ville,
        metier: artisan.metier,
        decennale_expiration: artisan.decennale_expiration,
        sans_royalties: artisan.sans_royalties || false,
        rib_iban: artisan.rib_iban || null,
        rib_bic: artisan.rib_bic || null,
        rib_titulaire: artisan.rib_titulaire || null,
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

  const uploadFichier = async (fichier, type) => {
    setUploadEnCours(u => ({ ...u, [type]: true }))
    setErreur('')

    const ext = fichier.name.split('.').pop()
    const chemin = `artisans/${id}/${type}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(chemin, fichier, { upsert: true })

    if (uploadError) {
      setErreur('Erreur upload : ' + uploadError.message)
      setUploadEnCours(u => ({ ...u, [type]: false }))
      return
    }

    const champ = type === 'kbis' ? 'kbis_url'
      : type === 'decennale' ? 'decennale_url'
      : type === 'qualification' ? 'qualification_url'
      : 'fiche_technique_url'

    await supabase.from('artisans').update({ [champ]: chemin }).eq('id', id)
    setArtisan(a => ({ ...a, [champ]: chemin }))
    setSucces(`${type} uploadé avec succès ✓`)
    setUploadEnCours(u => ({ ...u, [type]: false }))
  }

  const sauvegarderFiche = async () => {
    if (!nouvelleFiche.nom) return
    setSavingFiche(true)

    let url = null

    if (nouvelleFiche.fichier) {
      const ext = nouvelleFiche.fichier.name.split('.').pop()
      const chemin = `artisans/${id}/fiches/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(chemin, nouvelleFiche.fichier)
      if (!uploadError) url = chemin
    }

    const { error } = await supabase.from('fiches_techniques').insert({
      artisan_id: id,
      nom: nouvelleFiche.nom,
      description: nouvelleFiche.description || null,
      url,
    })

    if (!error) {
      await chargerFiches()
      setAjouterFiche(false)
      setNouvelleFiche({ nom: '', description: '', fichier: null })
      setSucces('Fiche technique ajoutée ✓')
    }
    setSavingFiche(false)
  }

  const supprimerFiche = async (ficheId) => {
    if (!confirm('Supprimer cette fiche technique ?')) return
    await supabase.from('fiches_techniques').delete().eq('id', ficheId)
    await chargerFiches()
  }

  const ouvrirDocument = async (chemin) => {
    if (!chemin) return
    const { data } = await supabase.storage
      .from('documents')
      .createSignedUrl(chemin, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const decennaleExp = artisan?.decennale_expiration ? new Date(artisan.decennale_expiration) : null
  const aujourdhui = new Date()
  const diffDecennale = decennaleExp ? (decennaleExp - aujourdhui) / (1000 * 60 * 60 * 24) : null
  const decennaleUrgente = diffDecennale !== null && diffDecennale <= 30 && diffDecennale >= 0
  const decennaleExpiree = diffDecennale !== null && diffDecennale < 0

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Chargement...</p>
    </div>
  )

  if (!artisan) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Artisan introuvable</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">

      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/artisans')} className="text-gray-400 hover:text-gray-600 text-sm">
            ← Retour
          </button>
          <div>
            <h1 className="text-lg font-bold text-blue-900">{artisan.entreprise}</h1>
            <p className="text-xs text-gray-400">{artisan.metier} — {artisan.code_postal} {artisan.ville}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {mode === 'lecture' ? (
            <button onClick={() => setMode('edition')}
              className="bg-blue-800 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-900">
              Modifier
            </button>
          ) : (
            <>
              <button onClick={() => setMode('lecture')}
                className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">
                Annuler
              </button>
              <button onClick={handleSave} disabled={saving}
                className="bg-blue-800 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-900 disabled:opacity-50">
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {succes && <p className="text-green-600 text-sm bg-green-50 border border-green-200 rounded-lg px-4 py-2">{succes}</p>}
        {erreur && <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-2">{erreur}</p>}

        {/* Alerte décennale */}
        {decennaleExpiree && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-sm font-medium text-red-800">❌ Décennale expirée — demander le renouvellement</p>
          </div>
        )}
        {decennaleUrgente && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-sm font-medium text-amber-800">
              ⚠️ Décennale expire le {decennaleExp.toLocaleDateString('fr-FR')} — dans {Math.round(diffDecennale)} jours
            </p>
          </div>
        )}

        {/* Informations */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">Informations</h2>
          {mode === 'lecture' ? (
            <div className="grid grid-cols-2 gap-4">
              {[
                ['Entreprise', artisan.entreprise],
                ['Contact', artisan.prenom || artisan.nom ? `${artisan.prenom || ''} ${artisan.nom || ''}`.trim() : '—'],
                ['Email', artisan.email || '—'],
                ['Téléphone', artisan.telephone || '—'],
                ['Métier', artisan.metier || '—'],
                ['Localisation', `${artisan.code_postal || ''} ${artisan.ville || ''}`.trim() || '—'],
              ].map(([label, valeur]) => (
                <div key={label}>
                  <p className="text-xs text-gray-400 mb-1">{label}</p>
                  <p className="text-sm font-medium text-gray-800">{valeur}</p>
                </div>
              ))}
              {artisan.sans_royalties && (
                <div className="col-span-2">
                  <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full font-medium">
                    ⚠️ Apporteur d'affaires
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Entreprise *</label>
                <input type="text" value={artisan.entreprise || ''} onChange={e => set('entreprise', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prénom contact</label>
                  <input type="text" value={artisan.prenom || ''} onChange={e => set('prenom', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom contact</label>
                  <input type="text" value={artisan.nom || ''} onChange={e => set('nom', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input type="email" value={artisan.email || ''} onChange={e => set('email', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
                  <input type="tel" value={artisan.telephone || ''} onChange={e => set('telephone', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Métier</label>
                  <input type="text" value={artisan.metier || ''} onChange={e => set('metier', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Code postal</label>
                  <input type="text" value={artisan.code_postal || ''} onChange={e => set('code_postal', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ville</label>
                  <input type="text" value={artisan.ville || ''} onChange={e => set('ville', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={artisan.sans_royalties || false}
                      onChange={e => set('sans_royalties', e.target.checked)}
                      className="w-4 h-4 accent-orange-500" />
                    <span className="text-sm text-gray-700">Apporteur d'affaires</span>
                  </label>
                  <span className="text-xs text-gray-400">(bureau d'études, architecte d'intérieur...)</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Documents administratifs */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">Documents administratifs</h2>

          <div className="flex items-center justify-between p-3 border border-gray-100 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-800">Kbis</p>
              <p className="text-xs text-gray-400">Extrait Kbis de l'entreprise</p>
            </div>
            <div className="flex items-center gap-2">
              {artisan.kbis_url && (
                <button onClick={() => ouvrirDocument(artisan.kbis_url)}
                  className="text-blue-600 text-sm hover:underline">Voir →</button>
              )}
              <label className={`cursor-pointer text-xs px-3 py-1.5 rounded-lg border ${
                UploadEnCours.kbis ? 'bg-gray-100 text-gray-400' : 'border-gray-300 hover:bg-gray-50 text-gray-700'
              }`}>
                {UploadEnCours.kbis ? 'Upload...' : artisan.kbis_url ? 'Remplacer' : '+ Ajouter'}
                <input type="file" accept=".pdf" className="hidden"
                  onChange={e => e.target.files[0] && uploadFichier(e.target.files[0], 'kbis')} />
              </label>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 border border-gray-100 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-800">Décennale</p>
              {mode === 'edition' ? (
                <div className="mt-1">
                  <label className="text-xs text-gray-500">Date d'expiration</label>
                  <input type="date" value={artisan.decennale_expiration || ''}
                    onChange={e => set('decennale_expiration', e.target.value)}
                    className="ml-2 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
              ) : (
                <p className={`text-xs mt-0.5 ${decennaleExpiree ? 'text-red-500' : decennaleUrgente ? 'text-amber-500' : 'text-gray-400'}`}>
                  {decennaleExp ? `Expire le ${decennaleExp.toLocaleDateString('fr-FR')}` : 'Date non renseignée'}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {artisan.decennale_url && (
                <button onClick={() => ouvrirDocument(artisan.decennale_url)}
                  className="text-blue-600 text-sm hover:underline">Voir →</button>
              )}
              <label className={`cursor-pointer text-xs px-3 py-1.5 rounded-lg border ${
                UploadEnCours.decennale ? 'bg-gray-100 text-gray-400' : 'border-gray-300 hover:bg-gray-50 text-gray-700'
              }`}>
                {UploadEnCours.decennale ? 'Upload...' : artisan.decennale_url ? 'Remplacer' : '+ Ajouter'}
                <input type="file" accept=".pdf" className="hidden"
                  onChange={e => e.target.files[0] && uploadFichier(e.target.files[0], 'decennale')} />
              </label>
            </div>
          </div>

          {/* Qualification (RGE, Qualibat, etc.) */}
          <div className="flex items-center justify-between p-3 border border-gray-100 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-800">Qualification</p>
              <p className="text-xs text-gray-400">RGE, Qualibat, ou autre qualification (optionnel)</p>
            </div>
            <div className="flex items-center gap-2">
              {artisan.qualification_url && (
                <button onClick={() => ouvrirDocument(artisan.qualification_url)}
                  className="text-blue-600 text-sm hover:underline">Voir →</button>
              )}
              <label className={`cursor-pointer text-xs px-3 py-1.5 rounded-lg border ${
                UploadEnCours.qualification ? 'bg-gray-100 text-gray-400' : 'border-gray-300 hover:bg-gray-50 text-gray-700'
              }`}>
                {UploadEnCours.qualification ? 'Upload...' : artisan.qualification_url ? 'Remplacer' : '+ Ajouter'}
                <input type="file" accept=".pdf" className="hidden"
                  onChange={e => e.target.files[0] && uploadFichier(e.target.files[0], 'qualification')} />
              </label>
            </div>
          </div>
        </div>

        {/* RIB */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">RIB / Coordonnées bancaires</h2>
          {mode === 'lecture' ? (
            <div className="grid grid-cols-2 gap-4">
              {[
                ['Titulaire', artisan.rib_titulaire || '—'],
                ['IBAN', artisan.rib_iban || '—'],
                ['BIC / SWIFT', artisan.rib_bic || '—'],
              ].map(([label, valeur]) => (
                <div key={label}>
                  <p className="text-xs text-gray-400 mb-1">{label}</p>
                  <p className="text-sm font-medium text-gray-800 font-mono">{valeur}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Titulaire du compte</label>
                <input type="text" value={artisan.rib_titulaire || ''} onChange={e => set('rib_titulaire', e.target.value)}
                  placeholder="Nom de l'entreprise ou du titulaire"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">IBAN</label>
                  <input type="text" value={artisan.rib_iban || ''} onChange={e => set('rib_iban', e.target.value.toUpperCase())}
                    placeholder="FR76 XXXX XXXX XXXX"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">BIC / SWIFT</label>
                  <input type="text" value={artisan.rib_bic || ''} onChange={e => set('rib_bic', e.target.value.toUpperCase())}
                    placeholder="BNPAFRPP"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Fiches techniques */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Fiches techniques produits ({fichesTechniques.length})</h2>
            <button onClick={() => setAjouterFiche(true)}
              className="text-sm bg-blue-800 text-white px-3 py-1.5 rounded-lg hover:bg-blue-900">
              + Ajouter
            </button>
          </div>

          {ajouterFiche && (
            <div className="border border-blue-200 bg-blue-50 rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium text-blue-800">Nouvelle fiche technique</p>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nom du produit *</label>
                <input type="text" value={nouvelleFiche.nom}
                  onChange={e => setNouvelleFiche(f => ({ ...f, nom: e.target.value }))}
                  placeholder="ex: Enduit de façade Weber"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                <input type="text" value={nouvelleFiche.description}
                  onChange={e => setNouvelleFiche(f => ({ ...f, description: e.target.value }))}
                  placeholder="Description courte"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">PDF (optionnel)</label>
                <label className="flex items-center gap-3 cursor-pointer">
                    <span className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-700">
                        {nouvelleFiche.fichier ? '✓ ' + nouvelleFiche.fichier.name : '+ Choisir un PDF'}
                    </span>
                        {nouvelleFiche.fichier && (
                    <button type="button"
                        onClick={() => setNouvelleFiche(f => ({ ...f, fichier: null }))}
                        className="text-xs text-red-400 hover:text-red-600">
                        Supprimer
                    </button>
                    )}
                    <input type="file" accept=".pdf" className="hidden"
                        onChange={e => setNouvelleFiche(f => ({ ...f, fichier: e.target.files[0] || null }))} />
                    </label>
                </div>
              <div className="flex gap-2">
                <button onClick={() => { setAjouterFiche(false); setNouvelleFiche({ nom: '', description: '', fichier: null }) }}
                  className="flex-1 border border-gray-300 text-gray-700 py-1.5 rounded-lg text-sm hover:bg-gray-50">
                  Annuler
                </button>
                <button onClick={sauvegarderFiche} disabled={!nouvelleFiche.nom || savingFiche}
                  className="flex-1 bg-blue-800 text-white py-1.5 rounded-lg text-sm hover:bg-blue-900 disabled:opacity-50">
                  {savingFiche ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </div>
          )}

          {fichesTechniques.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Aucune fiche technique</p>
          ) : (
            <div className="space-y-2">
              {fichesTechniques.map(f => (
                <div key={f.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:bg-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{f.nom}</p>
                    {f.description && <p className="text-xs text-gray-400">{f.description}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {f.url && (
                      <button onClick={() => ouvrirDocument(f.url)}
                        className="text-blue-600 text-xs hover:underline">Voir →</button>
                    )}
                    <button onClick={() => supprimerFiche(f.id)}
                      className="text-red-400 text-xs hover:text-red-600">Supprimer</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </main>
    </div>
  )
}