// Fiche chantier — onglets secondaires (Planning, Photos, CR, Finance, Documents, Messages)

function TabPlanningDossier({ d }) {
  const { fmtDate } = DATA;
  const rdvs = DATA.RDV_DOSSIER[d.id] || [];
  const interventions = DATA.INTERVENTIONS[d.id] || [];
  const [showRdv, setShowRdv] = React.useState(false);

  return (
    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:18}}>
      {/* RDV */}
      <div className="card" style={{padding:0, overflow:'hidden'}}>
        <div style={{padding:'14px 22px', display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid var(--ink-200)'}}>
          <div>
            <h2 className="page" style={{fontSize:15}}>Rendez-vous</h2>
            <div className="eyebrow" style={{marginTop:4}}>{rdvs.length} RDV planifiés</div>
          </div>
          <button className="btn btn-primary" style={{fontSize:12.5}} onClick={()=>setShowRdv(true)}><I.Plus size={14}/> Nouveau RDV</button>
        </div>
        <div style={{padding:'10px 16px'}}>
          {rdvs.map(r => {
            const dt = new Date(r.date_heure);
            const isPast = dt < DATA.today;
            const day = dt.toLocaleDateString('fr-FR', { day:'2-digit' });
            const month = dt.toLocaleDateString('fr-FR', { month:'short' }).replace('.','');
            const time = dt.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
            const cfg = {
              r1:{ label:'R1 — Visite client',  color:'#0094d4' },
              r2:{ label:'R2 — Visite artisan', color:'#16a34a' },
              r3:{ label:'R3 — Présentation devis', color:'#f59e0b' },
              suivi:{ label:'Suivi chantier',    color:'#94a3b8' },
              reception:{ label:'Réception',     color:'#16a34a' },
            }[r.type] || { label:r.type, color:'#94a3b8' };
            return (
              <div key={r.id} style={{
                display:'grid', gridTemplateColumns:'56px 4px 1fr auto', gap:14,
                padding:'12px 0', borderBottom:'1px solid var(--ink-100)', alignItems:'center',
                opacity: isPast ? 0.55 : 1
              }}>
                <div style={{textAlign:'center'}}>
                  <div className="tnum" style={{fontSize:18, fontWeight:800, color:'var(--ink-900)', lineHeight:1}}>{day}</div>
                  <div style={{fontSize:9.5, fontWeight:700, color:'var(--ink-500)', textTransform:'uppercase', marginTop:2}}>{month}</div>
                </div>
                <div style={{width:4, alignSelf:'stretch', borderRadius:99, background: cfg.color}}/>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:13, fontWeight:600, color:'var(--ink-900)'}}>{cfg.label}</div>
                  <div style={{fontSize:11.5, color:'var(--ink-500)', marginTop:2}}>
                    {time} · {r.duree}min{r.artisan ? ` · ${r.artisan.entreprise}` : ''}
                    {r.notes && ` · ${r.notes}`}
                  </div>
                </div>
                <div style={{display:'flex',gap:4}}>
                  <button className="btn btn-ghost" style={{padding:'4px 6px'}}><I.Edit size={12}/></button>
                  <button className="btn btn-ghost" style={{padding:'4px 6px'}}><I.Trash size={12}/></button>
                </div>
              </div>
            );
          })}
          {rdvs.length === 0 && <div style={{padding:30, textAlign:'center', color:'var(--ink-400)', fontSize:13}}>Aucun rendez-vous</div>}
        </div>
      </div>

      {/* Interventions */}
      <div className="card" style={{padding:0, overflow:'hidden'}}>
        <div style={{padding:'14px 22px', display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid var(--ink-200)'}}>
          <div>
            <h2 className="page" style={{fontSize:15}}>Interventions artisans</h2>
            <div className="eyebrow" style={{marginTop:4}}>{interventions.length} planifiées</div>
          </div>
          <button className="btn btn-primary" style={{fontSize:12.5}}><I.Plus size={14}/> Planifier</button>
        </div>
        <div style={{padding:'10px 16px'}}>
          {interventions.map(it => (
            <div key={it.id} style={{
              display:'grid', gridTemplateColumns:'auto 1fr auto', gap:12,
              padding:'12px 0', borderBottom:'1px solid var(--ink-100)', alignItems:'center'
            }}>
              <div style={{
                width:36, height:36, borderRadius:8, background:'var(--brand-50)',
                color:'var(--brand-800)', display:'grid', placeItems:'center'
              }}><I.Hammer size={16}/></div>
              <div style={{minWidth:0}}>
                <div style={{fontSize:13, fontWeight:700, color:'var(--ink-900)'}}>{it.artisan.entreprise}</div>
                <div style={{fontSize:11.5, color:'var(--ink-500)', marginTop:2}}>
                  {it.type === 'periode'
                    ? `Du ${fmtDate(it.debut)} au ${fmtDate(it.fin)}`
                    : `${(it.jours || []).length} jours spécifiques`
                  } {it.notes && `· ${it.notes}`}
                </div>
              </div>
              <Badge tone="info">Planifié</Badge>
            </div>
          ))}
          {interventions.length === 0 && <div style={{padding:30, textAlign:'center', color:'var(--ink-400)', fontSize:13}}>Aucune intervention planifiée</div>}
        </div>
      </div>
      {showRdv && <EditRdvModal onClose={()=>setShowRdv(false)}/>}
    </div>
  );
}

