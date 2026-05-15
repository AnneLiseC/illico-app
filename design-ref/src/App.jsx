// Main app shell + router

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "sidebarPinned": false,
  "accent": "#0094d4",
  "density": "comfortable",
  "sidebarStyle": "gradient",
  "showDecorations": true
}/*EDITMODE-END*/;

function App() {
  const [route, setRoute] = React.useState('dashboard');
  const [openChantierId, setOpenChantierId] = React.useState(null);
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const pinned = !!tweaks.sidebarPinned;

  // Apply tweaks to body data attrs + CSS vars
  React.useEffect(() => {
    document.body.dataset.density = tweaks.density;
    document.documentElement.style.setProperty('--brand-500', tweaks.accent);
    const sb = document.querySelector('.sidebar-inner');
    if (sb) {
      if (tweaks.sidebarStyle === 'gradient') {
        sb.style.background = 'linear-gradient(180deg,var(--brand-800) 0%,var(--brand-900) 100%)';
        sb.style.color = '#fff';
      } else if (tweaks.sidebarStyle === 'flat') {
        sb.style.background = 'var(--brand-800)';
        sb.style.color = '#fff';
      } else if (tweaks.sidebarStyle === 'ink') {
        sb.style.background = '#0f2744';
        sb.style.color = '#fff';
      }
    }
    document.body.dataset.showDeco = tweaks.showDecorations ? '1' : '0';
  }, [tweaks.density, tweaks.accent, tweaks.sidebarStyle, tweaks.showDecorations]);

  const profile = { prenom:'Marine', nom:'Castellet', agence:'Martigues', role:'admin', initials:'MC' };

  const breadcrumbs = {
    dashboard:'Tableau de bord',
    chantiers:'Chantiers',
    clients:'Clients',
    artisans:'Artisans',
    planning:'Planning',
    finances:'Finances',
    messagerie:'Messagerie',
    statistiques:'Statistiques',
    parametres:'Paramètres',
  };

  const handleOpenChantier = (id) => {
    setOpenChantierId(id);
    setRoute('chantiers');
  };

  return (
    <div className="app">
      <Sidebar
        route={route}
        onNav={setRoute}
        profile={profile}
        pinned={pinned}
        onTogglePin={() => setTweak('sidebarPinned', !pinned)}
        density={tweaks.density}
      />

      <div className="main">
        <header className="header">
          <div style={{display:'flex',alignItems:'center',gap:10,fontSize:13.5, color:'var(--ink-500)', flex:'0 0 auto'}}>
            <span style={{color:'var(--ink-400)'}}>illiCO Martigues</span>
            <I.ChevronRight size={14}/>
            <strong style={{color:'var(--ink-900)', fontWeight:700}}>{breadcrumbs[route]}</strong>
          </div>

          <div style={{flex:1, maxWidth:480, marginLeft:24, position:'relative'}}>
            <span style={{position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', color:'var(--ink-400)'}}><I.Search size={16}/></span>
            <input className="input" placeholder="Recherche globale — chantier, client, artisan…" style={{paddingLeft:38, paddingRight:60, width:'100%', height:38, background:'var(--surface-2)'}}/>
            <span style={{position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', display:'flex', gap:2}}>
              <span className="kbd">⌘</span><span className="kbd">K</span>
            </span>
          </div>

          <div style={{marginLeft:'auto', display:'flex', alignItems:'center', gap:10}}>
            <button className="btn btn-ghost" style={{padding:'7px 10px', position:'relative'}}>
              <I.Bell size={16}/>
              <span style={{position:'absolute', top:4, right:6, width:8, height:8, background:'#dc2626', borderRadius:99, border:'2px solid #fff'}}/>
            </button>
            <button className="btn btn-ghost" style={{padding:'7px 10px'}}>
              <I.Mail size={16}/>
            </button>
            <div style={{height:24, width:1, background:'var(--ink-200)', margin:'0 4px'}}/>
            <button style={{display:'flex',alignItems:'center',gap:8, padding:'4px 8px', borderRadius:8}} className="row-hover">
              <Avatar name="Marine Castellet" color="#00578e" size={30}/>
              <div style={{textAlign:'left'}}>
                <div style={{fontSize:12.5, fontWeight:700, color:'var(--ink-900)', lineHeight:1.1}}>Marine C.</div>
                <div style={{fontSize:10.5, color:'var(--ink-500)', marginTop:1}}>Franchisée</div>
              </div>
              <I.ChevronDown size={12}/>
            </button>
          </div>
        </header>

        <main style={{flex:1, padding:'28px 32px 60px', overflow:'auto', minHeight:0, display:'flex', flexDirection:'column'}}>
          {route === 'dashboard'    && <Dashboard onNav={setRoute} onOpenChantier={handleOpenChantier}/>}
          {route === 'chantiers'    && <Chantiers initialId={openChantierId} onClearInitial={()=>setOpenChantierId(null)}/>}
          {route === 'clients'      && <Clients/>}
          {route === 'artisans'     && <Artisans/>}
          {route === 'planning'     && <Planning/>}
          {route === 'finances'     && <Finances/>}
          {route === 'messagerie'   && <Messagerie/>}
          {route === 'statistiques' && <Statistiques/>}
          {route === 'parametres'   && <Parametres/>}
        </main>
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Sidebar">
          <TweakToggle label="Épinglée ouverte" value={pinned}
            onChange={v => setTweak('sidebarPinned', v)}/>
          <TweakRadio label="Style"
            value={tweaks.sidebarStyle}
            onChange={v => setTweak('sidebarStyle', v)}
            options={[
              { value:'gradient', label:'Dégradé' },
              { value:'flat', label:'Aplat' },
              { value:'ink', label:'Ardoise' },
            ]}/>
        </TweakSection>

        <TweakSection label="Couleur primaire">
          <TweakColor label="Accent"
            value={tweaks.accent}
            onChange={v => setTweak('accent', v)}
            options={['#0094d4','#00578e','#0891b2','#7c3aed','#e11d48','#f59e0b']}/>
        </TweakSection>

        <TweakSection label="Densité">
          <TweakRadio label="Espacement"
            value={tweaks.density}
            onChange={v => setTweak('density', v)}
            options={[
              { value:'compact', label:'Compact' },
              { value:'comfortable', label:'Standard' },
              { value:'cozy', label:'Aéré' },
            ]}/>
        </TweakSection>

        <TweakSection label="Décor">
          <TweakToggle label="Arcs décoratifs sur les KPI"
            value={!!tweaks.showDecorations}
            onChange={v => setTweak('showDecorations', v)}/>
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App/>);
