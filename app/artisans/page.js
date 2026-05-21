// /artisans/page.js :
'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '../lib/auth-context'

/* ── Inline SVG icons ── */
function Svg({ size = 16, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}
const SearchIcon = ({ size=16 }) => <Svg size={size}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></Svg>
const HammerIcon  = ({ size=16 }) => <Svg size={size}><path d="M14.5 4.5l5 5-2 2-5-5z"/><path d="M12.5 6.5 3.5 15.5l3 3 9-9"/></Svg>
const ShieldIcon  = ({ size=16 }) => <Svg size={size}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></Svg>
const TrashIcon   = ({ size=16 }) => <Svg size={size}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></Svg>
const ArrowIcon   = ({ size=16 }) => <Svg size={size}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></Svg>
const PencilIcon  = ({ size=16 }) => <Svg size={size}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></Svg>

/* ── Helper ── */
const fmtEur = (n) => Math.round(n || 0).toLocaleString('fr-FR') + ' €'

export default function Artisans() {
  const [artisans, setArtisans] = useState([])
  const [loading, setLoading] = useState(true)
  const [recherche, setRecherche] = useState('')
  const [filtreMetier, setFiltreMetier] = useState('tous')
  const [modeSelection, setModeSelection] = useState(false)
  const [selectionnes, setSelectionnes] = useState([])
  const [supprimant, setSupprimant] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  const router = useRouter()
  const { user, initialized } = useAuth()

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const handler = (e) => setIsMobile(e.matches)
    setIsMobile(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    if (!initialized) return
    if (!user) { router.push('/login'); return }
    supabase.from('artisans').select('*, devis_artisans(id, montant_ht)').order('entreprise')
      .then(({ data }) => { setArtisans(data || []); setLoading(false) })
  }, [initialized, user?.id, router])

  const metiers = ['tous', ...new Set(artisans.map(a => a.metier).filter(Boolean).sort())]

  const artisansFiltres = artisans.filter(a => {
    const matchRecherche = `${a.entreprise} ${a.nom} ${a.prenom} ${a.ville} ${a.metier}`
      .toLowerCase().includes(recherche.toLowerCase())
    const matchMetier = filtreMetier === 'tous' || a.metier === filtreMetier
    return matchRecherche && matchMetier
  })

  const supprimerSelectionnes = async () => {
    if (!selectionnes.length) return
    if (!confirm(`Supprimer ${selectionnes.length} artisan(s) ? Cette action est irréversible.`)) return
    setSupprimant(true)
    const erreurs = []
    for (const artisanId of selectionnes) {
      const artisan = artisans.find(a => a.id === artisanId)
      const fichiers = [artisan?.kbis_url, artisan?.decennale_url, artisan?.qualification_url].filter(Boolean)
      if (fichiers.length > 0) await supabase.storage.from('documents').remove(fichiers)
      await supabase.from('fiches_techniques').delete().eq('artisan_id', artisanId)
      const { error } = await supabase.from('artisans').delete().eq('id', artisanId)
      if (error) erreurs.push(`${artisan?.entreprise} (${error.message})`)
    }
    const { data } = await supabase.from('artisans').select('*, devis_artisans(id, montant_ht)').order('entreprise')
    setArtisans(data || [])
    setSelectionnes([])
    setModeSelection(false)
    setSupprimant(false)
    if (erreurs.length > 0) {
      alert(`Impossible de supprimer : ${erreurs.join(', ')}\nCes artisans ont probablement des devis liés.`)
    }
  }

  const aujourdhui = new Date()
  const alertesDecennale = artisans.filter(a => {
    if (!a.decennale_expiration) return false
    const diff = (new Date(a.decennale_expiration) - aujourdhui) / (1000 * 60 * 60 * 24)
    return diff <= 30
  })

  const DecBadge = ({ a }) => {
    if (!a.decennale_expiration) return <span style={{fontSize:11.5,color:'var(--ink-300)'}}>—</span>
    const diff = Math.round((new Date(a.decennale_expiration) - aujourdhui) / 86400000)
    if (diff < 0)
      return <span style={{display:'inline-flex',alignItems:'center',padding:'2px 10px',borderRadius:99,fontSize:11.5,fontWeight:700,background:'rgba(239,68,68,0.1)',color:'#b91c1c'}}>Expirée</span>
    if (diff <= 30)
      return <span style={{display:'inline-flex',alignItems:'center',padding:'2px 10px',borderRadius:99,fontSize:11.5,fontWeight:700,background:'rgba(245,158,11,0.12)',color:'#a16207'}}>J-{diff}</span>
    return <span style={{fontSize:11.5,color:'var(--ink-500)'}}>{new Date(a.decennale_expiration).toLocaleDateString('fr-FR')}</span>
  }

  if (loading) return <div className="page-loading" />

  return (
    <div className="page-enter page-pad" style={{display:'flex', flexDirection:'column', gap:18}}>

      {/* En-tête */}
      <div className="header-row" style={{display:'flex', justifyContent:'space-between', alignItems:'flex-end', gap:16, flexWrap:'wrap'}}>
        <div>
          <div className="eyebrow" style={{marginBottom:4}}>Contacts</div>
          <h1 className="page">Artisans</h1>
          <div style={{color:'var(--ink-500)', fontSize:13, marginTop:6}}>{artisansFiltres.length} artisans partenaires</div>
        </div>
        <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
          {modeSelection ? (
            <>
              <span style={{fontSize:13, color:'var(--ink-500)', alignSelf:'center'}}>{selectionnes.length} sélectionné(s)</span>
              <button onClick={supprimerSelectionnes} disabled={supprimant || !selectionnes.length}
                className="btn btn-ghost" style={{color:'#b91c1c', borderColor:'rgba(220,38,38,0.3)', display:'inline-flex', alignItems:'center', gap:6}}>
                <TrashIcon size={14}/> {supprimant ? '…' : 'Supprimer'}
              </button>
              <button className="btn btn-ghost" onClick={() => { setModeSelection(false); setSelectionnes([]) }}>
                Annuler
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-ghost" style={{color:'#b91c1c', borderColor:'rgba(220,38,38,0.3)'}}
                onClick={() => setModeSelection(true)}>
                <TrashIcon size={14}/>
              </button>
              <button className="btn btn-primary" onClick={() => router.push('/artisans/nouveau')}>
                + Nouvel artisan
              </button>
            </>
          )}
        </div>
      </div>

      {/* Bannière alertes décennale */}
      {alertesDecennale.length > 0 && (
        <div className="card" style={{padding:16, background:'rgba(220,38,38,0.04)', borderColor:'rgba(220,38,38,0.2)'}}>
          <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:10}}>
            <div style={{width:30, height:30, borderRadius:8, background:'rgba(220,38,38,0.1)', color:'#b91c1c', display:'grid', placeItems:'center'}}>
              <ShieldIcon size={15}/>
            </div>
            <div>
              <div style={{fontSize:13, fontWeight:700, color:'#b91c1c'}}>Décennales à surveiller</div>
              <div style={{fontSize:11.5, color:'var(--ink-500)'}}>
                {alertesDecennale.filter(a => (new Date(a.decennale_expiration) - aujourdhui) < 0).length} expirée(s) ·{' '}
                {alertesDecennale.filter(a => { const d = (new Date(a.decennale_expiration) - aujourdhui) / 86400000; return d >= 0 && d <= 30 }).length} expire(nt) dans moins de 30 j
              </div>
            </div>
          </div>
          <div style={{display:'flex', flexWrap:'wrap', gap:8}}>
            {alertesDecennale.map(a => {
              const diff = Math.round((new Date(a.decennale_expiration) - aujourdhui) / 86400000)
              return (
                <div key={a.id} onClick={() => router.push(`/artisans/${a.id}`)}
                  style={{
                    background:'#fff', border:'1px solid',
                    borderColor: diff < 0 ? 'rgba(220,38,38,0.3)' : 'rgba(245,158,11,0.3)',
                    borderRadius:8, padding:'6px 10px', fontSize:11.5,
                    display:'flex', gap:6, alignItems:'center', cursor:'pointer',
                  }}>
                  <strong style={{color:'var(--ink-900)'}}>{a.entreprise}</strong>
                  <span style={{color: diff < 0 ? '#b91c1c' : '#a16207', fontWeight:600}}>
                    {diff < 0 ? `expirée ${Math.abs(diff)}j` : `J-${diff}`}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Filtres */}
      <div className="card toolbar-row" style={{padding:'14px 16px', display:'flex', gap:10, flexWrap:'wrap', alignItems:'center'}}>
        <div style={{position:'relative', flex:1, minWidth:200}}>
          <span style={{position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'var(--ink-400)', pointerEvents:'none'}}>
            <SearchIcon size={16}/>
          </span>
          <input className="input" placeholder="Rechercher entreprise, métier, ville…"
            value={recherche} onChange={e => setRecherche(e.target.value)}
            style={{paddingLeft:36, width:'100%', height:40}}/>
        </div>
        <select className="input" value={filtreMetier} onChange={e => setFiltreMetier(e.target.value)}
          style={{height:40, minWidth:180}}>
          {metiers.map(m => <option key={m} value={m}>{m === 'tous' ? 'Tous les métiers' : m}</option>)}
        </select>
      </div>

      {/* Liste vide */}
      {artisansFiltres.length === 0 ? (
        <div className="card" style={{padding:48, textAlign:'center', color:'var(--ink-400)'}}>
          <div style={{marginBottom:12}}><HammerIcon size={32}/></div>
          <div>Aucun artisan trouvé</div>
        </div>
      ) : isMobile ? (
        /* ── Liste en cartes pour mobile ── */
        <div className="grid-cards">
          {artisansFiltres.map(a => {
            const selected = selectionnes.includes(a.id)
            const nbDevis = (a.devis_artisans || []).length
            const caHT    = (a.devis_artisans || []).reduce((s, dv) => s + (dv.montant_ht || 0), 0)
            return (
              <button key={a.id} onClick={() => {
                if (modeSelection) setSelectionnes(prev => prev.includes(a.id) ? prev.filter(id => id !== a.id) : [...prev, a.id])
                else router.push(`/artisans/${a.id}`)
              }}
                className="card" style={{
                  padding:16, border: selected ? '1px solid rgba(220,38,38,0.3)' : 0, textAlign:'left', cursor:'pointer',
                  width:'100%', minWidth:0, overflow:'hidden',
                  background: selected ? 'rgba(220,38,38,0.04)' : undefined,
                }}>
                <div style={{display:'flex', gap:12, alignItems:'flex-start'}}>
                  {modeSelection && (
                    <input type="checkbox" checked={selected} readOnly style={{accentColor:'#b91c1c', marginTop:4, flexShrink:0}}/>
                  )}
                  <div style={{width:38, height:38, borderRadius:10, background:'var(--brand-50)', color:'var(--brand-800)', display:'grid', placeItems:'center', flexShrink:0}}>
                    <HammerIcon size={18}/>
                  </div>
                  <div style={{flex:1, minWidth:0}}>
                    <div className="clip-1" style={{fontSize:15, fontWeight:700, color:'var(--ink-900)'}}>{a.entreprise}</div>
                    {a.nom && (
                      <div className="clip-1" style={{fontSize:11.5, color:'var(--ink-500)', marginTop:2}}>
                        {a.prenom ? a.prenom.charAt(0).toUpperCase() + a.prenom.slice(1).toLowerCase() : ''} {a.nom}
                      </div>
                    )}
                    <div style={{display:'flex', gap:6, marginTop:6, flexWrap:'wrap', alignItems:'center'}}>
                      {a.metier && (
                        <span style={{
                          display:'inline-flex', alignItems:'center', padding:'2px 10px',
                          borderRadius:99, fontSize:11.5, fontWeight:600,
                          background:'var(--ink-100)', color:'var(--ink-600)',
                        }}>{a.metier}</span>
                      )}
                      {a.qualification && (
                        <span style={{
                          display:'inline-flex', alignItems:'center', padding:'2px 10px',
                          borderRadius:99, fontSize:11, fontWeight:700,
                          background:'rgba(22,163,74,0.1)', color:'#15803d',
                        }}>★ {a.qualification}</span>
                      )}
                    </div>
                    {(a.code_postal || a.ville) && (
                      <div className="clip-1" style={{fontSize:12, color:'var(--ink-500)', marginTop:6}}>
                        {a.code_postal} {a.ville}
                      </div>
                    )}
                  </div>
                </div>
                {/* Footer */}
                <div style={{marginTop:12, paddingTop:12, borderTop:'1px solid var(--ink-100)', display:'flex', justifyContent:'space-between', alignItems:'center', gap:10}}>
                  <div style={{display:'flex', alignItems:'center', gap:6, minWidth:0}}>
                    <span className="eyebrow" style={{fontSize:10}}>Décennale</span>
                    <DecBadge a={a}/>
                  </div>
                  <div style={{display:'flex', gap:14, alignItems:'center'}}>
                    <div style={{textAlign:'right'}}>
                      <div className="eyebrow" style={{fontSize:10}}>Devis</div>
                      <div className="tnum" style={{fontSize:14, fontWeight:700, color:'var(--ink-900)'}}>{nbDevis}</div>
                    </div>
                    {caHT > 0 && (
                      <div style={{textAlign:'right'}}>
                        <div className="eyebrow" style={{fontSize:10}}>CA HT</div>
                        <div className="tnum" style={{fontSize:13, fontWeight:700, color:'var(--brand-800)', whiteSpace:'nowrap'}}>{fmtEur(caHT)}</div>
                      </div>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      ) : (
          <div className="card" style={{padding:0, overflow:'hidden'}}>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%', borderCollapse:'collapse', fontSize:13}}>
                <thead style={{background:'var(--surface-2)'}}>
                  <tr>
                    {modeSelection && <Th style={{width:40}}></Th>}
                    <Th>Entreprise</Th>
                    <Th>Métier</Th>
                    <Th>Ville</Th>
                    <Th>Décennale</Th>
                    <Th>Qualifications</Th>
                    <Th right>Devis</Th>
                    <Th right>CA cumulé HT</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {artisansFiltres.map(a => {
                    const selected = selectionnes.includes(a.id)
                    const nbDevis = (a.devis_artisans || []).length
                    const caHT    = (a.devis_artisans || []).reduce((s, dv) => s + (dv.montant_ht || 0), 0)
                    return (
                      <tr key={a.id} className="row-hover"
                        style={{
                          borderTop:'1px solid var(--ink-100)', cursor:'pointer',
                          background: selected ? 'rgba(220,38,38,0.04)' : undefined,
                        }}
                        onClick={() => {
                          if (modeSelection) setSelectionnes(prev => prev.includes(a.id) ? prev.filter(id => id !== a.id) : [...prev, a.id])
                          else router.push(`/artisans/${a.id}`)
                        }}>
                        {modeSelection && (
                          <td style={{padding:'14px 16px'}}>
                            <input type="checkbox" checked={selected} readOnly style={{accentColor:'#b91c1c'}}/>
                          </td>
                        )}
                        <td style={{padding:'14px 16px'}}>
                          <div style={{display:'flex', gap:12, alignItems:'center'}}>
                            <div style={{width:34, height:34, borderRadius:8, background:'var(--brand-50)', color:'var(--brand-800)', display:'grid', placeItems:'center', flexShrink:0}}>
                              <HammerIcon size={16}/>
                            </div>
                            <div>
                              <div style={{fontWeight:700, color:'var(--ink-900)'}}>{a.entreprise}</div>
                              {a.nom && (
                                <div style={{fontSize:11.5, color:'var(--ink-500)'}}>
                                  {a.prenom ? a.prenom.charAt(0).toUpperCase() + a.prenom.slice(1).toLowerCase() : ''} {a.nom}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td style={{padding:'14px 16px', color:'var(--ink-500)'}}>{a.metier || '—'}</td>
                        <td style={{padding:'14px 16px', color:'var(--ink-500)'}}>{a.code_postal} {a.ville}</td>
                        <td style={{padding:'14px 16px'}}><DecBadge a={a}/></td>
                        <td style={{padding:'14px 16px'}}>
                          <div style={{display:'flex', gap:5, flexWrap:'wrap'}}>
                            {a.qualification && <span style={{display:'inline-flex',alignItems:'center',padding:'2px 10px',borderRadius:99,fontSize:11,fontWeight:700,background:'rgba(22,163,74,0.1)',color:'#15803d'}}>★ {a.qualification}</span>}
                          </div>
                        </td>
                        <td style={{padding:'14px 16px', textAlign:'right', fontWeight:700, color:'var(--ink-900)'}} className="tnum">
                          {nbDevis}
                        </td>
                        <td style={{padding:'14px 16px', textAlign:'right', fontWeight:700, color:'var(--brand-800)'}} className="tnum">
                          {caHT > 0 ? fmtEur(caHT) : '—'}
                        </td>
                        <td style={{padding:'14px 16px'}}>
                          {!modeSelection && (
                            <button className="btn btn-ghost" style={{padding:'4px 8px'}}
                              onClick={e => { e.stopPropagation(); router.push(`/artisans/${a.id}`) }}>
                              <PencilIcon size={12}/>
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
      )}
    </div>
  )
}

function Th({ children, right, style }) {
  return (
    <th style={{
      textAlign: right ? 'right' : 'left',
      padding:'12px 16px', fontSize:11, fontWeight:700,
      color:'var(--ink-500)', letterSpacing:0.05, textTransform:'uppercase', ...style
    }}>
      {children}
    </th>
  )
}
