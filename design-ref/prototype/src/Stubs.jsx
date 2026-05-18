// Stub pages for non-priority sections — visual placeholders with realistic shape

function Clients() {
  const { DOSSIERS, fmtEur, nomClient, fmtDate } = DATA;
  // unique clients
  const map = new Map();
  DOSSIERS.forEach(d => {
    const key = `${d.client.prenom}-${d.client.nom}`;
    if (!map.has(key)) {
      map.set(key, { ...d.client, dossiers: [d], total: d.montant_chantier_ttc || 0 });
    } else {
      const v = map.get(key);
      v.dossiers.push(d);
      v.total += d.montant_chantier_ttc || 0;
    }
  });
  const clients = Array.from(map.values());

  return (
    <div className="page-enter" style={{display:'flex',flexDirection:'column',gap:18}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end'}}>
        <div>
          <div className="eyebrow" style={{marginBottom:4}}>Contacts</div>
          <h1 className="page">Clients</h1>
          <div style={{color:'var(--ink-500)', fontSize:13, marginTop:6}}>{clients.length} clients · base actualisée</div>
        </div>
        <button className="btn btn-primary"><I.Plus size={16}/> Nouveau client</button>
      </div>
      <div className="card" style={{padding:'14px 16px', display:'flex', gap:10}}>
        <div style={{position:'relative', flex:1}}>
          <span style={{position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'var(--ink-400)'}}><I.Search size={16}/></span>
          <input className="input" placeholder="Rechercher un client…" style={{paddingLeft:36, width:'100%', height:40}}/>
        </div>
        <button className="btn btn-ghost" style={{height:40}}><I.Filter size={14}/> Filtres</button>
      </div>
      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))', gap:14}}>
        {clients.map((c, i) => (
          <div key={i} className="card" style={{padding:18}}>
            <div style={{display:'flex',gap:12,alignItems:'flex-start'}}>
              <Avatar name={`${c.prenom} ${c.nom}`} color="#0094d4" size={42}/>
              <div style={{flex:1, minWidth:0}}>
                <div style={{fontSize:15, fontWeight:700, color:'var(--ink-900)'}} className="clip-1">{c.civilite} {c.prenom} {c.nom}</div>
                <div style={{fontSize:12, color:'var(--ink-500)', marginTop:3, display:'flex', alignItems:'center', gap:4}}>
                  <I.Pin3 size={12}/> {DATA.villeFromAddr(c.adresse)}
                </div>
              </div>
              <button className="btn btn-ghost" style={{padding:'4px 8px'}}><I.More size={14}/></button>
            </div>
            <div style={{marginTop:14,display:'flex',gap:14,fontSize:11.5,color:'var(--ink-500)'}}>
              <span style={{display:'inline-flex',gap:4,alignItems:'center'}}><I.Phone size={11}/>{c.tel}</span>
              <span style={{display:'inline-flex',gap:4,alignItems:'center'}}><I.Mail size={11}/>{c.email}</span>
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
          </div>
        ))}
      </div>
    </div>
  );
}

