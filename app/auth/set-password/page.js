'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'

// L14a — Définition du mot de passe après acceptation d'un lien d'invitation.
// Le lien invite (inviteUserByEmail) pose la session automatiquement via le hash
// de l'URL (client en flow implicit, detectSessionInUrl par défaut). On attend
// cette session, puis on appelle updateUser({ password }) pour donner à l'invité
// des identifiants durables (sinon : reconnexion impossible une fois le lien expiré).

// Coquille visuelle commune (chargement / erreur / formulaire).
// Définie au niveau module : si elle était interne au composant, elle serait
// recréée à chaque render → React démonterait le sous-arbre et les inputs
// perdraient le focus à chaque frappe.
function Shell({ children }) {
  return (
    <div style={{position:'fixed', inset:0, display:'grid', placeItems:'center', padding:20, background:'linear-gradient(135deg, var(--brand-800) 0%, var(--brand-900) 60%, #001e3c 100%)'}}>
      <div className="card" style={{maxWidth:440, width:'100%', padding:'32px 30px', display:'flex', flexDirection:'column', gap:16}}>
        <div style={{display:'flex', alignItems:'center', gap:12}}>
          <div style={{width:38, height:38, borderRadius:9, background:'var(--brand-800)', color:'#fff', display:'grid', placeItems:'center', fontWeight:800, fontSize:14}}>Ba</div>
          <div style={{fontSize:16, fontWeight:800, color:'var(--ink-900)'}}>BATILIS</div>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function SetPassword() {
  // null = en attente de session ; true = session prête ; false = lien invalide/expiré
  const [sessionReady, setSessionReady] = useState(null)
  const [pwd, setPwd] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  useEffect(() => {
    let resolved = false

    const markReady = () => {
      if (resolved) return
      resolved = true
      setSessionReady(true)
    }

    // 1. La session est peut-être déjà posée (hash traité au chargement).
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) markReady()
    })

    // 2. Sinon, elle peut arriver juste après le montage (traitement du hash async).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) markReady()
    })

    // 3. Garde-fou : si aucune session après un court délai, on considère le lien
    //    invalide ou expiré (ou flow non-implicit). On NE tente PAS exchangeCodeForSession
    //    (on est en implicit) ; ce cas est affiché pour qu'on sache, au test, s'il faut
    //    basculer sur verifyOtp({ type: 'invite' }).
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true
        console.warn('[set-password] Aucune session détectée à l\'atterrissage du lien invite.')
        setSessionReady(false)
      }
    }, 4000)

    return () => {
      subscription?.unsubscribe()
      clearTimeout(timer)
    }
  }, [])

  const handleSubmit = async () => {
    if (pwd.length < 8) { setError('8 caractères minimum'); return }
    if (pwd !== confirm) { setError('Les mots de passe ne correspondent pas'); return }
    setSaving(true); setError('')
    const { error: updErr } = await supabase.auth.updateUser({ password: pwd })
    if (updErr) {
      setError('Erreur : ' + updErr.message)
      setSaving(false)
      return
    }
    router.replace('/dashboard')
  }

  if (sessionReady === null) {
    return <Shell><p className="eyebrow" style={{textAlign:'center'}}>Validation du lien…</p></Shell>
  }

  if (sessionReady === false) {
    return (
      <Shell>
        <h1 className="page" style={{fontSize:18}}>Lien invalide ou expiré</h1>
        <p style={{fontSize:13.5, color:'var(--ink-500)', lineHeight:1.6}}>
          Ce lien d'invitation n'est plus valide. Contactez l'administrateur pour recevoir une nouvelle invitation.
        </p>
        <button className="btn btn-ghost" onClick={() => router.replace('/login')}>Retour à la connexion</button>
      </Shell>
    )
  }

  return (
    <Shell>
      <div>
        <h1 className="page" style={{fontSize:18, marginBottom:4}}>Définir mon mot de passe</h1>
        <p style={{fontSize:13, color:'var(--ink-500)'}}>Choisissez un mot de passe pour accéder à votre espace.</p>
      </div>
      {error && (
        <div style={{background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:8, padding:'8px 12px', fontSize:13, color:'#b91c1c'}}>{error}</div>
      )}
      <div>
        <label className="eyebrow" style={{display:'block', marginBottom:6}}>Mot de passe</label>
        <input className="input" type="password" value={pwd} onChange={e => setPwd(e.target.value)} placeholder="8 caractères minimum"/>
      </div>
      <div>
        <label className="eyebrow" style={{display:'block', marginBottom:6}}>Confirmer le mot de passe</label>
        <input className="input" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Retapez le mot de passe"/>
      </div>
      <button className="btn btn-primary" onClick={handleSubmit} disabled={saving || !pwd || !confirm}
        style={{opacity: (saving || !pwd || !confirm) ? 0.5 : 1}}>
        {saving ? 'Enregistrement…' : 'Définir mon mot de passe'}
      </button>
    </Shell>
  )
}
