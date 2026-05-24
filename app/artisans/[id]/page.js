'use client'
import { useState, useEffect, use } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../lib/auth-context'

/* ── Inline SVG icons ── */
function Svg({ size = 16, children }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
}
const HammerIcon  = ({ size=16 }) => <Svg size={size}><path d="M14.5 4.5l5 5-2 2-5-5z"/><path d="M12.5 6.5 3.5 15.5l3 3 9-9"/></Svg>
const ShieldIcon  = ({ size=16 }) => <Svg size={size}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></Svg>
const DocIcon     = ({ size=16 }) => <Svg size={size}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></Svg>
const ArrowIcon   = ({ size=16 }) => <Svg size={size}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></Svg>
const PlusIcon    = ({ size=16 }) => <Svg size={size}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></Svg>
const TrashIcon   = ({ size=16 }) => <Svg size={size}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></Svg>

const fmtEur  = (n) => Math.round(n || 0).toLocaleString('fr-FR') + ' €'
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—'

function KpiCard({ label, value, color }) {
  return (
    <div className="card" style={{padding:'18px 22px'}}>
      <div className="eyebrow" style={{marginBottom:8}}>{label}</div>
      <div className="tnum" style={{fontSize:22, fontWeight:800, color: color || 'var(--ink-900)'}}>{value}</div>
    </div>
  )
}

function DecBadge({ artisan }) {
  if (!artisan?.decennale_expiration) return <span style={{color:'var(--ink-300)', fontSize:13}}>—</span>
  const diff = Math.round((new Date(artisan.decennale_expiration) - new Date()) / 86400000)
  if (diff < 0) return <span style={{fontSize:13, fontWeight:700, color:'#b91c1c'}}>Expirée</span>
  if (diff <= 30) return <span style={{fontSize:13, fontWeight:700, color:'#a16207'}}>J-{diff}</span>
  return <span style={{fontSize:13, color:'var(--ink-700)'}}>{fmtDate(artisan.decennale_expiration)}</span>
}

const STATUT_STYLE = {
  accepte:   { bg:'rgba(22,163,74,0.1)',   c:'#15803d',  label:'Accepté' },
  en_attente:{ bg:'rgba(245,158,11,0.1)',  c:'#a16207',  label:'En attente' },
  recu:      { bg:'rgba(37,99,235,0.1)',   c:'#1d4ed8',  label:'Reçu' },
  refuse:    { bg:'rgba(239,68,68,0.1)',   c:'#b91c1c',  label:'Refusé' },
  a_modifier:{ bg:'rgba(124,58,237,0.1)',  c:'#7c3aed',  label:'À modifier' },
}

