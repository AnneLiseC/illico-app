// Statistiques — onglets : Overview · Finance · Équipe · Sources · Comparaison

function Statistiques() {
  const { DOSSIERS, AGENTES, fmtEur, calcStatut, TYPOLOGIES, APPORTS } = DATA;
  const [tab, setTab] = React.useState('overview');
  const [annee, setAnnee] = React.useState(2026);

  // Métriques globales
  const all = DOSSIERS;
  const signed = all.filter(d => d.contrat_signe);
  const avec_devis = all.filter(d => d.devis.some(dv => dv.statut === 'accepte'));
  const tauxTransfo = all.length > 0 ? Math.round(avec_devis.length / all.length * 100) : 0;
  const ca = all.reduce((s, d) => s + (d.montant_chantier_ttc || 0), 0);
  const panierMoyen = avec_devis.length > 0 ? Math.round(ca / avec_devis.length) : 0;
  const enCours = all.filter(d => calcStatut(d) === 'en_cours_chantier');

  // Délais moyens
  const delaiSignature = 23; // mock
  const delaiEncaissement = 32;

  // Répartition typologies
  const typoCounts = {};
  all.forEach(d => { typoCounts[d.typologie] = (typoCounts[d.typologie] || 0) + 1; });

  return (
    <div className="page-enter" style={{display:'flex',flexDirection:'column',gap:18}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',gap:16,flexWrap:'wrap'}}>
        <div>
          <div className="eyebrow" style={{marginBottom:4}}>Analyse</div>
          <h1 className="page">Statistiques</h1>
          <div style={{color:'var(--ink-500)', fontSize:13, marginTop:6}}>
            Année <strong style={{color:'var(--ink-700)'}}>{annee}</strong> · {all.length} dossiers · {signed.length} contrats signés
          </div>
        </div>
        <div style={{display:'flex',gap:8, alignItems:'center'}}>
          <select className="input" value={annee} onChange={e=>setAnnee(parseInt(e.target.value))} style={{height:36, minWidth:100}}>
            <option value={2026}>2026</option>
            <option value={2025}>2025</option>
            <option value={2024}>2024</option>
          </select>
          <button className="btn btn-ghost"><I.Download size={14}/> Exporter</button>
        </div>
      </div>

      <div className="tabs" style={{overflowX:'auto'}}>
        {[
          { k:'overview', l:"Vue d'ensemble", icon:'Chart' },
          { k:'finance',  l:'Finance',         icon:'Wallet' },
          { k:'equipe',   l:'Équipe',          icon:'Users' },
          { k:'sources',  l:"Sources d'apport", icon:'Globe' },
          { k:'compare',  l:'Comparaison N/N-1', icon:'TrendUp' },
        ].map(t => {
          const Ic = I[t.icon];
          return (
            <button key={t.k} className={`tab ${tab===t.k?'active':''}`} onClick={()=>setTab(t.k)}>
              <span style={{display:'inline-flex',gap:6,alignItems:'center'}}><Ic size={14}/>{t.l}</span>
            </button>
          );
        })}
      </div>

      {tab === 'overview' && (
        <>
          <div className="kpi-grid">
            <KpiCard label="Taux de transformation" value={`${tauxTransfo}%`} sub="R2 → contrat signé" icon={<I.TrendUp size={20}/>} tone="ok" trend={{up:true, label:'+4 pts vs T-1'}}/>
            <KpiCard label="Délai R1 → signature" value={`${delaiSignature}j`} sub="vs 28j en 2025" icon={<I.Clock size={20}/>} tone="brand" trend={{up:true, label:'-5j'}}/>
            <KpiCard label="Panier moyen" value={fmtEur(panierMoyen)} sub="TTC par chantier signé" icon={<I.Euro size={20}/>} tone="warn"/>
            <KpiCard label="Satisfaction client" value="4.8/5" sub="32 retours · espace client" icon={<I.Sparkles size={20}/>} tone="ok" trend={{up:true, label:'+0.3 vs N-1'}}/>
          </div>

          <div style={{display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:18}}>
            <div className="card" style={{padding:22}}>
              <h2 className="page" style={{fontSize:16, marginBottom:14}}>Pipeline mensuel</h2>
              <PipelineChart/>
            </div>
            <div className="card" style={{padding:22}}>
              <h2 className="page" style={{fontSize:16, marginBottom:14}}>Typologies de dossier</h2>
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                {Object.entries(typoCounts).sort((a,b) => b[1]-a[1]).map(([k,v]) => {
                  const pct = v / all.length * 100;
                  return (
                    <div key={k} style={{display:'flex',alignItems:'center',gap:10}}>
                      <div style={{flex:'0 0 130px', fontSize:12.5, color:'var(--ink-700)'}}>{TYPOLOGIES[k]}</div>
                      <div style={{flex:1, height:14, background:'var(--ink-100)', borderRadius:6, overflow:'hidden'}}>
                        <div style={{height:'100%', width:`${pct}%`, background:'var(--brand-500)', borderRadius:6, transition:'width 400ms'}}/>
                      </div>
                      <div style={{flex:'0 0 50px', textAlign:'right', fontWeight:700, color:'var(--ink-900)', fontSize:13}} className="tnum">{v}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:18}}>
            <Donut value={tauxTransfo} label="Taux transfo" color="#16a34a"/>
            <Donut value={Math.round(enCours.length / all.length * 100)} label="Chantiers actifs" color="#0094d4"/>
            <Donut value={Math.round(signed.length / all.length * 100)} label="Contrats signés" color="#7c3aed"/>
          </div>
        </>
      )}

      {tab === 'finance' && (
        <>
          <div className="kpi-grid">
            <KpiCard label="CA 2026 (réel)" value={fmtEur(89400)} sub="89 dossiers facturés" icon={<I.Euro size={20}/>} tone="ok" trend={{up:true, label:'+18% vs N-1'}}/>
            <KpiCard label="Commissions HT" value={fmtEur(58200)} sub={`Royalties ${fmtEur(2910)}`} icon={<I.Coins size={20}/>} tone="brand"/>
            <KpiCard label="Délai encaissement moyen" value={`${delaiEncaissement}j`} sub="signature → réglé" icon={<I.Clock size={20}/>} tone="warn" trend={{up:false, label:'-3j vs N-1'}}/>
            <KpiCard label="Frais conso. réglés" value={`${signed.filter(d=>d.frais_statut==='regle').length}/${signed.length}`} sub={`${Math.round(signed.filter(d=>d.frais_statut==='regle').length/Math.max(1,signed.length)*100)}% de taux`} icon={<I.Check size={20}/>} tone="ok"/>
          </div>
          <div className="card" style={{padding:22}}>
            <h2 className="page" style={{fontSize:16, marginBottom:14}}>Évolution mensuelle CA réel</h2>
            <CAEvoChart/>
          </div>
        </>
      )}

      {tab === 'equipe' && (
        <>
          <div className="card" style={{padding:0, overflow:'hidden'}}>
            <table style={{width:'100%', borderCollapse:'collapse', fontSize:13}}>
              <thead style={{background:'var(--surface-2)'}}>
                <tr>
                  <ArtTh>Membre</ArtTh>
                  <ArtTh right>Dossiers</ArtTh>
                  <ArtTh right>Contrats signés</ArtTh>
                  <ArtTh right>CA généré HT</ArtTh>
                  <ArtTh right>Panier moyen</ArtTh>
                  <ArtTh right>Taux transfo</ArtTh>
                </tr>
              </thead>
              <tbody>
                {AGENTES.map(a => {
                  const ds = all.filter(d => d.referente.id === a.id);
                  const signedA = ds.filter(d => d.contrat_signe);
                  const caA = ds.reduce((s, d) => s + (d.montant_chantier_ttc || 0), 0);
                  const panier = signedA.length > 0 ? Math.round(caA / signedA.length) : 0;
                  const txA = ds.length > 0 ? Math.round(signedA.length / ds.length * 100) : 0;
                  return (
                    <tr key={a.id} style={{borderTop:'1px solid var(--ink-100)'}} className="row-hover">
                      <td style={{padding:'14px 16px'}}>
                        <div style={{display:'flex',gap:12,alignItems:'center'}}>
                          <Avatar name={`${a.prenom} ${a.nom}`} color={a.color} size={36}/>
                          <div>
                            <div style={{fontWeight:700, color:'var(--ink-900)'}}>{a.prenom} {a.nom}</div>
                            <div style={{fontSize:11, color:'var(--ink-500)'}}>{a.role === 'admin' ? 'Franchisée' : 'Agente'}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{padding:'14px 16px', textAlign:'right', fontWeight:600}} className="tnum">{ds.length}</td>
                      <td style={{padding:'14px 16px', textAlign:'right', fontWeight:600}} className="tnum">{signedA.length}</td>
                      <td style={{padding:'14px 16px', textAlign:'right', fontWeight:700, color:'var(--brand-800)'}} className="tnum">{fmtEur(caA)}</td>
                      <td style={{padding:'14px 16px', textAlign:'right'}} className="tnum">{fmtEur(panier)}</td>
                      <td style={{padding:'14px 16px', textAlign:'right'}}>
                        <span style={{display:'inline-flex',alignItems:'center',gap:6}}>
                          <span className="tnum" style={{fontWeight:700, color: txA >= 60 ? '#15803d' : txA >= 30 ? '#a16207' : '#b91c1c'}}>{txA}%</span>
                          <div style={{width:60, height:5, background:'var(--ink-100)', borderRadius:99, overflow:'hidden'}}>
                            <div style={{width:`${txA}%`, height:'100%', background: txA >= 60 ? '#16a34a' : txA >= 30 ? '#f59e0b' : '#dc2626'}}/>
                          </div>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'sources' && (
        <div style={{display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:18}}>
          <div className="card" style={{padding:22}}>
            <h2 className="page" style={{fontSize:16, marginBottom:14}}>Origine des leads · {annee}</h2>
            <div style={{display:'flex',flexDirection:'column',gap:14}}>
              {APPORTS.map(s => (
                <div key={s.k} style={{display:'flex',alignItems:'center',gap:10}}>
                  <div style={{flex:'0 0 170px', fontSize:13, color:'var(--ink-700)', fontWeight:500}}>{s.k}</div>
                  <div style={{flex:1, height:18, background:'var(--ink-100)', borderRadius:6, overflow:'hidden'}}>
                    <div style={{height:'100%', width:`${s.v}%`, background:'linear-gradient(90deg, var(--brand-500), var(--brand-800))', borderRadius:6, transition:'width 400ms'}}/>
                  </div>
                  <div style={{flex:'0 0 40px', textAlign:'right', fontWeight:700, color:'var(--ink-900)'}} className="tnum">{s.v}%</div>
                </div>
              ))}
            </div>
          </div>
          <div className="card" style={{padding:22}}>
            <h2 className="page" style={{fontSize:16, marginBottom:14}}>Apporteurs d'affaires</h2>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {[
                { nom:'Agence Cinquième Avenue', pct:5, dossiers:4, gain:1240 },
                { nom:'Notaire Maître Delpech',  pct:3, dossiers:2, gain:680 },
                { nom:'Architecte Mistral',       pct:7, dossiers:1, gain:980 },
              ].map((a,i) => (
                <div key={i} style={{
                  display:'flex', justifyContent:'space-between', alignItems:'center',
                  padding:'12px 14px', borderRadius:10, border:'1px solid var(--ink-200)'
                }}>
                  <div>
                    <div style={{fontSize:13, fontWeight:600, color:'var(--ink-900)'}}>{a.nom}</div>
                    <div style={{fontSize:11, color:'var(--ink-500)', marginTop:2}}>{a.dossiers} dossiers · {a.pct}% commission</div>
                  </div>
                  <div className="tnum" style={{fontSize:13, fontWeight:700, color:'var(--brand-800)'}}>-{fmtEur(a.gain)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'compare' && (
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:18}}>
          {[
            { k:'Dossiers',         n:12, n1:9,  unit:'' },
            { k:'Contrats signés',  n:9,  n1:6,  unit:'' },
            { k:'CA HT',            n:89400, n1:62800, unit:' €', eur:true },
            { k:'Panier moyen',     n:9900, n1:10460, unit:' €', eur:true },
            { k:'Taux transfo',     n:75, n1:67, unit:'%' },
            { k:'Délai R1→sign.',   n:23, n1:28, unit:' j', inverse:true },
          ].map(m => {
            const evo = m.n1 > 0 ? Math.round((m.n - m.n1) / m.n1 * 100) : 0;
            const good = m.inverse ? evo < 0 : evo > 0;
            return (
              <div key={m.k} className="card" style={{padding:20}}>
                <div className="eyebrow">{m.k}</div>
                <div style={{display:'flex',alignItems:'baseline',gap:14, marginTop:8}}>
                  <span style={{fontSize:30, fontWeight:800, color:'var(--ink-900)', letterSpacing:-0.02}} className="tnum">
                    {m.eur ? fmtEur(m.n) : `${m.n}${m.unit}`}
                  </span>
                  <span style={{fontSize:13, fontWeight:700, color: good ? '#15803d' : '#b91c1c', display:'inline-flex', alignItems:'center', gap:4}}>
                    {evo > 0 ? <I.TrendUp size={14}/> : <I.TrendDown size={14}/>}
                    {evo > 0 ? '+' : ''}{evo}%
                  </span>
                </div>
                <div style={{fontSize:11.5, color:'var(--ink-500)', marginTop:6}}>
                  N-1 : <span className="tnum" style={{color:'var(--ink-700)', fontWeight:600}}>{m.eur ? fmtEur(m.n1) : `${m.n1}${m.unit}`}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Donut({ value, label, color }) {
  const C = 2 * Math.PI * 48;
  const dash = (value/100) * C;
  return (
    <div className="card" style={{padding:24, display:'flex', alignItems:'center', gap:18}}>
      <svg viewBox="0 0 140 140" width="120" height="120">
        <circle cx="70" cy="70" r="48" stroke="#eef2f7" strokeWidth="16" fill="none"/>
        <circle cx="70" cy="70" r="48" stroke={color} strokeWidth="16" fill="none"
          strokeDasharray={`${dash} ${C-dash}`} strokeLinecap="round"
          transform="rotate(-90 70 70)"/>
        <text x="70" y="78" textAnchor="middle" fontSize="22" fill="#0f2744" fontWeight="800" className="tnum">{value}%</text>
      </svg>
      <div>
        <div className="eyebrow">{label}</div>
        <div style={{fontSize:13, color:'var(--ink-500)', marginTop:6, lineHeight:1.5}}>
          {value >= 60 ? 'Excellent' : value >= 40 ? 'Bon' : 'À améliorer'}
        </div>
      </div>
    </div>
  );
}

function PipelineChart() {
  const data = [
    { m:'Jan', a_traiter:3, devis:2, chantier:1, termine:2 },
    { m:'Fév', a_traiter:4, devis:3, chantier:1, termine:1 },
    { m:'Mar', a_traiter:5, devis:3, chantier:2, termine:1 },
    { m:'Avr', a_traiter:4, devis:4, chantier:3, termine:2 },
    { m:'Mai', a_traiter:3, devis:5, chantier:4, termine:1 },
  ];
  const max = Math.max(...data.map(d => d.a_traiter + d.devis + d.chantier + d.termine));
  const W = 600, H = 220, padX = 30, padY = 24, barW = (W - padX*2) / data.length;

  const colors = { a_traiter:'#0094d4', devis:'#f59e0b', chantier:'#16a34a', termine:'#94a3b8' };
  const labels = { a_traiter:'À traiter', devis:'En devis', chantier:'En chantier', termine:'Terminé' };

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%', height:240}}>
        {[0,0.25,0.5,0.75,1].map(p => (
          <line key={p} x1={padX} x2={W-padX} y1={padY + (H-padY*2)*p} y2={padY + (H-padY*2)*p} stroke="#e2e8f0" strokeDasharray={p>0?'2 4':''}/>
        ))}
        {data.map((d, i) => {
          let y = H - padY;
          const w = barW * 0.5;
          const x = padX + barW*i + barW*0.25;
          return (
            <g key={i}>
              {['a_traiter','devis','chantier','termine'].map(k => {
                const h = (H - padY*2) * (d[k] / max);
                const elem = <rect key={k} x={x} y={y - h} width={w} height={h} fill={colors[k]} rx={1}/>;
                y -= h;
                return elem;
              })}
              <text x={x+w/2} y={H-6} textAnchor="middle" fontSize="11" fill="#64748b">{d.m}</text>
            </g>
          );
        })}
      </svg>
      <div style={{display:'flex',gap:14,marginTop:10,fontSize:12,color:'var(--ink-500)',flexWrap:'wrap',justifyContent:'center'}}>
        {Object.entries(labels).map(([k,l]) => (
          <span key={k} style={{display:'inline-flex',alignItems:'center',gap:5}}>
            <span style={{width:10,height:10,background:colors[k],borderRadius:3}}/>{l}
          </span>
        ))}
      </div>
    </div>
  );
}

function CAEvoChart() {
  const data = [
    { m:'Jan', reel:8200,  prev:12500 },
    { m:'Fév', reel:11400, prev:14800 },
    { m:'Mar', reel:18900, prev:22000 },
    { m:'Avr', reel:16700, prev:19400 },
    { m:'Mai', reel:14820, prev:22000, current:true },
    { m:'Juin', reel:0,    prev:24500 },
    { m:'Juil', reel:0,    prev:18200 },
  ];
  const max = Math.max(...data.map(m => Math.max(m.reel, m.prev))) * 1.1;
  const W = 700, H = 240;
  const ptX = i => 40 + (W-80)/(data.length-1) * i;
  const ptY = v => 30 + (H-60) * (1 - v/max);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%', height:300}}>
      {[0,0.25,0.5,0.75,1].map(p => (
        <g key={p}>
          <line x1="40" x2={W-30} y1={30 + (H-60)*(1-p)} y2={30 + (H-60)*(1-p)} stroke="#e2e8f0" strokeDasharray={p>0?'2 4':''}/>
          <text x="34" y={30 + (H-60)*(1-p) + 4} textAnchor="end" fontSize="11" fill="#94a3b8">{Math.round(max*p/1000)}k</text>
        </g>
      ))}
      {/* Prévi line */}
      <path d={data.map((d,i)=>`${i===0?'M':'L'} ${ptX(i)},${ptY(d.prev)}`).join(' ')}
        fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="4 4"/>
      {/* Réel bars */}
      {data.map((d,i) => d.reel > 0 && (
        <g key={i}>
          <rect x={ptX(i)-14} y={ptY(d.reel)} width={28} height={H-30-ptY(d.reel)} rx={3} fill={d.current ? '#7ccdef' : '#0094d4'}/>
          <text x={ptX(i)} y={ptY(d.reel)-6} textAnchor="middle" fontSize="11" fontWeight="700" fill="#00578e">{Math.round(d.reel/1000)}k</text>
        </g>
      ))}
      {data.map((d,i) => (
        <text key={i} x={ptX(i)} y={H-8} textAnchor="middle" fontSize="11" fill="#64748b" fontWeight={d.current?700:500}>{d.m}</text>
      ))}
    </svg>
  );
}

function ArtTh({ children, right, style }) {
  return <th style={{textAlign: right ? 'right':'left', padding:'12px 16px', fontSize:11, fontWeight:700, color:'var(--ink-500)', letterSpacing:0.05, textTransform:'uppercase', ...style}}>{children}</th>;
}

Object.assign(window, { Statistiques });
