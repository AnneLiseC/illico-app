// Sidebar — 72 collapsed → 240 on hover; pinned-open option

function Sidebar({ route, onNav, profile, pinned, onTogglePin, density }) {
  const [hover, setHover] = React.useState(false);
  const open = pinned || hover;

  const items = [
    { key:'dashboard', label:'Tableau de bord', icon:<I.Home/>, badge:null },
    { key:'chantiers', label:'Chantiers', icon:<I.Folder/>, badge: 9 },
    { key:'clients',   label:'Clients',   icon:<I.Users/>, badge:null },
    { key:'artisans',  label:'Artisans',  icon:<I.Hammer/>, badge:null },
    { key:'planning',  label:'Planning',  icon:<I.Calendar/>, badge:3 },
    { key:'finances',  label:'Finances',  icon:<I.Wallet/>, badge:null },
    { key:'messagerie',label:'Messagerie',icon:<I.Message/>, badge:5 },
    { key:'statistiques',label:'Statistiques',icon:<I.Chart/>, badge:null },
    { key:'notifications',label:'Notifications',icon:<I.Bell/>, badge:4 },
    { key:'parametres',label:'Paramètres',icon:<I.Settings/>, badge:null },
  ];

  return (
    <aside className={`sidebar ${open ? 'open' : ''} ${pinned ? 'pinned-open' : ''}`}
           onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}>
      <div className="sidebar-inner">
        {/* Logo */}
        <div className="logo-block">
          <div className="logo-mark">iC</div>
          <div className="logo-text">
            illiCO travaux
            <span className="muted">Martigues · Marine C.</span>
          </div>
        </div>

        {/* Pin */}
        <button className="pin" onClick={onTogglePin} title={pinned ? 'Désépingler' : 'Épingler ouvert'}>
          <I.Pin2 size={14}/>
        </button>

        {/* Nav */}
        <nav style={{padding:'10px 0', flex:1, overflow:'auto'}}>
          <div style={{padding:'6px 22px 6px', opacity: open?1:0, transition:'opacity 150ms'}}>
            <div className="eyebrow" style={{color:'rgba(255,255,255,0.5)'}}>Activité</div>
          </div>
          {items.slice(0,2).map(it => (
            <NavItem key={it.key} it={it} active={route===it.key} onClick={()=>onNav(it.key)} open={open}/>
          ))}

          <div style={{padding:'14px 22px 6px', opacity: open?1:0, transition:'opacity 150ms'}}>
            <div className="eyebrow" style={{color:'rgba(255,255,255,0.5)'}}>Contacts</div>
          </div>
          {items.slice(2,4).map(it => (
            <NavItem key={it.key} it={it} active={route===it.key} onClick={()=>onNav(it.key)} open={open}/>
          ))}

          <div style={{padding:'14px 22px 6px', opacity: open?1:0, transition:'opacity 150ms'}}>
            <div className="eyebrow" style={{color:'rgba(255,255,255,0.5)'}}>Pilotage</div>
          </div>
          {items.slice(4,8).map(it => (
            <NavItem key={it.key} it={it} active={route===it.key} onClick={()=>onNav(it.key)} open={open}/>
          ))}

          <div style={{padding:'14px 22px 6px', opacity: open?1:0, transition:'opacity 150ms'}}>
            <div className="eyebrow" style={{color:'rgba(255,255,255,0.5)'}}>Système</div>
          </div>
          {items.slice(8).map(it => (
            <NavItem key={it.key} it={it} active={route===it.key} onClick={()=>onNav(it.key)} open={open}/>
          ))}

          <div style={{padding:'18px 22px 6px', opacity: open?1:0, transition:'opacity 150ms'}}>
            <div className="eyebrow" style={{color:'rgba(255,255,255,0.5)'}}>Vue client</div>
          </div>
          <button className={`nav-item ${route==='espace_client'?'active':''}`} onClick={()=>onNav('espace_client')}>
            <span className="nav-icon"><I.Eye/></span>
            <span className="nav-label">Espace client (démo)</span>
          </button>
        </nav>

        {/* User */}
        <div className="user-block">
          <span className="avatar">MC</span>
          <div className="user-meta">
            <div className="name">{profile.prenom} {profile.nom}</div>
            <div className="role">Franchisée · {profile.agence}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function NavItem({ it, active, onClick, open }) {
  return (
    <button className={`nav-item ${active?'active':''}`} onClick={onClick}>
      <span className="nav-icon">{it.icon}</span>
      <span className="nav-label">{it.label}</span>
      {it.badge && (
        open
          ? <span className="nav-badge">{it.badge}</span>
          : <span className="nav-badge-dot"/>
      )}
    </button>
  );
}

window.Sidebar = Sidebar;
