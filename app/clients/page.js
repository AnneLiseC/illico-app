'use client'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '../lib/auth-context'
import { archiverClient, desarchiverClient, supprimerClient, formatNomClient } from '../lib/clients'

/* ── Inline SVG icons ── */
function Svg({ size = 16, children }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
}
const SearchIcon = ({ size=16 }) => <Svg size={size}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></Svg>
const PinIcon    = ({ size=16 }) => <Svg size={size}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></Svg>
const PhoneIcon  = ({ size=16 }) => <Svg size={size}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.38 2 2 0 0 1 3.58 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.54a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></Svg>
const MailIcon   = ({ size=16 }) => <Svg size={size}><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="2,4 12,13 22,4"/></Svg>
const MoreIcon   = ({ size=16 }) => <Svg size={size}><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></Svg>
const FilterIcon = ({ size=16 }) => <Svg size={size}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></Svg>

/* ── Helpers ── */
const fmtEur = (n) => Math.round(n || 0).toLocaleString('fr-FR') + ' €'
const villeFromAddr = (addr) => {
  if (!addr) return '—'
  const parts = addr.split(',')
  return parts[parts.length - 1]?.trim() || addr
}

export default function Clients() {
  const [clients, setClients] = useState([])
  const [agentes, setAgentes] = useState([])
  const [loading, setLoading] = useState(true)
  const [recherche, setRecherche] = useState('')
  const [onglet, setOnglet] = useState('moi')
  const [menuOuvert, setMenuOuvert] = useState(null)
  const [vueArchives, setVueArchives] = useState(false)
  const router = useRouter()
  const { user, profile, initialized, agenceActive } = useAuth()

  useEffect(() => {
    if (!menuOuvert) return
    const close = () => setMenuOuvert(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menuOuvert])

  useEffect(() => {
    if (!initialized) return
    if (!user) { router.push('/login'); return }
    if (!profile) return

    let query = supabase
      .from('clients')
      .select('*, referente:profiles!clients_referente_fkey(id, prenom, nom, role), dossiers(id, devis_artisans(id, statut, montant_ttc))')
      .eq('archive', vueArchives)
      .order('nom', { ascending: true })
    if (profile.role === 'agente') query = query.eq('referente', profile.id)

    Promise.all([
      query,
      profile.role === 'admin'
        ? supabase.from('profiles').select('id, prenom, nom').eq('role', 'agente').eq('actif', true).order('prenom')
        : Promise.resolve({ data: [] }),
    ]).then(([{ data }, { data: agentesData }]) => {
      const sorted = (data || []).slice().sort((a, b) =>
        (a.nom || '').localeCompare(b.nom || '', 'fr', { sensitivity: 'base' })
      )
      setClients(sorted)
      setAgentes(agentesData || [])
      setLoading(false)
    })
  }, [initialized, user?.id, profile?.id, vueArchives, router])

  // Archiver un client (≥1 dossier) : le trigger DB propage sur ses dossiers.
  // Succès → retrait local de la carte (la vue Actifs ne l'affiche plus).
  const handleArchiverListe = async (clientId) => {
    if (!confirm('Archiver ce client ? Ses dossiers seront masqués des vues opérationnelles (conservés en compta). Réversible.')) return
    const { error } = await archiverClient(supabase, clientId)
    if (error) { alert(error.message); return }
    setClients(prev => prev.filter(c => c.id !== clientId))
  }

  // Supprimer un client SANS dossier (le helper mappe l'erreur FK 23503).
  const handleSupprimerListe = async (clientId) => {
    if (!confirm('Supprimer définitivement ce client ? Cette action est irréversible.')) return
    const { error } = await supprimerClient(supabase, clientId)
    if (error) { alert(error.message); return }
    setClients(prev => prev.filter(c => c.id !== clientId))
  }

  // Désarchiver (vue Archivés) : le trigger DB propage le désarchivage sur les dossiers.
  // Succès → retrait local de la carte (elle quitte la vue Archivés).
  const handleDesarchiverListe = async (clientId) => {
    if (!confirm('Désarchiver ce client ? Il réapparaîtra dans les vues opérationnelles.')) return
    const { error } = await desarchiverClient(supabase, clientId)
    if (error) { alert(error.message); return }
    setClients(prev => prev.filter(c => c.id !== clientId))
  }

  const isAdmin = profile?.role === 'admin'

  // Scoping multi-agence (UX, pas sécurité — RLS reste la frontière) :
  // agenceActive null = tout ; uuid = seulement cette agence. Filtrage en mémoire.
  const clientsScoped = useMemo(
    () => (agenceActive ? clients.filter(c => c.agence_id === agenceActive) : clients),
    [clients, agenceActive]
  )

  const clientsFiltresOnglet = clientsScoped.filter(c => {
    if (!isAdmin) return true
    if (onglet === 'tous') return true
    if (onglet === 'moi') return c.referente?.role === 'admin'
    return c.referente?.id === onglet
  })

  const clientsFiltres = clientsFiltresOnglet.filter(c =>
    `${c.nom} ${c.prenom} ${c.email} ${c.adresse} ${c.raison_sociale || ''}`.toLowerCase()
      .includes(recherche.toLowerCase())
  )

  const ongletsList = isAdmin ? [
    { key: 'moi', label: 'Mes clients' },
    ...agentes.map(a => ({ key: a.id, label: `Clients ${a.prenom} ${a.nom}` })),
    { key: 'tous', label: 'Tous les clients' },
  ] : []

  const afficherReferente = isAdmin && (onglet === 'tous' || agentes.some(a => a.id === onglet))

  if (loading) return <div className="page-loading" />

  return (
    <div className="page-enter page-pad" style={{display:'flex', flexDirection:'column', gap:18}}>

      {/* En-tête */}
      <div className="header-row" style={{display:'flex', justifyContent:'space-between', alignItems:'flex-end', gap:16, flexWrap:'wrap'}}>
        <div>
          <div className="eyebrow" style={{marginBottom:4}}>Contacts</div>
          <h1 className="page">Clients</h1>
          <div style={{color:'var(--ink-500)', fontSize:13, marginTop:6}}>{clientsFiltres.length} clients · base actualisée</div>
        </div>
        <button className="btn btn-primary" onClick={() => router.push('/clients/nouveau')}>+ Nouveau client</button>
      </div>

      {/* Onglets (admin uniquement) */}
      {isAdmin && (
        <div className="tabs" style={{overflowX:'auto'}}>
          {ongletsList.map(({ key, label }) => (
            <button key={key} className={`tab ${onglet === key ? 'active' : ''}`} onClick={() => setOnglet(key)}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Toggle Actifs / Archivés (tous rôles) */}
      <div className="tabs">
        <button className={`tab ${!vueArchives ? 'active' : ''}`} onClick={() => setVueArchives(false)}>Actifs</button>
        <button className={`tab ${vueArchives ? 'active' : ''}`} onClick={() => setVueArchives(true)}>Archivés</button>
      </div>

      {/* Barre de recherche */}
      <div className="card toolbar-row" style={{padding:'14px 16px', display:'flex', gap:10, flexWrap:'wrap', alignItems:'center'}}>
        <div style={{position:'relative', flex:1, minWidth:200}}>
          <span style={{position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'var(--ink-400)', pointerEvents:'none'}}>
            <SearchIcon size={16}/>
          </span>
          <input className="input" placeholder="Rechercher un client (nom, ville, email)…"
            value={recherche} onChange={e => setRecherche(e.target.value)}
            style={{paddingLeft:36, width:'100%', height:40}}/>
        </div>
        <button className="btn btn-ghost" style={{height:40}}><FilterIcon size={14}/> Filtres</button>
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
        <div className="grid-cards">
          {clientsFiltres.map(client => {
            const dossierCount = (client.dossiers || []).length
            const montantTotal = (client.dossiers || []).reduce((s, d) =>
              s + (d.devis_artisans || []).filter(dv => dv.statut === 'accepte')
                .reduce((s2, dv) => s2 + (dv.montant_ttc || 0), 0), 0)
            const initials = `${(client.prenom || '').charAt(0)}${(client.nom || '').charAt(0)}`.toUpperCase()
            const isPro = client.type_client === 'professionnel'
            return (
              <button key={client.id} onClick={() => router.push(`/clients/${client.id}`)}
                className="card" style={{padding:18, border:0, textAlign:'left', cursor:'pointer', width:'100%', minWidth:0, overflow:'hidden'}}>
                <div style={{display:'flex', gap:12, alignItems:'flex-start'}}>
                  {/* Avatar */}
                  <div style={{
                    width:42, height:42, borderRadius:12, flexShrink:0,
                    background: isPro ? '#7c3aed' : 'var(--brand-700)', color:'#fff',
                    display:'grid', placeItems:'center', fontSize:15, fontWeight:800, letterSpacing:0.5,
                  }}>{initials}</div>
                  <div style={{flex:1, minWidth:0}}>
                    {/* Nom */}
                    <div style={{fontSize:15, fontWeight:700, color:'var(--ink-900)'}} className="clip-1">
                      {formatNomClient(client, { upper: true })}
                    </div>
                    {/* Badges */}
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
                    {/* Ville */}
                    <div style={{fontSize:12, color:'var(--ink-500)', marginTop:8, display:'flex', alignItems:'center', gap:4}}>
                      <PinIcon size={12}/>{villeFromAddr(client.adresse)}
                    </div>
                  </div>
                  {/* Bouton More */}
                  <div style={{position:'relative', flexShrink:0}}>
                    <button className="btn btn-ghost" style={{padding:'4px 8px'}}
                      onClick={e => { e.stopPropagation(); setMenuOuvert(menuOuvert === client.id ? null : client.id) }}>
                      <MoreIcon size={14}/>
                    </button>
                    {menuOuvert === client.id && (
                      <div style={{position:'absolute', right:0, top:'100%', zIndex:50, background:'#fff', border:'1px solid var(--ink-200)', borderRadius:10, boxShadow:'0 4px 16px rgba(0,0,0,0.1)', minWidth:180, overflow:'hidden'}}
                        onClick={e => e.stopPropagation()}>
                        {[
                          { label:'Modifier',          action: () => router.push(`/clients/${client.id}?edit=list`) },
                          { label:'Appeler',           action: () => window.open(`tel:${client.telephone}`), hide: !client.telephone },
                          { label:'Envoyer un email',  action: () => window.open(`mailto:${client.email}`), hide: !client.email },
                          {
                            label: dossierCount > 1 ? 'Voir les dossiers' : 'Voir le dossier',
                            hide: dossierCount === 0,
                            action: () => router.push(
                              dossierCount === 1
                                ? `/chantiers/${client.dossiers[0].id}`
                                : `/clients/${client.id}`
                            ),
                          },
                          { label:'Archiver',    hide: vueArchives || dossierCount === 0, action: () => handleArchiverListe(client.id) },
                          { label:'Supprimer',   hide: vueArchives || dossierCount > 0,   action: () => handleSupprimerListe(client.id) },
                          { label:'Désarchiver', hide: !vueArchives,                      action: () => handleDesarchiverListe(client.id) },
                        ].filter(item => !item.hide).map(item => (
                          <button key={item.label} className="row-hover"
                            style={{width:'100%', textAlign:'left', padding:'10px 14px', border:0, background:'transparent', fontSize:13, cursor:'pointer', color:'var(--ink-700)'}}
                            onClick={() => { item.action(); setMenuOuvert(null) }}>
                            {item.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Contacts */}
                <div style={{marginTop:14, display:'flex', gap:14, fontSize:11.5, color:'var(--ink-500)'}}>
                  {client.telephone && (
                    <span style={{display:'inline-flex', gap:4, alignItems:'center'}}>
                      <PhoneIcon size={11}/>{client.telephone}
                    </span>
                  )}
                  {client.email && (
                    <span style={{display:'inline-flex', gap:4, alignItems:'center'}} className="clip-1">
                      <MailIcon size={11}/>{client.email}
                    </span>
                  )}
                </div>

                {/* Footer — Dossiers + Montant total */}
                <div style={{marginTop:14, paddingTop:14, borderTop:'1px solid var(--ink-100)', display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, minWidth:0}}>
                  <div style={{minWidth:0}}>
                    <div className="eyebrow">Dossiers</div>
                    <div className="tnum" style={{fontSize:18, fontWeight:800, color:'var(--ink-900)'}}>{dossierCount}</div>
                  </div>
                  <div style={{textAlign:'right', minWidth:0, flexShrink:1}}>
                    <div className="eyebrow">Montant total</div>
                    <div className="tnum" style={{fontSize:14, fontWeight:700, color: montantTotal > 0 ? 'var(--brand-800)' : 'var(--ink-400)', whiteSpace:'nowrap'}}>
                      {montantTotal > 0 ? fmtEur(montantTotal) : '—'}
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
