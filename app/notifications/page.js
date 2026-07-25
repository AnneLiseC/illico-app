'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '../lib/auth-context'

const TYPE_CONFIG = {
  deadline_devis:   { label: 'Échéance devis',    bg: 'rgba(245,158,11,0.12)',  color: '#a16207',           emoji: '📋' },
  cr_depose:        { label: 'Rapport de visite',  bg: 'rgba(0,148,212,0.1)',    color: 'var(--ink-900)',  emoji: '📝' },
  acompte_debloque: { label: 'Acompte débloqué',   bg: 'rgba(22,163,74,0.1)',    color: '#15803d',           emoji: '💰' },
  msg_client:       { label: 'Message client',     bg: 'rgba(124,58,237,0.1)',   color: '#7c3aed',           emoji: '💬' },
  devis_signe:      { label: 'Devis signé',        bg: 'rgba(5,150,105,0.1)',    color: '#047857',           emoji: '✅' },
  facture_payee:    { label: 'Facture payée',      bg: 'rgba(22,163,74,0.1)',    color: '#15803d',           emoji: '🧾' },
  decennale_expire: { label: 'Décennale',          bg: 'rgba(239,68,68,0.1)',    color: '#b91c1c',           emoji: '⚠️' },
  redevance_due:    { label: 'Redevance',          bg: 'rgba(245,158,11,0.12)',  color: '#a16207',           emoji: '📅' },
}
const DEFAULT_CFG = { label: 'Notification', bg: 'var(--ink-100)', color: 'var(--ink-500)', emoji: '🔔' }

const relative = (iso) => {
  const diff = (Date.now() - new Date(iso)) / 1000
  if (diff < 60)        return 'à l\'instant'
  if (diff < 3600)      return `il y a ${Math.round(diff / 60)} min`
  if (diff < 86400)     return `il y a ${Math.round(diff / 3600)} h`
  if (diff < 86400 * 7) return `il y a ${Math.round(diff / 86400)} j`
  return new Date(iso).toLocaleDateString('fr-FR')
}

function Chip({ active, onClick, tone, children }) {
  const bg = active ? (tone === 'warn' ? 'rgba(245,158,11,0.13)' : 'var(--brand-50)') : 'transparent'
  const color = active ? (tone === 'warn' ? '#a16207' : 'var(--ink-900)') : 'var(--ink-500)'
  const borderColor = active ? (tone === 'warn' ? 'rgba(245,158,11,0.4)' : 'var(--brand-200)') : 'var(--ink-200)'
  return (
    <button onClick={onClick} style={{padding:'5px 12px', borderRadius:99, fontSize:12, fontWeight:600, border:`1px solid ${borderColor}`, background:bg, color, cursor:'pointer'}}>
      {children}
    </button>
  )
}

function Toggle({ on, onClick }) {
  return (
    <span onClick={onClick} style={{width:32, height:18, borderRadius:99, background: on ? 'var(--brand-500)' : 'var(--ink-200)', position:'relative', cursor:'pointer', display:'inline-block', flexShrink:0}}>
      <span style={{position:'absolute', top:2, left: on ? 16 : 2, width:14, height:14, borderRadius:99, background:'#fff', transition:'left 150ms', boxShadow:'0 1px 3px rgba(0,0,0,0.15)'}}/>
    </span>
  )
}

