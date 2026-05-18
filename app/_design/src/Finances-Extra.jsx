// Finances — modules supplémentaires : Suivi (compte de résultat avec écart P/R) et Facturation agentes (F1/F2)

function SuiviFinView() {
  const { fmtEur, AGENTES, OBJECTIFS } = DATA;
  const [mode, setMode] = React.useState('agence'); // agence | ctp
  const [periode, setPeriode] = React.useState('mois');

  // Mock compte de résultat mois en cours (mai 2026)
  const lignes = [
    { l:'(+) Frais consultation',  p:2400, r:1850, kind:'produit' },
    { l:'(+) Commissions',         p:6800, r:4920, kind:'produit' },
    { l:'(+) Honoraires',          p:1900, r:1900, kind:'produit' },
    { l:'(+) Com. apporteurs',     p:0,    r:0,    kind:'produit' },
    ...(mode === 'ctp' ? [{ l:'(+) Redevances agentes', p:1080, r:1080, kind:'produit' }] : []),
    ...(mode === 'ctp' ? [
      { l:'(−) Royalties illiCO',   p:556,  r:391,  kind:'charge' },
      { l:'(−) Part agentes',       p:3400, r:2460, kind:'charge' },
      { l:'(−) Apporteurs remboursés', p:0, r:0, kind:'charge' },
    ] : []),
  ];

  const totalProduits = lignes.filter(l => l.kind === 'produit').reduce((s,l) => ({ p: s.p+l.p, r: s.r+l.r }), { p:0, r:0 });
  const totalCharges = lignes.filter(l => l.kind === 'charge').reduce((s,l) => ({ p: s.p+l.p, r: s.r+l.r }), { p:0, r:0 });
  const netP = totalProduits.p - totalCharges.p;
  const netR = totalProduits.r - totalCharges.r;

  const Ecart = ({ p, r }) => {
    const e = r - p;
    return <span style={{fontSize:11.5, fontWeight:600, color: e >= 0 ? '#15803d' : '#b91c1c'}} className="tnum">{e >= 0 ? '+' : ''}{fmtEur(e)}</span>;
  };

  const objectif = OBJECTIFS.find(o => o.cible === 'agence')?.montant || 145000;
  const reelAnnee = 89400;
  const pct = Math.round(reelAnnee / objectif * 100);

  return (
    <div style={{display:'flex',flexDirection:'column',gap:18}}>
      {/* Toggle Agence/CTP */}
      <div className="card" style={{padding:'12px 16px', display:'flex', gap:12, alignItems:'center', flexWrap:'wrap'}}>
        <div style={{display:'flex',gap:4, background:'var(--ink-100)', padding:3, borderRadius:9}}>
          {[
            { k:'agence', l:'Agence — Encaissements bruts' },
            { k:'ctp',    l:'CTP — Résultat net (charges incluses)' },
          ].map(p => (
            <button key={p.k} onClick={()=>setMode(p.k)} style={{
              padding:'6px 14px', fontSize:12.5, fontWeight:600, borderRadius:7,
              background: mode === p.k ? '#fff' : 'transparent',
              color: mode === p.k ? 'var(--brand-800)' : 'var(--ink-500)',
              boxShadow: mode === p.k ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              cursor:'pointer', border:0
            }}>{p.l}</button>
          ))}
        </div>
        <div style={{flex:1}}/>
        <select className="input" value={periode} onChange={e=>setPeriode(e.target.value)} style={{height:34, minWidth:160}}>
          <option value="mois">Par mois</option>
          <option value="annee">Par année</option>
        </select>
      </div>

      {/* Objectif annuel */}
      <div className="card" style={{padding:'18px 22px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10, gap:14}}>
          <div>
            <div className="eyebrow">Objectif CA {mode === 'ctp' ? 'CTP (résultat net)' : 'Agence'} 2026</div>
            <div style={{display:'flex',alignItems:'baseline',gap:10, marginTop:6}}>
              <div className="tnum" style={{fontSize:28, fontWeight:800, color:'var(--brand-800)', letterSpacing:-0.02}}>{fmtEur(reelAnnee)}</div>
              <div style={{fontSize:14, color:'var(--ink-500)'}}>/ <span className="tnum" style={{fontWeight:600, color:'var(--ink-700)'}}>{fmtEur(objectif)}</span></div>
              <div className="tnum" style={{fontSize:14, fontWeight:700, color: pct >= 70 ? '#15803d' : pct >= 40 ? '#a16207' : '#b91c1c'}}>{pct}%</div>
            </div>
          </div>
          <button className="btn btn-ghost" style={{fontSize:12}}><I.Edit size={13}/> Modifier l'objectif</button>
        </div>
        <Progress value={pct} height={10}/>
      </div>

      {/* Compte de résultat */}
      <div className="card" style={{padding:0, overflow:'hidden'}}>
        <div style={{padding:'14px 22px', borderBottom:'1px solid var(--ink-200)'}}>
          <h2 className="page" style={{fontSize:15}}>Compte de résultat — {mode === 'ctp' ? 'CTP' : 'Agence'} · mai 2026</h2>
          <div className="eyebrow" style={{marginTop:4}}>Prévisionnel vs Réel encaissé</div>
        </div>
        <table style={{width:'100%', borderCollapse:'collapse', fontSize:13}}>
          <thead>
            <tr style={{background:'var(--surface-2)'}}>
              <th style={{textAlign:'left', padding:'10px 16px', fontSize:11, fontWeight:700, color:'var(--ink-500)', textTransform:'uppercase'}}>Ligne</th>
              <th style={{textAlign:'right', padding:'10px 16px', fontSize:11, fontWeight:700, color:'var(--ink-500)', textTransform:'uppercase'}}>Prévi</th>
              <th style={{textAlign:'right', padding:'10px 16px', fontSize:11, fontWeight:700, color:'var(--ink-500)', textTransform:'uppercase'}}>Réel</th>
              <th style={{textAlign:'right', padding:'10px 16px', fontSize:11, fontWeight:700, color:'var(--ink-500)', textTransform:'uppercase'}}>Écart</th>
            </tr>
          </thead>
          <tbody>
            <tr><td colSpan="4" style={{padding:'6px 16px', fontSize:10, fontWeight:700, color:'var(--ink-400)', textTransform:'uppercase', background:'#fafbfd'}}>Gains</td></tr>
            {lignes.filter(l => l.kind === 'produit').map((l,i) => (
              <tr key={i} style={{borderTop:'1px solid var(--ink-100)'}}>
                <td style={{padding:'10px 16px', color:'var(--ink-700)'}}>{l.l}</td>
                <td style={{padding:'10px 16px', textAlign:'right', color:'var(--ink-500)'}} className="tnum">{fmtEur(l.p)}</td>
                <td style={{padding:'10px 16px', textAlign:'right', fontWeight:600, color:'#15803d'}} className="tnum">{fmtEur(l.r)}</td>
                <td style={{padding:'10px 16px', textAlign:'right'}}><Ecart p={l.p} r={l.r}/></td>
              </tr>
            ))}
            <tr style={{background:'var(--surface-2)', borderTop:'1px solid var(--ink-200)'}}>
              <td style={{padding:'10px 16px', fontWeight:700, color:'var(--ink-900)'}}>= Total gains</td>
              <td style={{padding:'10px 16px', textAlign:'right', fontWeight:700}} className="tnum">{fmtEur(totalProduits.p)}</td>
              <td style={{padding:'10px 16px', textAlign:'right', fontWeight:700, color:'#15803d'}} className="tnum">{fmtEur(totalProduits.r)}</td>
              <td style={{padding:'10px 16px', textAlign:'right'}}><Ecart p={totalProduits.p} r={totalProduits.r}/></td>
            </tr>
            {mode === 'ctp' && (
              <>
                <tr><td colSpan="4" style={{padding:'6px 16px', fontSize:10, fontWeight:700, color:'var(--ink-400)', textTransform:'uppercase', background:'#fafbfd'}}>Charges</td></tr>
                {lignes.filter(l => l.kind === 'charge').map((l,i) => (
                  <tr key={'c'+i} style={{borderTop:'1px solid var(--ink-100)'}}>
                    <td style={{padding:'10px 16px', color:'var(--ink-700)'}}>{l.l}</td>
                    <td style={{padding:'10px 16px', textAlign:'right', color:'var(--ink-500)'}} className="tnum">{fmtEur(l.p)}</td>
                    <td style={{padding:'10px 16px', textAlign:'right', fontWeight:600, color:'#b91c1c'}} className="tnum">{fmtEur(l.r)}</td>
                    <td style={{padding:'10px 16px', textAlign:'right'}}><Ecart p={l.p} r={l.r}/></td>
                  </tr>
                ))}
                <tr style={{background:'var(--surface-2)', borderTop:'1px solid var(--ink-200)'}}>
                  <td style={{padding:'10px 16px', fontWeight:700, color:'var(--ink-900)'}}>= Total charges</td>
                  <td style={{padding:'10px 16px', textAlign:'right', fontWeight:700}} className="tnum">{fmtEur(totalCharges.p)}</td>
                  <td style={{padding:'10px 16px', textAlign:'right', fontWeight:700, color:'#b91c1c'}} className="tnum">{fmtEur(totalCharges.r)}</td>
                  <td style={{padding:'10px 16px', textAlign:'right'}}><Ecart p={totalCharges.p} r={totalCharges.r}/></td>
                </tr>
              </>
            )}
            <tr style={{background:'rgba(0,148,212,0.08)', borderTop:'2px solid var(--brand-500)'}}>
              <td style={{padding:'14px 16px', fontSize:14, fontWeight:800, color:'var(--brand-800)'}}>= {mode === 'ctp' ? 'Résultat net CTP' : 'Total encaissé agence'}</td>
              <td style={{padding:'14px 16px', textAlign:'right', fontSize:14, fontWeight:800, color:'var(--ink-700)'}} className="tnum">{fmtEur(netP)}</td>
              <td style={{padding:'14px 16px', textAlign:'right', fontSize:14, fontWeight:800, color:'var(--brand-800)'}} className="tnum">{fmtEur(netR)}</td>
              <td style={{padding:'14px 16px', textAlign:'right'}}><Ecart p={netP} r={netR}/></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Mini timeline mensuelle */}
      <div className="card" style={{padding:22}}>
        <h2 className="page" style={{fontSize:15, marginBottom:14}}>Évolution mensuelle · réel encaissé</h2>
        <FinChart mode={mode}/>
      </div>
    </div>
  );
}

function FinChart({ mode }) {
  const months = ['Jan','Fév','Mar','Avr','Mai'];
  const reel = [8200, 11400, 18900, 16700, 14820];
  const charges = mode === 'ctp' ? [3200, 4500, 7200, 6300, 5400] : [0,0,0,0,0];
  const net = reel.map((r,i) => r - charges[i]);
  const max = Math.max(...reel) * 1.15;
  const W = 600, H = 200;
  const stepX = (W - 80) / (months.length - 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%', height:240}}>
      {[0,0.25,0.5,0.75,1].map(p => (
        <line key={p} x1="40" x2={W-30} y1={20+(H-50)*(1-p)} y2={20+(H-50)*(1-p)} stroke="#e2e8f0" strokeDasharray={p>0?'2 4':''}/>
      ))}
      {reel.map((v,i) => {
        const x = 40 + stepX*i;
        const h = (H-50) * (v / max);
        return (
          <g key={i}>
            <rect x={x-16} y={H-30-h} width={32} height={h} fill="#0094d4" rx={3}/>
            {mode === 'ctp' && (
              <rect x={x-16} y={H-30-h} width={32} height={(H-50)*(charges[i]/max)} fill="rgba(220,38,38,0.5)" rx={3}/>
            )}
            <text x={x} y={H-30-h-6} textAnchor="middle" fontSize="10" fontWeight="700" fill="#00578e">{Math.round(v/1000)}k</text>
            <text x={x} y={H-10} textAnchor="middle" fontSize="11" fill="#64748b">{months[i]}</text>
          </g>
        );
      })}
      {/* Net line */}
      <path d={net.map((v,i)=>`${i===0?'M':'L'} ${40+stepX*i},${20+(H-50)*(1-v/max)}`).join(' ')}
        fill="none" stroke="#00578e" strokeWidth="2.5" strokeDasharray="4 3"/>
      {net.map((v,i) => (
        <circle key={'n'+i} cx={40+stepX*i} cy={20+(H-50)*(1-v/max)} r="4" fill="#00578e"/>
      ))}
    </svg>
  );
}

// ─── FACTURATION AGENTES ────────────────────────────────────────────
function FacturationAgentes() {
  const { fmtEur, AGENTES, FACTURES_AGENTE, REDEVANCES } = DATA;
  const [agente, setAgente] = React.useState(AGENTES.find(a => a.role === 'agente')?.id || 'a2');

  const ag = AGENTES.find(a => a.id === agente);
  const factures = FACTURES_AGENTE.filter(f => f.agente === agente);
  const redev = REDEVANCES.filter(r => r.agente === agente);

  const totalF1 = factures.filter(f => f.type === 'agente_vers_ctp').reduce((s,f) => s + f.montant, 0);
  const totalF1Paye = factures.filter(f => f.type === 'agente_vers_ctp' && f.statut === 'paye').reduce((s,f) => s + f.montant, 0);
  const totalF2 = factures.filter(f => f.type === 'ctp_vers_agente').reduce((s,f) => s + f.montant, 0);
  const totalF2Paye = factures.filter(f => f.type === 'ctp_vers_agente' && f.statut === 'paye').reduce((s,f) => s + f.montant, 0);
  const totalRedev = redev.filter(r => r.statut === 'regle').reduce((s,r) => s + r.montant_ttc, 0);
  const net = totalF1 - totalF2;

  const months = [...new Set(factures.map(f => `${f.annee}-${String(f.mois).padStart(2,'0')}`))].sort((a,b) => b.localeCompare(a));
  const MOIS = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sept','Oct','Nov','Déc'];

  return (
    <div style={{display:'flex',flexDirection:'column',gap:18}}>
      {/* Sélecteur agente */}
      <div className="card" style={{padding:'14px 18px', display:'flex', gap:12, alignItems:'center', flexWrap:'wrap'}}>
        <div className="eyebrow">Agente :</div>
        <div style={{display:'flex',gap:6}}>
          {AGENTES.filter(a => a.role === 'agente').map(a => (
            <button key={a.id} onClick={()=>setAgente(a.id)} style={{
              display:'inline-flex',alignItems:'center',gap:6, padding:'6px 12px', borderRadius:99,
              border:'1px solid', borderColor: agente === a.id ? 'var(--brand-500)' : 'var(--ink-200)',
              background: agente === a.id ? 'var(--brand-50)' : '#fff',
              color: agente === a.id ? 'var(--brand-800)' : 'var(--ink-700)',
              fontSize:12, fontWeight:600, cursor:'pointer'
            }}>
              <Avatar name={`${a.prenom} ${a.nom}`} color={a.color} size={20}/>
              {a.prenom} {a.nom}
            </button>
          ))}
        </div>
      </div>

      {/* KPI strip */}
      <div className="kpi-grid">
        <KpiCard label="F1 — Gains à facturer" value={fmtEur(totalF1)} sub={`Payé ${fmtEur(totalF1Paye)} · Reste ${fmtEur(totalF1 - totalF1Paye)}`} icon={<I.TrendUp size={20}/>} tone="ok"/>
        <KpiCard label="F2 — Redevances + apporteur" value={fmtEur(totalF2)} sub={`Payé ${fmtEur(totalF2Paye)}`} icon={<I.TrendDown size={20}/>} tone="warn"/>
        <KpiCard label="Redevances réglées" value={fmtEur(totalRedev)} sub={`${redev.filter(r=>r.statut==='regle').length} mois · 540 €/mois`} icon={<I.Coins size={20}/>} tone="brand"/>
        <KpiCard label="Net à virer à l'agente" value={fmtEur(net)} sub={net >= 0 ? "F1 − F2" : "L'agente doit à CTP"} icon={<I.Wallet size={20}/>} tone="brand"/>
      </div>

      {/* Tableau facturation mensuelle */}
      <div className="card" style={{padding:0, overflow:'hidden'}}>
        <div style={{padding:'14px 22px', borderBottom:'1px solid var(--ink-200)', display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <h2 className="page" style={{fontSize:15}}>Facturation mensuelle · {ag?.prenom} {ag?.nom}</h2>
            <div className="eyebrow" style={{marginTop:4}}>F1 = facture émise par l'agente · F2 = facture émise par la franchisée</div>
          </div>
          <button className="btn btn-ghost" style={{fontSize:12}}><I.Download size={14}/> CSV</button>
        </div>

        <table style={{width:'100%', borderCollapse:'collapse', fontSize:13}}>
          <thead style={{background:'var(--surface-2)'}}>
            <tr>
              <th style={{padding:'12px 16px', textAlign:'left', fontSize:11, fontWeight:700, color:'var(--ink-500)', textTransform:'uppercase'}}>Mois</th>
              <th style={{padding:'12px 16px', textAlign:'right', fontSize:11, fontWeight:700, color:'var(--ink-500)', textTransform:'uppercase'}}>F1 (Agente → CTP)</th>
              <th style={{padding:'12px 16px', textAlign:'center', fontSize:11, fontWeight:700, color:'var(--ink-500)', textTransform:'uppercase'}}>Statut F1</th>
              <th style={{padding:'12px 16px', textAlign:'right', fontSize:11, fontWeight:700, color:'var(--ink-500)', textTransform:'uppercase'}}>F2 (CTP → Agente)</th>
              <th style={{padding:'12px 16px', textAlign:'center', fontSize:11, fontWeight:700, color:'var(--ink-500)', textTransform:'uppercase'}}>Statut F2</th>
              <th style={{padding:'12px 16px', textAlign:'right', fontSize:11, fontWeight:700, color:'var(--ink-500)', textTransform:'uppercase'}}>Net</th>
            </tr>
          </thead>
          <tbody>
            {months.map(key => {
              const [a, m] = key.split('-');
              const f1 = factures.find(f => f.type === 'agente_vers_ctp' && f.mois === parseInt(m) && f.annee === parseInt(a));
              const f2 = factures.find(f => f.type === 'ctp_vers_agente' && f.mois === parseInt(m) && f.annee === parseInt(a));
              const f1m = f1?.montant || 0;
              const f2m = f2?.montant || 0;
              const n = f1m - f2m;
              return (
                <tr key={key} style={{borderTop:'1px solid var(--ink-100)'}} className="row-hover">
                  <td style={{padding:'14px 16px', fontWeight:700, color:'var(--ink-900)'}}>{MOIS[parseInt(m)-1]} {a}</td>
                  <td style={{padding:'14px 16px', textAlign:'right', fontWeight:600, color: f1m > 0 ? '#15803d' : 'var(--ink-300)'}} className="tnum">
                    {f1m > 0 ? fmtEur(f1m) : '—'}
                  </td>
                  <td style={{padding:'14px 16px', textAlign:'center'}}>
                    <StatutFacture f={f1}/>
                  </td>
                  <td style={{padding:'14px 16px', textAlign:'right', fontWeight:600, color: f2m > 0 ? '#b91c1c' : 'var(--ink-300)'}} className="tnum">
                    {f2m > 0 ? fmtEur(f2m) : '—'}
                  </td>
                  <td style={{padding:'14px 16px', textAlign:'center'}}>
                    <StatutFacture f={f2}/>
                  </td>
                  <td style={{padding:'14px 16px', textAlign:'right', fontWeight:800, color: n >= 0 ? 'var(--brand-800)' : '#b91c1c'}} className="tnum">
                    {n >= 0 ? '+' : ''}{fmtEur(n)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{borderTop:'2px solid var(--ink-200)', background:'var(--surface-2)'}}>
              <td style={{padding:'14px 16px', fontWeight:800, color:'var(--ink-900)'}}>Total</td>
              <td style={{padding:'14px 16px', textAlign:'right', fontWeight:800, color:'#15803d'}} className="tnum">{fmtEur(totalF1)}</td>
              <td style={{padding:'14px 16px', textAlign:'center', fontSize:11, color:'var(--ink-400)'}}>{fmtEur(totalF1Paye)} payé</td>
              <td style={{padding:'14px 16px', textAlign:'right', fontWeight:800, color:'#b91c1c'}} className="tnum">{fmtEur(totalF2)}</td>
              <td style={{padding:'14px 16px', textAlign:'center', fontSize:11, color:'var(--ink-400)'}}>{fmtEur(totalF2Paye)} payé</td>
              <td style={{padding:'14px 16px', textAlign:'right', fontWeight:800, color: net >= 0 ? 'var(--brand-800)' : '#b91c1c', fontSize:15}} className="tnum">
                {net >= 0 ? '+' : ''}{fmtEur(net)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Détail factures avec upload PDF */}
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:18}}>
        <FactureDetailCard
          title="F1 — Factures émises par l'agente"
          subtitle="L'agente facture CTP pour ses gains du mois (frais + commissions + honoraires)"
          factures={factures.filter(f => f.type === 'agente_vers_ctp')}
          accent="#16a34a"
        />
        <FactureDetailCard
          title="F2 — Factures émises par la franchisée"
          subtitle="CTP facture l'agente pour la redevance + apporteur remboursé"
          factures={factures.filter(f => f.type === 'ctp_vers_agente')}
          accent="#dc2626"
        />
      </div>

      {/* Redevances */}
      <div className="card" style={{padding:22}}>
        <h2 className="page" style={{fontSize:15, marginBottom:14}}>Redevances mensuelles · 540 € TTC</h2>
        <div style={{display:'grid', gridTemplateColumns:'repeat(12, 1fr)', gap:6}}>
          {MOIS.map((m, i) => {
            const r = redev.find(rv => rv.mois === i+1 && rv.annee === 2026);
            const isPast = i+1 <= 5; // mois courants 2026
            return (
              <div key={m} style={{
                padding:'10px 6px', textAlign:'center', borderRadius:8,
                background: r?.statut === 'regle' ? 'rgba(22,163,74,0.10)' : isPast ? 'rgba(245,158,11,0.13)' : 'var(--ink-50)',
                border:'1px solid', borderColor: r?.statut === 'regle' ? 'rgba(22,163,74,0.2)' : isPast ? 'rgba(245,158,11,0.3)' : 'var(--ink-200)'
              }}>
                <div style={{fontSize:10, fontWeight:700, color:'var(--ink-500)', textTransform:'uppercase'}}>{m}</div>
                <div style={{
                  marginTop:6, fontSize:11.5, fontWeight:700,
                  color: r?.statut === 'regle' ? '#15803d' : isPast ? '#a16207' : 'var(--ink-300)'
                }}>
                  {r?.statut === 'regle' ? '✓' : isPast ? '⌛' : '—'}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{marginTop:14, fontSize:12.5, color:'var(--ink-500)'}}>
          {redev.filter(r => r.statut === 'regle').length} mois réglés ·
          <span className="tnum" style={{fontWeight:700, color:'var(--brand-800)', marginLeft:6}}>{fmtEur(totalRedev)}</span> sur l'année
        </div>
      </div>
    </div>
  );
}

function FactureDetailCard({ title, subtitle, factures, accent }) {
  const { fmtEur } = DATA;
  const MOIS = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sept','Oct','Nov','Déc'];

  return (
    <div className="card" style={{padding:0, overflow:'hidden'}}>
      <div style={{padding:'14px 18px', borderBottom:'1px solid var(--ink-200)', borderLeft:`4px solid ${accent}`}}>
        <h3 style={{fontSize:14, fontWeight:700, color:'var(--ink-900)', margin:0}}>{title}</h3>
        <div style={{fontSize:11.5, color:'var(--ink-500)', marginTop:4, lineHeight:1.4}}>{subtitle}</div>
      </div>
      <div>
        {factures.map(f => (
          <div key={f.id} style={{
            display:'grid', gridTemplateColumns:'1fr auto auto', gap:12, alignItems:'center',
            padding:'12px 18px', borderTop:'1px solid var(--ink-100)'
          }}>
            <div>
              <div style={{fontSize:13, fontWeight:600, color:'var(--ink-900)'}}>{MOIS[f.mois-1]} {f.annee}</div>
              <div style={{fontSize:11, color:'var(--ink-500)', marginTop:2}}>
                {f.fichier
                  ? <span style={{display:'inline-flex',alignItems:'center',gap:4}}><I.Doc size={11}/> {f.fichier}</span>
                  : <span style={{color:'var(--ink-400)'}}>Pas de PDF déposé</span>}
              </div>
            </div>
            <div className="tnum" style={{fontWeight:700, color: 'var(--ink-900)'}}>{fmtEur(f.montant)}</div>
            <div style={{display:'flex',gap:6}}>
              <StatutFacture f={f}/>
              {!f.fichier && <button className="btn btn-ghost" style={{fontSize:11, padding:'4px 8px'}}><I.Upload size={11}/> PDF</button>}
              {f.fichier && <button className="btn btn-ghost" style={{padding:'4px 8px'}}><I.Eye size={11}/></button>}
            </div>
          </div>
        ))}
        {factures.length === 0 && <div style={{padding:24, textAlign:'center', color:'var(--ink-400)', fontSize:13}}>Aucune facture</div>}
      </div>
    </div>
  );
}

function StatutFacture({ f }) {
  if (!f) return <span style={{fontSize:11, color:'var(--ink-300)'}}>—</span>;
  const cfg = {
    paye:        { tone:'ok',   label:'✓ Payé' },
    facture:     { tone:'info', label:'Facturé' },
    a_facturer:  { tone:'warn', label:'À facturer' },
  }[f.statut] || { tone:'mute', label: f.statut };
  return <Badge tone={cfg.tone}>{cfg.label}</Badge>;
}

Object.assign(window, { SuiviFinView, FacturationAgentes });
