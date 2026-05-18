// Login + Forgot password — page d'authentification

function Login() {
  const [mode, setMode] = React.useState('signin'); // signin | forgot
  return (
    <div style={{
      position:'fixed', inset:0, display:'grid', gridTemplateColumns:'1fr 1fr',
      background:'#fff', overflow:'hidden', zIndex: 9999
    }}>
      {/* Left — brand panel */}
      <div style={{
        position:'relative', overflow:'hidden',
        background:'linear-gradient(135deg, var(--brand-800) 0%, var(--brand-900) 60%, #001e3c 100%)',
        color:'#fff', padding:'60px 64px', display:'flex',flexDirection:'column',justifyContent:'space-between'
      }}>
        <div style={{position:'absolute', top:-100, right:-80, width:340, height:340, borderRadius:'50%', background:'rgba(255,255,255,0.04)'}}/>
        <div style={{position:'absolute', bottom:-120, left:-60, width:280, height:280, borderRadius:'50%', background:'rgba(0,148,212,0.10)'}}/>

        <div style={{position:'relative'}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{
              width:42, height:42, borderRadius:10, background:'#fff', color:'var(--brand-800)',
              display:'grid', placeItems:'center', fontWeight:800, fontSize:16, letterSpacing:-0.02
            }}>iC</div>
            <div>
              <div style={{fontSize:18, fontWeight:800, letterSpacing:-0.01}}>illiCO travaux</div>
              <div style={{fontSize:11, opacity:0.6, letterSpacing:0.06, textTransform:'uppercase'}}>Martigues</div>
            </div>
          </div>
        </div>

        <div style={{position:'relative', maxWidth:480}}>
          <div style={{fontSize:14, opacity:0.7, fontWeight:600, letterSpacing:0.06, textTransform:'uppercase', marginBottom:18}}>
            Espace pilotage agence
          </div>
          <h1 style={{fontSize:38, fontWeight:800, letterSpacing:-0.02, lineHeight:1.15, margin:0}}>
            Pilote ton activité de courtage travaux en toute sérénité.
          </h1>
          <p style={{fontSize:15, opacity:0.85, lineHeight:1.6, marginTop:18}}>
            Suivi des chantiers, gestion des artisans, finances, planning et espace client AMO — tout illiCO Martigues dans un seul écran.
          </p>
          <div style={{display:'flex',gap:24,marginTop:30,fontSize:12,opacity:0.7,flexWrap:'wrap'}}>
            <span style={{display:'inline-flex',alignItems:'center',gap:6}}><I.Lock size={14}/> Chiffré SSL</span>
            <span style={{display:'inline-flex',alignItems:'center',gap:6}}><I.Shield size={14}/> RGPD compliant</span>
            <span style={{display:'inline-flex',alignItems:'center',gap:6}}><I.Sparkles size={14}/> IA intégrée</span>
          </div>
        </div>

        <div style={{position:'relative', fontSize:12, opacity:0.55}}>
          © illiCO travaux Martigues · v3.2 · {new Date().getFullYear()}
        </div>
      </div>

      {/* Right — form */}
      <div style={{padding:'60px 64px', display:'flex',flexDirection:'column',justifyContent:'center', maxWidth:520, width:'100%', margin:'0 auto'}}>
        {mode === 'signin' ? (
          <>
            <div className="eyebrow" style={{marginBottom:6}}>Connexion</div>
            <h2 style={{fontSize:28, fontWeight:800, color:'var(--ink-900)', letterSpacing:-0.02, margin:0}}>Bon retour parmi nous 👋</h2>
            <p style={{fontSize:13.5, color:'var(--ink-500)', marginTop:8, marginBottom:30}}>
              Connecte-toi avec ton email professionnel.
            </p>

            <Field label="Email">
              <input className="input" type="email" defaultValue="martigues@illico-travaux.com" style={{height:44}}/>
            </Field>
            <div style={{height:14}}/>
            <Field label="Mot de passe">
              <input className="input" type="password" defaultValue="••••••••••" style={{height:44}}/>
            </Field>

            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:14}}>
              <label style={{display:'flex',alignItems:'center',gap:8, fontSize:12.5, color:'var(--ink-700)', cursor:'pointer'}}>
                <input type="checkbox" defaultChecked style={{accentColor:'var(--brand-500)'}}/>
                Se souvenir de moi
              </label>
              <button onClick={()=>setMode('forgot')} style={{background:'none',border:0,fontSize:12.5,color:'var(--brand-500)',fontWeight:600,cursor:'pointer'}}>
                Mot de passe oublié ?
              </button>
            </div>

            <button className="btn btn-primary" style={{marginTop:24, height:44, width:'100%', justifyContent:'center', fontSize:14}}>
              Se connecter <I.Arrow size={14}/>
            </button>

            <div style={{display:'flex',alignItems:'center',gap:12,margin:'24px 0', color:'var(--ink-400)', fontSize:11.5}}>
              <div style={{flex:1, height:1, background:'var(--ink-200)'}}/>
              ou
              <div style={{flex:1, height:1, background:'var(--ink-200)'}}/>
            </div>

            <button className="btn btn-ghost" style={{width:'100%', justifyContent:'center', height:42, fontSize:13}}>
              <I.Globe size={16}/> Connexion avec Google
            </button>

            <p style={{fontSize:12, color:'var(--ink-500)', marginTop:30, textAlign:'center'}}>
              Première fois ? <a href="#" style={{color:'var(--brand-500)', fontWeight:600}}>Demande une invitation à ta franchisée</a>
            </p>
          </>
        ) : (
          <>
            <button onClick={()=>setMode('signin')} className="btn btn-ghost" style={{alignSelf:'flex-start', marginBottom:24, fontSize:12.5}}>
              <I.ChevronLeft size={14}/> Retour
            </button>
            <h2 style={{fontSize:24, fontWeight:800, color:'var(--ink-900)', letterSpacing:-0.02, margin:0}}>Mot de passe oublié ?</h2>
            <p style={{fontSize:13.5, color:'var(--ink-500)', marginTop:8, marginBottom:24}}>
              On t'envoie un lien sécurisé pour réinitialiser ton mot de passe.
            </p>
            <Field label="Email"><input className="input" type="email" placeholder="ton@email.com" style={{height:44}}/></Field>
            <button className="btn btn-primary" style={{marginTop:20, height:44, width:'100%', justifyContent:'center', fontSize:14}}>
              <I.Mail size={14}/> Envoyer le lien
            </button>
          </>
        )}
      </div>
    </div>
  );
}

window.Login = Login;
