'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import NavBar from '../components/navbar'

export default function MessageriePage() {
  const router = useRouter()
  const [profile, setProfile] = useState(null)
  const [dossiers, setDossiers] = useState([])
  const [dossierId, setDossierId] = useState(null)
  const [messages, setMessages] = useState([])
  const [reponse, setReponse] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(prof)

      // Charger chantiers AMO avec compte de messages non lus
      const { data: dossData } = await supabase
        .from('dossiers')
        .select('id, reference, client:clients(prenom, nom, raison_sociale)')
        .eq('typologie', 'amo')
        .order('reference')
      if (!dossData) { setLoading(false); return }

      // Pour chaque dossier, compter les messages non lus
      const dossiersAvecMsgs = await Promise.all(dossData.map(async (d) => {
        const { count } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('dossier_id', d.id)
          .eq('auteur_role', 'client')
          .eq('lu_agence', false)
        return { ...d, nbNonLus: count || 0 }
      }))

      setDossiers(dossiersAvecMsgs)
      setLoading(false)

      // Ouvrir le premier chantier avec des messages non lus, sinon le premier
      const premier = dossiersAvecMsgs.find(d => d.nbNonLus > 0) || dossiersAvecMsgs[0]
      if (premier) setDossierId(premier.id)
    }
    init()
  }, [router])

  // Charger messages quand dossier change
  useEffect(() => {
    if (!dossierId) return
    const charger = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*, auteur:profiles(prenom, nom, role)')
        .eq('dossier_id', dossierId)
        .order('created_at', { ascending: true })
      setMessages(data || [])
      // Marquer comme lus
      await supabase.from('messages')
        .update({ lu_agence: true })
        .eq('dossier_id', dossierId)
        .eq('auteur_role', 'client')
        .eq('lu_agence', false)
      // Mettre à jour le compteur local
      setDossiers(prev => prev.map(d => d.id === dossierId ? { ...d, nbNonLus: 0 } : d))
    }
    charger()
  }, [dossierId])

  // Scroll en bas à chaque nouveau message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const envoyer = async () => {
    if (!reponse.trim() || !profile) return
    setSending(true)
    const { data: newMsg } = await supabase.from('messages').insert({
      dossier_id: dossierId,
      auteur_id: profile.id,
      auteur_role: profile.role === 'admin' ? 'admin' : 'agente',
      contenu: reponse.trim(),
      lu: false,
      lu_agence: true,
    }).select('*, auteur:profiles(prenom, nom, role)').single()
    if (newMsg) setMessages(prev => [...prev, newMsg])
    setReponse('')
    setSending(false)
  }

  const nomClient = (d) => {
    const c = d.client
    if (!c) return d.reference
    return c.raison_sociale || `${c.prenom || ''} ${c.nom || ''}`.trim() || d.reference
  }

  if (loading) return (
    <>
      <NavBar />
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Chargement...</p>
      </div>
    </>
  )

  const dossierActif = dossiers.find(d => d.id === dossierId)

  return (
    <>
      <NavBar />
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
          <h1 className="text-xl font-bold text-gray-800 mb-4">Messagerie</h1>

          <div className="flex gap-4 h-[calc(100vh-160px)]">

            {/* Liste des chantiers */}
            <div className="w-64 flex-shrink-0 bg-white border border-gray-200 rounded-xl overflow-y-auto">
              {dossiers.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8 px-4">Aucun chantier AMO</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {dossiers.map(d => (
                    <button
                      key={d.id}
                      onClick={() => setDossierId(d.id)}
                      className={`w-full text-left px-4 py-3 transition-colors ${d.id === dossierId ? 'bg-blue-50 border-l-2 border-blue-800' : 'hover:bg-gray-50'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className={`text-sm font-medium truncate ${d.id === dossierId ? 'text-blue-800' : 'text-gray-800'}`}>{d.reference}</p>
                          <p className="text-xs text-gray-500 truncate">{nomClient(d)}</p>
                        </div>
                        {d.nbNonLus > 0 && (
                          <span className="flex-shrink-0 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-medium">
                            {d.nbNonLus}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Zone de conversation */}
            <div className="flex-1 flex flex-col bg-white border border-gray-200 rounded-xl overflow-hidden">
              {!dossierId ? (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-sm text-gray-400">Sélectionnez un chantier</p>
                </div>
              ) : (
                <>
                  {/* En-tête conversation */}
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-800 text-sm">{dossierActif?.reference}</p>
                      <p className="text-xs text-gray-500">{dossierActif ? nomClient(dossierActif) : ''}</p>
                    </div>
                    <button
                      onClick={() => router.push(`/chantiers/${dossierId}`)}
                      className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      Voir le dossier →
                    </button>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
                    {messages.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-8">Aucun message pour ce chantier</p>
                    ) : (
                      messages.map(msg => {
                        const isClient = msg.auteur_role === 'client'
                        return (
                          <div key={msg.id} className={`flex ${isClient ? 'justify-start' : 'justify-end'}`}>
                            <div className={`max-w-xs sm:max-w-md rounded-2xl px-3 py-2 ${isClient ? 'bg-white border border-gray-200' : 'bg-blue-800'}`}>
                              <p className={`text-xs font-medium mb-0.5 ${isClient ? 'text-gray-500' : 'text-blue-200'}`}>
                                {isClient ? `${msg.auteur?.prenom || 'Client'} (client)` : `${msg.auteur?.prenom || 'Équipe'}`}
                              </p>
                              <p className={`text-sm ${isClient ? 'text-gray-800' : 'text-white'}`}>{msg.contenu}</p>
                              <p className={`text-xs mt-1 opacity-60 ${isClient ? 'text-gray-500' : 'text-white'}`}>
                                {new Date(msg.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                        )
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Champ de réponse */}
                  <div className="p-3 border-t border-gray-100 bg-white flex gap-2">
                    <input
                      type="text"
                      value={reponse}
                      onChange={e => setReponse(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !e.shiftKey && envoyer()}
                      placeholder="Répondre au client..."
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={envoyer}
                      disabled={!reponse.trim() || sending}
                      className="bg-blue-800 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-900 disabled:opacity-50 flex-shrink-0"
                    >
                      {sending ? '...' : 'Envoyer'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
