'use client'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '../lib/auth-context'
import { Icon } from './ui/Icon'
import { Avatar } from './ui/Avatar'

const SECTION_LABELS = {
  dashboard:    'Tableau de bord',
  chantiers:    'Chantiers',
  clients:      'Clients',
  artisans:     'Artisans',
  planning:     'Planning',
  finances:     'Finances',
  messagerie:   'Messagerie',
  statistiques: 'Statistiques',
  parametres:   'Paramètres',
  notifications:'Notifications',
}

export default function Header() {
  const router = useRouter()
  const pathname = usePathname() || ''
  const { profile, unreadCount } = useAuth()

  // Masquer le header sur login / racine / espace client
  const hidden = ['/', '/login', '/espace-client'].some(
    p => pathname === p || pathname?.startsWith('/espace-client')
  )
  if (hidden || !profile) return null

  const segment = pathname.split('/').filter(Boolean)[0] || 'dashboard'
  const label = SECTION_LABELS[segment] || segment

  const initials = `${profile.prenom?.[0] ?? ''}${profile.nom?.[0] ?? ''}`.toUpperCase()
  const roleLabel = profile.role === 'admin' ? 'Franchisée' : profile.role === 'agente' ? 'Agente' : 'Membre'

  return (
    <header className="app-header">
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, color: 'var(--ink-500)', flex: '0 0 auto' }}>
        <span style={{ color: 'var(--ink-400)' }}>illiCO Martigues</span>
        <Icon name="ChevronRight" size={14} />
        <strong style={{ color: 'var(--ink-900)', fontWeight: 700 }}>{label}</strong>
      </div>

      {/* Search */}
      <div style={{ flex: 1, maxWidth: 480, marginLeft: 24, position: 'relative' }}>
        <span style={{
          position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
          color: 'var(--ink-400)', pointerEvents: 'none',
        }}>
          <Icon name="Search" size={16} />
        </span>
        <input
          className="input"
          placeholder="Recherche globale — chantier, client, artisan…"
          style={{ paddingLeft: 38, paddingRight: 60, width: '100%', height: 38, background: 'var(--surface-2)' }}
        />
        <span style={{
          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
          display: 'flex', gap: 2, pointerEvents: 'none',
        }}>
          <span className="kbd">⌘</span><span className="kbd">K</span>
        </span>
      </div>

      {/* Right cluster */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          className="btn btn-ghost"
          style={{ padding: '7px 10px', position: 'relative' }}
          onClick={() => router.push('/notifications')}
          title="Notifications"
        >
          <Icon name="Bell" size={16} />
          {unreadCount > 0 && (
            <span style={{
              position: 'absolute', top: 4, right: 6,
              width: 8, height: 8, background: '#dc2626', borderRadius: 99,
              border: '2px solid #fff',
            }} />
          )}
        </button>
        <button
          className="btn btn-ghost"
          style={{ padding: '7px 10px' }}
          onClick={() => router.push('/messagerie')}
          title="Messagerie"
        >
          <Icon name="Mail" size={16} />
        </button>
        <div style={{ height: 24, width: 1, background: 'var(--ink-200)', margin: '0 4px' }} />
        <button
          className="row-hover"
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '4px 8px', borderRadius: 8, border: 0, background: 'none', cursor: 'pointer',
          }}
          onClick={() => router.push('/parametres')}
        >
          <Avatar name={`${profile.prenom} ${profile.nom}`} color="var(--brand-800)" size={30} />
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-900)', lineHeight: 1.1 }}>
              {profile.prenom} {profile.nom?.[0]}.
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--ink-500)', marginTop: 1 }}>{roleLabel}</div>
          </div>
          <Icon name="ChevronDown" size={12} />
        </button>
      </div>
    </header>
  )
}
