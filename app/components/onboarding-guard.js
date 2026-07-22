'use client'
import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '../lib/auth-context'

// Routes accessibles SANS profil (ne déclenchent pas la redirection onboarding).
// Doit inclure /onboarding lui-même (anti-boucle), les pages publiques et l'espace client.
const EXEMPT_EXACT = ['/onboarding', '/login', '/']
function isExempt(pathname) {
  return (
    EXEMPT_EXACT.includes(pathname) ||
    pathname?.startsWith('/auth/') ||        // /auth/set-password
    pathname?.startsWith('/espace-client')   // espace client (role client)
  )
}

// Couche EN PLUS des gardes par-page : redirige un utilisateur connecté SANS profil
// (admin invité qui n'a pas encore créé sa société) vers /onboarding, partout dans l'app.
// Ne touche pas la gestion !user (les pages redirigent déjà vers /login).
export default function OnboardingGuard({ children }) {
  const { user, profile, profileStatus, isSuperAdmin } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (!user) return                               // géré par les gardes par-page (/login)

    // Éditrice (super-admin) : jamais d'onboarding, jamais l'app tenant. Elle vit
    // uniquement sur /super-admin. Ce test passe AVANT tout (elle n'a pas de profil).
    if (isSuperAdmin) {
      if (!pathname?.startsWith('/super-admin')) router.replace('/super-admin')
      return
    }

    if (profileStatus === 'loading') return        // statut non tranché → pas de flash/boucle

    if (profileStatus === 'absent') {
      // Connecté sans profil → onboarding, sauf sur une route exemptée.
      if (!isExempt(pathname)) router.replace('/onboarding')
    } else if (profileStatus === 'loaded') {
      // A un profil mais se trouve sur /onboarding → rien à y faire, on renvoie.
      if (pathname === '/onboarding') {
        router.replace(profile?.role === 'client' ? '/espace-client' : '/dashboard')
      }
    }
  }, [profileStatus, user, profile?.role, pathname, router, isSuperAdmin])

  return children
}
