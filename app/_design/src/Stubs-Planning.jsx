// Planning — RDV (R1/R2/R3), interventions artisans, dates clés chantier, sidebar agenda

function Planning() {
  const { DOSSIERS, ARTISANS, AGENTES, today, fmtDate } = DATA;
  const [vue, setVue] = React.useState('week');
  const [typeFilter, setTypeFilter] = React.useState('');
  const [artisanFilter, setArtisanFilter] = React.useState('');
  const [agenteFilter, setAgenteFilter] = React.useState('');
  const [googleSync, setGoogleSync] = React.useState(true);

  // Collect tous événements
  const events = [];

  Object.entries(DATA.RDV_DOSSIER).forEach(([dossierId, rdvs]) => {
    const d = DOSSIERS.find(x => x.id === dossierId);
    rdvs.forEach(r => events.push({
      kind:'rdv',
      ...r,
      dossier: d,
    }));
  });

  Object.entries(DATA.INTERVENTIONS).forEach(([dossierId, ints]) => {
    const d = DOSSIERS.find(x => x.id === dossierId);
    ints.forEach(it => events.push({
      kind:'intervention',
      ...it,
      dossier: d,
    }));
  });

  // Dates clés
  DOSSIERS.forEach(d => {
    if (d.date_demarrage_chantier) events.push({ kind:'date_cle', subkind:'demarrage', date: d.date_demarrage_chantier, dossier: d });
    if (d.date_fin_chantier) events.push({ kind:'date_cle', subkind:'fin', date: d.date_fin_chantier, dossier: d });
  });

  // Filter logic
  const filtered = events.filter(e => {
    if (e.kind === 'rdv' && typeFilter) return e.type === typeFilter;
    if (artisanFilter && (e.artisan?.id !== artisanFilter)) return false;
    if (agenteFilter && (e.dossier?.referente?.id !== agenteFilter)) return false;
    return true;
  });

  // Agenda futur (prochains 30j)
  const upcoming = filtered
    .filter(e => {
      const dt = new Date(e.date_heure || e.debut || e.date);
      const diff = (dt - today) / 86400000;
      return diff >= -1 && diff <= 30;
    })
    .sort((a, b) => new Date(a.date_heure || a.debut || a.date) - new Date(b.date_heure || b.debut || b.date))
    .slice(0, 8);

  // Stats événements
  const counts = {
    rdv: filtered.filter(e => e.kind === 'rdv').length,
    intervention: filtered.filter(e => e.kind === 'intervention').length,
    date_cle: filtered.filter(e => e.kind === 'date_cle').length,
  };

  // Mock semaine 11-17 mai 2026
  const days = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
  const dates = [11,12,13,14,15,16,17];

  const TYPE_LABEL = {
    r1:    { label:'R1 — Visite client',   short:'R1',    color:'#0094d4' },
    r2:    { label:'R2 — Visite artisan',  short:'R2',    color:'#16a34a' },
    r3:    { label:'R3 — Devis',           short:'R3',    color:'#f59e0b' },
    suivi: { label:'Suivi chantier',       short:'Suivi', color:'#94a3b8' },
    autre: { label:'Autre',                short:'Autre', color:'#7c3aed' },
  };

  // Curated week events for the calendar grid
  const weekEvents = [
    { day:0, time:'09:00', dur:1.5, type:'r1',    label:'Mme Coste',      ref:'M-2026-0123' },
    { day:0, time:'14:30', dur:1,   type:'suivi', label:'Boudet · récap', ref:'M-2026-0167' },
    { day:1, time:'10:00', dur:2,   type:'r2',    label:'Mercier × maçon',ref:'M-2026-0192' },
    { day:2, time:'15:00', dur:1,   type:'autre', label:'Réunion artisans', ref:null },
    { day:3, time:'09:30', dur:1,   type:'r2',    label:'Dorian × élec',  ref:'M-2026-0203' },
    { day:3, time:'11:00', dur:0.5, type:'suivi', label:'Call Lemaire',   ref:'M-2026-0218' },
    { day:4, time:'09:30', dur:1,   type:'r2',    label:'Dorian × charpentier', ref:'M-2026-0203' },
    { day:4, time:'11:00', dur:0.5, type:'suivi', label:'Relance Lemaire',ref:'M-2026-0218' },
    { day:4, time:'14:00', dur:1.5, type:'r3',    label:'Réception Boudet', ref:'M-2026-0167' },
    { day:4, time:'16:30', dur:0.75,type:'r3',    label:'Devis Mercier',   ref:'M-2026-0192' },
  ];

  return (
    <div className="page-enter" style={{display:'flex',flexDirection:'column',gap:18}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',gap:16,flexWrap:'wrap'}}>
        <div>
          <div className="eyebrow" style={{marginBottom:4}}>Pilotage</div>
          <h1 className="page">Planning</h1>
          <div style={{color:'var(--ink-500)', fontSize:13, marginTop:6}}>
            Semaine du 11 au 17 mai 2026 ·{' '}
            <strong style={{color:'var(--ink-700)'}}>{counts.rdv}</strong> RDV ·{' '}
            <strong style={{color:'var(--ink-700)'}}>{counts.intervention}</strong> interventions ·{' '}
            <strong style={{color:'var(--ink-700)'}}>{counts.date_cle}</strong> dates clés
          </div>
        </div>
        <div style={{display:'flex',gap:8, flexWrap:'wrap'}}>
          <button className="btn btn-ghost" onClick={()=>setGoogleSync(!googleSync)}>
            <I.Globe size={14}/>
            <span>Google {googleSync ? <span style={{color:'#15803d'}}>● Connecté</span> : 'Connecter'}</span>
          </button>
          <button className="btn btn-ghost"><I.ChevronLeft size={14}/></button>
          <button className="btn btn-ghost">Aujourd'hui</button>
          <button className="btn btn-ghost"><I.ChevronRight size={14}/></button>
          <button className="btn btn-primary"><I.Plus size={16}/> Nouveau RDV</button>
        </div>
      </div>

      <div className="card" style={{padding:'12px 16px', display:'flex', gap:10, alignItems:'center', flexWrap:'wrap'}}>
        {/* Vue */}
        <div style={{display:'flex',gap:4, background:'var(--ink-100)', padding:3, borderRadius:9}}>
          {[
            { k:'day',   l:'Jour' },
            { k:'week',  l:'Semaine' },
            { k:'month', l:'Mois' },
            { k:'list',  l:'Liste' },
          ].map(v => (
            <button key={v.k} onClick={()=>setVue(v.k)} style={{
              padding:'6px 14px', fontSize:12.5, fontWeight:600, borderRadius:7,
              background: vue===v.k ? '#fff' : 'transparent',
              color: vue===v.k ? 'var(--brand-800)' : 'var(--ink-500)',
              boxShadow: vue===v.k ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              cursor:'pointer', border:0,
            }}>{v.l}</button>
          ))}
        </div>
        {/* Type RDV */}
        <select className="input" value={typeFilter} onChange={e=>setTypeFilter(e.target.value)} style={{height:34, minWidth:140}}>
          <option value="">Tous les types</option>
          <option value="r1">R1 — Visite client</option>
          <option value="r2">R2 — Visite artisan</option>
          <option value="r3">R3 — Devis</option>
          <option value="suivi">Suivi</option>
        </select>
        <select className="input" value={artisanFilter} onChange={e=>setArtisanFilter(e.target.value)} style={{height:34, minWidth:140}}>
          <option value="">Tous artisans</option>
          {ARTISANS.map(a => <option key={a.id} value={a.id}>{a.entreprise}</option>)}
        </select>
        <select className="input" value={agenteFilter} onChange={e=>setAgenteFilter(e.target.value)} style={{height:34, minWidth:140}}>
          <option value="">Toutes les agentes</option>
          {AGENTES.map(a => <option key={a.id} value={a.id}>{a.prenom} {a.nom}</option>)}
        </select>
        {/* Legend */}
        <div style={{marginLeft:'auto', display:'flex',gap:14,fontSize:11.5,color:'var(--ink-500)',flexWrap:'wrap'}}>
          {Object.entries(TYPE_LABEL).slice(0,4).map(([k,v]) => (
            <span key={k} style={{display:'inline-flex',gap:5,alignItems:'center'}}>
              <span style={{width:10,height:10,background:v.color,borderRadius:3}}/>{v.short}
            </span>
          ))}
          <span style={{display:'inline-flex',gap:5,alignItems:'center'}}>
            <span style={{width:10,height:10,background:'rgba(124,58,237,0.15)',border:'1px solid #7c3aed',borderRadius:3}}/>Intervention
          </span>
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 320px', gap:18, minHeight:0}}>
        {/* Calendrier semaine */}
        <div className="card" style={{padding:0, overflow:'hidden'}}>
          <div style={{display:'grid', gridTemplateColumns:'80px repeat(7, 1fr)', borderBottom:'1px solid var(--ink-200)', background:'var(--surface-2)'}}>
            <div/>
            {days.map((day, i) => (
              <div key={day} style={{padding:'14px 10px', textAlign:'center', borderLeft:'1px solid var(--ink-100)'}}>
                <div className="eyebrow">{day}</div>
                <div style={{fontSize:20, fontWeight:800, marginTop:4, color: i===4 ? 'var(--brand-800)' : 'var(--ink-900)'}} className="tnum">{dates[i]}</div>
              </div>
            ))}
          </div>
          <div style={{display:'grid', gridTemplateColumns:'80px repeat(7, 1fr)', minHeight:560, position:'relative'}}>
            <div style={{display:'flex',flexDirection:'column', borderRight:'1px solid var(--ink-100)'}}>
              {[8,9,10,11,12,13,14,15,16,17].map(h => (
                <div key={h} style={{height:56, padding:'6px 10px', fontSize:11, color:'var(--ink-400)', fontWeight:600, borderTop:'1px solid var(--ink-100)'}}>{h}h00</div>
              ))}
            </div>
            {days.map((_, di) => (
              <div key={di} style={{position:'relative', borderLeft:'1px solid var(--ink-100)', background: di===4 ? 'rgba(0,148,212,0.03)' : 'transparent'}}>
                {[0,1,2,3,4,5,6,7,8,9].map(i => (
                  <div key={i} style={{height:56, borderTop:'1px solid var(--ink-100)'}}/>
                ))}
                {/* Intervention artisan en bandeau de fond */}
                {di === 4 && (
                  <div style={{
                    position:'absolute', left:2, right:2, top:336, height:18,
                    background:'rgba(124,58,237,0.12)', borderLeft:'3px solid #7c3aed',
                    borderRadius:3, padding:'2px 6px', fontSize:9.5, fontWeight:600, color:'#5b21b6',
                    overflow:'hidden'
                  }}>● Électricité Marseille Sud</div>
                )}
                {weekEvents.filter(e => e.day === di).map((e, i) => {
                  const [h, m] = e.time.split(':').map(Number);
                  const top = (h - 8) * 56 + (m/60)*56;
                  const height = e.dur * 56 - 4;
                  const cfg = TYPE_LABEL[e.type] || TYPE_LABEL.autre;
                  return (
                    <div key={i} style={{
                      position:'absolute', left:4, right:4, top, height,
                      background: cfg.color, color:'#fff', borderRadius:6, padding:'5px 7px',
                      fontSize:10.5, fontWeight:600, boxShadow:'0 1px 3px rgba(0,0,0,0.12)',
                      overflow:'hidden', display:'flex', flexDirection:'column', gap:2,
                      cursor:'pointer'
                    }}>
                      <div style={{display:'flex',justifyContent:'space-between',gap:4, opacity:0.9, fontSize:9.5, fontWeight:700}}>
                        <span>{cfg.short}</span>
                        <span>{e.time}</span>
                      </div>
                      <div className="clip-1">{e.label}</div>
                      {e.ref && height > 40 && (
                        <div className="mono" style={{opacity:0.75, fontSize:9}}>{e.ref}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Agenda sidebar */}
        <div style={{display:'flex',flexDirection:'column',gap:14, minWidth:0}}>
          <div className="card" style={{padding:18}}>
            <div className="eyebrow" style={{marginBottom:12}}>Prochains événements · 30 jours</div>
            <div style={{display:'flex',flexDirection:'column',gap:10, maxHeight:480, overflow:'auto'}}>
              {upcoming.map((e, i) => {
                const dt = new Date(e.date_heure || e.debut || e.date);
                const cfg = e.kind === 'rdv' ? TYPE_LABEL[e.type] || TYPE_LABEL.autre :
                           e.kind === 'intervention' ? { color:'#7c3aed', short:'Inter.' } :
                           { color: e.subkind === 'demarrage' ? '#16a34a' : '#f59e0b', short: e.subkind === 'demarrage' ? '▶' : '■' };
                return (
                  <div key={i} style={{display:'grid',gridTemplateColumns:'auto 1fr', gap:10, alignItems:'flex-start'}}>
                    <div style={{
                      width:48, padding:'6px 0', background:'var(--surface-2)', borderRadius:8,
                      textAlign:'center', borderLeft:`3px solid ${cfg.color}`
                    }}>
                      <div className="tnum" style={{fontSize:16, fontWeight:800, color:'var(--ink-900)', lineHeight:1}}>{dt.toLocaleDateString('fr-FR',{day:'2-digit'})}</div>
                      <div style={{fontSize:8.5, fontWeight:700, color:'var(--ink-500)', textTransform:'uppercase', marginTop:2}}>{dt.toLocaleDateString('fr-FR',{month:'short'}).replace('.','')}</div>
                    </div>
                    <div style={{minWidth:0}}>
                      <div style={{fontSize:12, fontWeight:600, color:'var(--ink-900)'}} className="clip-1">
                        {e.kind === 'rdv'
                          ? (TYPE_LABEL[e.type]?.label || e.type)
                          : e.kind === 'intervention'
                            ? `${e.artisan?.entreprise || 'Intervention'}`
                            : (e.subkind === 'demarrage' ? '▶ Démarrage chantier' : '■ Fin chantier')
                        }
                      </div>
                      <div style={{fontSize:10.5, color:'var(--ink-500)', marginTop:2}} className="clip-1">
                        {e.dossier ? `${e.dossier.client.prenom} ${e.dossier.client.nom}` : ''}
                        {e.kind === 'rdv' && ` · ${dt.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}`}
                      </div>
                    </div>
                  </div>
                );
              })}
              {upcoming.length === 0 && <div style={{padding:20, textAlign:'center', color:'var(--ink-400)', fontSize:12}}>Pas d'événement prévu</div>}
            </div>
          </div>

          <div className="card" style={{padding:18}}>
            <div className="eyebrow" style={{marginBottom:10}}>Filtres rapides</div>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {AGENTES.map(a => (
                <button key={a.id} onClick={()=>setAgenteFilter(agenteFilter === a.id ? '' : a.id)} style={{
                  display:'flex', alignItems:'center', gap:8, padding:'8px 10px',
                  borderRadius:8, border:'1px solid', borderColor: agenteFilter === a.id ? 'var(--brand-500)' : 'var(--ink-200)',
                  background: agenteFilter === a.id ? 'var(--brand-50)' : '#fff',
                  cursor:'pointer', fontSize:12, fontWeight:600, color:'var(--ink-700)', textAlign:'left'
                }}>
                  <Avatar name={`${a.prenom} ${a.nom}`} color={a.color} size={22}/>
                  <span>{a.prenom} {a.nom}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Planning });
