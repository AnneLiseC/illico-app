// Modales contextuelles : Wizard CR IA, DocViewer, Edit Devis, Edit RDV

// ════════════════════════════════════════════════════════════════════
// WIZARD CR IA (3 étapes : config → notes → relecture)
// ════════════════════════════════════════════════════════════════════
function CRWizardModal({ onClose }) {
  const [step, setStep] = React.useState(1);
  const [type, setType] = React.useState('r2');
  const [vocal, setVocal] = React.useState(false);
  const [photos, setPhotos] = React.useState(2);
  const [generating, setGenerating] = React.useState(false);

  const handleGenerate = () => {
    setGenerating(true);
    setTimeout(() => { setGenerating(false); setStep(3); }, 1800);
  };

  return (
    <ModalShell
      title="Générer un compte-rendu avec l'IA"
      subtitle={`Étape ${step}/3 · ${{1:'Configuration', 2:'Notes & médias', 3:'Relecture'}[step]}`}
      onClose={onClose}
      width={760}
    >
      {/* Stepper */}
      <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', padding:'18px 24px', borderBottom:'1px solid var(--ink-200)', background:'var(--surface-2)', gap:8}}>
        {[
          { n:1, l:'Config', i:'Settings' },
          { n:2, l:'Notes', i:'Edit' },
          { n:3, l:'Relecture', i:'Eye' },
        ].map(s => {
          const Ic = I[s.i];
          const done = s.n < step, active = s.n === step;
          return (
            <div key={s.n} style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{
                width:32, height:32, borderRadius:99,
                background: done ? 'var(--ok)' : active ? 'var(--brand-500)' : '#fff',
                color: done || active ? '#fff' : 'var(--ink-400)',
                border:'2px solid', borderColor: done ? 'var(--ok)' : active ? 'var(--brand-500)' : 'var(--ink-200)',
                display:'grid', placeItems:'center'
              }}>{done ? <I.Check size={14}/> : <Ic size={14}/>}</div>
              <div>
                <div className="eyebrow" style={{fontSize:9.5}}>Étape {s.n}</div>
                <div style={{fontSize:12.5, fontWeight:700, color: active ? 'var(--brand-800)' : 'var(--ink-700)'}}>{s.l}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{padding:24, minHeight:380}}>
        {step === 1 && (
          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            <Field label="Type de visite">
              <div style={{display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:8}}>
                {[
                  { k:'r1', l:'R1', sub:'Visite client' },
                  { k:'r2', l:'R2', sub:'Visite artisan' },
                  { k:'r3', l:'R3', sub:'Devis' },
                  { k:'suivi', l:'Suivi', sub:'Chantier' },
                  { k:'reception', l:'R.', sub:'Réception' },
                ].map(t => (
                  <button key={t.k} onClick={()=>setType(t.k)} style={{
                    padding:'12px 8px', borderRadius:10, border:'1px solid',
                    borderColor: type === t.k ? 'var(--brand-500)' : 'var(--ink-200)',
                    background: type === t.k ? 'var(--brand-50)' : '#fff',
                    color: type === t.k ? 'var(--brand-800)' : 'var(--ink-700)',
                    cursor:'pointer'
                  }}>
                    <div style={{fontSize:15, fontWeight:800}}>{t.l}</div>
                    <div style={{fontSize:10.5, marginTop:3, fontWeight:600}}>{t.sub}</div>
                  </button>
                ))}
              </div>
            </Field>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
              <Field label="Date de la visite"><input className="input" type="date"/></Field>
              <Field label="Durée (min)"><input className="input" type="number" defaultValue="60"/></Field>
            </div>
            <Field label="Intervenants présents">
              <input className="input" placeholder="Marine Castellet, M. Plombier, Mme Vasseur"/>
            </Field>
            <Field label="Artisan rattaché (si R2)">
              <select className="input">
                <option>Aucun</option>
                {DATA.ARTISANS.slice(0,5).map(a => <option key={a.id}>{a.entreprise}</option>)}
              </select>
            </Field>
          </div>
        )}

        {step === 2 && (
          <div style={{display:'flex',flexDirection:'column',gap:18}}>
            <Field label="Tes notes brutes (l'IA va structurer)">
              <textarea className="input" rows={6} style={{minHeight:140, padding:12, lineHeight:1.55}}
                defaultValue="Visite cuisine. Évacuation OK. Pose nouvelle douche italienne en SDB. Client veut conserver le carrelage existant dans l'entrée. Prévoir 2h supplémentaires pour démolition cloison. Devis attendu vendredi."/>
            </Field>

            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
              {/* Vocal */}
              <div style={{padding:16, border:'1px solid var(--ink-200)', borderRadius:10}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div className="eyebrow">Note vocale</div>
                  <button onClick={()=>setVocal(!vocal)} style={{
                    width:36, height:36, borderRadius:99, border:0,
                    background: vocal ? 'var(--bad)' : 'var(--brand-500)', color:'#fff',
                    display:'grid', placeItems:'center', cursor:'pointer',
                    boxShadow: vocal ? '0 0 0 4px rgba(220,38,38,0.18)' : 'none',
                    animation: vocal ? 'pulse 1.5s infinite' : 'none'
                  }}>
                    <I.Mic size={16}/>
                  </button>
                </div>
                <div style={{fontSize:12.5, color: vocal ? '#b91c1c' : 'var(--ink-500)', marginTop:10, fontWeight: vocal ? 600 : 400}}>
                  {vocal ? '● Enregistrement en cours… 00:23' : 'Clique pour enregistrer'}
                </div>
                {vocal && (
                  <div style={{marginTop:10, display:'flex',gap:3, alignItems:'flex-end', height:24}}>
                    {[8,14,20,11,18,22,9,16,20,12,18,14,8,20,16,11,18,22].map((h,i) => (
                      <div key={i} style={{flex:1, height:`${h}px`, background:'var(--bad)', borderRadius:1, opacity: 0.4 + (i % 3) * 0.2}}/>
                    ))}
                  </div>
                )}
              </div>

              {/* Photos */}
              <div style={{padding:16, border:'1px solid var(--ink-200)', borderRadius:10}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div className="eyebrow">Photos jointes</div>
                  <button onClick={()=>setPhotos(photos+1)} className="btn btn-ghost" style={{padding:'4px 8px', fontSize:11.5}}><I.Plus size={12}/> Ajouter</button>
                </div>
                <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:6, marginTop:10}}>
                  {Array.from({length:photos}).map((_,i) => (
                    <div key={i} style={{
                      aspectRatio:'1', borderRadius:6,
                      background:`linear-gradient(135deg, hsl(${(i*47)%360} 60% 65%), hsl(${(i*47+35)%360} 55% 45%))`
                    }}/>
                  ))}
                  {photos === 0 && <div style={{gridColumn:'span 4', textAlign:'center', padding:14, color:'var(--ink-400)', fontSize:12}}>Aucune photo</div>}
                </div>
              </div>
            </div>

            <div style={{padding:16, background:'var(--brand-50)', borderRadius:10, border:'1px solid rgba(0,148,212,0.2)'}}>
              <div className="eyebrow" style={{marginBottom:10}}>Documents à joindre (visibles côté client)</div>
              <div style={{display:'flex',flexDirection:'column',gap:6, fontSize:12.5}}>
                {['Devis Plomberie Méditerranée.pdf', 'Plan SDB v3.pdf', 'Photos avant — archive.zip'].map(f => (
                  <label key={f} style={{display:'flex',alignItems:'center',gap:8, cursor:'pointer'}}>
                    <input type="checkbox" style={{accentColor:'var(--brand-500)'}}/>
                    <I.Doc size={12}/>
                    <span style={{color:'var(--ink-700)'}}>{f}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            <div style={{padding:14, background:'linear-gradient(135deg, rgba(0,148,212,0.08), rgba(0,87,142,0.04))', borderRadius:10, border:'1px solid rgba(0,148,212,0.2)', display:'flex',alignItems:'center',gap:10}}>
              <div style={{
                width:36, height:36, borderRadius:8, background:'var(--brand-500)', color:'#fff',
                display:'grid', placeItems:'center', flex:'0 0 36px'
              }}><I.Sparkles size={16}/></div>
              <div>
                <div style={{fontSize:13, fontWeight:700, color:'var(--brand-800)'}}>Compte-rendu généré · structure validée par l'IA</div>
                <div style={{fontSize:11.5, color:'var(--ink-500)', marginTop:2}}>Tu peux éditer chaque section avant de valider.</div>
              </div>
            </div>

            {/* Sections IA */}
            {[
              { t:'Objet de la visite', c:'R2 — Visite avec Plomberie Méditerranée chez Mme Vasseur, dossier M-2026-0184. Évaluation des besoins pour la rénovation cuisine + SDB.' },
              { t:'Constats sur place', c:'• Évacuation existante en bon état, conservation possible.\n• Cloison entre cuisine et séjour à démolir (charge non porteuse confirmée).\n• Carrelage entrée à conserver — état satisfaisant.' },
              { t:'Décisions & engagements', c:'• Pose d\'une nouvelle douche italienne en remplacement de la baignoire.\n• Démolition cloison : +2h prévues dans devis.\n• Devis Plomberie attendu vendredi 16 mai.' },
              { t:'Prochaines étapes', c:'• Émission devis vendredi 16/05\n• R3 prévue mercredi 21/05 — présentation des 4 devis\n• Démarrage chantier visé semaine 22' },
            ].map((sec,i) => (
              <div key={i} style={{padding:14, border:'1px solid var(--ink-200)', borderRadius:10}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                  <strong style={{fontSize:13, color:'var(--ink-900)'}}>{sec.t}</strong>
                  <button className="btn btn-ghost" style={{padding:'3px 8px', fontSize:11}}><I.Edit size={11}/> Éditer</button>
                </div>
                <div style={{fontSize:12.5, color:'var(--ink-700)', whiteSpace:'pre-line', lineHeight:1.5}}>{sec.c}</div>
              </div>
            ))}

            <label style={{display:'flex',alignItems:'center',gap:10, padding:14, background:'rgba(22,163,74,0.06)', border:'1px solid rgba(22,163,74,0.2)', borderRadius:10, cursor:'pointer'}}>
              <input type="checkbox" defaultChecked style={{accentColor:'var(--brand-500)'}}/>
              <div>
                <div style={{fontSize:13, fontWeight:600, color:'var(--ink-900)'}}>Rendre visible dans l'espace client (AMO)</div>
                <div style={{fontSize:11.5, color:'var(--ink-500)', marginTop:2}}>Le compte-rendu sera publié à Mme Vasseur après validation</div>
              </div>
            </label>
          </div>
        )}
      </div>

      <div style={{padding:'16px 24px', borderTop:'1px solid var(--ink-200)', display:'flex',justifyContent:'space-between',gap:8}}>
        <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
        <div style={{display:'flex',gap:8}}>
          {step > 1 && <button className="btn btn-ghost" onClick={()=>setStep(step-1)}><I.ChevronLeft size={14}/> Précédent</button>}
          {step === 1 && <button className="btn btn-primary" onClick={()=>setStep(2)}>Continuer <I.ChevronRight size={14}/></button>}
          {step === 2 && (
            <button className="btn btn-primary" onClick={handleGenerate} disabled={generating}>
              {generating
                ? <><I.Refresh size={14}/> Génération en cours…</>
                : <><I.Sparkles size={14}/> Générer le CR avec l'IA</>}
            </button>
          )}
          {step === 3 && <button className="btn btn-primary"><I.Check size={14}/> Publier le CR</button>}
        </div>
      </div>
    </ModalShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// DOC VIEWER (PDF / image fullscreen)
// ════════════════════════════════════════════════════════════════════
function DocViewer({ doc, onClose }) {
  if (!doc) return null;
  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(doc.nom);
  return (
    <div style={{position:'fixed', inset:0, background:'rgba(8,15,30,0.95)', zIndex:300, display:'flex', flexDirection:'column'}} onClick={onClose}>
      <div style={{padding:'14px 22px', background:'rgba(0,0,0,0.4)', display:'flex',justifyContent:'space-between',alignItems:'center', color:'#fff'}} onClick={e=>e.stopPropagation()}>
        <div style={{display:'flex',alignItems:'center',gap:12, minWidth:0}}>
          <I.Doc size={18}/>
          <div style={{minWidth:0}}>
            <div style={{fontSize:13.5, fontWeight:600}} className="clip-1">{doc.nom}</div>
            <div style={{fontSize:11, opacity:0.6, marginTop:2}}>{doc.ko < 1024 ? `${doc.ko} Ko` : `${(doc.ko/1024).toFixed(1)} Mo`} · {doc.type}</div>
          </div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-ghost" style={{color:'#fff', borderColor:'rgba(255,255,255,0.2)'}}><I.Download size={14}/> Télécharger</button>
          <button className="btn btn-ghost" style={{color:'#fff', borderColor:'rgba(255,255,255,0.2)', padding:'7px 10px'}} onClick={onClose}><I.X size={14}/></button>
        </div>
      </div>
      <div style={{flex:1, display:'grid', placeItems:'center', padding:30}} onClick={e=>e.stopPropagation()}>
        {isImage ? (
          <div style={{
            width:'min(900px, 90vw)', aspectRatio:'4/3',
            background:'linear-gradient(135deg, hsl(200 60% 65%), hsl(220 55% 45%))',
            borderRadius:8, boxShadow:'0 20px 60px rgba(0,0,0,0.5)'
          }}/>
        ) : (
          /* PDF mock — A4 sheet */
          <div style={{
            width:'min(720px, 90vw)', background:'#fff', boxShadow:'0 20px 60px rgba(0,0,0,0.5)',
            borderRadius:6, padding:'48px 56px', minHeight:840, aspectRatio:'1/1.41'
          }}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:36}}>
              <div>
                <div style={{fontSize:22, fontWeight:800, color:'var(--brand-800)', letterSpacing:-0.02}}>illiCO travaux</div>
                <div style={{fontSize:11, color:'#94a3b8', marginTop:2}}>Martigues · Marine Castellet</div>
              </div>
              <div style={{textAlign:'right', fontSize:11, color:'#64748b'}}>
                <div className="mono" style={{fontWeight:700, color:'var(--brand-800)'}}>M-2026-0184</div>
                <div>15 mai 2026</div>
              </div>
            </div>
            <h1 style={{fontSize:24, fontWeight:800, color:'var(--ink-900)', letterSpacing:-0.02, marginBottom:30}}>Contrat de courtage en travaux</h1>
            <div style={{display:'flex',flexDirection:'column',gap:16, fontSize:12, lineHeight:1.7, color:'#475569'}}>
              <p>Entre les soussignés :</p>
              <p><strong style={{color:'var(--ink-900)'}}>Madame Catherine Vasseur</strong>, demeurant 14 chemin des Salins, 13500 Martigues, ci-après dénommée « le client », d'une part,</p>
              <p>Et <strong style={{color:'var(--ink-900)'}}>CTP illiCO Martigues</strong>, représentée par Marine Castellet, d'autre part,</p>
              <p>Il a été convenu ce qui suit pour la mission d'accompagnement à maîtrise d'ouvrage (AMO) sur le chantier de rénovation cuisine + salle de bain situé à l'adresse précitée.</p>
              <div style={{background:'#f8fafc', padding:14, borderRadius:6, marginTop:14}}>
                <div style={{fontSize:11, fontWeight:700, color:'var(--brand-800)', textTransform:'uppercase', marginBottom:6}}>Article 1 — Objet</div>
                <p style={{margin:0}}>Le client confie à la franchise illiCO travaux Martigues la mission d'AMO pour son projet de rénovation, comprenant la recherche d'artisans qualifiés, la production de devis, le suivi de chantier et la réception finale.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// EDIT DEVIS
// ════════════════════════════════════════════════════════════════════
function EditDevisModal({ onClose }) {
  const [autoTTC, setAutoTTC] = React.useState(true);
  const [ht, setHt] = React.useState(15166);
  const ttc = autoTTC ? Math.round(ht * 1.1) : 16700;

  return (
    <ModalShell title="Modifier le devis" subtitle="Plomberie Méditerranée · M-2026-0184" onClose={onClose} width={620}>
      <div style={{padding:24, display:'flex', flexDirection:'column', gap:14}}>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
          <Field label="Artisan">
            <select className="input"><option>Plomberie Méditerranée</option></select>
          </Field>
          <Field label="Statut">
            <select className="input"><option>Accepté</option><option>En attente</option><option>Refusé</option></select>
          </Field>
          <Field label="Montant HT (€)">
            <input className="input" type="number" value={ht} onChange={e=>setHt(parseFloat(e.target.value)||0)}/>
          </Field>
          <Field label={<span>Montant TTC (€) <span style={{color:'var(--ink-400)', fontWeight:400}}>{autoTTC ? '· auto +10%' : ''}</span></span>}>
            <input className="input" type="number" value={ttc} disabled={autoTTC}/>
          </Field>
          <label style={{display:'flex',alignItems:'center',gap:8, fontSize:12.5, color:'var(--ink-700)', cursor:'pointer'}}>
            <input type="checkbox" checked={autoTTC} onChange={e=>setAutoTTC(e.target.checked)} style={{accentColor:'var(--brand-500)'}}/>
            Calcul TTC automatique
          </label>
          <Field label="Commission (%)">
            <input className="input" type="number" step="0.1" defaultValue="8"/>
          </Field>
          <Field label="Part agente (%)">
            <input className="input" type="number" defaultValue="50"/>
          </Field>
          <div></div>
          <Field label="Date de réception"><input className="input" type="date" defaultValue="2026-04-20"/></Field>
          <Field label="Date limite"><input className="input" type="date" defaultValue="2026-05-04"/></Field>
        </div>
        <Field label="Description des travaux">
          <textarea className="input" rows={3} style={{minHeight:80, padding:12}} defaultValue="Pose nouvelle douche italienne SDB, remplacement chauffe-eau, mise aux normes évacuations cuisine."/>
        </Field>

        <div style={{padding:14, background:'var(--surface-2)', borderRadius:10, border:'1px solid var(--ink-200)'}}>
          <div className="eyebrow" style={{marginBottom:8}}>Calcul de la commission</div>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:13, color:'var(--ink-700)'}}>
            <span>Commission HT : <span className="tnum" style={{fontWeight:700, color:'var(--brand-800)'}}>{Math.round(ht * 0.08).toLocaleString('fr-FR')} €</span></span>
            <span>Royalties (5%) : <span className="tnum" style={{fontWeight:700, color:'#b91c1c'}}>-{Math.round(ht * 0.08 * 0.05).toLocaleString('fr-FR')} €</span></span>
            <span>Net : <span className="tnum" style={{fontWeight:800, color:'#15803d'}}>{Math.round(ht * 0.08 * 0.95).toLocaleString('fr-FR')} €</span></span>
          </div>
        </div>
      </div>
      <div style={{padding:'16px 24px', borderTop:'1px solid var(--ink-200)', display:'flex',justifyContent:'space-between',gap:8}}>
        <button className="btn btn-ghost" style={{color:'#b91c1c', borderColor:'rgba(220,38,38,0.3)'}}><I.Trash size={13}/> Supprimer le devis</button>
        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary">Enregistrer</button>
        </div>
      </div>
    </ModalShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// EDIT RDV
// ════════════════════════════════════════════════════════════════════
function EditRdvModal({ onClose }) {
  const [type, setType] = React.useState('r2');
  const [withArtisan, setWithArtisan] = React.useState(true);
  return (
    <ModalShell title="Nouveau rendez-vous" subtitle="M-2026-0203 · Mme Dorian" onClose={onClose} width={580}>
      <div style={{padding:24, display:'flex', flexDirection:'column', gap:14}}>
        <Field label="Type de rendez-vous">
          <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:6}}>
            {[
              { k:'r1', l:'R1', color:'#0094d4' },
              { k:'r2', l:'R2', color:'#16a34a' },
              { k:'r3', l:'R3', color:'#f59e0b' },
              { k:'suivi', l:'Suivi', color:'#94a3b8' },
            ].map(t => (
              <button key={t.k} onClick={()=>setType(t.k)} style={{
                padding:'10px 6px', borderRadius:8, border:'1px solid',
                borderColor: type === t.k ? t.color : 'var(--ink-200)',
                background: type === t.k ? `${t.color}15` : '#fff',
                color: type === t.k ? t.color : 'var(--ink-700)',
                cursor:'pointer', fontWeight:700, fontSize:13
              }}>{t.l}</button>
            ))}
          </div>
        </Field>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
          <Field label="Date"><input className="input" type="date"/></Field>
          <Field label="Heure"><input className="input" type="time"/></Field>
          <Field label="Durée (min)"><input className="input" type="number" defaultValue="60"/></Field>
          <Field label="Lieu"><input className="input" defaultValue="Chez le client" placeholder="Adresse"/></Field>
        </div>
        {type === 'r2' && (
          <Field label="Artisan présent">
            <select className="input">{DATA.ARTISANS.slice(0,6).map(a => <option key={a.id}>{a.entreprise}</option>)}</select>
          </Field>
        )}
        <Field label="Notes">
          <textarea className="input" rows={3} style={{minHeight:80, padding:12}} placeholder="Points à aborder, préparation…"/>
        </Field>
        <label style={{display:'flex',alignItems:'center',gap:8, padding:'10px 14px', border:'1px solid var(--ink-200)', borderRadius:10, cursor:'pointer'}}>
          <input type="checkbox" defaultChecked style={{accentColor:'var(--brand-500)'}}/>
          <div style={{display:'flex',alignItems:'center',gap:8,flex:1}}>
            <I.Globe size={14}/>
            <span style={{fontSize:12.5, fontWeight:600, color:'var(--ink-900)'}}>Synchroniser sur Google Calendar</span>
          </div>
        </label>
      </div>
      <div style={{padding:'16px 24px', borderTop:'1px solid var(--ink-200)', display:'flex',justifyContent:'flex-end',gap:8}}>
        <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary"><I.Calendar size={14}/> Créer le RDV</button>
      </div>
    </ModalShell>
  );
}

Object.assign(window, { CRWizardModal, DocViewer, EditDevisModal, EditRdvModal });
