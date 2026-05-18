'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '../lib/auth-context'

/* ── Inline SVG icons for the quick-nav cards ── */
function CardIcon({ children }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}
const Icons = {
  chantiers:    <CardIcon><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></CardIcon>,
  clients:      <CardIcon><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></CardIcon>,
  artisans:     <CardIcon><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></CardIcon>,
  planning:     <CardIcon><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></CardIcon>,
  finances:     <CardIcon><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></CardIcon>,
  statistiques: <CardIcon><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></CardIcon>,
}

const QUICK_LINKS = [
  { key: 'chantiers',    label: 'Chantiers',    href: '/chantiers',    desc: 'Gérer les dossiers' },
  { key: 'clients',      label: 'Clients',      href: '/clients',      desc: 'Fiches clients' },
  { key: 'artisans',     label: 'Artisans',     href: '/artisans',     desc: 'Partenaires & contacts' },
  { key: 'planning',     label: 'Planning',     href: '/planning',     desc: 'Rendez-vous' },
  { key: 'finances',     label: 'Finances',     href: '/finances',     desc: 'Suivi financier' },
  { key: 'statistiques', label: 'Statistiques', href: '/statistiques', desc: 'Tableaux de bord' },
]

export default function Dashboard() {
  const [erreur, setErreur] = useState('')
  const router = useRouter()
  const { user, profile, initialized, fetchProfile } = useAuth()
  const retriedRef = useRef(false)

  useEffect(() => {
    if (!initialized) return
    if (!user) { router.replace('/login'); return }
    if (!profile) return
    if (profile.role === 'client') router.replace('/espace-client')
  }, [initialized, user?.id, profile?.id, profile?.role, router])

  // Filet de sécurité : si le profil n'est pas chargé après init, on retente une fois
  useEffect(() => {
    if (!initialized || !user || profile || retriedRef.current) return
    retriedRef.current = true
    fetchProfile(user.id)
  }, [initialized, user?.id, profile, fetchProfile])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const roleLabel = (role) => {
    if (role === 'admin') return 'Franchisée'
    if (role === 'agente') return 'Agente'
    return 'Client'
  }

  if (erreur) return (
    <div className="min-h-screen flex items-center justify-center">
      <p style={{ color: 'var(--badge-bad, #b91c1c)' }}>{erreur}</p>
    </div>
  )

  if (!profile) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="eyebrow">Chargement…</p>
    </div>
  )

  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })

  return (
    <div className="page-enter p-6 sm:p-8" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* ── Welcome ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6, textTransform: 'capitalize' }}>{today}</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--ink-900)', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
            Bonjour {profile.prenom} 👋
          </h1>
          <p style={{ color: 'var(--ink-500)', fontSize: 14, marginTop: 6 }}>
            {roleLabel(profile.role)} · illiCO travaux Martigues
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => router.push('/chantiers')}>
            Voir les chantiers
          </button>
          <button className="btn btn-primary" onClick={() => router.push('/chantiers')}>
            + Nouveau chantier
          </button>
        </div>
      </div>

      {/* ── Quick-nav cards ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-900)', letterSpacing: '-0.01em' }}>
            Raccourcis
          </h2>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: 14,
        }}>
          {QUICK_LINKS.map(item => (
            <button
              key={item.key}
              onClick={() => router.push(item.href)}
              className="card"
              style={{
                padding: '20px 18px',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'border-color 150ms, box-shadow 150ms, transform 100ms',
                background: '#fff',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'var(--brand-300)'
                e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,87,142,0.10)'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--ink-200)'
                e.currentTarget.style.boxShadow = '0 1px 4px rgba(15,23,42,0.06)'
                e.currentTarget.style.transform = 'none'
              }}
            >
              <div style={{
                width: 36, height: 36,
                background: 'var(--brand-50)',
                borderRadius: 10,
                display: 'grid',
                placeItems: 'center',
                color: 'var(--brand-700)',
                marginBottom: 12,
              }}>
                {Icons[item.key]}
              </div>
              <div style={{ fontWeight: 600, color: 'var(--ink-800)', fontSize: 13.5 }}>{item.label}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 4 }}>{item.desc}</div>
            </button>
          ))}
        </div>
      </div>

    </div>
  )
}
