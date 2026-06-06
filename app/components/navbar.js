'use client'
import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth-context'

/* ── Inline SVG icons ── */
function Icon({ d, d2, children }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {d  && <path d={d}/>}
      {d2 && <path d={d2}/>}
      {children}
    </svg>
  )
}
const HomeIcon     = () => <Icon d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" d2="M9 22V12h6v10"/>
const FolderIcon   = () => <Icon d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
const UsersIcon    = () => <Icon d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" d2="M23 21v-2a4 4 0 0 0-3-3.87"><circle cx="9" cy="7" r="4"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></Icon>
const WrenchIcon   = () => <Icon d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
const CalendarIcon = () => <Icon><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></Icon>
const WalletIcon   = () => <Icon><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></Icon>
const MessageIcon  = () => <Icon d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
const ChartIcon    = () => <Icon><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></Icon>
const SettingsIcon = () => <Icon d2="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"><circle cx="12" cy="12" r="3"/></Icon>
const PinIcon      = () => <Icon><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17H19V13L17 7H7L5 13V17Z"/></Icon>
const LogOutIcon   = () => <Icon d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" d2="M16 17l5-5-5-5"><line x1="21" y1="12" x2="9" y2="12"/></Icon>
const MenuIcon     = () => <Icon><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></Icon>
const CloseIcon    = () => <Icon><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></Icon>
const UserIcon     = () => <Icon><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/></Icon>

const NAV_GROUPS = [
  {
    label: 'Activité',
    items: [
      { href: '/dashboard',    label: 'Tableau de bord', Icon: HomeIcon },
      { href: '/chantiers',    label: 'Chantiers',        Icon: FolderIcon, badge: null },
    ],
  },
  {
    label: 'Contacts',
    items: [
      { href: '/clients',      label: 'Clients',          Icon: UsersIcon },
      { href: '/artisans',     label: 'Artisans',         Icon: WrenchIcon },
    ],
  },
  {
    label: 'Pilotage',
    items: [
      { href: '/planning',     label: 'Planning',         Icon: CalendarIcon },
      { href: '/finances',     label: 'Finances',         Icon: WalletIcon },
      { href: '/messagerie',   label: 'Messagerie',       Icon: MessageIcon },
      { href: '/statistiques', label: 'Statistiques',     Icon: ChartIcon },
    ],
  },
  {
    label: 'Système',
    items: [
      { href: '/profil',       label: 'Mon profil',       Icon: UserIcon, agenteOnly: true },
      { href: '/parametres',   label: 'Paramètres',       Icon: SettingsIcon, adminOnly: true },
    ],
  },
]

function NavItem({ href, label, Icon: ItemIcon, badge, active, open }) {
  return (
    <Link href={href} className={`nav-item${active ? ' active' : ''}`}>
      <span className="nav-icon"><ItemIcon /></span>
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
  const [mobileOpen, setMobileOpen] = useState(false)
  const { profile, displayAgenceName, unreadCount } = useAuth()

  // Close mobile drawer on route change
  useEffect(() => { setMobileOpen(false) }, [pathname])

  // Prevent body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileOpen) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = prev }
    }
  }, [mobileOpen])

  const hidden = ['/', '/login', '/espace-client'].some(
    p => pathname === p || pathname?.startsWith('/espace-client')
  )
  if (hidden || !profile) return null

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const isActive = (href) => pathname?.startsWith(href)
  const open = pinned || hover || mobileOpen

  const initials = `${profile.prenom?.[0] ?? ''}${profile.nom?.[0] ?? ''}`.toUpperCase()
  const roleLabel = profile.role === 'admin' ? 'Franchisée' : profile.role === 'agente' ? 'Agente' : 'Membre'

  return (
    <>
      {/* Mobile top bar (hidden ≥768px) */}
      <header className="mobile-topbar">
        <button
          className="mobile-menu-btn"
          onClick={() => setMobileOpen(true)}
          aria-label="Ouvrir le menu"
        >
          <MenuIcon />
        </button>
        <div className="mobile-topbar-brand">
          <div className="logo-mark" style={{ width: 28, height: 28, fontSize: 12 }}>Ba</div>
          <span>BATILIS</span>
        </div>
      </header>

      {/* Backdrop for mobile drawer */}
      {mobileOpen && (
        <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} />
      )}

      <aside
        className={`sidebar${open ? ' open' : ''}${pinned ? ' pinned' : ''}${mobileOpen ? ' mobile-open' : ''}`}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <div className="sidebar-inner">

          {/* Logo */}
          <div className="logo-block">
            <div className="logo-mark">Ba</div>
            <div className="logo-text">
              BATILIS
              <span className="muted">{displayAgenceName || ' '}</span>
            </div>
            <button
              className="mobile-close-btn"
              onClick={() => setMobileOpen(false)}
              aria-label="Fermer le menu"
            >
              <CloseIcon />
            </button>
          </div>

          {/* Pin toggle (desktop only) */}
          <button
            className={`pin-btn${pinned ? ' active' : ''}`}
            onClick={() => setPinned(p => !p)}
            title={pinned ? 'Désépingler' : 'Épingler ouvert'}
          >
            <PinIcon />
          </button>

          {/* Nav */}
          <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 0' }}>
            {NAV_GROUPS.map(group => {
              const visibleItems = group.items.filter(item =>
                (!item.adminOnly  || profile?.role === 'admin') &&
                (!item.agenteOnly || profile?.role === 'agente'))
              if (visibleItems.length === 0) return null
              return (
                <div key={group.label}>
                  <div className="nav-section-label">{group.label}</div>
                  {visibleItems.map(item => (
                    <NavItem
                      key={item.href}
                      {...item}
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
              <LogOutIcon />
            </button>
          </div>

        </div>
      </aside>
    </>
  )
}