// ─── PHOTOS ─────────────────────────────────────────────────────────
function TabPhotos({ d }) {
  const photos = DATA.PHOTOS[d.id] || [];
  const [filter, setFilter] = React.useState('all');
  const cats = [
    { k:'all', l:'Toutes', n:photos.length },
    { k:'avant', l:'Avant', n:photos.filter(p=>p.categorie==='avant').length },
    { k:'pendant', l:'Pendant', n:photos.filter(p=>p.categorie==='pendant').length },
    { k:'apres', l:'Après', n:photos.filter(p=>p.categorie==='apres').length },
    { k:'maquette', l:'Maquette', n:photos.filter(p=>p.categorie==='maquette').length },
  ];
  const filtered = filter === 'all' ? photos : photos.filter(p => p.categorie === filter);

  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div className="card" style={{padding:'14px 18px', display:'flex',justifyContent:'space-between',alignItems:'center',gap:12, flexWrap:'wrap'}}>
        <div style={{display:'flex',gap:6, alignItems:'center'}}>
          {cats.map(c => (
            <button key={c.k} onClick={()=>setFilter(c.k)} style={{
              padding:'6px 12px', borderRadius:99, fontSize:12, fontWeight:600,
              border:'1px solid', borderColor: filter===c.k ? 'var(--brand-500)' : 'var(--ink-200)',
              background: filter===c.k ? 'var(--brand-50)' : '#fff',
              color: filter===c.k ? 'var(--brand-800)' : 'var(--ink-700)',
              cursor:'pointer'
            }}>{c.l} <span style={{opacity:0.6}}>· {c.n}</span></button>
          ))}
        </div>
        <button className="btn btn-primary"><I.Upload size={14}/> Ajouter des photos</button>
      </div>

      {filtered.length === 0 ? (
        <div className="card" style={{padding:60, textAlign:'center', color:'var(--ink-400)'}}>
          <I.Camera size={36}/>
          <div style={{marginTop:12}}>Aucune photo dans cette catégorie</div>
        </div>
      ) : (
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))', gap:14}}>
          {filtered.map(p => <PhotoTile key={p.id} photo={p} large/>)}
        </div>
      )}
    </div>
  );
}

