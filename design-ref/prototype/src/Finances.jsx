// Finances — F1 Prévisionnel / F2 Réel / Synthèse

function Finances() {
  const { DOSSIERS, fmtEur, nomClient, fmtDate, calcStatut, today } = DATA;
  const [tab, setTab] = React.useState('synthese'); // synthese | previsionnel | reel
  const [period, setPeriod] = React.useState('chantier'); // chantier | mois | annee
  const [scope, setScope] = React.useState('tous'); // tous | moi | <agente>

  // Compute simplified finance per dossier
  const finance = DOSSIERS.map(d => {
    const devisAcc = d.devis.filter(dv => dv.statut === 'accepte');
    const commissionsHT = devisAcc.reduce((s, dv) => s + (dv.montant_ht * (dv.commission_pourcentage || 0)/100), 0);
    const fraisHT = (d.frais_consultation || 0) / 1.20;
    const royalties = (commissionsHT + fraisHT) * 0.32; // simplified
    const partAgente = d.referente.role === 'admin' ? 0 : 0.5;
    const previsionnel = commissionsHT + fraisHT;
    const previsionnelNet = previsionnel - royalties;
    const reelPct = d.avancement >= 100 ? 1.0 : d.frais_statut==='regle' ? 0.3 + (d.suivi.acomptes_recus/Math.max(1,d.suivi.acomptes_total))*0.5 : 0;
    const reel = previsionnel * reelPct;
    const reelNet = reel - reel*0.32;
    const status = calcStatut(d);
    return { d, status, commissionsHT, fraisHT, royalties, previsionnel, previsionnelNet, reel, reelNet, partAgente, gainAgente: reelNet * partAgente, gainAdmin: reelNet * (1-partAgente) };
  });

  // Filter by scope
  const scoped = finance.filter(f => {
    if (scope === 'tous') return true;
    if (scope === 'moi') return f.d.referente.role === 'admin';
    return f.d.referente.id === scope;
  });

  // Totals
  const tot = scoped.reduce((acc, f) => ({
    previsionnel: acc.previsionnel + f.previsionnel,
    previsionnelNet: acc.previsionnelNet + f.previsionnelNet,
    reel: acc.reel + f.reel,
    reelNet: acc.reelNet + f.reelNet,
    royalties: acc.royalties + f.royalties,
    commissionsHT: acc.commissionsHT + f.commissionsHT,
    fraisHT: acc.fraisHT + f.fraisHT,
    gainAdmin: acc.gainAdmin + f.gainAdmin,
    gainAgente: acc.gainAgente + f.gainAgente,
  }), { previsionnel:0, previsionnelNet:0, reel:0, reelNet:0, royalties:0, commissionsHT:0, fraisHT:0, gainAdmin:0, gainAgente:0 });

  const objectifAnnuel = 145000;
  const pctObjectif = Math.round(tot.reelNet / objectifAnnuel * 100);

  return (
    <div className="page-enter" style={{display:'flex',flexDirection:'column',gap:18}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',gap:16,flexWrap:'wrap'}}>
        <div>
          <div className="eyebrow" style={{marginBottom:4}}>Pilotage financier</div>
          <h1 className="page">Finances</h1>
          <div style={{color:'var(--ink-500)', fontSize:13, marginTop:6}}>Année <strong style={{color:'var(--ink-700)'}}>2026</strong> · {scoped.length} dossiers actifs</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-ghost"><I.Doc size={16}/> Exporter le bilan</button>
          <button className="btn btn-primary"><I.Coins size={16}/> Saisir un règlement</button>
        </div>
      </div>

      {/* F1 / F2 / Synthèse tabs */}
      <div className="tabs">
        <button className={`tab ${tab==='previsionnel'?'active':''}`} onClick={()=>setTab('previsionnel')}>
          <span style={{display:'inline-flex',gap:8,alignItems:'center'}}>
            <span className="mono" style={{
              padding:'1px 6px', borderRadius:5, fontSize:10, fontWeight:800,
              background: tab==='previsionnel' ? 'var(--brand-800)' : 'var(--ink-100)',
              color: tab==='previsionnel' ? '#fff' : 'var(--ink-500)'
            }}>F1</span> Prévisionnel
          </span>
        </button>
        <button className={`tab ${tab==='reel'?'active':''}`} onClick={()=>setTab('reel')}>
          <span style={{display:'inline-flex',gap:8,alignItems:'center'}}>
            <span className="mono" style={{
              padding:'1px 6px', borderRadius:5, fontSize:10, fontWeight:800,
              background: tab==='reel' ? 'var(--brand-800)' : 'var(--ink-100)',
              color: tab==='reel' ? '#fff' : 'var(--ink-500)'
            }}>F2</span> Réel
          </span>
        </button>
        <button className={`tab ${tab==='synthese'?'active':''}`} onClick={()=>setTab('synthese')}>Synthèse</button>
      </div>

      {/* KPI strip */}
      <div className="kpi-grid">
        <KpiCard label="CA réel net 2026" value={fmtEur(tot.reelNet)} icon={<I.Euro size={20}/>} tone="brand">
          <div style={{marginTop:10}}>
            <Progress value={pctObjectif} showLabel/>
            <div style={{fontSize:11,color:'var(--ink-500)',marginTop:6}}>Objectif <span className="tnum" style={{fontWeight:600,color:'var(--ink-700)'}}>{fmtEur(objectifAnnuel)}</span></div>
          </div>
        </KpiCard>
        <KpiCard label="CA prévisionnel" value={fmtEur(tot.previsionnelNet)} sub={`${fmtEur(tot.previsionnel)} brut · ${fmtEur(tot.royalties)} royalties`} icon={<I.TrendUp size={20}/>} tone="ok"/>
        <KpiCard label="Commissions HT" value={fmtEur(tot.commissionsHT)} sub={`Frais conso. ${fmtEur(tot.fraisHT)} HT`} icon={<I.Coins size={20}/>} tone="warn"/>
        <KpiCard label="Part franchisée" value={fmtEur(tot.gainAdmin)} sub={`Part agentes ${fmtEur(tot.gainAgente)}`} icon={<I.Wallet size={20}/>} tone="brand"/>
      </div>

      {/* Period sub-tabs */}
      <div className="card" style={{padding:'12px 16px', display:'flex', gap:12, alignItems:'center', flexWrap:'wrap'}}>
        <div className="eyebrow">Vue</div>
        <div style={{display:'flex',gap:4, background:'var(--ink-100)', padding:3, borderRadius:9}}>
          {[
            { key:'chantier', label:'Par chantier' },
            { key:'mois', label:'Par mois' },
            { key:'annee', label:'Par année' },
          ].map(p => (
            <button key={p.key} onClick={()=>setPeriod(p.key)} style={{
              padding:'6px 12px', fontSize:12.5, fontWeight:600, borderRadius:7,
              background: period===p.key ? '#fff' : 'transparent',
              color: period===p.key ? 'var(--brand-800)' : 'var(--ink-500)',
              boxShadow: period===p.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
            }}>{p.label}</button>
          ))}
        </div>
        <div style={{marginLeft:18, display:'flex',gap:4, alignItems:'center'}}>
          <div className="eyebrow">Périmètre</div>
          <div style={{display:'flex',gap:4, background:'var(--ink-100)', padding:3, borderRadius:9, marginLeft:8}}>
            {[
              { key:'tous', label:'Tous' },
              { key:'moi', label:'Marine' },
              ...DATA.AGENTES.filter(a=>a.role==='agente').map(a => ({ key:a.id, label:a.prenom })),
            ].map(s => (
              <button key={s.key} onClick={()=>setScope(s.key)} style={{
                padding:'6px 12px', fontSize:12.5, fontWeight:600, borderRadius:7,
                background: scope===s.key ? '#fff' : 'transparent',
                color: scope===s.key ? 'var(--brand-800)' : 'var(--ink-500)',
                boxShadow: scope===s.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
              }}>{s.label}</button>
            ))}
          </div>
        </div>
        <div style={{marginLeft:'auto', display:'flex',gap:6,alignItems:'center', fontSize:12, color:'var(--ink-500)'}}>
          <I.Calendar size={14}/> Année <strong style={{color:'var(--ink-700)'}}>2026</strong>
        </div>
      </div>

      {/* Main content per tab */}
      {tab === 'synthese' && <SyntheseView tot={tot} scoped={scoped} objectif={objectifAnnuel}/>}
      {tab === 'previsionnel' && <FinanceTable rows={scoped} mode="previsionnel" period={period}/>}
      {tab === 'reel' && <FinanceTable rows={scoped} mode="reel" period={period}/>}
    </div>
  );
}

function SyntheseView({ tot, scoped, objectif }) {
  const { fmtEur, fmtMonth } = DATA;
  // mensuels
  const months = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sept','Oct','Nov','Déc'];
  const monthData = [
    { reel: 8200,  prev: 12500 },
    { reel: 11400, prev: 14800 },
    { reel: 18900, prev: 22000 },
    { reel: 16700, prev: 19400 },
    { reel: 14820, prev: 22000, current:true },
    { reel: 0,     prev: 24500 },
    { reel: 0,     prev: 18200 },
    { reel: 0,     prev: 15400 },
    { reel: 0,     prev: 22000 },
    { reel: 0,     prev: 19800 },
    { reel: 0,     prev: 16800 },
    { reel: 0,     prev: 12500 },
  ];
  const max = Math.max(...monthData.map(m => Math.max(m.reel, m.prev))) * 1.1;

  return (
    <div style={{display:'grid', gridTemplateColumns:'1.5fr 1fr', gap:18}}>
      {/* Big chart */}
      <div className="card" style={{padding:22}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:18}}>
          <div>
            <h2 className="page" style={{fontSize:16}}>Évolution mensuelle 2026</h2>
            <div className="eyebrow" style={{marginTop:4}}>CA réel net vs prévisionnel</div>
          </div>
          <div style={{display:'flex',gap:14,alignItems:'center'}}>
            <span style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:12,color:'var(--ink-500)'}}><span style={{width:10,height:10,background:'var(--brand-500)',borderRadius:3}}/> Réel</span>
            <span style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:12,color:'var(--ink-500)'}}><span style={{width:10,height:10,background:'#cbd5e1',borderRadius:3, border:'1px dashed #94a3b8'}}/> Prévi</span>
          </div>
        </div>
        <svg viewBox="0 0 800 280" style={{width:'100%', height:280}}>
          {/* y grid */}
          {[0,0.25,0.5,0.75,1].map(p => (
            <g key={p}>
              <line x1="40" x2="780" y1={30+220*(1-p)} y2={30+220*(1-p)} stroke="#e2e8f0" strokeDasharray={p>0?'2 4':''}/>
              <text x="34" y={30+220*(1-p)+4} textAnchor="end" fontSize="11" fill="#94a3b8">{Math.round(max*p/1000)}k €</text>
            </g>
          ))}
          {/* Previsionnel area */}
          <path d={`M 40,${30+220} ${monthData.map((m,i) => `L ${40 + (740/11)*i},${30 + 220*(1 - m.prev/max)}`).join(' ')} L 780,${30+220} Z`}
            fill="rgba(0,148,212,0.06)"/>
          <path d={`M ${monthData.map((m,i) => `${40 + (740/11)*i},${30 + 220*(1 - m.prev/max)}`).join(' L ')}`}
            fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 4"/>
          {/* Reel bars */}
          {monthData.map((m,i) => {
            if (m.reel === 0) return null;
            const x = 40 + (740/11)*i - 12;
            const h = 220 * (m.reel/max);
            return (
              <rect key={i} x={x} y={30+220-h} width="24" height={h} rx="3"
                fill={m.current ? '#7ccdef' : '#0094d4'}/>
            );
          })}
          {/* Reel points */}
          {monthData.map((m,i) => {
            if (m.reel === 0) return null;
            return <circle key={'c'+i} cx={40 + (740/11)*i} cy={30 + 220*(1 - m.reel/max)} r="4" fill="#00578e"/>;
          })}
          {/* Labels */}
          {months.map((mn, i) => (
            <text key={mn} x={40 + (740/11)*i} y="270" textAnchor="middle" fontSize="11" fill="#64748b" fontWeight={i===4?700:500}>{mn}</text>
          ))}
        </svg>
        <div style={{display:'flex',justifyContent:'space-between',marginTop:14, gap:14}}>
          <div style={{flex:1, padding:'10px 14px', background:'var(--surface-2)', borderRadius:10}}>
            <div className="eyebrow">Total réel</div>
            <div className="big-num tnum" style={{fontSize:24, marginTop:4}}>{fmtEur(tot.reelNet)}</div>
          </div>
          <div style={{flex:1, padding:'10px 14px', background:'var(--surface-2)', borderRadius:10}}>
            <div className="eyebrow">Total prévi (année)</div>
            <div className="big-num tnum" style={{fontSize:24, marginTop:4, color:'#15803d'}}>{fmtEur(tot.previsionnelNet)}</div>
          </div>
          <div style={{flex:1, padding:'10px 14px', background:'var(--surface-2)', borderRadius:10}}>
            <div className="eyebrow">Objectif</div>
            <div className="big-num tnum" style={{fontSize:24, marginTop:4, color:'var(--ink-700)'}}>{fmtEur(objectif)}</div>
          </div>
        </div>
      </div>

      {/* Right: breakdown + leaderboard */}
      <div style={{display:'flex',flexDirection:'column',gap:18}}>
        <div className="card" style={{padding:22}}>
          <h2 className="page" style={{fontSize:16, marginBottom:14}}>Répartition CA</h2>
          <Donut/>
          <div style={{marginTop:18,display:'flex',flexDirection:'column',gap:10}}>
            <LegendRow color="#00578e" label="Commissions artisans" value={fmtEur(tot.commissionsHT)} pct={Math.round(tot.commissionsHT/(tot.commissionsHT+tot.fraisHT)*100)}/>
            <LegendRow color="#0094d4" label="Frais de consultation" value={fmtEur(tot.fraisHT)} pct={Math.round(tot.fraisHT/(tot.commissionsHT+tot.fraisHT)*100)}/>
            <LegendRow color="#94a3b8" label="Royalties (-32%)" value={`-${fmtEur(tot.royalties)}`} pct={null}/>
          </div>
        </div>

        <div className="card" style={{padding:22}}>
          <h2 className="page" style={{fontSize:16, marginBottom:14}}>Performances par référente</h2>
          {DATA.AGENTES.map(a => {
            const f = scoped.filter(s => s.d.referente.id === a.id);
            const total = f.reduce((s, x) => s + x.reelNet, 0);
            const part  = a.role === 'admin' ? total : f.reduce((s, x) => s + x.gainAdmin, 0);
            return (
              <div key={a.id} style={{display:'grid', gridTemplateColumns:'auto 1fr auto', gap:12, padding:'10px 0', borderBottom:'1px solid var(--ink-100)', alignItems:'center'}}>
                <Avatar name={`${a.prenom} ${a.nom}`} color={a.color} size={32}/>
                <div>
                  <div style={{fontSize:13.5, fontWeight:600, color:'var(--ink-900)'}}>{a.prenom} {a.nom}</div>
                  <div style={{fontSize:11, color:'var(--ink-500)'}}>{a.role==='admin'?'Franchisée':'Agente'} · {f.length} dossiers</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div className="tnum" style={{fontSize:14, fontWeight:700, color:'var(--brand-800)'}}>{DATA.fmtEur(total)}</div>
                  {a.role !== 'admin' && <div style={{fontSize:11, color:'var(--ink-500)'}}>franchisée : {DATA.fmtEur(part)}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Donut() {
  // simplified donut chart
  const segs = [
    { v: 62, c:'#00578e' },
    { v: 24, c:'#0094d4' },
    { v: 14, c:'#94a3b8' },
  ];
  const C = 2*Math.PI*48;
  let off = 0;
  return (
    <svg viewBox="0 0 140 140" width="160" height="160" style={{display:'block', margin:'0 auto'}}>
      <circle cx="70" cy="70" r="48" stroke="#eef2f7" strokeWidth="20" fill="none"/>
      {segs.map((s, i) => {
        const len = (s.v/100)*C;
        const dash = `${len} ${C-len}`;
        const el = <circle key={i} cx="70" cy="70" r="48" stroke={s.c} strokeWidth="20" fill="none"
                    strokeDasharray={dash} strokeDashoffset={-off}
                    transform="rotate(-90 70 70)" strokeLinecap="butt"/>;
        off += len;
        return el;
      })}
      <text x="70" y="68" textAnchor="middle" fontSize="11" fill="#94a3b8" fontWeight="600">2026</text>
      <text x="70" y="86" textAnchor="middle" fontSize="20" fill="#0f2744" fontWeight="800" className="tnum">100%</text>
    </svg>
  );
}

function LegendRow({ color, label, value, pct }) {
  return (
    <div style={{display:'flex',alignItems:'center',gap:10}}>
      <span style={{width:10,height:10,background:color,borderRadius:3,flex:'0 0 10px'}}/>
      <span style={{fontSize:12.5, color:'var(--ink-700)', flex:1}}>{label}</span>
      <span className="tnum" style={{fontSize:12.5, fontWeight:700, color:'var(--ink-900)'}}>{value}</span>
      {pct !== null && <span className="tnum" style={{fontSize:11, color:'var(--ink-400)', width:36, textAlign:'right'}}>{pct}%</span>}
    </div>
  );
}

function FinanceTable({ rows, mode, period }) {
  const { fmtEur, nomClient, fmtDate } = DATA;
  const isReel = mode === 'reel';
  const [open, setOpen] = React.useState(null);

  return (
    <div className="card" style={{padding:0, overflow:'hidden'}}>
      <div style={{padding:'14px 22px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid var(--ink-200)'}}>
        <div>
          <h2 className="page" style={{fontSize:16}}>
            {isReel ? 'F2 — Encaissements réels' : 'F1 — Engagements prévisionnels'} · {rows.length} dossiers
          </h2>
          <div className="eyebrow" style={{marginTop:4}}>{period === 'chantier' ? 'Détail par chantier' : period === 'mois' ? 'Agrégation par mois de paiement' : 'Agrégation annuelle'}</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-ghost" style={{padding:'6px 10px', fontSize:12}}><I.Filter size={14}/></button>
          <button className="btn btn-ghost" style={{padding:'6px 10px', fontSize:12}}><I.Doc size={14}/> CSV</button>
        </div>
      </div>
      <div style={{overflow:'auto'}}>
        <table style={{width:'100%', borderCollapse:'collapse', fontSize:13}}>
          <thead style={{background:'var(--surface-2)', position:'sticky', top:0, zIndex:1}}>
            <tr>
              <Th>Dossier</Th>
              <Th>Référente</Th>
              <Th>Statut</Th>
              <Th right>Frais HT</Th>
              <Th right>Commissions HT</Th>
              <Th right>Royalties</Th>
              <Th right>{isReel ? 'Encaissé net' : 'Prévi net'}</Th>
              <Th right>Avancement</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {rows.map(f => {
              const isOpen = open === f.d.id;
              const value = isReel ? f.reelNet : f.previsionnelNet;
              const valuePct = isReel ? (f.previsionnel > 0 ? f.reel/f.previsionnel*100 : 0) : 100;
              return (
                <React.Fragment key={f.d.id}>
                  <tr onClick={()=>setOpen(isOpen?null:f.d.id)} style={{borderTop:'1px solid var(--ink-100)', cursor:'pointer'}} className="row-hover">
                    <Td>
                      <div style={{display:'flex',gap:10,alignItems:'center'}}>
                        <I.ChevronRight size={14} className="" />
                        <div style={{minWidth:0}}>
                          <div className="mono" style={{fontSize:11.5, color:'var(--brand-800)', fontWeight:700}}>{f.d.reference}</div>
                          <div style={{fontSize:13, fontWeight:600, color:'var(--ink-900)', marginTop:2}} className="clip-1">{nomClient(f.d.client)}</div>
                          <div style={{marginTop:3}}><TypoBadge typo={f.d.typologie}/></div>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <div style={{display:'inline-flex',alignItems:'center',gap:6}}>
                        <Avatar name={`${f.d.referente.prenom} ${f.d.referente.nom}`} color={f.d.referente.color} size={22}/>
                        <span style={{fontSize:12.5, color:'var(--ink-700)'}}>{f.d.referente.prenom}</span>
                      </div>
                    </Td>
                    <Td><StatutBadge statut={f.status}/></Td>
                    <Td right mono>{fmtEur(f.fraisHT)}</Td>
                    <Td right mono>{fmtEur(f.commissionsHT)}</Td>
                    <Td right mono dim>-{fmtEur(f.royalties)}</Td>
                    <Td right>
                      <div className="tnum" style={{fontSize:15, fontWeight:800, color: isReel && f.reelNet > 0 ? '#15803d' : 'var(--brand-800)'}}>{fmtEur(value)}</div>
                    </Td>
                    <Td right>
                      <div style={{display:'flex',alignItems:'center', gap:8, minWidth:120, justifyContent:'flex-end'}}>
                        <div style={{width:80}}><Progress value={valuePct} height={5}/></div>
                        <span className="tnum" style={{fontSize:11, color:'var(--ink-500)', fontWeight:600, minWidth:30, textAlign:'right'}}>{Math.round(valuePct)}%</span>
                      </div>
                    </Td>
                    <Td><button className="btn btn-ghost" style={{padding:'4px 8px', fontSize:11}}><I.Arrow size={12}/></button></Td>
                  </tr>
                  {isOpen && (
                    <tr style={{background:'var(--surface-2)', borderTop:'1px solid var(--ink-100)'}}>
                      <td colSpan="9" style={{padding:'14px 22px 18px'}}>
                        <FinanceBreakdown f={f} isReel={isReel}/>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{borderTop:'2px solid var(--ink-200)', background:'var(--surface-2)'}}>
              <td colSpan="3" style={{padding:'14px 22px'}}>
                <div className="eyebrow">Total {rows.length} dossiers</div>
                <div style={{fontSize:13, color:'var(--ink-700)', marginTop:2, fontWeight:600}}>Tous périmètres confondus</div>
              </td>
              <Td right mono bold>{fmtEur(rows.reduce((s,f)=>s+f.fraisHT,0))}</Td>
              <Td right mono bold>{fmtEur(rows.reduce((s,f)=>s+f.commissionsHT,0))}</Td>
              <Td right mono dim>-{fmtEur(rows.reduce((s,f)=>s+f.royalties,0))}</Td>
              <Td right>
                <div className="tnum" style={{fontSize:20, fontWeight:800, color:'var(--brand-800)'}}>
                  {fmtEur(rows.reduce((s,f)=>s + (isReel?f.reelNet:f.previsionnelNet), 0))}
                </div>
              </Td>
              <Td></Td><Td></Td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function Th({ children, right }) {
  return <th style={{
    textAlign: right ? 'right':'left', padding:'12px 16px',
    fontSize:11, fontWeight:700, color:'var(--ink-500)', letterSpacing:0.05,
    textTransform:'uppercase', whiteSpace:'nowrap'
  }}>{children}</th>;
}
function Td({ children, right, mono, dim, bold }) {
  return <td style={{
    padding:'14px 16px', textAlign: right ? 'right' : 'left',
    fontSize: 13, color: dim ? 'var(--ink-400)' : 'var(--ink-700)',
    fontFamily: mono ? "'JetBrains Mono', ui-monospace, monospace" : 'inherit',
    fontVariantNumeric:'tabular-nums', fontWeight: bold ? 700 : 500,
    verticalAlign:'top', whiteSpace: 'nowrap'
  }}>{children}</td>;
}

function FinanceBreakdown({ f, isReel }) {
  const { fmtEur } = DATA;
  return (
    <div style={{display:'grid', gridTemplateColumns:'2fr 1fr', gap:18}}>
      <div>
        <div className="eyebrow" style={{marginBottom:10}}>Détail des devis acceptés</div>
        <table style={{width:'100%', borderCollapse:'collapse', fontSize:12.5}}>
          <thead>
            <tr style={{color:'var(--ink-400)', fontWeight:600}}>
              <td style={{padding:'4px 8px'}}>Artisan</td>
              <td style={{padding:'4px 8px', textAlign:'right'}}>HT</td>
              <td style={{padding:'4px 8px', textAlign:'right'}}>%</td>
              <td style={{padding:'4px 8px', textAlign:'right'}}>Commission HT</td>
              <td style={{padding:'4px 8px', textAlign:'right'}}>Statut</td>
            </tr>
          </thead>
          <tbody>
            {f.d.devis.filter(dv => dv.statut === 'accepte').map(dv => (
              <tr key={dv.id} style={{borderTop:'1px solid var(--ink-200)'}}>
                <td style={{padding:'8px'}}>{dv.artisan.entreprise}</td>
                <td className="tnum" style={{padding:'8px', textAlign:'right'}}>{fmtEur(dv.montant_ht)}</td>
                <td className="tnum" style={{padding:'8px', textAlign:'right', color:'var(--ink-500)'}}>{dv.commission_pourcentage}%</td>
                <td className="tnum" style={{padding:'8px', textAlign:'right', fontWeight:700, color:'var(--brand-800)'}}>{fmtEur(dv.montant_ht * dv.commission_pourcentage/100)}</td>
                <td style={{padding:'8px', textAlign:'right'}}>
                  {isReel
                    ? <Badge tone="ok">Encaissé</Badge>
                    : <Badge tone="info">Engagé</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{padding:14, background:'#fff', borderRadius:10, border:'1px solid var(--ink-200)'}}>
        <div className="eyebrow" style={{marginBottom:10}}>Répartition</div>
        <div style={{display:'flex',flexDirection:'column',gap:8, fontSize:12.5}}>
          <Row label="Frais consultation HT" value={fmtEur(f.fraisHT)}/>
          <Row label="Commissions HT" value={fmtEur(f.commissionsHT)}/>
          <Row label="Royalties (-32%)" value={`-${fmtEur(f.royalties)}`} dim/>
          <div style={{height:1, background:'var(--ink-200)', margin:'4px 0'}}/>
          <Row label={isReel ? "Encaissé net" : "Prévi net"} value={fmtEur(isReel?f.reelNet:f.previsionnelNet)} bold/>
          <div style={{height:1, background:'var(--ink-200)', margin:'4px 0'}}/>
          <Row label={`Franchisée (${Math.round((1-f.partAgente)*100)}%)`} value={fmtEur(f.gainAdmin)}/>
          {f.partAgente > 0 && <Row label={`${f.d.referente.prenom} (${Math.round(f.partAgente*100)}%)`} value={fmtEur(f.gainAgente)} accent/>}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold, dim, accent }) {
  return <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
    <span style={{color: dim?'var(--ink-400)':'var(--ink-500)', fontSize:12}}>{label}</span>
    <span className="tnum" style={{
      fontWeight: bold ? 800 : 600,
      fontSize: bold ? 15 : 12.5,
      color: accent ? '#0078ad' : dim ? 'var(--ink-400)' : 'var(--ink-900)'
    }}>{value}</span>
  </div>;
}

window.Finances = Finances;
