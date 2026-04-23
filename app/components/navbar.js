'use client'
import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth-context'
import Image from 'next/image'

function BellIcon({ count }) {
  return (
    <Link href="/notifications" className="relative text-blue-200 hover:text-white p-1.5">
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}

const NAV_LINKS = [
  { href: '/chantiers', label: 'Chantiers', emoji: '🏗' },
  { href: '/clients', label: 'Clients', emoji: '👤' },
  { href: '/artisans', label: 'Artisans', emoji: '🔨' },
  { href: '/planning', label: 'Planning', emoji: '📅' },
  { href: '/finances', label: 'Finances', emoji: '💰' },
  { href: '/statistiques', label: 'Stats', emoji: '📊' },
  { href: '/parametres',   label: 'Paramètres',emoji: '⚙️', adminOnly: true },
]

export default function NavBar() {
  const router = useRouter()
  const pathname = usePathname()
  const [menuOuvert, setMenuOuvert] = useState(false)
  const { profile, unreadCount } = useAuth()

  // Masquer sur login, page d'accueil, espace-client
  const hidden = ['/', '/login', '/espace-client'].some(p => pathname === p || pathname?.startsWith('/espace-client'))
  if (hidden || !profile) return null

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const isActive = (href) => pathname?.startsWith(href)

  const linkCls = (href) => `px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
    isActive(href) ? 'bg-white text-blue-900' : 'text-blue-100 hover:bg-blue-700 hover:text-white'
  }`

  return (
    <nav style={{ backgroundColor: '#00578e' }} className="sticky top-0 z-50 shadow-md">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">

          {/* Logo */}
          <Link href="/dashboard" className="flex items-center">
            <Image src="/logo.png" alt="illiCO travaux" width={120} height={32} className="h-8 w-auto" />
          </Link>

          {/* Nav desktop */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.filter(l => !l.adminOnly || profile?.role === 'admin').map(({ href, label, emoji }) => (
              <Link key={href} href={href} className={linkCls(href)}>
                <span className="mr-1">{emoji}</span>{label}
              </Link>
            ))}
          </div>

          {/* Droite : cloche + profil + déconnexion */}
          <div className="hidden md:flex items-center gap-3">
            <BellIcon count={unreadCount} />
            <span className="text-blue-200 text-xs">{profile.prenom} {profile.nom}</span>
            <button onClick={handleLogout}
              className="text-blue-200 hover:text-white text-xs border border-blue-400 hover:border-white px-2 py-1 rounded transition-all">
              Déconnexion
            </button>
          </div>

          {/* Hamburger mobile */}
          <div className="flex items-center gap-1 md:hidden">
            <BellIcon count={unreadCount} />
            <button onClick={() => setMenuOuvert(o => !o)} className="text-white p-2">
              {menuOuvert ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>

        </div>
      </div>

      {/* Menu mobile déroulant */}
      {menuOuvert && (
        <div style={{ backgroundColor: '#004a78' }} className="md:hidden border-t border-blue-700 px-4 pb-4 pt-2 space-y-1">
          {NAV_LINKS.filter(l => !l.adminOnly || profile?.role === 'admin').map(({ href, label, emoji }) => (
            <Link key={href} href={href} onClick={() => setMenuOuvert(false)}
              className={`w-full block px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive(href) ? 'bg-white text-blue-900' : 'text-blue-100 hover:bg-blue-700 hover:text-white'
              }`}>
              <span className="mr-2">{emoji}</span>{label}
            </Link>
          ))}
          <div className="border-t border-blue-700 pt-3 mt-2 flex items-center justify-between">
            <span className="text-blue-300 text-xs">{profile.prenom} {profile.nom}</span>
            <button onClick={handleLogout} className="text-blue-200 hover:text-white text-xs border border-blue-500 px-3 py-1 rounded">
              Déconnexion
            </button>
          </div>
        </div>
      )}
    </nav>
  )
}
