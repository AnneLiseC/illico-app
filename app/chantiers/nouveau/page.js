'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { formatNomClient } from '../../lib/clients'
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
    description: '',
    typologie: 'courtage',
    frais_consultation: '',
    frais_statut: 'offerts',
    date_limite_devis: '',
    part_agente: null,
    apporteur_actif: false,
    adresse_chantier: '',
    adresse_chantier_identique: true,
  })


  useEffect(() => {
    if (!clientId) { router.replace('/chantiers?nouveau=1'); return }
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      setProfile(profData)

      setForm(f => ({ ...f, part_agente: parseFloat(profData?.part_agente_defaut ?? 0.5) }))

      if (clientId) {
        const { data: clientData } = await supabase
          .from('clients')
          .select('*, referente_id:referente, referente:profiles!clients_referente_fkey(id, prenom, nom)')
          .eq('id', clientId)
          .single()
        setClient(clientData)
      }
    }
    init()
  }, [router, clientId])

  const set = (champ, valeur) => setForm(f => ({ ...f, [champ]: valeur }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setErreur('')

    // Garde-fou : interdiction de créer un dossier pour un client archivé.
    // Dernier rempart (le sélecteur et le bouton fiche seront masqués aux Lots 3-4) ;
    // re-test ici au cas où le client serait archivé entre le chargement et l'envoi.
    if (client?.archive) {
      setErreur('Ce client est archivé, désarchivez-le d\'abord.')
      setLoading(false)
      return
    }

    // D18 : le dossier hérite de l'agence de son client.
    if (!client?.agence_id) {
      setErreur('Agence du client introuvable — recharge la page.')
      setLoading(false)
      return
    }

    // Adresse chantier : identique = adresse du client, sinon la saisie manuelle.
    const adresseChantier = form.adresse_chantier_identique
      ? (client?.adresse || null)
      : (form.adresse_chantier || null)

    try {
      const { data, error } = await supabase.from('dossiers').insert({
        client_id: clientId,
        referente_id: client?.referente_id || profile?.id,
        agence_id: client.agence_id,
        adresse_chantier: adresseChantier,
        typologie: form.typologie,
        statut: null, // NULL = pas d'override manuel → calcStatut décide (a_contacter à la création)
        frais_consultation: form.frais_consultation ? parseFloat(form.frais_consultation) : null,
        description: form.description || null,
        frais_statut: form.frais_statut,
        date_limite_devis: form.date_limite_devis || null,
        part_agente: form.part_agente ?? profile?.part_agente_defaut ?? 0.5,
        frais_part_agente: profile?.frais_part_agente_defaut ?? null,
        apporteur_actif: form.apporteur_actif,
      }).select()

      if (error) {
        setErreur('Erreur : ' + error.message)
      } else if (data?.[0]?.id) {
        router.push(`/chantiers/${data[0].id}`)
      } else {
        setErreur('Erreur : impossible de créer le chantier.')
      }
    } catch (err) {
      setErreur('Erreur inattendue : ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const nomComplet = formatNomClient(client, { civilite: true })

  return (
    <div className="page-enter min-h-screen bg-gray-50">

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
        {client?.archive ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl">📦</span>
              <div>
                <h2 className="font-semibold text-amber-900">Client archivé</h2>
                <p className="text-sm text-amber-700 mt-1">
                  Ce client est archivé. Désarchivez-le d&apos;abord pour créer un dossier.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => router.push(`/clients/${clientId}`)}
              className="border border-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-50 text-sm"
            >
              ← Retour à la fiche client
            </button>
          </div>
        ) : (
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

          {/* Adresse du chantier */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-3">
            <h2 className="font-semibold text-gray-800">Adresse du chantier</h2>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={form.adresse_chantier_identique}
                onChange={e => set('adresse_chantier_identique', e.target.checked)} className="w-4 h-4" />
              Identique à l&apos;adresse du client
            </label>
            {form.adresse_chantier_identique ? (
              <p className="text-xs text-gray-400">{client?.adresse || 'Adresse client non renseignée'}</p>
            ) : (
              <input type="text" value={form.adresse_chantier}
                onChange={e => set('adresse_chantier', e.target.value)}
                placeholder="Adresse du chantier"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            )}
          </div>

          {/* Description */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-3">
            <h2 className="font-semibold text-gray-800">Description</h2>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={4}
              placeholder="Décrivez les travaux envisagés, le contexte du projet..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Typologie */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <h2 className="font-semibold text-gray-800">Type de mission</h2>

            <div className="grid grid-cols-1 gap-2">
              {[
                { value: 'courtage', label: 'Courtage', desc: 'Mise en relation avec artisans, commission 6%' },
                { value: 'amo', label: 'AMO', desc: 'Assistance à maîtrise d\'ouvrage, commission 15%' },
                { value: 'estimo', label: 'Estimo', desc: 'Estimation de travaux' },
                { value: 'merad', label: 'MERAD', desc: 'Mise en relation avec artisans' },
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
                    ⚠️ Le courtage ne démarrera qu&apos;après règlement des frais de consultation
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

          {/* Apporteur (coût sortant) — visible si le client a un apporteur */}
          {client?.apporteur_affaires && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-semibold text-gray-800">
                    Apporteur{client.apporteur_nom ? ` · ${client.apporteur_nom}` : ''} <span className="font-normal text-gray-400 text-sm">(coût)</span>
                  </h2>
                  <p className="text-xs text-gray-500 mt-1">
                    {client.apporteur_pourcentage != null && client.apporteur_pourcentage !== ''
                      ? <>{parseFloat(client.apporteur_pourcentage)}% · {client.apporteur_base === 'total_chantier' ? 'sur total chantier HT' : 'par devis signé'}</>
                      : <span className="text-amber-700">taux à définir, coût non calculé</span>}
                  </p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={form.apporteur_actif}
                    onChange={e => set('apporteur_actif', e.target.checked)}
                    className="w-3.5 h-3.5 accent-blue-700"
                  />
                  <span className={`text-sm font-medium ${form.apporteur_actif ? 'text-blue-800' : 'text-gray-500'}`}>
                    Appliquer à ce chantier
                  </span>
                </label>
              </div>
            </div>
          )}

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
        )}
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