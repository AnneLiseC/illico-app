// Stubs — Clients, Artisans, Planning, Messagerie, Statistiques, Paramètres
// Versions enrichies reflétant les vraies fonctionnalités de l'app.

// ═════════════════════════════════════════════════════════════════════
// CLIENTS — tabs scope (admin), badge pro/particulier, apporteur d'affaires
// ═════════════════════════════════════════════════════════════════════
function Clients({ onOpenClient }) {
  const { DOSSIERS, fmtEur, nomClient, villeFromAddr, AGENTES } = DATA;
  const [scope, setScope] = React.useState('moi');
  const [q, setQ] = React.useState('');
  const [showNew, setShowNew] = React.useState(false);

  // Regroupe les dossiers par client
  const map = new Map();
  DOSSIERS.forEach(d => {
    const key = `${d.client.prenom}-${d.client.nom}`;
    if (!map.has(key)) {
      map.set(key, {
        ...d.client,
        id: key,
        referente: d.referente,
        type_client: Math.random() > 0.85 ? 'professionnel' : 'particulier', // mock
        apporteur: key.includes('Boudet') || key.includes('Mercier'), // mock
        apporteur_pct: 5,
        dossiers: [d],
        total: d.montant_chantier_ttc || 0
      });
    } else {
      const v = map.get(key);
      v.dossiers.push(d);
      v.total += d.montant_chantier_ttc || 0;
    }
  });
  let clients = Array.from(map.values());

  // Scope
  if (scope === 'moi')   clients = clients.filter(c => c.referente.role === 'admin');
  else if (scope !== 'tous') clients = clients.filter(c => c.referente.id === scope);

  // Recherche
  if (q) {
    const needle = q.toLowerCase();
    clients = clients.filter(c => `${c.prenom} ${c.nom} ${c.adresse}`.toLowerCase().includes(needle));
  }

  const scopeTabs = [
    { key:'moi', label:'Mes clients' },
    ...AGENTES.filter(a => a.role === 'agente').map(a => ({ key:a.id, label:`Clients ${a.prenom}` })),
    { key:'tous', label:'Tous les clients' },
  ];

  return (
    <div className="page-enter" style={{display:'flex',flexDirection:'column',gap:18}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',gap:16,flexWrap:'wrap'}}>
        <div>
          <div className="eyebrow" style={{marginBottom:4}}>Contacts</div>
          <h1 className="page">Clients</h1>
          <div style={{color:'var(--ink-500)', fontSize:13, marginTop:6}}>{clients.length} clients · base actualisée</div>
        </div>
        <button className="btn btn-primary" onClick={()=>setShowNew(true)}><I.Plus size={16}/> Nouveau client</button>
      </div>

      <div className="tabs" style={{overflowX:'auto'}}>
        {scopeTabs.map(t => (
          <button key={t.key} className={`tab ${scope===t.key?'active':''}`} onClick={()=>setScope(t.key)}>{t.label}</button>
        ))}
      </div>

      <div className="card" style={{padding:'14px 16px', display:'flex', gap:10}}>
        <div style={{position:'relative', flex:1}}>
          <span style={{position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'var(--ink-400)'}}><I.Search size={16}/></span>
          <input className="input" placeholder="Rechercher un client (nom, ville, email)…" value={q} onChange={e=>setQ(e.target.value)} style={{paddingLeft:36, width:'100%', height:40}}/>
        </div>
        <button className="btn btn-ghost" style={{height:40}}><I.Filter size={14}/> Filtres</button>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))', gap:14}}>
        {clients.map(c => (
          <button key={c.id} onClick={()=> onOpenClient && onOpenClient(c.id)} className="card" style={{padding:18, position:'relative', border:0, textAlign:'left', cursor:'pointer'}}>
            <div style={{display:'flex',gap:12,alignItems:'flex-start'}}>
              <Avatar name={`${c.prenom} ${c.nom}`} color={c.type_client === 'professionnel' ? '#7c3aed' : '#0094d4'} size={42}/>
              <div style={{flex:1, minWidth:0}}>
                <div style={{display:'flex',gap:6,alignItems:'center'}}>
                  <span style={{fontSize:15, fontWeight:700, color:'var(--ink-900)'}} className="clip-1">{c.civilite} {c.prenom} {c.nom}</span>
                </div>
                <div style={{display:'flex',gap:6, marginTop:6, flexWrap:'wrap'}}>
                  <Badge tone={c.type_client === 'professionnel' ? 'info' : 'brand'} dot={false}>
                    {c.type_client === 'professionnel' ? 'Pro' : 'Particulier'}
                  </Badge>
                  {c.apporteur && <Badge tone="ok" dot={false}>★ Apporteur {c.apporteur_pct}%</Badge>}
                </div>
                <div style={{fontSize:12, color:'var(--ink-500)', marginTop:8, display:'flex', alignItems:'center', gap:4}}>
                  <I.Pin3 size={12}/> {villeFromAddr(c.adresse)}
                </div>
              </div>
              <button className="btn btn-ghost" style={{padding:'4px 8px'}}><I.More size={14}/></button>
            </div>
            <div style={{marginTop:14,display:'flex',gap:14,fontSize:11.5,color:'var(--ink-500)'}}>
              <span style={{display:'inline-flex',gap:4,alignItems:'center'}}><I.Phone size={11}/>{c.tel}</span>
              <span style={{display:'inline-flex',gap:4,alignItems:'center'}} className="clip-1"><I.Mail size={11}/>{c.email}</span>
            </div>
            <div style={{marginTop:14, paddingTop:14, borderTop:'1px solid var(--ink-100)', display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <div className="eyebrow">Dossiers</div>
                <div style={{fontSize:18, fontWeight:800, color:'var(--ink-900)'}} className="tnum">{c.dossiers.length}</div>
              </div>
              <div style={{textAlign:'right'}}>
                <div className="eyebrow">Montant total</div>
                <div style={{fontSize:14, fontWeight:700, color:'var(--brand-800)'}} className="tnum">{fmtEur(c.total)}</div>
              </div>
            </div>
          </button>
        ))}
      </div>
      {showNew && <NewClientModal onClose={()=>setShowNew(false)}/>}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// ARTISANS — alertes décennale, filtre métier, mode sélection
// ═════════════════════════════════════════════════════════════════════
function Artisans({ onOpenArtisan }) {
  const { ARTISANS, DOSSIERS, fmtEur, fmtDate, today } = DATA;
  const [q, setQ] = React.useState('');
  const [metier, setMetier] = React.useState('tous');
  const [select, setSelect] = React.useState(false);
  const [showNew, setShowNew] = React.useState(false);

  const enriched = ARTISANS.map(a => {
    const devis = DOSSIERS.flatMap(d => d.devis.filter(dv => dv.artisan.id === a.id));
    const dec = new Date(a.decennale_expiration);
    const decDiff = Math.round((dec - today) / 86400000);
    return { ...a, count: devis.length, ca: devis.reduce((s,dv) => s + dv.montant_ht, 0), decDiff };
  });

  const alertes = enriched.filter(a => a.decDiff <= 30 && a.decDiff >= 0);
  const expirees = enriched.filter(a => a.decDiff < 0);

  const metiers = ['tous', ...new Set(ARTISANS.map(a => a.metier))];

  let filtered = enriched.filter(a =>
    `${a.entreprise} ${a.ville} ${a.metier}`.toLowerCase().includes(q.toLowerCase())
  );
  if (metier !== 'tous') filtered = filtered.filter(a => a.metier === metier);

  return (
    <div className="page-enter" style={{display:'flex',flexDirection:'column',gap:18}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',gap:16,flexWrap:'wrap'}}>
        <div>
          <div className="eyebrow" style={{marginBottom:4}}>Contacts</div>
          <h1 className="page">Artisans</h1>
          <div style={{color:'var(--ink-500)', fontSize:13, marginTop:6}}>{filtered.length} artisans partenaires</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-ghost" onClick={()=>setSelect(!select)}>
            {select ? 'Annuler' : <><I.Trash size={14}/> Supprimer</>}
          </button>
          <button className="btn btn-primary" onClick={()=>setShowNew(true)}><I.Plus size={16}/> Nouvel artisan</button>
        </div>
      </div>

      {(alertes.length > 0 || expirees.length > 0) && (
        <div className="card" style={{padding:16, background:'rgba(220,38,38,0.04)', borderColor:'rgba(220,38,38,0.2)'}}>
          <div style={{display:'flex',alignItems:'center',gap:8, marginBottom:10}}>
            <div style={{width:30,height:30,borderRadius:8,background:'rgba(220,38,38,0.1)',color:'#b91c1c',display:'grid',placeItems:'center'}}>
              <I.Shield size={15}/>
            </div>
            <div>
              <div style={{fontSize:13, fontWeight:700, color:'#b91c1c'}}>Décennales à surveiller</div>
              <div style={{fontSize:11.5, color:'var(--ink-500)'}}>{alertes.length} expire(nt) dans moins de 30 j · {expirees.length} déjà expirée(s)</div>
            </div>
          </div>
          <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
            {[...expirees, ...alertes].slice(0,6).map(a => (
              <div key={a.id} style={{
                background:'#fff', border:'1px solid', borderColor: a.decDiff < 0 ? 'rgba(220,38,38,0.3)' : 'rgba(245,158,11,0.3)',
                borderRadius:8, padding:'6px 10px', fontSize:11.5, display:'flex', gap:6, alignItems:'center'
              }}>
                <strong style={{color:'var(--ink-900)'}}>{a.entreprise}</strong>
                <span style={{color: a.decDiff < 0 ? '#b91c1c' : '#a16207', fontWeight:600}}>
                  {a.decDiff < 0 ? `expirée ${Math.abs(a.decDiff)}j` : `J-${a.decDiff}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card" style={{padding:'14px 16px', display:'flex', gap:10, flexWrap:'wrap'}}>
        <div style={{position:'relative', flex:1, minWidth:240}}>
          <span style={{position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'var(--ink-400)'}}><I.Search size={16}/></span>
          <input className="input" placeholder="Rechercher entreprise, métier, ville…" value={q} onChange={e=>setQ(e.target.value)} style={{paddingLeft:36, width:'100%', height:40}}/>
        </div>
        <select className="input" value={metier} onChange={e=>setMetier(e.target.value)} style={{height:40, minWidth:170}}>
          {metiers.map(m => <option key={m} value={m}>{m === 'tous' ? 'Tous les métiers' : m}</option>)}
        </select>
      </div>

      <div className="card" style={{padding:0, overflow:'hidden'}}>
        <table style={{width:'100%', borderCollapse:'collapse', fontSize:13}}>
          <thead style={{background:'var(--surface-2)'}}>
            <tr>
              {select && <ArtTh style={{width:40}}></ArtTh>}
              <ArtTh>Entreprise</ArtTh>
              <ArtTh>Métier</ArtTh>
              <ArtTh>Ville</ArtTh>
              <ArtTh>Décennale</ArtTh>
              <ArtTh>Qualifications</ArtTh>
              <ArtTh right>Devis</ArtTh>
              <ArtTh right>CA cumulé HT</ArtTh>
              <ArtTh></ArtTh>
            </tr>
          </thead>
          <tbody>
            {filtered.map(a => (
              <tr key={a.id} style={{borderTop:'1px solid var(--ink-100)', cursor:'pointer'}} className="row-hover" onClick={()=> !select && onOpenArtisan && onOpenArtisan(a.id)}>
                {select && (
                  <td style={{padding:'14px 16px'}}>
                    <input type="checkbox" style={{accentColor:'var(--brand-500)'}}/>
                  </td>
                )}
                <td style={{padding:'14px 16px'}}>
                  <div style={{display:'flex',gap:12,alignItems:'center'}}>
                    <div style={{
                      width:34,height:34,borderRadius:8,
                      background:'var(--brand-50)',color:'var(--brand-800)',
                      display:'grid',placeItems:'center'
                    }}><I.Hammer size={16}/></div>
                    <div style={{fontWeight:700, color:'var(--ink-900)'}}>{a.entreprise}</div>
                  </div>
                </td>
                <td style={{padding:'14px 16px', color:'var(--ink-500)'}}>{a.metier}</td>
                <td style={{padding:'14px 16px', color:'var(--ink-500)'}}>{a.ville}</td>
                <td style={{padding:'14px 16px'}}>
                  {a.decDiff < 0 ? <Badge tone="bad">Expirée</Badge>
                    : a.decDiff <= 30 ? <Badge tone="warn">J-{a.decDiff}</Badge>
                    : <span style={{fontSize:11.5, color:'var(--ink-500)'}}>{fmtDate(a.decennale_expiration)}</span>}
                </td>
                <td style={{padding:'14px 16px'}}>
                  <div style={{display:'flex',gap:5, flexWrap:'wrap'}}>
                    {a.kbis && <Badge tone="brand" dot={false}><I.Briefcase size={9}/> Kbis</Badge>}
                    {a.qualification && <Badge tone="ok" dot={false}><I.Star size={9}/> {a.qualification}</Badge>}
                  </div>
                </td>
                <td style={{padding:'14px 16px', textAlign:'right', fontWeight:700, color:'var(--ink-900)'}} className="tnum">{a.count}</td>
                <td style={{padding:'14px 16px', textAlign:'right', fontWeight:700, color:'var(--brand-800)'}} className="tnum">{fmtEur(a.ca)}</td>
                <td style={{padding:'14px 16px'}}><button className="btn btn-ghost" style={{padding:'4px 8px'}}><I.Arrow size={12}/></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showNew && <NewArtisanModal onClose={()=>setShowNew(false)}/>}
    </div>
  );
}
function ArtTh({ children, right, style }) {
  return <th style={{textAlign: right ? 'right':'left', padding:'12px 16px', fontSize:11, fontWeight:700, color:'var(--ink-500)', letterSpacing:0.05, textTransform:'uppercase', ...style}}>{children}</th>;
}

Object.assign(window, { Clients, Artisans });
