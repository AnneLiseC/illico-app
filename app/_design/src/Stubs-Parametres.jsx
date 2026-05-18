// Paramètres — Profil franchisée + gestion agentes + RIB + intégrations

function Parametres() {
  const { AGENTES, fmtEur, fmtDate } = DATA;
  const [section, setSection] = React.useState('profil');
  const [modalAgente, setModalAgente] = React.useState(null);

  const agentes = AGENTES.filter(a => a.role === 'agente');

  const sections = [
    { k:'profil',      l:'Profil franchisée', icon:'Users' },
    { k:'agence',      l:'Agence',            icon:'Building' },
    { k:'equipe',      l:'Équipe & agentes',  icon:'Users', count:agentes.length },
    { k:'parts',       l:'Parts & royalties', icon:'Coins' },
    { k:'objectifs',   l:'Objectifs CA',      icon:'TrendUp' },
    { k:'documents',   l:'RIB & Kbis',        icon:'Doc' },
    { k:'notifs',      l:'Notifications',     icon:'Bell' },
    { k:'integrations',l:'Intégrations',      icon:'Link' },
    { k:'securite',    l:'Sécurité',          icon:'Lock' },
  ];

  return (
    <div className="page-enter" style={{display:'flex',flexDirection:'column',gap:18}}>
      <div>
        <div className="eyebrow" style={{marginBottom:4}}>Système</div>
        <h1 className="page">Paramètres</h1>
        <div style={{color:'var(--ink-500)', fontSize:13, marginTop:6}}>Configuration de l'agence et de l'équipe</div>
      </div>

      <div className="card" style={{padding:0, overflow:'hidden', display:'grid', gridTemplateColumns:'240px 1fr', minHeight:560}}>
        <nav style={{padding:'10px 0', borderRight:'1px solid var(--ink-200)'}}>
          {sections.map(s => {
            const Ic = I[s.icon];
            const active = section === s.k;
            return (
              <button key={s.k} onClick={()=>setSection(s.k)} className="settings-nav-item" style={{
                fontWeight: active ? 700 : 500,
                color: active ? 'var(--brand-800)' : 'var(--ink-700)',
                borderLeftColor: active ? 'var(--brand-500)' : 'transparent',
                background: active ? 'var(--brand-50)' : 'transparent'
              }}>
                <Ic size={15}/>
                <span style={{flex:1}}>{s.l}</span>
                {s.count != null && <span style={{
                  background:'var(--ink-200)', color:'var(--ink-700)',
                  fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:99
                }}>{s.count}</span>}
              </button>
            );
          })}
        </nav>

        <div style={{padding:28, overflow:'auto'}}>
          {section === 'profil' && <SecProfil/>}
          {section === 'agence' && <SecAgence/>}
          {section === 'equipe' && <SecEquipe agentes={agentes} onEdit={setModalAgente}/>}
          {section === 'parts' && <SecParts/>}
          {section === 'objectifs' && <SecObjectifs/>}
          {section === 'documents' && <SecDocuments/>}
          {section === 'notifs' && <SecNotifs/>}
          {section === 'integrations' && <SecIntegrations/>}
          {section === 'securite' && <SecSecurite/>}
        </div>
      </div>

      {modalAgente && <AgenteModal agente={modalAgente} onClose={()=>setModalAgente(null)}/>}
    </div>
  );
}

function SecProfil() {
  return (
    <div>
      <h2 className="page" style={{fontSize:18, marginBottom:6}}>Profil franchisée</h2>
      <p style={{color:'var(--ink-500)', fontSize:13, marginBottom:24}}>Informations affichées sur les documents générés par l'application.</p>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:18, maxWidth:680}}>
        <Field label="Prénom"><input className="input" defaultValue="Marine"/></Field>
        <Field label="Nom"><input className="input" defaultValue="Castellet"/></Field>
        <Field label="Téléphone"><input className="input" defaultValue="04 42 06 14 78"/></Field>
        <Field label="Email"><input className="input" defaultValue="martigues@illico-travaux.com"/></Field>
        <div style={{gridColumn:'span 2'}}>
          <Field label="Adresse"><input className="input" defaultValue="12 av. Frédéric Mistral, 13500 Martigues"/></Field>
        </div>
      </div>
      <div style={{marginTop:24, display:'flex', gap:8}}>
        <button className="btn btn-primary">Enregistrer</button>
        <button className="btn btn-ghost">Annuler</button>
      </div>
    </div>
  );
}

