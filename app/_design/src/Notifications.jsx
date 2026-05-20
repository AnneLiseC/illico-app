// Page Notifications — liste, filtres, marquage lu/non lu

function Notifications({ onOpenChantier }) {
  const { NOTIFICATIONS_FULL, NOTIF_LABELS, fmtDate } = DATA;
  const [filter, setFilter] = React.useState('all'); // all | unread | <type>

  const nbUnread = NOTIFICATIONS_FULL.filter(n => !n.lu).length;
  const types = [...new Set(NOTIFICATIONS_FULL.map(n => n.type))];

  const items = NOTIFICATIONS_FULL.filter(n => {
    if (filter === 'all') return true;
    if (filter === 'unread') return !n.lu;
    return n.type === filter;
  });

  const TYPE_LABEL = {
    deadline_devis: 'Échéance devis',
    cr_depose: 'Compte-rendu',
    acompte_debloque: 'Acompte débloqué',
    msg_client: 'Message client',
    devis_signe: 'Devis signé',
    facture_payee: 'Facture payée',
    decennale_expire: 'Décennale',
    redevance_due: 'Redevance',
  };

  const relative = (iso) => {
    const dt = new Date(iso);
    const diff = (DATA.today - dt) / 1000;
    if (diff < 0) return dt.toLocaleString('fr-FR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
    if (diff < 60) return 'à l\'instant';
    if (diff < 3600) return `il y a ${Math.round(diff/60)} min`;
    if (diff < 86400) return `il y a ${Math.round(diff/3600)} h`;
    if (diff < 86400*7) return `il y a ${Math.round(diff/86400)} j`;
    return fmtDate(dt.toISOString().slice(0,10));
  };

  return (
    <div className="page-enter" style={{display:'flex',flexDirection:'column',gap:18}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',gap:16,flexWrap:'wrap'}}>
        <div>
          <div className="eyebrow" style={{marginBottom:4}}>Activité</div>
          <h1 className="page">Notifications</h1>
          <div style={{color:'var(--ink-500)', fontSize:13, marginTop:6}}>
            {nbUnread > 0
              ? <><strong style={{color:'var(--bad)'}}>{nbUnread}</strong> nouvelles · {NOTIFICATIONS_FULL.length} au total</>
              : <>Toutes les notifications sont lues</>}
          </div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-ghost"><I.Check size={16}/> Tout marquer comme lu</button>
          <button className="btn btn-ghost" style={{padding:'7px 10px'}}><I.Settings size={14}/></button>
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 280px', gap:18, alignItems:'flex-start'}}>
        {/* Liste */}
        <div className="card" style={{padding:0, overflow:'hidden'}}>
          <div style={{padding:'12px 18px', borderBottom:'1px solid var(--ink-200)', display:'flex', gap:6, flexWrap:'wrap'}}>
            <Chip active={filter==='all'} onClick={()=>setFilter('all')}>Toutes</Chip>
            <Chip active={filter==='unread'} onClick={()=>setFilter('unread')} tone="warn">Non lues · {nbUnread}</Chip>
            <div style={{width:1, background:'var(--ink-200)', margin:'0 4px'}}/>
            {types.map(t => (
              <Chip key={t} active={filter===t} onClick={()=>setFilter(t)}>{TYPE_LABEL[t]}</Chip>
            ))}
          </div>
          <div>
            {items.length === 0 && <div style={{padding:50, textAlign:'center', color:'var(--ink-400)'}}>Aucune notification dans ce filtre</div>}
            {items.map(n => {
              const cfg = NOTIF_LABELS[n.type] || NOTIF_LABELS.cr_depose;
              const Ic = I[cfg.icon] || I.Doc;
              return (
                <button key={n.id} onClick={() => n.ref && onOpenChantier && onOpenChantier(DATA.DOSSIERS.find(x=>x.reference===n.ref)?.id)} style={{
                  display:'grid', gridTemplateColumns:'auto 1fr auto', gap:14, alignItems:'flex-start',
                  padding:'16px 20px', width:'100%', textAlign:'left',
                  borderBottom:'1px solid var(--ink-100)', background: n.lu ? '#fff' : 'rgba(0,148,212,0.04)',
                  border:0, cursor: n.ref ? 'pointer' : 'default', position:'relative'
                }} className={n.ref ? 'row-hover' : ''}>
                  {!n.lu && <span style={{position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', width:6, height:6, borderRadius:99, background:'var(--brand-500)'}}/>}
                  <div style={{
                    width:40, height:40, borderRadius:10, background: cfg.bg, color: cfg.color,
                    display:'grid', placeItems:'center', flex:'0 0 40px'
                  }}><Ic size={18}/></div>
                  <div style={{minWidth:0}}>
                    <div style={{display:'flex', alignItems:'center', gap:8}}>
                      <span style={{fontSize:13.5, fontWeight: n.lu ? 600 : 700, color:'var(--ink-900)'}}>{n.titre}</span>
                      {n.ref && <span className="mono" style={{fontSize:11, color:'var(--brand-800)', fontWeight:600}}>{n.ref}</span>}
                    </div>
                    <div style={{fontSize:13, color:'var(--ink-500)', marginTop:3}}>{n.message}</div>
                  </div>
                  <div style={{textAlign:'right', whiteSpace:'nowrap'}}>
                    <div style={{fontSize:11, color:'var(--ink-400)'}}>{relative(n.date)}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Réglages */}
        <div className="card" style={{padding:20}}>
          <div className="eyebrow" style={{marginBottom:12}}>Préférences de notification</div>
          <div style={{display:'flex',flexDirection:'column',gap:12, fontSize:13}}>
            {[
              { k:'deadline_devis',   l:'Échéances devis < 7 jours' },
              { k:'cr_depose',        l:'Comptes-rendus déposés' },
              { k:'acompte_debloque', l:'Acomptes débloqués' },
              { k:'msg_client',       l:'Messages clients' },
              { k:'decennale_expire', l:'Décennales expirantes' },
              { k:'redevance_due',    l:'Redevances dues' },
            ].map((p, i) => (
              <label key={p.k} style={{display:'flex',alignItems:'center',gap:10, cursor:'pointer'}}>
                <Toggle defaultOn={i !== 5}/>
                <span style={{color:'var(--ink-700)'}}>{p.l}</span>
              </label>
            ))}
          </div>
          <div style={{height:1, background:'var(--ink-100)', margin:'16px 0'}}/>
          <div className="eyebrow" style={{marginBottom:10}}>Canaux</div>
          <div style={{display:'flex',flexDirection:'column',gap:8, fontSize:12.5, color:'var(--ink-700)'}}>
            <label style={{display:'flex',alignItems:'center',gap:8}}><Toggle defaultOn/> In-app</label>
            <label style={{display:'flex',alignItems:'center',gap:8}}><Toggle defaultOn/> Email</label>
            <label style={{display:'flex',alignItems:'center',gap:8}}><Toggle/> SMS</label>
          </div>
        </div>
      </div>
    </div>
  );
}

function Chip({ active, onClick, tone, children }) {
  const bg = active
    ? (tone === 'warn' ? 'rgba(245,158,11,0.13)' : 'var(--brand-50)')
    : 'transparent';
  const color = active
    ? (tone === 'warn' ? '#a16207' : 'var(--brand-800)')
    : 'var(--ink-500)';
  return (
    <button onClick={onClick} style={{
      padding:'5px 12px', borderRadius:99, fontSize:12, fontWeight:600,
      border:'1px solid', borderColor: active ? (tone==='warn' ? 'rgba(245,158,11,0.4)' : 'var(--brand-200)') : 'var(--ink-200)',
      background: bg, color: color, cursor:'pointer'
    }}>{children}</button>
  );
}

function Toggle({ defaultOn=false }) {
  const [on, setOn] = React.useState(defaultOn);
  return (
    <span onClick={()=>setOn(!on)} style={{
      width:32, height:18, borderRadius:99, background: on ? 'var(--brand-500)' : 'var(--ink-200)',
      position:'relative', cursor:'pointer', transition:'background 150ms'
    }}>
      <span style={{
        position:'absolute', top:2, left: on ? 16 : 2, width:14, height:14, borderRadius:99,
        background:'#fff', transition:'left 150ms', boxShadow:'0 1px 3px rgba(0,0,0,0.15)'
      }}/>
    </span>
  );
}

window.Notifications = Notifications;
