'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '../lib/auth-context'

export default function Clients() {
  const [clients, setClients] = useState([])
  const [agentes, setAgentes] = useState([])
  const [loading, setLoading] = useState(true)
  const [recherche, setRecherche] = useState('')
  const [onglet, setOnglet] = useState('moi')
  const router = useRouter()
  const { user, profile, initialized } = useAuth()

  useEffect(() => {
    if (!initialized) return
    if (!user) { router.push('/login'); return }
    if (!profile) return

    let query = supabase
      .from('clients')
      .select('*, referente:profiles!clients_referente_fkey(id, prenom, nom, role)')
      .order('created_at', { ascending: false })
    if (profile.role === 'agente') query = query.eq('referente', profile.id)

    Promise.all([
      query,
      profile.role === 'admin'
        ? supabase.from('profiles').select('id, prenom, nom').eq('role', 'agente').order('prenom')
        : Promise.resolve({ data: [] }),
    ]).then(([{ data }, { data: agentesData }]) => {
      setClients(data || [])
      setAgentes(agentesData || [])
      setLoading(false)
    })
  }, [initialized, user?.id, profile?.id, router])

  const isMarine = profile?.role === 'admin'

  // Filtrage par onglet (Marine uniquement) — dynamique par ID d'agente
  const clientsFiltresOnglet = clients.filter(c => {
    if (!isMarine) return true
    if (onglet === 'tous') return true
    if (onglet === 'moi') return c.referente?.role === 'admin'
    // Onglet dynamique par agente : clé = ID de l'agente
    return c.referente?.id === onglet
  })

  const clientsFiltres = clientsFiltresOnglet.filter(c =>
    `${c.nom} ${c.prenom} ${c.email} ${c.adresse}`.toLowerCase()
      .includes(recherche.toLowerCase())
  )

  // Onglets dynamiques : "Mes clients" + une tab par agente + "Tous"
  const ongletsList = isMarine ? [
    { key: 'moi', label: 'Mes clients' },
    ...agentes.map(a => ({ key: a.id, label: `Clients ${a.prenom} ${a.nom}` })),
    { key: 'tous', label: 'Tous les clients' },
  ] : []

  // Afficher la colonne référente si on est sur "tous" ou sur un onglet agente
  const afficherReferente = isMarine && (onglet === 'tous' || agentes.some(a => a.id === onglet))

  if (loading) return (
    <div style={{paddingTop:96, textAlign:'center', color:'var(--ink-400)'}}>
      Chargement…
    </div>
  )

  return (
    <div className="page-enter" style={{display:'flex', flexDirection:'column', gap:18}}>

      {/* En-tête */}
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-end', gap:16, flexWrap:'wrap'}}>
        <div>
          <div className="eyebrow" style={{marginBottom:4}}>Contacts</div>
          <h1 className="page">Clients</h1>
          <div style={{color:'var(--ink-500)', fontSize:13, marginTop:6}}>{clientsFiltres.length} client(s)</div>
        </div>
        <button className="btn btn-primary" onClick={() => router.push('/clients/nouveau')}>
          + Nouveau client
        </button>
      </div>

      {/* Onglets Marine uniquement — dynamiques */}
      {isMarine && (
        <div className="tabs" style={{overflowX:'auto'}}>
          {ongletsList.map(({ key, label }) => (
            <button key={key} className={`tab ${onglet === key ? 'active' : ''}`} onClick={() => setOnglet(key)}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Barre de recherche */}
      <div className="card" style={{padding:'14px 16px'}}>
        <input
          className="input"
          type="text"
          placeholder="Rechercher un client (nom, ville, email)…"
          value={recherche}
          onChange={e => setRecherche(e.target.value)}
          style={{width:'100%', height:40}}
        />
      </div>

      {/* Grille de cartes */}
      {clientsFiltres.length === 0 ? (
        <div className="card" style={{padding:48, textAlign:'center', color:'var(--ink-400)'}}>
          <div style={{fontSize:32, marginBottom:12}}>👤</div>
          <div>Aucun client pour le moment</div>
          <button className="btn btn-ghost" style={{marginTop:16}} onClick={() => router.push('/clients/nouveau')}>
            Ajouter le premier client
          </button>
        </div>
      ) : (
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:14}}>
          {clientsFiltres.map(client => {
            const initials = `${(client.prenom || '').charAt(0)}${(client.nom || '').charAt(0)}`.toUpperCase()
            const isPro = client.type_client === 'professionnel'
            const avatarBg = isPro ? '#7c3aed' : 'var(--brand-700)'
            return (
              <button key={client.id} onClick={() => router.push(`/clients/${client.id}`)}
                className="card" style={{padding:18, border:0, textAlign:'left', cursor:'pointer', display:'flex', flexDirection:'column', gap:0}}>
                <div style={{display:'flex', gap:12, alignItems:'flex-start'}}>
                  {/* Avatar initiales */}
                  <div style={{
                    width:42, height:42, borderRadius:12, flexShrink:0,
                    background:avatarBg, color:'#fff',
                    display:'grid', placeItems:'center',
                    fontSize:15, fontWeight:800, letterSpacing:0.5,
                  }}>{initials}</div>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontSize:15, fontWeight:700, color:'var(--ink-900)'}} className="clip-1">
                      {client.civilite} {client.prenom} {client.nom}
                      {client.prenom2 && ` & ${client.prenom2} ${client.nom2}`}
                    </div>
                    <div style={{display:'flex', gap:6, marginTop:6, flexWrap:'wrap', alignItems:'center'}}>
                      <span style={{
                        display:'inline-flex', alignItems:'center', padding:'2px 10px',
                        borderRadius:99, fontSize:11.5, fontWeight:700,
                        background: isPro ? 'rgba(124,58,237,0.1)' : 'rgba(0,148,212,0.1)',
                        color: isPro ? '#7c3aed' : 'var(--brand-800)',
                      }}>
                        {isPro ? 'Pro' : 'Particulier'}
                      </span>
                      {client.apporteur_affaires && (
                        <span style={{
                          display:'inline-flex', alignItems:'center', padding:'2px 10px',
                          borderRadius:99, fontSize:11.5, fontWeight:700,
                          background:'rgba(22,163,74,0.1)', color:'#15803d',
                        }}>
                          ★ Apporteur {client.apporteur_pourcentage}%
                        </span>
                      )}
                      {afficherReferente && client.referente && (
                        <span style={{fontSize:11.5, color:'var(--ink-500)'}}>
                          {client.referente.prenom} {client.referente.nom}
                        </span>
                      )}
                    </div>
                    {client.adresse && (
                      <div style={{fontSize:12, color:'var(--ink-500)', marginTop:8}}>
                        📍 {client.adresse}
                      </div>
                    )}
                  </div>
                </div>
                {(client.telephone || client.email) && (
                  <div style={{marginTop:14, paddingTop:14, borderTop:'1px solid var(--ink-100)', display:'flex', gap:14, fontSize:11.5, color:'var(--ink-500)', flexWrap:'wrap'}}>
                    {client.telephone && <span>{client.telephone}</span>}
                    {client.email && <span className="clip-1">{client.email}</span>}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