function Artisans() {
  const { ARTISANS, DOSSIERS, fmtEur } = DATA;
  const enriched = ARTISANS.map(a => {
    const devis = DOSSIERS.flatMap(d => d.devis.filter(dv => dv.artisan.id === a.id));
    return { ...a, count: devis.length, ca: devis.reduce((s,dv) => s + dv.montant_ht, 0) };
  });
  return (
    <div className="page-enter" style={{display:'flex',flexDirection:'column',gap:18}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end'}}>
        <div>
          <div className="eyebrow" style={{marginBottom:4}}>Contacts</div>
          <h1 className="page">Artisans</h1>
          <div style={{color:'var(--ink-500)', fontSize:13, marginTop:6}}>{enriched.length} artisans partenaires</div>
        </div>
        <button className="btn btn-primary"><I.Plus size={16}/> Nouvel artisan</button>
      </div>
      <div className="card" style={{padding:0, overflow:'hidden'}}>
        <table style={{width:'100%', borderCollapse:'collapse', fontSize:13}}>
          <thead style={{background:'var(--surface-2)'}}>
            <tr>
              <Th>Entreprise</Th><Th>Métier</Th><Th>Ville</Th><Th right>Devis</Th><Th right>CA cumulé HT</Th><Th></Th>
            </tr>
          </thead>
          <tbody>
            {enriched.map(a => (
              <tr key={a.id} style={{borderTop:'1px solid var(--ink-100)'}} className="row-hover">
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
                <td style={{padding:'14px 16px', textAlign:'right', fontWeight:700, color:'var(--ink-900)'}} className="tnum">{a.count}</td>
                <td style={{padding:'14px 16px', textAlign:'right', fontWeight:700, color:'var(--brand-800)'}} className="tnum">{fmtEur(a.ca)}</td>
                <td style={{padding:'14px 16px'}}><button className="btn btn-ghost" style={{padding:'4px 8px'}}><I.Arrow size={12}/></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, right }) {
  return <th style={{textAlign: right ? 'right':'left', padding:'12px 16px', fontSize:11, fontWeight:700, color:'var(--ink-500)', letterSpacing:0.05, textTransform:'uppercase'}}>{children}</th>;
}

function Planning() {
  const days = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
  const dates = [11,12,13,14,15,16,17];
  const events = [
    { day:0, time:'09:00', dur:1.5, label:'R1 Mme Coste', tone:'#0094d4' },
    { day:0, time:'14:30', dur:1,   label:'Visite chantier Boudet', tone:'#16a34a' },
    { day:1, time:'10:00', dur:2,   label:'R2 Mercier', tone:'#0094d4' },
    { day:2, time:'15:00', dur:1,   label:'Réunion artisans', tone:'#f59e0b' },
    { day:3, time:'11:00', dur:0.5, label:'Call Dorian', tone:'#94a3b8' },
    { day:4, time:'09:30', dur:1,   label:'R2 Dorian', tone:'#0094d4' },
    { day:4, time:'11:00', dur:0.5, label:'Relance Lemaire', tone:'#f59e0b' },
    { day:4, time:'14:00', dur:1.5, label:'Réception Boudet', tone:'#16a34a' },
    { day:4, time:'16:30', dur:0.75,label:'Devis Mercier', tone:'#94a3b8' },
  ];
  return (
    <div className="page-enter" style={{display:'flex',flexDirection:'column',gap:18}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end'}}>
        <div>
          <div className="eyebrow" style={{marginBottom:4}}>Pilotage</div>
          <h1 className="page">Planning</h1>
          <div style={{color:'var(--ink-500)', fontSize:13, marginTop:6}}>Semaine du 11 au 17 mai 2026</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-ghost"><I.ChevronLeft size={14}/></button>
          <button className="btn btn-ghost">Aujourd'hui</button>
          <button className="btn btn-ghost"><I.ChevronRight size={14}/></button>
          <button className="btn btn-primary"><I.Plus size={16}/> Nouveau RDV</button>
        </div>
      </div>
      <div className="card" style={{padding:0, overflow:'hidden'}}>
        <div style={{display:'grid', gridTemplateColumns:'80px repeat(7, 1fr)', borderBottom:'1px solid var(--ink-200)', background:'var(--surface-2)'}}>
          <div/>
          {days.map((d, i) => (
            <div key={d} style={{padding:'14px 10px', textAlign:'center', borderLeft:'1px solid var(--ink-100)'}}>
              <div className="eyebrow">{d}</div>
              <div style={{fontSize:20, fontWeight:800, marginTop:4, color: i===4 ? 'var(--brand-800)' : 'var(--ink-900)'}} className="tnum">{dates[i]}</div>
            </div>
          ))}
        </div>
        <div style={{display:'grid', gridTemplateColumns:'80px repeat(7, 1fr)', minHeight:520, position:'relative'}}>
          <div style={{display:'flex',flexDirection:'column', borderRight:'1px solid var(--ink-100)'}}>
            {[8,9,10,11,12,13,14,15,16,17].map(h => (
              <div key={h} style={{height:50, padding:'6px 10px', fontSize:11, color:'var(--ink-400)', fontWeight:600, borderTop:'1px solid var(--ink-100)'}}>{h}h00</div>
            ))}
          </div>
          {days.map((_, di) => (
            <div key={di} style={{position:'relative', borderLeft:'1px solid var(--ink-100)', background: di===4 ? 'rgba(0,148,212,0.03)' : 'transparent'}}>
              {[0,1,2,3,4,5,6,7,8,9].map(i => (
                <div key={i} style={{height:50, borderTop:'1px solid var(--ink-100)'}}/>
              ))}
              {events.filter(e => e.day === di).map((e, i) => {
                const [h, m] = e.time.split(':').map(Number);
                const top = (h - 8) * 50 + (m/60)*50;
                const height = e.dur * 50 - 4;
                return (
                  <div key={i} style={{
                    position:'absolute', left:4, right:4, top, height,
                    background: e.tone, color:'#fff', borderRadius:6, padding:'6px 8px',
                    fontSize:11.5, fontWeight:600, boxShadow:'0 1px 3px rgba(0,0,0,0.1)',
                    overflow:'hidden'
                  }}>
                    <div style={{fontSize:10, opacity:0.85}}>{e.time}</div>
                    <div className="clip-2">{e.label}</div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Messagerie() {
  const threads = [
    { id:1, who:'Camille Roux', avatar:'CR', color:'#16a34a', last:'OK je te transmets la photo du R3 dès demain matin', ref:'M-2026-0192', when:'10:42', unread:2, online:true },
    { id:2, who:'Mme Vasseur',  avatar:'CV', color:'#0094d4', last:'Bonjour, est-ce qu\'on peut décaler le RDV de jeudi ?', ref:'M-2026-0184', when:'09:18', unread:1 },
    { id:3, who:'Plomberie Méditerranée', avatar:'PM', color:'#f59e0b', last:'Devis envoyé pour la SDB de Mme Pradel', ref:'M-2026-0156', when:'hier', unread:0 },
    { id:4, who:'Sophie Aubert', avatar:'SA', color:'#f59e0b', last:'Tu as les coordonnées de l\'électricien d\'Istres ?', ref:null, when:'hier', unread:0 },
    { id:5, who:'M. Mercier', avatar:'JM', color:'#94a3b8', last:'Parfait, on signe la semaine prochaine.', ref:'M-2026-0192', when:'13 mai', unread:0 },
  ];
  return (
    <div className="page-enter" style={{display:'flex',flexDirection:'column',gap:18, minHeight:0, flex:1}}>
      <div>
        <div className="eyebrow" style={{marginBottom:4}}>Communication</div>
        <h1 className="page">Messagerie</h1>
      </div>
      <div className="card" style={{padding:0, overflow:'hidden', display:'grid', gridTemplateColumns:'320px 1fr', flex:1, minHeight:560}}>
        <div style={{borderRight:'1px solid var(--ink-200)', display:'flex',flexDirection:'column'}}>
          <div style={{padding:'14px 16px', borderBottom:'1px solid var(--ink-200)'}}>
            <input className="input" placeholder="Rechercher…" style={{width:'100%'}}/>
          </div>
          <div style={{overflow:'auto'}}>
            {threads.map((t,i) => (
              <button key={t.id} style={{
                display:'flex', gap:12, padding:'14px 16px', textAlign:'left',
                borderBottom:'1px solid var(--ink-100)', width:'100%',
                background: i===0 ? 'var(--brand-50)' : 'transparent', alignItems:'flex-start'
              }} className={i!==0 ? 'row-hover':''}>
                <div style={{position:'relative', flex:'0 0 38px'}}>
                  <Avatar name={t.who} color={t.color} size={38}/>
                  {t.online && <span style={{position:'absolute',right:0,bottom:0, width:10, height:10, borderRadius:99, background:'#16a34a', border:'2px solid #fff'}}/>}
                </div>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:6}}>
                    <span style={{fontSize:13.5, fontWeight:700, color:'var(--ink-900)'}} className="clip-1">{t.who}</span>
                    <span style={{fontSize:11, color:'var(--ink-400)', whiteSpace:'nowrap'}}>{t.when}</span>
                  </div>
                  <div style={{fontSize:12, color:'var(--ink-500)', marginTop:3}} className="clip-1">{t.last}</div>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:6, gap:6}}>
                    {t.ref ? <span className="mono" style={{fontSize:10, color:'var(--brand-800)', fontWeight:700}}>{t.ref}</span> : <span/>}
                    {t.unread > 0 && <span style={{background:'var(--brand-500)', color:'#fff', borderRadius:99, padding:'1px 7px', fontSize:10, fontWeight:700}}>{t.unread}</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
        <div style={{display:'flex',flexDirection:'column'}}>
          <div style={{padding:'14px 22px', borderBottom:'1px solid var(--ink-200)', display:'flex', alignItems:'center', gap:12}}>
            <Avatar name="Camille Roux" color="#16a34a" size={38}/>
            <div style={{flex:1}}>
              <div style={{fontWeight:700, color:'var(--ink-900)'}}>Camille Roux</div>
              <div style={{fontSize:11.5, color:'#16a34a', fontWeight:600}}>En ligne · répond généralement en quelques minutes</div>
            </div>
            <button className="btn btn-ghost" style={{padding:'4px 8px'}}><I.Phone size={14}/></button>
            <button className="btn btn-ghost" style={{padding:'4px 8px'}}><I.More size={14}/></button>
          </div>
          <div style={{flex:1, padding:'24px 22px', overflow:'auto', display:'flex',flexDirection:'column',gap:14, background:'var(--surface-2)'}}>
            <div style={{display:'flex',gap:10,alignItems:'flex-end'}}>
              <Avatar name="Camille Roux" color="#16a34a" size={28}/>
              <div style={{background:'#fff', padding:'10px 14px', borderRadius:'12px 12px 12px 4px', maxWidth:420, fontSize:13.5, lineHeight:1.5, boxShadow:'0 1px 2px rgba(0,0,0,0.04)'}}>
                Salut Marine, j'ai bien fait le R2 chez Mme Dorian ce matin. Beaucoup de demandes sur l'isolation des combles, je te dépose le CR sur le dossier.
              </div>
            </div>
            <div style={{textAlign:'center', fontSize:11, color:'var(--ink-400)'}}>aujourd'hui · 10:38</div>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <div style={{background:'var(--brand-500)', color:'#fff', padding:'10px 14px', borderRadius:'12px 12px 4px 12px', maxWidth:420, fontSize:13.5, lineHeight:1.5}}>
                Top, merci ! Tu penses qu'on peut sortir un devis pour la semaine prochaine ?
              </div>
            </div>
            <div style={{display:'flex',gap:10,alignItems:'flex-end'}}>
              <Avatar name="Camille Roux" color="#16a34a" size={28}/>
              <div style={{background:'#fff', padding:'10px 14px', borderRadius:'12px 12px 12px 4px', maxWidth:420, fontSize:13.5, lineHeight:1.5, boxShadow:'0 1px 2px rgba(0,0,0,0.04)'}}>
                OK je te transmets la photo du R3 dès demain matin
              </div>
            </div>
          </div>
          <div style={{padding:'14px 18px', borderTop:'1px solid var(--ink-200)', display:'flex', gap:10, alignItems:'center'}}>
            <input className="input" placeholder="Écrire un message…" style={{flex:1, height:42}}/>
            <button className="btn btn-primary" style={{height:42}}>Envoyer</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Statistiques() {
  return (
    <div className="page-enter" style={{display:'flex',flexDirection:'column',gap:18}}>
      <div>
        <div className="eyebrow" style={{marginBottom:4}}>Analyse</div>
        <h1 className="page">Statistiques</h1>
        <div style={{color:'var(--ink-500)', fontSize:13, marginTop:6}}>Vue d'ensemble de l'activité</div>
      </div>
      <div className="kpi-grid">
        <KpiCard label="Taux de transformation" value="68%" sub="R2 → contrat signé" icon={<I.TrendUp size={20}/>} tone="ok" trend={{up:true, label:'+4 pts vs T-1'}}/>
        <KpiCard label="Délai moyen R1→signature" value="23j" sub="vs 28j en 2025" icon={<I.Clock size={20}/>} tone="brand"/>
        <KpiCard label="Panier moyen" value="68 200 €" sub="HT par chantier" icon={<I.Euro size={20}/>} tone="warn"/>
        <KpiCard label="Satisfaction client" value="4.8/5" sub="sur 32 retours" icon={<I.Sparkles size={20}/>} tone="ok"/>
      </div>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:18}}>
        <div className="card" style={{padding:22}}>
          <h2 className="page" style={{fontSize:16, marginBottom:14}}>Typologies de dossier</h2>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            {Object.entries({ courtage: 5, amo: 4, estimo: 2, merad: 1, audit_energetique: 1, studio_jardin: 1 }).map(([k,v]) => (
              <div key={k} style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{flex:'0 0 140px', fontSize:13, color:'var(--ink-700)'}}>{DATA.TYPOLOGIES[k]}</div>
                <div style={{flex:1, height:18, background:'var(--ink-100)', borderRadius:6, position:'relative', overflow:'hidden'}}>
                  <div style={{height:'100%', width:`${v/5*100}%`, background:'var(--brand-500)', borderRadius:6}}/>
                </div>
                <div style={{flex:'0 0 30px', textAlign:'right', fontWeight:700, color:'var(--ink-900)'}} className="tnum">{v}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card" style={{padding:22}}>
          <h2 className="page" style={{fontSize:16, marginBottom:14}}>Sources d'apport</h2>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            {[
              { k:'Bouche-à-oreille', v: 42 },
              { k:'illiCO France', v: 28 },
              { k:'Google / SEO', v: 16 },
              { k:'Réseaux sociaux', v: 9 },
              { k:'Apporteur d\'affaires', v: 5 },
            ].map(({k,v}) => (
              <div key={k} style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{flex:'0 0 160px', fontSize:13, color:'var(--ink-700)'}}>{k}</div>
                <div style={{flex:1, height:18, background:'var(--ink-100)', borderRadius:6, position:'relative', overflow:'hidden'}}>
                  <div style={{height:'100%', width:`${v}%`, background:'#0094d4', borderRadius:6}}/>
                </div>
                <div style={{flex:'0 0 36px', textAlign:'right', fontWeight:700, color:'var(--ink-900)'}} className="tnum">{v}%</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Parametres() {
  return (
    <div className="page-enter" style={{display:'flex',flexDirection:'column',gap:18}}>
      <div>
        <div className="eyebrow" style={{marginBottom:4}}>Système</div>
        <h1 className="page">Paramètres</h1>
      </div>
      <div className="card" style={{padding:0, overflow:'hidden', display:'grid', gridTemplateColumns:'240px 1fr'}}>
        <nav style={{padding:'10px 0', borderRight:'1px solid var(--ink-200)'}}>
          {['Profil','Agence','Équipe','Objectifs CA','Royalties','Notifications','Intégrations','Sécurité'].map((s, i) => (
            <button key={s} style={{
              display:'flex',alignItems:'center',gap:10, padding:'10px 18px', width:'100%', textAlign:'left',
              fontSize:13.5, fontWeight: i===0 ? 700 : 500, color: i===0 ? 'var(--brand-800)' : 'var(--ink-700)',
              borderLeft:'3px solid', borderLeftColor: i===0 ? 'var(--brand-500)' : 'transparent',
              background: i===0 ? 'var(--brand-50)' : 'transparent'
            }} className={i!==0?'row-hover':''}>{s}</button>
          ))}
        </nav>
        <div style={{padding:28}}>
          <h2 className="page" style={{fontSize:18, marginBottom:6}}>Profil franchisée</h2>
          <p style={{color:'var(--ink-500)', fontSize:13, marginBottom:24}}>Informations affichées sur les documents générés par l'application.</p>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:18, maxWidth:680}}>
            <Field label="Prénom"><input className="input" defaultValue="Marine"/></Field>
            <Field label="Nom"><input className="input" defaultValue="Castellet"/></Field>
            <Field label="Téléphone"><input className="input" defaultValue="04 42 06 14 78"/></Field>
            <Field label="Email"><input className="input" defaultValue="martigues@illico-travaux.com"/></Field>
            <div style={{gridColumn:'span 2'}}>
              <Field label="Agence">
                <input className="input" defaultValue="illiCO travaux Martigues — 12 av. Frédéric Mistral 13500"/>
              </Field>
            </div>
          </div>
          <div style={{marginTop:24, display:'flex', gap:8}}>
            <button className="btn btn-primary">Enregistrer</button>
            <button className="btn btn-ghost">Annuler</button>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Clients, Artisans, Planning, Messagerie, Statistiques, Parametres });
