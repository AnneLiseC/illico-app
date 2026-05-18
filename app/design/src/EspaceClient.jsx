// Espace client — vue publique réservée aux clients AMO

function EspaceClient() {
  const { fmtEur, fmtDate } = DATA;
  // On simule l'espace de Mme Vasseur (dossier d1)
  const d = DATA.DOSSIERS.find(x => x.id === 'd1');
  const [tab, setTab] = React.useState('accueil');

  const etapes = [
    { key:'a_contacter',       label:'À contacter',   done:true },
    { key:'a_relancer',        label:'À relancer',    done:true },
    { key:'devis_en_attente',  label:'Devis',         done:true },
    { key:'en_cours_chantier', label:'Travaux',       done:true, current:true },
    { key:'termine',           label:'Terminé',       done:false },
  ];

  const tabs = [
    { k:'accueil', l:'Accueil',   icon:'Home' },
    { k:'cr',      l:'Comptes-rendus', icon:'Doc' },
    { k:'photos',  l:'Photos',    icon:'Camera' },
    { k:'msg',     l:'Messages',  icon:'Message' },
  ];

  const cr = (DATA.COMPTES_RENDUS[d.id] || []).filter(c => c.valide || c.type === 'suivi');

  return (
    <div className="page-enter" style={{display:'flex',flexDirection:'column',gap:20}}>
      {/* Hero client */}
      <div style={{
        background:'linear-gradient(135deg, var(--brand-800), var(--brand-500))',
        borderRadius:'var(--radius)', padding:'28px 32px', color:'#fff', position:'relative', overflow:'hidden'
      }}>
        <div style={{
          position:'absolute', top:-50, right:-30, width:200, height:200,
          borderRadius:'50%', background:'rgba(255,255,255,0.08)'
        }}/>
        <div style={{
          position:'absolute', bottom:-80, right:80, width:140, height:140,
          borderRadius:'50%', background:'rgba(255,255,255,0.05)'
        }}/>
        <div style={{position:'relative', zIndex:1}}>
          <div style={{fontSize:11, letterSpacing:0.08, textTransform:'uppercase', fontWeight:600, opacity:0.85}}>
            Espace client AMO · illiCO travaux Martigues
          </div>
          <h1 style={{fontSize:32, fontWeight:800, color:'#fff', letterSpacing:-0.02, margin:'10px 0 0', lineHeight:1.15}}>
            Bonjour {d.client.prenom} 👋
          </h1>
          <div style={{fontSize:14, opacity:0.9, marginTop:6}}>
            Suivi de votre chantier · <span className="mono" style={{fontWeight:600}}>{d.reference}</span>
          </div>
        </div>
      </div>

      {/* Étapes du projet */}
      <div className="card" style={{padding:24}}>
        <div className="eyebrow" style={{marginBottom:16}}>Étapes de votre projet</div>
        <div style={{display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:8, position:'relative'}}>
          {/* Connecting line */}
          <div style={{
            position:'absolute', top:18, left:'10%', right:'10%', height:2,
            background:'linear-gradient(to right, var(--brand-500) 75%, var(--ink-200) 75%)'
          }}/>
          {etapes.map((e, i) => (
            <div key={e.key} style={{textAlign:'center', position:'relative', zIndex:1}}>
              <div style={{
                width:38, height:38, borderRadius:99, margin:'0 auto',
                background: e.done ? 'var(--brand-500)' : '#fff',
                border:'3px solid', borderColor: e.done ? 'var(--brand-500)' : 'var(--ink-200)',
                color: e.done ? '#fff' : 'var(--ink-400)',
                display:'grid', placeItems:'center',
                boxShadow: e.current ? '0 0 0 6px rgba(0,148,212,0.18)' : 'none'
              }}>{e.done ? <I.Check size={16}/> : i+1}</div>
              <div style={{fontSize:11.5, fontWeight: e.current ? 700 : 600, color: e.done ? 'var(--ink-900)' : 'var(--ink-400)', marginTop:8}}>{e.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {tabs.map(t => {
          const TabIcon = I[t.icon];
          return (
            <button key={t.k} className={`tab ${tab===t.k?'active':''}`} onClick={()=>setTab(t.k)}>
              <span style={{display:'inline-flex',gap:6,alignItems:'center'}}><TabIcon size={14}/>{t.l}</span>
            </button>
          );
        })}
      </div>

      {tab === 'accueil' && (
        <div style={{display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:18}}>
          <div style={{display:'flex',flexDirection:'column',gap:18}}>
            <div className="card" style={{padding:24}}>
              <h2 className="page" style={{fontSize:18, marginBottom:6}}>Votre projet</h2>
              <p style={{fontSize:13.5, color:'var(--ink-700)', lineHeight:1.6, marginTop:6, marginBottom:0}}>{d.description}</p>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14, marginTop:18}}>
                <CFact label="Surface" value={`${d.surface} m²`}/>
                <CFact label="Démarrage" value={fmtDate(d.date_demarrage_chantier)}/>
                <CFact label="Fin prévue" value={fmtDate(d.date_fin_chantier)} highlight/>
              </div>
            </div>

            <div className="card" style={{padding:24}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
                <h2 className="page" style={{fontSize:16}}>Avancement</h2>
                <span className="tnum" style={{fontSize:20, fontWeight:800, color:'var(--brand-800)'}}>{d.avancement}%</span>
              </div>
              <Progress value={d.avancement} height={10}/>
              <div style={{fontSize:12, color:'var(--ink-500)', marginTop:10}}>
                Votre chantier avance bien. Nous tenons à jour cette page régulièrement.
              </div>
            </div>

            <div className="card" style={{padding:24}}>
              <h2 className="page" style={{fontSize:16, marginBottom:14}}>Derniers comptes-rendus</h2>
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                {cr.slice(0,2).map(c => (
                  <div key={c.id} style={{padding:14, border:'1px solid var(--ink-200)', borderRadius:10, background:'var(--surface-2)'}}>
                    <div style={{display:'flex',justifyContent:'space-between',gap:8, marginBottom:6}}>
                      <strong style={{fontSize:13.5, color:'var(--ink-900)'}}>{c.titre}</strong>
                      <span className="tnum" style={{fontSize:11.5, color:'var(--ink-500)'}}>{fmtDate(c.date)}</span>
                    </div>
                    <p style={{fontSize:12.5, color:'var(--ink-700)', lineHeight:1.5, margin:0}} className="clip-2">{c.contenu}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{display:'flex',flexDirection:'column',gap:18}}>
            <div className="card" style={{padding:22}}>
              <h2 className="page" style={{fontSize:15, marginBottom:12}}>Votre référente</h2>
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                <Avatar name={`${d.referente.prenom} ${d.referente.nom}`} color={d.referente.color} size={52}/>
                <div>
                  <div style={{fontSize:14, fontWeight:700, color:'var(--ink-900)'}}>{d.referente.prenom} {d.referente.nom}</div>
                  <div style={{fontSize:12, color:'var(--ink-500)'}}>{d.referente.role === 'admin' ? 'Franchisée' : 'Agente AMO'}</div>
                </div>
              </div>
              <div style={{marginTop:14, display:'flex',flexDirection:'column',gap:8}}>
                <button className="btn btn-primary" style={{justifyContent:'center'}}><I.Message size={14}/> Envoyer un message</button>
                <button className="btn btn-ghost" style={{justifyContent:'center'}}><I.Phone size={14}/> 04 42 06 14 78</button>
              </div>
            </div>

            <div className="card" style={{padding:22}}>
              <h2 className="page" style={{fontSize:15, marginBottom:12}}>Prochaine visite</h2>
              {(DATA.RDV_DOSSIER[d.id] || []).filter(r => new Date(r.date_heure) >= DATA.today).slice(0,1).map(r => {
                const dt = new Date(r.date_heure);
                return (
                  <div key={r.id} style={{display:'grid',gridTemplateColumns:'60px 1fr', gap:14, alignItems:'center'}}>
                    <div style={{textAlign:'center', padding:'10px 0', background:'var(--brand-50)', borderRadius:10, border:'1px solid var(--ink-200)'}}>
                      <div className="tnum" style={{fontSize:22, fontWeight:800, color:'var(--brand-800)', lineHeight:1}}>{dt.toLocaleDateString('fr-FR', {day:'2-digit'})}</div>
                      <div style={{fontSize:10, fontWeight:700, color:'var(--ink-500)', textTransform:'uppercase', marginTop:3}}>{dt.toLocaleDateString('fr-FR', {month:'short'}).replace('.','')}</div>
                    </div>
                    <div>
                      <div style={{fontSize:13, fontWeight:700, color:'var(--ink-900)'}}>Visite de suivi chantier</div>
                      <div style={{fontSize:12, color:'var(--ink-500)', marginTop:4}}>{dt.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})} · {r.duree} min</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {tab === 'cr' && (
        <div className="card" style={{padding:24}}>
          <div className="eyebrow" style={{marginBottom:14}}>Tous les comptes-rendus visibles ({cr.length})</div>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            {cr.map(c => (
              <div key={c.id} style={{padding:18, border:'1px solid var(--ink-200)', borderRadius:12}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
                  <strong style={{fontSize:14, color:'var(--ink-900)'}}>{c.titre}</strong>
                  <span className="tnum" style={{fontSize:12, color:'var(--ink-500)'}}>{fmtDate(c.date)}</span>
                </div>
                <p style={{fontSize:13, color:'var(--ink-700)', lineHeight:1.55, margin:0}}>{c.contenu}</p>
                <div style={{marginTop:10, fontSize:11.5, color:'var(--ink-500)'}}>Par <strong>{c.auteur}</strong></div>
              </div>
            ))}
            {cr.length === 0 && <div style={{padding:30, textAlign:'center', color:'var(--ink-400)'}}>Aucun compte-rendu publié</div>}
          </div>
        </div>
      )}

      {tab === 'photos' && (
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:14}}>
          {(DATA.PHOTOS[d.id] || []).map(p => <PhotoTile key={p.id} photo={p} large/>)}
        </div>
      )}

      {tab === 'msg' && (
        <div className="card" style={{padding:0, overflow:'hidden', minHeight:520, display:'flex', flexDirection:'column'}}>
          <div style={{padding:'14px 22px', borderBottom:'1px solid var(--ink-200)'}}>
            <div style={{fontSize:14, fontWeight:700, color:'var(--ink-900)'}}>Conversation avec {d.referente.prenom}</div>
            <div style={{fontSize:11.5, color:'var(--ink-500)', marginTop:3}}>Vous communiquez directement avec votre référente AMO</div>
          </div>
          <div style={{flex:1, padding:24, background:'var(--surface-2)'}}>
            <div style={{textAlign:'center', fontSize:12, color:'var(--ink-400)'}}>aujourd'hui</div>
            <div style={{display:'flex',gap:10,marginTop:12}}>
              <Avatar name={`${d.referente.prenom} ${d.referente.nom}`} color={d.referente.color} size={28}/>
              <div style={{background:'#fff', padding:'10px 14px', borderRadius:'12px 12px 12px 4px', maxWidth:420, fontSize:13.5, lineHeight:1.5, boxShadow:'0 1px 2px rgba(0,0,0,0.04)'}}>
                Bonjour {d.client.prenom}, l'électricien passera mercredi matin 8h30. À bientôt !
              </div>
            </div>
          </div>
          <div style={{padding:14, borderTop:'1px solid var(--ink-200)', display:'flex',gap:10}}>
            <input className="input" placeholder="Votre message…" style={{flex:1, height:42}}/>
            <button className="btn btn-primary" style={{height:42}}><I.PaperPlane size={14}/> Envoyer</button>
          </div>
        </div>
      )}
    </div>
  );
}

function CFact({ label, value, highlight }) {
  return (
    <div>
      <div className="eyebrow" style={{marginBottom:4}}>{label}</div>
      <div style={{fontSize: highlight ? 18 : 14, fontWeight: highlight ? 800 : 600, color: highlight ? 'var(--brand-800)' : 'var(--ink-900)'}}>{value}</div>
    </div>
  );
}

window.EspaceClient = EspaceClient;