export default function FicheArtisan({ params }) {
  const { id } = use(params)
  const [artisan, setArtisan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [erreur, setErreur] = useState('')
  const [succes, setSucces] = useState('')
  const [mode, setMode] = useState('lecture')
  const [fichesTechniques, setFichesTechniques] = useState([])
  const [ajouterFiche, setAjouterFiche] = useState(false)
  const [savingFiche, setSavingFiche] = useState(false)
  const [nouvelleFiche, setNouvelleFiche] = useState({ nom: '', description: '', fichier: null })
  const [UploadEnCours, setUploadEnCours] = useState({})
  const [fichesExpand, setFichesExpand] = useState(false)
  const router = useRouter()
  const { user, profile, initialized } = useAuth()

  useEffect(() => {
    if (!initialized) return
    if (!user) { router.push('/login'); return }

    const init = async () => {
      const [{ data }, { data: fichesData }] = await Promise.all([
        supabase.from('artisans')
          .select('*, devis_artisans(id, statut, montant_ht, montant_ttc, commission_pourcentage, devis_signe_path, dossier:dossiers(id, reference, referente_id, client:clients(id, prenom, nom, civilite)))')
          .eq('id', id).single(),
        supabase.from('fiches_techniques').select('*').eq('artisan_id', id).order('nom'),
      ])
      setArtisan(data)
      setFichesTechniques(fichesData || [])
      setLoading(false)
    }
    init()
  }, [initialized, user?.id, id, router])

  const set = (champ, valeur) => setArtisan(a => ({ ...a, [champ]: valeur }))

  const chargerFiches = async () => {
    const { data } = await supabase.from('fiches_techniques').select('*').eq('artisan_id', id).order('nom')
    setFichesTechniques(data || [])
  }

  const handleSave = async () => {
    setSaving(true); setErreur(''); setSucces('')
    // Un partenaire est toujours en paiement direct.
    const partenaire = artisan.partenaire || false
    const paiementDirect = partenaire || artisan.paiement_direct || false
    const { error } = await supabase.from('artisans').update({
      entreprise: artisan.entreprise, nom: artisan.nom, prenom: artisan.prenom,
      email: artisan.email, telephone: artisan.telephone,
      code_postal: artisan.code_postal, ville: artisan.ville,
      metier: artisan.metier, decennale_expiration: artisan.decennale_expiration,
      paiement_direct: paiementDirect,
      partenaire,
      // Transition : sans_royalties reste aligné sur paiement_direct tant que
      // finance.js et les pages de calculs lisent encore cette colonne.
      sans_royalties: paiementDirect,
    }).eq('id', id)
    if (error) { setErreur('Erreur : ' + error.message) }
    else { setSucces('Modifications enregistrées ✓'); setMode('lecture') }
    setSaving(false)
  }

  const uploadFichier = async (fichier, type) => {
    setUploadEnCours(u => ({ ...u, [type]: true })); setErreur('')
    const ext = fichier.name.split('.').pop()
    const chemin = `artisans/${id}/${type}.${ext}`
    const { error: uploadError } = await supabase.storage.from('documents').upload(chemin, fichier, { upsert: true })
    if (uploadError) { setErreur('Erreur upload : ' + uploadError.message); setUploadEnCours(u => ({ ...u, [type]: false })); return }
    const champ = type === 'kbis' ? 'kbis_url' : type === 'decennale' ? 'decennale_url' : type === 'qualification' ? 'qualification_url' : 'rib_url'
    await supabase.from('artisans').update({ [champ]: chemin }).eq('id', id)
    setArtisan(a => ({ ...a, [champ]: chemin }))
    setSucces(`${type} uploadé ✓`)
    setUploadEnCours(u => ({ ...u, [type]: false }))
  }

  const sauvegarderFiche = async () => {
    if (!nouvelleFiche.nom) return
    setSavingFiche(true)
    let url = null
    if (nouvelleFiche.fichier) {
      const ext = nouvelleFiche.fichier.name.split('.').pop()
      const chemin = `artisans/${id}/fiches/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('documents').upload(chemin, nouvelleFiche.fichier)
      if (!uploadError) url = chemin
    }
    const { error } = await supabase.from('fiches_techniques').insert({ artisan_id: id, nom: nouvelleFiche.nom, description: nouvelleFiche.description || null, url })
    if (error) { setErreur('Erreur : ' + error.message) }
    else { await chargerFiches(); setAjouterFiche(false); setNouvelleFiche({ nom: '', description: '', fichier: null }); setSucces('Fiche ajoutée ✓') }
    setSavingFiche(false)
  }

  const supprimerFiche = async (ficheId) => {
    if (!confirm('Supprimer cette fiche technique ?')) return
    await supabase.from('fiches_techniques').delete().eq('id', ficheId)
    await chargerFiches()
  }

  const ouvrirDocument = async (chemin) => {
    if (!chemin) return
    const { data } = await supabase.storage.from('documents').createSignedUrl(chemin, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const ouvrirDevis = async (dv) => {
    if (dv.devis_signe_path) {
      const { data } = await supabase.storage.from('documents').createSignedUrl(dv.devis_signe_path, 3600)
      if (data?.signedUrl) { window.open(data.signedUrl, '_blank'); return }
    }
    if (dv.dossier?.id) router.push(`/chantiers/${dv.dossier.id}`)
  }

  if (loading) return <div className="page-loading" />
  if (!artisan) return <div style={{paddingTop:96, textAlign:'center', color:'var(--ink-400)'}}>Artisan introuvable</div>

  const allDevis = artisan.devis_artisans || []
  const devisListe = profile?.role === 'admin'
    ? allDevis
    : allDevis.filter(dv => dv.dossier?.referente_id === profile?.id)
  const nbDevis = devisListe.length
  const caHT = devisListe.reduce((s, dv) => s + (dv.montant_ht || 0), 0)
  const devisAvecCom = devisListe.filter(dv => dv.commission_pourcentage > 0)
  const comMoyenne = devisAvecCom.length > 0
    ? Math.round(devisAvecCom.reduce((s, dv) => s + dv.commission_pourcentage, 0) / devisAvecCom.length * 100)
    : 0
  const diffDec = artisan.decennale_expiration
    ? Math.round((new Date(artisan.decennale_expiration) - new Date()) / 86400000) : null
  const decUrgente = diffDec !== null && diffDec <= 30 && diffDec >= 0
  const decExpiree = diffDec !== null && diffDec < 0

  return (
    <div className="page-enter page-pad" style={{display:'flex', flexDirection:'column', gap:18}}>

      {/* Retour */}
      <button className="btn btn-ghost" style={{alignSelf:'flex-start', fontSize:13}}
        onClick={() => router.push('/artisans')}>
        ← Artisans
      </button>

      {/* Messages */}
      {succes && <div style={{background:'rgba(22,163,74,0.07)', border:'1px solid rgba(22,163,74,0.25)', borderRadius:10, padding:'10px 16px', fontSize:13, color:'#15803d'}}>{succes}</div>}
      {erreur && <div style={{background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:10, padding:'10px 16px', fontSize:13, color:'#b91c1c'}}>{erreur}</div>}

      {/* Alertes décennale */}
      {decExpiree && (
        <div style={{background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:10, padding:'12px 16px', display:'flex', alignItems:'center', gap:10}}>
          <ShieldIcon size={15}/><span style={{fontSize:13, fontWeight:600, color:'#b91c1c'}}>Décennale expirée — demander le renouvellement</span>
        </div>
      )}
      {decUrgente && (
        <div style={{background:'rgba(245,158,11,0.06)', border:'1px solid rgba(245,158,11,0.3)', borderRadius:10, padding:'12px 16px', display:'flex', alignItems:'center', gap:10}}>
          <ShieldIcon size={15}/><span style={{fontSize:13, fontWeight:600, color:'#a16207'}}>Décennale expire le {fmtDate(artisan.decennale_expiration)} — dans {Math.round(diffDec)} jours</span>
        </div>
      )}

      {/* ── Hero ── */}
      <div className="card" style={{padding:'20px 24px', display:'flex', alignItems:'center', gap:16, flexWrap:'wrap'}}>
        <div style={{width:52, height:52, borderRadius:14, background:'var(--brand-50)', color:'var(--brand-800)', display:'grid', placeItems:'center', flexShrink:0}}>
          <HammerIcon size={22}/>
        </div>
        <div style={{flex:1, minWidth:0}}>
          <h1 className="page" style={{fontSize:20}}>{artisan.entreprise}</h1>
          <div style={{color:'var(--ink-500)', fontSize:13, marginTop:2}}>{[artisan.code_postal, artisan.ville].filter(Boolean).join(' ')}</div>
          <div style={{display:'flex', gap:6, marginTop:8, flexWrap:'wrap'}}>
            {artisan.metier && (
              <span style={{padding:'2px 10px', borderRadius:99, fontSize:11.5, fontWeight:700, background:'rgba(0,148,212,0.1)', color:'var(--brand-800)'}}>
                {artisan.metier}
              </span>
            )}
            {artisan.kbis_url && (
              <span style={{padding:'2px 10px', borderRadius:99, fontSize:11.5, fontWeight:700, background:'var(--brand-50)', color:'var(--brand-800)'}}>Kbis ✓</span>
            )}
            {artisan.qualification && (
              <span style={{padding:'2px 10px', borderRadius:99, fontSize:11.5, fontWeight:700, background:'rgba(22,163,74,0.1)', color:'#15803d'}}>★ {artisan.qualification}</span>
            )}
            {artisan.partenaire ? (
              <span style={{padding:'2px 10px', borderRadius:99, fontSize:11.5, fontWeight:700, background:'rgba(245,158,11,0.1)', color:'#a16207'}}>Partenaire</span>
            ) : artisan.paiement_direct ? (
              <span style={{padding:'2px 10px', borderRadius:99, fontSize:11.5, fontWeight:700, background:'rgba(107,114,128,0.1)', color:'#4b5563'}}>Paiement direct</span>
            ) : null}
          </div>
        </div>
        {mode === 'lecture' ? (
          <button className="btn btn-primary" onClick={() => setMode('edition')}>Modifier</button>
        ) : (
          <div style={{display:'flex', gap:8}}>
            <button className="btn btn-ghost" onClick={() => { setMode('lecture'); setErreur('') }}>Annuler</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        )}
      </div>

      {/* ── 4 KPIs ── */}
      <div className="kpi-grid">
        <KpiCard label="Devis fournis" value={nbDevis} />
        <KpiCard label="CA cumulé HT" value={caHT > 0 ? fmtEur(caHT) : '—'} color="var(--brand-800)" />
        <KpiCard label="Commission moyenne" value={comMoyenne > 0 ? `${comMoyenne} %` : '—'} />
        <KpiCard label="Décennale" value={<DecBadge artisan={artisan}/>} />
      </div>

      {/* ── Formulaire édition ── */}
      {mode === 'edition' && (
        <div className="card" style={{padding:24, display:'flex', flexDirection:'column', gap:14}}>
          <div className="eyebrow">Informations</div>
          <div>
            <label style={{display:'block', fontSize:12, fontWeight:600, color:'var(--ink-600)', marginBottom:5}}>Entreprise *</label>
            <input className="input" value={artisan.entreprise || ''} onChange={e => set('entreprise', e.target.value)} />
          </div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
            <div>
              <label style={{display:'block', fontSize:12, fontWeight:600, color:'var(--ink-600)', marginBottom:5}}>Prénom contact</label>
              <input className="input" value={artisan.prenom || ''} onChange={e => set('prenom', e.target.value)} />
            </div>
            <div>
              <label style={{display:'block', fontSize:12, fontWeight:600, color:'var(--ink-600)', marginBottom:5}}>Nom contact</label>
              <input className="input" value={artisan.nom || ''} onChange={e => set('nom', e.target.value)} />
            </div>
            <div>
              <label style={{display:'block', fontSize:12, fontWeight:600, color:'var(--ink-600)', marginBottom:5}}>Email</label>
              <input className="input" type="email" value={artisan.email || ''} onChange={e => set('email', e.target.value)} />
            </div>
            <div>
              <label style={{display:'block', fontSize:12, fontWeight:600, color:'var(--ink-600)', marginBottom:5}}>Téléphone</label>
              <input className="input" type="tel" value={artisan.telephone || ''} onChange={e => set('telephone', e.target.value)} />
            </div>
            <div>
              <label style={{display:'block', fontSize:12, fontWeight:600, color:'var(--ink-600)', marginBottom:5}}>Métier</label>
              <input className="input" value={artisan.metier || ''} onChange={e => set('metier', e.target.value)} />
            </div>
            <div>
              <label style={{display:'block', fontSize:12, fontWeight:600, color:'var(--ink-600)', marginBottom:5}}>Décennale — expiration</label>
              <input className="input" type="date" value={artisan.decennale_expiration || ''} onChange={e => set('decennale_expiration', e.target.value)} />
            </div>
            <div>
              <label style={{display:'block', fontSize:12, fontWeight:600, color:'var(--ink-600)', marginBottom:5}}>Code postal</label>
              <input className="input" value={artisan.code_postal || ''} onChange={e => set('code_postal', e.target.value)} />
            </div>
            <div>
              <label style={{display:'block', fontSize:12, fontWeight:600, color:'var(--ink-600)', marginBottom:5}}>Ville</label>
              <input className="input" value={artisan.ville || ''} onChange={e => set('ville', e.target.value)} />
            </div>
          </div>
          <div className="eyebrow" style={{marginTop:4}}>Paiement & relation</div>
          <label style={{display:'flex', alignItems:'flex-start', gap:8, cursor: artisan.partenaire ? 'not-allowed' : 'pointer', fontSize:13, color:'var(--ink-700)'}}>
            <input type="checkbox"
              checked={artisan.paiement_direct || artisan.partenaire || false}
              disabled={artisan.partenaire || false}
              onChange={e => set('paiement_direct', e.target.checked)}
              style={{accentColor:'#6b7280', width:15, height:15, marginTop:2}} />
            <span>
              <strong>Paiement direct</strong>
              <span style={{display:'block', color:'var(--ink-500)', fontSize:12, marginTop:2}}>
                Le client paie l'entreprise en direct (hors PROTECTACOMPTE).
              </span>
            </span>
          </label>
          <label style={{display:'flex', alignItems:'flex-start', gap:8, cursor:'pointer', fontSize:13, color:'var(--ink-700)'}}>
            <input type="checkbox"
              checked={artisan.partenaire || false}
              onChange={e => {
                const checked = e.target.checked
                setArtisan(a => ({ ...a, partenaire: checked, paiement_direct: checked ? true : a.paiement_direct }))
              }}
              style={{accentColor:'#D97706', width:15, height:15, marginTop:2}} />
            <span>
              <strong>Partenaire</strong>
              <span style={{display:'block', color:'var(--ink-500)', fontSize:12, marginTop:2}}>
                Bureau d'études, architecte d'intérieur, fournisseur… On facture une commission sur son devis HT.
              </span>
            </span>
          </label>
        </div>
      )}

      {/* ── 2 colonnes ── */}
      <div style={{display:'grid', gridTemplateColumns:'3fr 2fr', gap:18, alignItems:'start'}}>

        {/* Gauche — Devis par chantier */}
        <div className="card" style={{padding:0, overflow:'hidden'}}>
          <div style={{padding:'14px 20px', borderBottom:'1px solid var(--ink-100)', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <div>
              <div style={{fontWeight:700, fontSize:14, color:'var(--ink-900)'}}>Devis par chantier</div>
              <div style={{fontSize:11.5, color:'var(--ink-400)', marginTop:2}}>{nbDevis} devis au total</div>
            </div>
          </div>
          {nbDevis === 0 ? (
            <p style={{padding:32, textAlign:'center', color:'var(--ink-400)', fontSize:13}}>Aucun devis</p>
          ) : (
            devisListe.map(dv => {
              const st = STATUT_STYLE[dv.statut] || { bg:'var(--ink-100)', c:'var(--ink-500)', label: dv.statut }
              const clientNom = [dv.dossier?.client?.civilite, dv.dossier?.client?.prenom, dv.dossier?.client?.nom].filter(Boolean).join(' ')
              return (
                <div key={dv.id} className="row-hover"
                  style={{padding:'12px 20px', borderTop:'1px solid var(--ink-100)', display:'flex', alignItems:'center', gap:12, cursor: (dv.devis_signe_path || dv.dossier?.id) ? 'pointer' : 'default'}}
                  onClick={() => ouvrirDevis(dv)}>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontSize:13, fontWeight:600, color:'var(--ink-900)'}} className="clip-1">
                      {dv.dossier?.reference || clientNom || '—'}
                    </div>
                    {clientNom && dv.dossier?.reference && (
                      <div style={{fontSize:11.5, color:'var(--ink-400)', marginTop:2}} className="clip-1">{clientNom}</div>
                    )}
                  </div>
                  <span style={{fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:99, background:st.bg, color:st.c, flexShrink:0}}>
                    {st.label}
                  </span>
                  {dv.commission_pourcentage > 0 && (
                    <span style={{fontSize:11.5, color:'var(--ink-400)', flexShrink:0}}>{Math.round(dv.commission_pourcentage * 100)}%</span>
                  )}
                  <span className="tnum" style={{fontSize:13, fontWeight:700, color:'var(--brand-800)', flexShrink:0}}>
                    {dv.montant_ht ? fmtEur(dv.montant_ht) : '—'}
                  </span>
                  {(dv.devis_signe_path || dv.dossier?.id) && <ArrowIcon size={12}/>}
                </div>
              )
            })
          )}
        </div>

        {/* Droite — Documents + Fiches */}
        <div style={{display:'flex', flexDirection:'column', gap:12}}>

          {/* Documents officiels */}
          <div className="card" style={{padding:0, overflow:'hidden'}}>
            <div style={{padding:'14px 20px', borderBottom:'1px solid var(--ink-100)'}}>
              <div style={{fontWeight:700, fontSize:14, color:'var(--ink-900)'}}>Documents officiels</div>
            </div>
            {[
              { key:'kbis',          label:'Kbis',          champ:'kbis_url',          accept:'.pdf' },
              { key:'decennale',     label:'Décennale',     champ:'decennale_url',     accept:'.pdf' },
              { key:'qualification', label:'Qualification', champ:'qualification_url', accept:'.pdf' },
              { key:'rib',           label:'RIB',           champ:'rib_url',           accept:'.pdf' },
            ].map(doc => (
              <div key={doc.key} style={{padding:'12px 20px', borderTop:'1px solid var(--ink-100)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:10}}>
                <div style={{display:'flex', alignItems:'center', gap:10}}>
                  <div style={{width:32, height:32, borderRadius:8, background: artisan[doc.champ] ? 'var(--brand-50)' : 'var(--surface-2)', color: artisan[doc.champ] ? 'var(--brand-800)' : 'var(--ink-300)', display:'grid', placeItems:'center', flexShrink:0}}>
                    <DocIcon size={14}/>
                  </div>
                  <div>
                    <div style={{fontSize:13, fontWeight:600, color:'var(--ink-900)'}}>{doc.label}</div>
                    <div style={{fontSize:11, color: artisan[doc.champ] ? '#15803d' : 'var(--ink-300)'}}>{artisan[doc.champ] ? 'Uploadé' : 'Manquant'}</div>
                  </div>
                </div>
                <div style={{display:'flex', gap:6, alignItems:'center'}}>
                  {artisan[doc.champ] && (
                    <button className="btn btn-ghost" style={{fontSize:11.5, padding:'3px 9px'}} onClick={() => ouvrirDocument(artisan[doc.champ])}>Voir</button>
                  )}
                  <label style={{fontSize:11.5, padding:'3px 9px', borderRadius:6, border:'1px solid var(--ink-200)', cursor:'pointer', color: UploadEnCours[doc.key] ? 'var(--ink-300)' : 'var(--brand-700)', background:'transparent'}}>
                    {UploadEnCours[doc.key] ? '…' : artisan[doc.champ] ? 'Remplacer' : '+ Ajouter'}
                    <input type="file" accept={doc.accept} style={{display:'none'}} disabled={!!UploadEnCours[doc.key]}
                      onChange={e => e.target.files[0] && uploadFichier(e.target.files[0], doc.key)} />
                  </label>
                </div>
              </div>
            ))}
          </div>

          {/* Fiches techniques */}
          <div className="card" style={{padding:0, overflow:'hidden'}}>
            <div style={{padding:'14px 20px', borderBottom:'1px solid var(--ink-100)', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <div style={{fontWeight:700, fontSize:14, color:'var(--ink-900)'}}>Fiches techniques <span style={{color:'var(--ink-400)', fontWeight:400}}>({fichesTechniques.length})</span></div>
              <button className="btn btn-ghost" style={{padding:'4px 8px'}} onClick={() => setAjouterFiche(true)}><PlusIcon size={13}/></button>
            </div>

            {ajouterFiche && (
              <div style={{padding:16, background:'rgba(37,99,235,0.03)', borderTop:'1px solid var(--ink-100)', display:'flex', flexDirection:'column', gap:10}}>
                <input className="input" placeholder="Nom du produit *" value={nouvelleFiche.nom}
                  onChange={e => setNouvelleFiche(f => ({ ...f, nom: e.target.value }))} />
                <input className="input" placeholder="Description" value={nouvelleFiche.description}
                  onChange={e => setNouvelleFiche(f => ({ ...f, description: e.target.value }))} />
                <label style={{fontSize:12, cursor:'pointer', color:'var(--brand-700)'}}>
                  {nouvelleFiche.fichier ? `✓ ${nouvelleFiche.fichier.name}` : '+ PDF (optionnel)'}
                  <input type="file" accept=".pdf" style={{display:'none'}}
                    onChange={e => setNouvelleFiche(f => ({ ...f, fichier: e.target.files[0] || null }))} />
                </label>
                <div style={{display:'flex', gap:8}}>
                  <button className="btn btn-ghost" style={{flex:1}} onClick={() => { setAjouterFiche(false); setNouvelleFiche({ nom:'', description:'', fichier:null }) }}>Annuler</button>
                  <button className="btn btn-primary" style={{flex:1}} onClick={sauvegarderFiche} disabled={!nouvelleFiche.nom || savingFiche}>
                    {savingFiche ? '…' : 'Enregistrer'}
                  </button>
                </div>
              </div>
            )}

            {fichesTechniques.length === 0 && !ajouterFiche ? (
              <p style={{padding:24, textAlign:'center', color:'var(--ink-400)', fontSize:13}}>Aucune fiche technique</p>
            ) : (
              <>
                {(fichesExpand ? fichesTechniques : fichesTechniques.slice(0, 3)).map(f => (
                  <div key={f.id} className="row-hover"
                    style={{padding:'12px 20px', borderTop:'1px solid var(--ink-100)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:10}}>
                    <div style={{minWidth:0}}>
                      <div style={{fontSize:13, fontWeight:600, color:'var(--ink-900)'}} className="clip-1">{f.nom}</div>
                      {f.description && <div style={{fontSize:11.5, color:'var(--ink-400)', marginTop:2}} className="clip-1">{f.description}</div>}
                    </div>
                    <div style={{display:'flex', gap:6, flexShrink:0}}>
                      {f.url && (
                        <button className="btn btn-ghost" style={{fontSize:11.5, padding:'3px 9px'}} onClick={() => ouvrirDocument(f.url)}>Voir</button>
                      )}
                      <button className="btn btn-ghost" style={{padding:'3px 8px', color:'var(--bad)'}} onClick={() => supprimerFiche(f.id)}>
                        <TrashIcon size={12}/>
                      </button>
                    </div>
                  </div>
                ))}
                {fichesTechniques.length > 3 && (
                  <button className="btn btn-ghost"
                    style={{width:'100%', borderRadius:0, borderTop:'1px solid var(--ink-100)', fontSize:12, padding:'10px 0', color:'var(--ink-500)'}}
                    onClick={() => setFichesExpand(e => !e)}>
                    {fichesExpand ? 'Afficher moins' : `Afficher plus (${fichesTechniques.length - 3})`}
                  </button>
                )}
              </>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
