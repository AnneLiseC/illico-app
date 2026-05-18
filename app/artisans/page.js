// /artisans/page.js :
'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '../lib/auth-context'

export default function Artisans() {
  const [artisans, setArtisans] = useState([])
  const [loading, setLoading] = useState(true)
  const [recherche, setRecherche] = useState('')
  const [filtreMetier, setFiltreMetier] = useState('tous')
  const [modeSelection, setModeSelection] = useState(false)
  const [selectionnes, setSelectionnes] = useState([])
  const [supprimant, setSupprimant] = useState(false)

  const router = useRouter()
  const { user, initialized } = useAuth()

  useEffect(() => {
    if (!initialized) return
    if (!user) { router.push('/login'); return }
    supabase.from('artisans').select('*').order('entreprise')
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
      // Supprimer les fichiers Storage
      const fichiers = [artisan?.kbis_url, artisan?.decennale_url, artisan?.qualification_url].filter(Boolean)
      if (fichiers.length > 0) await supabase.storage.from('documents').remove(fichiers)
      // Supprimer les fiches techniques
      await supabase.from('fiches_techniques').delete().eq('artisan_id', artisanId)
      // Supprimer l'artisan
     const { error } = await supabase.from('artisans').delete().eq('id', artisanId)
    console.log('Suppression artisan', artisanId, error)
    if (error) erreurs.push(`${artisan?.entreprise} (${error.message})`)
    }

    // Recharger depuis Supabase (source de vérité)
    const { data } = await supabase.from('artisans').select('*').order('entreprise')
    setArtisans(data || [])
    setSelectionnes([])
    setModeSelection(false)
    setSupprimant(false)

    if (erreurs.length > 0) {
      alert(`Impossible de supprimer : ${erreurs.join(', ')}\nCes artisans ont probablement des devis liés.`)
    }
  }

  // Alertes décennale expirante dans moins de 30 jours
  const aujourdhui = new Date()
  const alertesDecennale = artisans.filter(a => {
    if (!a.decennale_expiration) return false
    const exp = new Date(a.decennale_expiration)
    const diff = (exp - aujourdhui) / (1000 * 60 * 60 * 24)
    return diff <= 30
  })

  // Helper badge décennale réutilisé mobile + desktop
  const DecBadge = ({ a }) => {
    if (!a.decennale_expiration) return <span style={{fontSize:11.5,color:'var(--ink-300)'}}>—</span>
    const diff = Math.round((new Date(a.decennale_expiration) - aujourdhui) / 86400000)
    if (diff < 0)
      return <span style={{display:'inline-flex',alignItems:'center',padding:'2px 10px',borderRadius:99,fontSize:11.5,fontWeight:700,background:'rgba(239,68,68,0.1)',color:'#b91c1c'}}>Expirée</span>
    if (diff <= 30)
      return <span style={{display:'inline-flex',alignItems:'center',padding:'2px 10px',borderRadius:99,fontSize:11.5,fontWeight:700,background:'rgba(245,158,11,0.12)',color:'#a16207'}}>J-{diff}</span>
    return <span style={{fontSize:11.5,color:'var(--ink-500)'}}>{new Date(a.decennale_expiration).toLocaleDateString('fr-FR')}</span>
  }

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
          <h1 className="page">Artisans</h1>
          <div style={{color:'var(--ink-500)', fontSize:13, marginTop:6}}>{artisansFiltres.length} artisan(s) partenaires</div>
        </div>
        <div style={{display:'flex', gap:8}}>
          {modeSelection ? (
            <>
              <span style={{fontSize:13, color:'var(--ink-500)', alignSelf:'center'}}>{selectionnes.length} sélectionné(s)</span>
              <button onClick={supprimerSelectionnes} disabled={supprimant || !selectionnes.length}
                className="btn btn-ghost" style={{color:'#b91c1c', borderColor:'rgba(220,38,38,0.3)'}}>
                {supprimant ? '…' : '🗑 Supprimer'}
              </button>
              <button className="btn btn-ghost" onClick={() => { setModeSelection(false); setSelectionnes([]) }}>
                Annuler
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-ghost" style={{color:'#b91c1c', borderColor:'rgba(220,38,38,0.3)'}}
                onClick={() => setModeSelection(true)}>
                🗑
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
            <div style={{width:30, height:30, borderRadius:8, background:'rgba(220,38,38,0.1)', color:'#b91c1c', display:'grid', placeItems:'center', fontSize:15}}>
              🛡
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
      <div className="card" style={{padding:'14px 16px', display:'flex', gap:10, flexWrap:'wrap'}}>
        <input className="input" type="text" placeholder="Rechercher entreprise, métier, ville…"
          value={recherche} onChange={e => setRecherche(e.target.value)}
          style={{flex:1, minWidth:200, height:40}}/>
        <select className="input" value={filtreMetier} onChange={e => setFiltreMetier(e.target.value)}
          style={{height:40, minWidth:180}}>
          {metiers.map(m => <option key={m} value={m}>{m === 'tous' ? 'Tous les métiers' : m}</option>)}
        </select>
      </div>

      {/* Liste vide */}
      {artisansFiltres.length === 0 ? (
        <div className="card" style={{padding:48, textAlign:'center', color:'var(--ink-400)'}}>
          <div style={{fontSize:32, marginBottom:12}}>🔨</div>
          <div>Aucun artisan trouvé</div>
        </div>
      ) : (
        <>
          {/* ── Vue carte — mobile uniquement ── */}
          <div className="sm:hidden" style={{display:'flex', flexDirection:'column', gap:10}}>
            {artisansFiltres.map(a => {
              const diff = a.decennale_expiration
                ? Math.round((new Date(a.decennale_expiration) - aujourdhui) / 86400000)
                : null
              const selected = selectionnes.includes(a.id)
              return (
                <button key={a.id}
                  className="card"
                  style={{
                    padding:16, border:0, textAlign:'left', cursor:'pointer', display:'flex', flexDirection:'column', gap:10,
                    background: selected ? 'rgba(220,38,38,0.04)' : undefined,
                    borderColor: selected ? 'rgba(220,38,38,0.2)' : undefined,
                  }}
                  onClick={() => {
                    if (modeSelection) setSelectionnes(prev => prev.includes(a.id) ? prev.filter(id => id !== a.id) : [...prev, a.id])
                    else router.push(`/artisans/${a.id}`)
                  }}>
                  <div style={{display:'flex', gap:12, alignItems:'flex-start'}}>
                    {modeSelection && (
                      <input type="checkbox" checked={selected} readOnly style={{accentColor:'#b91c1c', marginTop:2, flexShrink:0}}/>
                    )}
                    <div style={{width:36, height:36, borderRadius:8, background:'var(--brand-50)', color:'var(--brand-800)', display:'grid', placeItems:'center', fontSize:16, flexShrink:0}}>
                      🔨
                    </div>
                    <div style={{flex:1, minWidth:0}}>
                      <div style={{fontWeight:700, color:'var(--ink-900)', fontSize:14}} className="clip-1">{a.entreprise}</div>
                      {a.nom && (
                        <div style={{fontSize:12, color:'var(--ink-500)', marginTop:2}}>
                          {a.prenom ? a.prenom.charAt(0).toUpperCase() + a.prenom.slice(1).toLowerCase() : ''} {a.nom}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{display:'flex', gap:8, flexWrap:'wrap', alignItems:'center'}}>
                    <span style={{display:'inline-flex',alignItems:'center',padding:'2px 10px',borderRadius:99,fontSize:11.5,fontWeight:700,background:'rgba(0,148,212,0.1)',color:'var(--brand-800)'}}>
                      {a.metier || '—'}
                    </span>
                    <span style={{fontSize:12, color:'var(--ink-500)'}}>📍 {a.code_postal} {a.ville}</span>
                    <DecBadge a={a}/>
                  </div>
                  {(a.kbis_url || a.qualification) && (
                    <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
                      {a.kbis_url && <span style={{display:'inline-flex',alignItems:'center',padding:'2px 10px',borderRadius:99,fontSize:11,fontWeight:700,background:'var(--brand-50)',color:'var(--brand-800)'}}>Kbis</span>}
                      {a.qualification && <span style={{display:'inline-flex',alignItems:'center',padding:'2px 10px',borderRadius:99,fontSize:11,fontWeight:700,background:'rgba(22,163,74,0.1)',color:'#15803d'}}>★ {a.qualification}</span>}
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {/* ── Vue tableau — desktop ── */}
          <div className="card hidden sm:block" style={{padding:0, overflow:'hidden'}}>
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
                    <Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {artisansFiltres.map(a => {
                    const selected = selectionnes.includes(a.id)
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
                            <div style={{width:34, height:34, borderRadius:8, background:'var(--brand-50)', color:'var(--brand-800)', display:'grid', placeItems:'center', fontSize:15, flexShrink:0}}>
                              🔨
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
                            {a.kbis_url && <span style={{display:'inline-flex',alignItems:'center',padding:'2px 10px',borderRadius:99,fontSize:11,fontWeight:700,background:'var(--brand-50)',color:'var(--brand-800)'}}>Kbis</span>}
                            {a.qualification && <span style={{display:'inline-flex',alignItems:'center',padding:'2px 10px',borderRadius:99,fontSize:11,fontWeight:700,background:'rgba(22,163,74,0.1)',color:'#15803d'}}>★ {a.qualification}</span>}
                          </div>
                        </td>
                        <td style={{padding:'14px 16px'}}>
                          {!modeSelection && (
                            <button className="btn btn-ghost" style={{padding:'4px 8px'}}
                              onClick={e => { e.stopPropagation(); router.push(`/artisans/${a.id}`) }}>→</button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Th({ children, style }) {
  return (
    <th style={{textAlign:'left', padding:'12px 16px', fontSize:11, fontWeight:700,
      color:'var(--ink-500)', letterSpacing:0.05, textTransform:'uppercase', ...style}}>
      {children}
    </th>
  )
}
