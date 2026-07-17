'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../lib/auth-context'

const FORMES_JURIDIQUES = ['SCI', 'SARL', 'EURL', 'SAS', 'SASU', 'SA', 'SNC', 'SCEA', 'SCM', 'auto-entrepreneur / micro-entreprise', 'EI']

export default function NouveauClient() {
  const { user, profile, initialized, agences, agenceActive } = useAuth()
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [erreur, setErreur] = useState('')
  const router = useRouter()

  const [form, setForm] = useState({
    civilite: 'M.',
    nom: '',
    prenom: '',
    nom2: '',
    prenom2: '',
    forme_juridique: '',
    raison_sociale: '',
    representant_nom: '',
    representant_prenom: '',
    siret: '',
    email: '',
    email2: '',
    telephone: '',
    telephone2: '',
    adresse: '',
    adresse_chantier: '',
    adresse_chantier_identique: true,
    type_client: 'particulier',
    referente: '',
    apporteur_affaires: false,
    apporteur_nom: '',
    apporteur_pourcentage: '',
    apporteur_base: 'total_chantier',
    notes: '',
    agence_id: '',
  })

  useEffect(() => {
    if (!initialized) return
    if (!user) { router.push('/login'); return }
    if (!profile) return

    const init = async () => {
      // Récupérer tous les profils agente/admin (agence_id nécessaire pour D18)
      const { data } = await supabase
        .from('profiles')
        .select('id, prenom, nom, role, agence_id')
        .in('role', ['admin', 'agente'])
      setProfiles(data || [])

      // Pré-sélectionner l'utilisateur connecté + défaut agence = vue active.
      setForm(f => ({ ...f, referente: profile.id, agence_id: agenceActive || '' }))
    }
    init()
  }, [initialized, user, profile, router])

  const set = (champ, valeur) => setForm(f => ({ ...f, [champ]: valeur }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setErreur('')

    // Validation identité selon le type de client.
    if (form.type_client === 'professionnel') {
      if (!form.raison_sociale.trim()) {
        setErreur('La raison sociale est obligatoire pour un client professionnel.')
        setLoading(false)
        return
      }
    } else if (!form.nom.trim() || !form.prenom.trim()) {
      setErreur('Le nom et le prénom sont obligatoires.')
      setLoading(false)
      return
    }

    // D18 : agence_id = agence de la référente sélectionnée.
    // Une agente crée toujours pour elle-même (sélecteur disabled côté agente) :
    // on prend directement profile.agence_id, indépendamment de form.referente.
    let agenceId = null
    if (profile?.role === 'agente') {
      agenceId = profile.agence_id
    } else {
      const referenteSel = profiles.find(p => p.id === form.referente)
      if (referenteSel?.role === 'agente') {
        agenceId = referenteSel.agence_id
      } else if (referenteSel?.role === 'admin' && profile?.societe_id) {
        // Admin référente d'elle-même (agence_id NULL) → pas d'agence à déduire.
        if (agences.length >= 2) {
          // Multi-agences : agence choisie au sélecteur, validée appartenance société
          // (la liste agences vient de useAuth, déjà scopée société ; la RLS reste la barrière).
          if (!form.agence_id || !agences.some(a => a.id === form.agence_id)) {
            setErreur('Merci de choisir une agence.')
            setLoading(false)
            return
          }
          agenceId = form.agence_id
        } else {
          // Mono-agence : déduction de l'unique agence (comportement inchangé).
          const { data: ag } = await supabase
            .from('agences').select('id').eq('societe_id', profile.societe_id).order('code').limit(1).single()
          agenceId = ag?.id ?? null
        }
      }
    }
    if (!agenceId) {
      setErreur('Agence introuvable pour le référent sélectionné.')
      setLoading(false)
      return
    }

    const adresseChantier = form.adresse_chantier_identique
      ? form.adresse || null
      : form.adresse_chantier || null

    // Option A : pour un pro, `nom` = raison sociale préfixée de la forme juridique
    // (ex. « SCI Coucou »), prenom = '' ; les champs pro vivent aussi dans leurs colonnes.
    // Pour un particulier, on repart des champs nom/prénom et on met les colonnes pro à null.
    const estPro = form.type_client === 'professionnel'
    const nomFinal = estPro
      ? `${form.forme_juridique ? form.forme_juridique + ' ' : ''}${form.raison_sociale}`.trim()
      : form.nom

    const { data, error } = await supabase.from('clients').insert({
      civilite: form.civilite,
      nom: nomFinal,
      prenom: estPro ? '' : form.prenom,
      nom2: estPro ? null : (form.nom2 || null),
      prenom2: estPro ? null : (form.prenom2 || null),
      forme_juridique: estPro ? (form.forme_juridique || null) : null,
      raison_sociale: estPro ? form.raison_sociale : null,
      representant_nom: estPro ? (form.representant_nom || null) : null,
      representant_prenom: estPro ? (form.representant_prenom || null) : null,
      siret: estPro ? (form.siret || null) : null,
      email: form.email || null,
      email2: form.email2 || null,
      telephone: form.telephone || null,
      telephone2: form.telephone2 || null,
      adresse: form.adresse || null,
      adresse_chantier: adresseChantier,
      type_client: form.type_client,
      referente: form.referente || null,
      apporteur_affaires: form.apporteur_affaires,
      apporteur_nom: form.apporteur_affaires ? form.apporteur_nom : null,
      apporteur_pourcentage: form.apporteur_affaires ? parseFloat(form.apporteur_pourcentage) : null,
      apporteur_base: form.apporteur_affaires ? form.apporteur_base : null,
      notes: form.notes || null,
      agence_id: agenceId,
    }).select()

    if (error) {
      setErreur('Erreur : ' + error.message)
      setLoading(false)
    } else if (data?.[0]?.id) {
      router.push(`/chantiers/nouveau?client=${data[0].id}`)
    } else {
      setErreur('Erreur : impossible de créer le client.')
      setLoading(false)
    }
  }

  const estCouple = ['M. et Mme', 'Mme et Mme', 'M. et M.'].includes(form.civilite)
  // Sélecteur d'agence : seulement si admin, référente = admin (agence_id NULL) et ≥2 agences.
  const referenteSel = profiles.find(p => p.id === form.referente)
  const montrerSelectAgence = profile?.role === 'admin' && referenteSel?.role === 'admin' && agences.length >= 2

  if (!profile) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 96 }}>
      <p className="eyebrow">Chargement…</p>
    </div>
  )

  return (
    <div className="page-enter min-h-screen bg-gray-50">

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

            {/* Type de client — pilote les champs d'identité */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type de client *</label>
              <select
                value={form.type_client}
                onChange={e => set('type_client', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="particulier">Particulier</option>
                <option value="professionnel">Professionnel</option>
              </select>
            </div>

            {form.type_client === 'professionnel' ? (
              <>
                {/* Entreprise */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Forme juridique <span className="text-gray-400 font-normal">(optionnel)</span></label>
                    <select
                      value={form.forme_juridique}
                      onChange={e => set('forme_juridique', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">— Choisir —</option>
                      {FORMES_JURIDIQUES.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Raison sociale *</label>
                    <input
                      type="text"
                      required
                      value={form.raison_sociale}
                      onChange={e => set('raison_sociale', e.target.value)}
                      placeholder="Coucou"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Représentant / gérant — optionnel. La civilité saisie est celle du représentant. */}
                <div className="grid grid-cols-3 gap-4 pt-3 border-t border-gray-100">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Civilité représentant</label>
                    <select
                      value={form.civilite}
                      onChange={e => set('civilite', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="M.">M.</option>
                      <option value="Mme">Mme</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Prénom représentant <span className="text-gray-400 font-normal">(optionnel)</span></label>
                    <input
                      type="text"
                      value={form.representant_prenom}
                      onChange={e => set('representant_prenom', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nom représentant <span className="text-gray-400 font-normal">(optionnel)</span></label>
                    <input
                      type="text"
                      value={form.representant_nom}
                      onChange={e => set('representant_nom', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SIRET <span className="text-gray-400 font-normal">(optionnel)</span></label>
                  <input
                    type="text"
                    value={form.siret}
                    onChange={e => set('siret', e.target.value)}
                    placeholder="123 456 789 00012"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </>
            ) : (
              <>
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
                      <label className="block text-sm font-medium text-gray-700 mb-1">Prénom 2 <span className="text-gray-400 font-normal">(optionnel)</span></label>
                      <input
                        type="text"
                        value={form.prenom2}
                        onChange={e => set('prenom2', e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nom 2 <span className="text-gray-400 font-normal">(optionnel)</span></label>
                      <input
                        type="text"
                        value={form.nom2}
                        onChange={e => set('nom2', e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Contact */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email 1</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email 2 <span className="text-gray-400 font-normal">(optionnel)</span></label>
                <input
                  type="email"
                  value={form.email2}
                  onChange={e => set('email2', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tél 1</label>
                <input
                  type="tel"
                  value={form.telephone}
                  onChange={e => set('telephone', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tél 2 <span className="text-gray-400 font-normal">(optionnel)</span></label>
                <input
                  type="tel"
                  value={form.telephone2}
                  onChange={e => set('telephone2', e.target.value)}
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
                  <span className="text-xs text-gray-500">Identique à l&apos;adresse client</span>
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
                        {p.prenom} {p.nom} ({p.role === 'admin' ? 'Franchisé' : 'Agent'})
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
              {montrerSelectAgence && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Agence de rattachement</label>
                  <select
                    value={form.agence_id}
                    onChange={e => set('agence_id', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— Choisir une agence —</option>
                    {agences.map(ag => (
                      <option key={ag.id} value={ag.id}>{ag.nom}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Apporteur d'affaires */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">Apporteur d&apos;affaires</h2>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom de l&apos;apporteur</label>
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

          {/* Notes */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <h2 className="font-semibold text-gray-800">Notes</h2>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={4}
              placeholder="Informations complémentaires sur le client..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            />
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
              disabled={loading || (montrerSelectAgence && !form.agence_id)}
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