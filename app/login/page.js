'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '../lib/auth-context'

function redirectByRole(role, router) {
  if (role === 'client') router.replace('/espace-client')
  else router.replace('/dashboard')
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState('signin') // 'signin' | 'forgot'
  const router = useRouter()
  const { user, profile, initialized } = useAuth()

  useEffect(() => {
    if (!initialized || !user || !profile) return
    redirectByRole(profile.role, router)
  }, [initialized, user?.id, profile?.id, profile?.role, router])

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError('Email ou mot de passe incorrect')
        setLoading(false)
        return
      }
      window.location.replace('/dashboard')
    } catch {
      setError('Erreur de connexion, veuillez réessayer')
      setLoading(false)
    }
  }

  // Mot de passe oublié : le lien de réinitialisation part de NOTRE boîte d'envoi
  // (route /api/reset-password → Graph), plus de Supabase. Anti-énumération : la route
  // répond toujours { ok:true } et n'envoie que si le compte existe → message générique.
  // Le ?type=recovery (query string posée par la route) pilote le wording de set-password.
  const handleForgot = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setInfo('')
    try {
      await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
    } catch { /* message générique quoi qu'il arrive */ }
    setInfo("Si un compte existe avec cet email, un lien de réinitialisation vient d'être envoyé. Pensez à vérifier vos spams.")
    setLoading(false)
  }

  // Tant que l'auth n'est pas tranchée, ou si une session existe déjà (redirection
  // imminente par le useEffect), on affiche un loader plutôt que le FORMULAIRE — sinon
  // un utilisateur déjà connecté voit le login « flasher » avant d'être renvoyé.
  if (!initialized || user) {
    return <div className="page-loading" style={{position:'fixed', inset:0, zIndex:9999, background:'#fff'}} />
  }

  return (
    <div className="login-shell" style={{position:'fixed', inset:0, display:'grid', gridTemplateColumns:'1fr 1fr', background:'#fff', overflow:'auto', zIndex:9999}}>

      {/* ── Colonne gauche — panel brand ── */}
      <div className="login-brand" style={{
        position:'relative', overflow:'hidden',
        background:'linear-gradient(135deg, var(--brand-800) 0%, var(--brand-900) 60%, #0a3d38 100%)',
        color:'#fff', padding:'60px 64px', display:'flex', flexDirection:'column', justifyContent:'space-between'
      }}>
        <div style={{position:'absolute', top:-100, right:-80, width:340, height:340, borderRadius:'50%', background:'rgba(255,255,255,0.04)'}}/>
        <div style={{position:'absolute', bottom:-120, left:-60, width:280, height:280, borderRadius:'50%', background:'rgba(20,184,166,0.10)'}}/>

        {/* Logo */}
        <div style={{position:'relative', display:'flex', alignItems:'center', gap:12}}>
          <div style={{width:42, height:42, borderRadius:10, background:'#fff', color:'var(--brand-800)', display:'grid', placeItems:'center', fontWeight:800, fontSize:16}}>Ba</div>
          <div>
            <div style={{fontSize:18, fontWeight:800, letterSpacing:-0.01}}>Batilis</div>
            <div style={{fontSize:11, opacity:0.6, letterSpacing:0.06, textTransform:'uppercase'}}>Gestion travaux</div>
          </div>
        </div>

        {/* Tagline */}
        <div style={{position:'relative', maxWidth:480}}>
          <div style={{fontSize:14, opacity:0.7, fontWeight:600, letterSpacing:0.06, textTransform:'uppercase', marginBottom:18}}>
            Espace pilotage agence
          </div>
          <h1 style={{fontSize:36, fontWeight:800, letterSpacing:-0.02, lineHeight:1.15, margin:0}}>
            Pilote ton activité de courtage travaux en toute sérénité.
          </h1>
          <p style={{fontSize:15, opacity:0.85, lineHeight:1.6, marginTop:18}}>
            Suivi des chantiers, gestion des artisans, finances, planning et espace client AMO — toute votre activité dans un seul écran.
          </p>
          <div style={{display:'flex', gap:24, marginTop:30, fontSize:12, opacity:0.7, flexWrap:'wrap'}}>
            <span style={{display:'inline-flex', alignItems:'center', gap:6}}>🔒 Chiffré SSL</span>
            <span style={{display:'inline-flex', alignItems:'center', gap:6}}>🛡️ RGPD compliant</span>
            <span style={{display:'inline-flex', alignItems:'center', gap:6}}>✨ IA intégrée</span>
          </div>
        </div>

        {/* Footer */}
        <div style={{position:'relative', fontSize:12, opacity:0.55}}>
          © Batilis · {new Date().getFullYear()}
        </div>
      </div>

      {/* ── Colonne droite — formulaire ── */}
      <div className="login-form-col" style={{padding:'60px 64px', display:'flex', flexDirection:'column', justifyContent:'center', maxWidth:520, width:'100%', margin:'0 auto'}}>

        {mode === 'signin' ? (
          <form onSubmit={handleLogin} style={{display:'flex', flexDirection:'column'}}>
            <div className="eyebrow" style={{marginBottom:6}}>Connexion</div>
            <h2 style={{fontSize:28, fontWeight:800, color:'var(--ink-900)', letterSpacing:-0.02, margin:0}}>Bon retour parmi nous 👋</h2>
            <p style={{fontSize:13.5, color:'var(--ink-500)', marginTop:8, marginBottom:30}}>
              Connecte-toi avec ton email professionnel.
            </p>

            <div style={{marginBottom:14}}>
              <label style={{display:'block', fontSize:12, fontWeight:600, color:'var(--ink-600)', marginBottom:5}}>Email</label>
              <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="nom.prenom@illico-travaux.com" style={{height:44, width:'100%'}} required />
            </div>
            <div>
              <label style={{display:'block', fontSize:12, fontWeight:600, color:'var(--ink-600)', marginBottom:5}}>Mot de passe</label>
              <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" style={{height:44, width:'100%'}} required />
            </div>

            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:14}}>
              <label style={{display:'flex', alignItems:'center', gap:8, fontSize:12.5, color:'var(--ink-700)', cursor:'pointer'}}>
                <input type="checkbox" defaultChecked style={{accentColor:'var(--brand-500)'}} />
                Se souvenir de moi
              </label>
              <button type="button" onClick={() => { setMode('forgot'); setError('') }}
                style={{background:'none', border:0, fontSize:12.5, color:'var(--brand-500)', fontWeight:600, cursor:'pointer'}}>
                Mot de passe oublié ?
              </button>
            </div>

            {error && (
              <div style={{background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:8, padding:'8px 12px', fontSize:13, color:'#b91c1c', marginTop:14}}>
                {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={loading}
              style={{marginTop:24, height:44, width:'100%', justifyContent:'center', fontSize:14, opacity: loading ? 0.6 : 1}}>
              {loading ? 'Connexion…' : 'Se connecter →'}
            </button>

            <p style={{fontSize:12, color:'var(--ink-500)', marginTop:30, textAlign:'center'}}>
              Première fois ? Demande une invitation à ton ou ta franchisé (e)
            </p>
          </form>
        ) : (
          <form onSubmit={handleForgot} style={{display:'flex', flexDirection:'column'}}>
            <button type="button" className="btn btn-ghost" onClick={() => { setMode('signin'); setError(''); setInfo('') }}
              style={{alignSelf:'flex-start', marginBottom:24, fontSize:12.5}}>
              ← Retour
            </button>
            <h2 style={{fontSize:24, fontWeight:800, color:'var(--ink-900)', letterSpacing:-0.02, margin:0}}>Mot de passe oublié ?</h2>
            <p style={{fontSize:13.5, color:'var(--ink-500)', marginTop:8, marginBottom:24}}>
              On t&apos;envoie un lien sécurisé pour réinitialiser ton mot de passe.
            </p>
            <div>
              <label style={{display:'block', fontSize:12, fontWeight:600, color:'var(--ink-600)', marginBottom:5}}>Email</label>
              <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="ton@email.com" style={{height:44, width:'100%'}} required />
            </div>

            {info && (
              <div style={{background:'rgba(22,163,74,0.06)', border:'1px solid rgba(22,163,74,0.2)', borderRadius:8, padding:'8px 12px', fontSize:13, color:'#15803d', marginTop:14}}>
                {info}
              </div>
            )}
            {error && (
              <div style={{background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:8, padding:'8px 12px', fontSize:13, color:'#b91c1c', marginTop:14}}>
                {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={loading}
              style={{marginTop:20, height:44, width:'100%', justifyContent:'center', fontSize:14, opacity: loading ? 0.6 : 1}}>
              {loading ? 'Envoi…' : '✉️ Envoyer le lien'}
            </button>
          </form>
        )}

      </div>

      {/* Liens légaux publics (aussi requis par Google pour l'accès OAuth). */}
      <div style={{position:'fixed', bottom:12, left:'50%', transform:'translateX(-50%)', zIndex:10000, background:'rgba(255,255,255,0.92)', borderRadius:99, padding:'5px 14px', fontSize:12, color:'#4b5563', boxShadow:'0 1px 4px rgba(0,0,0,0.12)'}}>
        <a href="/confidentialite" style={{color:'#374151'}}>Confidentialité</a>
        <span style={{margin:'0 8px', color:'#9ca3af'}}>·</span>
        <a href="/cgu" style={{color:'#374151'}}>Conditions d’utilisation</a>
      </div>
    </div>
  )
}