function SecAgence() {
  return (
    <div>
      <h2 className="page" style={{fontSize:18, marginBottom:6}}>Agence</h2>
      <p style={{color:'var(--ink-500)', fontSize:13, marginBottom:24}}>Informations légales de l'agence.</p>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:18, maxWidth:680}}>
        <Field label="Raison sociale"><input className="input" defaultValue="CTP illiCO Martigues"/></Field>
        <Field label="SIRET"><input className="input" defaultValue="894 562 348 00018"/></Field>
        <Field label="TVA intracom."><input className="input" defaultValue="FR12894562348"/></Field>
        <Field label="Code franchise"><input className="input" defaultValue="ILL-MTG-2024"/></Field>
      </div>
    </div>
  );
}

function SecEquipe({ agentes, onEdit }) {
  const { fmtDate } = DATA;
  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',marginBottom:18}}>
        <div>
          <h2 className="page" style={{fontSize:18, marginBottom:4}}>Équipe & agentes</h2>
          <p style={{color:'var(--ink-500)', fontSize:13}}>Gestion des comptes agentes, parts par défaut et redevances.</p>
        </div>
        <button className="btn btn-primary" onClick={()=>onEdit({ id:'new', prenom:'', nom:'', email:'' })}>
          <I.Plus size={16}/> Nouvelle agente
        </button>
      </div>

      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        {agentes.map(a => (
          <div key={a.id} style={{
            padding:'14px 18px', border:'1px solid var(--ink-200)', borderRadius:12,
            display:'grid', gridTemplateColumns:'auto 1fr auto auto auto auto auto', gap:14, alignItems:'center'
          }}>
            <Avatar name={`${a.prenom} ${a.nom}`} color={a.color} size={42}/>
            <div style={{minWidth:0}}>
              <div style={{fontSize:14, fontWeight:700, color:'var(--ink-900)'}}>{a.prenom} {a.nom}</div>
              <div style={{fontSize:12, color:'var(--ink-500)', marginTop:2}}>{a.email}</div>
            </div>
            <div style={{textAlign:'center'}}>
              <div className="eyebrow" style={{fontSize:9.5}}>Parts dispo</div>
              <div style={{fontSize:12.5, fontWeight:700, color:'var(--ink-900)', marginTop:4}}>{a.parts_disponibles?.map(p => `${p}%`).join(' / ')}</div>
            </div>
            <div style={{textAlign:'center'}}>
              <div className="eyebrow" style={{fontSize:9.5}}>Part frais</div>
              <div style={{fontSize:12.5, fontWeight:700, color:'var(--ink-900)', marginTop:4}}>{a.frais_part_defaut}%</div>
            </div>
            <div style={{textAlign:'center'}}>
              <div className="eyebrow" style={{fontSize:9.5}}>Redevance depuis</div>
              <div style={{fontSize:12.5, fontWeight:700, color:'var(--ink-900)', marginTop:4}}>{fmtDate(a.redevance_debut)}</div>
            </div>
            <Badge tone="ok">Actif</Badge>
            <div style={{display:'flex',gap:4}}>
              <button className="btn btn-ghost" style={{padding:'5px 9px'}} onClick={()=>onEdit(a)}><I.Edit size={13}/></button>
              <button className="btn btn-ghost" style={{padding:'5px 9px'}}><I.Trash size={13}/></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SecParts() {
  return (
    <div>
      <h2 className="page" style={{fontSize:18, marginBottom:6}}>Parts & royalties</h2>
      <p style={{color:'var(--ink-500)', fontSize:13, marginBottom:24}}>Configuration des taux par défaut.</p>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:18, maxWidth:680}}>
        <Field label="Taux royalties illiCO France"><input className="input" defaultValue="5%"/></Field>
        <Field label="Taux TVA"><input className="input" defaultValue="20%"/></Field>
        <Field label="Taux courtage par défaut"><input className="input" defaultValue="6%"/></Field>
        <Field label="Taux honoraires AMO par défaut"><input className="input" defaultValue="9%"/></Field>
        <Field label="Part agente par défaut"><input className="input" defaultValue="50%"/></Field>
        <Field label="Redevance mensuelle"><input className="input" defaultValue="540 € TTC"/></Field>
      </div>
    </div>
  );
}

function SecObjectifs() {
  const { fmtEur, OBJECTIFS, AGENTES } = DATA;
  return (
    <div>
      <h2 className="page" style={{fontSize:18, marginBottom:6}}>Objectifs CA 2026</h2>
      <p style={{color:'var(--ink-500)', fontSize:13, marginBottom:24}}>Objectifs annuels par cible.</p>
      <div style={{display:'flex',flexDirection:'column',gap:12, maxWidth:560}}>
        {OBJECTIFS.map(o => {
          const ag = o.agente_id ? AGENTES.find(a => a.id === o.agente_id) : null;
          return (
            <div key={`${o.cible}-${o.agente_id||'agence'}`} style={{
              padding:'14px 18px', border:'1px solid var(--ink-200)', borderRadius:12,
              display:'flex', justifyContent:'space-between', alignItems:'center', gap:14
            }}>
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                {ag ? <Avatar name={`${ag.prenom} ${ag.nom}`} color={ag.color} size={32}/>
                    : <div style={{width:32,height:32,borderRadius:8,background:'var(--brand-50)',color:'var(--brand-800)',display:'grid',placeItems:'center'}}><I.Building size={16}/></div>}
                <div>
                  <div style={{fontSize:13, fontWeight:700, color:'var(--ink-900)'}}>{ag ? `${ag.prenom} ${ag.nom}` : 'Agence CTP'}</div>
                  <div style={{fontSize:11, color:'var(--ink-500)', marginTop:2}}>Objectif {o.cible} 2026</div>
                </div>
              </div>
              <div className="tnum" style={{fontSize:18, fontWeight:800, color:'var(--brand-800)'}}>{fmtEur(o.montant)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SecDocuments() {
  return (
    <div>
      <h2 className="page" style={{fontSize:18, marginBottom:6}}>Documents officiels</h2>
      <p style={{color:'var(--ink-500)', fontSize:13, marginBottom:24}}>RIB et pièces administratives utilisés pour les documents générés.</p>
      <div style={{display:'flex',flexDirection:'column',gap:12, maxWidth:520}}>
        {[
          { l:'RIB', file:'rib-marine.pdf', status:'uploaded' },
          { l:'Kbis', file:'kbis-illico-mtg-2026.pdf', status:'uploaded' },
          { l:'Attestation assurance RC pro', file:null, status:'missing' },
        ].map(doc => (
          <div key={doc.l} style={{
            padding:'14px 18px', border:'1px solid', borderColor: doc.status === 'uploaded' ? 'var(--ink-200)' : 'rgba(245,158,11,0.3)',
            borderRadius:12, display:'flex', justifyContent:'space-between', alignItems:'center', gap:14
          }}>
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <div style={{
                width:36, height:36, borderRadius:8,
                background: doc.status === 'uploaded' ? 'var(--brand-50)' : 'rgba(245,158,11,0.13)',
                color: doc.status === 'uploaded' ? 'var(--brand-800)' : '#a16207',
                display:'grid', placeItems:'center'
              }}><I.Doc size={16}/></div>
              <div>
                <div style={{fontSize:13.5, fontWeight:700, color:'var(--ink-900)'}}>{doc.l}</div>
                <div style={{fontSize:11.5, color:'var(--ink-500)', marginTop:2}}>{doc.file || 'Aucun fichier'}</div>
              </div>
            </div>
            {doc.status === 'uploaded'
              ? <button className="btn btn-ghost" style={{fontSize:12}}><I.Eye size={13}/> Voir</button>
              : <button className="btn btn-primary" style={{fontSize:12}}><I.Upload size={13}/> Uploader</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

function SecNotifs() {
  return (
    <div>
      <h2 className="page" style={{fontSize:18, marginBottom:6}}>Notifications</h2>
      <p style={{color:'var(--ink-500)', fontSize:13, marginBottom:24}}>Choisis les notifications à recevoir.</p>
      <div style={{display:'flex',flexDirection:'column',gap:12, maxWidth:520}}>
        {[
          { l:'Échéances devis < 7 jours', on:true },
          { l:'Nouveaux comptes-rendus',   on:true },
          { l:'Acomptes débloqués illiCO', on:true },
          { l:'Messages clients',          on:true },
          { l:'Décennales expirantes',     on:true },
          { l:'Redevances dues',           on:false },
        ].map(n => (
          <label key={n.l} style={{display:'flex',justifyContent:'space-between',alignItems:'center', padding:'12px 16px', border:'1px solid var(--ink-200)', borderRadius:10, cursor:'pointer'}}>
            <span style={{fontSize:13, color:'var(--ink-700)'}}>{n.l}</span>
            <Toggle defaultOn={n.on}/>
          </label>
        ))}
      </div>
    </div>
  );
}

function SecIntegrations() {
  return (
    <div>
      <h2 className="page" style={{fontSize:18, marginBottom:6}}>Intégrations</h2>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, maxWidth:680}}>
        {[
          { l:'Google Calendar', desc:'Sync des RDV et interventions', on:true,  icon:'Calendar' },
          { l:'Google Drive',    desc:'Stockage documents chantier',    on:false, icon:'Folder' },
          { l:'Supabase',         desc:'Base de données principale',     on:true,  icon:'Building' },
          { l:'IA Claude',        desc:'Génération comptes-rendus IA',  on:true,  icon:'Sparkles' },
        ].map(int => {
          const Ic = I[int.icon];
          return (
            <div key={int.l} style={{padding:18, border:'1px solid var(--ink-200)', borderRadius:12}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <div style={{width:36,height:36,borderRadius:8,background:'var(--brand-50)',color:'var(--brand-800)',display:'grid',placeItems:'center'}}>
                    <Ic size={16}/>
                  </div>
                  <div style={{fontSize:13.5, fontWeight:700, color:'var(--ink-900)'}}>{int.l}</div>
                </div>
                <Badge tone={int.on ? 'ok' : 'mute'}>{int.on ? 'Connecté' : 'Non connecté'}</Badge>
              </div>
              <div style={{fontSize:12, color:'var(--ink-500)'}}>{int.desc}</div>
              <button className="btn btn-ghost" style={{fontSize:11.5, padding:'5px 10px', marginTop:10}}>
                {int.on ? 'Déconnecter' : 'Connecter'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SecSecurite() {
  return (
    <div>
      <h2 className="page" style={{fontSize:18, marginBottom:6}}>Sécurité</h2>
      <div style={{display:'flex',flexDirection:'column',gap:18, maxWidth:520}}>
        <Field label="Email"><input className="input" defaultValue="martigues@illico-travaux.com" disabled/></Field>
        <Field label="Mot de passe"><input className="input" type="password" defaultValue="••••••••••"/></Field>
        <div style={{padding:16, background:'var(--surface-2)', borderRadius:10, border:'1px solid var(--ink-200)'}}>
          <div style={{fontSize:13, fontWeight:700, color:'var(--ink-900)'}}>Authentification à deux facteurs</div>
          <div style={{fontSize:12, color:'var(--ink-500)', marginTop:4}}>Renforce la sécurité du compte</div>
          <button className="btn btn-ghost" style={{marginTop:10}}><I.Lock size={13}/> Activer la 2FA</button>
        </div>
      </div>
    </div>
  );
}

function AgenteModal({ agente, onClose }) {
  const isNew = agente.id === 'new';
  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(15,39,68,0.55)', zIndex:100,
      display:'grid', placeItems:'center', padding:20
    }} onClick={onClose}>
      <div className="card" style={{padding:0, maxWidth:560, width:'100%', maxHeight:'90vh', overflow:'auto'}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:'18px 22px', borderBottom:'1px solid var(--ink-200)', display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <h2 className="page" style={{fontSize:16}}>{isNew ? 'Nouvelle agente' : `Modifier ${agente.prenom} ${agente.nom}`}</h2>
            <div className="eyebrow" style={{marginTop:4}}>{isNew ? 'Invitation par email' : 'Profil et parts'}</div>
          </div>
          <button className="btn btn-ghost" style={{padding:'6px 8px'}} onClick={onClose}><I.X size={14}/></button>
        </div>
        <div style={{padding:22, display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
          <Field label="Prénom"><input className="input" defaultValue={agente.prenom}/></Field>
          <Field label="Nom"><input className="input" defaultValue={agente.nom}/></Field>
          <Field label="Email"><input className="input" defaultValue={agente.email}/></Field>
          <Field label="Téléphone"><input className="input" defaultValue=""/></Field>
          <Field label="Parts disponibles (% séparés par ,)"><input className="input" defaultValue={agente.parts_disponibles?.join(', ') || '50, 60'}/></Field>
          <Field label="Part frais par défaut (%)"><input className="input" type="number" defaultValue={agente.frais_part_defaut || 50}/></Field>
          <div style={{gridColumn:'span 2'}}>
            <Field label="Date de début des redevances"><input className="input" type="date" defaultValue={agente.redevance_debut || ''}/></Field>
          </div>
        </div>
        <div style={{padding:'14px 22px', borderTop:'1px solid var(--ink-200)', display:'flex', gap:8, justifyContent:'flex-end'}}>
          <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary">{isNew ? <><I.Mail size={14}/> Envoyer l'invitation</> : 'Enregistrer'}</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Parametres });
