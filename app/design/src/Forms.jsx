// Formulaires de création : Nouveau chantier, client, artisan
// Et fiches détail Client [id], Artisan [id]

// ════════════════════════════════════════════════════════════════════
// MODAL : NOUVEAU CHANTIER (wizard 3 étapes)
// ════════════════════════════════════════════════════════════════════
function NewChantierModal({ onClose }) {
  const [step, setStep] = React.useState(1);
  const total = 3;

  const steps = [
    { n:1, l:'Client', icon:'Users' },
    { n:2, l:'Projet', icon:'Building' },
    { n:3, l:'Référente & frais', icon:'Coins' },
  ];

  return (
    <ModalShell title="Nouveau chantier" subtitle={`Étape ${step}/${total}`} onClose={onClose} width={720}>
      {/* Stepper */}
      <div style={{display:'grid', gridTemplateColumns:`repeat(${total}, 1fr)`, padding:'18px 24px', borderBottom:'1px solid var(--ink-200)', background:'var(--surface-2)', gap:8}}>
        {steps.map(s => {
          const Ic = I[s.icon];
          const done = s.n < step;
          const active = s.n === step;
          return (
            <div key={s.n} style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{
                width:32, height:32, borderRadius:99,
                background: done ? 'var(--ok)' : active ? 'var(--brand-500)' : '#fff',
                color: done || active ? '#fff' : 'var(--ink-400)',
                border:'2px solid', borderColor: done ? 'var(--ok)' : active ? 'var(--brand-500)' : 'var(--ink-200)',
                display:'grid', placeItems:'center', flex:'0 0 32px'
              }}>{done ? <I.Check size={14}/> : <Ic size={14}/>}</div>
              <div>
                <div className="eyebrow" style={{fontSize:9.5}}>Étape {s.n}</div>
                <div style={{fontSize:12.5, fontWeight:700, color: active ? 'var(--brand-800)' : 'var(--ink-700)'}}>{s.l}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{padding:24, minHeight:340}}>
        {step === 1 && (
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
            <Field label="Civilité">
              <select className="input"><option>Mme</option><option>M.</option><option>M. & Mme</option></select>
            </Field>
            <Field label="Type de client">
              <select className="input"><option>Particulier</option><option>Professionnel</option></select>
            </Field>
            <Field label="Prénom"><input className="input" placeholder="Catherine"/></Field>
            <Field label="Nom"><input className="input" placeholder="Vasseur"/></Field>
            <Field label="Email"><input className="input" type="email" placeholder="email@exemple.fr"/></Field>
            <Field label="Téléphone"><input className="input" placeholder="06 12 34 56 78"/></Field>
            <div style={{gridColumn:'span 2'}}>
              <Field label="Adresse complète"><input className="input" placeholder="Numéro, rue, code postal, ville"/></Field>
            </div>
            <div style={{gridColumn:'span 2', padding:14, background:'var(--brand-50)', borderRadius:10, fontSize:12.5, color:'var(--ink-700)'}}>
              <div style={{display:'flex',alignItems:'center',gap:6, fontWeight:700, color:'var(--brand-800)', marginBottom:4}}>
                <I.Search size={14}/> Recherche client existant
              </div>
              Tu peux aussi <strong>sélectionner un client existant</strong> au lieu d'en créer un nouveau.
            </div>
          </div>
        )}
        {step === 2 && (
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
            <Field label="Référence du dossier"><input className="input" placeholder="auto · M-2026-0234"/></Field>
            <Field label="Typologie">
              <select className="input">
                <option>Courtage</option><option>AMO</option><option>Estimo</option><option>MERAD</option>
                <option>Audit énergétique</option><option>Studio de jardin</option>
              </select>
            </Field>
            <Field label="Surface du projet (m²)"><input className="input" type="number" placeholder="92"/></Field>
            <Field label="Montant chantier estimé TTC"><input className="input" type="number" placeholder="78 400"/></Field>
            <Field label="Date limite devis"><input className="input" type="date"/></Field>
            <Field label="Date démarrage prévue"><input className="input" type="date"/></Field>
            <div style={{gridColumn:'span 2'}}>
              <Field label="Description du projet">
                <textarea className="input" rows={4} placeholder="Rénovation complète maison de ville — cuisine + SDB + peintures…" style={{minHeight:90, padding:12, lineHeight:1.5}}/>
              </Field>
            </div>
          </div>
        )}
        {step === 3 && (
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
            <Field label="Référente">
              <select className="input">
                {DATA.AGENTES.map(a => <option key={a.id}>{a.prenom} {a.nom} {a.role === 'admin' ? '(Franchisée)' : '(Agente)'}</option>)}
              </select>
            </Field>
            <Field label="Apporteur d'affaires">
              <select className="input"><option>Aucun</option><option>Notaire</option><option>Agence immobilière</option><option>Architecte</option></select>
            </Field>
            <Field label="Frais de consultation TTC"><input className="input" type="number" placeholder="1 500"/></Field>
            <Field label="Statut des frais">
              <select className="input"><option>En attente</option><option>Réglé</option><option>Offerts</option></select>
            </Field>
            <div style={{gridColumn:'span 2', padding:14, background:'var(--surface-2)', borderRadius:10, border:'1px solid var(--ink-200)'}}>
              <div className="eyebrow" style={{marginBottom:8}}>Pré-paramétrage commissions</div>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
                <Field label="Taux courtage (%)"><input className="input" type="number" defaultValue="6"/></Field>
                <Field label="Taux AMO (%)"><input className="input" type="number" defaultValue="9"/></Field>
              </div>
            </div>
            <label style={{gridColumn:'span 2', display:'flex',alignItems:'center',gap:10, padding:14, border:'1px solid var(--ink-200)', borderRadius:10, cursor:'pointer'}}>
              <input type="checkbox" defaultChecked style={{accentColor:'var(--brand-500)'}}/>
              <div>
                <div style={{fontSize:13, fontWeight:600, color:'var(--ink-900)'}}>Envoyer le contrat illiCO au client</div>
                <div style={{fontSize:11.5, color:'var(--ink-500)', marginTop:2}}>Email avec PDF de contrat à signer électroniquement</div>
              </div>
            </label>
          </div>
        )}
      </div>

      <div style={{padding:'16px 24px', borderTop:'1px solid var(--ink-200)', display:'flex',justifyContent:'space-between',gap:8}}>
        <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
        <div style={{display:'flex',gap:8}}>
          {step > 1 && <button className="btn btn-ghost" onClick={()=>setStep(step-1)}><I.ChevronLeft size={14}/> Précédent</button>}
          {step < total
            ? <button className="btn btn-primary" onClick={()=>setStep(step+1)}>Suivant <I.ChevronRight size={14}/></button>
            : <button className="btn btn-primary"><I.Check size={14}/> Créer le chantier</button>}
        </div>
      </div>
    </ModalShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// NOUVEAU CLIENT
// ════════════════════════════════════════════════════════════════════
function NewClientModal({ onClose }) {
  const [type, setType] = React.useState('particulier');
  const [apporteur, setApporteur] = React.useState(false);

  return (
    <ModalShell title="Nouveau client" subtitle="Fiche complète client + apporteur d'affaires" onClose={onClose} width={680}>
      <div style={{padding:24, display:'flex', flexDirection:'column', gap:14}}>
        {/* Type tabs */}
        <div style={{display:'flex',gap:8}}>
          {[
            { k:'particulier', l:'Particulier', icon:'Users' },
            { k:'professionnel', l:'Professionnel', icon:'Briefcase' },
          ].map(t => {
            const Ic = I[t.icon];
            return (
              <button key={t.k} onClick={()=>setType(t.k)} style={{
                flex:1, padding:'14px 16px', borderRadius:10, border:'1px solid',
                borderColor: type === t.k ? 'var(--brand-500)' : 'var(--ink-200)',
                background: type === t.k ? 'var(--brand-50)' : '#fff',
                color: type === t.k ? 'var(--brand-800)' : 'var(--ink-700)',
                display:'flex',alignItems:'center',gap:10, fontWeight:600, fontSize:13.5, cursor:'pointer'
              }}>
                <Ic size={18}/> {t.l}
              </button>
            );
          })}
        </div>

        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
          {type === 'professionnel' && (
            <div style={{gridColumn:'span 2'}}>
              <Field label="Raison sociale"><input className="input"/></Field>
            </div>
          )}
          <Field label="Civilité"><select className="input"><option>Mme</option><option>M.</option><option>M. & Mme</option></select></Field>
          <Field label="Prénom"><input className="input"/></Field>
          <Field label="Nom"><input className="input"/></Field>
          <Field label="Email"><input className="input" type="email"/></Field>
          <Field label="Téléphone"><input className="input"/></Field>
          {type === 'professionnel' && <Field label="SIRET"><input className="input"/></Field>}
          <div style={{gridColumn:'span 2'}}><Field label="Adresse complète"><input className="input"/></Field></div>

          {/* Co-client */}
          <details style={{gridColumn:'span 2', border:'1px solid var(--ink-200)', borderRadius:10, padding:'10px 14px'}}>
            <summary style={{cursor:'pointer', fontSize:12.5, fontWeight:600, color:'var(--ink-700)'}}>+ Ajouter un co-client (conjoint·e)</summary>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:10}}>
              <Field label="Prénom 2"><input className="input"/></Field>
              <Field label="Nom 2"><input className="input"/></Field>
            </div>
          </details>

          {/* Référente */}
          <Field label="Référente">
            <select className="input">{DATA.AGENTES.map(a => <option key={a.id}>{a.prenom} {a.nom}</option>)}</select>
          </Field>

          {/* Apporteur */}
          <div>
            <label style={{display:'flex',alignItems:'center',gap:8, fontSize:12.5, color:'var(--ink-700)', cursor:'pointer', marginTop:24}}>
              <input type="checkbox" checked={apporteur} onChange={e=>setApporteur(e.target.checked)} style={{accentColor:'var(--brand-500)'}}/>
              <strong>Apporteur d'affaires</strong>
            </label>
          </div>

          {apporteur && (
            <>
              <Field label="Nom de l'apporteur"><input className="input" placeholder="Maître Delpech, Notaire"/></Field>
              <Field label="Commission (%)"><input className="input" type="number" defaultValue="5"/></Field>
              <Field label="Base de calcul">
                <select className="input"><option>Par devis</option><option>Total chantier HT</option></select>
              </Field>
            </>
          )}
        </div>
      </div>

      <div style={{padding:'16px 24px', borderTop:'1px solid var(--ink-200)', display:'flex',justifyContent:'flex-end',gap:8}}>
        <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary"><I.Plus size={14}/> Créer le client</button>
      </div>
    </ModalShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// NOUVEL ARTISAN
// ════════════════════════════════════════════════════════════════════
function NewArtisanModal({ onClose }) {
  return (
    <ModalShell title="Nouvel artisan" subtitle="Fiche entreprise + documents officiels + fiches techniques" onClose={onClose} width={720}>
      <div style={{padding:24, display:'flex', flexDirection:'column', gap:18}}>
        <div className="eyebrow">Identité</div>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
          <div style={{gridColumn:'span 2'}}>
            <Field label="Nom de l'entreprise"><input className="input" placeholder="Plomberie Méditerranée"/></Field>
          </div>
          <Field label="Métier">
            <select className="input"><option>Plomberie</option><option>Électricité</option><option>Carrelage</option><option>Maçonnerie</option><option>Peinture</option><option>Couverture</option><option>Menuiserie</option></select>
          </Field>
          <Field label="Code postal / Ville"><input className="input" placeholder="13500 Martigues"/></Field>
          <Field label="Nom du gérant"><input className="input"/></Field>
          <Field label="Prénom du gérant"><input className="input"/></Field>
          <Field label="Téléphone"><input className="input"/></Field>
          <Field label="Email"><input className="input" type="email"/></Field>
          <Field label="SIRET"><input className="input"/></Field>
          <Field label="TVA intracom."><input className="input"/></Field>
          <div style={{gridColumn:'span 2'}}>
            <Field label="Adresse complète"><input className="input"/></Field>
          </div>
          <label style={{gridColumn:'span 2', display:'flex',alignItems:'center',gap:8, padding:'10px 14px', border:'1px solid var(--ink-200)', borderRadius:10, cursor:'pointer'}}>
            <input type="checkbox" style={{accentColor:'var(--brand-500)'}}/>
            <div>
              <div style={{fontSize:13, fontWeight:600, color:'var(--ink-900)'}}>Apporteur d'affaires</div>
              <div style={{fontSize:11.5, color:'var(--ink-500)'}}>Pas de royalties prélevées sur ses devis (sans_royalties)</div>
            </div>
          </label>
        </div>

        <div className="eyebrow">Documents officiels</div>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14}}>
          {[
            { l:'Kbis', icon:'Briefcase' },
            { l:'Décennale', icon:'Shield' },
            { l:'Qualification RGE', icon:'Star' },
          ].map(doc => {
            const Ic = I[doc.icon];
            return (
              <div key={doc.l} style={{
                padding:'16px 14px', border:'2px dashed var(--ink-200)', borderRadius:10,
                textAlign:'center', cursor:'pointer', transition:'border-color 150ms'
              }}>
                <div style={{width:36,height:36,borderRadius:8,background:'var(--brand-50)',color:'var(--brand-800)',display:'grid',placeItems:'center',margin:'0 auto'}}>
                  <Ic size={16}/>
                </div>
                <div style={{fontSize:12.5, fontWeight:600, color:'var(--ink-900)', marginTop:8}}>{doc.l}</div>
                <div style={{fontSize:10.5, color:'var(--ink-400)', marginTop:4}}>PDF · max 5 Mo</div>
                <button className="btn btn-ghost" style={{fontSize:11, padding:'4px 10px', marginTop:8}}><I.Upload size={10}/> Choisir</button>
              </div>
            );
          })}
        </div>
        <Field label="Date d'expiration décennale"><input className="input" type="date"/></Field>
      </div>

      <div style={{padding:'16px 24px', borderTop:'1px solid var(--ink-200)', display:'flex',justifyContent:'flex-end',gap:8}}>
        <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary"><I.Plus size={14}/> Créer l'artisan</button>
      </div>
    </ModalShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// FICHE CLIENT DÉTAIL
// ════════════════════════════════════════════════════════════════════
function ClientDetail({ onBack }) {
  const { DOSSIERS, fmtEur, fmtDate, calcStatut } = DATA;
  // Pick le premier client
  const dossiers = DOSSIERS.filter(d => d.client.nom === 'Vasseur' || d.client.nom === 'Mercier').slice(0,3);
  const c = dossiers[0].client;
  const total = dossiers.reduce((s,d) => s + (d.montant_chantier_ttc || 0), 0);

  return (
    <div className="page-enter" style={{display:'flex',flexDirection:'column',gap:18}}>
      <div style={{display:'flex',alignItems:'center',gap:10,fontSize:13, color:'var(--ink-500)'}}>
        <button onClick={onBack} className="btn btn-ghost" style={{padding:'4px 10px', fontSize:12}}>
          <I.ChevronLeft size={14}/> Tous les clients
        </button>
        <span style={{color:'var(--ink-300)'}}>/</span>
        <span style={{color:'var(--ink-700)', fontWeight:600}}>{c.civilite} {c.prenom} {c.nom}</span>
      </div>

      <div className="card" style={{padding:'28px'}}>
        <div style={{display:'flex',gap:20, alignItems:'flex-start'}}>
          <Avatar name={`${c.prenom} ${c.nom}`} color="#0094d4" size={72}/>
          <div style={{flex:1, minWidth:0}}>
            <div style={{display:'flex',gap:8, marginBottom:6, alignItems:'center'}}>
              <Badge tone="brand" dot={false}>Particulier</Badge>
              <Badge tone="ok" dot={false}>Client actif</Badge>
            </div>
            <h1 className="page" style={{fontSize:28, letterSpacing:-0.02}}>{c.civilite} {c.prenom} {c.nom}</h1>
            <div style={{fontSize:13, color:'var(--ink-500)', marginTop:8, display:'flex', alignItems:'center', gap:6}}>
              <I.Pin3 size={14}/>{c.adresse}
            </div>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button className="btn btn-ghost"><I.Edit size={14}/> Modifier</button>
            <a href={`tel:${c.tel}`} className="btn btn-ghost"><I.Phone size={14}/></a>
            <a href={`mailto:${c.email}`} className="btn btn-ghost"><I.Mail size={14}/></a>
            <button className="btn btn-primary"><I.Plus size={14}/> Nouveau dossier</button>
          </div>
        </div>
      </div>

      <div className="kpi-grid">
        <MiniKpi label="Dossiers" value={dossiers.length} sub={`${dossiers.filter(d=>d.contrat_signe).length} signés`} tone="brand"/>
        <MiniKpi label="Montant total" value={fmtEur(total)} sub="TTC tous chantiers" tone="ok"/>
        <MiniKpi label="Premier contact" value={fmtDate(DATA.d(-100))} sub="il y a 100 jours" tone="brand"/>
        <MiniKpi label="Dernier RDV" value={fmtDate(DATA.d(-7))} sub="R3 avec Marine" tone="info"/>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1.5fr 1fr', gap:18}}>
        <div className="card" style={{padding:0, overflow:'hidden'}}>
          <div style={{padding:'14px 22px', borderBottom:'1px solid var(--ink-200)'}}>
            <h2 className="page" style={{fontSize:15}}>Dossiers du client</h2>
          </div>
          {dossiers.map(d => {
            const s = calcStatut(d);
            return (
              <div key={d.id} style={{
                display:'grid', gridTemplateColumns:'1fr auto auto', gap:14,
                padding:'14px 22px', borderTop:'1px solid var(--ink-100)', alignItems:'center'
              }} className="row-hover">
                <div>
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <span className="mono" style={{fontSize:12, color:'var(--brand-800)', fontWeight:700}}>{d.reference}</span>
                    <TypoBadge typo={d.typologie}/>
                  </div>
                  <div style={{fontSize:13.5, fontWeight:600, color:'var(--ink-900)', marginTop:4}}>{d.description}</div>
                </div>
                <div className="tnum" style={{fontWeight:700, color:'var(--ink-900)'}}>{fmtEur(d.montant_chantier_ttc)}</div>
                <StatutBadge statut={s}/>
              </div>
            );
          })}
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <div className="card" style={{padding:22}}>
            <h2 className="page" style={{fontSize:15, marginBottom:12}}>Contact</h2>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{width:32,height:32,borderRadius:8,background:'var(--brand-50)',color:'var(--brand-800)',display:'grid',placeItems:'center'}}><I.Phone size={14}/></div>
                <div><div className="eyebrow">Téléphone</div><div className="mono" style={{fontWeight:600, fontSize:13}}>{c.tel}</div></div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{width:32,height:32,borderRadius:8,background:'var(--brand-50)',color:'var(--brand-800)',display:'grid',placeItems:'center'}}><I.Mail size={14}/></div>
                <div style={{minWidth:0}}><div className="eyebrow">Email</div><div style={{fontWeight:600, fontSize:13}} className="clip-1">{c.email}</div></div>
              </div>
            </div>
          </div>

          <div className="card" style={{padding:22}}>
            <h2 className="page" style={{fontSize:15, marginBottom:12}}>Historique</h2>
            <div style={{fontSize:12, color:'var(--ink-500)', display:'flex', flexDirection:'column', gap:10}}>
              {[
                { icon:'Doc',   text:'Contrat signé', date:fmtDate(DATA.d(-42)) },
                { icon:'Coins', text:'Acompte 30% reçu', date:fmtDate(DATA.d(-20)) },
                { icon:'Mail',  text:'Email envoyé : "Photos R3"', date:fmtDate(DATA.d(-10)) },
                { icon:'Phone', text:'Appel sortant · 8 min', date:fmtDate(DATA.d(-3)) },
              ].map((e,i) => {
                const Ic = I[e.icon];
                return (
                  <div key={i} style={{display:'flex',gap:10, alignItems:'center'}}>
                    <Ic size={13}/>
                    <span style={{flex:1, color:'var(--ink-700)'}}>{e.text}</span>
                    <span className="tnum">{e.date}</span>
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

// ════════════════════════════════════════════════════════════════════
// FICHE ARTISAN DÉTAIL
// ════════════════════════════════════════════════════════════════════
function ArtisanDetail({ onBack }) {
  const { ARTISANS, DOSSIERS, fmtEur, fmtDate, today } = DATA;
  const a = ARTISANS[0]; // Plomberie Méditerranée
  const devis = DOSSIERS.flatMap(d => d.devis.filter(dv => dv.artisan.id === a.id).map(dv => ({ ...dv, dossier:d })));
  const totalCA = devis.reduce((s, dv) => s + dv.montant_ht, 0);
  const dec = new Date(a.decennale_expiration);
  const decDiff = Math.round((dec - today) / 86400000);

  return (
    <div className="page-enter" style={{display:'flex',flexDirection:'column',gap:18}}>
      <div style={{display:'flex',alignItems:'center',gap:10,fontSize:13, color:'var(--ink-500)'}}>
        <button onClick={onBack} className="btn btn-ghost" style={{padding:'4px 10px', fontSize:12}}>
          <I.ChevronLeft size={14}/> Tous les artisans
        </button>
        <span style={{color:'var(--ink-300)'}}>/</span>
        <span style={{color:'var(--ink-700)', fontWeight:600}}>{a.entreprise}</span>
      </div>

      <div className="card" style={{padding:'28px'}}>
        <div style={{display:'flex',gap:20, alignItems:'flex-start'}}>
          <div style={{width:72, height:72, borderRadius:14, background:'var(--brand-50)', color:'var(--brand-800)', display:'grid', placeItems:'center'}}>
            <I.Hammer size={32}/>
          </div>
          <div style={{flex:1}}>
            <div style={{display:'flex',gap:6, marginBottom:6, flexWrap:'wrap'}}>
              <Badge tone="brand" dot={false}>{a.metier}</Badge>
              {a.kbis && <Badge tone="ok" dot={false}><I.Briefcase size={10}/> Kbis</Badge>}
              {a.qualification && <Badge tone="ok" dot={false}><I.Star size={10}/> {a.qualification}</Badge>}
            </div>
            <h1 className="page" style={{fontSize:26, letterSpacing:-0.02}}>{a.entreprise}</h1>
            <div style={{fontSize:13, color:'var(--ink-500)', marginTop:8}}>{a.ville}</div>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button className="btn btn-ghost"><I.Edit size={14}/> Modifier</button>
            <button className="btn btn-primary"><I.Plus size={14}/> Nouveau devis</button>
          </div>
        </div>
      </div>

      <div className="kpi-grid">
        <MiniKpi label="Devis fournis" value={devis.length} sub={`${devis.filter(dv=>dv.statut==='accepte').length} acceptés`} tone="brand"/>
        <MiniKpi label="CA cumulé HT" value={fmtEur(totalCA)} sub="tous chantiers" tone="ok"/>
        <MiniKpi label="Commission moyenne" value="8.5%" sub="sur ses devis" tone="info"/>
        <MiniKpi
          label="Décennale"
          value={decDiff < 0 ? 'Expirée' : decDiff <= 30 ? `J-${decDiff}` : '✓'}
          sub={fmtDate(a.decennale_expiration)}
          tone={decDiff < 0 ? 'bad' : decDiff <= 30 ? 'warn' : 'ok'}
        />
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:18}}>
        <div className="card" style={{padding:0, overflow:'hidden'}}>
          <div style={{padding:'14px 22px', borderBottom:'1px solid var(--ink-200)'}}>
            <h2 className="page" style={{fontSize:15}}>Devis sur tous les chantiers</h2>
          </div>
          {devis.map(dv => (
            <div key={dv.id} style={{
              padding:'14px 22px', borderTop:'1px solid var(--ink-100)',
              display:'grid', gridTemplateColumns:'1fr auto auto', gap:14, alignItems:'center'
            }} className="row-hover">
              <div>
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <span className="mono" style={{fontSize:11.5, color:'var(--brand-800)', fontWeight:700}}>{dv.dossier.reference}</span>
                  <span style={{fontSize:13, color:'var(--ink-700)'}}>{dv.dossier.client.prenom} {dv.dossier.client.nom}</span>
                </div>
                <div style={{display:'flex',gap:8, marginTop:4, fontSize:11.5, color:'var(--ink-500)'}}>
                  <span>{dv.commission_pourcentage}% commission</span>
                  {dv.date_signature && <span>· signé {fmtDate(dv.date_signature)}</span>}
                </div>
              </div>
              <div className="tnum" style={{fontWeight:700, color:'var(--ink-900)'}}>{fmtEur(dv.montant_ttc)}</div>
              {dv.statut === 'accepte' && <Badge tone="ok">Signé</Badge>}
              {dv.statut === 'refuse' && <Badge tone="bad">Refusé</Badge>}
              {dv.statut === 'en_attente' && <Badge tone="warn">En attente</Badge>}
            </div>
          ))}
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <div className="card" style={{padding:22}}>
            <h2 className="page" style={{fontSize:15, marginBottom:12}}>Documents officiels</h2>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {[
                { l:'Kbis', present:a.kbis },
                { l:'Décennale', present:true, expires:a.decennale_expiration },
                { l:'Qualification RGE', present:!!a.qualification },
                { l:'RC pro', present:false },
              ].map(doc => (
                <div key={doc.l} style={{
                  padding:'10px 14px', borderRadius:8, border:'1px solid', borderColor: doc.present ? 'var(--ink-200)' : 'rgba(245,158,11,0.3)',
                  display:'flex', justifyContent:'space-between', alignItems:'center'
                }}>
                  <div style={{display:'flex', alignItems:'center', gap:8}}>
                    {doc.present ? <I.Check size={14}/> : <I.Alert size={14}/>}
                    <span style={{fontSize:13, fontWeight:600, color:'var(--ink-900)'}}>{doc.l}</span>
                  </div>
                  {doc.present
                    ? <button className="btn btn-ghost" style={{fontSize:11, padding:'4px 8px'}}><I.Eye size={11}/> Voir</button>
                    : <button className="btn btn-ghost" style={{fontSize:11, padding:'4px 8px', color:'#a16207'}}>Manquant</button>}
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{padding:22}}>
            <h2 className="page" style={{fontSize:15, marginBottom:12}}>Fiches techniques</h2>
            <div style={{fontSize:12.5, color:'var(--ink-500)', marginBottom:10}}>
              3 fiches PDF disponibles pour les comptes-rendus chantier
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {['Charte produits 2026', 'Catalogue robinetterie', 'Mise en œuvre douche italienne'].map((f,i) => (
                <div key={i} style={{display:'flex',alignItems:'center',gap:8, padding:'8px 10px', background:'var(--surface-2)', borderRadius:8}}>
                  <I.Doc size={12}/>
                  <span style={{fontSize:12, color:'var(--ink-700)', flex:1}}>{f}</span>
                  <button className="btn btn-ghost" style={{padding:'2px 6px'}}><I.Eye size={11}/></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// MODAL SHELL (réutilisable)
// ════════════════════════════════════════════════════════════════════
function ModalShell({ title, subtitle, onClose, width = 600, children }) {
  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(15,39,68,0.55)', zIndex:200,
      display:'grid', placeItems:'center', padding:20, overflow:'auto'
    }} onClick={onClose}>
      <div className="card" style={{padding:0, maxWidth:width, width:'100%', maxHeight:'90vh', overflow:'hidden', display:'flex', flexDirection:'column'}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:'18px 24px', borderBottom:'1px solid var(--ink-200)', display:'flex',justifyContent:'space-between',alignItems:'flex-start', gap:14}}>
          <div>
            <h2 className="page" style={{fontSize:17}}>{title}</h2>
            {subtitle && <div className="eyebrow" style={{marginTop:4}}>{subtitle}</div>}
          </div>
          <button className="btn btn-ghost" style={{padding:'6px 8px'}} onClick={onClose}><I.X size={14}/></button>
        </div>
        <div style={{flex:1, overflow:'auto'}}>{children}</div>
      </div>
    </div>
  );
}

Object.assign(window, { NewChantierModal, NewClientModal, NewArtisanModal, ClientDetail, ArtisanDetail, ModalShell });
