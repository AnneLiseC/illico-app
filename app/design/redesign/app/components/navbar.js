'use client'
import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth-context'
import { Icon } from './ui/Icon'

const NAV_GROUPS = [
  {
    label: 'Activité',
    items: [
      { href: '/dashboard',    label: 'Tableau de bord', icon: 'Home' },
      { href: '/chantiers',    label: 'Chantiers',        icon: 'Folder' },
    ],
  },
  {
    label: 'Contacts',
    items: [
      { href: '/clients',      label: 'Clients',          icon: 'Users' },
      { href: '/artisans',     label: 'Artisans',         icon: 'Hammer' },
    ],
  },
  {
    label: 'Pilotage',
    items: [
      { href: '/planning',     label: 'Planning',         icon: 'Calendar' },
      { href: '/finances',     label: 'Finances',         icon: 'Wallet' },
      { href: '/messagerie',   label: 'Messagerie',       icon: 'Message' },
      { href: '/statistiques', label: 'Statistiques',     icon: 'Chart' },
    ],
  },
  {
    label: 'Système',
    items: [
      { href: '/parametres',   label: 'Paramètres',       icon: 'Settings', adminOnly: true },
    ],
  },
]

function NavItem({ href, label, icon, badge, active, open }) {
  return (
    <Link href={href} className={`nav-item${active ? ' active' : ''}`}>
      <span className="nav-icon"><Icon name={icon} size={20} /></span>
      <span className="nav-label">{label}</span>
      {badge != null && (
        open
          ? <span className="nav-badge">{badge}</span>
          : <span className="nav-badge-dot" />
      )}
    </Link>
  )
}

export default function NavBar() {
  const router = useRouter()
  const pathname = usePathname()
  const [hover, setHover] = useState(false)
  const [pinned, setPinned] = useState(false)
  const { profile, unreadCount } = useAuth()

  const hidden = ['/', '/login', '/espace-client'].some(
    p => pathname === p || pathname?.startsWith('/espace-client')
  )
  if (hidden || !profile) return null

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const isActive = (href) => pathname?.startsWith(href)
  const open = pinned || hover

  const initials = `${profile.prenom?.[0] ?? ''}${profile.nom?.[0] ?? ''}`.toUpperCase()
  const roleLabel = profile.role === 'admin' ? 'Franchisée' : profile.role === 'agente' ? 'Agente' : 'Membre'

  // Badge dynamique sur Messagerie (notifications non lues)
  const badgeFor = (href) => href === '/messagerie' && unreadCount > 0 ? unreadCount : null

  return (
    <aside
      className={`sidebar${open ? ' open' : ''}${pinned ? ' pinned' : ''}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="sidebar-inner">

        {/* Logo */}
        <div className="logo-block">
          <div className="logo-mark">iC</div>
          <div className="logo-text">
            illiCO travaux
            <span className="muted">Martigues · {profile.prenom}</span>
          </div>
        </div>

        {/* Pin toggle (visible quand ouvert) */}
        <button
          className={`pin-btn${pinned ? ' active' : ''}`}
          onClick={() => setPinned(p => !p)}
          title={pinned ? 'Désépingler' : 'Épingler ouvert'}
        >
          <Icon name="Pin" size={12} />
        </button>

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 0' }}>
          {NAV_GROUPS.map(group => {
            const filtered = group.items.filter(item => !item.adminOnly || profile?.role === 'admin')
            if (filtered.length === 0) return null
            return (
              <div key={group.label}>
                <div className="nav-section-label">{group.label}</div>
                {filtered.map(item => (
                  <NavItem
                    key={item.href}
                    {...item}
                    badge={badgeFor(item.href)}
                    active={isActive(item.href)}
                    open={open}
                  />
                ))}
              </div>
            )
          })}
        </nav>

        {/* User block */}
        <div className="user-block">
          <span className="user-avatar">{initials}</span>
          <div className="user-meta">
            <div className="name">{profile.prenom} {profile.nom}</div>
            <div className="role">{roleLabel}</div>
          </div>
          <button className="logout-btn" onClick={handleLogout} title="Déconnexion">
            <Icon name="LogOut" size={14} />
          </button>
        </div>

      </div>
    </aside>
  )
}
