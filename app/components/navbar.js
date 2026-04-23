'use client'
import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {supabase} from '../lib/supabase'
import Image from 'next/image'

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
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    const charger = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('profiles').select('prenom, nom, role').eq('id', user.id).single()
      setProfile(data)
    }
    charger()
  }, []) // Fetch une seule fois au montage, pas à chaque navigation

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

          {/* Droite : profil + déconnexion */}
          <div className="hidden md:flex items-center gap-3">
            <span className="text-blue-200 text-xs">{profile.prenom} {profile.nom}</span>
            <button onClick={handleLogout}
              className="text-blue-200 hover:text-white text-xs border border-blue-400 hover:border-white px-2 py-1 rounded transition-all">
              Déconnexion
            </button>
          </div>

          {/* Hamburger mobile */}
          <button onClick={() => setMenuOuvert(o => !o)} className="md:hidden text-white p-2">
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
