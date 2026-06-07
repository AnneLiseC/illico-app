'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../lib/auth-context'

// Coquille onboarding (sous-lot 3b). Accessible à un utilisateur connecté SANS
// profil (admin invité). Le FORMULAIRE de création société arrive en 3c.
// Exemptée de OnboardingGuard (anti-boucle), elle gère sa propre logique.
function Shell({ children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', padding: 20,
      background: 'linear-gradient(135deg, var(--brand-800) 0%, var(--brand-900) 60%, #001e3c 100%)' }}>
      <div className="card" style={{ maxWidth: 480, width: '100%', padding: '32px 30px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 9, background: 'var(--brand-800)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 14 }}>Ba</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink-900)' }}>BATILIS</div>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function Onboarding() {
  const { user, profile, profileStatus, initialized } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!initialized || profileStatus === 'loading') return
    if (!user) { router.replace('/login'); return }
    // Déjà un profil → rien à faire ici.
    if (profileStatus === 'loaded') {
      router.replace(profile?.role === 'client' ? '/espace-client' : '/dashboard')
    }
  }, [initialized, user?.id, profileStatus, profile?.role, router])

  // États transitoires (chargement) ou redirection en cours.
  if (!initialized || profileStatus === 'loading' || !user || profileStatus === 'loaded') {
    return <Shell><p className="eyebrow" style={{ textAlign: 'center' }}>Chargement…</p></Shell>
  }

  // profileStatus === 'absent' : l'écran d'accueil onboarding.
  return (
    <Shell>
      <div>
        <h1 className="page" style={{ fontSize: 20, marginBottom: 6 }}>Bienvenue sur BATILIS 👋</h1>
        <p style={{ fontSize: 13.5, color: 'var(--ink-500)', lineHeight: 1.6 }}>
          Votre compte est créé. Dernière étape : <strong>créer votre société</strong> et votre première agence
          pour accéder à votre espace.
        </p>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--ink-400)', lineHeight: 1.6 }}>
        Le formulaire de création arrive très bientôt. {/* 3c : formulaire société + 1ère agence + consommation invitation */}
      </p>
    </Shell>
  )
}