// ─── COMPTES-RENDUS ────────────────────────────────────────────────
function TabCR({ d }) {
  const cr = DATA.COMPTES_RENDUS[d.id] || [];
  const { fmtDate } = DATA;
  const [showWizard, setShowWizard] = React.useState(false);

  return (
    <div style={{display:'grid', gridTemplateColumns:'1fr 320px', gap:18}}>
      <div className="card" style={{padding:0, overflow:'hidden'}}>
        <div style={{padding:'14px 22px', display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid var(--ink-200)'}}>
          <div>
            <h2 className="page" style={{fontSize:15}}>Comptes-rendus de visite</h2>
            <div className="eyebrow" style={{marginTop:4}}>{cr.length} CR · les CR validés sont visibles dans l'espace client</div>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button className="btn btn-ghost" style={{fontSize:12.5}}><I.Plus size={14}/> CR manuel</button>
            <button className="btn btn-primary" style={{fontSize:12.5}} onClick={()=>setShowWizard(true)}><I.Sparkles size={14}/> Générer avec l'IA</button>
          </div>
        </div>
        <div style={{padding:'14px 22px', display:'flex',flexDirection:'column',gap:14}}>
          {cr.length === 0 && <div style={{padding:30, textAlign:'center', color:'var(--ink-400)', fontSize:13}}>Aucun compte-rendu</div>}
          {cr.map(c => {
            const typeColor = { r1:'#0094d4', r2:'#16a34a', r3:'#f59e0b', suivi:'#94a3b8', reception:'#16a34a' }[c.type] || '#94a3b8';
            const typeLabel = { r1:'R1', r2:'R2', r3:'R3', suivi:'Suivi', reception:'Réception' }[c.type] || c.type;
            return (
              <div key={c.id} style={{
                padding:16, border:'1px solid var(--ink-200)', borderRadius:12,
                background:'#fff', position:'relative'
              }}>
                <div style={{display:'flex',gap:10, alignItems:'center', marginBottom:10}}>
                  <span style={{
                    padding:'2px 8px', borderRadius:6, fontSize:11, fontWeight:800,
                    background:typeColor, color:'#fff', letterSpacing:0.04
                  }}>{typeLabel}</span>
                  <span style={{fontSize:13.5, fontWeight:700, color:'var(--ink-900)'}}>{c.titre}</span>
                  <div style={{flex:1}}/>
                  {c.valide && <Badge tone="ok">✓ Visible client</Badge>}
                  <span className="tnum" style={{fontSize:11.5, color:'var(--ink-400)'}}>{fmtDate(c.date)}</span>
                </div>
                <p style={{fontSize:13, color:'var(--ink-700)', lineHeight:1.55, margin:0}}>{c.contenu}</p>
                <div style={{display:'flex',gap:8, marginTop:12, paddingTop:10, borderTop:'1px solid var(--ink-100)', fontSize:11, color:'var(--ink-500)'}}>
                  <span>Par <strong style={{color:'var(--ink-700)'}}>{c.auteur}</strong></span>
                  <div style={{flex:1}}/>
                  <button className="btn btn-ghost" style={{padding:'3px 8px', fontSize:11}}><I.Edit size={11}/> Éditer</button>
                  <button className="btn btn-ghost" style={{padding:'3px 8px', fontSize:11}}><I.Download size={11}/> PDF</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Side : "Comment fonctionne l'IA" */}
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        <div className="card" style={{padding:18, background:'linear-gradient(135deg, rgba(0,148,212,0.06), rgba(0,87,142,0.02))'}}>
          <div style={{display:'flex',alignItems:'center',gap:8, marginBottom:10}}>
            <div style={{
              width:32, height:32, borderRadius:8, background:'var(--brand-500)', color:'#fff',
              display:'grid', placeItems:'center'
            }}><I.Sparkles size={16}/></div>
            <span style={{fontSize:14, fontWeight:700, color:'var(--ink-900)'}}>CR généré par IA</span>
          </div>
          <ol style={{paddingLeft:20, fontSize:12.5, color:'var(--ink-700)', lineHeight:1.6, margin:0}}>
            <li>Configure (type, date, intervenants)</li>
            <li>Dépose tes notes + photos + vocal</li>
            <li>Relis et valide le rendu structuré</li>
          </ol>
          <button className="btn btn-primary" style={{marginTop:14, width:'100%'}} onClick={()=>setShowWizard(true)}><I.Sparkles size={14}/> Démarrer</button>
        </div>

        <div className="card" style={{padding:18}}>
          <div className="eyebrow" style={{marginBottom:10}}>Documents joignables au CR</div>
          <div style={{display:'flex',flexDirection:'column',gap:8, fontSize:12.5, color:'var(--ink-700)'}}>
            {(DATA.DOCUMENTS[d.id] || []).slice(0,4).map(doc => (
              <label key={doc.id} style={{display:'flex',alignItems:'center',gap:8, cursor:'pointer'}}>
                <input type="checkbox" style={{accentColor:'var(--brand-500)'}}/>
                <I.Doc size={12}/>
                <span className="clip-1">{doc.nom}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
      {showWizard && <CRWizardModal onClose={()=>setShowWizard(false)}/>}
    </div>
  );
}

// ─── SUIVI FINANCIER (dans la fiche) ───────────────────────────────
function TabSuiviFin({ d }) {
  const { fmtEur, fmtDate } = DATA;
  const suivi = DATA.SUIVI_FIN[d.id] || [];
  const acceptes = d.devis.filter(dv => dv.statut === 'accepte');

  // Calculs
  const tauxRoyalties = 0.05;
  const tva = 1.2;
  const fraisHT = d.frais_consultation / tva;
  const fraisRoyalties = fraisHT * tauxRoyalties;
  const fraisNet = fraisHT - fraisRoyalties;
  const comHT = acceptes.reduce((s, dv) => s + (dv.montant_ht * dv.commission_pourcentage/100), 0);
  const comRoyalties = comHT * tauxRoyalties;
  const comNet = comHT - comRoyalties;
  const partAgente = d.referente.role === 'admin' ? 0 : 0.5;
  const totalNet = fraisNet + comNet;
  const gainAgente = totalNet * partAgente;
  const gainAdmin = totalNet * (1 - partAgente);

  return (
    <div style={{display:'flex',flexDirection:'column',gap:18}}>
      {/* Récap gains */}
      <div className="kpi-grid">
        <MiniKpi label="Frais consult. HT" value={fmtEur(fraisHT)} sub={`net ${fmtEur(fraisNet)}`} tone="brand"/>
        <MiniKpi label="Commissions HT" value={fmtEur(comHT)} sub={`net ${fmtEur(comNet)}`} tone="ok"/>
        <MiniKpi label="Royalties (5%)" value={fmtEur(fraisRoyalties + comRoyalties)} sub="prélevées par illiCO France" tone="warn"/>
        <MiniKpi
          label={d.referente.role === 'admin' ? "Net franchisée" : "Net total"}
          value={fmtEur(totalNet)}
          sub={partAgente > 0 ? `Agente ${fmtEur(gainAgente)} · CTP ${fmtEur(gainAdmin)}` : 'tout pour la franchisée'}
          tone="brand"
        />
      </div>

      {/* Échéances */}
      <div className="card" style={{padding:0, overflow:'hidden'}}>
        <div style={{padding:'14px 22px', borderBottom:'1px solid var(--ink-200)'}}>
          <h2 className="page" style={{fontSize:15}}>Échéances · suivi financier</h2>
          <div className="eyebrow" style={{marginTop:4}}>Coche au fur et à mesure des règlements et déclenchements illiCO</div>
        </div>
        <div style={{padding:'14px 22px', display:'flex',flexDirection:'column',gap:12}}>
          {/* Frais consultation */}
          <EcheanceRow
            label="Frais de consultation"
            sub={`${fmtEur(d.frais_consultation)} TTC`}
            statut={d.frais_statut}
            date={d.date_signature_contrat}
          />
          {acceptes.map(dv => {
            const sf = suivi.find(s => s.type === 'acompte_artisan' && s.artisan_id === dv.artisan.id);
            return (
              <React.Fragment key={dv.id}>
                <EcheanceRow
                  label={`Acompte client — ${dv.artisan.entreprise}`}
                  sub={`30% acompte · ${fmtEur(dv.montant_ttc * 0.3)} TTC`}
                  statut={sf?.statut_client || 'en_attente'}
                  date={sf?.date}
                />
                <EcheanceRow
                  label="illiCO France — acompte débloqué"
                  sub={`Commission ${fmtEur(dv.montant_ht * dv.commission_pourcentage/100)} HT`}
                  statut={sf?.statut_illico === 'recu' ? 'regle' : 'en_attente'}
                  date={null}
                  variant="illico"
                />
              </React.Fragment>
            );
          })}
          {d.typologie === 'amo' && (
            <EcheanceRow
              label="Honoraires AMO — solde"
              sub="9% travaux HT"
              statut={suivi.find(s=>s.type==='solde_amo')?.statut_client || 'en_attente'}
              date={d.date_fin_chantier}
            />
          )}
          <EcheanceRow
            label="Honoraires courtage"
            sub="6% travaux HT"
            statut={suivi.find(s=>s.type==='honoraires_courtage')?.statut_client || 'en_attente'}
            date={d.date_signature_contrat}
          />
        </div>
      </div>
    </div>
  );
}

function EcheanceRow({ label, sub, statut, date, variant }) {
  const { fmtDate } = DATA;
  const isRegle = statut === 'regle' || statut === 'recu';
  const isIllico = variant === 'illico';
  return (
    <div style={{
      display:'grid', gridTemplateColumns:'auto 1fr auto auto', gap:14, alignItems:'center',
      padding:'10px 14px', borderRadius:10, border:'1px solid var(--ink-200)',
      background: isRegle ? 'rgba(22,163,74,0.05)' : '#fff'
    }}>
      <label style={{display:'flex',alignItems:'center',gap:8, cursor:'pointer'}}>
        <input type="checkbox" checked={isRegle} readOnly style={{accentColor: isIllico ? '#6366f1' : 'var(--brand-500)', width:18, height:18}}/>
      </label>
      <div>
        <div style={{fontSize:13, fontWeight:600, color: isIllico ? '#4f46e5' : 'var(--ink-900)'}}>{label}</div>
        <div style={{fontSize:11.5, color:'var(--ink-500)', marginTop:2}}>{sub}</div>
      </div>
      <div style={{textAlign:'right', minWidth:80}}>
        {isRegle
          ? <Badge tone="ok">✓ Réglé</Badge>
          : <Badge tone="warn">En attente</Badge>}
      </div>
      <div className="tnum" style={{fontSize:11.5, color:'var(--ink-400)', minWidth:60, textAlign:'right'}}>
        {date ? fmtDate(date) : '—'}
      </div>
    </div>
  );
}

// ─── DOCUMENTS ─────────────────────────────────────────────────────
function TabDocs({ d }) {
  const docs = DATA.DOCUMENTS[d.id] || [];
  const { fmtDate } = DATA;
  const typeIcon = { contrat:'Shield', devis:'Doc', plan:'Building', archive:'Folder' };
  const typeColor = { contrat:'#16a34a', devis:'#0094d4', plan:'#7c3aed', archive:'#94a3b8' };
  const fmtSize = (ko) => ko < 1024 ? `${ko} Ko` : `${(ko/1024).toFixed(1)} Mo`;

  return (
    <div className="card" style={{padding:0, overflow:'hidden'}}>
      <div style={{padding:'14px 22px', display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid var(--ink-200)'}}>
        <div>
          <h2 className="page" style={{fontSize:15}}>Documents du chantier</h2>
          <div className="eyebrow" style={{marginTop:4}}>{docs.length} fichiers · {fmtSize(docs.reduce((s,x)=>s+x.ko,0))}</div>
        </div>
        <button className="btn btn-primary" style={{fontSize:12.5}}><I.Upload size={14}/> Ajouter un document</button>
      </div>
      {docs.length === 0 ? (
        <div style={{padding:40, textAlign:'center', color:'var(--ink-400)'}}>Aucun document</div>
      ) : (
        <div style={{padding:'10px 16px'}}>
          {docs.map(doc => {
            const Icon = I[typeIcon[doc.type] || 'Doc'];
            return (
              <div key={doc.id} style={{
                display:'grid', gridTemplateColumns:'auto 1fr auto auto auto', gap:14, alignItems:'center',
                padding:'12px 8px', borderBottom:'1px solid var(--ink-100)'
              }} className="row-hover">
                <div style={{
                  width:36, height:36, borderRadius:8,
                  background: `${typeColor[doc.type]}1a`, color: typeColor[doc.type],
                  display:'grid', placeItems:'center'
                }}><Icon size={16}/></div>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:13, fontWeight:600, color:'var(--ink-900)'}} className="clip-1">{doc.nom}</div>
                  <div style={{fontSize:11, color:'var(--ink-500)', marginTop:2, textTransform:'uppercase', letterSpacing:0.04}}>{doc.type}</div>
                </div>
                <div className="tnum" style={{fontSize:11.5, color:'var(--ink-500)'}}>{fmtSize(doc.ko)}</div>
                <div className="tnum" style={{fontSize:11.5, color:'var(--ink-500)'}}>{fmtDate(doc.date)}</div>
                <div style={{display:'flex',gap:4}}>
                  <button className="btn btn-ghost" style={{padding:'4px 8px'}} title="Voir"><I.Eye size={13}/></button>
                  <button className="btn btn-ghost" style={{padding:'4px 8px'}} title="Télécharger"><I.Download size={13}/></button>
                  <button className="btn btn-ghost" style={{padding:'4px 8px'}} title="Supprimer"><I.Trash size={13}/></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── MESSAGES (côté chantier, AMO uniquement) ──────────────────────
function TabMessages({ d }) {
  const isAmo = d.typologie === 'amo';
  if (!isAmo) {
    return (
      <div className="card" style={{padding:48, textAlign:'center', color:'var(--ink-400)'}}>
        <I.Lock size={28}/>
        <div style={{marginTop:12, fontSize:14, color:'var(--ink-500)'}}>
          La messagerie est réservée aux dossiers AMO
        </div>
        <div style={{fontSize:12, color:'var(--ink-400)', marginTop:6}}>
          Active la typologie AMO pour ouvrir un canal client.
        </div>
      </div>
    );
  }

  const fakeMsgs = [
    { id:1, from:'client', who:`${d.client.prenom} ${d.client.nom}`, when:'hier 14:22', txt:"Bonjour, est-ce que l'électricien passe bien la semaine prochaine ?" },
    { id:2, from:'agence', who:'Marine C.', when:'hier 15:08', txt:"Bonjour, oui prévu mercredi matin. Je vous tiens au courant." },
    { id:3, from:'client', who:`${d.client.prenom} ${d.client.nom}`, when:'aujourd\'hui 09:14', txt:"Super merci ! Je serai présente à partir de 8h30." },
  ];

  return (
    <div className="card" style={{padding:0, overflow:'hidden', display:'flex', flexDirection:'column', minHeight:520}}>
      <div style={{padding:'14px 22px', display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid var(--ink-200)'}}>
        <div>
          <h2 className="page" style={{fontSize:15}}>Conversation client</h2>
          <div className="eyebrow" style={{marginTop:4}}>Visible dans l'espace client AMO</div>
        </div>
        <Badge tone="ok">● En ligne</Badge>
      </div>
      <div style={{flex:1, padding:'24px 22px', background:'var(--surface-2)', display:'flex',flexDirection:'column',gap:14, overflow:'auto'}}>
        {fakeMsgs.map(m => {
          const mine = m.from === 'agence';
          return (
            <div key={m.id} style={{display:'flex', gap:10, justifyContent: mine ? 'flex-end' : 'flex-start'}}>
              {!mine && <Avatar name={m.who} color="#0094d4" size={28}/>}
              <div style={{maxWidth:420}}>
                <div style={{
                  background: mine ? 'var(--brand-500)' : '#fff',
                  color: mine ? '#fff' : 'var(--ink-700)',
                  padding:'10px 14px',
                  borderRadius: mine ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                  fontSize:13.5, lineHeight:1.5,
                  boxShadow: mine ? 'none' : '0 1px 2px rgba(0,0,0,0.04)'
                }}>{m.txt}</div>
                <div style={{fontSize:10.5, color:'var(--ink-400)', marginTop:4, textAlign: mine ? 'right' : 'left'}}>
                  {m.who} · {m.when}
                </div>
              </div>
              {mine && <Avatar name={m.who} color="#00578e" size={28}/>}
            </div>
          );
        })}
      </div>
      <div style={{padding:'14px 18px', borderTop:'1px solid var(--ink-200)', display:'flex',gap:10, alignItems:'center'}}>
        <input className="input" placeholder="Écrire un message…" style={{flex:1, height:42}}/>
        <button className="btn btn-primary" style={{height:42}}><I.PaperPlane size={14}/> Envoyer</button>
      </div>
    </div>
  );
}

Object.assign(window, { TabPlanningDossier, TabPhotos, TabCR, TabSuiviFin, TabDocs, TabMessages });
