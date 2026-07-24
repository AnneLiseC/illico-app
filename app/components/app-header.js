'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '../lib/auth-context'

function Svg({ children }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}
const SearchIcon   = () => <Svg><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></Svg>
const BellIcon     = () => <Svg><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></Svg>
const MailIcon     = () => <Svg><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="2,4 12,13 22,4"/></Svg>
const ChevronRight = () => <Svg><polyline points="9 18 15 12 9 6"/></Svg>
const ChevronDown  = () => <Svg><polyline points="6 9 12 15 18 9"/></Svg>

const BREADCRUMBS = {
  '/dashboard':     'Tableau de bord',
  '/chantiers':     'Chantiers',
  '/clients':       'Clients',
  '/artisans':      'Artisans',
  '/planning':      'Planning',
  '/finances':      'Finances',
  '/messagerie':    'Messagerie',
  '/statistiques':  'Statistiques',
  '/parametres':    'Paramètres',
  '/notifications': 'Notifications',
  '/espace-client': 'Espace client',
}

function getPageTitle(pathname) {
  if (!pathname) return ''
  if (/^\/chantiers\/.+/.test(pathname)) return 'Fiche chantier'
  const exact = BREADCRUMBS[pathname]
  if (exact) return exact
  const match = Object.entries(BREADCRUMBS).find(([k]) => pathname.startsWith(k + '/'))
  return match ? match[1] : ''
}

export default function AppHeader() {
  const pathname = usePathname()
  const { profile, unreadCount } = useAuth()

  const hidden = ['/', '/login'].some(p => pathname === p) || pathname?.startsWith('/espace-client')
  if (hidden || !profile) return null

  const initials  = `${profile.prenom?.[0] ?? ''}${profile.nom?.[0] ?? ''}`.toUpperCase()
  const roleLabel = profile.role === 'admin' ? 'Franchisé' : profile.role === 'agente' ? 'Agent' : 'Membre'
  const pageTitle = getPageTitle(pathname)

  return (
    <header className="app-header">
      {/* Breadcrumb */}
      <div style={{ display:'flex', alignItems:'center', gap:10, fontSize:13.5, color:'var(--ink-500)', flexShrink:0 }}>
        <span style={{ color:'var(--ink-400)' }}>Batilis</span>
        <ChevronRight />
        <strong style={{ color:'var(--ink-900)', fontWeight:700 }}>{pageTitle}</strong>
      </div>

      {/* Recherche globale */}
      <div style={{ flex:1, maxWidth:480, marginLeft:24, position:'relative' }}>
        <span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', color:'var(--ink-400)', pointerEvents:'none' }}>
          <SearchIcon />
        </span>
        <input
          className="input"
          placeholder="Recherche globale — chantier, client, artisan…"
          style={{ paddingLeft:38, paddingRight:60, width:'100%', height:38, background:'var(--surface-2)' }}
        />
        <span style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', display:'flex', gap:2, pointerEvents:'none' }}>
          <span className="kbd">⌘</span><span className="kbd">K</span>
        </span>
      </div>

      {/* Actions droite */}
      <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:10 }}>
        <Link href="/notifications" className="btn btn-ghost"
          style={{ padding:'7px 10px', position:'relative' }}>
          <BellIcon />
          {unreadCount > 0 && (
            <span style={{ position:'absolute', top:4, right:6, width:8, height:8,
              background:'#dc2626', borderRadius:99, border:'2px solid #fff' }} />
          )}
        </Link>

        <Link href="/messagerie" className="btn btn-ghost" style={{ padding:'7px 10px' }}>
          <MailIcon />
        </Link>

        <div style={{ height:24, width:1, background:'var(--ink-200)', margin:'0 4px' }} />

        <button
          style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 8px',
            borderRadius:8, background:'none', border:'none', cursor:'pointer' }}
          className="row-hover"
        >
          <span style={{ width:30, height:30, borderRadius:99, background:'var(--brand-700)',
            color:'#fff', display:'grid', placeItems:'center', fontWeight:700,
            fontSize:12, flexShrink:0 }}>
            {initials}
          </span>
          <div style={{ textAlign:'left' }}>
            <div style={{ fontSize:12.5, fontWeight:700, color:'var(--ink-900)', lineHeight:1.1 }}>
              {profile.prenom} {profile.nom?.[0]}.
            </div>
            <div style={{ fontSize:10.5, color:'var(--ink-500)', marginTop:1 }}>{roleLabel}</div>
          </div>
          <ChevronDown />
        </button>
      </div>
    </header>
  )
}
