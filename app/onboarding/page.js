'use client'
import { useState } from 'react'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../lib/auth-context'
import { apiFetch } from '../lib/api-auth-client'

// Onboarding (sous-lot 3c). Accessible à un utilisateur connecté SANS profil
// (admin franchisé invité). Exemptée de OnboardingGuard (anti-boucle), elle gère
// sa propre logique : crée société + 1ère agence + profil admin via la route
// /api/onboarding/create-societe, puis fetchProfile → la garde renvoie au dashboard.

// Coquille pleine page (gradient brand), scrollable pour le formulaire.
function Shell({ children, maxWidth = 480 }) {
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', padding: 20, overflowY: 'auto',
      background: 'linear-gradient(135deg, var(--brand-800) 0%, var(--brand-900) 60%, #001e3c 100%)' }}>
      <div className="card" style={{ maxWidth, width: '100%', padding: '32px 30px', display: 'flex', flexDirection: 'column', gap: 16, margin: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 9, background: 'var(--brand-800)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 14 }}>Co</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink-900)' }}>Batilis</div>
        </div>
        {children}
      </div>
    </div>
  )
}

const LS = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-600)', marginBottom: 5 }
const SECTION = { fontSize: 11, fontWeight: 700, letterSpacing: 0.06, textTransform: 'uppercase', color: 'var(--ink-400)', marginTop: 6, marginBottom: 2 }

function Field({ label, required, value, onChange, type = 'text', readOnly = false, placeholder }) {
  return (
    <div>
      <label style={LS}>{label}{required && <span style={{ color: '#b91c1c' }}> *</span>}</label>
      <input
        className="input" type={type} value={value} placeholder={placeholder}
        onChange={readOnly ? undefined : (e => onChange(e.target.value))}
        readOnly={readOnly}
        style={{ width: '100%', height: 42, ...(readOnly ? { background: 'var(--ink-50, #f5f5f5)', color: 'var(--ink-500)' } : {}) }}
      />
    </div>
  )
}

export default function Onboarding() {
  const { user, profile, profileStatus, initialized, fetchProfile } = useAuth()
  const router = useRouter()

  const [form, setForm] = useState({
    nom_societe: '', siret: '', rcs: '',
    agence_nom: '', agence_ville: '', agence_adresse: '', agence_cp: '', agence_tel: '',
    nom: '', prenom: '', telephone: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (champ) => (valeur) => setForm(f => ({ ...f, [champ]: valeur }))

  useEffect(() => {
    if (!initialized || profileStatus === 'loading') return
    if (!user) { router.replace('/login'); return }
    // Déjà un profil → rien à faire ici.
    if (profileStatus === 'loaded') {
      router.replace(profile?.role === 'client' ? '/espace-client' : '/dashboard')
    }
  }, [initialized, user?.id, profileStatus, profile?.role, router])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    // Validation client : mêmes champs requis que la route/fonction.
    if (!form.nom_societe.trim() || !form.agence_nom.trim() || !form.agence_ville.trim() || !form.nom.trim() || !form.prenom.trim()) {
      setError('Merci de remplir les champs obligatoires (*).')
      return
    }
    setSaving(true)
    try {
      const res = await apiFetch('/api/onboarding/create-societe', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Une erreur est survenue lors de la création.')
        setSaving(false)
        return
      }
      // Succès : recharger le profil → profileStatus passe 'loaded' →
      // OnboardingGuard redirige. Fallback explicite par sécurité.
      await fetchProfile(user.id)
      router.replace('/dashboard')
    } catch {
      setError('Erreur réseau, veuillez réessayer.')
      setSaving(false)
    }
  }

  // États transitoires (chargement) ou redirection en cours.
  if (!initialized || profileStatus === 'loading' || !user || profileStatus === 'loaded') {
    return <Shell><p className="eyebrow" style={{ textAlign: 'center' }}>Chargement…</p></Shell>
  }

  // profileStatus === 'absent' : le formulaire de création.
  return (
    <Shell maxWidth={560}>
      <div>
        <h1 className="page" style={{ fontSize: 20, marginBottom: 6 }}>Bienvenue sur Batilis 👋</h1>
        <p style={{ fontSize: 13.5, color: 'var(--ink-500)', lineHeight: 1.6 }}>
          Dernière étape : créez votre société et votre première agence pour accéder à votre espace.
        </p>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#b91c1c' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* ── Votre société ── */}
        <div style={SECTION}>Votre société</div>
        <Field label="Nom de la société" required value={form.nom_societe} onChange={set('nom_societe')} placeholder="Nom de votre société" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="SIRET / SIREN" value={form.siret} onChange={set('siret')} placeholder="123 456 789 00012" />
          <Field label="RCS" value={form.rcs} onChange={set('rcs')} />
        </div>

        {/* ── Votre première agence ── */}
        <div style={SECTION}>Votre première agence</div>
        <Field label="Nom de l'agence" required value={form.agence_nom} onChange={set('agence_nom')} placeholder="illiCO travaux [ville]" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Ville" required value={form.agence_ville} onChange={set('agence_ville')} placeholder="Votre ville" />
          <Field label="Code postal" value={form.agence_cp} onChange={set('agence_cp')} />
        </div>
        <Field label="Adresse" value={form.agence_adresse} onChange={set('agence_adresse')} />
        <Field label="Téléphone" type="tel" value={form.agence_tel} onChange={set('agence_tel')} />

        {/* ── Vous ── */}
        <div style={SECTION}>Vous</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Prénom" required value={form.prenom} onChange={set('prenom')} />
          <Field label="Nom" required value={form.nom} onChange={set('nom')} />
        </div>
        <Field label="Téléphone" type="tel" value={form.telephone} onChange={set('telephone')} />
        <Field label="Email du compte" value={user.email || ''} readOnly />

        <button type="submit" className="btn btn-primary" disabled={saving}
          style={{ marginTop: 10, height: 44, width: '100%', justifyContent: 'center', fontSize: 14, opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Création…' : 'Créer ma société →'}
        </button>
      </form>
    </Shell>
  )
}
