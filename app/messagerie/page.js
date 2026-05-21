'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '../lib/auth-context'

export default function MessageriePage() {
  const router = useRouter()
  const { user, profile, initialized } = useAuth()
  const [dossiers, setDossiers] = useState([])
  const [dossierId, setDossierId] = useState(null)
  const [messages, setMessages] = useState([])
  const [reponse, setReponse] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    if (!initialized) return
    if (!user) { router.replace('/login'); return }
    if (!profile) return

    const chargerDossiers = async () => {
      const { data: dossData } = await supabase
        .from('dossiers')
        .select('id, reference, client:clients(prenom, nom, raison_sociale)')
        .eq('typologie', 'amo')
        .order('reference')

      if (!dossData) { setLoading(false); return }

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

      const premier = dossiersAvecMsgs.find(d => d.nbNonLus > 0) || dossiersAvecMsgs[0]
      if (premier) setDossierId(premier.id)
    }

    chargerDossiers()
  }, [initialized, user?.id, profile?.id, router])

  // Charger messages quand dossier change + realtime
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

    // Realtime : nouveaux messages sur ce dossier
    const channel = supabase
      .channel(`messagerie:${dossierId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `dossier_id=eq.${dossierId}` },
        () => charger())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [dossierId])

  // Realtime global : MAJ compteur de non-lus dans la sidebar
  useEffect(() => {
    if (!profile) return
    const channel = supabase
      .channel('messagerie-global')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'auteur_role=eq.client' },
        (payload) => {
          const newMsg = payload.new
          if (!newMsg) return
          setDossiers(prev => prev.map(d =>
            d.id === newMsg.dossier_id && d.id !== dossierId
              ? { ...d, nbNonLus: (d.nbNonLus || 0) + 1 }
              : d
          ))
        })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile?.id, dossierId])

  // Scroll en bas à chaque nouveau message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const envoyer = async () => {
    if (!reponse.trim() || !profile) return
    setSending(true)
    const { data: newMsg, error } = await supabase.from('messages').insert({
      dossier_id: dossierId,
      auteur_id: profile.id,
      auteur_role: profile.role === 'admin' ? 'admin' : 'agente',
      contenu: reponse.trim(),
      lu: false,
      lu_agence: true,
    }).select('*, auteur:profiles(prenom, nom, role)').single()
    if (error) {
      alert('Erreur lors de l\'envoi : ' + error.message)
    } else {
      if (newMsg) setMessages(prev => [...prev, newMsg])
      setReponse('')
    }
    setSending(false)
  }

  const nomClient = (d) => {
    const c = d.client
    if (!c) return d.reference
    return c.raison_sociale || `${c.prenom || ''} ${c.nom || ''}`.trim() || d.reference
  }

  if (!initialized || !profile || loading) return (
    <div style={{paddingTop:96, textAlign:'center', color:'var(--ink-400)'}}>
      Chargement…
    </div>
  )

  const dossierActif = dossiers.find(d => d.id === dossierId)

  return (
    <div className="page-enter page-pad" style={{display:'flex', flexDirection:'column', gap:18}}>

      {/* En-tête */}
      <div>
        <div className="eyebrow" style={{marginBottom:4}}>Communication</div>
        <h1 className="page">Messagerie AMO</h1>
        <div style={{color:'var(--ink-500)', fontSize:13, marginTop:6}}>
          {dossiers.length} conversation(s) · uniquement les dossiers AMO
        </div>
      </div>

      {/* Layout deux colonnes */}
      <div className="card" style={{padding:0, overflow:'hidden', display:'grid', gridTemplateColumns:'300px 1fr', minHeight:560}}>

        {/* ── Liste des dossiers AMO ── */}
        <div style={{borderRight:'1px solid var(--ink-200)', display:'flex', flexDirection:'column'}}>
          {dossiers.length === 0 ? (
            <div style={{padding:32, textAlign:'center', color:'var(--ink-400)', fontSize:13}}>
              Aucun chantier AMO
            </div>
          ) : (
            dossiers.map(d => (
              <button
                key={d.id}
                onClick={() => setDossierId(d.id)}
                className={d.id !== dossierId ? 'row-hover' : ''}
                style={{
                  width:'100%', textAlign:'left', padding:'14px 16px',
                  display:'flex', alignItems:'center', justifyContent:'space-between', gap:8,
                  borderBottom:'1px solid var(--ink-100)', cursor:'pointer', border:0,
                  background: d.id === dossierId ? 'var(--brand-50)' : 'transparent',
                }}>
                <div style={{minWidth:0}}>
                  <div style={{fontWeight:700, color: d.id === dossierId ? 'var(--brand-800)' : 'var(--ink-900)', fontSize:13}} className="clip-1">
                    {d.reference}
                  </div>
                  <div style={{fontSize:12, color:'var(--ink-500)', marginTop:2}} className="clip-1">
                    {nomClient(d)}
                  </div>
                </div>
                {d.nbNonLus > 0 && (
                  <span style={{background:'var(--brand-500)', color:'#fff', borderRadius:99, padding:'1px 7px', fontSize:10, fontWeight:700, flexShrink:0}}>
                    {d.nbNonLus}
                  </span>
                )}
              </button>
            ))
          )}
        </div>

        {/* ── Zone de conversation ── */}
        <div style={{display:'flex', flexDirection:'column'}}>
          {!dossierId ? (
            <div style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:48}}>
              <div style={{color:'var(--ink-400)', fontSize:13}}>Sélectionnez un chantier</div>
            </div>
          ) : (
            <>
              {/* En-tête conversation */}
              <div style={{padding:'14px 22px', borderBottom:'1px solid var(--ink-200)', display:'flex', alignItems:'center', gap:12}}>
                <div style={{
                  width:38, height:38, borderRadius:12, flexShrink:0,
                  background:'var(--brand-50)', color:'var(--brand-800)',
                  display:'grid', placeItems:'center', fontSize:15, fontWeight:800,
                }}>
                  {(dossierActif ? nomClient(dossierActif) : '').charAt(0).toUpperCase()}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700, color:'var(--ink-900)'}}>{dossierActif ? nomClient(dossierActif) : ''}</div>
                  <div className="mono" style={{fontSize:11.5, color:'var(--ink-500)'}}>{dossierActif?.reference}</div>
                </div>
                <button className="btn btn-ghost" style={{fontSize:12}} onClick={() => router.push(`/chantiers/${dossierId}`)}>
                  Voir le dossier →
                </button>
              </div>

              {/* Messages */}
              <div style={{flex:1, overflowY:'auto', padding:'24px 22px', display:'flex', flexDirection:'column', gap:14, background:'var(--surface-2)'}}>
                {messages.length === 0 ? (
                  <div style={{textAlign:'center', color:'var(--ink-400)', fontSize:13, paddingTop:32}}>
                    Aucun message pour ce chantier
                  </div>
                ) : (
                  messages.map(msg => {
                    const isClient = msg.auteur_role === 'client'
                    return (
                      <div key={msg.id} style={{display:'flex', justifyContent: isClient ? 'flex-start' : 'flex-end'}}>
                        <div style={{
                          maxWidth:420, padding:'10px 14px', fontSize:13.5, lineHeight:1.5,
                          background: isClient ? '#fff' : 'var(--brand-500)',
                          color: isClient ? 'var(--ink-800)' : '#fff',
                          borderRadius: isClient ? '12px 12px 12px 4px' : '12px 12px 4px 12px',
                          boxShadow: isClient ? '0 1px 2px rgba(0,0,0,0.04)' : undefined,
                        }}>
                          <div style={{fontSize:11.5, fontWeight:600, marginBottom:4, color: isClient ? 'var(--ink-500)' : 'rgba(255,255,255,0.7)'}}>
                            {isClient ? `${msg.auteur?.prenom || 'Client'} (client)` : `${msg.auteur?.prenom || 'Équipe'}`}
                          </div>
                          <div>{msg.contenu}</div>
                          <div style={{fontSize:11, marginTop:4, opacity:0.6}}>
                            {new Date(msg.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Champ de réponse */}
              <div style={{padding:'14px 18px', borderTop:'1px solid var(--ink-200)', display:'flex', gap:10, alignItems:'center'}}>
                <input
                  className="input"
                  type="text"
                  value={reponse}
                  onChange={e => setReponse(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && envoyer()}
                  placeholder="Répondre au client…"
                  style={{flex:1, height:42}}
                />
                <button
                  className="btn btn-primary"
                  onClick={envoyer}
                  disabled={!reponse.trim() || sending}
                  style={{height:42, flexShrink:0}}>
                  {sending ? '…' : 'Envoyer'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
