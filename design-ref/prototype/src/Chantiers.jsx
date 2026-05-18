// Chantiers — 2-column list/detail layout with filters

function Chantiers({ initialId, onClearInitial }) {
  const { DOSSIERS, calcStatut, fmtEur, nomClient, fmtDate, AGENTES } = DATA;
  const [scope, setScope] = React.useState('moi');         // moi | <agente-id> | tous
  const [statut, setStatut] = React.useState('tous');
  const [typo, setTypo] = React.useState('tous');
  const [q, setQ] = React.useState('');
  const [selectedId, setSelectedId] = React.useState(initialId || DOSSIERS[0].id);

  React.useEffect(() => {
    if (initialId) { setSelectedId(initialId); onClearInitial && onClearInitial(); }
  }, [initialId]);

  const scoped = React.useMemo(() => {
    return DOSSIERS.filter(d => {
      if (scope === 'tous') return true;
      if (scope === 'moi') return d.referente.role === 'admin';
      return d.referente.id === scope;
    });
  }, [scope]);

  const filtered = React.useMemo(() => {
    return scoped.filter(d => {
      const s = calcStatut(d);
      if (statut !== 'tous' && s !== statut) return false;
      if (typo !== 'tous' && d.typologie !== typo) return false;
      if (q) {
        const hay = `${d.reference} ${nomClient(d.client)} ${d.client.adresse}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [scoped, statut, typo, q]);

  const counts = {
    aTraiter:   scoped.filter(d => ['a_contacter','a_relancer'].includes(calcStatut(d))).length,
    enDevis:    scoped.filter(d => ['devis_en_attente','devis_a_modifier'].includes(calcStatut(d))).length,
    enChantier: scoped.filter(d => calcStatut(d) === 'en_cours_chantier').length,
    termines:   scoped.filter(d => calcStatut(d) === 'termine').length,
  };

  const selected = filtered.find(d => d.id === selectedId) || filtered[0];

  React.useEffect(() => {
    // if current selection has been filtered out, reset
    if (!filtered.find(d => d.id === selectedId) && filtered[0]) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  const scopeTabs = [
    { key:'moi', label:'Mes chantiers' },
    ...AGENTES.filter(a => a.role==='agente').map(a => ({ key:a.id, label:`Chantiers ${a.prenom}` })),
    { key:'tous', label:'Tous' },
  ];

  return (
    <div className="page-enter" style={{display:'flex',flexDirection:'column',gap:18, minHeight:0, flex:1}}>
      {/* Header row */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',gap:16,flexWrap:'wrap'}}>
        <div>
          <div className="eyebrow" style={{marginBottom:4}}>Pilotage</div>
          <h1 className="page">Chantiers</h1>
          <div style={{color:'var(--ink-500)', fontSize:13, marginTop:6}}>{filtered.length} dossiers · {counts.enChantier} actifs · {counts.enDevis} en devis</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-ghost"><I.Doc size={16}/> Exporter</button>
          <button className="btn btn-primary"><I.Plus size={16}/> Nouveau chantier</button>
        </div>
      </div>

      {/* Scope tabs */}
      <div className="tabs">
        {scopeTabs.map(t => (
          <button key={t.key} className={`tab ${scope===t.key?'active':''}`} onClick={()=>setScope(t.key)}>{t.label}</button>
        ))}
      </div>

      {/* KPI strip */}
      <div className="kpi-grid">
        {[
          { label:'À traiter', value: counts.aTraiter, tone:'info' },
          { label:'En devis', value: counts.enDevis, tone:'warn' },
          { label:'En chantier', value: counts.enChantier, tone:'ok' },
          { label:'Terminés', value: counts.termines, tone:'mute' },
        ].map(k => (
          <div key={k.label} className="card" style={{padding:'14px 18px', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
            <div>
              <div className="eyebrow">{k.label}</div>
              <div className="tnum" style={{fontSize:28, fontWeight:800, color:'var(--brand-800)', marginTop:4, letterSpacing:-0.02}}>{k.value}</div>
            </div>
            <span style={{
              width:36,height:36,borderRadius:10,
              background: k.tone==='ok'?'rgba(22,163,74,0.10)':k.tone==='warn'?'rgba(245,158,11,0.13)':k.tone==='info'?'rgba(0,148,212,0.12)':'rgba(148,163,184,0.15)',
              color:    k.tone==='ok'?'#15803d':k.tone==='warn'?'#a16207':k.tone==='info'?'#0078ad':'#475569',
              display:'grid', placeItems:'center'
            }}>
              <I.Folder size={18}/>
            </span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card" style={{padding:'14px 16px', display:'flex', gap:10, flexWrap:'wrap', alignItems:'center'}}>
        <div style={{position:'relative', flex:1, minWidth:240}}>
          <span style={{position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'var(--ink-400)'}}><I.Search size={16}/></span>
          <input className="input" placeholder="Rechercher référence, client, adresse…" value={q} onChange={e=>setQ(e.target.value)} style={{paddingLeft:36, width:'100%', height:40}}/>
        </div>
        <select className="input" value={statut} onChange={e=>setStatut(e.target.value)} style={{height:40, minWidth:170}}>
          <option value="tous">Tous les statuts</option>
          {Object.entries(DATA.STATUT).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="input" value={typo} onChange={e=>setTypo(e.target.value)} style={{height:40, minWidth:160}}>
          <option value="tous">Toutes typologies</option>
          {Object.entries(DATA.TYPOLOGIES).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="btn btn-ghost" style={{height:40}}><I.Filter size={14}/> Plus de filtres</button>
      </div>

      {/* 2-col list / detail */}
      <div className="grid-list" style={{flex:1, minHeight:0}}>
        <ChantiersList items={filtered} selectedId={selected?.id} onSelect={setSelectedId}/>
        {selected ? <ChantierDetail d={selected}/> : <EmptyDetail/>}
      </div>
    </div>
  );
}

function ChantiersList({ items, selectedId, onSelect }) {
  const { calcStatut, fmtEur, nomClient, fmtDate, today } = DATA;
  return (
    <div className="card" style={{padding:0, overflow:'hidden', display:'flex',flexDirection:'column',minHeight:0}}>
      <div style={{padding:'12px 18px', display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid var(--ink-200)'}}>
        <div className="eyebrow">{items.length} résultats</div>
        <div style={{display:'flex',gap:6,fontSize:11,color:'var(--ink-500)'}}>
          Tri : <strong style={{color:'var(--ink-700)'}}>Plus récent</strong>
          <I.ChevronDown size={12}/>
        </div>
      </div>
      <div style={{overflow:'auto', flex:1, padding:'8px 12px'}}>
        {items.length === 0 && <div style={{padding:40, textAlign:'center', color:'var(--ink-400)'}}>Aucun dossier</div>}
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          {items.map(d => {
            const s = calcStatut(d);
            const limite = d.date_limite_devis ? new Date(d.date_limite_devis) : null;
            const diff = limite ? Math.round((limite - today) / 86400000) : null;
            const urgent = diff !== null && diff <= 7 && diff >= 0;
            const enRetard = diff !== null && diff < 0 && !['termine','annule'].includes(s);
            const isSel = d.id === selectedId;
            return (
              <button key={d.id} onClick={()=>onSelect(d.id)} style={{
                textAlign:'left', padding:'14px 14px', borderRadius:12,
                border:'1px solid', borderColor: isSel ? 'var(--brand-500)' : 'transparent',
                background: isSel ? 'var(--brand-50)' : 'transparent',
                boxShadow: isSel ? '0 0 0 3px rgba(0,148,212,0.10)' : 'none',
                transition:'all 150ms ease', position:'relative'
              }} className={!isSel ? 'row-hover' : ''}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:10}}>
                  <div style={{minWidth:0, flex:1}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:2}}>
                      <span className="mono" style={{fontSize:11.5, color:'var(--brand-800)', fontWeight:700, letterSpacing:0.02}}>{d.reference}</span>
                      <TypoBadge typo={d.typologie}/>
                    </div>
                    <div style={{fontSize:15, fontWeight:700, color:'var(--ink-900)', letterSpacing:-0.01}} className="clip-1">{nomClient(d.client)}</div>
                    <div style={{fontSize:12, color:'var(--ink-500)', marginTop:3}} className="clip-1">
                      <I.Pin3 size={12} className="" /> {DATA.villeFromAddr(d.client.adresse)}
                    </div>
                  </div>
                  <StatutBadge statut={s}/>
                </div>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:12,gap:10}}>
                  <div style={{display:'flex',gap:14,alignItems:'center'}}>
                    {limite ? (
                      <MiniMeta icon={<I.Clock size={12}/>} mute={!urgent && !enRetard}>
                        <span style={{color: enRetard ? '#b91c1c' : urgent ? '#a16207' : undefined, fontWeight: enRetard||urgent ? 700 : 500}}>
                          {enRetard ? `retard ${Math.abs(diff)}j` : urgent ? `J-${diff}` : fmtDate(d.date_limite_devis)}
                        </span>
                      </MiniMeta>
                    ) : d.date_fin_chantier ? (
                      <MiniMeta icon={<I.Calendar size={12}/>}>Fin {fmtDate(d.date_fin_chantier)}</MiniMeta>
                    ) : null}
                    {d.montant_chantier_ttc > 0 && (
                      <MiniMeta icon={<I.Euro size={12}/>}><span className="tnum" style={{fontWeight:600,color:'var(--ink-700)'}}>{fmtEur(d.montant_chantier_ttc)}</span></MiniMeta>
                    )}
                  </div>
                  <Avatar name={`${d.referente.prenom} ${d.referente.nom}`} color={d.referente.color} size={24}/>
                </div>
                {d.avancement > 0 && (
                  <div style={{marginTop:10}}>
                    <Progress value={d.avancement} height={4}/>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ChantierDetail({ d }) {
  const { calcStatut, fmtEur, nomClient, fmtDate, ARTISANS } = DATA;
  const s = calcStatut(d);
  const cfg = DATA.STATUT[s];
  const ville = DATA.villeFromAddr(d.client.adresse);

  const devisAcceptes = d.devis.filter(dv => dv.statut === 'accepte');
  const totalCom = devisAcceptes.reduce((sum, dv) => sum + (dv.montant_ht * dv.commission_pourcentage/100), 0);

  return (
    <div className="card" style={{padding:0, overflow:'hidden', display:'flex', flexDirection:'column', minHeight:0}}>
      {/* Header */}
      <div style={{padding:'18px 22px 16px', borderBottom:'1px solid var(--ink-200)', position:'relative'}}>
        <div style={{position:'absolute', top:0, right:0, width:160, height:80, background:`linear-gradient(135deg, rgba(0,148,212,0.10), rgba(0,148,212,0))`, pointerEvents:'none', borderRadius:'0 var(--radius) 0 100%'}}/>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12}}>
          <div style={{minWidth:0, flex:1}}>
            <div style={{display:'flex',gap:8,alignItems:'center', marginBottom:6}}>
              <span className="mono" style={{fontSize:12, color:'var(--brand-800)', fontWeight:700}}>{d.reference}</span>
              <TypoBadge typo={d.typologie}/>
            </div>
            <h2 className="page" style={{fontSize:22, letterSpacing:-0.02}}>{nomClient(d.client)}</h2>
            <div style={{fontSize:13, color:'var(--ink-500)', marginTop:6, display:'flex', alignItems:'center', gap:6}}>
              <I.Pin3 size={13}/>{d.client.adresse}
            </div>
          </div>
          <StatutBadge statut={s}/>
        </div>
        <div style={{display:'flex',gap:8,marginTop:14}}>
          <button className="btn btn-primary" style={{fontSize:12, padding:'6px 12px'}}><I.Eye size={14}/> Ouvrir dossier</button>
          <button className="btn btn-ghost" style={{fontSize:12, padding:'6px 12px'}}><I.Phone size={14}/> Appeler</button>
          <button className="btn btn-ghost" style={{fontSize:12, padding:'6px 12px'}}><I.Mail size={14}/> Email</button>
          <button className="btn btn-ghost" style={{fontSize:12, padding:'6px 8px', marginLeft:'auto'}}><I.More size={14}/></button>
        </div>
      </div>

      {/* Body scroll */}
      <div style={{flex:1, overflow:'auto', padding:'18px 22px', display:'flex',flexDirection:'column',gap:22}}>
        {/* Quick facts */}
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
          <FactRow label="Surface" value={`${d.surface || '—'} m²`}/>
          <FactRow label="Montant chantier" value={d.montant_chantier_ttc > 0 ? fmtEur(d.montant_chantier_ttc) : '—'} highlight/>
          <FactRow label="Contrat signé" value={d.contrat_signe ? <span style={{color:'#15803d',fontWeight:600,display:'inline-flex',gap:5,alignItems:'center'}}><I.Check size={14}/> {fmtDate(d.date_signature_contrat)}</span> : <span style={{color:'#b91c1c'}}>Non signé</span>}/>
          <FactRow label="Référente" value={<span style={{display:'inline-flex',gap:6,alignItems:'center'}}><Avatar name={`${d.referente.prenom} ${d.referente.nom}`} color={d.referente.color} size={20}/> {d.referente.prenom} {d.referente.nom}</span>}/>
        </div>

        {/* Description */}
        <div>
          <div className="eyebrow" style={{marginBottom:6}}>Descriptif</div>
          <p style={{fontSize:13.5, color:'var(--ink-700)', lineHeight:1.55, margin:0}}>{d.description}</p>
        </div>

        {/* Avancement */}
        {d.avancement > 0 && (
          <div>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
              <div className="eyebrow">Avancement</div>
              <span className="tnum" style={{fontSize:13, fontWeight:700, color:'var(--brand-800)'}}>{d.avancement}%</span>
            </div>
            <Progress value={d.avancement} height={8}/>
            <div style={{display:'flex',justifyContent:'space-between', marginTop:8, fontSize:11.5, color:'var(--ink-500)'}}>
              <span>Démarrage : <span style={{color:'var(--ink-700)',fontWeight:600}}>{fmtDate(d.date_demarrage_chantier)}</span></span>
              <span>Fin prévue : <span style={{color:'var(--ink-700)',fontWeight:600}}>{fmtDate(d.date_fin_chantier)}</span></span>
            </div>
          </div>
        )}

        {/* Artisans */}
        {d.devis.length > 0 && (
          <div>
            <div className="eyebrow" style={{marginBottom:10}}>Artisans · {devisAcceptes.length} signés</div>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {d.devis.map(dv => (
                <div key={dv.id} style={{
                  display:'grid', gridTemplateColumns:'auto 1fr auto', gap:12, alignItems:'center',
                  padding:'10px 12px', borderRadius:10, border:'1px solid var(--ink-200)'
                }}>
                  <div style={{
                    width:34,height:34,borderRadius:8,background:'var(--brand-50)',color:'var(--brand-800)',
                    display:'grid',placeItems:'center'
                  }}><I.Hammer size={16}/></div>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:13, fontWeight:600, color:'var(--ink-900)'}} className="clip-1">{dv.artisan.entreprise}</div>
                    <div style={{fontSize:11, color:'var(--ink-500)', marginTop:1}}>{dv.artisan.metier} · {dv.artisan.ville}</div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div className="tnum" style={{fontSize:13, fontWeight:700, color:'var(--ink-900)'}}>{fmtEur(dv.montant_ttc)}</div>
                    <div style={{marginTop:3}}>
                      {dv.statut==='accepte' && <Badge tone="ok">Signé</Badge>}
                      {dv.statut==='refuse'  && <Badge tone="bad">Refusé</Badge>}
                      {dv.statut==='en_attente' && <Badge tone="warn">En attente</Badge>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Suivi finance summary */}
        {d.suivi.acomptes_total > 0 && (
          <div style={{
            background:'var(--surface-2)', border:'1px solid var(--ink-200)', borderRadius:12, padding:16
          }}>
            <div className="eyebrow" style={{marginBottom:10}}>Suivi financier</div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
              <div>
                <div style={{fontSize:11, color:'var(--ink-500)', marginBottom:4}}>Acomptes reçus</div>
                <div className="tnum" style={{fontSize:18, fontWeight:700, color:'var(--ink-900)'}}>{d.suivi.acomptes_recus} / {d.suivi.acomptes_total}</div>
                <div style={{marginTop:6}}>
                  <Progress value={d.suivi.acomptes_recus/d.suivi.acomptes_total*100} height={4}/>
                </div>
              </div>
              <div>
                <div style={{fontSize:11, color:'var(--ink-500)', marginBottom:4}}>Factures payées</div>
                <div className="tnum" style={{fontSize:18, fontWeight:700, color:'var(--ink-900)'}}>{d.suivi.factures_payees} / {d.suivi.factures_total}</div>
                <div style={{marginTop:6}}>
                  <Progress value={d.suivi.factures_payees/d.suivi.factures_total*100} height={4}/>
                </div>
              </div>
              <div>
                <div style={{fontSize:11, color:'var(--ink-500)', marginBottom:4}}>Frais consultation</div>
                <div style={{fontSize:14, fontWeight:600, color:'var(--ink-700)'}}>
                  {d.frais_consultation > 0 ? <>
                    <span className="tnum">{fmtEur(d.frais_consultation)}</span>{' '}
                    {d.frais_statut==='regle' && <Badge tone="ok">Réglé</Badge>}
                    {d.frais_statut==='en_attente' && <Badge tone="warn">En attente</Badge>}
                    {d.frais_statut==='offerts' && <Badge tone="mute">Offerts</Badge>}
                  </> : '—'}
                </div>
              </div>
              <div>
                <div style={{fontSize:11, color:'var(--ink-500)', marginBottom:4}}>Commissions prévues</div>
                <div className="tnum" style={{fontSize:14, fontWeight:600, color:'var(--brand-800)'}}>{fmtEur(totalCom)} HT</div>
              </div>
            </div>
          </div>
        )}

        {/* Contact */}
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
          <FactRow label="Téléphone" value={<span style={{display:'inline-flex',alignItems:'center',gap:6}}><I.Phone size={13}/>{d.client.tel}</span>} mono/>
          <FactRow label="Email" value={<span style={{display:'inline-flex',alignItems:'center',gap:6}}><I.Mail size={13}/>{d.client.email}</span>}/>
        </div>
      </div>
    </div>
  );
}

function FactRow({ label, value, highlight, mono }) {
  return (
    <div style={{display:'flex',flexDirection:'column', minWidth:0}}>
      <div className="eyebrow" style={{marginBottom:4}}>{label}</div>
      <div className={mono ? 'mono':''} style={{
        fontSize: highlight ? 18 : 13.5, fontWeight: highlight ? 800 : 600,
        color: highlight ? 'var(--brand-800)' : 'var(--ink-900)',
        letterSpacing: highlight ? -0.02 : 0
      }} className="clip-1">{value}</div>
    </div>
  );
}

function EmptyDetail() {
  return <div className="card" style={{padding:40, display:'grid', placeItems:'center', textAlign:'center', color:'var(--ink-400)'}}>
    <div>
      <I.Folder size={36}/>
      <div style={{marginTop:10}}>Sélectionne un dossier pour voir l'aperçu</div>
    </div>
  </div>;
}

window.Chantiers = Chantiers;
