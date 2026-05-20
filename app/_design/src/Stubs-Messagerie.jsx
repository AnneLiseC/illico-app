// Messagerie — AMO uniquement (comme le vrai code)

function Messagerie() {
  const { DOSSIERS, today } = DATA;
  // Threads = un par dossier AMO
  const amoDossiers = DOSSIERS.filter(d => d.typologie === 'amo');
  const threads = amoDossiers.map((d, i) => ({
    id: d.id,
    dossier: d,
    last: [
      "OK je te transmets la photo du R3 dès demain matin",
      "Bonjour, est-ce qu'on peut décaler le RDV de jeudi ?",
      "Tout est en ordre pour la livraison, merci !",
      "Quand passe l'électricien la semaine prochaine ?",
    ][i % 4],
    when: ['10:42','09:18','hier','13 mai'][i % 4],
    unread: i === 0 ? 2 : i === 1 ? 1 : 0,
    online: i === 0,
  }));

  const [selected, setSelected] = React.useState(threads[0]?.id);
  const thread = threads.find(t => t.id === selected) || threads[0];

  return (
    <div className="page-enter" style={{display:'flex',flexDirection:'column',gap:18, minHeight:0, flex:1}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',gap:16,flexWrap:'wrap'}}>
        <div>
          <div className="eyebrow" style={{marginBottom:4}}>Communication</div>
          <h1 className="page">Messagerie AMO</h1>
          <div style={{color:'var(--ink-500)', fontSize:13, marginTop:6}}>
            {threads.length} conversations · uniquement les dossiers AMO sont accessibles côté client
          </div>
        </div>
      </div>

      <div className="card" style={{padding:0, overflow:'hidden', display:'grid', gridTemplateColumns:'320px 1fr', flex:1, minHeight:560}}>
        <div style={{borderRight:'1px solid var(--ink-200)', display:'flex',flexDirection:'column'}}>
          <div style={{padding:'14px 16px', borderBottom:'1px solid var(--ink-200)'}}>
            <input className="input" placeholder="Rechercher une conversation…" style={{width:'100%'}}/>
          </div>
          <div style={{overflow:'auto'}}>
            {threads.map(t => (
              <button key={t.id} onClick={()=>setSelected(t.id)} style={{
                display:'flex', gap:12, padding:'14px 16px', textAlign:'left',
                borderBottom:'1px solid var(--ink-100)', width:'100%',
                background: t.id === selected ? 'var(--brand-50)' : 'transparent',
                alignItems:'flex-start', border:0, cursor:'pointer'
              }} className={t.id !== selected ? 'row-hover':''}>
                <div style={{position:'relative', flex:'0 0 38px'}}>
                  <Avatar name={`${t.dossier.client.prenom} ${t.dossier.client.nom}`} color={t.dossier.referente.color} size={38}/>
                  {t.online && <span style={{position:'absolute',right:0,bottom:0, width:10, height:10, borderRadius:99, background:'#16a34a', border:'2px solid #fff'}}/>}
                </div>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:6}}>
                    <span style={{fontSize:13.5, fontWeight:700, color:'var(--ink-900)'}} className="clip-1">{t.dossier.client.prenom} {t.dossier.client.nom}</span>
                    <span style={{fontSize:11, color:'var(--ink-400)', whiteSpace:'nowrap'}}>{t.when}</span>
                  </div>
                  <div style={{fontSize:12, color:'var(--ink-500)', marginTop:3}} className="clip-1">{t.last}</div>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:6, gap:6}}>
                    <span className="mono" style={{fontSize:10, color:'var(--brand-800)', fontWeight:700}}>{t.dossier.reference}</span>
                    {t.unread > 0 && <span style={{background:'var(--brand-500)', color:'#fff', borderRadius:99, padding:'1px 7px', fontSize:10, fontWeight:700}}>{t.unread}</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
        <div style={{display:'flex',flexDirection:'column'}}>
          {thread && (
            <>
              <div style={{padding:'14px 22px', borderBottom:'1px solid var(--ink-200)', display:'flex', alignItems:'center', gap:12}}>
                <Avatar name={`${thread.dossier.client.prenom} ${thread.dossier.client.nom}`} color={thread.dossier.referente.color} size={38}/>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700, color:'var(--ink-900)'}}>{thread.dossier.client.prenom} {thread.dossier.client.nom}</div>
                  <div style={{fontSize:11.5, color: thread.online ? '#16a34a' : 'var(--ink-500)', fontWeight:600}}>
                    {thread.online ? '● En ligne' : 'Hors ligne'} · <span className="mono">{thread.dossier.reference}</span>
                  </div>
                </div>
                <button className="btn btn-ghost" style={{fontSize:11.5}}>Voir le dossier <I.Arrow size={12}/></button>
              </div>
              <div style={{flex:1, padding:'24px 22px', overflow:'auto', display:'flex',flexDirection:'column',gap:14, background:'var(--surface-2)'}}>
                <div style={{textAlign:'center', fontSize:11, color:'var(--ink-400)'}}>aujourd'hui · 10:38</div>
                <div style={{display:'flex',gap:10,alignItems:'flex-end'}}>
                  <Avatar name={`${thread.dossier.client.prenom} ${thread.dossier.client.nom}`} color={thread.dossier.referente.color} size={28}/>
                  <div style={{background:'#fff', padding:'10px 14px', borderRadius:'12px 12px 12px 4px', maxWidth:420, fontSize:13.5, lineHeight:1.5, boxShadow:'0 1px 2px rgba(0,0,0,0.04)'}}>
                    Bonjour, j'ai bien reçu le devis pour l'électricité. Une question : est-ce que les prises USB sont incluses ?
                  </div>
                </div>
                <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
                  <div style={{background:'var(--brand-500)', color:'#fff', padding:'10px 14px', borderRadius:'12px 12px 4px 12px', maxWidth:420, fontSize:13.5, lineHeight:1.5}}>
                    Bonjour ! Oui, 2 prises USB par chambre sont prévues dans le devis (ligne 5).
                  </div>
                </div>
                <div style={{display:'flex',gap:10,alignItems:'flex-end'}}>
                  <Avatar name={`${thread.dossier.client.prenom} ${thread.dossier.client.nom}`} color={thread.dossier.referente.color} size={28}/>
                  <div style={{background:'#fff', padding:'10px 14px', borderRadius:'12px 12px 12px 4px', maxWidth:420, fontSize:13.5, lineHeight:1.5, boxShadow:'0 1px 2px rgba(0,0,0,0.04)'}}>
                    {thread.last}
                  </div>
                </div>
              </div>
              <div style={{padding:'14px 18px', borderTop:'1px solid var(--ink-200)', display:'flex', gap:10, alignItems:'center'}}>
                <input className="input" placeholder="Écrire un message…" style={{flex:1, height:42}}/>
                <button className="btn btn-primary" style={{height:42}}><I.PaperPlane size={14}/> Envoyer</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Messagerie });
