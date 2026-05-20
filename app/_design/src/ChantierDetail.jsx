// Fiche chantier — page détail multi-onglets : reflète /chantiers/[id]/page.js

function ChantierDetail({ dossier, onBack }) {
  const d = dossier;
  const { fmtEur, fmtDate, nomClient, calcStatut, villeFromAddr, ARTISANS } = DATA;
  const [tab, setTab] = React.useState('apercu');

  const statut = calcStatut(d);
  const acceptes = d.devis.filter(dv => dv.statut === 'accepte');
  const ville = villeFromAddr(d.client.adresse);

  const tabs = [
    { key:'apercu',     label:'Aperçu',           icon:'Eye' },
    { key:'devis',      label:'Devis & artisans', icon:'Hammer', count:d.devis.length },
    { key:'planning',   label:'Planning',         icon:'Calendar', count:(DATA.RDV_DOSSIER[d.id]||[]).length },
    { key:'photos',     label:'Photos',           icon:'Camera',   count:(DATA.PHOTOS[d.id]||[]).length },
    { key:'cr',         label:'Comptes-rendus',   icon:'Doc',      count:(DATA.COMPTES_RENDUS[d.id]||[]).length },
    { key:'finance',    label:'Suivi financier',  icon:'Wallet' },
    { key:'documents',  label:'Documents',        icon:'Folder',   count:(DATA.DOCUMENTS[d.id]||[]).length },
    { key:'messages',   label:'Messages',         icon:'Message' },
  ];

  return (
    <div className="page-enter" style={{display:'flex',flexDirection:'column',gap:18, minHeight:0, flex:1}}>
      {/* Breadcrumb back */}
      <div style={{display:'flex',alignItems:'center',gap:10,fontSize:13, color:'var(--ink-500)'}}>
        <button onClick={onBack} className="btn btn-ghost" style={{padding:'4px 10px', fontSize:12}}>
          <I.ChevronLeft size={14}/> Tous les chantiers
        </button>
        <span style={{color:'var(--ink-300)'}}>/</span>
        <span className="mono" style={{color:'var(--brand-800)', fontWeight:700}}>{d.reference}</span>
        <span style={{color:'var(--ink-300)'}}>/</span>
        <span style={{color:'var(--ink-700)', fontWeight:600}}>{nomClient(d.client)}</span>
      </div>

      {/* Hero */}
      <div className="card" style={{padding:0, overflow:'hidden', position:'relative'}}>
        <div style={{
          position:'absolute', inset:0, pointerEvents:'none',
          background:'radial-gradient(circle at 100% 0%, rgba(0,148,212,0.10), transparent 50%), radial-gradient(circle at 0% 0%, rgba(0,87,142,0.04), transparent 40%)'
        }}/>
        <div style={{padding:'24px 28px', display:'flex', justifyContent:'space-between', gap:16, alignItems:'flex-start', position:'relative'}}>
          <div style={{minWidth:0, flex:1}}>
            <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:8}}>
              <span className="mono" style={{fontSize:13, color:'var(--brand-800)', fontWeight:800}}>{d.reference}</span>
              <TypoBadge typo={d.typologie}/>
              <StatutBadge statut={statut}/>
              {d.contrat_signe && (
                <span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:11.5,color:'#15803d',fontWeight:600}}>
                  <I.Check size={13}/> Contrat signé · {fmtDate(d.date_signature_contrat)}
                </span>
              )}
            </div>
            <h1 className="page" style={{fontSize:28, letterSpacing:-0.02, lineHeight:1.15}}>{nomClient(d.client)}</h1>
            <div style={{fontSize:13.5, color:'var(--ink-500)', marginTop:8, display:'flex', alignItems:'center', gap:6}}>
              <I.Pin3 size={14}/>{d.client.adresse}
            </div>
            {d.description && (
              <p style={{fontSize:13.5, color:'var(--ink-700)', marginTop:14, lineHeight:1.55, maxWidth:680, marginBottom:0}}>{d.description}</p>
            )}
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:8,alignItems:'flex-end'}}>
            <Avatar name={`${d.referente.prenom} ${d.referente.nom}`} color={d.referente.color} size={44} ring/>
            <div style={{textAlign:'right'}}>
              <div className="eyebrow" style={{textAlign:'right'}}>Référente</div>
              <div style={{fontSize:13, fontWeight:700, color:'var(--ink-900)', marginTop:2}}>{d.referente.prenom} {d.referente.nom}</div>
              <div style={{fontSize:11, color:'var(--ink-500)'}}>{d.referente.role === 'admin' ? 'Franchisée' : 'Agente'}</div>
            </div>
          </div>
        </div>

        {/* Action strip */}
        <div style={{padding:'14px 28px', borderTop:'1px solid var(--ink-100)', background:'var(--surface-2)', display:'flex',gap:8, flexWrap:'wrap'}}>
          <button className="btn btn-primary" style={{fontSize:12.5}}><I.Edit size={14}/> Modifier</button>
          <a href={`tel:${d.client.tel}`} className="btn btn-ghost" style={{fontSize:12.5}}><I.Phone size={14}/> {d.client.tel}</a>
          <a href={`mailto:${d.client.email}`} className="btn btn-ghost" style={{fontSize:12.5}}><I.Mail size={14}/> Email</a>
          <div style={{flex:1}}/>
          <button className="btn btn-ghost" style={{fontSize:12.5}}><I.Download size={14}/> Récapitulatif PDF</button>
          <button className="btn btn-ghost" style={{fontSize:12.5}}><I.Doc size={14}/> Dossier de fin</button>
          <button className="btn btn-ghost" style={{padding:'6px 8px'}}><I.More size={14}/></button>
        </div>
      </div>

      {/* KPI strip — chantier */}
      <div className="kpi-grid">
        <MiniKpi label="Montant chantier" value={d.montant_chantier_ttc > 0 ? fmtEur(d.montant_chantier_ttc) : '—'} sub="TTC tous devis" tone="brand"/>
        <MiniKpi label="Avancement" value={`${d.avancement}%`} sub={d.date_fin_chantier ? `Fin : ${fmtDate(d.date_fin_chantier)}` : 'Pas démarré'} tone="ok" progress={d.avancement}/>
        <MiniKpi label="Acomptes reçus" value={`${d.suivi.acomptes_recus}/${d.suivi.acomptes_total}`} sub={`${d.suivi.factures_payees}/${d.suivi.factures_total} factures soldées`} tone="info"/>
        <MiniKpi label="Frais consultation"
          value={d.frais_consultation > 0 ? fmtEur(d.frais_consultation) : '—'}
          sub={
            d.frais_statut === 'regle' ? '✓ Réglé' :
            d.frais_statut === 'offerts' ? 'Offerts' :
            '⚠ En attente'
          } tone={d.frais_statut === 'regle' ? 'ok' : 'warn'}/>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{overflowX:'auto'}}>
        {tabs.map(t => {
          const TabIcon = I[t.icon];
          return (
            <button key={t.key} className={`tab ${tab===t.key?'active':''}`} onClick={()=>setTab(t.key)}>
              <span style={{display:'inline-flex',alignItems:'center',gap:6}}>
                <TabIcon size={14}/> {t.label}
                {t.count != null && t.count > 0 && (
                  <span style={{
                    background: tab===t.key ? 'var(--brand-800)' : 'var(--ink-200)',
                    color: tab===t.key ? '#fff' : 'var(--ink-600)',
                    fontSize:10, fontWeight:700,
                    padding:'1px 6px', borderRadius:99
                  }}>{t.count}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div style={{minHeight:0, flex:1}}>
        {tab === 'apercu'    && <TabApercu d={d}/>}
        {tab === 'devis'     && <TabDevis d={d}/>}
        {tab === 'planning'  && <TabPlanningDossier d={d}/>}
        {tab === 'photos'    && <TabPhotos d={d}/>}
        {tab === 'cr'        && <TabCR d={d}/>}
        {tab === 'finance'   && <TabSuiviFin d={d}/>}
        {tab === 'documents' && <TabDocs d={d}/>}
        {tab === 'messages'  && <TabMessages d={d}/>}
      </div>
    </div>
  );
}

function MiniKpi({ label, value, sub, tone='brand', progress }) {
  return (
    <div className="card" style={{padding:'16px 18px', display:'flex',flexDirection:'column',gap:6}}>
      <div className="eyebrow">{label}</div>
      <div className="tnum" style={{fontSize:24, fontWeight:800, color:'var(--brand-800)', letterSpacing:-0.02, marginTop:2}}>{value}</div>
      {progress != null && <Progress value={progress} height={4}/>}
      {sub && <div style={{fontSize:11.5, color:'var(--ink-500)'}}>{sub}</div>}
    </div>
  );
}

// ─── APERÇU ────────────────────────────────────────────────────────
function TabApercu({ d }) {
  const { fmtEur, fmtDate, nomClient } = DATA;
  const acceptes = d.devis.filter(dv => dv.statut === 'accepte');
  const totalCom = acceptes.reduce((s, dv) => s + (dv.montant_ht * dv.commission_pourcentage/100), 0);
  const photos = (DATA.PHOTOS[d.id] || []).slice(0, 4);
  const cr = (DATA.COMPTES_RENDUS[d.id] || []).slice(0, 3);

  return (
    <div style={{display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:20}}>
      {/* LEFT */}
      <div style={{display:'flex',flexDirection:'column',gap:18}}>
        {/* Facts */}
        <div className="card" style={{padding:22}}>
          <h2 className="page" style={{fontSize:15, marginBottom:14}}>Informations clés</h2>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', rowGap:14, columnGap:18}}>
            <Fact label="Surface" value={d.surface ? `${d.surface} m²` : '—'}/>
            <Fact label="Montant chantier" value={d.montant_chantier_ttc > 0 ? fmtEur(d.montant_chantier_ttc) : '—'} highlight/>
            <Fact label="Démarrage" value={d.date_demarrage_chantier ? fmtDate(d.date_demarrage_chantier) : '—'}/>
            <Fact label="Fin prévue" value={d.date_fin_chantier ? fmtDate(d.date_fin_chantier) : '—'}/>
            <Fact label="Limite devis" value={d.date_limite_devis ? fmtDate(d.date_limite_devis) : '—'}/>
            <Fact label="Commissions prévues HT" value={fmtEur(totalCom)} highlight/>
          </div>
        </div>

        {/* Avancement */}
        {d.avancement > 0 && (
          <div className="card" style={{padding:22}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:10}}>
              <h2 className="page" style={{fontSize:15}}>Avancement chantier</h2>
              <span className="tnum" style={{fontSize:18, fontWeight:800, color:'var(--brand-800)'}}>{d.avancement}%</span>
            </div>
            <Progress value={d.avancement} height={10}/>
            <div style={{display:'grid', gridTemplateColumns:'repeat(5, 1fr)', marginTop:18, gap:10}}>
              {[
                { l:'Contact', done: true },
                { l:'Devis', done: d.devis.length > 0 },
                { l:'Signature', done: d.contrat_signe },
                { l:'Chantier', done: !!d.date_demarrage_chantier },
                { l:'Livraison', done: d.avancement >= 100 },
              ].map((s, i) => (
                <div key={i} style={{textAlign:'center'}}>
                  <div style={{
                    width:28, height:28, borderRadius:99, margin:'0 auto',
                    background: s.done ? 'var(--ok)' : 'var(--ink-100)',
                    color: s.done ? '#fff' : 'var(--ink-400)',
                    display:'grid', placeItems:'center'
                  }}>
                    {s.done ? <I.Check size={14}/> : i+1}
                  </div>
                  <div style={{fontSize:11, color:'var(--ink-500)', marginTop:6, fontWeight:600}}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Photos preview */}
        {photos.length > 0 && (
          <div className="card" style={{padding:22}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <h2 className="page" style={{fontSize:15}}>Photos récentes</h2>
              <span className="eyebrow">{DATA.PHOTOS[d.id].length} clichés</span>
            </div>
            <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:8}}>
              {photos.map(p => <PhotoTile key={p.id} photo={p}/>)}
            </div>
          </div>
        )}

        {/* Compte-rendus preview */}
        {cr.length > 0 && (
          <div className="card" style={{padding:22}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <h2 className="page" style={{fontSize:15}}>Derniers comptes-rendus</h2>
              <button className="btn btn-ghost" style={{padding:'4px 10px', fontSize:11.5}}><I.Sparkles size={12}/> Générer un CR avec l'IA</button>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {cr.map(c => <CRItem key={c.id} cr={c}/>)}
            </div>
          </div>
        )}
      </div>

      {/* RIGHT */}
      <div style={{display:'flex',flexDirection:'column',gap:18}}>
        {/* Artisans signés */}
        <div className="card" style={{padding:22}}>
          <h2 className="page" style={{fontSize:15, marginBottom:12}}>Artisans · {acceptes.length} signés</h2>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {acceptes.map(dv => (
              <div key={dv.id} style={{
                display:'grid', gridTemplateColumns:'auto 1fr auto', gap:10, alignItems:'center',
                padding:'10px 12px', borderRadius:10, border:'1px solid var(--ink-200)'
              }}>
                <div style={{width:32,height:32,borderRadius:8,background:'var(--brand-50)',color:'var(--brand-800)',display:'grid',placeItems:'center'}}>
                  <I.Hammer size={14}/>
                </div>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:12.5, fontWeight:600, color:'var(--ink-900)'}} className="clip-1">{dv.artisan.entreprise}</div>
                  <div style={{fontSize:11, color:'var(--ink-500)'}}>{dv.artisan.metier}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div className="tnum" style={{fontSize:12, fontWeight:700, color:'var(--ink-900)'}}>{fmtEur(dv.montant_ttc)}</div>
                  <div style={{fontSize:10, color:'var(--brand-800)', fontWeight:600, marginTop:1}}>{dv.commission_pourcentage}% com.</div>
                </div>
              </div>
            ))}
            {acceptes.length === 0 && <div style={{textAlign:'center', padding:24, color:'var(--ink-400)', fontSize:13}}>Aucun devis signé</div>}
          </div>
        </div>

        {/* Prochains RDV */}
        <ProchainsRdv d={d}/>

        {/* Contact rapide */}
        <div className="card" style={{padding:22}}>
          <h2 className="page" style={{fontSize:15, marginBottom:12}}>Contact</h2>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <ContactRow icon="Phone" label="Téléphone" value={d.client.tel} action={`tel:${d.client.tel}`}/>
            <ContactRow icon="Mail" label="Email" value={d.client.email} action={`mailto:${d.client.email}`}/>
            <ContactRow icon="Pin3" label="Adresse" value={d.client.adresse}/>
          </div>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value, highlight }) {
  return (
    <div>
      <div className="eyebrow" style={{marginBottom:4}}>{label}</div>
      <div className="tnum" style={{
        fontSize: highlight ? 18 : 13.5,
        fontWeight: highlight ? 800 : 600,
        color: highlight ? 'var(--brand-800)' : 'var(--ink-900)',
        letterSpacing: highlight ? -0.02 : 0
      }}>{value}</div>
    </div>
  );
}

function PhotoTile({ photo, large }) {
  // Gradient placeholder unique par id
  const seed = photo.id.charCodeAt(photo.id.length-1);
  const h1 = (seed * 47) % 360;
  const h2 = (h1 + 35) % 360;
  return (
    <div style={{
      aspectRatio: large ? '4/3' : '1/1', borderRadius:8, overflow:'hidden',
      background: `linear-gradient(135deg, hsl(${h1} 60% 65%), hsl(${h2} 55% 45%))`,
      position:'relative', cursor:'pointer'
    }}>
      <div style={{
        position:'absolute', inset:0, display:'flex', alignItems:'flex-end',
        padding:8, background:'linear-gradient(to bottom, transparent 50%, rgba(0,0,0,0.55))'
      }}>
        <span style={{color:'#fff', fontSize:10.5, fontWeight:600}}>{photo.tag}</span>
      </div>
      <span style={{
        position:'absolute', top:6, right:6,
        background:'rgba(0,0,0,0.4)', color:'#fff', fontSize:9, padding:'2px 6px', borderRadius:99, fontWeight:600, textTransform:'uppercase', letterSpacing:0.05
      }}>{photo.categorie}</span>
    </div>
  );
}

function CRItem({ cr }) {
  const { fmtDate } = DATA;
  const typeColor = { r1:'#0094d4', r2:'#16a34a', r3:'#f59e0b', suivi:'#94a3b8', reception:'#16a34a' }[cr.type] || '#94a3b8';
  const typeLabel = { r1:'R1', r2:'R2', r3:'R3', suivi:'Suivi', reception:'Réception' }[cr.type] || cr.type;
  return (
    <button style={{
      display:'grid', gridTemplateColumns:'auto 1fr', gap:12, alignItems:'flex-start',
      padding:'10px 12px', borderRadius:10, border:'1px solid var(--ink-200)',
      background:'none', textAlign:'left', cursor:'pointer', width:'100%'
    }} className="row-hover">
      <div style={{
        width:36, padding:'4px 0', borderRadius:6, background:typeColor, color:'#fff',
        textAlign:'center', fontSize:10, fontWeight:800, letterSpacing:0.05
      }}>{typeLabel}</div>
      <div style={{minWidth:0}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:8}}>
          <div style={{fontSize:13, fontWeight:700, color:'var(--ink-900)'}} className="clip-1">{cr.titre}</div>
          <span className="tnum" style={{fontSize:11, color:'var(--ink-400)', flexShrink:0}}>{fmtDate(cr.date)}</span>
        </div>
        <div style={{fontSize:12, color:'var(--ink-500)', marginTop:3, lineHeight:1.45}} className="clip-2">{cr.contenu}</div>
        {cr.valide && <span className="badge badge-ok" style={{marginTop:6, fontSize:10, padding:'2px 6px'}}><I.Check size={10}/> Visible client</span>}
      </div>
    </button>
  );
}

function ContactRow({ icon, label, value, action }) {
  const Ic = I[icon];
  const Inner = (
    <>
      <div style={{
        width:32, height:32, borderRadius:8, background:'var(--brand-50)', color:'var(--brand-800)',
        display:'grid', placeItems:'center', flex:'0 0 32px'
      }}><Ic size={14}/></div>
      <div style={{minWidth:0, flex:1}}>
        <div className="eyebrow">{label}</div>
        <div style={{fontSize:13, color:'var(--ink-900)', fontWeight:600, marginTop:2}} className="clip-1">{value}</div>
      </div>
    </>
  );
  const style = {display:'flex', gap:10, alignItems:'center', minWidth:0};
  return action ? <a href={action} style={{...style, color:'inherit'}}>{Inner}</a> : <div style={style}>{Inner}</div>;
}

function ProchainsRdv({ d }) {
  const { fmtDate } = DATA;
  const rdvs = (DATA.RDV_DOSSIER[d.id] || []).filter(r => new Date(r.date_heure) >= DATA.today).slice(0,3);
  return (
    <div className="card" style={{padding:22}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <h2 className="page" style={{fontSize:15}}>Prochains RDV</h2>
        <button className="btn btn-ghost" style={{padding:'4px 10px', fontSize:11.5}}><I.Plus size={12}/> Nouveau</button>
      </div>
      {rdvs.length === 0 ? (
        <div style={{textAlign:'center', padding:18, color:'var(--ink-400)', fontSize:13}}>Aucun RDV à venir</div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {rdvs.map(r => {
            const dt = new Date(r.date_heure);
            const day = dt.toLocaleDateString('fr-FR', { day:'2-digit' });
            const month = dt.toLocaleDateString('fr-FR', { month:'short' }).replace('.','');
            const time = dt.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
            const label = { r1:'R1 — Visite client', r2:'R2 — Visite artisan', r3:'R3 — Devis', suivi:'Suivi chantier' }[r.type];
            return (
              <div key={r.id} style={{display:'grid', gridTemplateColumns:'52px 1fr', gap:12, alignItems:'center'}}>
                <div style={{
                  background:'var(--brand-50)', borderRadius:8, padding:'8px 0',
                  textAlign:'center', border:'1px solid var(--ink-200)'
                }}>
                  <div className="tnum" style={{fontSize:18, fontWeight:800, color:'var(--brand-800)', lineHeight:1}}>{day}</div>
                  <div style={{fontSize:9.5, fontWeight:700, color:'var(--ink-500)', textTransform:'uppercase', marginTop:2}}>{month}</div>
                </div>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:13, fontWeight:600, color:'var(--ink-900)'}} className="clip-1">{label}</div>
                  <div style={{fontSize:11.5, color:'var(--ink-500)', marginTop:2}}>{time} · {r.duree}min{r.artisan ? ` · ${r.artisan.entreprise}` : ''}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── DEVIS & ARTISANS ──────────────────────────────────────────────
function TabDevis({ d }) {
  const { fmtEur, fmtDate } = DATA;
  const factures = DATA.FACTURES_ARTISAN[d.id] || [];
  const [showEdit, setShowEdit] = React.useState(false);

  return (
    <div style={{display:'flex',flexDirection:'column',gap:18}}>
      <div className="card" style={{padding:0, overflow:'hidden'}}>
        <div style={{padding:'14px 22px', display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid var(--ink-200)'}}>
          <div>
            <h2 className="page" style={{fontSize:16}}>Devis du chantier</h2>
            <div className="eyebrow" style={{marginTop:4}}>{d.devis.length} devis · {d.devis.filter(dv=>dv.statut==='accepte').length} signés</div>
          </div>
          <button className="btn btn-primary" style={{fontSize:12.5}} onClick={()=>setShowEdit(true)}><I.Plus size={14}/> Ajouter un devis</button>
        </div>
        {d.devis.length === 0 ? (
          <div style={{padding:40, textAlign:'center', color:'var(--ink-400)'}}>Aucun devis pour le moment</div>
        ) : (
          <div style={{display:'flex',flexDirection:'column'}}>
            {d.devis.map(dv => {
              const com = dv.montant_ht * dv.commission_pourcentage / 100;
              const fact = factures.filter(f => f.devis_id === dv.id);
              const acompte = fact.find(f => f.libelle.includes('Acompte'));
              const solde = fact.find(f => f.libelle.includes('Solde'));
              return (
                <div key={dv.id} style={{padding:'18px 22px', borderTop:'1px solid var(--ink-100)'}}>
                  <div style={{display:'grid', gridTemplateColumns:'auto 1fr auto auto', gap:14, alignItems:'flex-start'}}>
                    <div style={{
                      width:40, height:40, borderRadius:10, background:'var(--brand-50)',
                      color:'var(--brand-800)', display:'grid', placeItems:'center'
                    }}><I.Hammer size={18}/></div>
                    <div style={{minWidth:0}}>
                      <div style={{display:'flex', gap:8, alignItems:'center'}}>
                        <span style={{fontSize:14, fontWeight:700, color:'var(--ink-900)'}}>{dv.artisan.entreprise}</span>
                        <span style={{fontSize:11.5, color:'var(--ink-500)'}}>· {dv.artisan.metier}</span>
                      </div>
                      <div style={{display:'flex', gap:14, marginTop:6, fontSize:12, color:'var(--ink-500)', flexWrap:'wrap'}}>
                        <span><span className="tnum" style={{color:'var(--ink-700)', fontWeight:600}}>{fmtEur(dv.montant_ht)}</span> HT</span>
                        <span><span className="tnum" style={{color:'var(--ink-700)', fontWeight:600}}>{fmtEur(dv.montant_ttc)}</span> TTC</span>
                        <span><strong style={{color:'var(--brand-800)'}}>Com. {dv.commission_pourcentage}%</strong> → <span className="tnum">{fmtEur(com)}</span> HT</span>
                        {dv.date_signature && <span>Signé le {fmtDate(dv.date_signature)}</span>}
                      </div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      {dv.statut === 'accepte' && <Badge tone="ok">Signé</Badge>}
                      {dv.statut === 'refuse' && <Badge tone="bad">Refusé</Badge>}
                      {dv.statut === 'en_attente' && <Badge tone="warn">En attente</Badge>}
                    </div>
                    <div style={{display:'flex',gap:6}}>
                      <button className="btn btn-ghost" style={{padding:'4px 8px'}} title="PDF"><I.Doc size={13}/></button>
                      <button className="btn btn-ghost" style={{padding:'4px 8px'}} title="Modifier" onClick={()=>setShowEdit(true)}><I.Edit size={13}/></button>
                    </div>
                  </div>

                  {/* Acompte + solde (uniquement signés) */}
                  {dv.statut === 'accepte' && (
                    <div style={{marginTop:14, marginLeft:54, display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
                      <FactureLine title="Acompte 30%" f={acompte}/>
                      <FactureLine title="Solde" f={solde}/>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {showEdit && <EditDevisModal onClose={()=>setShowEdit(false)}/>}
    </div>
  );
}

function FactureLine({ title, f }) {
  const { fmtEur, fmtDate } = DATA;
  if (!f) return (
    <div style={{
      padding:'10px 12px', borderRadius:10, border:'1px dashed var(--ink-200)',
      fontSize:11.5, color:'var(--ink-400)'
    }}>
      {title} — <span style={{textDecoration:'underline', color:'var(--brand-800)', cursor:'pointer'}}>+ Ajouter</span>
    </div>
  );
  const toneCfg = {
    paye:       { tone:'ok',   label:'Payé' },
    en_attente: { tone:'warn', label:'En attente' },
    a_emettre:  { tone:'mute', label:'À émettre' },
  }[f.statut] || { tone:'mute', label:f.statut };
  return (
    <div style={{
      padding:'10px 12px', borderRadius:10, border:'1px solid var(--ink-200)',
      background:'#fff', display:'flex',justifyContent:'space-between',alignItems:'center', gap:8
    }}>
      <div style={{minWidth:0}}>
        <div style={{fontSize:12, fontWeight:600, color:'var(--ink-900)'}}>{title}</div>
        <div style={{fontSize:10.5, color:'var(--ink-500)', marginTop:2}}>
          {f.date ? `Réglé ${fmtDate(f.date)}` : 'Pas encore daté'}
        </div>
      </div>
      <div style={{textAlign:'right'}}>
        <div className="tnum" style={{fontSize:12.5, fontWeight:700, color:'var(--ink-900)'}}>{fmtEur(f.montant_ttc)}</div>
        <Badge tone={toneCfg.tone}>{toneCfg.label}</Badge>
      </div>
    </div>
  );
}

window.ChantierDetail = ChantierDetail;