export default function Notifications() {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const router = useRouter()
  const { user, profile, initialized, markAllRead, fetchProfile } = useAuth()

  useEffect(() => {
    if (!initialized) return
    if (!user) { router.replace('/login'); return }

    supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setNotifications(data || [])
        setLoading(false)
      })

    markAllRead()
  }, [initialized, user?.id, router, markAllRead])

  const toggleNotif = async (key) => {
    if (!profile) return
    const current = (profile.notif_prefs?.[key]) !== false
    const newPrefs = { ...(profile.notif_prefs || {}), [key]: !current }
    await supabase.from('profiles').update({ notif_prefs: newPrefs }).eq('id', profile.id)
    fetchProfile()
  }

  const toggleCanal = async (col) => {
    if (!profile) return
    await supabase.from('profiles').update({ [col]: !profile[col] }).eq('id', profile.id)
    fetchProfile()
  }

  const goToDossier = (n) => {
    if (n.dossier_id) router.push(`/chantiers/${n.dossier_id}`)
  }

  if (loading) return <div style={{paddingTop:96, textAlign:'center', color:'var(--ink-400)'}}>Chargement…</div>

  const nbUnread = notifications.filter(n => !n.lu).length
  const types = [...new Set(notifications.map(n => n.type))]
  const items = notifications.filter(n => {
    if (filter === 'all') return true
    if (filter === 'unread') return !n.lu
    return n.type === filter
  })

  return (
    <div className="page-enter page-pad" style={{display:'flex', flexDirection:'column', gap:18}}>

      {/* En-tête */}
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-end', gap:16, flexWrap:'wrap'}}>
        <div>
          <div className="eyebrow" style={{marginBottom:4}}>Activité</div>
          <h1 className="page">Notifications</h1>
          <div style={{color:'var(--ink-500)', fontSize:13, marginTop:6}}>
            {nbUnread > 0
              ? <><strong style={{color:'var(--bad)'}}>{nbUnread}</strong> nouvelles · {notifications.length} au total</>
              : <>Toutes les notifications sont lues</>}
          </div>
        </div>
        <button className="btn btn-ghost" onClick={markAllRead}>✓ Tout marquer comme lu</button>
      </div>

      {/* Layout deux colonnes */}
      <div style={{display:'grid', gridTemplateColumns:'1fr 280px', gap:18, alignItems:'flex-start'}}>

        {/* ── Liste ── */}
        <div className="card" style={{padding:0, overflow:'hidden'}}>

          {/* Filtres */}
          <div style={{padding:'12px 18px', borderBottom:'1px solid var(--ink-200)', display:'flex', gap:6, flexWrap:'wrap', alignItems:'center'}}>
            <Chip active={filter === 'all'} onClick={() => setFilter('all')}>Toutes</Chip>
            <Chip active={filter === 'unread'} onClick={() => setFilter('unread')} tone="warn">Non lues · {nbUnread}</Chip>
            {types.length > 0 && <div style={{width:1, background:'var(--ink-200)', margin:'0 4px', alignSelf:'stretch'}}/>}
            {types.map(t => (
              <Chip key={t} active={filter === t} onClick={() => setFilter(t)}>{(TYPE_CONFIG[t] || DEFAULT_CFG).label}</Chip>
            ))}
          </div>

          {/* Lignes */}
          {items.length === 0 ? (
            <div style={{padding:48, textAlign:'center', color:'var(--ink-400)', fontSize:13}}>
              {notifications.length === 0 ? (
                <><div style={{fontSize:32, marginBottom:12}}>🔔</div><div>Aucune notification</div></>
              ) : 'Aucune notification dans ce filtre'}
            </div>
          ) : (
            items.map(n => {
              const cfg = TYPE_CONFIG[n.type] || DEFAULT_CFG
              return (
                <button
                  key={n.id}
                  onClick={() => goToDossier(n)}
                  className={n.dossier_id ? 'row-hover' : ''}
                  style={{
                    display:'grid', gridTemplateColumns:'auto 1fr auto', gap:14, alignItems:'flex-start',
                    padding:'16px 20px', width:'100%', textAlign:'left', position:'relative',
                    borderBottom:'1px solid var(--ink-100)', border:0,
                    background: n.lu ? '#fff' : 'rgba(20,184,166,0.04)',
                    cursor: n.dossier_id ? 'pointer' : 'default',
                  }}
                >
                  {!n.lu && <span style={{position:'absolute', left:7, top:'50%', transform:'translateY(-50%)', width:6, height:6, borderRadius:99, background:'var(--brand-500)'}}/>}
                  <div style={{width:40, height:40, borderRadius:10, background:cfg.bg, color:cfg.color, display:'grid', placeItems:'center', flexShrink:0, fontSize:18}}>
                    {cfg.emoji}
                  </div>
                  <div style={{minWidth:0}}>
                    <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
                      <span style={{fontSize:13.5, fontWeight: n.lu ? 600 : 700, color:'var(--ink-900)'}}>{n.titre}</span>
                      {n.dossier_id && <span className="eyebrow" style={{fontSize:10}}>→ dossier</span>}
                    </div>
                    <div style={{fontSize:13, color:'var(--ink-500)', marginTop:3}}>{n.message}</div>
                  </div>
                  <div style={{textAlign:'right', whiteSpace:'nowrap', flexShrink:0}}>
                    <div style={{fontSize:11, color:'var(--ink-400)'}}>{relative(n.created_at)}</div>
                  </div>
                </button>
              )
            })
          )}
        </div>

        {/* ── Préférences ── */}
        <div className="card" style={{padding:20}}>
          <div className="eyebrow" style={{marginBottom:12}}>Préférences</div>
          <div style={{display:'flex', flexDirection:'column', gap:12, fontSize:13}}>
            {[
              { k:'echeances_devis',  l:'Échéances devis < 7 j' },
              { k:'comptes_rendus',   l:'Comptes-rendus déposés' },
              { k:'acomptes_illico',  l:'Acomptes débloqués' },
              { k:'messages_clients', l:'Messages clients' },
              { k:'decennales',       l:'Décennales expirantes' },
              { k:'redevances',       l:'Redevances dues' },
            ].map(p => {
              const active = (profile?.notif_prefs?.[p.k]) !== false
              return (
                <label key={p.k} style={{display:'flex', alignItems:'center', gap:10, cursor:'pointer'}}>
                  <Toggle on={active} onClick={() => toggleNotif(p.k)} />
                  <span style={{color:'var(--ink-700)'}}>{p.l}</span>
                </label>
              )
            })}
          </div>
          <div style={{height:1, background:'var(--ink-100)', margin:'16px 0'}}/>
          <div className="eyebrow" style={{marginBottom:10}}>Canaux</div>
          <div style={{display:'flex', flexDirection:'column', gap:8, fontSize:12.5, color:'var(--ink-700)'}}>
            <label style={{display:'flex', alignItems:'center', gap:8}}>
              <Toggle on={profile?.notif_canal_inapp !== false} onClick={() => toggleCanal('notif_canal_inapp')} />
              In-app
            </label>
            <label style={{display:'flex', alignItems:'center', gap:8}}>
              <Toggle on={profile?.notif_canal_email !== false} onClick={() => toggleCanal('notif_canal_email')} />
              Email
            </label>
            <label style={{display:'flex', alignItems:'center', gap:8}}>
              <Toggle on={profile?.notif_canal_sms === true} onClick={() => toggleCanal('notif_canal_sms')} />
              SMS
            </label>
          </div>
        </div>

      </div>
    </div>
  )
}
