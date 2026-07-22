'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth-context'

// ESPACE CRÉATRICE (super-admin éditrice). Gardé côté client par l'email
// (isSuperAdmin) ; la VRAIE sécurité est côté serveur sur les routes
// /api/super-admin/* (requireSuperAdmin). Cette page ne montrera JAMAIS de
// données tenant (dossiers/clients/finances) — uniquement des comptes.
export default function SuperAdmin() {
  const { user, isSuperAdmin, initialized } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!initialized) return
    // Non-éditrice : un simple utilisateur connecté repart au dashboard, un
    // visiteur non connecté vers le login. La vraie barrière reste serveur.
    if (!isSuperAdmin) router.replace(user ? '/dashboard' : '/login')
  }, [initialized, user, isSuperAdmin, router])

  if (!initialized || !user || !isSuperAdmin) {
    return <div className="page-loading" style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#fff' }} />
  }

  const logout = async () => { await supabase.auth.signOut(); router.replace('/login') }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-2, #f7f8fa)', padding: '40px 24px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 9, background: 'var(--brand-800)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800 }}>Co</div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink-900)' }}>Espace créatrice</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>{user.email}</div>
            </div>
          </div>
          <button onClick={logout} className="btn btn-ghost" style={{ fontSize: 13 }}>Se déconnecter</button>
        </div>

        <div className="card" style={{ padding: 24 }}>
          <p style={{ fontSize: 14, color: 'var(--ink-700)', lineHeight: 1.6 }}>
            Accès super-admin actif. Tu ne vois <strong>aucune donnée</strong> des sociétés de tes
            clients (ni dossiers, ni clients, ni finances) — seulement, à venir, les <strong>comptes</strong> :
          </p>
          <ul style={{ fontSize: 14, color: 'var(--ink-600)', lineHeight: 1.9, marginTop: 8 }}>
            <li>Demandes d&apos;agents à valider (1 clic = 1 agent créé et invité).</li>
            <li>Inviter un nouvel admin franchisé.</li>
            <li>Vue des comptes existants par société / agence.</li>
          </ul>
          <p style={{ fontSize: 12.5, color: 'var(--ink-400)', marginTop: 12 }}>Interface en cours de construction (lots suivants).</p>
        </div>
      </div>
    </div>
  )
}
