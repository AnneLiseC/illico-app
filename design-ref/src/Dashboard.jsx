// Dashboard — KPIs · alerts · agenda · activity

function Dashboard({ onNav, onOpenChantier }) {
  const { DOSSIERS, calcStatut, fmtEur, nomClient, fmtDate, CA_MENSUEL, NOTIFS, today } = DATA;
  const enCours = DOSSIERS.filter(d => calcStatut(d) === 'en_cours_chantier');
  const aRelancer = DOSSIERS.filter(d => {
    if (!d.date_limite_devis) return false;
    const diff = (new Date(d.date_limite_devis) - today) / 86400000;
    return diff <= 7 && diff >= -2 && !['termine','annule'].includes(calcStatut(d));
  }).sort((a,b)=> new Date(a.date_limite_devis) - new Date(b.date_limite_devis));

  // CA mois — May 2026 (en cours)
  const moisCourant = CA_MENSUEL[CA_MENSUEL.length-1];
  const totalReelAnnee = CA_MENSUEL.reduce((s, m) => s + m.reel, 0) * 1000; // mock scaling for display
  // Display values curated to feel realistic
  const caMoisReel = 14820;
  const caMoisObjectif = 22000;
  const caMoisPct = Math.round(caMoisReel / caMoisObjectif * 100);

  const caAnneeReel = 89400;
  const caAnneeObj = 145000;
  const caAnneePct = Math.round(caAnneeReel / caAnneeObj * 100);

  // Mini agenda — May 15 2026 is Friday
  const agenda = [
    { time:'09:30', dur:60, type:'visite', label:'R2 — Mme Dorian', sub:'M-2026-0203 · combles aménagés', tone:'info' },
    { time:'11:00', dur:30, type:'call',   label:'Relance — M. Lemaire', sub:'M-2026-0218 · MERAD', tone:'warn' },
    { time:'14:00', dur:90, type:'chantier',label:'Réception chantier — M. Boudet', sub:'M-2026-0167 · livraison toiture', tone:'ok' },
    { time:'16:30', dur:45, type:'devis',  label:'Validation devis — M. Mercier', sub:'M-2026-0192 · véranda', tone:'mute' },
  ];

  return (
    <div className="page-enter" style={{display:'flex',flexDirection:'column',gap:24}}>
      {/* Welcome */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',gap:16,flexWrap:'wrap'}}>
        <div>
          <div className="eyebrow" style={{marginBottom:6}}>Vendredi 15 mai 2026 · semaine 20</div>
          <h1 className="page" style={{fontSize:28}}>Bonjour Marine 👋</h1>
          <div style={{color:'var(--ink-500)', fontSize:14, marginTop:6}}>
            Tu as <strong style={{color:'var(--ink-700)'}}>{aRelancer.length} devis à relancer</strong> cette semaine et <strong style={{color:'var(--ink-700)'}}>4 rendez-vous</strong> programmés aujourd'hui.
          </div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-ghost"><I.Doc size={16}/> Exporter</button>
          <button className="btn btn-primary"><I.Plus size={16}/> Nouveau chantier</button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="kpi-grid">
        <KpiCard label="Chantiers en cours" value={enCours.length} sub="3 démarrent ce mois" icon={<I.Building size={20}/>} tone="brand"
          trend={{ up:true, label:'+2 vs mois dernier' }}/>
        <KpiCard label="Devis à relancer <7j" value={aRelancer.length} sub={`${aRelancer.filter(d => (new Date(d.date_limite_devis)-today)/86400000 < 0).length} en retard`} icon={<I.Alert size={20}/>} tone="warn"/>
        <KpiCard label="CA du mois (réel)" value={fmtEur(caMoisReel)} icon={<I.Euro size={20}/>} tone="ok">
          <div style={{marginTop:10}}>
            <Progress value={caMoisPct} showLabel/>
            <div style={{fontSize:11,color:'var(--ink-500)',marginTop:6}}>Objectif : <span className="tnum" style={{fontWeight:600,color:'var(--ink-700)'}}>{fmtEur(caMoisObjectif)}</span></div>
          </div>
        </KpiCard>
        <KpiCard label="CA cumulé 2026" value={fmtEur(caAnneeReel)} icon={<I.TrendUp size={20}/>} tone="brand">
          <div style={{marginTop:10}}>
            <Progress value={caAnneePct} showLabel/>
            <div style={{fontSize:11,color:'var(--ink-500)',marginTop:6}}>Objectif annuel : <span className="tnum" style={{fontWeight:600,color:'var(--ink-700)'}}>{fmtEur(caAnneeObj)}</span></div>
          </div>
        </KpiCard>
      </div>

      {/* Main grid */}
      <div style={{display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:20}}>
        {/* LEFT */}
        <div style={{display:'flex',flexDirection:'column',gap:20, minWidth:0}}>
          {/* Devis à relancer */}
          <div className="card" style={{padding:20}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
              <div>
                <h2 className="page" style={{fontSize:16}}>À relancer cette semaine</h2>
                <div className="eyebrow" style={{marginTop:4}}>{aRelancer.length} dossiers · trier par échéance</div>
              </div>
              <button className="btn btn-ghost" onClick={()=>onNav('chantiers')}>Tout voir <I.Arrow size={14}/></button>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:0,borderTop:'1px solid var(--ink-200)'}}>
              {aRelancer.slice(0,5).map(d => {
                const diff = Math.round((new Date(d.date_limite_devis) - today) / 86400000);
                const enRetard = diff < 0;
                return (
                  <button key={d.id} onClick={()=>onOpenChantier(d.id)} style={{
                    display:'grid', gridTemplateColumns:'auto 1fr auto auto', gap:14,
                    alignItems:'center', padding:'14px 4px', textAlign:'left',
                    borderBottom:'1px solid var(--ink-100)', cursor:'pointer'
                  }} className="row-hover">
                    <div style={{
                      width:36, height:36, borderRadius:10,
                      background: enRetard ? 'rgba(220,38,38,0.10)' : 'rgba(245,158,11,0.13)',
                      color: enRetard ? '#b91c1c' : '#a16207',
                      display:'grid', placeItems:'center', fontSize:13, fontWeight:800
                    }} className="tnum">
                      {enRetard ? `J${diff}` : `+${diff}j`}
                    </div>
                    <div style={{minWidth:0}}>
                      <div style={{display:'flex',gap:8,alignItems:'center'}}>
                        <span className="mono" style={{fontSize:12, color:'var(--brand-800)', fontWeight:600}}>{d.reference}</span>
                        <span style={{fontSize:14,fontWeight:600,color:'var(--ink-900)'}}>{nomClient(d.client)}</span>
                      </div>
                      <div style={{display:'flex',gap:10,marginTop:3, alignItems:'center'}}>
                        <TypoBadge typo={d.typologie}/>
                        <span style={{fontSize:12,color:'var(--ink-500)'}}>{DATA.villeFromAddr(d.client.adresse)}</span>
                      </div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontSize:11,color:'var(--ink-400)'}}>Limite</div>
                      <div className="tnum" style={{fontSize:13,fontWeight:600,color: enRetard ? '#b91c1c':'var(--ink-700)'}}>{fmtDate(d.date_limite_devis)}</div>
                    </div>
                    <Avatar name={`${d.referente.prenom} ${d.referente.nom}`} color={d.referente.color} size={28}/>
                  </button>
                );
              })}
            </div>
          </div>

          {/* CA chart */}
          <div className="card" style={{padding:20}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',marginBottom:18}}>
              <div>
                <h2 className="page" style={{fontSize:16}}>Chiffre d'affaires 2026</h2>
                <div className="eyebrow" style={{marginTop:4}}>Réel vs objectif mensuel</div>
              </div>
              <div style={{display:'flex',gap:14, alignItems:'center'}}>
                <span style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:12,color:'var(--ink-500)'}}><span style={{width:10,height:10,background:'var(--brand-500)',borderRadius:3}}/> Réel</span>
                <span style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:12,color:'var(--ink-500)'}}><span style={{width:10,height:10,background:'var(--ink-200)',borderRadius:3}}/> Objectif</span>
              </div>
            </div>
            <CABarChart/>
          </div>
        </div>

        {/* RIGHT */}
        <div style={{display:'flex',flexDirection:'column',gap:20, minWidth:0}}>
          {/* Agenda */}
          <div className="card" style={{padding:20}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
              <div>
                <h2 className="page" style={{fontSize:16}}>Aujourd'hui</h2>
                <div className="eyebrow" style={{marginTop:4}}>{agenda.length} rendez-vous</div>
              </div>
              <button className="btn btn-ghost" onClick={()=>onNav('planning')}><I.Calendar size={14}/> Planning</button>
            </div>
            <div style={{display:'flex', flexDirection:'column', gap:0, position:'relative'}}>
              {agenda.map((a, i) => (
                <div key={i} style={{
                  display:'grid', gridTemplateColumns:'60px 12px 1fr', gap:14,
                  alignItems:'flex-start', paddingBottom:14, position:'relative'
                }}>
                  <div className="mono tnum" style={{fontSize:12, color:'var(--ink-500)', fontWeight:600, paddingTop:2}}>
                    {a.time}
                    <div style={{fontSize:10, color:'var(--ink-400)',fontWeight:500, marginTop:2}}>{a.dur}min</div>
                  </div>
                  <div style={{position:'relative', display:'flex', justifyContent:'center'}}>
                    <span style={{
                      width:10, height:10, borderRadius:99,
                      background: a.tone==='info'?'#0094d4':a.tone==='ok'?'#16a34a':a.tone==='warn'?'#f59e0b':'#94a3b8',
                      marginTop:6, boxShadow:'0 0 0 3px #fff, 0 0 0 4px rgba(0,148,212,0.18)'
                    }}/>
                    {i < agenda.length-1 && <span style={{position:'absolute', top:18, bottom:-4, width:1, background:'var(--ink-200)'}}/>}
                  </div>
                  <div style={{paddingBottom:10}}>
                    <div style={{fontSize:13.5, fontWeight:600, color:'var(--ink-900)'}}>{a.label}</div>
                    <div style={{fontSize:12, color:'var(--ink-500)', marginTop:2}}>{a.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick stats — pipeline */}
          <div className="card" style={{padding:20}}>
            <div style={{marginBottom:14}}>
              <h2 className="page" style={{fontSize:16}}>Pipeline</h2>
              <div className="eyebrow" style={{marginTop:4}}>État des chantiers</div>
            </div>
            <Pipeline/>
          </div>

          {/* Activity */}
          <div className="card" style={{padding:20}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <h2 className="page" style={{fontSize:16}}>Activité récente</h2>
              <button className="btn btn-ghost" style={{padding:'4px 8px'}}><I.More size={14}/></button>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:14}}>
              {NOTIFS.map(n => {
                const Icon = I[n.icon] || I.Doc;
                return (
                  <div key={n.id} style={{display:'flex',gap:12,alignItems:'flex-start'}}>
                    <div style={{width:32, height:32, borderRadius:10, background:'var(--brand-50)', color:'var(--brand-800)', display:'grid', placeItems:'center', flex:'0 0 32px'}}>
                      <Icon size={16}/>
                    </div>
                    <div style={{flex:1, minWidth:0}}>
                      <div style={{fontSize:13, color:'var(--ink-700)', lineHeight:1.4}}>
                        <strong style={{color:'var(--ink-900)'}}>{n.who}</strong> {n.what} <span className="mono" style={{color:'var(--brand-800)'}}>{n.ref}</span>
                      </div>
                      <div style={{fontSize:11, color:'var(--ink-400)', marginTop:3}}>{n.when}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CABarChart() {
  const { CA_MENSUEL } = DATA;
  // Scale data for display ~ realistic euros
  const data = CA_MENSUEL.map(m => ({ ...m, reel: m.reel*1000, objectif: m.objectif*1000 }));
  // override last month to look in-progress
  data[data.length-1] = { m:'Mai', reel: 14820, objectif: 22000, inProgress:true };
  const max = Math.max(...data.map(d => Math.max(d.reel, d.objectif))) * 1.1;
  const W = 600, H = 200, padX = 30, padY = 24, barW = (W - padX*2) / data.length;

  return (
    <div style={{width:'100%', overflow:'hidden'}}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%', height:240}}>
        {/* Grid lines */}
        {[0,0.25,0.5,0.75,1].map(p => (
          <line key={p} x1={padX} x2={W-padX} y1={padY + (H-padY*2)*p} y2={padY + (H-padY*2)*p} stroke="#e2e8f0" strokeWidth="1" strokeDasharray={p>0?'2 4':''}/>
        ))}
        {[1,0.75,0.5,0.25,0].map((p,i) => (
          <text key={p} x={padX-6} y={padY + (H-padY*2)*(1-p) + 4} textAnchor="end" fontSize="10" fill="#94a3b8">
            {Math.round(max*p/1000)}k
          </text>
        ))}
        {data.map((d, i) => {
          const x = padX + barW*i + barW*0.18;
          const w = barW*0.30;
          const hReel = (H-padY*2) * (d.reel/max);
          const hObj  = (H-padY*2) * (d.objectif/max);
          return (
            <g key={i}>
              <rect x={x} y={H-padY-hObj} width={w} height={hObj} rx="3" fill="#e2e8f0"/>
              <rect x={x+w+4} y={H-padY-hReel} width={w} height={hReel} rx="3" fill={d.inProgress?'#7ccdef':'#0094d4'}
                style={{transition:'all 400ms ease'}}/>
              <text x={x+w+w/2+4} y={H-padY-hReel-6} textAnchor="middle" fontSize="10" fontWeight="700" fill="#00578e">
                {Math.round(d.reel/1000)}k
              </text>
              <text x={x+w+4} y={H-6} textAnchor="middle" fontSize="11" fill="#64748b" fontWeight="500">{d.m}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Pipeline() {
  const { DOSSIERS, calcStatut } = DATA;
  const buckets = [
    { key:'a_traiter', label:'À traiter', tone:'#0094d4', match: s => ['a_contacter','a_relancer'].includes(s) },
    { key:'en_devis',  label:'En devis',  tone:'#f59e0b', match: s => ['devis_en_attente','devis_a_modifier'].includes(s) },
    { key:'chantier',  label:'En chantier',tone:'#16a34a', match: s => s==='en_cours_chantier' },
    { key:'termine',   label:'Terminés',  tone:'#94a3b8', match: s => s==='termine' },
  ];
  const counts = buckets.map(b => DOSSIERS.filter(d => b.match(calcStatut(d))).length);
  const total = counts.reduce((a,b)=>a+b,0);
  return (
    <div>
      <div style={{display:'flex', borderRadius:8, overflow:'hidden', height:14, marginBottom:18, background:'var(--ink-100)'}}>
        {buckets.map((b,i) => (
          <div key={b.key} style={{
            width: `${counts[i]/total*100}%`, background:b.tone, transition:'width 400ms ease'
          }}/>
        ))}
      </div>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
        {buckets.map((b,i) => (
          <div key={b.key} style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{width:10,height:10,borderRadius:3, background:b.tone, flex:'0 0 10px'}}/>
            <span style={{fontSize:12.5, color:'var(--ink-700)', flex:1}}>{b.label}</span>
            <span className="tnum" style={{fontSize:18, fontWeight:800, color:'var(--ink-900)', letterSpacing:-0.02}}>{counts[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

window.Dashboard = Dashboard;
