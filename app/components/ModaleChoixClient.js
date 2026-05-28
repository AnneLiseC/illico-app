'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth-context'

export default function ModaleChoixClient({ open, onClose }) {
  const router = useRouter()
  const { profile } = useAuth()
  const [clients, setClients] = useState([])
  const [recherche, setRecherche] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!open || !profile) return
    setLoading(true)
    let q = supabase.from('clients')
      .select('id, civilite, nom, prenom, nom2, prenom2, email')
      .order('nom', { ascending: true })
    if (profile.role === 'agente') q = q.eq('referente', profile.id)
    q.then(({ data }) => { setClients(data || []); setLoading(false) })
  }, [open, profile?.id, profile?.role])

  if (!open) return null

  const filtres = clients.filter(c => {
    const txt = `${c.nom || ''} ${c.prenom || ''} ${c.prenom2 || ''} ${c.nom2 || ''} ${c.email || ''}`.toLowerCase()
    return txt.includes(recherche.toLowerCase())
  })

  const nomComplet = (c) =>
    `${c.civilite || ''} ${c.prenom || ''} ${c.nom || ''}${c.prenom2 ? ` & ${c.prenom2} ${c.nom2 || ''}` : ''}`.trim()

  const choisir = (id) => { onClose(); router.push(`/chantiers/nouveau?client=${id}`) }
  const creerClient = () => { onClose(); router.push('/clients/nouveau') }

  return (
    <div onClick={onClose} style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:9999,
      display:'flex', alignItems:'center', justifyContent:'center', padding:20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background:'#fff', borderRadius:14, width:'100%', maxWidth:480,
        maxHeight:'85vh', display:'flex', flexDirection:'column', overflow:'hidden',
      }}>
        <div style={{padding:'20px 24px', borderBottom:'1px solid var(--ink-100)'}}>
          <h2 style={{fontSize:17, fontWeight:800, color:'var(--ink-900)', margin:0}}>Pour quel client ?</h2>
          <p style={{fontSize:13, color:'var(--ink-500)', margin:'6px 0 0'}}>
            Choisis un client existant ou crée-en un nouveau.
          </p>
        </div>

        <div style={{padding:'14px 24px'}}>
          <input
            className="input"
            placeholder="Rechercher un client…"
            value={recherche}
            onChange={e => setRecherche(e.target.value)}
            style={{width:'100%', height:40}}
            autoFocus
          />
        </div>

        <div style={{flex:1, overflowY:'auto', padding:'0 24px 12px'}}>
          {loading ? (
            <p style={{textAlign:'center', color:'var(--ink-400)', fontSize:13, padding:24}}>Chargement…</p>
          ) : filtres.length === 0 ? (
            <p style={{textAlign:'center', color:'var(--ink-400)', fontSize:13, padding:24}}>
              {clients.length === 0 ? 'Aucun client en base' : 'Aucun client ne correspond'}
            </p>
          ) : (
            <div style={{display:'flex', flexDirection:'column', gap:4}}>
              {filtres.map(c => (
                <button
                  key={c.id}
                  onClick={() => choisir(c.id)}
                  className="row-hover"
                  style={{
                    width:'100%', textAlign:'left', padding:'10px 12px',
                    border:'1px solid var(--ink-100)', borderRadius:8,
                    background:'transparent', cursor:'pointer',
                  }}>
                  <div style={{fontSize:13.5, fontWeight:600, color:'var(--ink-900)'}}>{nomComplet(c)}</div>
                  {c.email && <div style={{fontSize:11.5, color:'var(--ink-500)', marginTop:2}}>{c.email}</div>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{padding:'14px 24px', borderTop:'1px solid var(--ink-100)', display:'flex', gap:8}}>
          <button onClick={onClose} className="btn btn-ghost" style={{flex:1, height:40, justifyContent:'center'}}>
            Annuler
          </button>
          <button onClick={creerClient} className="btn btn-primary" style={{flex:1, height:40, justifyContent:'center'}}>
            + Nouveau client
          </button>
        </div>
      </div>
    </div>
  )
}
