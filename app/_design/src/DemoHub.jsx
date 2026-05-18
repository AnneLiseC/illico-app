// Demo Hub — page d'accès rapide aux flows / modales non encore raccordées contextuellement.
// Permet à un visiteur de la maquette de voir tous les écrans à la demande.

function DemoHub({ onNav }) {
  const [activeModal, setActiveModal] = React.useState(null);

  const flows = [
    { key:'login', label:'Login / Mot de passe oublié', icon:'Lock', desc:'Écran d\'authentification avec illustration brand', route:'login' },
    { key:'new_chantier', label:'Nouveau chantier (wizard 3 étapes)', icon:'Folder', desc:'Création de dossier : client → projet → frais', modal:'new_chantier' },
    { key:'new_client', label:'Nouveau client', icon:'Users', desc:'Particulier / Pro · co-client · apporteur', modal:'new_client' },
    { key:'new_artisan', label:'Nouvel artisan', icon:'Hammer', desc:'Identité + Kbis/Décennale/Qualification', modal:'new_artisan' },
    { key:'client_detail', label:'Fiche client détail', icon:'Users', desc:'Dossiers + historique + contact', route:'client_detail' },
    { key:'artisan_detail', label:'Fiche artisan détail', icon:'Hammer', desc:'Devis + documents + fiches techniques', route:'artisan_detail' },
    { key:'cr_wizard', label:'Wizard CR avec IA (3 étapes)', icon:'Sparkles', desc:'Config → notes vocales/photos → relecture', modal:'cr_wizard' },
    { key:'doc_viewer', label:'Visionneuse de document', icon:'Doc', desc:'PDF fullscreen / image plein écran', modal:'doc_viewer' },
    { key:'edit_devis', label:'Modification devis', icon:'Edit', desc:'HT/TTC auto, commission, royalties', modal:'edit_devis' },
    { key:'edit_rdv', label:'Création / modification RDV', icon:'Calendar', desc:'Type R1/R2/R3, artisan, Google Calendar', modal:'edit_rdv' },
  ];

  return (
    <div className="page-enter" style={{display:'flex',flexDirection:'column',gap:18}}>
      <div>
        <div className="eyebrow" style={{marginBottom:4}}>Maquette</div>
        <h1 className="page">Écrans secondaires & modales</h1>
        <div style={{color:'var(--ink-500)', fontSize:13, marginTop:6}}>
          Accès rapide aux formulaires de création, aux pages détail et aux modales qui s'ouvrent normalement depuis l'app.
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))', gap:14}}>
        {flows.map(f => {
          const Ic = I[f.icon];
          return (
            <button key={f.key} onClick={() => {
              if (f.modal) setActiveModal(f.modal);
              else if (f.route) onNav(f.route);
            }} className="card row-hover" style={{
              padding:20, textAlign:'left', cursor:'pointer', border:'1px solid rgba(15,39,68,0.04)',
              background:'#fff', display:'flex', alignItems:'flex-start', gap:14
            }}>
              <div style={{
                width:42, height:42, borderRadius:10, background:'var(--brand-50)', color:'var(--brand-800)',
                display:'grid', placeItems:'center', flex:'0 0 42px'
              }}><Ic size={20}/></div>
              <div style={{minWidth:0, flex:1}}>
                <div style={{fontSize:14, fontWeight:700, color:'var(--ink-900)'}}>{f.label}</div>
                <div style={{fontSize:12, color:'var(--ink-500)', marginTop:4, lineHeight:1.45}}>{f.desc}</div>
                <div style={{
                  display:'inline-flex', gap:5, alignItems:'center', marginTop:10,
                  fontSize:11, color:'var(--brand-800)', fontWeight:700
                }}>
                  Voir <I.Arrow size={11}/>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {activeModal === 'new_chantier' && <NewChantierModal onClose={()=>setActiveModal(null)}/>}
      {activeModal === 'new_client' && <NewClientModal onClose={()=>setActiveModal(null)}/>}
      {activeModal === 'new_artisan' && <NewArtisanModal onClose={()=>setActiveModal(null)}/>}
      {activeModal === 'cr_wizard' && <CRWizardModal onClose={()=>setActiveModal(null)}/>}
      {activeModal === 'doc_viewer' && <DocViewer doc={{nom:'Contrat illiCO signé.pdf', type:'contrat', ko:842}} onClose={()=>setActiveModal(null)}/>}
      {activeModal === 'edit_devis' && <EditDevisModal onClose={()=>setActiveModal(null)}/>}
      {activeModal === 'edit_rdv' && <EditRdvModal onClose={()=>setActiveModal(null)}/>}
    </div>
  );
}

window.DemoHub = DemoHub;
