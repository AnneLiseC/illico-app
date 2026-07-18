//chantier/[id]/page.js

'use client'
import { useState, useEffect, useRef, use } from 'react'
import { supabase } from '../../lib/supabase'
import { formatNomClient } from '../../lib/clients'
import { useRouter } from 'next/navigation'
import { Avatar, StatutBadge, TypoBadge, Badge, Progress, MiniKpi } from '../../components/shared'
import { calculerAvancement, detecterCategorie } from '../../lib/dossiers'
import { calculateDossierFinance, calculateDevisFinance, calculateCommissionsFinance, calculateCourtageTS, getPivotCourtage, getSignedDevis, getActiveDevis, calculateSoldeAmoReel, COURTAGE_STANDARD, AMO_STANDARD, TVA_FRAIS, TVA_TRAVAUX } from '../../lib/finance'
import { authHeaders } from '../../lib/api-auth-client'
import MarkdownCR from '../../components/MarkdownCR'
import ModalShell from '../../components/ModalShell'
import { compressImageToBlob, heicToJpegFile } from '../../lib/images'
import { fmtDateHeureFR, estDansDelaiEdition, parisLocalToInstant, instantToParisLocal } from '../../lib/dates'
import { determinerAgenceConcernee, resoudreCibleDefaut, libelleCible } from '../../lib/cibles'
import { buildInviteMailto } from '../../lib/inviteMail'
import { calculerExpiration } from '../../lib/expiration'
import JSZip from 'jszip'

// Liste des entités supprimées avec un chantier — source unique des 2 libellés
// (confirm de suppression + sous-titre du bouton), pour éviter qu'ils divergent.
const ENTITES_CHANTIER = 'devis, factures, photos, comptes-rendus, documents, RDV, interventions, suivis financiers, messages, contrat'

// Aperçu texte nu d'un CR : retire la syntaxe markdown (## titres, **gras**, puces).
function stripMarkdown(text) {
  return (text || '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/## +(?:\d+\.\s*)?/g, ' ')
    .replace(/^[-–] /gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function Svg({ children, size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}
const EditIcon     = () => <Svg><path d="M12 20H5a1 1 0 0 1-1-1v-7"/><path d="m14.5 4 5 5L9 19.5l-5 .5.5-5z"/></Svg>
const PhoneIcon    = () => <Svg><path d="M5 4h3l2 5-2 1a11 11 0 0 0 6 6l1-2 5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></Svg>
const MailIcon     = () => <Svg><rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/></Svg>
const DlIcon       = () => <Svg><path d="M21 15v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3"/><path d="M12 3v13"/><path d="m7 11 5 5 5-5"/></Svg>
const DocIcon      = () => <Svg><path d="M6 3.5h8l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z"/><path d="M14 3.5V8h4"/><path d="M8 12.5h8M8 16h6"/></Svg>
const PinIcon      = () => <Svg><path d="M12 21s-7-6-7-12a7 7 0 0 1 14 0c0 6-7 12-7 12z"/><circle cx="12" cy="9.5" r="2.4"/></Svg>
const CheckIcon    = () => <Svg><path d="m5 12 5 5L20 7"/></Svg>
const EyeIcon      = () => <Svg><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></Svg>
const HammerIcon   = () => <Svg><path d="M14.5 4.5l5 5-2 2-5-5z"/><path d="M12.5 6.5 3.5 15.5l3 3 9-9"/></Svg>
const CalIcon      = () => <Svg><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/></Svg>
const CamIcon      = () => <Svg><path d="M3 8a2 2 0 0 1 2-2h3l1.5-2h5L16 6h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.5"/></Svg>
const WalletIcon   = () => <Svg><path d="M3.5 8a2 2 0 0 1 2-2H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2z"/><path d="M16 13h2.5"/><path d="M3.5 9.5h13.6a1 1 0 0 1 1 1V14"/></Svg>
const FolderIcon   = () => <Svg><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2H19.5A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z"/></Svg>
const MsgIcon      = () => <Svg><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4 3v-3h-.5A2.5 2.5 0 0 1 3 14.5z" transform="translate(0.5,0.5)"/></Svg>
const MoreIcon     = () => <Svg><circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/></Svg>
const PlusIcon     = () => <Svg><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></Svg>
const ChartIcon    = () => <Svg><path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/></Svg>

// ─── Helpers Aperçu ───────────────────────────────────────────────────────────
function Fact({ label, value, highlight, mono }) {
  return (
    <div>
      <div className="eyebrow" style={{marginBottom:4}}>{label}</div>
      <div className={mono ? 'mono' : 'tnum'} style={{
        fontSize: highlight ? 18 : 13.5,
        fontWeight: highlight ? 800 : 600,
        color: highlight ? 'var(--brand-800)' : 'var(--ink-900)',
        letterSpacing: highlight ? -0.02 : 0,
      }}>{value || '—'}</div>
    </div>
  )
}

// Format euro court partagé (helpers module-level)
const fmtEurShort = (n) => Math.round(n || 0).toLocaleString('fr-FR') + ' €'
const MAX_VIDEO_MO = 100   // plafond par vidéo (galerie chantier) — cohérent avec la limite du bucket Storage


function ModalField({ label, children, required }) {
  return (
    <label style={{display:'flex', flexDirection:'column', gap:6, minWidth:0}}>
      <span className="eyebrow">{label}{required && <span style={{color:'#dc2626', marginLeft:4}}>*</span>}</span>
      {children}
    </label>
  )
}

function LieuPicker({ value, onChange }) {
  const opts = [
    { k: 'client', label: 'Adresse client', icon: '🏠' },
    { k: 'agence',  label: 'Agence',         icon: '🏢' },
  ]
  return (
    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
      {opts.map(o => {
        const active = value === o.k
        return (
          <button key={o.k} type="button" onClick={() => onChange(o.k)}
            style={{
              padding:'10px 12px', borderRadius:10, border:'1px solid',
              borderColor: active ? 'var(--brand-500)' : 'var(--ink-200)',
              background: active ? 'var(--brand-50)' : '#fff',
              color: active ? 'var(--brand-800)' : 'var(--ink-700)',
              cursor:'pointer', fontSize:13, fontWeight:600,
              display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              transition:'all 150ms',
            }}>
            <span style={{fontSize:16}}>{o.icon}</span>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// Mini-éditeur de date partagé : <input date> pré-rempli + ✓/✕. Réutilisé par
// EcheanceRow (nouveau contrat onSetPaid) et par le bouton pill de la carte devis.
function DateConfirm({ initial, onConfirm, onCancel }) {
  const [d, setD] = useState(initial)
  return (
    <div style={{display:'flex', gap:4, alignItems:'center', justifyContent:'flex-end'}}>
      <input type="date" value={d} onChange={e => setD(e.target.value)} autoFocus
        style={{height:28, fontSize:11, padding:'0 6px', border:'1px solid var(--ink-300)', borderRadius:6}} />
      <button type="button" onClick={() => { if (d) onConfirm(d) }} title="Valider la date"
        style={{width:24, height:24, borderRadius:6, border:'none', cursor:'pointer', background:'#16a34a', color:'#fff', fontSize:12, display:'grid', placeItems:'center'}}>✓</button>
      <button type="button" onClick={onCancel} title="Annuler"
        style={{width:24, height:24, borderRadius:6, border:'1px solid var(--ink-300)', cursor:'pointer', background:'#fff', color:'var(--ink-500)', fontSize:11, display:'grid', placeItems:'center'}}>✕</button>
    </div>
  )
}

// Contrat DATÉ : onSetPaid(date) + onUnsetPaid(). Cocher ouvre un DateConfirm pré-rempli
// à today ; cliquer une date déjà posée le rouvre pour la corriger ; décocher efface.
// lock ne bloque QUE le décochage (l'état), JAMAIS l'édition de date.
function EcheanceRow({ label, sub, statut, date, variant, onSetPaid, onUnsetPaid, fmtDateFn, lock, lockMsg }) {
  const [editing, setEditing] = useState(false)
  const isRegle = statut === 'regle' || statut === 'recu'
  const isIllico = variant === 'illico'
  const today = new Date().toISOString().slice(0, 10)
  // Cochable si non réglé (→ éditeur), décochable seulement hors lock.
  const canClick = !(isRegle && lock)

  const onCheckbox = () => {
    if (isRegle) { if (!lock) onUnsetPaid && onUnsetPaid() }
    else setEditing(true)
  }
  const dateEditable = isRegle  // corriger une date déjà posée (lock non bloquant)

  return (
    <div style={{
      display:'grid', gridTemplateColumns:'auto 1fr auto auto', gap:14, alignItems:'center',
      padding:'10px 14px', borderRadius:10, border:'1px solid var(--ink-200)',
      background: isRegle ? 'rgba(22,163,74,0.05)' : '#fff',
    }}>
      <label title={lock ? lockMsg : undefined}
        style={{display:'flex', alignItems:'center', gap:8, cursor: canClick ? 'pointer' : (lock ? 'not-allowed' : 'default')}}>
        <input type="checkbox" checked={isRegle} onChange={onCheckbox} readOnly={!canClick}
          style={{accentColor: isIllico ? '#6366f1' : 'var(--brand-500)', width:18, height:18, cursor: canClick ? 'pointer' : (lock ? 'not-allowed' : 'default')}} />
      </label>
      <div style={{minWidth:0}}>
        <div style={{fontSize:13, fontWeight:600, color: isIllico ? '#4f46e5' : 'var(--ink-900)'}}>{label}</div>
        <div style={{fontSize:11.5, color:'var(--ink-500)', marginTop:2}}>{sub}</div>
        {lock && lockMsg && (
          <div style={{fontSize:11, color:'#b45309', marginTop:3, display:'flex', gap:4, alignItems:'flex-start'}}>
            <span aria-hidden="true">🔒</span><span>{lockMsg}</span>
          </div>
        )}
      </div>
      {editing ? (
        <div style={{gridColumn:'3 / 5'}}>
          <DateConfirm
            initial={isRegle && date ? String(date).slice(0, 10) : today}
            onConfirm={d => { setEditing(false); onSetPaid(d) }}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <>
          <div style={{textAlign:'right', minWidth:80}}>
            {isRegle
              ? <Badge tone="ok">Réglé</Badge>
              : <Badge tone="warn">En attente</Badge>}
          </div>
          <div className="tnum" onClick={dateEditable ? () => setEditing(true) : undefined}
            title={dateEditable ? 'Modifier la date' : undefined}
            style={{fontSize:11.5, color:'var(--ink-400)', minWidth:60, textAlign:'right',
              cursor: dateEditable ? 'pointer' : 'default', textDecoration: dateEditable ? 'underline dotted' : 'none'}}>
            {date ? (fmtDateFn ? fmtDateFn(date) : new Date(date).toLocaleDateString('fr-FR', { day:'2-digit', month:'short' })) : '—'}
          </div>
        </>
      )}
    </div>
  )
}

// Pill « Acompte client » de la carte devis (onglet Devis). Même mode saisie que
// EcheanceRow via DateConfirm : cocher demande la date (pré-remplie today), la date
// posée est corrigeable au clic. Composant à part (pas une IIFE) car il porte un état
// `editing` — hooks interdits dans le .map des devis.
function AcompteClientPill({ acomptePaye, dateAcompte, onSetPaid, onUnsetPaid, toneBg, toneFg }) {
  const [editing, setEditing] = useState(false)
  const today = new Date().toISOString().slice(0, 10)
  return (
    <div className="devis-kv" style={{alignItems:'center'}}>
      {editing ? (
        <>
          <span>Acompte client</span>
          <DateConfirm
            initial={acomptePaye && dateAcompte ? String(dateAcompte).slice(0, 10) : today}
            onConfirm={d => { setEditing(false); onSetPaid(d) }}
            onCancel={() => setEditing(false)}
          />
        </>
      ) : (
        <>
          <span>
            Acompte client {acomptePaye && dateAcompte && (
              <span onClick={() => setEditing(true)} title="Modifier la date"
                style={{color:'#15803d', fontWeight:600, cursor:'pointer', textDecoration:'underline dotted'}}>
                · {new Date(dateAcompte).toLocaleDateString('fr-FR')}
              </span>
            )}
          </span>
          <button onClick={() => { if (acomptePaye) onUnsetPaid(); else setEditing(true) }}
            style={{
              fontSize:11, padding:'2px 10px', borderRadius:99, fontWeight:700, border:'none', cursor:'pointer',
              background: acomptePaye ? toneBg.ok : toneBg.warn,
              color: acomptePaye ? toneFg.ok : toneFg.warn,
            }}>
            {acomptePaye ? '✓ Payé' : '⏳ En attente'}
          </button>
        </>
      )}
    </div>
  )
}

function RecapRow({ label, value, strong, large, tone }) {
  const color = tone === 'brand' ? 'var(--brand-700)' : 'var(--ink-700)'
  return (
    <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', padding:'3px 0', fontSize: large ? 14 : 13}}>
      <span style={{color: strong ? 'var(--ink-900)' : 'var(--ink-500)', fontWeight: strong ? 700 : 400}}>{label}</span>
      <span className="tnum" style={{color: strong ? (tone === 'brand' ? 'var(--brand-800)' : 'var(--ink-900)') : color, fontWeight: strong ? 800 : 600}}>{value}</span>
    </div>
  )
}

function FactureMiniLine({ title, fact, expected, onAdd, onTogglePaid, onView }) {
  const fmtE = fmtEurShort
  if (!fact) {
    return (
      <button onClick={onAdd} style={{
        padding:'10px 12px', borderRadius:10, border:'1px dashed var(--ink-300)',
        background:'transparent', display:'flex', justifyContent:'space-between', alignItems:'center',
        textAlign:'left', cursor:'pointer', gap:8, transition:'all 150ms',
      }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--brand-50)'; e.currentTarget.style.borderColor = 'var(--brand-500)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--ink-300)' }}
      >
        <div style={{minWidth:0}}>
          <div style={{fontSize:12, fontWeight:600, color:'var(--ink-700)'}}>{title}</div>
          <div style={{fontSize:10.5, color:'var(--ink-400)', marginTop:2}}>
            {expected > 0 ? `Prévu ${fmtE(expected)}` : 'Pas encore facturé'}
          </div>
        </div>
        <span style={{fontSize:11, color:'var(--brand-800)', fontWeight:600, textDecoration:'underline', flexShrink:0}}>+ Facturer</span>
      </button>
    )
  }
  const paye = fact.statut === 'paye'
  return (
    <div style={{
      padding:'10px 12px', borderRadius:10, border:'1px solid var(--ink-200)',
      background:'#fff', display:'flex', justifyContent:'space-between', alignItems:'center', gap:8,
    }}>
      <div style={{minWidth:0}}>
        <div style={{fontSize:12, fontWeight:600, color:'var(--ink-900)'}}>{title}</div>
        <div style={{fontSize:10.5, color:'var(--ink-500)', marginTop:2}}>
          {fact.date_paiement ? `Réglé ${new Date(fact.date_paiement).toLocaleDateString('fr-FR')}` : 'Pas encore daté'}
        </div>
      </div>
      <div style={{display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4, flexShrink:0}}>
        <span className="tnum" style={{fontSize:12.5, fontWeight:700, color:'var(--ink-900)'}}>{fmtE(fact.montant_ttc)}</span>
        <div style={{display:'flex', gap:4, alignItems:'center'}}>
          {fact.pdf_path && (
            <button onClick={onView} title="Voir PDF"
              style={{padding:'2px 6px', fontSize:10, background:'transparent', color:'var(--brand-700)', border:'1px solid var(--ink-200)', borderRadius:6, cursor:'pointer'}}>📄</button>
          )}
          <button onClick={onTogglePaid} title={paye ? 'Marquer en attente' : 'Marquer payé'}
            style={{
              padding:'2px 8px', fontSize:10, fontWeight:700, borderRadius:99, cursor:'pointer',
              background: paye ? 'rgba(22,163,74,0.12)' : 'rgba(245,158,11,0.13)',
              color: paye ? '#15803d' : '#a16207',
              border:'none',
            }}>{paye ? 'Payé' : 'En attente'}</button>
        </div>
      </div>
    </div>
  )
}

function ContactRow({ icon, label, value, action }) {
  if (!value) return null
  const Inner = (
    <>
      <div style={{
        width:32, height:32, borderRadius:8, background:'var(--brand-50)', color:'var(--brand-800)',
        display:'grid', placeItems:'center', flex:'0 0 32px',
      }}>{icon}</div>
      <div style={{minWidth:0, flex:1}}>
        <div className="eyebrow">{label}</div>
        <div className="clip-1" style={{fontSize:13, color:'var(--ink-900)', fontWeight:600, marginTop:2}}>{value}</div>
      </div>
    </>
  )
  const style = {display:'flex', gap:10, alignItems:'center', minWidth:0, padding:'6px 0'}
  return action ? <a href={action} style={{...style, color:'inherit', textDecoration:'none'}}>{Inner}</a> : <div style={style}>{Inner}</div>
}

// ─── Visionneuse de document (PDF / image) ────────────────────────────────────
function DocViewer({ url, nom, onClose }) {
  // Libère les blob URLs quand la visionneuse se ferme
  useEffect(() => {
    return () => { if (url?.startsWith('blob:')) URL.revokeObjectURL(url) }
  }, [url])

  if (!url) return null
  const nomFichier = nom || url.split('/').pop() || 'Document'
  const estImage = /\.(jpg|jpeg|png|gif|webp|heic|heif)$/i.test(nomFichier)

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:300,
      display:'flex', flexDirection:'column', background:'rgba(0,0,0,0.95)',
    }} onClick={onClose}>
      {/* Barre haute */}
      <div
        style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'12px 18px', background:'rgba(15,23,42,0.95)', gap:14,
          flexShrink:0, borderBottom:'1px solid rgba(255,255,255,0.08)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <span className="clip-1" style={{color:'#fff', fontSize:13, fontWeight:600}}>{nomFichier}</span>
        <div style={{display:'flex', alignItems:'center', gap:8, flexShrink:0}}>
          <a
            href={url}
            download={nomFichier}
            target="_blank"
            rel="noreferrer"
            style={{
              display:'inline-flex', alignItems:'center', gap:6, fontSize:12, fontWeight:600,
              color:'#cbd5e1', padding:'6px 12px', borderRadius:8,
              background:'rgba(255,255,255,0.08)', textDecoration:'none', transition:'all 150ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.18)'; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#cbd5e1' }}
            onClick={e => e.stopPropagation()}
          >
            ⬇ Télécharger
          </a>
          <button
            onClick={onClose}
            style={{
              width:34, height:34, display:'grid', placeItems:'center',
              fontSize:18, lineHeight:1, color:'rgba(255,255,255,0.7)',
              border:'none', background:'rgba(255,255,255,0.08)', borderRadius:8, cursor:'pointer',
              transition:'all 150ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.18)'; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)' }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Corps */}
      <div style={{flex:1, overflow:'hidden'}} onClick={e => e.stopPropagation()}>
        {estImage ? (
          <div style={{width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', padding:16}}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={nomFichier} style={{maxWidth:'100%', maxHeight:'100%', objectFit:'contain', borderRadius:8, boxShadow:'0 20px 60px rgba(0,0,0,0.5)'}} />
          </div>
        ) : (
          <iframe
            src={url}
            style={{width:'100%', height:'100%', border:0}}
            title={nomFichier}
          />
        )}
      </div>
    </div>
  )
}

// ─── Panel fiches techniques artisan ─────────────────────────────────────────
function FichesTechPanel({ artisanId, dossierId, fichesCochees, onToggle, onCreated }) {
  const [fiches, setFiches] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewer, setViewer] = useState(null) // { url, nom }
  const [showForm, setShowForm] = useState(false)
  const [nouvelleFiche, setNouvelleFiche] = useState({ nom: '', description: '' })
  const [fichierFiche, setFichierFiche] = useState(null)
  const [savingFiche, setSavingFiche] = useState(false)

  useEffect(() => {
    const charger = async () => {
      const { data } = await supabase.from('fiches_techniques').select('*').eq('artisan_id', artisanId).order('nom')
      setFiches(data || [])
      setLoading(false)
    }
    charger()
  }, [artisanId])

  const ouvrirFiche = async (chemin, nom) => {
    const { data } = await supabase.storage.from('documents').createSignedUrl(chemin, 3600)
    if (data?.signedUrl) setViewer({ url: data.signedUrl, nom })
  }

  // Création d'une fiche technique depuis le chantier : crée la fiche pour
  // l'artisan puis l'auto-lie au dossier (chantier_fiches_techniques).
  const creerFiche = async () => {
    if (!nouvelleFiche.nom.trim()) return
    setSavingFiche(true)
    let url = null
    if (fichierFiche) {
      const ext = fichierFiche.name.split('.').pop()
      const chemin = `artisans/${artisanId}/fiches/${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage.from('documents').upload(chemin, fichierFiche)
      if (!uploadErr) url = chemin
    }
    const { data: nouvelle, error } = await supabase
      .from('fiches_techniques')
      .insert({ artisan_id: artisanId, nom: nouvelleFiche.nom.trim(), description: nouvelleFiche.description || null, url })
      .select().single()
    if (error || !nouvelle) { setSavingFiche(false); return }
    await supabase.from('chantier_fiches_techniques')
      .insert({ dossier_id: dossierId, fiche_technique_id: nouvelle.id, artisan_id: artisanId })
    const { data } = await supabase.from('fiches_techniques').select('*').eq('artisan_id', artisanId).order('nom')
    setFiches(data || [])
    await onCreated?.()
    setNouvelleFiche({ nom: '', description: '' })
    setFichierFiche(null)
    setShowForm(false)
    setSavingFiche(false)
  }

  if (loading) return <div className="page-loading" />
  return (
    <>
      {viewer && <DocViewer url={viewer.url} nom={viewer.nom} onClose={() => setViewer(null)} />}
      {fiches.length === 0 ? (
        <p style={{fontSize:11.5, color:'var(--ink-400)', marginTop:8}}>Aucune fiche technique pour cet artisan</p>
      ) : (
      <div style={{marginTop:8, padding:12, background:'var(--surface-2)', border:'1px solid var(--ink-200)', borderRadius:10, display:'flex', flexDirection:'column', gap:6}}>
        {fiches.map(fiche => {
          const cochee = fichesCochees.some(f => f.fiche_technique_id === fiche.id)
          return (
            <div key={fiche.id} style={{display:'flex', alignItems:'center', gap:8}}>
              <label style={{display:'flex', alignItems:'center', gap:8, cursor:'pointer', flex:1, minWidth:0}}>
                <input type="checkbox" checked={cochee} onChange={() => onToggle(fiche.id, artisanId)}
                  style={{width:16, height:16, accentColor:'var(--brand-500)', flexShrink:0}} />
                <span className="clip-1" style={{fontSize:11.5, color:'var(--ink-700)'}}>{fiche.nom}</span>
                {fiche.description && <span className="clip-1" style={{fontSize:11.5, color:'var(--ink-400)'}}>— {fiche.description}</span>}
              </label>
              {fiche.url && (
                <button
                  onClick={() => ouvrirFiche(fiche.url, fiche.nom)}
                  style={{
                    flexShrink:0, fontSize:11, color:'var(--brand-700)',
                    border:'1px solid var(--brand-200)', padding:'2px 10px', borderRadius:6,
                    background:'transparent', cursor:'pointer', transition:'all 150ms',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--brand-50)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                  📄 Voir
                </button>
              )}
            </div>
          )
        })}
      </div>
      )}
      {!showForm ? (
        <button onClick={() => setShowForm(true)} className="btn btn-ghost" style={{fontSize:11, marginTop:8, alignSelf:'flex-start'}}>
          + Créer une fiche technique
        </button>
      ) : (
        <div style={{display:'flex', flexDirection:'column', gap:8, padding:'10px 12px', marginTop:8, background:'var(--surface-1)', borderRadius:8, border:'1px solid var(--ink-100)'}}>
          <input
            placeholder="Nom de la fiche *"
            value={nouvelleFiche.nom}
            onChange={e => setNouvelleFiche(p => ({...p, nom: e.target.value}))}
            style={{fontSize:12, padding:'5px 8px', borderRadius:6, border:'1px solid var(--ink-200)', outline:'none'}} />
          <textarea
            placeholder="Description (optionnel)"
            value={nouvelleFiche.description}
            onChange={e => setNouvelleFiche(p => ({...p, description: e.target.value}))}
            rows={2}
            style={{fontSize:12, padding:'5px 8px', borderRadius:6, border:'1px solid var(--ink-200)', resize:'vertical', outline:'none'}} />
          <label style={{fontSize:11, color:'var(--ink-500)', cursor:'pointer'}}>
            📎 {fichierFiche ? fichierFiche.name : 'Joindre un PDF (optionnel)'}
            <input type="file" accept=".pdf" style={{display:'none'}}
              onChange={e => setFichierFiche(e.target.files[0] || null)} />
          </label>
          <div style={{display:'flex', gap:8, justifyContent:'flex-end'}}>
            <button onClick={() => { setShowForm(false); setNouvelleFiche({nom:'',description:''}); setFichierFiche(null) }}
              className="btn btn-ghost" style={{fontSize:11}}>Annuler</button>
            <button onClick={creerFiche}
              disabled={!nouvelleFiche.nom.trim() || savingFiche}
              className="btn btn-primary" style={{fontSize:11}}>
              {savingFiche ? 'Création…' : 'Créer et lier'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Modal d'ajout / édition d'un devis ───────────────────────────────────────
function DevisModal({ open, devis, onClose, onSave, artisans }) {
  const isEdit = !!devis
  const initForm = () => ({
    artisan_id: devis?.artisan_id || '',
    montant_ht: devis?.montant_ht ?? '',
    montant_ttc: devis?.montant_ttc ?? '',
    ttc_manuel: devis?.ttc_manuel ?? false,
    commission_pourcentage: devis?.commission_pourcentage != null ? (devis.commission_pourcentage * 100).toFixed(1) : '',
    sans_commission: devis?.commission_pourcentage === 0,
    date_reception: devis?.date_reception || '',
    date_limite: devis?.date_limite || '',
    notes: devis?.notes || '',
    acompte_pourcentage: devis?.acompte_pourcentage ?? 30,
    acompte_montant_fixe: devis?.acompte_montant_fixe ?? '',
    fichier: null,
  })
  const [form, setForm] = useState(initForm)

  useEffect(() => {
    if (open) setForm(initForm())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, devis?.id])

  const set = (champ, val) => setForm(f => ({ ...f, [champ]: val }))
  if (!open) return null

  const htNum  = parseFloat(form.montant_ht)
  const ttcNum = parseFloat(form.montant_ttc)
  const ttcInferieurHt = Number.isFinite(htNum) && Number.isFinite(ttcNum) && ttcNum < htNum
  const canSave = !!form.artisan_id && form.montant_ht !== '' && !ttcInferieurHt

  return (
    <ModalShell
      title={isEdit ? 'Modifier le devis' : 'Nouveau devis'}
      onClose={onClose}
      width={600}
      footer={<>
        <button onClick={onClose} className="btn btn-ghost">Annuler</button>
        <button onClick={() => onSave(form)} className="btn btn-primary" disabled={!canSave}>
          {isEdit ? 'Enregistrer' : 'Créer le devis'}
        </button>
      </>}
    >
        <div style={{padding:24, overflow:'auto', display:'flex', flexDirection:'column', gap:14}}>
          {!isEdit && (
            <div>
              <label className="eyebrow" style={{display:'block', marginBottom:6}}>Artisan *</label>
              <select className="input" value={form.artisan_id} onChange={e => set('artisan_id', e.target.value)} style={{height:40, width:'100%'}}>
                <option value="">— Choisir un artisan —</option>
                {artisans.map(a => (
                  <option key={a.id} value={a.id}>{a.entreprise}{a.metier ? ` (${a.metier})` : ''}</option>
                ))}
              </select>
            </div>
          )}

          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
            <div>
              <label className="eyebrow" style={{display:'block', marginBottom:6}}>Montant HT (€)</label>
              <input type="number" step="0.01" min="0" className="input"
                value={form.montant_ht}
                onChange={e => {
                  const ht = e.target.value
                  setForm(f => f.ttc_manuel
                    ? { ...f, montant_ht: ht }
                    : { ...f, montant_ht: ht, montant_ttc: ht !== '' ? (parseFloat(ht) * TVA_TRAVAUX).toFixed(2) : '' })
                }}
                style={{height:40, width:'100%'}} />
            </div>
            <div>
              <label className="eyebrow" style={{display:'block', marginBottom:6}}>Montant TTC (€) <span style={{color:'var(--ink-400)', fontWeight:400, textTransform:'none'}}>{form.ttc_manuel ? 'figé / manuel' : 'auto +10%'}</span></label>
              <input type="number" step="0.01" min="0" className="input"
                value={form.montant_ttc}
                onChange={e => setForm(f => ({ ...f, montant_ttc: e.target.value, ttc_manuel: true }))}
                style={{height:40, width:'100%'}} />
            </div>
          </div>

          {ttcInferieurHt && (
            <div style={{background:'#fef2f2', border:'1px solid #fecaca', color:'#b91c1c', borderRadius:8, padding:'8px 12px', fontSize:13, fontWeight:600}}>
              Le TTC ne peut pas être inférieur au HT.
            </div>
          )}

          <div>
            <label className="eyebrow" style={{display:'block', marginBottom:6}}>Commission (%)</label>
            <input type="number" step="0.1" min="0" max="100" className="input"
              value={form.sans_commission ? '0' : form.commission_pourcentage}
              placeholder="ex: 15"
              disabled={form.sans_commission}
              onChange={e => set('commission_pourcentage', e.target.value)}
              style={{height:40, width:'100%', opacity: form.sans_commission ? 0.5 : 1}} />
            <label style={{display:'flex', alignItems:'center', gap:8, marginTop:8, cursor:'pointer'}}>
              <input type="checkbox" checked={form.sans_commission}
                onChange={e => set('sans_commission', e.target.checked)}
                style={{width:14, height:14, accentColor:'var(--brand-700)'}} />
              <span style={{fontSize:12, color:'var(--ink-500)'}}>Sans commission ni honoraires</span>
            </label>
          </div>

          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
            <div>
              <label className="eyebrow" style={{display:'block', marginBottom:6}}>Date de réception</label>
              <input type="date" className="input" value={form.date_reception} onChange={e => set('date_reception', e.target.value)} style={{height:40, width:'100%'}} />
            </div>
            <div>
              <label className="eyebrow" style={{display:'block', marginBottom:6}}>Date limite</label>
              <input type="date" className="input" value={form.date_limite} onChange={e => set('date_limite', e.target.value)} style={{height:40, width:'100%'}} />
            </div>
          </div>

          <div style={{paddingTop:14, borderTop:'1px solid var(--ink-100)'}}>
            <label className="eyebrow" style={{display:'block', marginBottom:8}}>Acompte</label>
            <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
              <select className="input" value={form.acompte_pourcentage}
                onChange={e => set('acompte_pourcentage', parseFloat(e.target.value))}
                style={{height:36, width:130}}>
                <option value={30}>30 %</option>
                <option value={40}>40 %</option>
                <option value={-1}>Montant fixe</option>
                <option value={0}>Sans acompte</option>
              </select>
              {form.acompte_pourcentage === -1 && (
                <input type="number" step="0.01" min="0" className="input"
                  placeholder="Montant TTC"
                  value={form.acompte_montant_fixe}
                  onChange={e => set('acompte_montant_fixe', e.target.value)}
                  style={{height:36, width:140}} />
              )}
            </div>
          </div>

          <div>
            <label className="eyebrow" style={{display:'block', marginBottom:6}}>Description</label>
            <textarea className="input" value={form.notes} onChange={e => set('notes', e.target.value)}
              rows={3} placeholder="Description des travaux…"
              style={{width:'100%', padding:'10px 12px', lineHeight:1.5, resize:'vertical'}} />
          </div>

          {!isEdit && (
            <div>
              <label className="eyebrow" style={{display:'block', marginBottom:6}}>PDF du devis (optionnel)</label>
              <label className="btn btn-ghost" style={{cursor:'pointer', justifyContent:'center', borderStyle:'dashed', padding:'10px 14px'}}>
                {form.fichier ? `✓ ${form.fichier.name}` : '📎 Choisir un PDF'}
                <input type="file" accept=".pdf" style={{display:'none'}}
                  onChange={e => set('fichier', e.target.files[0] || null)} />
              </label>
              {form.fichier && (
                <button onClick={() => set('fichier', null)} className="btn btn-ghost" style={{fontSize:11, padding:'4px 10px', marginTop:6, color:'#b91c1c'}}>
                  Supprimer le fichier
                </button>
              )}
            </div>
          )}
        </div>
    </ModalShell>
  )
}

const fmt = (n) => {
  const v = (Number(n) || 0).toFixed(2)
  const [int, dec] = v.split('.')
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + '.' + dec + ' €'
}

// Édition inline des taux d'une simulation (courtage % + AMO %) — comparateur.
function TauxEditor({ sim, onSave, onCancel }) {
  const [tc, setTc] = useState(String(sim.taux_courtage ?? ''))
  const [ta, setTa] = useState(String(sim.taux_amo ?? ''))
  const inp = { width:46, fontSize:11, padding:'2px 4px', border:'1px solid var(--ink-200)', borderRadius:6, textAlign:'center' }
  return (
    <div style={{display:'flex', gap:4, alignItems:'center', flexWrap:'wrap', justifyContent:'center'}}>
      <input type="number" value={tc} onChange={e => setTc(e.target.value)} style={inp} title="Courtage %" />
      <span style={{fontSize:10, color:'var(--ink-400)'}}>C</span>
      <input type="number" value={ta} onChange={e => setTa(e.target.value)} style={inp} title="AMO %" />
      <span style={{fontSize:10, color:'var(--ink-400)'}}>A</span>
      <button onClick={() => onSave(sim.id, tc, ta)} style={{border:'none', background:'none', cursor:'pointer', color:'#15803d', fontSize:13}} title="Valider">✓</button>
      <button onClick={onCancel} style={{border:'none', background:'none', cursor:'pointer', color:'#b91c1c', fontSize:13}} title="Annuler">✗</button>
    </div>
  )
}


// Signature groupée des photos : 1 appel createSignedUrls au lieu de N appels.
async function signerPhotos(rows) {
  const list = rows || []
  if (!list.length) return []
  const { data } = await supabase.storage.from('photos').createSignedUrls(list.map(p => p.url), 3600)
  const parChemin = new Map((data || []).map(u => [u.path, u.signedUrl]))
  return list.map(p => ({ ...p, url_signee: parChemin.get(p.url) || '' }))
}

// Redimensionne une image (max `maxSide` px sur le plus grand côté) et la ré-encode en
// JPEG. Retourne un Blob (uploadé dans Storage, plus de base64 dans le body /api/cr).
// L'API Claude retaille de toute façon à ~1568 px → aucune perte utile pour l'IA ; la
// compression sert désormais à réduire le stockage et accélérer l'upload.
export default function FicheChantier({ params }) {
  const { id } = use(params)
  const [dossier, setDossier] = useState(null)
  const [client, setClient] = useState(null)
  const [profile, setProfile] = useState(null)
  const [prenomAdmin, setPrenomAdmin] = useState('—')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generatingPDF, setGeneratingPDF] = useState(null) // 'recapitulatif' | 'dossier_fin'
  const [erreur, setErreur] = useState('')
  const [succes, setSucces] = useState('')
  const [modalModif, setModalModif] = useState(false)
  const [devis, setDevis] = useState([])
  const [versionsDevis, setVersionsDevis] = useState({})   // { devis_id: [versions triées desc] }
  // Comparateur de devis (onglet dédié, lazy)
  const [simulations, setSimulations] = useState([])          // [{ id, nom, taux_courtage, taux_amo, lignes:[...] }]
  const [loadingComparateur, setLoadingComparateur] = useState(false)
  const [editingTaux, setEditingTaux] = useState(null)        // simulation_id en cours d'édition
  const [editingMontant, setEditingMontant] = useState(null)  // ligne_id en cours d'édition
  const [historiqueBasesOuvert, setHistoriqueBasesOuvert] = useState(false)  // comparateur : replier/déplier les bases historiques
  const [artisans, setArtisans] = useState([])
  const [devisModal, setDevisModal] = useState({ open: false, devis: null })
  const [devisExpanded, setDevisExpanded] = useState(() => new Set())
  const toggleDevisExpand = (id) => setDevisExpanded(s => {
    const next = new Set(s)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const [photos, setPhotos] = useState([])
  const [zippingPhotos, setZippingPhotos] = useState(false)
  const [categorie, setCategorie] = useState('all')
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photosAffichees, setPhotosAffichees] = useState(3)
  const [uploadingDoc, setUploadingDoc] = useState(null) // devisId en cours d'upload
  const [comptesRendus, setComptesRendus] = useState([])
  const [messages, setMessages] = useState([])
  const [factures, setFactures] = useState([])
  const [ajouterFacture, setAjouterFacture] = useState(null) // devisId en cours
  const [nouvelleFacture, setNouvelleFacture] = useState({
    montant_ttc: '',
    date_paiement: '',
    statut: 'en_attente',
    fichier: null,
    libelle: 'Facture acompte',
    libelle_autre: ''
  })
  const [uploadingFacturePdf, setUploadingFacturePdf] = useState(null)

  // CR avec IA
  const [crOuvert, setCrOuvert] = useState(null) // id du CR déplié dans la liste
  const [crModal, setCrModal] = useState(false)
  const [crManuelModal, setCrManuelModal] = useState(false)
  const [crManuelForm, setCrManuelForm] = useState({ type_visite: '', date_visite: '', contenu: '' })
  const [crManuelSaving, setCrManuelSaving] = useState(false)
  const [crEditId, setCrEditId] = useState(null) // null = création ; sinon id du CR édité
  const [crEtape, setCrEtape] = useState(1) // 1=config, 2=notes, 3=relecture
  const [crForm, setCrForm] = useState({ type_visite: '', date_visite: '', intervenants: '' })
  const [crNotes, setCrNotes] = useState('')
  const [crImages, setCrImages] = useState([]) // [{ path, url_signee }] — photos uploadées dans Storage (chantiers/{id}/cr/)
  const [crPhotosUp, setCrPhotosUp] = useState(false) // upload de photos CR en cours
  const [crPhotosDossier, setCrPhotosDossier] = useState([]) // paths (photos.url) de photos EXISTANTES du dossier — jamais supprimées de Storage
  const [crVocal, setCrVocal] = useState(false)
  const [crVocalTexte, setCrVocalTexte] = useState('')
  const [crAudioTexte, setCrAudioTexte] = useState('')       // transcription Deepgram (audio enregistré/déposé)
  const [crRecording, setCrRecording] = useState(false)
  const [crTranscribing, setCrTranscribing] = useState(false)
  const crMediaRec = useRef(null)
  const crAudioChunks = useRef([])
  const [crGenerating, setCrGenerating] = useState(false)
  const [crGenere, setCrGenere] = useState(null) // { titre, sections[] }
  const [crSectionsEditees, setCrSectionsEditees] = useState([])
  const [crSavingFinal, setCrSavingFinal] = useState(false)
  const [crDocsSelectionnes, setCrDocsSelectionnes] = useState([])
  const [nbMsgNonLus, setNbMsgNonLus] = useState(0)
  const [photoOuverte, setPhotoOuverte] = useState(null)
  const [rdvsDossier, setRdvsDossier] = useState([])
  const [modalRdvOuvert, setModalRdvOuvert] = useState(false)
  const [rdvEnEdition, setRdvEnEdition] = useState(null)
  const [interventionEnEdition, setInterventionEnEdition] = useState(null)
  const [modalInterventionOuvert, setModalInterventionOuvert] = useState(false)
  const [interventionsDossier, setInterventionsDossier] = useState([])
  const [nouveauRdvDossier, setNouveauRdvDossier] = useState({ type_rdv: 'visite_technique_client', date_heure: '', duree_minutes: 60, artisan_id: '', notes: '', titre: '', lieu: 'client', cible_id: '' })
  const [modalCreerIntervOuvert, setModalCreerIntervOuvert] = useState(false)
  const [nouvIntervArtisanId, setNouvIntervArtisanId] = useState(null)
  const [nouvIntervForm, setNouvIntervForm] = useState({ type_intervention: 'periode', date_debut: '', date_fin: '', jours_specifiques: [], notes: '', heure_debut: '', duree_minutes: 60, lieu: 'client', cible_id: '' })
  // Cibles calendrier (lot 3b). INERTE : le push lit encore GOOGLE_CALENDAR_ID (lot 4).
  const [cibles, setCibles] = useState([])
  const [fichesTechChantier, setFichesTechChantier] = useState({})
  const [fichesPanelOuvert, setFichesPanelOuvert] = useState(null)
  const [documents, setDocuments] = useState([])
  const [uploadingDocChantier, setUploadingDocChantier] = useState(false)
  const [uploadingContrat, setUploadingContrat] = useState(false)
  const [docViewer, setDocViewer] = useState(null) // { url, nom }
  const [suiviFinancier, setSuiviFinancier] = useState([])
  // Solde AMO échelonné (UI) : panneau déplié + mini-formulaire d'ajout de tranche.
  const [soldeAmoDeplie, setSoldeAmoDeplie] = useState(false)
  const [soldeAmoForm, setSoldeAmoForm] = useState({ montant: '', date: '' })
  const router = useRouter()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      // Le dossier ET tous ses enfants sont récupérés en UNE requête imbriquée
      // (embedding PostgREST via les FK dossier_id) au lieu de ~11 requêtes séparées :
      // 1 seul aller-retour au lieu de 14 → fini la file d'attente sur le pool de connexions.
      // La RLS s'applique à chaque table imbriquée comme aux requêtes séparées (même
      // cloisonnement P0-9, enfants atteignables uniquement via un parent visible).
      // Restent séparés : profile (own), profile (admin), liste artisans, signature photos (storage).
      // Profil propre fetché d'abord pour connaître le rôle ; le fetch admin n'est exécuté
      // QUE pour un admin (policy L5a-1 : agente n'accède qu'à son propre profil).
      const { data: profData } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(profData)
      const isAdmin = profData?.role === 'admin'

      const [dossierRes, adminRes, artisansRes, ciblesRes] = await Promise.all([
        supabase.from('dossiers').select(`
          *,
          referente:profiles!dossiers_referente_id_fkey(id, prenom, nom, role),
          client:clients(*),
          devis_artisans(*, artisan:artisans(id, entreprise, metier, partenaire, paiement_direct)),
          photos(*),
          rendez_vous(*, artisan:artisans(id, entreprise)),
          interventions_artisans(*, artisan:artisans(id, entreprise)),
          suivi_financier(*),
          chantier_documents(*),
          factures_artisans(*),
          comptes_rendus(*),
          messages(*, auteur:profiles(prenom, nom, role)),
          chantier_fiches_techniques(*, fiche:fiches_techniques(id, nom, description))
        `)
          .eq('id', id)
          .order('ordre',      { referencedTable: 'devis_artisans' })
          .order('created_at', { referencedTable: 'devis_artisans' })
          .order('created_at', { referencedTable: 'photos', ascending: false })
          .order('date_heure', { referencedTable: 'rendez_vous' })
          .order('date_debut', { referencedTable: 'interventions_artisans' })
          .order('created_at', { referencedTable: 'chantier_documents', ascending: false })
          .order('created_at', { referencedTable: 'factures_artisans' })
          .order('created_at', { referencedTable: 'comptes_rendus', ascending: false })
          .order('created_at', { referencedTable: 'messages' })
          .single(),
        isAdmin
          ? supabase.from('profiles').select('prenom, nom').eq('role', 'admin').order('prenom').limit(1).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from('artisans').select('id, entreprise, metier, partenaire').order('entreprise'),
        supabase.from('cibles_calendrier').select('*').eq('actif', true).order('created_at'),
      ])

      const d = dossierRes.data
      setCibles(ciblesRes.data || [])

      if (adminRes.data) { setPrenomAdmin(adminRes.data.prenom || '—') }
      setDossier(d)
      setClient(d?.client)
      setDevis(d?.devis_artisans || [])
      setArtisans(artisansRes.data || [])
      setRdvsDossier(d?.rendez_vous || [])
      setInterventionsDossier(d?.interventions_artisans || [])
      setSuiviFinancier(d?.suivi_financier || [])
      setDocuments(d?.chantier_documents || [])
      setFactures(d?.factures_artisans || [])
      setComptesRendus(d?.comptes_rendus || [])
      setMessages(d?.messages || [])
      setNbMsgNonLus((d?.messages || []).filter(m => m.auteur_role === 'client' && !m.lu_agence).length)

      const grouped = {}
      ;(d?.chantier_fiches_techniques || []).forEach(item => {
        if (!grouped[item.artisan_id]) grouped[item.artisan_id] = []
        grouped[item.artisan_id].push(item)
      })
      setFichesTechChantier(grouped)

      // Photos : signature groupée (1 appel) au lieu de N appels individuels.
      setPhotos(await signerPhotos(d?.photos))

      setLoading(false)
    }
    init()
  }, [id, router])

  const chargerPhotos = async () => {
    const { data } = await supabase.from('photos').select('*').eq('dossier_id', id).order('created_at', { ascending: false })
    setPhotos(await signerPhotos(data))
  }

  // Télécharge toutes les photos du dossier en un ZIP, rangées par catégorie.
  // Signed URLs régénérées au clic (60s), côté client uniquement (pas de route API).
  const telechargerZipPhotos = async () => {
    const photosOnly = photos.filter(p => p.type_media !== 'video')   // ZIP = photos uniquement (pas les vidéos, trop lourdes)
    if (photosOnly.length === 0) return
    setZippingPhotos(true)
    try {
      const { data: signed } = await supabase.storage.from('photos').createSignedUrls(photosOnly.map(p => p.url), 60)
      const parChemin = new Map((signed || []).map(u => [u.path, u.signedUrl]))
      const zip = new JSZip()
      for (const p of photosOnly) {
        const url = parChemin.get(p.url)
        if (!url) continue
        const blob = await (await fetch(url)).blob()
        const cat = ['avant', 'pendant', 'apres', 'maquette'].includes(p.categorie) ? p.categorie : 'autres'
        zip.folder(cat).file(`${cat}_${p.id}.jpg`, blob)
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const href = URL.createObjectURL(zipBlob)
      const a = document.createElement('a')
      a.href = href
      a.download = `Photos_${dossier.reference}.zip`
      a.click()
      URL.revokeObjectURL(href)
    } catch (e) {
      setErreur('Erreur ZIP : ' + e.message)
    }
    setZippingPhotos(false)
  }

  // Galerie chantier : photos ET vidéos (même table `photos`, colonne type_media).
  const uploadPhotos = async (fichiers) => {
    if (!fichiers.length) return
    setUploadingPhoto(true)
    let tropLourd = 0
    const resultats = await Promise.all(fichiers.map(async (fichier) => {
      const estVideo = (fichier.type || '').startsWith('video/') || /\.(mp4|mov|m4v|webm|avi|mkv|3gp)$/i.test(fichier.name)
      if (estVideo && fichier.size > MAX_VIDEO_MO * 1024 * 1024) { tropLourd++; return false }
      // Vidéo : envoyée telle quelle (pas de conversion). Photo : HEIC iPhone → JPEG.
      const f = estVideo ? fichier : await heicToJpegFile(fichier)
      const ext = (f.name.split('.').pop() || (estVideo ? 'mp4' : 'jpg')).toLowerCase()
      const chemin = `chantiers/${id}/${categorie}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error: uploadError } = await supabase.storage.from('photos').upload(chemin, f, { contentType: f.type || undefined })
      if (uploadError) return false
      const { error: insertErr } = await supabase.from('photos').insert({ dossier_id: id, url: chemin, categorie, uploaded_by: profile?.id, type_media: estVideo ? 'video' : 'photo' })
      if (insertErr) return false
      return true
    }))
    await chargerPhotos()
    setUploadingPhoto(false)
    const echecs = resultats.filter(r => !r).length
    if (echecs === 0) { setSucces('Fichier(s) ajouté(s) ✓'); return }
    const details = []
    if (tropLourd) details.push(`${tropLourd} vidéo(s) > ${MAX_VIDEO_MO} Mo refusée(s)`)
    const autres = echecs - tropLourd
    if (autres > 0) details.push(`${autres} en échec`)
    setErreur(`${resultats.length - echecs} ajouté(s) · ${details.join(' · ')} — réessayez.`)
  }

  const supprimerPhoto = async (photoId, chemin) => {
    if (!confirm('Supprimer cette photo ?')) return
    const { error: rmErr } = await supabase.storage.from('photos').remove([chemin])
    if (rmErr) console.error('Suppression fichier photo (non bloquant) :', rmErr.message)
    const { error } = await supabase.from('photos').delete().eq('id', photoId)
    if (error) { setErreur('Erreur : ' + error.message); return }
    await chargerPhotos()
  }

  const chargerRdvsDossier = async () => {
    const { data } = await supabase.from('rendez_vous').select('*, artisan:artisans(id, entreprise)').eq('dossier_id', id).order('date_heure')
    setRdvsDossier(data || [])
    const { data: intData } = await supabase.from('interventions_artisans').select('*, artisan:artisans(id, entreprise)').eq('dossier_id', id).order('date_debut')
    setInterventionsDossier(intData || [])
  }

  // Push unitaire vers Google après une sauvegarde (création/édition). Dupliqué du
  // planning (plomberie, ~6 lignes) : pas de gate googleConnected ici (indisponible en
  // fiche chantier) — la route push (lot 4a) skip proprement si pas de cible/tokens, et
  // l'appel est non bloquant (la sauvegarde DB a déjà réussi). cible_id résout le calendrier.
  const pushToGoogle = (type, pushId) => {
    if (!pushId || !profile?.id) return
    authHeaders().then(headers => fetch('/api/google/calendar/push', {
      method: 'POST', headers, body: JSON.stringify({ type, id: pushId }),
    })).catch(() => {})
  }

  const sauvegarderRdvDossier = async () => {
    const { data, error } = await supabase.from('rendez_vous').insert({
      dossier_id: id, type_rdv: nouveauRdvDossier.type_rdv, date_heure: parisLocalToInstant(nouveauRdvDossier.date_heure),
      duree_minutes: parseInt(nouveauRdvDossier.duree_minutes), artisan_id: nouveauRdvDossier.artisan_id || null, notes: nouveauRdvDossier.notes || null,
      titre: nouveauRdvDossier.type_rdv === 'autres' ? (nouveauRdvDossier.titre || null) : null,
      lieu: nouveauRdvDossier.lieu || 'client',
      agence_id: dossier?.agence_id || null,   // agence du dossier (le trigger fait foi, envoyé par cohérence)
      cible_id: nouveauRdvDossier.cible_id || null,   // calendrier cible (lot 4a) — résolu au push
    }).select('id').single()
    if (!error) {
      pushToGoogle('rdv', data?.id)   // non bloquant
      await chargerRdvsDossier()
      setModalRdvOuvert(false)
      setNouveauRdvDossier({ type_rdv: 'visite_technique_client', date_heure: '', duree_minutes: 60, artisan_id: '', notes: '', titre: '', lieu: 'client', cible_id: '' })
      setSucces('RDV créé ✓')
    } else { setErreur('Erreur : ' + error.message) }
  }

  const deleteGoogleEvent = async (googleEventId, cibleId) => {
    if (!googleEventId || !profile?.id) return
    try {
      await fetch('/api/google/calendar/event', {
        method: 'DELETE',
        headers: await authHeaders(),
        // cibleId (lot 5c) : capturé sur l'objet AVANT le delete DB → /event résout le bon calendrier.
        body: JSON.stringify({ googleEventId, cibleId }),
      })
    } catch (err) {
      console.error('Erreur suppression Google event:', err)
    }
  }

  const supprimerRdvDossier = async (rdvId) => {
    if (!confirm('Supprimer ce RDV ?')) return
    const rdv = rdvsDossier.find(r => r.id === rdvId)
    const { error } = await supabase.from('rendez_vous').delete().eq('id', rdvId)
    if (error) { setErreur('Erreur : ' + error.message); return }
    if (rdv?.google_event_id) await deleteGoogleEvent(rdv.google_event_id, rdv.cible_id)
    await chargerRdvsDossier()
  }

  const modifierRdvDossier = async () => {
    if (!rdvEnEdition) return
    const { error } = await supabase.from('rendez_vous').update({
      type_rdv: rdvEnEdition.type_rdv, date_heure: parisLocalToInstant(rdvEnEdition.date_heure),
      duree_minutes: parseInt(rdvEnEdition.duree_minutes), artisan_id: rdvEnEdition.artisan_id || null, notes: rdvEnEdition.notes || null,
      titre: rdvEnEdition.type_rdv === 'autres' ? (rdvEnEdition.titre || null) : null,
      lieu: rdvEnEdition.lieu || 'client',
      cible_id: rdvEnEdition.cible_id || null,   // calendrier cible (lot 4a) — résolu au push
    }).eq('id', rdvEnEdition.id)
    if (error) { setErreur('Erreur : ' + error.message); return }
    pushToGoogle('rdv', rdvEnEdition.id)   // non bloquant
    await chargerRdvsDossier()
    setModalRdvOuvert(false)
    setRdvEnEdition(null)
    setSucces('RDV modifié ✓')
  }

  const creerInterventionDossier = async () => {
    if (!nouvIntervArtisanId) return
    setSaving(true)
    setErreur('')
    try {
      const payload = {
        dossier_id: id,
        artisan_id: nouvIntervArtisanId,
        type_intervention: nouvIntervForm.type_intervention,
        date_debut: nouvIntervForm.date_debut || null,
        date_fin: nouvIntervForm.type_intervention === 'periode' ? nouvIntervForm.date_fin || null : null,
        jours_specifiques: nouvIntervForm.type_intervention === 'jours_specifiques' ? nouvIntervForm.jours_specifiques : null,
        notes: nouvIntervForm.notes || null,
        heure_debut: nouvIntervForm.heure_debut || null,
        duree_minutes: nouvIntervForm.heure_debut ? (nouvIntervForm.duree_minutes || 60) : null,
        lieu: nouvIntervForm.lieu || 'client',
        agence_id: dossier?.agence_id || null,   // agence du dossier (le trigger fait foi, envoyé par cohérence)
        cible_id: nouvIntervForm.cible_id || null,   // calendrier cible (lot 4a) — résolu au push
      }
      const { data: intData, error: insertErr } = await supabase.from('interventions_artisans').insert(payload).select('*, artisan:artisans(id, entreprise)')
      if (insertErr) { setErreur('Erreur : ' + insertErr.message); return }
      pushToGoogle('intervention', intData?.[0]?.id)   // push unitaire (lot 4c), non bloquant
      await chargerRdvsDossier()
      setModalCreerIntervOuvert(false)
      setNouvIntervArtisanId(null)
      setNouvIntervForm({ type_intervention: 'periode', date_debut: '', date_fin: '', jours_specifiques: [], notes: '', heure_debut: '', duree_minutes: 60, lieu: 'client', cible_id: '' })
      setSucces('Intervention planifiée ✓')
    } catch (err) {
      setErreur('Erreur inattendue : ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const modifierInterventionDossier = async () => {
    if (!interventionEnEdition) return
    setErreur('')
    const { error } = await supabase.from('interventions_artisans').update({
      type_intervention: interventionEnEdition.type_intervention,
      date_debut: interventionEnEdition.date_debut || null,
      date_fin: interventionEnEdition.type_intervention === 'periode' ? interventionEnEdition.date_fin || null : null,
      jours_specifiques: interventionEnEdition.type_intervention === 'jours_specifiques' ? interventionEnEdition.jours_specifiques : null,
      notes: interventionEnEdition.notes || null,
      heure_debut: interventionEnEdition.heure_debut || null,
      duree_minutes: interventionEnEdition.heure_debut ? (interventionEnEdition.duree_minutes || 60) : null,
      lieu: interventionEnEdition.lieu || 'client',
      cible_id: interventionEnEdition.cible_id || null,   // calendrier cible (lot 4a) — résolu au push
    }).eq('id', interventionEnEdition.id)
    if (error) { setErreur('Erreur : ' + error.message); return }
    pushToGoogle('intervention', interventionEnEdition.id)   // non bloquant
    await chargerRdvsDossier()
    setModalInterventionOuvert(false)
    setInterventionEnEdition(null)
    setSucces('Intervention modifiée ✓')
  }

  const supprimerInterventionDossier = async (intId) => {
    if (!confirm('Supprimer cette intervention ?')) return
    const intervention = interventionsDossier.find(i => i.id === intId)
    const { error } = await supabase.from('interventions_artisans').delete().eq('id', intId)
    if (error) { setErreur('Erreur : ' + error.message); return }
    if (intervention?.google_event_id) await deleteGoogleEvent(intervention.google_event_id, intervention.cible_id)
    const { data } = await supabase.from('interventions_artisans').select('*, artisan:artisans(id, entreprise)').eq('dossier_id', id).order('date_debut')
    setInterventionsDossier(data || [])
  }

  // Pré-sélection de la cible à l'ouverture des modales de CRÉATION (jamais en édition,
  // où la valeur vient de la base). Le dossier est FIXE ici → agence toujours connue
  // (dossier.agence_id), donc pas de sélecteur d'agence ni de validation : on résout via
  // le helper partagé (cohérence avec le planning) et on ne remplit que si le champ est vide.
  useEffect(() => {
    if (!modalRdvOuvert || rdvEnEdition) return
    const agenceConcernee = determinerAgenceConcernee({ dossier, profileAgenceId: profile?.agence_id })
    const def = resoudreCibleDefaut({ profile, cibles, agenceConcernee }) || ''
    setNouveauRdvDossier(f => (f.cible_id ? f : { ...f, cible_id: def }))
  }, [modalRdvOuvert]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!modalCreerIntervOuvert) return
    const agenceConcernee = determinerAgenceConcernee({ dossier, profileAgenceId: profile?.agence_id })
    const def = resoudreCibleDefaut({ profile, cibles, agenceConcernee }) || ''
    setNouvIntervForm(f => (f.cible_id ? f : { ...f, cible_id: def }))
  }, [modalCreerIntervOuvert]) // eslint-disable-line react-hooks/exhaustive-deps

  const chargerFichesTechChantier = async () => {
    const { data } = await supabase.from('chantier_fiches_techniques').select('*, fiche:fiches_techniques(id, nom, description)').eq('dossier_id', id)
    const grouped = {}
    ;(data || []).forEach(item => {
      if (!grouped[item.artisan_id]) grouped[item.artisan_id] = []
      grouped[item.artisan_id].push(item)
    })
    setFichesTechChantier(grouped)
  }

  const toggleFicheTech = async (ficheId, artisanId) => {
    const dejaCochee = fichesTechChantier[artisanId]?.some(f => f.fiche_technique_id === ficheId)
    if (dejaCochee) {
      const item = fichesTechChantier[artisanId].find(f => f.fiche_technique_id === ficheId)
      const { error } = await supabase.from('chantier_fiches_techniques').delete().eq('id', item.id)
      if (error) { setErreur('Erreur : ' + error.message); return }
    } else {
      const { error } = await supabase.from('chantier_fiches_techniques').insert({ dossier_id: id, fiche_technique_id: ficheId, artisan_id: artisanId })
      if (error) { setErreur('Erreur : ' + error.message); return }
    }
    await chargerFichesTechChantier()
  }

  const chargerDevis = async () => {
    const { data } = await supabase.from('devis_artisans').select('*, artisan:artisans(id, entreprise, metier, partenaire, paiement_direct)').eq('dossier_id', id).order('ordre').order('created_at')
    setDevis(data || [])
    // Historique des versions (Phase 3) — groupé par devis, plus récent d'abord.
    const ids = (data || []).map(d => d.id)
    if (ids.length) {
      const { data: vs } = await supabase.from('devis_versions').select('*').in('devis_artisan_id', ids).order('version_num', { ascending: false })
      const map = {}
      for (const v of (vs || [])) (map[v.devis_artisan_id] ||= []).push(v)
      setVersionsDevis(map)
    } else setVersionsDevis({})
  }

  // ── Comparateur de devis : chargement + CRUD (sauvegarde auto, erreurs silencieuses) ──
  const chargerComparateur = async (skipSync = false) => {
    setLoadingComparateur(true)
    const { data, error } = await supabase
      .from('comparateur_simulations')
      .select('*, lignes:comparateur_lignes(*)')
      .eq('dossier_id', id)
      .order('created_at')
    if (error) { console.error('chargerComparateur :', error.message); setLoadingComparateur(false); return }

    // Base initiale : à l'ouverture, si aucune base n'existe encore, on fige l'état
    // courant comme « Base 1 ». skipSync évite la récursion.
    if (!skipSync && devis.length > 0 && !(data || []).some(s => s.type === 'base')) {
      await creerBaseComparateur()
      await chargerComparateur(true)
      return
    }

    // Synchro : crée les lignes manquantes pour les devis ajoutés après la création
    // d'une simulation. skipSync évite la récursion infinie (1 seul re-chargement).
    if (!skipSync && (data || []).length > 0 && devis.length > 0) {
      const aInserer = []
      for (const sim of data) {
        const devisManquants = devis.filter(d => !(sim.lignes || []).some(l => l.devis_artisan_id === d.id))
        for (const d of devisManquants) {
          aInserer.push({ simulation_id: sim.id, devis_artisan_id: d.id, inclus: true, montant_ttc_override: null })
        }
      }
      if (aInserer.length > 0) {
        const { error: errIns } = await supabase.from('comparateur_lignes').insert(aInserer)
        if (errIns) console.error('chargerComparateur (sync lignes) :', errIns.message)
        else { await chargerComparateur(true); return }   // re-charge une fois, sans re-synchroniser
      }
    }

    setSimulations(data || [])
    setLoadingComparateur(false)
  }

  // Comparateur — crée une BASE figée : une colonne épinglée sur la version COURANTE
  // de chaque devis (frise A-B-C-D). Appelée (a) à l'ouverture si aucune base,
  // (b) à chaque changement de MONTANT d'un devis. Non bloquant.
  const creerBaseComparateur = async () => {
    try {
      const { data: das } = await supabase.from('devis_artisans').select('id').eq('dossier_id', id)
      const devisIds = (das || []).map(d => d.id)
      if (!devisIds.length) return
      const { data: vs } = await supabase.from('devis_versions')
        .select('id, devis_artisan_id').in('devis_artisan_id', devisIds).eq('est_courante', true)
      const { data: bases } = await supabase.from('comparateur_simulations')
        .select('id').eq('dossier_id', id).eq('type', 'base')
      const num = (bases?.length || 0) + 1
      await supabase.from('comparateur_simulations').update({ est_base_courante: false })
        .eq('dossier_id', id).eq('est_base_courante', true)
      const { data: base } = await supabase.from('comparateur_simulations')
        .insert({ dossier_id: id, nom: `Base ${num}`, type: 'base', est_base_courante: true, taux_courtage: 6, taux_amo: 9 })
        .select().single()
      if (!base) return
      const lignes = (vs || []).map(v => ({
        simulation_id: base.id, devis_artisan_id: v.devis_artisan_id,
        devis_version_id: v.id, inclus: true, montant_ttc_override: null,
      }))
      if (lignes.length) await supabase.from('comparateur_lignes').insert(lignes)
    } catch (e) { console.error('creerBaseComparateur :', e?.message) }
  }

  // Nouvelle base seulement si le comparateur est déjà utilisé pour ce dossier
  // (≥1 simulation) — évite de générer des bases pour des dossiers jamais comparés.
  const majBaseSurChangementMontant = async () => {
    const { count } = await supabase.from('comparateur_simulations')
      .select('id', { count: 'exact', head: true }).eq('dossier_id', id)
    if ((count || 0) === 0) return
    await creerBaseComparateur()
  }

  const ajouterSimulation = async () => {
    const nom = `Simul ${simulations.length + 1}`
    const { data: sim, error } = await supabase
      .from('comparateur_simulations')
      .insert({ dossier_id: id, nom, taux_courtage: 6, taux_amo: 9 })
      .select().single()
    if (error || !sim) { console.error('ajouterSimulation :', error?.message); return }
    if (devis.length > 0) {
      const lignes = devis.map(d => ({ simulation_id: sim.id, devis_artisan_id: d.id, inclus: true, montant_ttc_override: null }))
      const { error: errL } = await supabase.from('comparateur_lignes').insert(lignes)
      if (errL) console.error('ajouterSimulation (lignes) :', errL.message)
    }
    await chargerComparateur()
  }

  const saveTaux = async (simId, taux_courtage, taux_amo) => {
    const tc = parseFloat(taux_courtage), ta = parseFloat(taux_amo)
    const payload = { taux_courtage: isNaN(tc) ? 0 : tc, taux_amo: isNaN(ta) ? 0 : ta }
    setSimulations(prev => prev.map(s => s.id === simId ? { ...s, ...payload } : s))
    setEditingTaux(null)
    const { error } = await supabase.from('comparateur_simulations').update(payload).eq('id', simId)
    if (error) console.error('saveTaux :', error.message)
  }

  const toggleInclus = async (simId, ligneId, valeur) => {
    setSimulations(prev => prev.map(s => s.id === simId
      ? { ...s, lignes: (s.lignes || []).map(l => l.id === ligneId ? { ...l, inclus: valeur } : l) } : s))
    const { error } = await supabase.from('comparateur_lignes').update({ inclus: valeur }).eq('id', ligneId)
    if (error) console.error('toggleInclus :', error.message)
  }

  const saveMontant = async (simId, ligneId, valeur) => {
    const v = (valeur === '' || valeur == null) ? null : parseFloat(valeur)
    const override = (v == null || isNaN(v)) ? null : v
    setSimulations(prev => prev.map(s => s.id === simId
      ? { ...s, lignes: (s.lignes || []).map(l => l.id === ligneId ? { ...l, montant_ttc_override: override } : l) } : s))
    setEditingMontant(null)
    const { error } = await supabase.from('comparateur_lignes').update({ montant_ttc_override: override }).eq('id', ligneId)
    if (error) console.error('saveMontant :', error.message)
  }

  // Sélecteur de version d'une ligne (simulations manuelles) : '' = version courante
  // (live). Choisir une version épingle la ligne dessus et efface l'override manuel
  // (le montant affiché devient celui de la version).
  const saveVersionLigne = async (simId, ligneId, versionId) => {
    const vid = versionId || null
    setSimulations(prev => prev.map(s => s.id === simId
      ? { ...s, lignes: (s.lignes || []).map(l => l.id === ligneId
          ? { ...l, devis_version_id: vid, montant_ttc_override: vid ? null : l.montant_ttc_override } : l) } : s))
    const payload = vid ? { devis_version_id: vid, montant_ttc_override: null } : { devis_version_id: null }
    const { error } = await supabase.from('comparateur_lignes').update(payload).eq('id', ligneId)
    if (error) console.error('saveVersionLigne :', error.message)
  }

  const supprimerSimulation = async (simId) => {
    if (!confirm('Supprimer cette simulation ?')) return
    setSimulations(prev => prev.filter(s => s.id !== simId))   // optimiste (CASCADE supprime les lignes)
    const { error } = await supabase.from('comparateur_simulations').delete().eq('id', simId)
    if (error) { console.error('supprimerSimulation :', error.message); await chargerComparateur() }
  }

  const deplacerDevis = async (devisId, direction) => {
    const idx = devis.findIndex(d => d.id === devisId)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= devis.length) return
    const a = devis[idx], b = devis[swapIdx]
    const ordreA = a.ordre ?? idx + 1, ordreB = b.ordre ?? swapIdx + 1
    const { error: errA } = await supabase.from('devis_artisans').update({ ordre: ordreB }).eq('id', a.id)
    const { error: errB } = await supabase.from('devis_artisans').update({ ordre: ordreA }).eq('id', b.id)
    if (errA || errB) setErreur('Erreur : ' + (errA || errB).message)
    await chargerDevis()
  }
  
  const set = (champ, valeur) => setDossier(d => ({ ...d, [champ]: valeur }))

  // Taux (courtage/AMO) : la frappe met à jour l'état (UI + recalcul live) ;
  // l'écriture DB se fait au blur / Enter (pas à chaque caractère). Rollback de
  // l'état vers la valeur d'avant édition (capturée au focus) si l'UPDATE échoue.
  const tauxAvantEditRef = useRef({})
  const persistTaux = async (champ, valeur) => {
    const { error } = await supabase.from('dossiers').update({ [champ]: valeur }).eq('id', id)
    if (error) {
      setErreur('Erreur : ' + error.message)
      const ancien = tauxAvantEditRef.current[champ]
      if (ancien !== undefined) set(champ, ancien)
    }
  }

  const referentEstAdmin = dossier?.referente?.role === 'admin'

  // Override MANUEL du statut (annule/termine) ou retour au calcul auto (null).
  // dossier.statut ne porte que ces 3 valeurs (CHECK strict, ÉTAPE D) ; sinon
  // calcStatut décide. Écriture immédiate + optimiste + rollback (pattern persistTaux).
  const majStatutManuel = async (valeur) => {
    if (valeur === 'annule' && !confirm('Annuler ce dossier ? Il sera marqué « Annulé » (réversible via « Ré-ouvrir »).')) return
    const ancien = dossier.statut ?? null
    set('statut', valeur)
    setErreur(''); setSucces('')

    // Expiration d'accès client (tr.3) — stockage seul, pas encore appliqué (tr.4/5).
    const payload = { statut: valeur }
    if (valeur === 'termine') {
      // date_cloture : on garde la 1ère clôture (ne pas écraser si re-clic).
      const dateCloture = dossier.date_cloture || new Date().toISOString().slice(0, 10)
      payload.date_cloture = dateCloture
      // Recalcul à chaque clôture : base = date_fin_chantier si renseignée, sinon date_cloture.
      payload.acces_expire_le = calculerExpiration({ date_fin_chantier: dossier.date_fin_chantier, date_cloture: dateCloture })
    } else if (valeur === null) {
      // Ré-ouverture : le dossier repart actif → accès de nouveau illimité.
      payload.acces_expire_le = null
    }
    // (valeur === 'annule' : on ne touche pas à l'expiration.)

    const { error } = await supabase.from('dossiers').update(payload).eq('id', id)
    if (error) { setErreur('Erreur : ' + error.message); set('statut', ancien); return }
    setDossier(d => ({ ...d, ...payload }))
    setSucces(valeur === 'termine' ? 'Dossier marqué terminé ✓' : valeur === 'annule' ? 'Dossier annulé ✓' : 'Dossier ré-ouvert (statut automatique) ✓')
  }


  const chargerDocuments = async () => {
    const { data } = await supabase.from('chantier_documents').select('*').eq('dossier_id', id).order('created_at', { ascending: false })
    setDocuments(data || [])
  }

  const uploadContrat = async (fichier) => {
    if (!fichier) return
    setUploadingContrat(true)
    setErreur('')
    const f = await heicToJpegFile(fichier)   // photo iPhone (HEIC) du contrat → JPEG
    const ext = f.name.split('.').pop()
    const chemin = `chantiers/${id}/contrat/contrat.${ext}`
    const { error } = await supabase.storage.from('documents').upload(chemin, f, { upsert: true })
    if (error) { setErreur('Erreur upload : ' + error.message); setUploadingContrat(false); return }
    // Auto-signature : déposer le PDF du contrat coche le mandat (sauf s'il l'est déjà).
    const today = new Date().toISOString().slice(0, 10)
    const payload = dossier.contrat_signe
      ? { contrat_url: chemin }
      : { contrat_url: chemin, contrat_signe: true, date_signature_contrat: today }
    const { error: updErr } = await supabase.from('dossiers').update(payload).eq('id', id)
    if (updErr) { setErreur('Erreur : ' + updErr.message); setUploadingContrat(false); return }
    setDossier(d => ({ ...d, ...payload }))
    setSucces('Contrat ajouté ✓')
    setUploadingContrat(false)
  }

  const ouvrirContrat = async () => {
    if (!dossier?.contrat_url) return
    const { data } = await supabase.storage.from('documents').createSignedUrl(dossier.contrat_url, 3600)
    if (data?.signedUrl) setDocViewer({ url: data.signedUrl, nom: dossier.contrat_url.split('/').pop() })
  }

  const supprimerContrat = async () => {
    if (!confirm('Supprimer le document du contrat ?')) return
    if (dossier?.contrat_url) {
      const { error: rmErr } = await supabase.storage.from('documents').remove([dossier.contrat_url])
      if (rmErr) console.error('Suppression fichier contrat (non bloquant) :', rmErr.message)
    }
    // Retirer le PDF décoche le mandat (symétrique de l'auto-signature à l'upload).
    const { error } = await supabase.from('dossiers').update({ contrat_url: null, contrat_signe: false, date_signature_contrat: null }).eq('id', id)
    if (error) { setErreur('Erreur : ' + error.message); return }
    setDossier(d => ({ ...d, contrat_url: null, contrat_signe: false, date_signature_contrat: null }))
    setSucces('Document supprimé ✓')
  }

  const uploadDocumentChantier = async (fichiers, options = {}) => {
    if (!fichiers?.length) return
    setUploadingDocChantier(true)
    let echecsDoc = 0
    for (const fichier of fichiers) {
      const ext = fichier.name.split('.').pop()
      const chemin = `chantiers/${id}/documents/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('documents').upload(chemin, fichier)
      if (error) { echecsDoc++; continue }
      const { error: insertErr } = await supabase.from('chantier_documents').insert({
        dossier_id: id, nom: fichier.name, path: chemin,
        type_mime: fichier.type, taille: fichier.size,
        dans_restitution: options.dans_restitution ?? false,
        categorie: options.categorie ?? detecterCategorie(fichier.name),
      })
      if (insertErr) { echecsDoc++; continue }
    }
    await chargerDocuments()
    if (echecsDoc === 0) setSucces('Document(s) ajouté(s) ✓')
    else setErreur(`${fichiers.length - echecsDoc} document(s) ajouté(s), ${echecsDoc} en échec — réessayez les manquants.`)
    setUploadingDocChantier(false)
  }

  const supprimerDocumentChantier = async (docId, path) => {
    if (!confirm('Supprimer ce document ?')) return
    const { error: rmErr } = await supabase.storage.from('documents').remove([path])
    if (rmErr) console.error('Suppression fichier document (non bloquant) :', rmErr.message)
    const { error } = await supabase.from('chantier_documents').delete().eq('id', docId)
    if (error) { setErreur('Erreur : ' + error.message); return }
    await chargerDocuments()
  }

  const toggleDansRestitution = async (docId, valeur) => {
    const { error } = await supabase.from('chantier_documents').update({ dans_restitution: valeur }).eq('id', docId)
    if (error) { setErreur('Erreur : ' + error.message); return }
    setDocuments(prev => prev.map(d => d.id === docId ? { ...d, dans_restitution: valeur } : d))
  }

  // Tague / dé-tague un document comme compte-rendu (NULL ↔ 'compte_rendu').
  // Maj optimiste + rollback si l'update échoue.
  const toggleCategorieCR = async (docId, estCR) => {
    const categorie = estCR ? 'compte_rendu' : null
    setDocuments(prev => prev.map(d => d.id === docId ? { ...d, categorie } : d))
    const { error } = await supabase.from('chantier_documents').update({ categorie }).eq('id', docId)
    if (error) {
      setDocuments(prev => prev.map(d => d.id === docId ? { ...d, categorie: estCR ? null : 'compte_rendu' } : d))
      setErreur('Erreur : ' + error.message)
    }
  }

  const chargerFactures = async () => {
    const { data } = await supabase.from('factures_artisans').select('*').eq('dossier_id', id).order('created_at')
    setFactures(data || [])
  }

  const ajouterFactureArtisan = async (devisId, artisanId) => {
    if (!nouvelleFacture.montant_ttc) return
    const libelleFinal = nouvelleFacture.libelle === 'Autre'
      ? (nouvelleFacture.libelle_autre || 'Facture').trim()
      : nouvelleFacture.libelle

    const { data: factureInseree, error } = await supabase.from('factures_artisans').insert({
      dossier_id: id,
      devis_id: devisId,
      artisan_id: artisanId,
      montant_ttc: parseFloat(nouvelleFacture.montant_ttc),
      date_paiement: nouvelleFacture.date_paiement || null,
      statut: nouvelleFacture.statut,
      libelle: libelleFinal
    }).select().single()
    // Échec de l'insert : on garde la saisie (pas de reset) pour réessayer.
    if (error) { setErreur('Erreur : ' + error.message); return }

    let uploadFactureOk = true
    if (factureInseree) {
      // E4 — upload PDF si fourni à la création
      if (nouvelleFacture.fichier) {
        const ext = nouvelleFacture.fichier.name.split('.').pop()
        const chemin = `chantiers/${id}/factures/${factureInseree.id}.${ext}`
        const { error: uploadErr } = await supabase.storage.from('documents').upload(chemin, nouvelleFacture.fichier)
        if (uploadErr) uploadFactureOk = false
        else await supabase.from('factures_artisans').update({ pdf_path: chemin }).eq('id', factureInseree.id)
      }
      // E5 — synchro suivi_financier si payé à la création
      if (nouvelleFacture.statut === 'paye') {
        const libelleNorm = (nouvelleFacture.libelle === 'Autre' ? nouvelleFacture.libelle_autre : nouvelleFacture.libelle || '').toLowerCase()
        const typeEch = libelleNorm.includes('acompte') ? 'acompte_artisan' : 'facture_finale'
        // acompte_artisan = clé par devis ; facture_finale = cas b (sans devis).
        const devisIdSuivi = typeEch === 'acompte_artisan' ? devisId : null
        await majSuiviAvecArtisan(typeEch, artisanId, 'statut_client', 'regle', devisIdSuivi)
        if (nouvelleFacture.date_paiement) {
          await majSuiviAvecArtisan(typeEch, artisanId, 'date_paiement', nouvelleFacture.date_paiement, devisIdSuivi)
        }
      }
    }

    await chargerFactures()
    setAjouterFacture(null)
    setNouvelleFacture({
      montant_ttc: '',
      date_paiement: '',
      statut: 'en_attente',
      fichier: null,
      libelle: 'Facture acompte',
      libelle_autre: ''
    })
    if (uploadFactureOk) setSucces('Facture ajoutée ✓')
    else setErreur('Facture ajoutée, mais échec de l\'upload du PDF — réessayez via la facture.')
  }

  const supprimerFactureArtisan = async (factureId, pdfPath) => {
    if (!confirm('Supprimer cette facture ?')) return
    // Storage best-effort : un fichier qui résiste ne doit pas bloquer la suppression
    // de la ligne (l'orphelin éventuel est sans gravité), mais on le signale.
    if (pdfPath) {
      const { error: rmErr } = await supabase.storage.from('documents').remove([pdfPath])
      if (rmErr) console.error('Suppression PDF facture (non bloquant) :', rmErr.message)
    }
    const { error } = await supabase.from('factures_artisans').delete().eq('id', factureId)
    if (error) { setErreur('Erreur : ' + error.message); return }
    await chargerFactures()
  }

  const toggleStatutFacture = async (factureId, statut) => {
    const newStatut = statut === 'paye' ? 'en_attente' : 'paye'
    const facture = factures.find(f => f.id === factureId)
    const datePaye = facture?.date_paiement || (newStatut === 'paye' ? new Date().toISOString().slice(0, 10) : null)
    const { error } = await supabase.from('factures_artisans').update({
      statut: newStatut,
      date_paiement: newStatut === 'paye' ? datePaye : null,
    }).eq('id', factureId)
    if (error) { setErreur('Erreur : ' + error.message); return }
    setFactures(prev => prev.map(f => f.id === factureId ? { ...f, statut: newStatut, date_paiement: newStatut === 'paye' ? datePaye : null } : f))
    // E5 — synchro suivi_financier (acompte_artisan si libellé 'acompte', sinon facture_finale)
    if (facture?.artisan_id) {
      const libelle = (facture.libelle || '').toLowerCase()
      const typeEch = libelle.includes('acompte') ? 'acompte_artisan' : 'facture_finale'
      const statutSuivi = newStatut === 'paye' ? 'regle' : 'en_attente'
      // acompte_artisan = clé par devis (facture.devis_id) ; facture_finale = cas b.
      const devisIdSuivi = typeEch === 'acompte_artisan' ? facture.devis_id : null
      await majSuiviAvecArtisan(typeEch, facture.artisan_id, 'statut_client', statutSuivi, devisIdSuivi)
      if (newStatut === 'paye' && datePaye) {
        await majSuiviAvecArtisan(typeEch, facture.artisan_id, 'date_paiement', datePaye, devisIdSuivi)
      }
    }
  }

  const uploadFacturePdf = async (factureId, fichier) => {
    if (!fichier) return
    setUploadingFacturePdf(factureId)
    const ext = fichier.name.split('.').pop()
    const chemin = `chantiers/${id}/factures/${factureId}.${ext}`
    const { error } = await supabase.storage.from('documents').upload(chemin, fichier, { upsert: true })
    if (!error) {
      const { error: updErr } = await supabase.from('factures_artisans').update({ pdf_path: chemin }).eq('id', factureId)
      if (updErr) { setErreur('Erreur : ' + updErr.message); setUploadingFacturePdf(null); return }
      await chargerFactures()
      setSucces('PDF facture uploadé ✓')
    } else { setErreur('Erreur upload : ' + error.message) }
    setUploadingFacturePdf(null)
  }

  const handleSave = async () => {
    setSaving(true)
    setErreur('')
    setSucces('')

    const newPartAgente = referentEstAdmin ? 0 : (dossier.part_agente ?? 0.5)

    const { error } = await supabase.from('dossiers').update({
      typologie: dossier.typologie, statut: dossier.statut,
      frais_consultation: dossier.frais_consultation, frais_statut: dossier.frais_statut,
      date_limite_devis: dossier.date_limite_devis, contrat_signe: dossier.contrat_signe,
      date_signature_contrat: dossier.date_signature_contrat, date_demarrage_chantier: dossier.date_demarrage_chantier,
      date_fin_chantier: dossier.date_fin_chantier, taux_courtage: dossier.taux_courtage, honoraires_amo_taux: dossier.honoraires_amo_taux,
      resume_projet: dossier.resume_projet || null,
      description: dossier.description || null,
      part_agente: newPartAgente,
      frais_part_agente: dossier.frais_part_agente ?? null,
    }).eq('id', id)

    if (error) {
      setErreur('Erreur : ' + error.message)
    } else {
      // Si frais réglés, créer/màj la ligne suivi_financier
      if (dossier.frais_statut === 'regle') {
        const { data: existingSuivi, error: fraisSelErr } = await supabase
          .from('suivi_financier')
          .select('id, date_paiement')
          .eq('dossier_id', id)
          .eq('type_echeance', 'frais_consultation')
          .is('artisan_id', null)
          .maybeSingle()
        const today = new Date().toISOString().split('T')[0]
        let fraisErr = fraisSelErr
        if (!fraisErr) {
          if (existingSuivi) {
            // On réaffirme le statut mais on PRÉSERVE la date métier existante :
            // le tampon `today` ne s'applique qu'à la transition vers réglé (date NULL).
            // Sinon chaque « Enregistrer » réécraserait la date → frais reclassé au mauvais mois.
            ({ error: fraisErr } = await supabase.from('suivi_financier')
              .update({ statut_client: 'regle', date_paiement: existingSuivi.date_paiement || today })
              .eq('id', existingSuivi.id))
          } else {
            ({ error: fraisErr } = await supabase.from('suivi_financier').insert({
              dossier_id: id,
              type_echeance: 'frais_consultation',
              artisan_id: null,
              statut_client: 'regle',
              date_paiement: today,
            }))
          }
        }
        if (fraisErr) {
          // Le dossier EST enregistré ; on reste en édition pour signaler le reliquat.
          setErreur('Dossier enregistré, mais échec de la ligne de frais : ' + fraisErr.message)
          setSaving(false)
          return
        }
      }

      setSucces('Modifications enregistrées ✓')
      setModalModif(false)
    }
    setSaving(false)
  }

  // Handler unique du DevisModal (create + edit, inclut acompte custom)
  // ── Versionnage des devis (Phase 2) ────────────────────────────────────────
  // devis_artisans reste la ligne COURANTE (finance.js inchangé). À chaque édition
  // de contenu, on fige un snapshot dans devis_versions. Garde anti-doublon : rien
  // n'est créé si l'état courant est identique à la dernière version courante.
  const CHAMPS_VERSION = [
    'montant_ht','montant_ttc','ttc_manuel','commission_pourcentage',
    'acompte_pourcentage','acompte_montant_fixe','statut','notes',
    'date_reception','date_limite','devis_pdf_path',
  ]
  const archiverVersionDevis = async (devisId) => {
    const { data: da } = await supabase.from('devis_artisans').select('*').eq('id', devisId).single()
    if (!da) return
    const { data: versions } = await supabase
      .from('devis_versions').select('*')
      .eq('devis_artisan_id', devisId)
      .order('version_num', { ascending: false })
    const courante = versions?.find(v => v.est_courante) || versions?.[0]
    // No-op : contenu identique à la version courante → pas de doublon.
    if (courante && CHAMPS_VERSION.every(c => (da[c] ?? null) === (courante[c] ?? null))) return
    const montantChange = !courante || (da.montant_ttc ?? null) !== (courante.montant_ttc ?? null)
    const nextNum = versions?.length ? Math.max(...versions.map(v => v.version_num)) + 1 : 1
    // Bascule l'ancienne courante puis insère la nouvelle (index partiel unique respecté).
    if (versions?.some(v => v.est_courante)) {
      await supabase.from('devis_versions').update({ est_courante: false })
        .eq('devis_artisan_id', devisId).eq('est_courante', true)
    }
    const snap = { devis_artisan_id: devisId, version_num: nextNum, est_courante: true }
    for (const c of CHAMPS_VERSION) snap[c] = da[c] ?? null
    const { error } = await supabase.from('devis_versions').insert(snap)
    if (error) { console.error('archiverVersionDevis :', error.message); return }
    // Changement de MONTANT → nouvelle base figée du comparateur (si déjà utilisé).
    if (montantChange) await majBaseSurChangementMontant()
  }

  // Upload/remplacement du PDF d'un devis → chemin versionné + nouvelle version.
  // Partagé par « + Uploader » (pas de PDF) et « Remplacer » (PDF existant).
  const uploadDevisPdf = async (devisId, fichier) => {
    if (!fichier) return
    setUploadingDoc(devisId + '_devis')
    const ext = fichier.name.split('.').pop()
    const chemin = `chantiers/${id}/devis/${devisId}/${Date.now()}.${ext}`   // versionné, jamais écrasé
    const { error } = await supabase.storage.from('documents').upload(chemin, fichier)
    if (!error) {
      const { error: pathErr } = await supabase.from('devis_artisans').update({ devis_pdf_path: chemin }).eq('id', devisId)
      if (pathErr) { setErreur('Erreur : ' + pathErr.message); setUploadingDoc(null); return }
      await archiverVersionDevis(devisId)   // nouveau PDF = nouvelle version
      await chargerDevis()
      setSucces('Devis artisan uploadé ✓')
    } else { setErreur('Erreur upload : ' + error.message) }
    setUploadingDoc(null)
  }

  // Restaurer une ancienne version : recopie son contenu dans la ligne courante et
  // re-pointe est_courante. Exclut le STATUT (on ne régresse pas le cycle de vie /
  // le financier — un devis accepté reste accepté). La version restaurée redevient
  // ce que voient finance.js et le comparateur.
  const restaurerVersion = async (devisId, version) => {
    if (!confirm(`Restaurer la version v${version.version_num} de ce devis ?`)) return
    const payload = {}
    for (const c of CHAMPS_VERSION) if (c !== 'statut') payload[c] = version[c] ?? null
    const { error } = await supabase.from('devis_artisans').update(payload).eq('id', devisId)
    if (error) { setErreur('Erreur : ' + error.message); return }
    await supabase.from('devis_versions').update({ est_courante: false }).eq('devis_artisan_id', devisId).eq('est_courante', true)
    await supabase.from('devis_versions').update({ est_courante: true }).eq('id', version.id)
    await chargerDevis()
    setSucces(`Version v${version.version_num} restaurée ✓`)
  }

  // Supprimer une version de l'historique (jamais la courante). Le PDF du storage
  // n'est retiré que s'il n'est partagé par aucune autre version ni par le devis
  // courant (une modif de montant sans nouveau PDF réutilise le même fichier).
  // NB : une base du comparateur épinglée sur cette version repasse en montant live
  // (FK ON DELETE SET NULL).
  const supprimerVersion = async (devisId, version) => {
    if (version.est_courante) { setErreur('Impossible de supprimer la version courante.'); return }
    if (!confirm(`Supprimer définitivement la version v${version.version_num} ?`)) return
    if (version.devis_pdf_path) {
      const autres = (versionsDevis[devisId] || []).filter(v => v.id !== version.id)
      const devisCourant = devis.find(d => d.id === devisId)
      const partage = autres.some(v => v.devis_pdf_path === version.devis_pdf_path)
        || devisCourant?.devis_pdf_path === version.devis_pdf_path
      if (!partage) {
        const { error: rmErr } = await supabase.storage.from('documents').remove([version.devis_pdf_path])
        if (rmErr) console.error('Suppression PDF version (non bloquant) :', rmErr.message)
      }
    }
    const { error } = await supabase.from('devis_versions').delete().eq('id', version.id)
    if (error) { setErreur('Erreur : ' + error.message); return }
    await chargerDevis()
    setSucces(`Version v${version.version_num} supprimée ✓`)
  }

  const saveDevisFromModal = async (form) => {
    // Avertissement doux (non bloquant) : acompte 0 + commission > 0 sur un
    // artisan non partenaire → la commission ne pourra pas être prélevée.
    const commissionPct = form.sans_commission ? 0 : (parseFloat(form.commission_pourcentage) || 0)
    const artisanSel    = artisans.find(a => a.id === form.artisan_id)
    if (form.acompte_pourcentage === 0 && commissionPct > 0 && artisanSel?.partenaire !== true) {
      if (!window.confirm('Attention, acompte 0 : la commission ne sera pas prélevée. Confirmer ?')) return
    }
    const acomptePct = form.acompte_pourcentage === -1 || form.acompte_pourcentage === 0
      ? form.acompte_pourcentage
      : parseFloat(form.acompte_pourcentage)
    const acompteMontant = form.acompte_pourcentage === -1
      ? (form.acompte_montant_fixe !== '' && Number.isFinite(parseFloat(form.acompte_montant_fixe)) ? parseFloat(form.acompte_montant_fixe) : null)
      : null
    const payload = {
      montant_ht: form.montant_ht !== '' ? parseFloat(form.montant_ht) : null,
      montant_ttc: form.montant_ttc !== '' ? parseFloat(form.montant_ttc) : null,
      ttc_manuel: form.ttc_manuel ?? false,
      commission_pourcentage: form.sans_commission ? 0 : (form.commission_pourcentage ? parseFloat(form.commission_pourcentage) / 100 : null),
      date_reception: form.date_reception || null,
      date_limite: form.date_limite || null,
      notes: form.notes || null,
      acompte_pourcentage: acomptePct,
      acompte_montant_fixe: acompteMontant,
    }
    if (devisModal.devis) {
      // Edit — sur erreur, la modale reste ouverte avec la saisie (return avant fermeture).
      const { error } = await supabase.from('devis_artisans').update(payload).eq('id', devisModal.devis.id)
      if (error) { setErreur('Erreur : ' + error.message); return }
      await archiverVersionDevis(devisModal.devis.id)   // snapshot version (no-op si inchangé)
      await chargerDevis()
      setSucces('Devis modifié ✓')
    } else {
      // Create
      if (!form.artisan_id) return
      const prochainOrdre = devis.length > 0 ? Math.max(...devis.map(d => d.ordre ?? 0)) + 1 : 1
      const { data: devisInsere, error } = await supabase.from('devis_artisans').insert({
        ...payload,
        dossier_id: id,
        artisan_id: form.artisan_id,
        statut: (form.date_reception || form.fichier) ? 'recu' : 'en_attente',
        ordre: prochainOrdre,
      }).select()
      if (error) { setErreur('Erreur : ' + error.message); return }
      let uploadDevisOk = true
      if (form.fichier && devisInsere?.[0]) {
        const ext = form.fichier.name.split('.').pop()
        // Chemin versionné (jamais écrasé) : chaque PDF vit à sa propre URL.
        const cheminDevis = `chantiers/${id}/devis/${devisInsere[0].id}/${Date.now()}.${ext}`
        // Gate : on n'écrit le chemin que si l'upload réussit (sinon référence pendante).
        const { error: uploadError } = await supabase.storage.from('documents').upload(cheminDevis, form.fichier)
        if (uploadError) uploadDevisOk = false
        else {
          const { error: pathErr } = await supabase.from('devis_artisans').update({ devis_pdf_path: cheminDevis }).eq('id', devisInsere[0].id)
          if (pathErr) uploadDevisOk = false
        }
      }
      if (!dossier.contrat_signe) {
        const today = new Date().toISOString().slice(0, 10)
        const { error: contratErr } = await supabase.from('dossiers').update({ contrat_signe: true, date_signature_contrat: today }).eq('id', id)
        if (!contratErr) setDossier(d => ({ ...d, contrat_signe: true, date_signature_contrat: today }))
      }
      await archiverVersionDevis(devisInsere[0].id)   // crée la v1 (capture l'état final + PDF)
      await chargerDevis()
      if (uploadDevisOk) setSucces('Devis ajouté ✓')
      else setErreur('Devis ajouté, mais échec de l\'upload du PDF — réessayez via la fiche devis.')
    }
    setDevisModal({ open: false, devis: null })
  }

  const parseDateFR = (str) => {
    if (!str) return null
    const parts = str.split('/')
    if (parts.length !== 3) return null
    const [j, m, a] = parts
    if (!j || !m || !a || a.length !== 4) return null
    return `${a}-${m.padStart(2,'0')}-${j.padStart(2,'0')}`
  }

  // TS-2 (courtage-only) : après signature d'un devis APRÈS le pivot, (re)calculer
  // le montant de la ligne courtage TS NON-PAYÉE via RECOMPUTE (idempotent : total TS
  // dû − TS déjà réglés). Recharge devis + suivi frais pour éviter tout état périmé.
  // Ne fait rien hors courtage / sans pivot. montant <= 0 → la RPC supprime la ligne vide.
  const declencherCourtageTS = async () => {
    if (dossier?.typologie !== 'courtage') return
    const [{ data: devisFrais }, { data: suiviFrais }] = await Promise.all([
      supabase.from('devis_artisans').select('*').eq('dossier_id', id),
      supabase.from('suivi_financier').select('*').eq('dossier_id', id),
    ])
    const dossierCalc = { ...dossier, devis_artisans: devisFrais || [], suivi_financier: suiviFrais || [] }
    if (!getPivotCourtage(dossierCalc)) return
    const { montantTSttc } = calculateCourtageTS(dossierCalc)
    const dejaRegle = (suiviFrais || [])
      .filter(s => s.type_echeance === 'honoraires_courtage_ts' && s.statut_client === 'regle')
      .reduce((sum, s) => sum + Number(s.montant_ttc || 0), 0)
    const montantLigneNonPayee = Math.round((montantTSttc - dejaRegle + Number.EPSILON) * 100) / 100
    const { error } = await supabase.rpc('suivi_courtage_ts_upsert', {
      p_dossier_id: id,
      p_montant: montantLigneNonPayee,
    })
    if (error) { setErreur('Erreur TS courtage : ' + error.message); return }
    const { data } = await supabase.from('suivi_financier').select('*').eq('dossier_id', id)
    setSuiviFinancier(data || [])
  }

  const changerStatutDevis = async (devisId, statut) => {
    let error
    if (statut === 'accepte') {
      const aujourd_hui = new Date().toISOString().slice(0, 10)
      const [annee, mois, jour] = aujourd_hui.split('-')
      const dateSignature = prompt('Date de signature du devis (JJ/MM/AAAA) :', `${jour}/${mois}/${annee}`)
      const dateParsee = parseDateFR(dateSignature)
      if (dateSignature && dateParsee) {
        ({ error } = await supabase.from('devis_artisans').update({ statut, date_signature: dateParsee }).eq('id', devisId))
      } else {
        ({ error } = await supabase.from('devis_artisans').update({ statut: 'recu' }).eq('id', devisId))
      }
    } else {
      ({ error } = await supabase.from('devis_artisans').update({ statut }).eq('id', devisId))
    }
    if (error) { setErreur('Erreur : ' + error.message); await chargerDevis(); return }
    // Plus d'auto-push dossiers.statut='devis_a_modifier' : calcStatut le dérive
    // désormais des devis (cascade v2). La colonne ne porte que les overrides
    // manuels (NULL/annule/termine). Persister le calculé la re-périmerait.
    await chargerDevis()
    // TS-2 : une signature (statut 'accepte' + date_signature) peut créer un TS courtage.
    if (statut === 'accepte') await declencherCourtageTS()
  }

  const supprimerDevis = async (devisId) => {
    if (!confirm('Supprimer ce devis ?')) return
    const { error } = await supabase.from('devis_artisans').delete().eq('id', devisId)
    if (error) {
      // Garde-fou volontaire : un devis avec des mouvements financiers rattachés
      // (acompte artisan, commission, honoraires…) ne peut pas être supprimé — la FK
      // suivi_financier.devis_id le bloque (code Postgres 23503). On affiche un message
      // clair au lieu de l'erreur SQL brute.
      const contrainteFinance = error.code === '23503' || /foreign key|suivi_financier/i.test(error.message || '')
      setErreur(contrainteFinance
        ? "Impossible de supprimer ce devis : des mouvements financiers y sont rattachés (acompte, commission, honoraires…). Traite-les d'abord dans le suivi financier."
        : 'Erreur : ' + error.message)
      return
    }
    await chargerDevis()
  }

  // ── UPLOAD DEVIS SIGNÉ ──
  const uploadDevisSigne = async (devisId, fichier) => {
    if (!fichier) return
    setUploadingDoc(devisId)
    const ext = fichier.name.split('.').pop()
    const chemin = `chantiers/${id}/devis_signes/${devisId}.${ext}`
    const { error } = await supabase.storage.from('documents').upload(chemin, fichier, { upsert: true })
    if (!error) {
      const { error: pathErr } = await supabase.from('devis_artisans').update({ devis_signe_path: chemin }).eq('id', devisId)
      if (pathErr) { setErreur('Erreur : ' + pathErr.message); setUploadingDoc(null); return }
      let statutOk = true
      const devisActuel = devis.find(d => d.id === devisId)
      if (devisActuel && devisActuel.statut !== 'accepte') {
        const aujourd_hui = new Date().toISOString().slice(0, 10)
        const [annee, mois, jour] = aujourd_hui.split('-')
        const dateSignature = prompt('Date de signature du devis (JJ/MM/AAAA) :', `${jour}/${mois}/${annee}`)
        const dateParsee = parseDateFR(dateSignature)
        if (dateSignature && dateParsee) {
          const { error: statutErr } = await supabase.from('devis_artisans').update({
            statut: 'accepte',
            date_signature: dateParsee,
          }).eq('id', devisId)
          if (statutErr) statutOk = false
        }
      }
      await chargerDevis()
      // TS-2 : l'upload d'un devis signé pose date_signature → peut créer un TS courtage.
      if (statutOk) await declencherCourtageTS()
      if (statutOk) setSucces('Devis signé uploadé ✓')
      else setErreur('Devis signé enregistré, mais le statut n\'a pas pu être mis à jour — réessayez.')
    } else { setErreur('Erreur upload : ' + error.message) }
    setUploadingDoc(null)
  }
  const supprimerDevisSigne = async (devisId, path) => {
    if (!confirm('Supprimer le devis signé ?')) return
    // Storage best-effort : un fichier qui résiste ne bloque pas le retrait de la
    // référence (orphelin sans gravité), mais on le signale.
    const { error: rmErr } = await supabase.storage.from('documents').remove([path])
    if (rmErr) console.error('Suppression PDF devis signé (non bloquant) :', rmErr.message)
    const { error } = await supabase.from('devis_artisans').update({ devis_signe_path: null }).eq('id', devisId)
    if (error) { setErreur('Erreur : ' + error.message); return }
    await chargerDevis()
    setSucces('Devis signé supprimé ✓')
  }

  // PV de réception (1 par devis). Calqué sur uploadDevisSigne / supprimerDevisSigne,
  // SANS la logique de changement de statut/date (le PV n'affecte pas le statut du devis).
  const uploadPV = async (devisId, fichier) => {
    if (!fichier) return
    setUploadingDoc(devisId)
    const ext = fichier.name.split('.').pop()
    const chemin = `chantiers/${id}/pv/${devisId}.${ext}`
    const { error } = await supabase.storage.from('documents').upload(chemin, fichier, { upsert: true })
    if (!error) {
      const { error: pathErr } = await supabase.from('devis_artisans').update({ pv_path: chemin }).eq('id', devisId)
      if (pathErr) { setErreur('Erreur : ' + pathErr.message); setUploadingDoc(null); return }
      await chargerDevis()
      setSucces('PV uploadé ✓')
    } else { setErreur('Erreur upload PV : ' + error.message) }
    setUploadingDoc(null)
  }
  const supprimerPV = async (devisId, path) => {
    if (!confirm('Supprimer le PV de réception ?')) return
    const { error: rmErr } = await supabase.storage.from('documents').remove([path])
    if (rmErr) console.error('Suppression PDF PV (non bloquant) :', rmErr.message)
    const { error } = await supabase.from('devis_artisans').update({ pv_path: null }).eq('id', devisId)
    if (error) { setErreur('Erreur : ' + error.message); return }
    await chargerDevis()
    setSucces('PV supprimé ✓')
  }

  // ── URL SIGNÉE DOCUMENT ──
  const ouvrirDocument = async (path, nom) => {
    const { data } = await supabase.storage.from('documents').createSignedUrl(path, 3600)
    if (data?.signedUrl) setDocViewer({ url: data.signedUrl, nom: nom || path.split('/').pop() })
    else setErreur('Impossible d\'ouvrir le document')
  }

  // Ouvre la modale manuelle pré-remplie sur un CR existant (édition du brouillon
  // ou d'un CR publié). Fonctionne pour un CR manuel comme pour un CR généré par IA :
  // les deux sont stockés dans comptes_rendus avec contenu_final (markdown).
  const editerCR = (cr) => {
    setCrEditId(cr.id)
    setCrManuelForm({
      type_visite: cr.type_visite || '',
      date_visite: cr.date_visite || '',
      contenu: cr.contenu_final || '',
    })
    setCrManuelModal(true)
  }

  const fermerCRManuel = () => {
    setCrManuelModal(false)
    setCrEditId(null)
    setCrManuelForm({ type_visite: '', date_visite: '', contenu: '' })
  }

  const sauvegarderCRManuel = async (publier = false) => {
    if (!crManuelForm.contenu.trim()) return
    setCrManuelSaving(true)
    // Édition : on met à jour le CR existant. Création : on insère.
    const { error: saveErr } = crEditId
      ? await supabase.from('comptes_rendus').update({
          type_visite: crManuelForm.type_visite || null,
          date_visite: crManuelForm.date_visite || null,
          contenu_final: crManuelForm.contenu,
          valide: publier,
        }).eq('id', crEditId)
      : await supabase.from('comptes_rendus').insert({
          dossier_id: id,
          type_visite: crManuelForm.type_visite || null,
          date_visite: crManuelForm.date_visite || null,
          contenu_final: crManuelForm.contenu,
          valide: publier,
        })
    // Échec : on garde la saisie (modale ouverte) pour réessayer.
    if (saveErr) { setErreur('Erreur : ' + saveErr.message); setCrManuelSaving(false); return }

    const { data } = await supabase.from('comptes_rendus').select('*').eq('dossier_id', id).order('created_at', { ascending: false })
    setComptesRendus(data || [])
    setCrManuelModal(false)
    setCrEditId(null)
    setCrManuelForm({ type_visite: '', date_visite: '', contenu: '' })
    setCrManuelSaving(false)
    setSucces(publier ? 'CR publié au client ✓' : 'CR sauvegardé ✓')
  }
  // ── GÉNÉRER CR AVEC IA ──
  const genererCRAvecIA = async () => {
    if (!crForm.type_visite) return
    const notesCombinees = [crNotes, crVocalTexte, crAudioTexte].filter(Boolean).join('\n\n')
    if (!notesCombinees.trim() && crImages.length === 0 && crPhotosDossier.length === 0) return
    setCrGenerating(true)
    setErreur('')
    try {
      const res = await fetch('/api/cr', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          dossierId: id,
          typeVisite: crForm.type_visite,
          dateVisite: crForm.date_visite,
          intervenants: crForm.intervenants ? crForm.intervenants.split(',').map(s => s.trim()).filter(Boolean) : [],
          notesBrutes: notesCombinees,
          // Photos ordi (uploadées) + photos existantes du dossier sélectionnées.
          photosPaths: [...crImages.map(im => im.path), ...crPhotosDossier],
          docsPaths: crDocsSelectionnes.map(d => ({ path: d.path, type_mime: d.type_mime, nom: d.nom })),
        }),
      })
      // Vérifier res.ok AVANT res.json() : une erreur serveur peut renvoyer du texte/HTML,
      // pas du JSON → res.json() lèverait un SyntaxError qui masque la vraie erreur.
      if (!res.ok) {
        const brut = await res.text().catch(() => '')
        setErreur(`Erreur génération CR (${res.status}) : ${(brut.slice(0, 200) || 'réessayez plus tard')}`)
        return
      }
      const data = await res.json()
      if (data.error) { setErreur('Erreur IA : ' + data.error); return }
      setCrGenere(data.cr)
      setCrSectionsEditees(data.cr.sections.map(s => ({ ...s })))
      setCrEtape(3)
    } catch (e) {
      setErreur('Erreur réseau lors de la génération du CR : ' + (e?.message || 'réessayez'))
    } finally {
      setCrGenerating(false)
    }
  }

  const sauvegarderCRGenere = async (publier = false) => {
    if (!crGenere) return
    setCrSavingFinal(true)
    const contenuFinal = crSectionsEditees.map(s => `## ${s.numero}. ${s.titre}\n\n${s.contenu}`).join('\n\n')
    const notesCombinees = [crNotes, crVocalTexte, crAudioTexte].filter(Boolean).join('\n\n')
    const { error: insertErr } = await supabase.from('comptes_rendus').insert({
      dossier_id: id,
      type_visite: crForm.type_visite,
      date_visite: crForm.date_visite || null,
      notes_brutes: notesCombinees || null,
      contenu_final: contenuFinal,
      photos_paths: [...crImages.map(im => im.path), ...crPhotosDossier], // TOUT ce qu'a analysé l'IA (traçabilité)
      photos_jointes: crPhotosDossier, // affichées dans le PDF — photos du chantier UNIQUEMENT, jamais les photos ordi
      valide: publier,
    })
    // Échec de l'insert : on garde la modale ouverte (sections éditées conservées).
    if (insertErr) { setErreur('Erreur : ' + insertErr.message); setCrSavingFinal(false); return }
    const { data } = await supabase.from('comptes_rendus').select('*').eq('dossier_id', id).order('created_at', { ascending: false })
    setComptesRendus(data || [])
    setCrModal(false)
    setCrEtape(1)
    setCrForm({ type_visite: '', date_visite: '', intervenants: '' })
    setCrNotes('')
    setCrImages([])
    setCrPhotosDossier([]) // vidage simple : ce sont des photos du dossier, jamais de remove Storage
    setCrVocalTexte('')
    setCrAudioTexte('')
    setCrGenere(null)
    setCrSectionsEditees([])
    setCrSavingFinal(false)
    setSucces(publier ? 'CR publié au client ✓' : 'CR sauvegardé ✓')
    setCrDocsSelectionnes([])
  }

  const demarrerVocal = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setErreur('Reconnaissance vocale non supportée sur ce navigateur (utilisez Chrome)')
      return
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SR()
    recognition.lang = 'fr-FR'
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = (e) => {
      let transcript = ''
      for (let i = 0; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript + ' '
      }
      setCrVocalTexte(transcript.trim())
    }
    recognition.onend = () => setCrVocal(false)
    recognition.start()
    setCrVocal(true)
    window._crRecognition = recognition
  }

  const arreterVocal = () => {
    window._crRecognition?.stop()
    setCrVocal(false)
  }

  // ── Audio → transcription (Deepgram) : marche partout, iPhone compris (≠ Web
  // Speech). L'audio est déposé en Storage puis transcrit par /api/transcribe ;
  // le texte alimente crAudioTexte (combiné aux notes pour le CR). ──
  const transcrireAudioBlob = async (blob, ext = 'webm') => {
    setCrTranscribing(true)
    setErreur('')
    try {
      const path = `chantiers/${id}/audio/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage.from('documents').upload(path, blob, { contentType: blob.type || undefined })
      if (upErr) { setErreur('Échec de l’envoi de l’audio : ' + upErr.message); return }
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ dossierId: id, audioPath: path }),
      })
      if (!res.ok) {
        const brut = await res.text().catch(() => '')
        setErreur(`Échec de la transcription (${res.status}) : ${brut.slice(0, 200) || 'réessayez'}`)
        return
      }
      const data = await res.json()
      if (data.error) { setErreur('Transcription : ' + data.error); return }
      setCrAudioTexte(prev => [prev, data.transcript].filter(Boolean).join('\n\n'))
    } catch (e) {
      setErreur('Erreur transcription : ' + (e?.message || 'réessayez'))
    } finally {
      setCrTranscribing(false)
    }
  }

  const demarrerEnregistrement = async () => {
    setErreur('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      crAudioChunks.current = []
      mr.ondataavailable = e => { if (e.data.size) crAudioChunks.current.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const type = mr.mimeType || 'audio/webm'
        const blob = new Blob(crAudioChunks.current, { type })
        await transcrireAudioBlob(blob, type.includes('mp4') ? 'mp4' : 'webm')
      }
      mr.start()
      crMediaRec.current = mr
      setCrRecording(true)
    } catch (e) {
      setErreur('Micro inaccessible — autorisez le micro dans le navigateur. ' + (e?.message || ''))
    }
  }

  const arreterEnregistrement = () => {
    crMediaRec.current?.stop()
    setCrRecording(false)
  }

  const onAudioFile = async (file) => {
    if (!file) return
    await transcrireAudioBlob(file, (file.name.split('.').pop() || 'm4a').toLowerCase())
  }

  const supprimerCR = async (crId) => {
    if (!confirm('Supprimer ce compte-rendu ?')) return
    const { error } = await supabase.from('comptes_rendus').delete().eq('id', crId)
    if (error) { setErreur('Erreur : ' + error.message); return }
    setComptesRendus(prev => prev.filter(c => c.id !== crId))
  }

  const toggleValide = async (crId, valide) => {
    const { error } = await supabase.from('comptes_rendus').update({ valide }).eq('id', crId)
    if (error) { setErreur('Erreur : ' + error.message); return }
    setComptesRendus(prev => prev.map(c => c.id === crId ? { ...c, valide } : c))
  }

    const generatePDF = async (type, crId = null) => {
    const key = crId ? `cr-${crId}` : type
    setGeneratingPDF(key)
    try {
      const res = await fetch('/api/pdf', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ dossierId: id, type, crId }),
      })
      if (!res.ok) {
        const err = await res.json()
        setErreur('Erreur PDF : ' + err.error)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const filename = type === 'recapitulatif_prev'
        ? `Recap_Financier_${dossier.reference}.pdf`
        : type === 'recapitulatif'
        ? `Suivi_Financier_${dossier.reference}.pdf`
        : type === 'dossier_suivi'
        ? `DossierSuivi_${dossier.reference}.pdf`
        : type === 'cr'
        ? `CR_${dossier.reference}.pdf`
        : `Dossier_${dossier.reference}.pdf`
      setDocViewer({ url, nom: filename })
    } catch (err) {
      setErreur('Erreur lors de la génération : ' + err.message)
    } finally {
      setGeneratingPDF(null)
    }
  }

  // ── MESSAGES AGENTE → CLIENT (schéma : messages avec auteur_role + lu_agence) ──
  const [onglet, setOnglet] = useState('apercu')
  const [recapMode, setRecapMode] = useState('previsionnel') // Récapitulatif : bascule visuelle prévisionnel/signé
  const [reponseMsg, setReponseMsg] = useState('')
  const [sendingMsg, setSendingMsg] = useState(false)
  const [editingMsgId, setEditingMsgId] = useState(null)
  const [editMsgText, setEditMsgText] = useState('')
  const [editMsgError, setEditMsgError] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteMsg, setInviteMsg] = useState(null) // { type:'ok'|'err', text }
  const messagesEndRef = useRef(null)

  // Realtime : écoute les nouveaux messages sur ce dossier
  useEffect(() => {
    if (!id) return
    const channel = supabase
      .channel(`messages:${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `dossier_id=eq.${id}` },
        async () => {
          const { data } = await supabase.from('messages')
            .select('*, auteur:profiles(prenom, nom, role)')
            .eq('dossier_id', id).order('created_at')
          setMessages(data || [])
          setNbMsgNonLus((data || []).filter(m => m.auteur_role === 'client' && !m.lu_agence).length)
        })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [id])

  // Auto-scroll quand un nouveau message arrive et qu'on est sur l'onglet messages
  useEffect(() => {
    if (onglet === 'messages') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, onglet])

  // Marquer comme lus à l'ouverture de l'onglet messages
  useEffect(() => {
    if (onglet !== 'messages' || !id) return
    if (!messages.some(m => m.auteur_role === 'client' && !m.lu_agence)) return
    ;(async () => {
      await supabase.from('messages')
        .update({ lu_agence: true })
        .eq('dossier_id', id).eq('auteur_role', 'client').eq('lu_agence', false)
      setMessages(prev => prev.map(m => m.auteur_role === 'client' ? { ...m, lu_agence: true } : m))
      setNbMsgNonLus(0)
    })()
  }, [onglet, id, messages.length])

  // Chargement paresseux du comparateur à l'ouverture de l'onglet
  useEffect(() => {
    if (onglet === 'comparateur') chargerComparateur()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onglet, id])

  const envoyerReponse = async () => {
    if (!reponseMsg.trim()) return
    setSendingMsg(true)
    const contenu = reponseMsg.trim()
    // Optimistic UI
    const tempId = `tmp-${Date.now()}`
    const optimistic = {
      id: tempId, dossier_id: id, auteur_id: profile?.id,
      auteur_role: profile?.role === 'admin' ? 'admin' : 'agente',
      contenu, lu: false, lu_agence: true,
      created_at: new Date().toISOString(),
      auteur: { prenom: profile?.prenom, nom: profile?.nom, role: profile?.role },
    }
    setMessages(prev => [...prev, optimistic])
    setReponseMsg('')

    const { data: inserted, error } = await supabase.from('messages').insert({
      dossier_id: id,
      auteur_id: profile?.id,
      auteur_role: profile?.role === 'admin' ? 'admin' : 'agente',
      contenu,
      lu: false,
      lu_agence: true,
    }).select('*, auteur:profiles(prenom, nom, role)').single()

    if (error) {
      setMessages(prev => prev.filter(m => m.id !== tempId))
      setErreur('Erreur envoi message : ' + error.message)
    } else if (inserted) {
      setMessages(prev => prev.map(m => m.id === tempId ? inserted : m))
    }
    // Marquer les messages client comme lus par l'agence (au cas où).
    // Bénin : en cas d'échec, on garde le compteur (pas de message utilisateur).
    const { error: luErr } = await supabase.from('messages').update({ lu_agence: true })
      .eq('dossier_id', id).eq('auteur_role', 'client').eq('lu_agence', false)
    if (luErr) console.error('Marquage messages lus (non bloquant) :', luErr.message)
    else setNbMsgNonLus(0)
    setSendingMsg(false)
  }

  // Édition en place d'un message (l'auteur, < 10 min — le trigger SQL est le
  // vrai gardien ; en cas de rejet, on garde le texte saisi et on l'indique).
  const modifierMessage = async (msg) => {
    const txt = editMsgText.trim()
    if (!txt) return
    setEditMsgError('')
    const { error } = await supabase.from('messages').update({ contenu: txt }).eq('id', msg.id)
    if (error) {
      setEditMsgError('Édition impossible (délai de 10 min dépassé ?).')
      return
    }
    setMessages(prev => prev.map(m =>
      m.id === msg.id ? { ...m, contenu: txt, edited_at: new Date().toISOString() } : m))
    setEditingMsgId(null); setEditMsgText('')
  }

  const annulerEditionMsg = () => { setEditingMsgId(null); setEditMsgText(''); setEditMsgError('') }

  // Invite le client du dossier : le serveur crée le compte + génère le lien (sans
  // envoyer d'email), puis on ouvre un brouillon mailto que le référent envoie de
  // sa boîte. Le scope d'accès est porté par client_id → mes_dossiers_client() (RLS).
  const inviterClient = async () => {
    setInviting(true); setInviteMsg(null)
    try {
      const res = await fetch('/api/invite-client', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ dossierId: id }),
      })
      const data = await res.json().catch(() => ({}))
      if (data.status === 'invited' || data.status === 'relinked') {
        setInviteMsg({
          type: 'ok',
          text: data.status === 'relinked'
            ? 'Ce client a déjà un compte. Brouillon de renvoi ouvert — vérifiez et envoyez-le.'
            : 'Brouillon d\'email ouvert — vérifiez et envoyez-le au client.',
        })
        // window.location.href (pas window.open) : éviter le blocage popup après await.
        const mailto = buildInviteMailto({
          email: data.email,
          prenom: data.prenom,
          actionLink: data.actionLink,
          loginUrl: `${window.location.origin}/login-client`,
          isRenvoi: data.status === 'relinked',
        })
        window.location.href = mailto
      } else if (data.error === 'email_manquant') {
        setInviteMsg({ type: 'err', text: 'Ajoutez un email au client avant de l\'inviter.' })
      } else {
        setInviteMsg({ type: 'err', text: data.message || data.error || 'Échec de l\'invitation.' })
      }
    } catch {
      setInviteMsg({ type: 'err', text: 'Erreur réseau, réessayez.' })
    }
    setInviting(false)
  }

  const typologieLabel = (t) => ({ courtage: 'Courtage', amo: 'AMO', estimo: 'Estimo', merad: 'MERAD', audit_energetique: 'Audit énergétique', studio_jardin: 'Studio de jardin' })[t] || t

  const statutDevisConfig = {
    en_attente: { label: 'En attente', tone: 'warn' },
    recu:       { label: 'Reçu',       tone: 'info' },
    accepte:    { label: 'Accepté',    tone: 'ok'   },
    refuse:     { label: 'Refusé',     tone: 'bad'  },
    a_modifier: { label: 'À modifier', tone: 'warn' },
  }
  // Couleurs tone → classes badge (pour les boutons quick statut)
  const TONE_BG = { ok: 'rgba(22,163,74,0.12)', warn: 'rgba(245,158,11,0.13)', bad: 'rgba(220,38,38,0.10)', info: 'rgba(0,148,212,0.12)', mute: 'rgba(148,163,184,0.15)' }
  const TONE_FG = { ok: '#15803d', warn: '#a16207', bad: '#b91c1c', info: '#0078ad', mute: '#475569' }

  const devisSignes = getSignedDevis({ ...dossier, devis_artisans: devis })
  const totalDevisTTCSignes = devisSignes.reduce((s, d) => s + (d.montant_ttc || 0), 0)
  const totalDevisHTSignes  = devisSignes.reduce((s, d) => s + (d.montant_ht  || 0), 0)
    // Devis actifs (prévisionnel) = recu + accepte + a_modifier (en_attente et refuse exclus)
  const devisRecus = getActiveDevis({ ...dossier, devis_artisans: devis })
  const totalDevisTTCRecus = devisRecus.reduce((s, d) => s + (d.montant_ttc || 0), 0)
  const totalDevisHTRecus  = devisRecus.reduce((s, d) => s + (d.montant_ht  || 0), 0)
  const fraisTTC = dossier?.frais_consultation || 0
  // Frais RÉELLEMENT dans le total chantier (= reste à payer) : exclut 'offerts' ET
  // 'rembourse' (remboursé = déjà déduit du courtage par finance.js). Aligne l'écran
  // sur le PDF (RecapHonoraires.js, fraisInTable).
  const fraisDansTotal = fraisTTC > 0 && dossier?.frais_statut !== 'offerts' && dossier?.frais_statut !== 'rembourse'
  const tauxCourtage = (dossier?.taux_courtage ?? COURTAGE_STANDARD)
  const tauxCourtagePct = parseFloat((tauxCourtage * 100).toFixed(1))
  const tauxAmo = ((dossier?.honoraires_amo_taux ?? AMO_STANDARD * 100) / 100)
  const tauxAmoPct = parseFloat((tauxAmo * 100).toFixed(1))
  // Honoraires depuis finance.js (source unique de calcul). Modèle frais = finance :
  // le plein montant TTC est déduit du courtage si frais_statut==='rembourse'.
  const finDossier = calculateDossierFinance({ ...dossier, devis_artisans: devis, suivi_financier: suiviFinancier })
  const honorairesCourtage = finDossier.honoraires.courtage.ttc
  const honorairesAMO      = finDossier.honoraires.courtage.ttc + finDossier.honoraires.soldeAmo.ttc
  const honorairesCourtagePrev = finDossier.honorairesPrevi.courtage.ttc
  const honorairesAMOPrev      = finDossier.honorairesPrevi.courtage.ttc + finDossier.honorairesPrevi.soldeAmo.ttc
  const suiviCourtage = suiviFinancier.find(s => s.type_echeance === 'honoraires_courtage')
  const suiviSoldeAMO = suiviFinancier.find(s => s.type_echeance === 'solde_amo')
  // TS-2 (courtage-only) : lignes d'encaissement du courtage supplémentaire (L1, L2…),
  // ordonnées par ancienneté. courtageTS ventile le total (base × taux, INCHANGÉ) en
  // initial (hors TS) + TS. Renvoie des zéros hors courtage → aucun impact AMO.
  const suiviCourtageTS = suiviFinancier
    .filter(s => s.type_echeance === 'honoraires_courtage_ts')
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  const courtageTS = calculateCourtageTS({ ...dossier, devis_artisans: devis })
  // Statut frais = dossiers.frais_statut (source unique) ; date = ligne frais_consultation si réglé.
  const suiviFrais = suiviFinancier.find(s => s.type_echeance === 'frais_consultation')

  // Avancement calculé depuis suivi_financier (source de vérité unique)
  const avancement = calculerAvancement({ ...dossier, suivi_financier: suiviFinancier })

  // Compteurs acomptes / factures (basés sur statut_illico='recu')
  const acomptesTotal  = devisSignes.length
  const acomptesRecus  = devisSignes.filter(dv => suiviFinancier.find(x =>
    x.type_echeance === 'acompte_artisan' && x.devis_id === dv.id && x.statut_illico === 'recu')).length
  const facturesTotal  = devisSignes.length
  const facturesPayees = devisSignes.filter(dv => suiviFinancier.find(x =>
    x.type_echeance === 'facture_finale' && x.artisan_id === dv.artisan_id && x.statut_illico === 'recu')).length

  // Clé d'unicité : acompte_artisan est désormais PAR DEVIS (devisId fourni) ; les
  // échéances sans devis (facture_finale, apporteur_agente) restent PAR ARTISAN
  // (devisId null → devis_id IS NULL, cas b). Sans ce distinguo, maybeSingle crashe
  // « multiple rows » sur un artisan à plusieurs devis débloqués.
  const majSuiviAvecArtisan = async (type, artisanId, champ, valeur, devisId = null) => {
    let q = supabase.from('suivi_financier').select('id')
      .eq('dossier_id', id).eq('type_echeance', type).eq('artisan_id', artisanId)
    q = devisId ? q.eq('devis_id', devisId) : q.is('devis_id', null)
    const { data: existing, error: selectErr } = await q.maybeSingle()
    if (selectErr) { setErreur('Erreur : ' + selectErr.message); return false }
    const { error } = existing
      ? await supabase.from('suivi_financier').update({ [champ]: valeur }).eq('id', existing.id)
      : await supabase.from('suivi_financier').insert({ dossier_id: id, type_echeance: type, artisan_id: artisanId, devis_id: devisId, [champ]: valeur })
    const { data } = await supabase.from('suivi_financier').select('*').eq('dossier_id', id)
    setSuiviFinancier(data || [])
    if (error) { setErreur('Erreur : ' + error.message); return false }
    return true
  }

  // Quand acompte_artisan est togglé côté suivi, propager aux factures_artisans acompte de cet artisan
  const setAcompteArtisanPaye = async (artisanId, paye, date, devisId = null) => {
    const datePaye = paye ? (date || new Date().toISOString().slice(0, 10)) : null
    const statutSuivi = paye ? 'regle' : 'en_attente'
    await majSuiviAvecArtisan('acompte_artisan', artisanId, 'statut_client', statutSuivi, devisId)
    // Date du règlement client : posée au coche, effacée au décoche (datePaye=null).
    // N'affecte que date_paiement (l'événement déblocage statut_illico/date_deblocage
    // sur la même ligne reste intact).
    await majSuiviAvecArtisan('acompte_artisan', artisanId, 'date_paiement', datePaye, devisId)
    // Synchroniser les factures_artisans dont le libellé contient "acompte". Scopé AU
    // DEVIS si fourni → ne marque pas l'acompte d'un autre lot du même artisan.
    const facturesAcompte = factures.filter(f =>
      f.artisan_id === artisanId &&
      (devisId ? f.devis_id === devisId : true) &&
      (f.libelle || '').toLowerCase().includes('acompte')
    )
    for (const f of facturesAcompte) {
      await supabase.from('factures_artisans').update({
        statut: paye ? 'paye' : 'en_attente',
        date_paiement: paye ? datePaye : null,
      }).eq('id', f.id)
    }
    if (facturesAcompte.length > 0) {
      setFactures(prev => prev.map(f =>
        facturesAcompte.find(fa => fa.id === f.id)
          ? { ...f, statut: paye ? 'paye' : 'en_attente', date_paiement: paye ? datePaye : null }
          : f
      ))
    }
  }

  // Toggle « illiCO a débloqué l'acompte » (2e événement de la MÊME ligne acompte_artisan,
  // distinct de l'acompte client). Coche → statut_illico='recu' + date_deblocage=today ;
  // décoche → statut_illico='en_attente' + date_deblocage=NULL. Upsert des DEUX champs en
  // un appel (sans passer par majSuiviAvecArtisan générique → factures non affectées).
  // PAS de DELETE : la ligne est partagée avec l'acompte client (statut_client/date_paiement),
  // qui reste intact. date_deblocage est de type `date` → AAAA-MM-JJ.
  const setDeblocagePaye = async (artisanId, recu, devisId = null, date = null) => {
    let q = supabase.from('suivi_financier').select('id')
      .eq('dossier_id', id).eq('type_echeance', 'acompte_artisan').eq('artisan_id', artisanId)
    q = devisId ? q.eq('devis_id', devisId) : q.is('devis_id', null)
    const { data: existing, error: selectErr } = await q.maybeSingle()
    if (selectErr) { setErreur('Erreur : ' + selectErr.message); return }
    const dateEffective = date || new Date().toISOString().slice(0, 10)
    const payload = recu
      ? { statut_illico: 'recu', date_deblocage: dateEffective }
      : { statut_illico: 'en_attente', date_deblocage: null }
    let error = null
    if (existing) {
      ({ error } = await supabase.from('suivi_financier').update(payload).eq('id', existing.id))
    } else if (recu) {
      ({ error } = await supabase.from('suivi_financier').insert({ dossier_id: id, type_echeance: 'acompte_artisan', artisan_id: artisanId, devis_id: devisId, ...payload }))
    }
    if (error) { setErreur('Erreur : ' + error.message); return }
    const { data } = await supabase.from('suivi_financier').select('*').eq('dossier_id', id)
    setSuiviFinancier(data || [])
  }

  // Toggle « CTP a payé l'apporteur » (décaissement CTP→apporteur). F2 agrège la
  // charge agente sur statut_ctp='rembourse' + date_paiement → on écrit ces 2 champs
  // au coche (date = jour du clic), et on SUPPRIME la ligne au décoche (zéro résidu,
  // cohérent avec le toggle honoraires). Les 2 modes (par_devis: artisan_id renseigné /
  // total: artisan_id NULL) passent par le même chemin. Montant non écrit (F2 le calcule
  // via finance.js). date_paiement est de type `date` → AAAA-MM-JJ.
  const setApporteurPaye = async (artisanId, paye, date = null) => {
    let q = supabase.from('suivi_financier').select('id')
      .eq('dossier_id', id).eq('type_echeance', 'apporteur_agente')
    q = artisanId === null ? q.is('artisan_id', null) : q.eq('artisan_id', artisanId)
    const { data: existing, error: selectErr } = await q.maybeSingle()
    if (selectErr) { setErreur('Erreur : ' + selectErr.message); return }

    let error = null
    if (paye) {
      const dateEffective = date || new Date().toISOString().slice(0, 10)
      if (existing) {
        ({ error } = await supabase.from('suivi_financier').update({ statut_ctp: 'rembourse', date_paiement: dateEffective }).eq('id', existing.id))
      } else {
        ({ error } = await supabase.from('suivi_financier').insert({ dossier_id: id, type_echeance: 'apporteur_agente', artisan_id: artisanId, statut_ctp: 'rembourse', date_paiement: dateEffective }))
      }
    } else if (existing) {
      ({ error } = await supabase.from('suivi_financier').delete().eq('id', existing.id))
    }
    if (error) { setErreur('Erreur : ' + error.message); return }
    const { data } = await supabase.from('suivi_financier').select('*').eq('dossier_id', id)
    setSuiviFinancier(data || [])
  }

  const majSuiviChantier = async (type, montant, valeur, date = null) => {
    // Toggle d'une échéance honoraire : coche = réglé + date du jour, décoche = suppression.
    // Sur AMO, honoraires_courtage et acompte_amo représentent le MÊME encaissement
    // (la part courtage, vue AMO) → togglés ensemble. La fonction Postgres
    // suivi_toggle_honoraires écrit les 1-2 lignes de façon ATOMIQUE (tout-ou-rien)
    // sous la RLS de l'appelant (SECURITY INVOKER).
    const types = [type]
    if (dossier?.typologie === 'amo') {
      if (type === 'honoraires_courtage') types.push('acompte_amo')
      else if (type === 'acompte_amo') types.push('honoraires_courtage')
    }
    const dateEffective = date || new Date().toISOString().slice(0, 10)
    const { error } = await supabase.rpc('suivi_toggle_honoraires', {
      p_dossier_id: id,
      p_types: types,
      p_montant: montant,
      p_regle: valeur === 'regle',
      p_today: dateEffective,
    })
    if (error) setErreur('Erreur : ' + error.message)
    const { data } = await supabase.from('suivi_financier').select('*').eq('dossier_id', id)
    setSuiviFinancier(data || [])
  }

  // TS-2 : marquer une ligne courtage TS payée/non-payée PAR ID (jamais via
  // suivi_toggle_honoraires, qui fige le montant à l'INSERT). Une ligne réglée est
  // close ; la décocher la rouvre (redevient absorbable par le recompute au prochain TS).
  const setCourtageTSPaye = async (ligne, paye, date = null) => {
    const dateEffective = date || new Date().toISOString().slice(0, 10)
    const payload = paye
      ? { statut_client: 'regle', date_paiement: dateEffective }
      : { statut_client: 'en_attente', date_paiement: null }
    const { error } = await supabase.from('suivi_financier').update(payload).eq('id', ligne.id)
    if (error) { setErreur('Erreur : ' + error.message); return }
    const { data } = await supabase.from('suivi_financier').select('*').eq('dossier_id', id)
    setSuiviFinancier(data || [])
  }

  // Solde AMO échelonné — ajoute une tranche encaissée (montant TTC libre + date).
  // À la 1ʳᵉ tranche (c2), neutralise le conteneur solde_amo resté éventuellement
  // 'regle' → une suppression ultérieure de toutes les tranches ne repasserait pas
  // le solde à « payé d'un coup ». RPC lot 1 ; rafraîchissement = pattern existant.
  const addSoldeAmoPaiement = async (montant, date) => {
    const m = parseFloat(String(montant).replace(',', '.'))
    if (!Number.isFinite(m) || m <= 0) { setErreur('Montant invalide'); return }
    const dejaDesTranches = suiviFinancier.some(s => s.type_echeance === 'solde_amo_paiement')
    const { error } = await supabase.rpc('solde_amo_paiement_add', {
      p_dossier_id: id, p_montant: m, p_date: date || new Date().toISOString().slice(0, 10),
    })
    if (error) { setErreur('Erreur : ' + error.message); return }
    if (!dejaDesTranches) {
      await majSuiviChantier('solde_amo', honorairesAMOPrev - honorairesCourtagePrev, 'en_attente')
    }
    const { data } = await supabase.from('suivi_financier').select('*').eq('dossier_id', id)
    setSuiviFinancier(data || [])
    setSoldeAmoForm({ montant: '', date: '' })
  }

  // Solde AMO échelonné — supprime une tranche par id (RPC lot 1).
  const deleteSoldeAmoPaiement = async (rowId) => {
    const { error } = await supabase.rpc('solde_amo_paiement_delete', { p_id: rowId })
    if (error) { setErreur('Erreur : ' + error.message); return }
    const { data } = await supabase.from('suivi_financier').select('*').eq('dossier_id', id)
    setSuiviFinancier(data || [])
  }

  const convertirEnAMO = async () => {
    const ok = confirm(
      'Convertir ce dossier Courtage en AMO ?\n\n' +
      '• La ligne de suivi "Honoraires courtage" deviendra "Acompte AMO"\n' +
      '• Une ligne "Solde AMO" sera créée\n' +
      '• Le taux courtage existant est conservé\n' +
      '• Le taux AMO est initialisé à 9%\n\n' +
      'Cette action ne peut pas être annulée facilement.'
    )
    if (!ok) return
    setSaving(true)
    // Conversion atomique côté base (fonction Postgres transactionnelle).
    const { error } = await supabase.rpc('convertir_dossier_en_amo', {
      p_dossier_id: id,
      p_taux_amo: AMO_STANDARD * 100,
    })
    if (error) {
      setErreur('Erreur lors de la conversion : ' + error.message)
      setSaving(false)
      return
    }
    setDossier(d => ({ ...d, typologie: 'amo', honoraires_amo_taux: d.honoraires_amo_taux ?? AMO_STANDARD * 100 }))
    const { data: newSuivi } = await supabase.from('suivi_financier').select('*').eq('dossier_id', id)
    setSuiviFinancier(newSuivi || [])
    setSucces('Dossier converti en AMO ✓')
    setSaving(false)
  }

  const convertirEnCourtage = async () => {
    const ok = confirm(
      'Convertir ce dossier AMO en Courtage ?\n\n' +
      '• La ligne de suivi "Acompte AMO" deviendra "Honoraires courtage"\n' +
      '• La ligne "Solde AMO" sera supprimée\n' +
      '• Le taux courtage existant est conservé\n\n' +
      'Cette action ne peut pas être annulée facilement.'
    )
    if (!ok) return
    setSaving(true)
    // Conversion atomique côté base (fonction Postgres transactionnelle).
    const { error } = await supabase.rpc('convertir_dossier_en_courtage', {
      p_dossier_id: id,
    })
    if (error) {
      setErreur('Erreur lors de la conversion : ' + error.message)
      setSaving(false)
      return
    }
    setDossier(d => ({ ...d, typologie: 'courtage' }))
    const { data: newSuivi } = await supabase.from('suivi_financier').select('*').eq('dossier_id', id)
    setSuiviFinancier(newSuivi || [])
    setSucces('Dossier converti en Courtage ✓')
    setSaving(false)
  }

  if (loading) return <div className="page-loading" />
  if (!dossier) return <div style={{paddingTop:96,textAlign:'center',color:'var(--ink-400)'}}>Chantier introuvable</div>

  const nomComplet = formatNomClient(client, { civilite: true })

  const supprimerChantier = async () => {
    const ok = confirm(
      `Supprimer définitivement ce chantier et tout ce qui lui est rattaché (${ENTITES_CHANTIER}) ? Cette action est irréversible.`
    )
    if (!ok) return

    setSaving(true)
    setErreur('')
    setSucces('')

    try {
      // 1) Charger ce qu'il faut pour supprimer proprement les fichiers connus
      const { data: photosData, error: photosErr } = await supabase
        .from('photos')
        .select('id, url')
        .eq('dossier_id', id)

      if (photosErr) throw photosErr

      const { data: devisData, error: devisErr } = await supabase
        .from('devis_artisans')
        .select('id, devis_signe_path, devis_pdf_path')
        .eq('dossier_id', id)

      if (devisErr) throw devisErr

      const { data: facturesData, error: facturesErr } = await supabase
        .from('factures_artisans')
        .select('pdf_path')
        .eq('dossier_id', id)

      if (facturesErr) throw facturesErr

      const { data: docsData, error: docsErr } = await supabase
        .from('chantier_documents')
        .select('path')
        .eq('dossier_id', id)

      if (docsErr) throw docsErr

      // 2) Supprimer les fichiers Storage connus
      const photoPaths = (photosData || [])
        .map(p => p.url)
        .filter(Boolean)

      const documentPaths = [
        ...(devisData || []).flatMap(d => [d.devis_signe_path, d.devis_pdf_path]),
        ...(facturesData || []).map(f => f.pdf_path),
        ...(docsData || []).map(d => d.path),
        dossier?.contrat_url,
      ].filter(Boolean)

      if (photoPaths.length > 0) {
        const { error } = await supabase.storage.from('photos').remove(photoPaths)
        if (error) throw error
      }

      if (documentPaths.length > 0) {
        const { error } = await supabase.storage.from('documents').remove(documentPaths)
        if (error) throw error
      }

      // 3) Supprimer aussi les dossiers Storage du chantier pour éviter les fichiers orphelins
      // (ex: devis uploadés sans chemin stocké en base)
      const removeFolderContents = async (bucket, folder) => {
        const { data: listed, error: listErr } = await supabase.storage.from(bucket).list(folder, {
          limit: 1000,
          offset: 0,
        })
        if (listErr) throw listErr

        const files = (listed || [])
          .filter(item => item.name && !item.id?.endsWith?.('/'))
          .map(item => `${folder}/${item.name}`)

        if (files.length > 0) {
          const { error: removeErr } = await supabase.storage.from(bucket).remove(files)
          if (removeErr) throw removeErr
        }
      }

      // bucket photos
      await removeFolderContents('photos', `chantiers/${id}/avant`)
      await removeFolderContents('photos', `chantiers/${id}/pendant`)
      await removeFolderContents('photos', `chantiers/${id}/apres`)
      await removeFolderContents('photos', `chantiers/${id}/maquette`)

      // bucket documents
      await removeFolderContents('documents', `chantiers/${id}/devis`)
      await removeFolderContents('documents', `chantiers/${id}/devis_signes`)
      await removeFolderContents('documents', `chantiers/${id}/factures`)
      await removeFolderContents('documents', `chantiers/${id}/documents`)
      await removeFolderContents('documents', `chantiers/${id}/contrat`)
      await removeFolderContents('documents', `chantiers/${id}/cr`)

      // 4) Supprimer le dossier chantier — les tables filles tombent par ON DELETE CASCADE
      const { error: dossierErr } = await supabase
        .from('dossiers')
        .delete()
        .eq('id', id)

      if (dossierErr) throw dossierErr

      router.push('/chantiers')
    } catch (err) {
      setErreur('Erreur suppression chantier : ' + err.message)
      setSaving(false)
    }
  }

  return (
    <div className="page-enter page-pad" style={{display:'flex',flexDirection:'column',gap:18}}>

      {/* Breadcrumb */}
      <div style={{display:'flex',alignItems:'center',gap:10,fontSize:13,color:'var(--ink-500)'}}>
        <button onClick={() => router.push('/chantiers')} className="btn btn-ghost"
          style={{padding:'4px 10px',fontSize:12}}>← Tous les chantiers</button>
        <span style={{color:'var(--ink-300)'}}>/</span>
        <span className="mono" style={{color:'var(--brand-800)',fontWeight:700}}>{dossier.reference}</span>
        <span style={{color:'var(--ink-300)'}}>/</span>
        <span style={{color:'var(--ink-700)',fontWeight:600}}>{nomComplet}</span>
      </div>

      {/* Hero card */}
      <div className="card" style={{padding:0,overflow:'hidden',position:'relative'}}>
        <div style={{position:'absolute',inset:0,pointerEvents:'none',
          background:'radial-gradient(circle at 100% 0%, rgba(0,148,212,0.10), transparent 50%), radial-gradient(circle at 0% 0%, rgba(0,87,142,0.04), transparent 40%)'}}/>
        <div style={{padding:'24px 28px',display:'flex',justifyContent:'space-between',
          gap:16,alignItems:'flex-start',position:'relative'}}>
          <div style={{minWidth:0,flex:1}}>
            <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:8,flexWrap:'wrap'}}>
              <span className="mono" style={{fontSize:13,color:'var(--brand-800)',fontWeight:800}}>
                {dossier.reference}
              </span>
              <TypoBadge typo={dossier.typologie}/>
              <StatutBadge dossier={{ ...dossier, devis_artisans: devis, rendez_vous: rdvsDossier }}/>
              {/* Override manuel du statut — sinon calcStatut décide */}
              {!dossier.statut && (
                <>
                  <button onClick={() => majStatutManuel('termine')} disabled={saving}
                    className="btn btn-ghost" style={{fontSize:11.5, padding:'3px 10px', borderColor:'rgba(22,163,74,0.35)', color:'#15803d'}}>
                    ✓ Marquer terminé
                  </button>
                  <button onClick={() => majStatutManuel('annule')} disabled={saving}
                    className="btn btn-ghost" style={{fontSize:11.5, padding:'3px 10px', borderColor:'rgba(239,68,68,0.3)', color:'#b91c1c'}}>
                    Annuler le dossier
                  </button>
                </>
              )}
              {(dossier.statut === 'termine' || dossier.statut === 'annule') && (
                <button onClick={() => majStatutManuel(null)} disabled={saving}
                  className="btn btn-ghost" style={{fontSize:11.5, padding:'3px 10px'}}>
                  ↺ Ré-ouvrir le dossier
                </button>
              )}
              {dossier.contrat_signe && (
                <span style={{display:'inline-flex',alignItems:'center',gap:4,
                  fontSize:11.5,color:'#15803d',fontWeight:600}}>
                  <CheckIcon /> Contrat signé{dossier.date_signature_contrat
                    ? ` · ${new Date(dossier.date_signature_contrat).toLocaleDateString('fr-FR')}`
                    : ''}
                </span>
              )}
            </div>
            <h1 className="page" style={{fontSize:28,letterSpacing:-0.02,lineHeight:1.15}}>
              {nomComplet}
            </h1>
            {client?.adresse && (
              <div style={{fontSize:13.5,color:'var(--ink-500)',marginTop:8,display:'flex',alignItems:'center',gap:6}}>
                <PinIcon /> {client.adresse}
              </div>
            )}
            {dossier.description && (
              <p style={{fontSize:13.5,color:'var(--ink-700)',marginTop:14,
                lineHeight:1.55,maxWidth:680,marginBottom:0}}>{dossier.description}</p>
            )}
          </div>
          {dossier.referente && (
            <div style={{display:'flex',flexDirection:'column',gap:8,alignItems:'flex-end',flexShrink:0}}>
              <Avatar name={`${dossier.referente.prenom} ${dossier.referente.nom}`} size={44} ring />
              <div style={{textAlign:'right'}}>
                <div className="eyebrow" style={{textAlign:'right'}}>Référente</div>
                <div style={{fontSize:13,fontWeight:700,color:'var(--ink-900)',marginTop:2}}>
                  {dossier.referente.prenom} {dossier.referente.nom}
                </div>
                <div style={{fontSize:11,color:'var(--ink-500)'}}>
                  {dossier.referente.role === 'admin' ? 'Franchisé' : 'Agent'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action strip */}
        <div style={{padding:'14px 28px',borderTop:'1px solid var(--ink-100)',
          background:'var(--surface-2)',display:'flex',gap:8,flexWrap:'wrap'}}>
          <button onClick={() => setModalModif(true)} className="btn btn-primary"
            style={{fontSize:12.5,display:'inline-flex',alignItems:'center',gap:6}}>
            <EditIcon /> Modifier
          </button>
          {client?.telephone && (
            <a href={`tel:${client.telephone}`} className="btn btn-ghost"
              style={{fontSize:12.5,display:'inline-flex',alignItems:'center',gap:6}}>
              <PhoneIcon /> {client.telephone}
            </a>
          )}
          {client?.email && (
            <a href={`mailto:${client.email}`} className="btn btn-ghost"
              style={{fontSize:12.5,display:'inline-flex',alignItems:'center',gap:6}}>
              <MailIcon /> Email
            </a>
          )}
          {/* Invitation espace client : réservée aux dossiers AMO (l'espace client est AMO). */}
          {dossier.typologie === 'amo' && (
            <>
              <button onClick={inviterClient} disabled={inviting} className="btn btn-ghost"
                style={{fontSize:12.5,display:'inline-flex',alignItems:'center',gap:6}}>
                <MailIcon /> {inviting ? 'Invitation…' : 'Inviter le client'}
              </button>
              {inviteMsg && (
                <div style={{width:'100%', fontSize:12, marginTop:2,
                  color: inviteMsg.type === 'ok' ? '#15803d' : '#b91c1c'}}>
                  {inviteMsg.text}
                </div>
              )}
            </>
          )}
          <div style={{flex:1}}/>
          <button onClick={() => generatePDF('recapitulatif_prev')} disabled={!!generatingPDF}
            className="btn btn-ghost" style={{fontSize:12.5,display:'inline-flex',alignItems:'center',gap:6}}>
            <DlIcon /> {generatingPDF === 'recapitulatif_prev' ? '...' : 'Récap. financier'}
          </button>
          <button onClick={() => generatePDF('recapitulatif')} disabled={!!generatingPDF}
            className="btn btn-ghost" style={{fontSize:12.5,display:'inline-flex',alignItems:'center',gap:6}}>
            <DlIcon /> {generatingPDF === 'recapitulatif' ? '...' : 'Suivi financier'}
          </button>
          <button onClick={() => generatePDF('dossier_suivi')} disabled={!!generatingPDF}
            className="btn btn-ghost" style={{fontSize:12.5,display:'inline-flex',alignItems:'center',gap:6}}>
            <DocIcon /> {generatingPDF === 'dossier_suivi' ? '...' : 'Dossier de suivi'}
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="kpi-grid">
        <MiniKpi
          label="Montant prévu"
          value={totalDevisTTCRecus > 0 ? fmt(totalDevisTTCRecus) : '—'}
          sub={`${devisRecus.length} devis reçus`}
        />
        <MiniKpi
          label="Montant réel"
          value={totalDevisTTCSignes > 0 ? fmt(totalDevisTTCSignes) : '—'}
          sub={`${devisSignes.length} devis signés`}
          tone="brand"
        />
        <MiniKpi
          label="Acomptes reçus"
          value={`${acomptesRecus} / ${acomptesTotal}`}
          sub={`${facturesPayees} / ${facturesTotal} factures payées`}
          tone="info"
        />
        <MiniKpi
          label="Honoraires prévus"
          value={
            dossier.typologie === 'amo'      ? fmt(honorairesAMOPrev) :
            dossier.typologie === 'courtage' ? fmt(honorairesCourtagePrev) :
            '—'
          }
          sub={
            dossier.typologie === 'amo'
              ? `Acompte ${tauxCourtagePct}% + Solde ${tauxAmoPct}%`
              : dossier.typologie === 'courtage'
              ? `${tauxCourtagePct}% du chantier TTC`
              : ''
          }
          tone="ok"
        />
      </div>

      {/* Notifications */}
      {succes && (
        <p style={{color:'var(--ok)',fontSize:13,background:'rgba(22,163,74,0.07)',
          border:'1px solid rgba(22,163,74,0.2)',borderRadius:10,padding:'10px 16px'}}>
          {succes}
        </p>
      )}
      {erreur && (
        <p style={{color:'var(--bad)',fontSize:13,background:'rgba(239,68,68,0.07)',
          border:'1px solid rgba(239,68,68,0.2)',borderRadius:10,padding:'10px 16px'}}>
          {erreur}
        </p>
      )}

      {/* 8-tab bar */}
      <div className="tabs" style={{overflowX:'auto'}}>
        {[
          { key:'apercu',    label:'Aperçu',           icon:<EyeIcon /> },
          { key:'devis',     label:'Devis & artisans', icon:<HammerIcon />, count: devis.length },
          { key:'comparateur', label:'Comparateur',    icon:<ChartIcon /> },
          { key:'planning',  label:'Planning',         icon:<CalIcon />,    count: rdvsDossier.length + interventionsDossier.length },
          { key:'photos',    label:'Photos',           icon:<CamIcon />,    count: photos.length },
          { key:'cr',        label:'Comptes-rendus',   icon:<DocIcon />,    count: comptesRendus.length },
          { key:'finance',   label:'Suivi financier',  icon:<WalletIcon /> },
          { key:'documents', label:'Documents',        icon:<FolderIcon />, count: documents.length },
          ...(dossier.typologie === 'amo' ? [{ key:'messages', label:'Messages', icon:<MsgIcon />, count: nbMsgNonLus > 0 ? nbMsgNonLus : undefined }] : []),
        ].map(t => (
          <button key={t.key} className={`tab ${onglet === t.key ? 'active' : ''}`}
            onClick={() => setOnglet(t.key)}>
            <span style={{display:'inline-flex',alignItems:'center',gap:6}}>
              {t.icon} {t.label}
              {t.count != null && t.count > 0 && (
                <span style={{
                  background: onglet === t.key ? 'var(--brand-800)' : 'var(--ink-200)',
                  color:      onglet === t.key ? '#fff' : 'var(--ink-600)',
                  fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:99
                }}>{t.count}</span>
              )}
            </span>
          </button>
        ))}
      </div>


      {/* ── APERÇU ── */}
      {onglet === 'apercu' && (
      <div style={{display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:20}}>

        {/* LEFT */}
        <div style={{display:'flex',flexDirection:'column',gap:18, minWidth:0}}>

          {/* Card 1 — Informations clés */}
          <div className="card" style={{padding:22}}>
            <h2 className="page" style={{fontSize:15, marginBottom:14}}>Informations clés</h2>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', rowGap:14, columnGap:18}}>
              <Fact label="Montant chantier" value={totalDevisTTCSignes > 0 ? fmt(totalDevisTTCSignes) : '—'} highlight />
              <Fact label="Commission prévue HT" value={fmt(calculateCommissionsFinance({ ...dossier, devis_artisans: devis }).comHT)} highlight />
              <Fact label="Démarrage" value={dossier.date_demarrage_chantier ? new Date(dossier.date_demarrage_chantier).toLocaleDateString('fr-FR') : '—'} />
              <Fact label="Fin prévue" value={dossier.date_fin_chantier ? new Date(dossier.date_fin_chantier).toLocaleDateString('fr-FR') : '—'} />
              <Fact label="Limite devis" value={dossier.date_limite_devis ? new Date(dossier.date_limite_devis).toLocaleDateString('fr-FR') : '—'} />
            </div>
            {dossier.description && (
              <div style={{marginTop:14, paddingTop:14, borderTop:'1px solid var(--ink-100)'}}>
                <div className="eyebrow" style={{marginBottom:6}}>Descriptif</div>
                <p style={{fontSize:13.5, color:'var(--ink-700)', lineHeight:1.55, margin:0}}>{dossier.description}</p>
              </div>
            )}
            {dossier.resume_projet && (
              <div style={{marginTop:14, paddingTop:14, borderTop:'1px solid var(--ink-100)'}}>
                <div className="eyebrow" style={{marginBottom:6}}>Résumé du projet</div>
                <p style={{fontSize:13.5, color:'var(--ink-700)', lineHeight:1.55, margin:0}}>{dossier.resume_projet}</p>
              </div>
            )}
          </div>

          {/* Contrat de prestation (déplacé de la modale "Modifier" → visible ici, sauvegarde immédiate) */}
          <div className="card" style={{padding:22}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
              <h2 className="page" style={{fontSize:15}}>Contrat de prestation</h2>
              <label style={{display:'flex',alignItems:'center',gap:8, cursor:'pointer'}}>
                <input type="checkbox" checked={dossier.contrat_signe || false}
                  onChange={async e => {
                    const v = e.target.checked
                    const payload = v
                      ? { contrat_signe: true, date_signature_contrat: dossier.date_signature_contrat || new Date().toISOString().slice(0, 10) }
                      : { contrat_signe: false, date_signature_contrat: null }
                    setDossier(d => ({ ...d, ...payload }))
                    const { error } = await supabase.from('dossiers').update(payload).eq('id', id)
                    if (error) { setErreur('Erreur : ' + error.message); setDossier(d => ({ ...d, contrat_signe: !v })) }
                  }}
                  style={{width:14, height:14, accentColor:'var(--brand-700)'}}/>
                <span style={{fontSize:13, fontWeight:600, color: dossier.contrat_signe ? '#15803d' : 'var(--ink-500)'}}>
                  {dossier.contrat_signe ? 'Signé' : 'Non signé'}
                </span>
              </label>
            </div>
            {dossier.contrat_signe && (
              <div style={{marginBottom:12}}>
                <label className="eyebrow" style={{display:'block', marginBottom:6}}>Date de signature</label>
                <input type="date" className="input" value={dossier.date_signature_contrat || ''}
                  onChange={async e => {
                    const v = e.target.value
                    setDossier(d => ({ ...d, date_signature_contrat: v }))
                    const { error } = await supabase.from('dossiers').update({ date_signature_contrat: v || null }).eq('id', id)
                    if (error) setErreur('Erreur : ' + error.message)
                  }}
                  style={{height:40, width:'100%'}}/>
              </div>
            )}
            {dossier.contrat_url ? (
              <div style={{display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:10, border:'1px solid var(--ink-200)', background:'var(--surface-2)'}}>
                <DocIcon/>
                <span className="clip-1" style={{fontSize:12, color:'var(--ink-700)', flex:1}}>{dossier.contrat_url.split('/').pop()}</span>
                <button onClick={ouvrirContrat} className="btn btn-ghost" style={{fontSize:11, padding:'4px 10px'}}>Voir</button>
                <button onClick={supprimerContrat} className="btn btn-ghost" style={{fontSize:11, padding:'4px 10px', color:'#b91c1c'}}>Supprimer</button>
              </div>
            ) : (
              <label className="btn btn-ghost" style={{cursor:'pointer', borderStyle:'dashed', justifyContent:'center', padding:'10px 14px'}}>
                {uploadingContrat ? 'Envoi en cours…' : '📎 Ajouter le contrat (PDF)'}
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.heic" style={{display:'none'}}
                  onChange={e => e.target.files[0] && uploadContrat(e.target.files[0])}/>
              </label>
            )}
          </div>

          {/* Card 2 — Avancement + 5 étapes */}
          <div className="card" style={{padding:22}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
              <h2 className="page" style={{fontSize:15}}>Avancement chantier</h2>
              <span className="tnum" style={{fontSize:18, fontWeight:800, color:'var(--brand-800)'}}>{avancement}%</span>
            </div>
            <Progress value={avancement} height={10} />
            <div style={{display:'grid', gridTemplateColumns:'repeat(5, 1fr)', marginTop:18, gap:10}}>
              {(() => {
                const step1 = !!dossier.contrat_signe                                   // Mandat R1 signé
                const step2 = devis.length > 0                                          // ≥1 devis (tout statut)
                const step3 = devis.length > 0 && devis.every(d => d.statut !== 'recu')  // 0 devis 'recu' (tous tranchés)
                const step4 = !!(dossier.date_demarrage_chantier || dossier.statut === 'en_cours_chantier') // chantier démarré
                const step5 = dossier.statut === 'termine'                              // chantier terminé
                // Monotonicité : étape N cochée ⇒ étapes 1..N-1 cochées.
                const done = [
                  step1 || step2 || step3 || step4 || step5,
                  step2 || step3 || step4 || step5,
                  step3 || step4 || step5,
                  step4 || step5,
                  step5,
                ]
                return ['Contact', 'Devis', 'Signature', 'Chantier', 'Livraison'].map((l, i) => (
                  <div key={i} style={{textAlign:'center'}}>
                    <div style={{
                      width:28, height:28, borderRadius:99, margin:'0 auto',
                      background: done[i] ? 'var(--ok)' : 'var(--ink-100)',
                      color: done[i] ? '#fff' : 'var(--ink-400)',
                      display:'grid', placeItems:'center', fontSize:13, fontWeight:700,
                    }}>{done[i] ? '✓' : i+1}</div>
                    <div style={{fontSize:11, color:'var(--ink-500)', marginTop:6, fontWeight:600}}>{l}</div>
                  </div>
                ))
              })()}
            </div>
          </div>

          {/* Card 3 — Frais de consultation (déplacé depuis onglet Devis) */}
          <div className="card" style={{padding:22}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <h2 className="page" style={{fontSize:15}}>Frais de consultation</h2>
              {dossier.frais_statut === 'regle' && <Badge tone="ok">Réglés</Badge>}
              {dossier.frais_statut === 'offerts' && <Badge tone="mute">Offerts</Badge>}
              {dossier.frais_statut === 'factures' && <Badge tone="warn">Facturés</Badge>}
              {dossier.frais_statut === 'rembourse' && <Badge tone="info">À rembourser</Badge>}
            </div>
            {dossier.frais_statut === 'offerts' ? (
              <div style={{fontSize:13, color:'var(--ink-500)'}}>Frais offerts — 0 €</div>
            ) : (
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
                <Fact label="Montant TTC" value={fmt(dossier.frais_consultation || 0)} highlight />
                <Fact label="Montant HT" value={fmt((dossier.frais_consultation || 0) / TVA_FRAIS)} />
              </div>
            )}
          </div>

          {/* Card 4 — Photos preview */}
          {photos.length > 0 && (
            <div className="card" style={{padding:22}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                <h2 className="page" style={{fontSize:15}}>Photos récentes</h2>
                <button className="btn btn-ghost" style={{fontSize:12, padding:'4px 10px'}}
                  onClick={() => setOnglet('photos')}>Voir tout · {photos.length}</button>
              </div>
              <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:8}}>
                {photos.slice(0, 4).map(p => (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img key={p.id} src={p.url_signee} alt=""
                    onClick={() => setOnglet('photos')}
                    style={{aspectRatio:'1/1', width:'100%', objectFit:'cover', borderRadius:8, cursor:'pointer', display:'block'}} />
                ))}
              </div>
            </div>
          )}

          {/* Card 5 — CR récents */}
          {comptesRendus.length > 0 && (
            <div className="card" style={{padding:22}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                <h2 className="page" style={{fontSize:15}}>Derniers comptes-rendus</h2>
                <button className="btn btn-ghost" style={{fontSize:12, padding:'4px 10px'}}
                  onClick={() => setOnglet('cr')}>Voir tout · {comptesRendus.length}</button>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                {comptesRendus.slice(0, 3).map(c => {
                  const typeColor = { r1:'#0094d4', r2:'#16a34a', r3:'#f59e0b', suivi:'#94a3b8', reception:'#16a34a' }[c.type_visite] || '#94a3b8'
                  const typeLabel = { r1:'R1', r2:'R2', r3:'R3', suivi:'Suivi', reception:'Réception' }[c.type_visite] || (c.type_visite || 'CR')
                  return (
                    <button key={c.id} onClick={() => setOnglet('cr')} className="row-hover"
                      style={{display:'grid', gridTemplateColumns:'auto 1fr', gap:12, alignItems:'flex-start',
                        padding:'10px 12px', borderRadius:10, border:'1px solid var(--ink-200)',
                        background:'none', textAlign:'left', cursor:'pointer', width:'100%'}}>
                      <div style={{width:36, padding:'4px 0', borderRadius:6, background:typeColor, color:'#fff',
                        textAlign:'center', fontSize:10, fontWeight:800, letterSpacing:0.05}}>{typeLabel}</div>
                      <div style={{minWidth:0}}>
                        <div style={{display:'flex',justifyContent:'space-between',gap:8}}>
                          <div className="clip-1" style={{fontSize:13, fontWeight:700, color:'var(--ink-900)'}}>{c.titre || 'Compte-rendu'}</div>
                          <span className="tnum" style={{fontSize:11, color:'var(--ink-400)', flexShrink:0}}>
                            {c.created_at ? new Date(c.created_at).toLocaleDateString('fr-FR') : ''}
                          </span>
                        </div>
                        {c.contenu && (
                          <div style={{fontSize:12, color:'var(--ink-500)', marginTop:3, lineHeight:1.45,
                            display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden'}}>{c.contenu}</div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

        </div>

        {/* RIGHT */}
        <div style={{display:'flex',flexDirection:'column',gap:18, minWidth:0}}>

          {/* Card 6 — Artisans signés */}
          <div className="card" style={{padding:22}}>
            <h2 className="page" style={{fontSize:15, marginBottom:12}}>Artisans · {devisSignes.length} signés</h2>
            {devisSignes.length === 0 ? (
              <div style={{textAlign:'center', padding:24, color:'var(--ink-400)', fontSize:13}}>Aucun devis signé</div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                {devisSignes.map(dv => (
                  <div key={dv.id} style={{
                    display:'grid', gridTemplateColumns:'auto 1fr auto', gap:10, alignItems:'center',
                    padding:'10px 12px', borderRadius:10, border:'1px solid var(--ink-200)',
                  }}>
                    <div style={{width:32,height:32,borderRadius:8,background:'var(--brand-50)',color:'var(--brand-800)',display:'grid',placeItems:'center'}}>
                      <HammerIcon/>
                    </div>
                    <div style={{minWidth:0}}>
                      <div className="clip-1" style={{fontSize:12.5, fontWeight:600, color:'var(--ink-900)'}}>{dv.artisan?.entreprise || '—'}</div>
                      {dv.artisan?.metier && <div style={{fontSize:11, color:'var(--ink-500)'}}>{dv.artisan.metier}</div>}
                    </div>
                    <div style={{textAlign:'right'}}>
                      {dv.montant_ttc > 0 && <div className="tnum" style={{fontSize:12, fontWeight:700, color:'var(--ink-900)'}}>{fmt(dv.montant_ttc)}</div>}
                      {dv.commission_pourcentage > 0 && (
                        <div style={{fontSize:10, color:'var(--brand-800)', fontWeight:600, marginTop:1}}>
                          {Math.round(dv.commission_pourcentage * 100)}% com.
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Card 7 — Prochains RDV */}
          <div className="card" style={{padding:22}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <h2 className="page" style={{fontSize:15}}>Prochains RDV</h2>
              <button className="btn btn-ghost" style={{fontSize:12, padding:'4px 10px'}}
                onClick={() => setOnglet('planning')}>Voir tout</button>
            </div>
            {(() => {
              const now = new Date()
              const next = (rdvsDossier || []).filter(r => new Date(r.date_heure) >= now)
                .sort((a,b) => new Date(a.date_heure) - new Date(b.date_heure))
                .slice(0, 3)
              if (next.length === 0) return <div style={{textAlign:'center', padding:18, color:'var(--ink-400)', fontSize:13}}>Aucun RDV à venir</div>
              return (
                <div style={{display:'flex',flexDirection:'column',gap:10}}>
                  {next.map(r => {
                    const dt = new Date(r.date_heure)
                    const day = dt.toLocaleDateString('fr-FR', { day:'2-digit' })
                    const month = dt.toLocaleDateString('fr-FR', { month:'short' }).replace('.','')
                    const time = dt.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })
                    const typeColor = {
                      visite_technique_client: '#0094d4',
                      visite_technique_artisan: '#16a34a',
                      presentation_devis: '#f59e0b',
                      suivi: '#7c3aed',
                      reception: '#10b981',
                      etude: '#e05252',
                    }[r.type_rdv] || '#94a3b8'
                    return (
                      <div key={r.id} style={{display:'grid', gridTemplateColumns:'44px 4px 1fr', gap:10, alignItems:'center', padding:'8px 0'}}>
                        <div style={{textAlign:'center'}}>
                          <div className="tnum" style={{fontSize:16, fontWeight:800, color:'var(--ink-900)', lineHeight:1}}>{day}</div>
                          <div style={{fontSize:9, fontWeight:700, color:'var(--ink-500)', textTransform:'uppercase', marginTop:2}}>{month}</div>
                        </div>
                        <div style={{width:4, alignSelf:'stretch', borderRadius:99, background: typeColor}}/>
                        <div style={{minWidth:0}}>
                          <div className="clip-1" style={{fontSize:12.5, fontWeight:600, color:'var(--ink-900)'}}>{r.titre || r.type_rdv || 'Rendez-vous'}</div>
                          <div style={{fontSize:11, color:'var(--ink-500)', marginTop:2}}>{time}{r.artisan?.entreprise ? ` · ${r.artisan.entreprise}` : ''}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>

          {/* Card 8 — Contact */}
          <div className="card" style={{padding:22}}>
            <h2 className="page" style={{fontSize:15, marginBottom:12}}>Contact</h2>
            <div style={{display:'flex',flexDirection:'column',gap:4}}>
              <ContactRow icon={<PhoneIcon/>} label="Téléphone" value={client?.telephone} action={client?.telephone ? `tel:${client.telephone}` : null} />
              <ContactRow icon={<MailIcon/>} label="Email" value={client?.email} action={client?.email ? `mailto:${client.email}` : null} />
              <ContactRow icon={<PinIcon/>} label="Adresse" value={client?.adresse} />
              {!client?.telephone && !client?.email && !client?.adresse && (
                <div style={{fontSize:13, color:'var(--ink-400)'}}>Aucun contact renseigné</div>
              )}
            </div>
          </div>

        </div>
      </div>
      )}

      {/* ── ÉDITION dossier — modale ouverte par le bouton "Modifier" du hero,
             accessible depuis n'importe quel onglet (avant : swap inline de l'onglet Aperçu). ── */}
      {modalModif && (
        <ModalShell
          title="Modifier le dossier"
          subtitle={dossier.reference}
          width={760}
          onClose={() => setModalModif(false)}
          footer={<>
            <button onClick={() => setModalModif(false)} className="btn btn-ghost" style={{fontSize:12.5}}>Annuler</button>
            <button onClick={handleSave} disabled={saving} className="btn btn-primary"
              style={{fontSize:12.5,display:'inline-flex',alignItems:'center',gap:6}}>
              <CheckIcon /> {saving ? '...' : 'Enregistrer'}
            </button>
          </>}
        >
      <div style={{display:'flex',flexDirection:'column',gap:18, padding:24}}>

        {/* Form principal */}
        <div className="card" style={{padding:24, display:'flex',flexDirection:'column',gap:16}}>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
            <div>
              <label className="eyebrow" style={{display:'block', marginBottom:6}}>Typologie</label>
              <select className="input" value={dossier.typologie || ''} onChange={e => set('typologie', e.target.value)} style={{height:40, width:'100%'}}>
                <option value="courtage">Courtage</option>
                <option value="amo">AMO</option>
                <option value="estimo">Estimo</option>
                <option value="merad">MERAD</option>
                <option value="audit_energetique">Audit énergétique</option>
                <option value="studio_jardin">Studio de jardin</option>
              </select>
            </div>
            <div>
              <label className="eyebrow" style={{display:'block', marginBottom:6}}>Date limite devis</label>
              <input type="date" className="input" value={dossier.date_limite_devis || ''} onChange={e => set('date_limite_devis', e.target.value)} style={{height:40, width:'100%'}}/>
            </div>
            <div>
              <label className="eyebrow" style={{display:'block', marginBottom:6}}>Démarrage chantier</label>
              <input type="date" className="input" value={dossier.date_demarrage_chantier || ''} onChange={e => set('date_demarrage_chantier', e.target.value)} style={{height:40, width:'100%'}}/>
            </div>
            <div>
              <label className="eyebrow" style={{display:'block', marginBottom:6}}>Fin de chantier</label>
              <input type="date" className="input" value={dossier.date_fin_chantier || ''} onChange={e => set('date_fin_chantier', e.target.value)} style={{height:40, width:'100%'}}/>
            </div>
          </div>

          <div>
            <label className="eyebrow" style={{display:'block', marginBottom:6}}>Description</label>
            <textarea className="input" value={dossier.description || ''} onChange={e => set('description', e.target.value)}
              rows={4} placeholder="Décrivez les travaux envisagés, le contexte du projet…"
              style={{width:'100%', padding:'10px 12px', lineHeight:1.5, resize:'vertical'}}/>
          </div>

          <div style={{paddingTop:14, borderTop:'1px solid var(--ink-100)'}}>
            <label className="eyebrow" style={{display:'block', marginBottom:8}}>Frais de consultation</label>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
              <div>
                <label style={{display:'block', fontSize:12, color:'var(--ink-500)', marginBottom:4}}>Statut</label>
                <select className="input" value={dossier.frais_statut || 'offerts'} onChange={e => set('frais_statut', e.target.value)} style={{height:40, width:'100%'}}>
                  <option value="offerts">Offerts</option>
                  <option value="rembourse">Remboursé après signature</option>
                  <option value="factures">Facturés (à régler)</option>
                  <option value="regle">Facturés et réglés</option>
                </select>
              </div>
              {dossier.frais_statut !== 'offerts' && (
                <div>
                  <label style={{display:'block', fontSize:12, color:'var(--ink-500)', marginBottom:4}}>Montant TTC (€)</label>
                  <input type="number" step="0.01" min="0" className="input"
                    value={dossier.frais_consultation || ''}
                    onChange={e => set('frais_consultation', e.target.value === '' ? '' : parseFloat(e.target.value))}
                    style={{height:40, width:'100%'}} />
                </div>
              )}
            </div>
          </div>

          {!referentEstAdmin && profile?.parts_agente_disponibles?.length > 1 && (
            <div style={{paddingTop:14, borderTop:'1px solid var(--ink-100)'}}>
              <label className="eyebrow" style={{display:'block', marginBottom:8}}>Répartition commission (agent / Société)</label>
              <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
                {profile.parts_agente_disponibles.map(pct => {
                  const pctFloat = parseFloat(pct)
                  const active = Math.round((dossier.part_agente ?? 0.5) * 100) === Math.round(pctFloat * 100)
                  return (
                    <button key={pct} type="button" onClick={() => set('part_agente', pctFloat)}
                      className="row-hover"
                      style={{
                        fontSize:12, padding:'6px 12px', borderRadius:99,
                        border:'1px solid', borderColor: active ? 'var(--brand-500)' : 'var(--ink-200)',
                        background: active ? 'var(--brand-50)' : '#fff',
                        color: active ? 'var(--brand-800)' : 'var(--ink-600)',
                        fontWeight:600, cursor:'pointer',
                      }}>
                      {Math.round(pctFloat * 100)} / {Math.round((1 - pctFloat) * 100)}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Apporteur (coût sortant) — visible si le client a un apporteur */}
        {client?.apporteur_affaires && (
          <div className="card" style={{padding:24}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, flexWrap:'wrap'}}>
              <div style={{minWidth:0}}>
                <h2 className="page" style={{fontSize:15, marginBottom:4}}>
                  Apporteur{client.apporteur_nom ? ` · ${client.apporteur_nom}` : ''} <span style={{color:'var(--ink-400)', fontWeight:400, fontSize:13}}>(coût)</span>
                </h2>
                <div style={{fontSize:12, color:'var(--ink-500)'}}>
                  {client.apporteur_pourcentage != null && client.apporteur_pourcentage !== ''
                    ? <>{parseFloat(client.apporteur_pourcentage)}% · {client.apporteur_base === 'total_chantier' ? 'sur total chantier HT' : 'par devis signé'}</>
                    : <span style={{color:'#b45309'}}>taux à définir, coût non calculé</span>}
                </div>
              </div>
              <label style={{display:'flex', alignItems:'center', gap:8, cursor:'pointer'}}>
                <input type="checkbox"
                  checked={dossier.apporteur_actif || false}
                  onChange={async e => {
                    const v = e.target.checked
                    const ancien = dossier.apporteur_actif
                    set('apporteur_actif', v)
                    const { error } = await supabase.from('dossiers').update({ apporteur_actif: v }).eq('id', id)
                    if (error) { setErreur('Erreur : ' + error.message); set('apporteur_actif', ancien) }
                  }}
                  style={{width:14, height:14, accentColor:'var(--brand-700)'}} />
                <span style={{fontSize:13, fontWeight:600, color: dossier.apporteur_actif ? 'var(--brand-800)' : 'var(--ink-500)'}}>
                  {dossier.apporteur_actif ? 'Appliqué à ce chantier' : 'Appliquer à ce chantier'}
                </span>
              </label>
            </div>
          </div>
        )}

        {/* Convertir typologie */}
        {(dossier.typologie === 'courtage' || dossier.typologie === 'amo') && (
          <div className="card" style={{padding:24}}>
            <h2 className="page" style={{fontSize:15, marginBottom:8}}>Convertir la typologie</h2>
            <p style={{fontSize:12, color:'var(--ink-500)', marginTop:0, marginBottom:14, lineHeight:1.5}}>
              {dossier.typologie === 'courtage'
                ? "Convertir en AMO pour ajouter des honoraires AMO (acompte + solde) en plus du courtage."
                : "Convertir en Courtage pour revenir à une facturation simple (honoraires de courtage uniquement)."}
            </p>
            <button onClick={dossier.typologie === 'courtage' ? convertirEnAMO : convertirEnCourtage}
              disabled={saving} className="btn btn-ghost"
              style={{fontSize:12.5, borderColor:'var(--warn)', color:'#a16207'}}>
              {dossier.typologie === 'courtage' ? '→ Convertir en AMO' : '→ Convertir en Courtage'}
            </button>
          </div>
        )}

        {/* Zone dangereuse */}
        <div className="card" style={{padding:24, borderColor:'rgba(239,68,68,0.2)'}}>
          <h2 className="page" style={{fontSize:15, marginBottom:8, color:'#b91c1c'}}>Zone dangereuse</h2>
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap'}}>
            <div>
              <div style={{fontSize:13, fontWeight:600, color:'var(--ink-900)', marginBottom:2}}>Supprimer définitivement ce chantier</div>
              <div style={{fontSize:12, color:'var(--ink-500)'}}>Cette action est irréversible — supprime le dossier et toutes ses données ({ENTITES_CHANTIER}).</div>
            </div>
            <button onClick={supprimerChantier} disabled={saving} className="btn btn-ghost"
              style={{fontSize:12.5, color:'#b91c1c', borderColor:'rgba(239,68,68,0.3)'}}>
              Supprimer le chantier
            </button>
          </div>
        </div>

      </div>
        </ModalShell>
      )}

      {/* ── DEVIS & ARTISANS ── */}
      {onglet === 'devis' && (
      <div style={{display:'flex',flexDirection:'column',gap:16}}>

        {/* Devis artisans */}
        <div className="card" style={{padding:0, overflow:'hidden'}}>
          <div style={{padding:'14px 22px', borderBottom:'1px solid var(--ink-200)', display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <h2 className="page" style={{fontSize:16}}>Devis du chantier</h2>
              <div className="eyebrow" style={{marginTop:4}}>{devis.length} devis · {devisSignes.length} signés</div>
            </div>
            <button onClick={() => setDevisModal({ open: true, devis: null })}
              className="btn btn-primary" style={{fontSize:12.5}}>
              + Ajouter un devis
            </button>
          </div>


          {devis.length === 0 ? (
            <div style={{padding:40, textAlign:'center', color:'var(--ink-400)', fontSize:13}}>Aucun devis pour le moment</div>
          ) : (
            <div style={{display:'flex', flexDirection:'column'}}>
              {devis.map((d, idx) => {
                const expanded = devisExpanded.has(d.id)
                const factDevis = factures.filter(f => f.devis_id === d.id)
                const factAcompte = factDevis.find(f => (f.libelle || '').toLowerCase().includes('acompte'))
                const factSolde = factDevis.find(f => (f.libelle || '').toLowerCase().includes('solde'))
                const finAc = calculateDevisFinance(d, dossier)
                const acompteExpected = finAc.acompte
                const soldeExpected = factAcompte?.montant_ttc != null
                  ? Math.max(0, (d.montant_ttc || 0) - factAcompte.montant_ttc)
                  : Math.max(0, finAc.solde)
                return (
                  <div key={d.id} style={{padding:'18px 22px', borderTop: idx === 0 ? 'none' : '1px solid var(--ink-100)'}}>

                    {/* En-tête replié — nom+métier | montant HT + com. | statut | chevron */}
                    <div className="devis-head" onClick={() => toggleDevisExpand(d.id)}>
                      <div className="devis-head-main">
                        <div className="devis-ico"><HammerIcon/></div>
                        <div style={{minWidth:0}}>
                          <div className="devis-name">
                            <span style={{fontSize:14, fontWeight:700, color:'var(--ink-900)'}}>{d.artisan?.entreprise || '—'}</span>
                            {d.artisan?.metier && <span style={{fontSize:11.5, color:'var(--ink-500)'}}>· {d.artisan.metier}</span>}
                          </div>
                          {(d.notes || (d.date_signature && d.statut === 'accepte')) && (
                            <div className="devis-sub">
                              {d.notes && <span className="clip-1" style={{fontStyle:'italic', minWidth:0}}>{d.notes}</span>}
                              {d.date_signature && d.statut === 'accepte' && (
                                <span>Signé le {new Date(d.date_signature).toLocaleDateString('fr-FR')}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="devis-amount">
                        {d.montant_ht > 0 && <div className="devis-amount-ht tnum">{fmt(d.montant_ht)} <span className="devis-amount-unit">HT</span></div>}
                        {d.commission_pourcentage > 0 && (
                          <div className="devis-amount-com">
                            <strong style={{color:'var(--brand-800)'}}>Com. {(d.commission_pourcentage * 100).toFixed(1)}%</strong>{' → '}<span className="tnum">{fmt(finAc.comHT)}</span> HT
                          </div>
                        )}
                      </div>
                      <div className="devis-badge">
                        {d.statut === 'accepte'    && <Badge tone="ok">Signé</Badge>}
                        {d.statut === 'recu'       && <Badge tone="info">Reçu</Badge>}
                        {d.statut === 'a_modifier' && <Badge tone="warn">À modifier</Badge>}
                        {d.statut === 'refuse'     && <Badge tone="bad">Refusé</Badge>}
                        {d.statut === 'en_attente' && <Badge tone="mute">En attente</Badge>}
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); toggleDevisExpand(d.id) }}
                        className="btn btn-ghost devis-chevron" title={expanded ? 'Masquer les détails' : 'Voir les détails'}>
                        <span style={{display:'inline-block', fontSize:10, lineHeight:1, transition:'transform 200ms', transform: expanded ? 'rotate(180deg)' : 'none'}}>▼</span>
                      </button>
                    </div>

                    {/* Détails dépliable */}
                    {expanded && (
                    <div className="devis-detail">

                    {/* 1 — Barre d'actions */}
                    <div className="devis-actions">
                      <div className="devis-actions-left">
                        <span style={{fontSize:11.5, color:'var(--ink-500)'}}>Ordre</span>
                        <button onClick={() => deplacerDevis(d.id, 'up')} disabled={idx === 0}
                          className="btn btn-ghost" style={{padding:'2px 8px', fontSize:11}}>▲</button>
                        <button onClick={() => deplacerDevis(d.id, 'down')} disabled={idx === devis.length - 1}
                          className="btn btn-ghost" style={{padding:'2px 8px', fontSize:11}}>▼</button>
                        <button onClick={() => setDevisModal({ open: true, devis: d })}
                          className="btn btn-ghost" style={{fontSize:11.5}}>✎ Modifier</button>
                        {d.statut === 'accepte' && (
                          <button onClick={() => { setNouvIntervArtisanId(d.artisan_id); setModalCreerIntervOuvert(true) }}
                            className="btn btn-ghost" style={{fontSize:11.5, color:'#15803d'}}>📅 Planifier une intervention</button>
                        )}
                      </div>
                      <button onClick={() => supprimerDevis(d.id)} className="btn btn-ghost" style={{padding:'4px 10px', fontSize:11, color:'#b91c1c'}}>🗑 Supprimer</button>
                    </div>
                    {d.statut === 'accepte' && interventionsDossier.filter(i => i.artisan_id === d.artisan_id).length > 0 && (
                      <div style={{display:'flex', flexDirection:'column', gap:4}}>
                        {interventionsDossier.filter(i => i.artisan_id === d.artisan_id).map(i => (
                          <div key={i.id} style={{fontSize:11, color:'var(--ink-500)', display:'flex', alignItems:'center', gap:8}}>
                            <span>🔨</span>
                            {i.type_intervention === 'periode'
                              ? `${new Date(i.date_debut).toLocaleDateString('fr-FR')} → ${new Date(i.date_fin).toLocaleDateString('fr-FR')}`
                              : `${i.jours_specifiques?.length} jour(s)`}
                            {i.notes && <span style={{color:'var(--ink-400)'}}>— {i.notes}</span>}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 2 — Statut cliquable */}
                    <div className="devis-statuts">
                      {['en_attente', 'recu', 'accepte', 'refuse', 'a_modifier'].map(st => {
                        const cfg = statutDevisConfig[st]
                        const active = d.statut === st
                        return (
                          <button key={st} onClick={() => changerStatutDevis(d.id, st)}
                            style={{
                              fontSize:11, fontWeight: active ? 700 : 600, padding:'4px 10px', borderRadius:99,
                              border:'1px solid', cursor:'pointer', transition:'all 150ms',
                              borderColor: active ? 'transparent' : 'var(--ink-200)',
                              background: active ? TONE_BG[cfg.tone] : 'transparent',
                              color: active ? TONE_FG[cfg.tone] : 'var(--ink-400)',
                            }}
                            onMouseEnter={e => { if (!active) e.currentTarget.style.borderColor = 'var(--ink-300)' }}
                            onMouseLeave={e => { if (!active) e.currentTarget.style.borderColor = 'var(--ink-200)' }}>
                            {cfg.label}
                          </button>
                        )
                      })}
                    </div>

                    {/* 3 — Infos côte à côte : Montants | Commission | Parts */}
                    <div className="devis-info-grid">
                      {/* Montants */}
                      <div className="devis-info-block">
                        <div className="devis-info-title">Montants</div>
                        <div className="devis-kv"><span>Montant HT</span><span className="tnum" style={{fontWeight:600, color:'var(--ink-900)'}}>{d.montant_ht ? fmt(d.montant_ht) : '—'}</span></div>
                        <div className="devis-kv"><span>Montant TTC</span><span className="tnum" style={{fontWeight:600, color:'var(--ink-900)'}}>{d.montant_ttc ? fmt(d.montant_ttc) : '—'}</span></div>
                        <div className="devis-kv" style={{alignItems:'center'}}>
                          <span>Acompte</span>
                          <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', justifyContent:'flex-end'}}>
                            <select value={d.acompte_pourcentage ?? 30}
                              onChange={async e => {
                                const newVal = parseFloat(e.target.value)
                                if (newVal === 0 && (d.commission_pourcentage || 0) > 0 && d.artisan?.partenaire !== true) {
                                  if (!window.confirm('Attention, acompte 0 : la commission ne sera pas prélevée. Confirmer ?')) {
                                    await chargerDevis()
                                    return
                                  }
                                }
                                const { error } = await supabase.from('devis_artisans').update({ acompte_pourcentage: newVal }).eq('id', d.id)
                                if (error) { setErreur('Erreur : ' + error.message); await chargerDevis(); return }
                                await chargerDevis()
                              }}
                              className="input" style={{height:26, fontSize:11, padding:'0 6px', minWidth:80}}>
                              <option value={30}>30%</option>
                              <option value={40}>40%</option>
                              <option value={-1}>Montant</option>
                              <option value={0}>Sans acompte</option>
                            </select>
                            {finAc.acompteMode === 'fixe' && (
                              <input type="number" step="0.01" placeholder="Montant TTC" defaultValue={d.acompte_montant_fixe || ''}
                                onBlur={async e => {
                                  const v = e.target.value !== '' && Number.isFinite(parseFloat(e.target.value)) ? parseFloat(e.target.value) : null
                                  const { error } = await supabase.from('devis_artisans').update({ acompte_montant_fixe: v }).eq('id', d.id)
                                  if (error) { setErreur('Erreur : ' + error.message); await chargerDevis(); return }
                                  await chargerDevis()
                                }}
                                className="input" style={{width:96, height:26, fontSize:11, padding:'0 6px'}} />
                            )}
                            <span className="tnum" style={{fontSize:11, fontWeight:600, color:'var(--ink-900)'}}>
                              {fmt(finAc.acompte)} TTC
                            </span>
                          </div>
                        </div>
                        {d.date_signature && d.statut === 'accepte' && (
                          <div className="devis-kv"><span style={{color:'#15803d'}}>Signé le</span><span style={{fontWeight:600, color:'#15803d'}}>{new Date(d.date_signature).toLocaleDateString('fr-FR')}</span></div>
                        )}
                        {d.statut === 'accepte' && (() => {
                          const suiviAcompte = suiviFinancier.find(s => s.type_echeance === 'acompte_artisan' && s.devis_id === d.id)
                          const acomptePaye = suiviAcompte?.statut_client === 'regle'
                          const dateAcompte = suiviAcompte?.date_paiement
                          const artId = d.artisan_id || d.artisan?.id
                          return (
                            <AcompteClientPill
                              acomptePaye={acomptePaye}
                              dateAcompte={dateAcompte}
                              onSetPaid={date => setAcompteArtisanPaye(artId, true, date, d.id)}
                              onUnsetPaid={() => setAcompteArtisanPaye(artId, false, null, d.id)}
                              toneBg={TONE_BG}
                              toneFg={TONE_FG}
                            />
                          )
                        })()}
                      </div>
                      {/* Commission */}
                      <div className="devis-info-block">
                        <div className="devis-info-title">Commission</div>
                        <div className="devis-kv"><span>Taux</span><span className="tnum" style={{fontWeight:600, color:'var(--ink-900)'}}>{d.commission_pourcentage ? `${(d.commission_pourcentage * 100).toFixed(1)} %` : '—'}</span></div>
                        <div className="devis-kv"><span>Montant HT</span><span className="tnum" style={{fontWeight:600, color:'var(--brand-800)'}}>{fmt(finAc.comHT)}</span></div>
                        {!referentEstAdmin && (
                          <div className="devis-kv"><span>Répartition</span><span className="tnum" style={{fontWeight:600, color:'var(--ink-900)'}}>{`${Math.round((dossier.part_agente ?? 0.5) * 100)} / ${Math.round((1 - (dossier.part_agente ?? 0.5)) * 100)}`}</span></div>
                        )}
                      </div>
                      {/* Parts */}
                      {!referentEstAdmin && d.commission_pourcentage > 0 && (() => {
                        const finDevis = calculateDevisFinance(d, dossier)
                        return (
                          <div className="devis-info-block">
                            <div className="devis-info-title">Parts</div>
                            <div className="devis-kv"><span>{dossier.referente?.prenom || 'agent'}</span><span className="tnum" style={{fontWeight:600, color:'var(--ink-700)'}}>{fmt(finDevis.parts.agente)}</span></div>
                            <div className="devis-kv"><span>{prenomAdmin}</span><span className="tnum" style={{fontWeight:600, color:'var(--ink-700)'}}>{fmt(finDevis.parts.admin)}</span></div>
                          </div>
                        )
                      })()}
                    </div>

                    {/* 4 — Acompte + Solde côte à côte (facturation) */}
                    {d.statut === 'accepte' && (
                      <div className="devis-facture-lines">
                        <FactureMiniLine
                          title={`Acompte ${finAc.acompteMode === 'fixe' ? '(fixe)' : finAc.acomptePct + '%'}`}
                          fact={factAcompte} expected={acompteExpected}
                          onAdd={() => {
                            setAjouterFacture(d.id)
                            setNouvelleFacture({ montant_ttc: acompteExpected > 0 ? acompteExpected.toFixed(2) : '', date_paiement: '', statut: 'en_attente', fichier: null, libelle: 'Facture acompte', libelle_autre: '' })
                            if (!devisExpanded.has(d.id)) toggleDevisExpand(d.id)
                          }}
                          onTogglePaid={() => factAcompte && toggleStatutFacture(factAcompte.id, factAcompte.statut)}
                          onView={() => factAcompte?.pdf_path && ouvrirDocument(factAcompte.pdf_path, `Facture acompte ${d.artisan?.entreprise || ''}.pdf`)}
                        />
                        <FactureMiniLine
                          title="Solde"
                          fact={factSolde} expected={soldeExpected}
                          onAdd={() => {
                            setAjouterFacture(d.id)
                            setNouvelleFacture({ montant_ttc: soldeExpected > 0 ? soldeExpected.toFixed(2) : '', date_paiement: '', statut: 'en_attente', fichier: null, libelle: 'Facture solde', libelle_autre: '' })
                            if (!devisExpanded.has(d.id)) toggleDevisExpand(d.id)
                          }}
                          onTogglePaid={() => factSolde && toggleStatutFacture(factSolde.id, factSolde.statut)}
                          onView={() => factSolde?.pdf_path && ouvrirDocument(factSolde.pdf_path, `Facture solde ${d.artisan?.entreprise || ''}.pdf`)}
                        />
                      </div>
                    )}

                    {/* 5 — Documents en grille */}
                    <div className="devis-docs">
                      {/* Devis artisan */}
                      <div className="devis-doc">
                        <span className="devis-doc-label">📄 Devis artisan</span>
                        <div className="devis-doc-act">
                          {d.devis_pdf_path ? (
                            <>
                              <button onClick={() => ouvrirDocument(d.devis_pdf_path, `Devis ${d.artisan?.entreprise || ''}.pdf`)}
                                style={{fontSize:11, color:'var(--brand-700)', background:'none', border:'none', cursor:'pointer', textDecoration:'underline'}}>Voir PDF</button>
                              <label style={{fontSize:11, cursor: uploadingDoc === d.id + '_devis' ? 'wait' : 'pointer', color: uploadingDoc === d.id + '_devis' ? 'var(--ink-400)' : 'var(--brand-700)'}}>
                                {uploadingDoc === d.id + '_devis' ? 'Upload…' : 'Remplacer'}
                                <input type="file" accept=".pdf" style={{display:'none'}} disabled={uploadingDoc === d.id + '_devis'}
                                  onChange={e => uploadDevisPdf(d.id, e.target.files[0])} />
                              </label>
                              <button onClick={async () => {
                                if (!confirm('Supprimer le PDF du devis ?')) return
                                const { error: rmErr } = await supabase.storage.from('documents').remove([d.devis_pdf_path])
                                if (rmErr) console.error('Suppression PDF devis (non bloquant) :', rmErr.message)
                                const { error } = await supabase.from('devis_artisans').update({ devis_pdf_path: null }).eq('id', d.id)
                                if (error) { setErreur('Erreur : ' + error.message); return }
                                await chargerDevis()
                              }} style={{fontSize:11, color:'#b91c1c', background:'none', border:'none', cursor:'pointer'}}>Supprimer</button>
                            </>
                          ) : (
                            <label className="devis-doc-upload" style={{cursor: uploadingDoc === d.id + '_devis' ? 'wait' : 'pointer', color: uploadingDoc === d.id + '_devis' ? 'var(--ink-400)' : 'var(--brand-700)'}}>
                              {uploadingDoc === d.id + '_devis' ? 'Upload…' : '+ Uploader'}
                              <input type="file" accept=".pdf" style={{display:'none'}} disabled={uploadingDoc === d.id + '_devis'}
                                onChange={e => uploadDevisPdf(d.id, e.target.files[0])} />
                            </label>
                          )}
                        </div>
                      </div>
                      {/* Devis signé client */}
                      <div className="devis-doc">
                        <span className="devis-doc-label">📄 Devis signé client</span>
                        <div className="devis-doc-act">
                          {d.devis_signe_path ? (
                            <>
                              <button onClick={() => ouvrirDocument(d.devis_signe_path, `Devis signé ${d.artisan?.entreprise || ''}.pdf`)}
                                style={{fontSize:11, color:'var(--brand-700)', background:'none', border:'none', cursor:'pointer', textDecoration:'underline'}}>Voir PDF</button>
                              <button onClick={() => supprimerDevisSigne(d.id, d.devis_signe_path)}
                                style={{fontSize:11, color:'#b91c1c', background:'none', border:'none', cursor:'pointer'}}>Supprimer</button>
                            </>
                          ) : (
                            <label className="devis-doc-upload" style={{cursor: uploadingDoc === d.id ? 'wait' : 'pointer', color: uploadingDoc === d.id ? 'var(--ink-400)' : 'var(--brand-700)'}}>
                              {uploadingDoc === d.id ? 'Upload…' : '+ Uploader'}
                              <input type="file" accept=".pdf" style={{display:'none'}} disabled={uploadingDoc === d.id}
                                onChange={e => e.target.files[0] && uploadDevisSigne(d.id, e.target.files[0])} />
                            </label>
                          )}
                        </div>
                      </div>
                      {/* PV de réception */}
                      <div className="devis-doc">
                        <span className="devis-doc-label">📋 PV de réception</span>
                        <div className="devis-doc-act">
                          {d.pv_path ? (
                            <>
                              <button onClick={() => ouvrirDocument(d.pv_path, `PV réception ${d.artisan?.entreprise || ''}.pdf`)}
                                style={{fontSize:11, color:'var(--brand-700)', background:'none', border:'none', cursor:'pointer', textDecoration:'underline'}}>Voir PDF</button>
                              <button onClick={() => supprimerPV(d.id, d.pv_path)}
                                style={{fontSize:11, color:'#b91c1c', background:'none', border:'none', cursor:'pointer'}}>Supprimer</button>
                            </>
                          ) : (
                            <label className="devis-doc-upload" style={{cursor: uploadingDoc === d.id ? 'wait' : 'pointer', color: uploadingDoc === d.id ? 'var(--ink-400)' : 'var(--brand-700)'}}>
                              {uploadingDoc === d.id ? 'Upload…' : '+ Uploader'}
                              <input type="file" accept=".pdf" style={{display:'none'}} disabled={uploadingDoc === d.id}
                                onChange={e => e.target.files[0] && uploadPV(d.id, e.target.files[0])} />
                            </label>
                          )}
                        </div>
                      </div>
                      {/* Factures artisan (tuile) */}
                      <div className="devis-doc">
                        <span className="devis-doc-label">🧾 Factures artisan · {factures.filter(f => f.devis_id === d.id).length}</span>
                        <div className="devis-doc-act">
                          <button onClick={() => {
                            const acompteMontant = finAc.acompte
                            setAjouterFacture(d.id)
                            setNouvelleFacture({ montant_ttc: acompteMontant > 0 ? acompteMontant.toFixed(2) : '', date_paiement: '', statut: 'en_attente', fichier: null, libelle: 'Facture acompte', libelle_autre: '' })
                          }}
                            style={{fontSize:11, color:'#15803d', border:'1px solid rgba(22,163,74,0.3)', padding:'2px 10px', borderRadius:6, background:'transparent', cursor:'pointer'}}>
                            + Ajouter
                          </button>
                        </div>
                      </div>
                      {/* Fiches techniques (tuile) */}
                      <div className="devis-doc">
                        <span className="devis-doc-label">🗂 Fiches techniques · {fichesTechChantier[d.artisan_id]?.length || 0}</span>
                        <div className="devis-doc-act">
                          <button onClick={() => setFichesPanelOuvert(fichesPanelOuvert === d.id ? null : d.id)}
                            style={{fontSize:11, color:'var(--brand-700)', background:'none', border:'none', cursor:'pointer', textDecoration:'underline'}}>
                            {fichesPanelOuvert === d.id ? 'Masquer' : 'Gérer'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Historique des versions (Phase 3) — v1/v2… + PDF + Restaurer */}
                    {versionsDevis[d.id]?.length > 0 && (
                      <div style={{marginTop:4, border:'1px solid var(--ink-100)', borderRadius:8, padding:'10px 12px', background:'var(--surface-2)'}}>
                        <div style={{fontSize:11, fontWeight:700, color:'var(--ink-500)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8}}>
                          🕓 Historique · {versionsDevis[d.id].length} version{versionsDevis[d.id].length > 1 ? 's' : ''}
                        </div>
                        <div style={{display:'flex', flexDirection:'column', gap:6}}>
                          {versionsDevis[d.id].map(v => (
                            <div key={v.id} style={{display:'flex', alignItems:'center', gap:10, fontSize:12, padding:'6px 8px', borderRadius:6,
                              background: v.est_courante ? 'rgba(0,148,212,0.08)' : 'transparent',
                              border: v.est_courante ? '1px solid rgba(0,148,212,0.25)' : '1px solid transparent'}}>
                              <span style={{fontWeight:700, color:'var(--ink-700)', minWidth:26}}>v{v.version_num}</span>
                              <span className="tnum" style={{fontWeight:600, color:'var(--ink-800)', minWidth:92}}>{fmt(v.montant_ttc || 0)} TTC</span>
                              <span style={{color:'var(--ink-400)', fontSize:11}}>{v.created_at ? new Date(v.created_at).toLocaleDateString('fr-FR', {day:'2-digit', month:'short', year:'2-digit'}) : ''}</span>
                              {v.est_courante && <span style={{fontSize:10, fontWeight:600, color:'var(--brand-700)', background:'rgba(0,148,212,0.12)', padding:'1px 7px', borderRadius:99}}>Courante</span>}
                              <div style={{marginLeft:'auto', display:'flex', gap:8, alignItems:'center'}}>
                                {v.devis_pdf_path && (
                                  <button onClick={() => ouvrirDocument(v.devis_pdf_path, `Devis v${v.version_num} ${d.artisan?.entreprise || ''}.pdf`)}
                                    style={{fontSize:11, color:'var(--brand-700)', background:'none', border:'none', cursor:'pointer', textDecoration:'underline'}}>PDF</button>
                                )}
                                {!v.est_courante && (
                                  <button onClick={() => restaurerVersion(d.id, v)}
                                    style={{fontSize:11, color:'#15803d', background:'none', border:'1px solid rgba(22,163,74,0.35)', borderRadius:6, padding:'2px 8px', cursor:'pointer'}}>Restaurer</button>
                                )}
                                {!v.est_courante && (
                                  <button onClick={() => supprimerVersion(d.id, v)} title="Supprimer cette version"
                                    style={{fontSize:11, color:'#b91c1c', background:'none', border:'none', cursor:'pointer'}}>Suppr.</button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Factures — liste + formulaire (pleine largeur) */}
                    {factures.filter(f => f.devis_id === d.id).length > 0 && (
                      <div style={{display:'flex', flexDirection:'column', gap:6}}>
                        {factures.filter(f => f.devis_id === d.id).map(f => (
                          <div key={f.id} style={{background:'var(--surface-2)', borderRadius:8, padding:8, display:'flex', flexDirection:'column', gap:6}}>
                            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, flexWrap:'wrap'}}>
                              <span style={{fontSize:11, fontWeight:600, color:'var(--ink-700)'}}>
                                {f.libelle || 'Facture'} — <span className="tnum">{fmt(f.montant_ttc || 0)}</span> TTC
                              </span>
                              <div style={{display:'flex', alignItems:'center', gap:8}}>
                                {f.date_paiement && <span className="tnum" style={{fontSize:11, color:'var(--ink-400)'}}>{new Date(f.date_paiement).toLocaleDateString('fr-FR')}</span>}
                                <button onClick={() => toggleStatutFacture(f.id, f.statut)}
                                  style={{
                                    fontSize:11, padding:'2px 10px', borderRadius:99, fontWeight:700, border:'none', cursor:'pointer',
                                    background: f.statut === 'paye' ? TONE_BG.ok : TONE_BG.warn,
                                    color: f.statut === 'paye' ? TONE_FG.ok : TONE_FG.warn,
                                  }}>
                                  {f.statut === 'paye' ? '✓ Payé' : '⏳ En attente'}
                                </button>
                                <button onClick={() => supprimerFactureArtisan(f.id, f.pdf_path)}
                                  style={{fontSize:13, color:'var(--ink-400)', background:'none', border:'none', cursor:'pointer', padding:'0 4px'}}
                                  onMouseEnter={e => { e.currentTarget.style.color = '#b91c1c' }}
                                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--ink-400)' }}>✕</button>
                              </div>
                            </div>
                            <div style={{display:'flex', alignItems:'center', gap:8}}>
                              {f.pdf_path ? (
                                <button onClick={() => ouvrirDocument(f.pdf_path, `Facture ${f.libelle || ''}.pdf`)}
                                  style={{fontSize:11, color:'var(--brand-700)', background:'none', border:'none', cursor:'pointer', textDecoration:'underline'}}>📄 Voir PDF</button>
                              ) : (
                                <label style={{
                                  fontSize:11, cursor: uploadingFacturePdf === f.id ? 'wait' : 'pointer',
                                  padding:'2px 8px', borderRadius:6, border:'1px solid',
                                  color: uploadingFacturePdf === f.id ? 'var(--ink-400)' : 'var(--brand-700)',
                                  borderColor: uploadingFacturePdf === f.id ? 'var(--ink-200)' : 'var(--brand-200)',
                                }}>
                                  {uploadingFacturePdf === f.id ? 'Upload…' : '+ PDF'}
                                  <input type="file" accept=".pdf" style={{display:'none'}} disabled={uploadingFacturePdf === f.id}
                                    onChange={e => e.target.files[0] && uploadFacturePdf(f.id, e.target.files[0])} />
                                </label>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {ajouterFacture === d.id && (
                          <div style={{border:'1px solid rgba(22,163,74,0.2)', background:'rgba(22,163,74,0.05)', borderRadius:10, padding:12, display:'flex', flexDirection:'column', gap:8}}>
                            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
                              <ModalField label="Montant TTC (€)" required>
                                <input type="number" step="0.01" className="input" value={nouvelleFacture.montant_ttc}
                                  onChange={e => setNouvelleFacture(f => ({ ...f, montant_ttc: e.target.value }))}
                                  style={{height:32, padding:'0 10px', fontSize:12}} />
                              </ModalField>
                              <ModalField label="Date de paiement">
                                <input type="date" className="input" value={nouvelleFacture.date_paiement}
                                  onChange={e => setNouvelleFacture(f => ({ ...f, date_paiement: e.target.value }))}
                                  style={{height:32, padding:'0 10px', fontSize:12}} />
                              </ModalField>
                            </div>
                            <ModalField label="Libellé">
                              <select value={nouvelleFacture.libelle}
                                onChange={e => {
                                  const libelle = e.target.value
                                  setNouvelleFacture(f => {
                                    const next = { ...f, libelle, libelle_autre: '' }
                                    if (libelle === 'Facture acompte') {
                                      const m = finAc.acompte
                                      if (m > 0) next.montant_ttc = m.toFixed(2)
                                    }
                                    return next
                                  })
                                }}
                                className="input" style={{height:32, padding:'0 10px', fontSize:12}}>
                                <option value="Facture acompte">Facture acompte</option>
                                <option value="Facture de situation">Facture de situation</option>
                                <option value="Facture solde">Facture solde</option>
                                <option value="Autre">Autre (saisie libre)</option>
                              </select>
                              {nouvelleFacture.libelle === 'Autre' && (
                                <input type="text" placeholder="Préciser le libellé"
                                  value={nouvelleFacture.libelle_autre}
                                  onChange={e => setNouvelleFacture(f => ({ ...f, libelle_autre: e.target.value }))}
                                  className="input" style={{height:32, padding:'0 10px', fontSize:12, marginTop:6}} />
                              )}
                            </ModalField>
                            <select value={nouvelleFacture.statut}
                              onChange={e => setNouvelleFacture(f => ({ ...f, statut: e.target.value }))}
                              className="input" style={{height:32, padding:'0 10px', fontSize:12}}>
                              <option value="en_attente">⏳ En attente</option>
                              <option value="paye">✓ Payé</option>
                            </select>
                            <label style={{
                              display:'inline-flex', alignItems:'center', gap:8, fontSize:11, color:'var(--ink-600)',
                              border:'1px solid var(--ink-200)', borderRadius:8, padding:'6px 10px',
                              cursor:'pointer', alignSelf:'flex-start', background:'#fff',
                            }}>
                              {nouvelleFacture.fichier ? `✓ ${nouvelleFacture.fichier.name}` : '+ PDF facture (optionnel)'}
                              <input type="file" accept=".pdf" style={{display:'none'}}
                                onChange={e => setNouvelleFacture(f => ({ ...f, fichier: e.target.files[0] || null }))} />
                            </label>
                            <div style={{display:'flex', gap:8}}>
                              <button onClick={() => setAjouterFacture(null)} className="btn btn-ghost" style={{flex:1, fontSize:12, justifyContent:'center'}}>Annuler</button>
                              <button onClick={() => ajouterFactureArtisan(d.id, d.artisan_id)}
                                disabled={!nouvelleFacture.montant_ttc}
                                className="btn btn-primary" style={{flex:1, fontSize:12, justifyContent:'center', background:'#15803d', borderColor:'#15803d'}}>Enregistrer</button>
                            </div>
                          </div>
                    )}
                    {fichesPanelOuvert === d.id && (
                      <FichesTechPanel artisanId={d.artisan_id} dossierId={id} fichesCochees={fichesTechChantier[d.artisan_id] || []} onToggle={toggleFicheTech} onCreated={chargerFichesTechChantier} />
                    )}

                    </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

        </div>

        {/* Honoraires client (restylé tokens) */}
        {['courtage', 'amo'].includes(dossier.typologie) && totalDevisTTCRecus > 0 && (
          <div className="card" style={{padding:0, overflow:'hidden'}}>
            <div style={{padding:'14px 22px', borderBottom:'1px solid var(--ink-200)'}}>
              <h2 className="page" style={{fontSize:16}}>Honoraires client</h2>
              <div className="eyebrow" style={{marginTop:4}}>
                Calculés sur <span className="tnum" style={{color:'var(--ink-700)', fontWeight:600}}>{fmt(finDossier.honorairesPrevi.totalDevisTTCRecus)}</span> TTC (devis reçus + signés)
              </div>
            </div>
            <div className="hono-settings">
              <div className="hono-taux">
                <label style={{fontSize:11, fontWeight:600, color:'var(--brand-800)'}}>Taux courtage</label>
                <input
                  type="number" step="0.1" min="0" max="20"
                  value={(dossier.taux_courtage ?? COURTAGE_STANDARD) * 100}
                  onFocus={() => { tauxAvantEditRef.current.taux_courtage = dossier.taux_courtage }}
                  onChange={e => set('taux_courtage', parseFloat(e.target.value || 0) / 100)}
                  onBlur={e => persistTaux('taux_courtage', parseFloat(e.target.value || 0) / 100)}
                  onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
                  className="input"
                  style={{width:78, height:32, fontSize:12, textAlign:'center', padding:'0 8px'}}
                />
                <span style={{fontSize:11, color:'var(--ink-400)'}}>%</span>
              </div>
              {dossier.typologie === 'amo' && (
                <div className="hono-taux">
                  <label style={{fontSize:11, fontWeight:600, color:'var(--brand-800)'}}>Taux AMO</label>
                  <input
                    type="number" step="0.1" min="0" max="20"
                    value={dossier.honoraires_amo_taux ?? AMO_STANDARD * 100}
                    onFocus={() => { tauxAvantEditRef.current.honoraires_amo_taux = dossier.honoraires_amo_taux }}
                    onChange={e => set('honoraires_amo_taux', parseFloat(e.target.value || 0))}
                    onBlur={e => persistTaux('honoraires_amo_taux', parseFloat(e.target.value || 0))}
                    onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
                    className="input"
                    style={{width:78, height:32, fontSize:12, textAlign:'center', padding:'0 8px'}}
                  />
                  <span style={{fontSize:11, color:'var(--ink-400)'}}>%</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Récapitulatif chantier (restylé tokens, déplacé depuis Finance) */}
        {devis.length > 0 && (
          <div className="card" style={{padding:0, overflow:'hidden'}}>
            <div style={{padding:'14px 22px', borderBottom:'1px solid var(--ink-200)'}}>
              <h2 className="page" style={{fontSize:16}}>Récapitulatif chantier</h2>
              <div className="eyebrow" style={{marginTop:4}}>Totaux prévisionnel et signé · {devis.length} devis</div>
            </div>
            <div style={{padding:16, display:'flex', flexDirection:'column', gap:12}}>

              {(() => {
                // Bascule visuelle : le mode affiché retombe sur l'autre si le sien est vide.
                const recapAff = (recapMode === 'previsionnel' && devisRecus.length === 0) ? 'signe'
                  : (recapMode === 'signe' && devisSignes.length === 0) ? 'previsionnel'
                  : recapMode
                return (
                <>
                  {/* Bascule Prévisionnel / Signé */}
                  <div className="recap-toggle">
                    <button className={`recap-tab ${recapAff === 'previsionnel' ? 'active' : ''}`}
                      onClick={() => setRecapMode('previsionnel')}>Prévisionnel · {devisRecus.length} devis</button>
                    <button className={`recap-tab ${recapAff === 'signe' ? 'active' : ''}`}
                      onClick={() => setRecapMode('signe')}>Signé · {devisSignes.length} devis</button>
                  </div>

                  {/* 3 formules côte à côte */}
                  <div className="recap-grid">
                    {/* Colonne 1 — Courtage seul */}
                    {['courtage', 'amo'].includes(dossier?.typologie) && (
                      <div className="recap-col">
                        <div className="recap-col-head"><span>Courtage seul</span><span className="recap-col-pct">{tauxCourtagePct}%</span></div>
                        <div className="recap-kv"><span>Travaux TTC</span><span className="tnum">{recapAff === 'previsionnel' ? fmt(totalDevisTTCRecus) : fmt(totalDevisTTCSignes)}</span></div>
                        <div className="recap-kv"><span>Honoraires ({tauxCourtagePct}%)</span><span className="tnum">{recapAff === 'previsionnel' ? fmt(honorairesCourtagePrev) : fmt(honorairesCourtage)}</span></div>
                        <div className="recap-total"><span>Total chantier</span><span className="tnum recap-total-val">{recapAff === 'previsionnel' ? fmt(totalDevisTTCRecus + honorairesCourtagePrev + (fraisDansTotal ? fraisTTC : 0)) : fmt(totalDevisTTCSignes + honorairesCourtage + (fraisDansTotal ? fraisTTC : 0))}</span></div>
                      </div>
                    )}
                    {/* Colonne 2 — + AMO plein tarif (15%) */}
                    {dossier.typologie === 'amo' && (
                      <div className="recap-col">
                        <div className="recap-col-head"><span>+ AMO plein tarif</span><span className="recap-col-pct">15%</span></div>
                        <div className="recap-kv"><span>Travaux TTC</span><span className="tnum">{recapAff === 'previsionnel' ? fmt(totalDevisTTCRecus) : fmt(totalDevisTTCSignes)}</span></div>
                        <div className="recap-kv"><span>Honoraires (15%)</span><span className="tnum">{recapAff === 'previsionnel' ? fmt(finDossier.honorairesPrevi.standard.totalTTC) : fmt(finDossier.honoraires.standard.totalTTC)}</span></div>
                        <div className="recap-total"><span>Total chantier</span><span className="tnum recap-total-val">{recapAff === 'previsionnel' ? fmt(totalDevisTTCRecus + finDossier.honorairesPrevi.standard.totalTTC + (fraisDansTotal ? fraisTTC : 0)) : fmt(totalDevisTTCSignes + finDossier.honoraires.standard.totalTTC + (fraisDansTotal ? fraisTTC : 0))}</span></div>
                      </div>
                    )}
                    {/* Colonne 3 — + AMO remisé */}
                    {dossier.typologie === 'amo' && tauxAmoPct !== AMO_STANDARD * 100 && (
                      <div className="recap-col recap-col-remise">
                        <div className="recap-col-head"><span>+ AMO remisé</span><span className="recap-col-pct">{parseFloat((tauxCourtagePct + tauxAmoPct).toFixed(1))}%</span></div>
                        <div className="recap-kv"><span>Travaux TTC</span><span className="tnum">{recapAff === 'previsionnel' ? fmt(totalDevisTTCRecus) : fmt(totalDevisTTCSignes)}</span></div>
                        <div className="recap-kv"><span>Honoraires ({parseFloat((tauxCourtagePct + tauxAmoPct).toFixed(1))}%)</span><span className="tnum">{recapAff === 'previsionnel' ? fmt(honorairesAMOPrev) : fmt(honorairesAMO)}</span></div>
                        <div className="recap-total"><span>Total chantier</span><span className="tnum recap-total-val">{recapAff === 'previsionnel' ? fmt(totalDevisTTCRecus + honorairesAMOPrev + (fraisDansTotal ? fraisTTC : 0)) : fmt(totalDevisTTCSignes + honorairesAMO + (fraisDansTotal ? fraisTTC : 0))}</span></div>
                      </div>
                    )}
                  </div>
                  {fraisDansTotal && (
                    <div style={{marginTop:2, fontSize:11, color:'var(--ink-500)', textAlign:'right'}}>
                      dont frais consultation {fmt(fraisTTC)}
                    </div>
                  )}
                </>
                )
              })()}
            </div>
          </div>
        )}

      </div>
      )}

      {/* ── SUIVI FINANCIER (maquette : KPI gains + Échéances) ── */}
      {onglet === 'finance' && (() => {
        const fin = finDossier

        // Frais de consultation — comptés en réel seulement si réglés (offerts / en attente → 0)
        const fraisRegle       = dossier?.frais_statut === 'regle'
        const fraisOfferts     = dossier?.frais_statut === 'offerts'
        const fraisHTReal      = fraisRegle ? fin.frais.fraisHT : 0
        const fraisNet         = fraisRegle ? fin.frais.net : 0
        const fraisRoyalties   = fraisRegle ? fin.frais.royalties : 0
        const fraisAgente      = fraisRegle ? fin.frais.parts.agente : 0
        const fraisAdmin       = fraisRegle ? fin.frais.parts.admin : 0

        // Commissions — comptées uniquement si l'encaissement est confirmé
        // (statut_illico='recu'), y compris paiement direct : ce flag est un routage de
        // paiement, pas un apporteur d'affaires → la commission n'est PAS acquise dès la
        // signature, mais quand la case « Paiement direct » est cochée.
        const comDebloque = (fin.commissions?.devis || []).filter(dv => {
          if (dv.refused) return false
          const sf = suiviFinancier.find(s => s.type_echeance === 'acompte_artisan' && s.devis_id === dv.id)
          return sf?.statut_illico === 'recu'
        })
        const comHTReal        = comDebloque.reduce((s, d) => s + d.comHT, 0)
        const comRoyalties     = comDebloque.reduce((s, d) => s + d.royaltiesType2, 0)
        const comNet           = comDebloque.reduce((s, d) => s + d.netCom, 0)
        const comAgente        = comDebloque.reduce((s, d) => s + d.parts.agente, 0)
        const comAdmin         = comDebloque.reduce((s, d) => s + d.parts.admin, 0)

        // Honoraires — comptés par composant seulement si réglé (courtage / AMO solde)
        const courtageRegle    = suiviCourtage?.statut_client === 'regle'
        const amoSoldeRegle    = suiviSoldeAMO?.statut_client === 'regle'
        // Cohabitation solde AMO échelonné : Σ tranches si présentes, sinon gate
        // tout-ou-rien actuel (branches else laissées verbatim).
        const soldeAmoR        = calculateSoldeAmoReel({ ...dossier, devis_artisans: devis, suivi_financier: suiviFinancier })
        const honRoyalties     = (courtageRegle ? fin.honoraires.courtage.royalties : 0) + (soldeAmoR.hasTranches ? soldeAmoR.recognizedRoyalties : (amoSoldeRegle ? fin.honoraires.soldeAmo.royalties : 0))
        const honAgente        = (courtageRegle ? fin.honoraires.courtage.parts.agente : 0) + (soldeAmoR.hasTranches ? soldeAmoR.parts.agente : (amoSoldeRegle ? fin.honoraires.soldeAmo.parts.agente : 0))
        const honAdmin         = (courtageRegle ? fin.honoraires.courtage.parts.admin : 0) + (soldeAmoR.hasTranches ? soldeAmoR.parts.admin : (amoSoldeRegle ? fin.honoraires.soldeAmo.parts.admin : 0))

        // Réel = somme des flux réellement comptés ; net déduit du coût apporteur RÉEL (acomptes débloqués)
        const royaltiesTotal   = fraisRoyalties + honRoyalties + comRoyalties
        const gainAgente       = fraisAgente + honAgente + comAgente - fin.apporteur.partsReel.agente
        const gainAdmin        = fraisAdmin  + honAdmin  + comAdmin  - fin.apporteur.partsReel.admin
        const totalNet         = gainAgente + gainAdmin
        const partAgenteCfg    = fin.settings.partAgente
        const fmtD = (date) => date ? new Date(date).toLocaleDateString('fr-FR', { day:'2-digit', month:'short' }) : null

        return (
        <div style={{display:'flex',flexDirection:'column',gap:18}}>

          {/* KPI grid : récap gains */}
          <div className="kpi-grid">
            <MiniKpi
              label="Frais consult. HT"
              value={fraisOfferts ? 'Offert' : fmt(fraisHTReal)}
              sub={fraisOfferts ? 'frais offerts' : `net ${fmt(fraisNet)}`}
              tone="brand"
            />
            <MiniKpi
              label="Commissions HT"
              value={fmt(comHTReal)}
              sub={`net ${fmt(comNet)}`}
              tone="brand"
            />
            <MiniKpi
              label="Royalties (5%)"
              value={fmt(royaltiesTotal)}
              sub="prélevées par illiCO France"
              tone="brand"
            />
            <MiniKpi
              label={referentEstAdmin ? 'Net franchisé' : 'Net total'}
              value={fmt(totalNet)}
              sub={partAgenteCfg > 0
                ? `Agente ${fmt(gainAgente)} · Société ${fmt(gainAdmin)}`
                : 'tout pour le franchisé'}
              tone="brand"
            />
          </div>

          {/* Échéances */}
          <div className="card" style={{padding:0, overflow:'hidden'}}>
            <div style={{padding:'14px 22px', borderBottom:'1px solid var(--ink-200)'}}>
              <h2 className="page" style={{fontSize:15}}>Échéances · suivi financier</h2>
              <div className="eyebrow" style={{marginTop:4}}>
                Coche au fur et à mesure des règlements et déclenchements illiCO
              </div>
            </div>
            {/* Deux blocs côte à côte : (A) par devis · (B) autres échéances */}
            <div className="suivi-grid">

              {/* ── BLOC A — PAR DEVIS ── */}
              <div className="suivi-bloc">
                <div className="suivi-bloc-title">Par devis</div>
                <div className="suivi-table">
                  {/* Pas de thead : chaque EcheanceRow porte son propre label
                      (« Acompte client » / « Acompte débloqué ») → en-tête de colonnes redondant. */}
                  {/* Acompte client + illiCO débloqué (par devis signé) */}
                  {devisSignes.map(dv => {
                    const artId = dv.artisan_id || dv.artisan?.id
                    const sf = suiviFinancier.find(s => s.type_echeance === 'acompte_artisan' && s.devis_id === dv.id)
                    const finDv = calculateDevisFinance(dv, dossier)
                    const acompteMontant = finDv.acompte
                    const comDevisHT = finDv.comHT
                    return (
                      <div key={`ech-${dv.id}`} className="suivi-devis-row">
                        <div className="suivi-devis-name">{dv.artisan?.entreprise || '—'}</div>
                        <div className="suivi-devis-cell">
                          <EcheanceRow
                            label="Acompte client"
                            sub={`${finDv.acompteMode === 'fixe' ? 'fixe' : finDv.acomptePct + '%'} acompte · ${fmt(acompteMontant)} TTC`}
                            statut={sf?.statut_client || 'en_attente'}
                            date={sf?.date_paiement || null}
                            onSetPaid={d => setAcompteArtisanPaye(artId, true, d, dv.id)}
                            onUnsetPaid={() => setAcompteArtisanPaye(artId, false, null, dv.id)}
                            fmtDateFn={fmtD}
                          />
                        </div>
                        <div className="suivi-devis-cell">
                          <EcheanceRow
                            label={dv.artisan?.paiement_direct ? 'Paiement direct' : 'Acompte débloqué'}
                            sub={`Commission ${fmt(comDevisHT)} HT`}
                            statut={sf?.statut_illico === 'recu' ? 'regle' : 'en_attente'}
                            date={sf?.date_deblocage || null}
                            onSetPaid={d => setDeblocagePaye(artId, true, dv.id, d)}
                            onUnsetPaid={() => setDeblocagePaye(artId, false, dv.id)}
                            variant="illico"
                            fmtDateFn={fmtD}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* ── BLOC B — AUTRES ÉCHÉANCES ── */}
              <div className="suivi-bloc">
                <div className="suivi-bloc-title">Autres échéances</div>
                <div className="suivi-autres">

              {/* Frais de consultation */}
              {(dossier.frais_consultation || 0) > 0 && (
                <EcheanceRow
                  label="Frais de consultation"
                  sub={`${fmt(dossier.frais_consultation)} TTC`}
                  statut={dossier.frais_statut === 'regle' || dossier.frais_statut === 'offerts' ? 'regle' : 'en_attente'}
                  date={dossier.frais_statut === 'regle' ? (suiviFrais?.date_paiement || null) : null}
                  fmtDateFn={fmtD}
                />
              )}

              {/* Honoraires courtage — AMO, ou courtage SANS travaux supplémentaires (inchangé) */}
              {(dossier.typologie === 'amo' || (dossier.typologie === 'courtage' && suiviCourtageTS.length === 0)) && (
                <EcheanceRow
                  label="Honoraires courtage"
                  sub={`${tauxCourtagePct}% travaux HT · ${fmt(honorairesCourtagePrev)}`}
                  statut={suiviCourtage?.statut_client || 'en_attente'}
                  date={(suiviCourtage?.statut_client === 'regle' && suiviCourtage.date_paiement) || null}
                  onSetPaid={d => majSuiviChantier('honoraires_courtage', honorairesCourtagePrev, 'regle', d)}
                  onUnsetPaid={() => majSuiviChantier('honoraires_courtage', honorairesCourtagePrev, 'en_attente')}
                  fmtDateFn={fmtD}
                />
              )}

              {/* Courtage AVEC travaux supplémentaires : initial (hors TS) + 1 ligne par TS + total.
                  Total = base complète × taux INCHANGÉ, seulement ventilé. */}
              {dossier.typologie === 'courtage' && suiviCourtageTS.length > 0 && (
                <>
                  <EcheanceRow
                    label="Honoraires courtage — initial"
                    sub={`${tauxCourtagePct}% travaux HT (hors TS) · ${fmt(courtageTS.courtageInitialTtc)}`}
                    statut={suiviCourtage?.statut_client || 'en_attente'}
                    date={(suiviCourtage?.statut_client === 'regle' && suiviCourtage.date_paiement) || null}
                    onSetPaid={d => majSuiviChantier('honoraires_courtage', courtageTS.courtageInitialTtc, 'regle', d)}
                    onUnsetPaid={() => majSuiviChantier('honoraires_courtage', courtageTS.courtageInitialTtc, 'en_attente')}
                    fmtDateFn={fmtD}
                    lock={suiviCourtage?.statut_client === 'regle' && suiviCourtageTS.length > 0}
                    lockMsg="Le courtage initial ne peut pas être décoché tant qu'il existe des travaux supplémentaires (cela supprimerait la date de référence des TS). Supprimez d'abord les lignes TS."
                  />
                  {suiviCourtageTS.map((l, i) => (
                    <EcheanceRow
                      key={l.id}
                      label={`Courtage — travaux supplémentaires${suiviCourtageTS.length > 1 ? ` (TS ${i + 1})` : ''}`}
                      sub={`${tauxCourtagePct}% travaux HT · ${fmt(Number(l.montant_ttc || 0))}`}
                      statut={l.statut_client === 'regle' ? 'regle' : 'en_attente'}
                      date={(l.statut_client === 'regle' && l.date_paiement) || null}
                      onSetPaid={d => setCourtageTSPaye(l, true, d)}
                      onUnsetPaid={() => setCourtageTSPaye(l, false)}
                      fmtDateFn={fmtD}
                    />
                  ))}
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', padding:'6px 14px', fontSize:12.5}}>
                    <span style={{color:'var(--ink-500)', fontWeight:600}}>Total courtage (initial + TS)</span>
                    <span className="tnum" style={{color:'var(--ink-900)', fontWeight:800}}>{fmt(courtageTS.courtageTotalTtc)}</span>
                  </div>
                </>
              )}

              {/* Honoraires AMO solde (typologie AMO) — échelonnable en tranches encaissées.
                  Cohabitation : 0 tranche → EcheanceRow tout-ou-rien actuel (inchangé) ;
                  ≥1 tranche → synthèse « encaissé / reste » + panneau liste + ajout. */}
              {dossier.typologie === 'amo' && (() => {
                const tranchesAmo = suiviFinancier
                  .filter(s => s.type_echeance === 'solde_amo_paiement')
                  .sort((a, b) => new Date(a.date_paiement || 0) - new Date(b.date_paiement || 0))
                const hasTranches   = tranchesAmo.length > 0
                const soldeTotalTtc = fin.honoraires.soldeAmo.ttc   // réel/signés (décision a)
                const encaisse      = tranchesAmo.reduce((s, t) => s + Number(t.montant_ttc || 0), 0)
                const reste         = soldeTotalTtc - encaisse
                const soldeState    = Math.abs(reste) < 0.01 ? 'solde' : reste > 0 ? 'reste' : 'trop'
                const soldeColor    = soldeState === 'solde' ? '#15803d' : soldeState === 'trop' ? '#b91c1c' : '#c2410c'
                const today         = new Date().toISOString().slice(0, 10)
                return (
                  <div style={{display:'flex', flexDirection:'column', gap:8}}>
                    {hasTranches ? (
                      <div className="suivi-amo-synth">
                        <div style={{minWidth:0}}>
                          <div style={{fontSize:13, fontWeight:600, color:'var(--ink-900)'}}>Honoraires AMO — solde</div>
                          <div style={{fontSize:11.5, color:'var(--ink-500)', marginTop:2}}>
                            {tauxAmoPct}% travaux HT · {fmt(soldeTotalTtc)} attendu
                          </div>
                        </div>
                        <div style={{display:'flex', alignItems:'center', gap:10}}>
                          <span className="tnum" style={{fontSize:12, fontWeight:700, color: soldeColor}}>
                            {fmt(encaisse)} encaissés · {soldeState === 'trop' ? `trop-perçu ${fmt(-reste)}` : soldeState === 'solde' ? 'soldé' : `reste ${fmt(reste)}`}
                          </span>
                          <button type="button" className="suivi-amo-chevron" onClick={() => setSoldeAmoDeplie(v => !v)}>
                            {soldeAmoDeplie ? '▲' : '▼'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <EcheanceRow
                          label="Honoraires AMO — solde"
                          sub={`${tauxAmoPct}% travaux HT · ${fmt(honorairesAMOPrev - honorairesCourtagePrev)}`}
                          statut={suiviSoldeAMO?.statut_client || 'en_attente'}
                          date={(suiviSoldeAMO?.statut_client === 'regle' && suiviSoldeAMO.date_paiement) || null}
                          onSetPaid={d => majSuiviChantier('solde_amo', honorairesAMOPrev - honorairesCourtagePrev, 'regle', d)}
                          onUnsetPaid={() => majSuiviChantier('solde_amo', honorairesAMOPrev - honorairesCourtagePrev, 'en_attente')}
                          fmtDateFn={fmtD}
                        />
                        <button type="button" className="suivi-amo-add-link" onClick={() => setSoldeAmoDeplie(v => !v)}>
                          + paiement échelonné
                        </button>
                      </>
                    )}

                    {soldeAmoDeplie && (
                      <div className="suivi-amo-panel">
                        {tranchesAmo.map(t => (
                          <div key={t.id} className="suivi-amo-tranche">
                            <span className="tnum" style={{fontWeight:600}}>{fmt(Number(t.montant_ttc || 0))} TTC</span>
                            <span style={{fontSize:12, color:'var(--ink-500)'}}>{t.date_paiement ? fmtD(t.date_paiement) : '—'}</span>
                            <button type="button" className="suivi-amo-del" title="Supprimer cette tranche"
                              onClick={() => deleteSoldeAmoPaiement(t.id)}>✕</button>
                          </div>
                        ))}
                        {!hasTranches && (
                          <div style={{fontSize:12, color:'var(--ink-400)'}}>Aucun paiement enregistré pour l’instant.</div>
                        )}
                        <div className="suivi-amo-form">
                          <input className="input" type="number" step="0.01" min="0" inputMode="decimal"
                            placeholder="Montant TTC"
                            value={soldeAmoForm.montant}
                            onChange={e => setSoldeAmoForm(f => ({ ...f, montant: e.target.value }))} />
                          <input className="input" type="date"
                            value={soldeAmoForm.date || today}
                            onChange={e => setSoldeAmoForm(f => ({ ...f, date: e.target.value }))} />
                          <button type="button" className="btn btn-primary"
                            onClick={() => addSoldeAmoPaiement(soldeAmoForm.montant, soldeAmoForm.date || today)}>
                            Ajouter
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* ── Apporteur d'affaires — règlements dus ── */}
              {fin.apporteur?.enabled && fin.apporteur.totalHT > 0 && (() => {
                const nomApp = dossier?.client?.apporteur_nom || 'Apporteur'
                const pctApp = parseFloat((fin.apporteur.tauxApporteur * 100).toFixed(2))
                const totalDu = fin.apporteur.totalHT
                const lignes = fin.apporteur.lines || []
                const totalPaye = lignes.reduce((s, l) => {
                  if (fin.apporteur.mode === 'total_chantier_ht') {
                    const sf = suiviFinancier.find(x => x.type_echeance === 'apporteur_agente' && x.artisan_id === null)
                    return sf?.statut_ctp === 'rembourse' ? s + l.totalHT : s
                  }
                  const dv = devis.find(x => x.id === l.devisId)
                  const artId = dv?.artisan_id || dv?.artisan?.id
                  const sf = suiviFinancier.find(x => x.type_echeance === 'apporteur_agente' && x.artisan_id === artId)
                  return sf?.statut_ctp === 'rembourse' ? s + l.totalHT : s
                }, 0)
                const reste = Math.max(0, totalDu - totalPaye)

                return (
                  <div style={{marginTop:6, paddingTop:14, borderTop:'1px dashed var(--ink-200)', display:'flex', flexDirection:'column', gap:10}}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-end', gap:10, flexWrap:'wrap'}}>
                      <div>
                        <div style={{fontSize:13, fontWeight:700, color:'#c2410c'}}>★ Apporteur d&apos;affaires — {nomApp}</div>
                        <div style={{fontSize:11.5, color:'var(--ink-500)', marginTop:2}}>
                          {pctApp}% · {fin.apporteur.mode === 'total_chantier_ht' ? 'sur total chantier HT' : 'par devis signé'}
                        </div>
                      </div>
                      <div style={{textAlign:'right'}}>
                        <div style={{fontSize:11, color:'var(--ink-400)'}}>
                          Total dû <span className="tnum" style={{color:'var(--ink-700)', fontWeight:600}}>{fmt(totalDu)}</span>
                        </div>
                        <div style={{fontSize:11, color: reste > 0 ? '#c2410c' : '#15803d', marginTop:2, fontWeight:600}}>
                          {reste > 0 ? `Reste à régler : ${fmt(reste)}` : '✓ Soldé'}
                        </div>
                      </div>
                    </div>

                    {lignes.map((l, idx) => {
                      const dv = l.devisId ? devis.find(x => x.id === l.devisId) : null
                      const artId = dv?.artisan_id || dv?.artisan?.id || null
                      const sf = suiviFinancier.find(x =>
                        x.type_echeance === 'apporteur_agente' &&
                        (artId === null ? x.artisan_id === null : x.artisan_id === artId)
                      )
                      const paye = sf?.statut_ctp === 'rembourse'
                      const labelLigne = fin.apporteur.mode === 'total_chantier_ht'
                        ? 'Règlement apporteur (total)'
                        : `Devis ${l.label || dv?.artisan?.entreprise || ''}`
                      return (
                        <EcheanceRow
                          key={l.devisId || idx}
                          label={labelLigne}
                          sub={`${pctApp}% × ${fmt(l.baseHT)} HT · ${fmt(l.totalHT)}`}
                          statut={paye ? 'regle' : 'en_attente'}
                          date={sf?.date_paiement || null}
                          onSetPaid={d => setApporteurPaye(artId, true, d)}
                          onUnsetPaid={() => setApporteurPaye(artId, false)}
                          fmtDateFn={fmtD}
                        />
                      )
                    })}
                  </div>
                )
              })()}

                </div>
              </div>

            </div>

            {devisSignes.length === 0 && (dossier.frais_consultation || 0) === 0 && (
              <div style={{padding:'24px 0', textAlign:'center', color:'var(--ink-400)', fontSize:13}}>
                Aucune échéance pour le moment
              </div>
            )}
          </div>

        </div>
        )
      })()}

      {/* ── PHOTOS ── */}
      {onglet === 'photos' && (() => {
        const CATS = [
          { k: 'all',      l: 'Toutes' },
          { k: 'avant',    l: 'Avant' },
          { k: 'pendant',  l: 'Pendant' },
          { k: 'apres',    l: 'Après' },
          { k: 'maquette', l: 'Maquette' },
        ]
        const filtered = categorie === 'all' ? photos : photos.filter(p => p.categorie === categorie)
        const filteredVisible = filtered.slice(0, photosAffichees)
        return (
        <div style={{display:'flex', flexDirection:'column', gap:14}}>

          {/* Header : pills filtres + bouton upload */}
          <div className="card" style={{padding:'14px 18px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap'}}>
            <div style={{display:'flex', gap:6, alignItems:'center', flexWrap:'wrap'}}>
              {CATS.map(c => {
                const n = c.k === 'all' ? photos.length : photos.filter(p => p.categorie === c.k).length
                const active = categorie === c.k
                return (
                  <button key={c.k} onClick={() => { setCategorie(c.k); setPhotosAffichees(9); setPhotoOuverte(null) }}
                    style={{
                      padding:'6px 12px', borderRadius:99, fontSize:12, fontWeight:600,
                      border:'1px solid', borderColor: active ? 'var(--brand-500)' : 'var(--ink-200)',
                      background: active ? 'var(--brand-50)' : '#fff',
                      color: active ? 'var(--brand-800)' : 'var(--ink-700)',
                      cursor:'pointer', transition:'all 150ms',
                    }}>
                    {c.l} <span style={{opacity:0.6}}>· {n}</span>
                  </button>
                )
              })}
            </div>
            <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
              {photos.some(p => p.type_media !== 'video') && (
                <button onClick={telechargerZipPhotos} disabled={zippingPhotos}
                  className="btn btn-ghost" style={{fontSize:12.5}}>
                  <DlIcon /> {zippingPhotos ? 'Préparation…' : 'Télécharger les photos'}
                </button>
              )}
              {/* Upload uniquement dans une catégorie précise (Avant/Pendant/Après/Maquette)
                  → tout média est catégorisé, donc triable. Pas d'ajout depuis « Toutes ». */}
              {categorie !== 'all' && (
                <label className="btn btn-primary" style={{fontSize:12.5, cursor: uploadingPhoto ? 'wait' : 'pointer', opacity: uploadingPhoto ? 0.6 : 1}}>
                  <CamIcon /> {uploadingPhoto
                    ? 'Upload en cours…'
                    : `Ajouter photos / vidéos (${CATS.find(c => c.k === categorie)?.l})`}
                  <input type="file" accept="image/*,video/*" multiple style={{display:'none'}}
                    disabled={uploadingPhoto}
                    onChange={e => uploadPhotos(Array.from(e.target.files))} />
                </label>
              )}
            </div>
          </div>

          {categorie === 'all' ? (
            <div style={{fontSize:11.5, color:'var(--ink-500)', padding:'0 4px'}}>
              Choisis une catégorie (Avant, Pendant, Après, Maquette) pour uploader.
            </div>
          ) : (
            <div style={{fontSize:11.5, color:'var(--ink-400)', padding:'0 4px'}}>
              Photos et vidéos acceptées · vidéo max {MAX_VIDEO_MO} Mo. Les vidéos iPhone .mov peuvent ne pas se lire sur Chrome/Android.
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="card" style={{padding:60, textAlign:'center', color:'var(--ink-400)'}}>
              <div style={{display:'grid', placeItems:'center', marginBottom:10}}><CamIcon /></div>
              <div style={{fontSize:13}}>Aucune photo dans cette catégorie</div>
            </div>
          ) : (
            <>
              <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))', gap:14}}>
                {filteredVisible.map((photo, index) => (
                  <div key={photo.id} style={{
                    aspectRatio:'4/3', borderRadius:10, overflow:'hidden',
                    background:'var(--ink-100)', position:'relative', cursor:'pointer',
                    border:'1px solid var(--ink-200)',
                  }}
                    onClick={() => setPhotoOuverte(index)}
                    onMouseEnter={e => { const b = e.currentTarget.querySelector('[data-actions]'); if (b) b.style.opacity = '1' }}
                    onMouseLeave={e => { const b = e.currentTarget.querySelector('[data-actions]'); if (b) b.style.opacity = '0' }}>
                    {photo.type_media === 'video' ? (
                      <div style={{width:'100%', height:'100%', display:'grid', placeItems:'center', background:'#0f2744'}}>
                        <span style={{fontSize:34, color:'rgba(255,255,255,0.9)'}}>▶</span>
                      </div>
                    ) : (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={photo.url_signee} alt="" style={{width:'100%', height:'100%', objectFit:'cover', display:'block'}} />
                    )}
                    <span style={{
                      position:'absolute', top:8, right:8,
                      background:'rgba(0,0,0,0.55)', color:'#fff', fontSize:9.5, padding:'3px 8px',
                      borderRadius:99, fontWeight:700, textTransform:'uppercase', letterSpacing:0.05,
                      backdropFilter:'blur(4px)',
                    }}>{photo.categorie}</span>
                    <div data-actions style={{
                      position:'absolute', bottom:8, right:8, opacity:0, transition:'opacity 150ms',
                    }}>
                      <button onClick={e => { e.stopPropagation(); supprimerPhoto(photo.id, photo.url) }}
                        style={{
                          background:'rgba(220,38,38,0.95)', color:'#fff', border:'none', borderRadius:6,
                          padding:'4px 10px', fontSize:11, fontWeight:700, cursor:'pointer',
                        }}>
                        Supprimer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {filtered.length > photosAffichees && (
                <button onClick={() => setPhotosAffichees(n => n + 9)}
                  className="btn btn-ghost" style={{alignSelf:'center', fontSize:12.5}}>
                  Voir plus ({filtered.length - photosAffichees} restantes)
                </button>
              )}
            </>
          )}

          {/* Lightbox */}
          {photoOuverte !== null && (
            <div style={{
              position:'fixed', inset:0, background:'rgba(0,0,0,0.92)', zIndex:300,
              display:'flex', alignItems:'center', justifyContent:'center',
            }} onClick={() => setPhotoOuverte(null)}>
              <button onClick={e => { e.stopPropagation(); setPhotoOuverte(i => i > 0 ? i - 1 : filtered.length - 1) }}
                style={{
                  position:'absolute', left:16, top:'50%', transform:'translateY(-50%)',
                  width:48, height:48, borderRadius:'50%', border:'none',
                  background:'rgba(255,255,255,0.10)', color:'#fff', cursor:'pointer',
                  fontSize:24, fontWeight:300,
                }}>‹</button>
              <div onClick={e => e.stopPropagation()} style={{maxWidth:'90vw', maxHeight:'90vh', padding:20}}>
                {filtered[photoOuverte]?.type_media === 'video' ? (
                  <video src={filtered[photoOuverte]?.url_signee} controls autoPlay playsInline
                    style={{maxHeight:'80vh', maxWidth:'90vw', borderRadius:10, display:'block'}} />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={filtered[photoOuverte]?.url_signee} alt=""
                    style={{maxHeight:'80vh', maxWidth:'100%', objectFit:'contain', borderRadius:10, display:'block'}} />
                )}
                <div style={{color:'rgba(255,255,255,0.7)', fontSize:12, textAlign:'center', marginTop:10}}>
                  {photoOuverte + 1} / {filtered.length} · {filtered[photoOuverte]?.categorie} · clic en dehors pour fermer
                </div>
              </div>
              <button onClick={e => { e.stopPropagation(); setPhotoOuverte(i => i < filtered.length - 1 ? i + 1 : 0) }}
                style={{
                  position:'absolute', right:16, top:'50%', transform:'translateY(-50%)',
                  width:48, height:48, borderRadius:'50%', border:'none',
                  background:'rgba(255,255,255,0.10)', color:'#fff', cursor:'pointer',
                  fontSize:24, fontWeight:300,
                }}>›</button>
              <button onClick={e => { e.stopPropagation(); setPhotoOuverte(null) }}
                style={{
                  position:'absolute', top:16, right:16,
                  width:40, height:40, borderRadius:'50%', border:'none',
                  background:'rgba(255,255,255,0.10)', color:'#fff', cursor:'pointer',
                  fontSize:18,
                }}>×</button>
            </div>
          )}

        </div>
        )
      })()}

      {/* ── DOCUMENTS (maquette) ── */}
      {onglet === 'documents' && (() => {
        const totalKo = documents.reduce((s, d) => s + (d.taille || 0) / 1024, 0)
        const fmtSize = (ko) => ko < 1024 ? `${Math.round(ko)} Ko` : `${(ko/1024).toFixed(1)} Mo`
        const typeOf = (doc) => {
          const m = (doc.type_mime || '').toLowerCase()
          const n = (doc.nom || '').toLowerCase()
          if (m.startsWith('image') || /\.(jpg|jpeg|png|gif|webp|heic|heif)$/i.test(n)) return 'image'
          if (m.includes('pdf') || n.endsWith('.pdf')) return 'pdf'
          if (m.includes('word') || /\.(doc|docx)$/i.test(n)) return 'word'
          if (m.includes('excel') || /\.(xls|xlsx)$/i.test(n)) return 'sheet'
          return 'autre'
        }
        const typeMeta = {
          image: { color: '#7c3aed', label: 'image' },
          pdf:   { color: '#dc2626', label: 'pdf' },
          word:  { color: '#0094d4', label: 'word' },
          sheet: { color: '#16a34a', label: 'tableur' },
          autre: { color: '#94a3b8', label: 'fichier' },
        }
        return (
        <div style={{display:'flex', flexDirection:'column', gap:14}}>
          <div className="card" style={{padding:0, overflow:'hidden'}}>
            <div style={{padding:'14px 22px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, borderBottom:'1px solid var(--ink-200)', flexWrap:'wrap'}}>
              <div>
                <h2 className="page" style={{fontSize:15}}>Documents du chantier</h2>
                <div className="eyebrow" style={{marginTop:4}}>
                  {documents.length} fichier{documents.length > 1 ? 's' : ''}{documents.length > 0 && ` · ${fmtSize(totalKo)}`}
                </div>
              </div>
              <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
                <label className="btn btn-primary" style={{fontSize:12.5, cursor: uploadingDocChantier ? 'wait' : 'pointer', opacity: uploadingDocChantier ? 0.6 : 1}}>
                  <DlIcon /> {uploadingDocChantier ? 'Upload…' : 'Ajouter un document'}
                  <input type="file" style={{display:'none'}} multiple disabled={uploadingDocChantier}
                    onChange={e => e.target.files.length && uploadDocumentChantier(Array.from(e.target.files))} />
                </label>
                <label className="btn btn-ghost" style={{fontSize:12.5, cursor: uploadingDocChantier ? 'wait' : 'pointer', opacity: uploadingDocChantier ? 0.6 : 1}}>
                  <DlIcon /> {uploadingDocChantier ? 'Upload…' : 'Ajouter une facture honoraires'}
                  <input type="file" style={{display:'none'}} accept="application/pdf" disabled={uploadingDocChantier}
                    onChange={e => e.target.files.length && uploadDocumentChantier(
                      Array.from(e.target.files),
                      { categorie: 'facture_honoraire', dans_restitution: true }
                    )} />
                </label>
              </div>
            </div>
            {documents.length === 0 ? (
              <div style={{padding:40, textAlign:'center', color:'var(--ink-400)', fontSize:13}}>
                Aucun document — plans, courriers, notes…
              </div>
            ) : (
              <div style={{padding:'6px 16px'}}>
                {documents.map(doc => {
                  const t = typeOf(doc)
                  const meta = typeMeta[t]
                  return (
                    <div key={doc.id} className="row-hover" style={{
                      display:'grid', gridTemplateColumns:'auto 1fr auto auto auto', gap:14, alignItems:'center',
                      padding:'12px 8px', borderBottom:'1px solid var(--ink-100)',
                    }}>
                      <div style={{
                        width:36, height:36, borderRadius:8,
                        background:`${meta.color}1a`, color:meta.color,
                        display:'grid', placeItems:'center', flex:'0 0 36px',
                      }}>
                        <DocIcon />
                      </div>
                      <div style={{minWidth:0}}>
                        <button onClick={() => ouvrirDocument(doc.path, doc.nom)}
                          className="clip-1" style={{
                            fontSize:13, fontWeight:600, color:'var(--ink-900)', background:'none', border:'none',
                            cursor:'pointer', padding:0, textAlign:'left', display:'block', width:'100%',
                          }}>
                          {doc.nom}
                        </button>
                        <div style={{display:'flex', alignItems:'center', gap:6, marginTop:2}}>
                          <span style={{fontSize:11, color:'var(--ink-500)', textTransform:'uppercase', letterSpacing:0.04}}>{meta.label}</span>
                          {doc.categorie === 'compte_rendu' && (
                            <span style={{fontSize:10, fontWeight:800, letterSpacing:0.04, padding:'1px 6px', borderRadius:5, background:'rgba(0,148,212,0.12)', color:'#0094d4'}}>Compte-rendu</span>
                          )}
                          {doc.categorie === 'facture_honoraire' && (
                            <span style={{fontSize:10, fontWeight:800, background:'rgba(234,88,12,0.12)', color:'#ea580c', borderRadius:4, padding:'1px 5px'}}>FACT</span>
                          )}
                        </div>
                      </div>
                      {doc.categorie !== 'facture_honoraire' ? (
                        <label style={{display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontSize:11, color:'var(--ink-500)'}}>
                          <input type="checkbox" checked={doc.dans_restitution || false}
                            onChange={e => toggleDansRestitution(doc.id, e.target.checked)}
                            style={{accentColor:'var(--brand-500)'}} />
                          Restitution
                        </label>
                      ) : (
                        <span style={{color:'#16a34a', fontSize:13}} title="Inclus dans la restitution">✓</span>
                      )}
                      <div className="tnum" style={{fontSize:11.5, color:'var(--ink-500)', whiteSpace:'nowrap'}}>
                        {doc.taille ? fmtSize(doc.taille / 1024) : '—'}
                      </div>
                      <div style={{display:'flex', gap:4}}>
                        {doc.categorie !== 'facture_honoraire' && (
                          <button onClick={() => toggleCategorieCR(doc.id, doc.categorie !== 'compte_rendu')}
                            className="btn btn-ghost"
                            style={{padding:'4px 8px', fontSize:11, fontWeight:700, color: doc.categorie === 'compte_rendu' ? '#0094d4' : 'var(--ink-400)'}}
                            title={doc.categorie === 'compte_rendu' ? 'Retirer de la catégorie Compte-rendu' : 'Marquer comme compte-rendu'}>
                            {doc.categorie === 'compte_rendu' ? '✓ CR' : 'CR'}
                          </button>
                        )}
                        <button onClick={() => ouvrirDocument(doc.path, doc.nom)}
                          className="btn btn-ghost" style={{padding:'4px 8px'}} title="Voir">
                          <EyeIcon />
                        </button>
                        <button onClick={() => supprimerDocumentChantier(doc.id, doc.path)}
                          className="btn btn-ghost" style={{padding:'4px 8px', color:'#b91c1c'}} title="Supprimer">
                          <span style={{fontSize:14, lineHeight:1}}>×</span>
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
        )
      })()}

      {/* ── COMPARATEUR DE DEVIS ── */}
      {onglet === 'comparateur' && (() => {
        const thStyle = { padding:'10px 12px', textAlign:'center', fontSize:11, color:'var(--ink-500)', fontWeight:600, borderBottom:'1px solid var(--ink-200)', whiteSpace:'nowrap' }
        const tdStyle = { padding:'8px 12px', textAlign:'center', color:'var(--ink-700)', whiteSpace:'nowrap' }
        const linkBtn = { border:'none', background:'none', cursor:'pointer', fontSize:11, color:'var(--brand-700)', textDecoration:'underline' }

        const devisById   = Object.fromEntries(devis.map(d => [d.id, d]))
        const versionById = Object.fromEntries(Object.values(versionsDevis).flat().map(v => [v.id, v]))
        const montantLigne = (l) => {
          if (l.montant_ttc_override != null) return Number(l.montant_ttc_override) || 0
          // Ligne épinglée sur une version → montant de CETTE version (base figée).
          if (l.devis_version_id) return Number(versionById[l.devis_version_id]?.montant_ttc) || 0
          return Number(devisById[l.devis_artisan_id]?.montant_ttc) || 0   // sinon montant courant (live)
        }
        const ligneFor = (sim, devisId) => (sim.lignes || []).find(l => l.devis_artisan_id === devisId)
        const totauxSim = (sim) => {
          const totalTTC = (sim.lignes || []).filter(l => l.inclus).reduce((s, l) => s + montantLigne(l), 0)
          const honCourtage = totalTTC * (Number(sim.taux_courtage) || 0) / 100
          const honAMO      = totalTTC * (Number(sim.taux_amo) || 0) / 100
          return { totalTTC, honCourtage, honAMO, totalCourtage: totalTTC + honCourtage, totalAMO: totalTTC + honAMO }
        }
        const totalBaseTTC = devis.reduce((s, d) => s + (Number(d.montant_ttc) || 0), 0)

        // Frise : bases figées (chronologiques) + simulations manuelles. La dernière
        // base = base courante (mise en avant) ; les précédentes = historique repliable.
        const basesTri = simulations.filter(s => s.type === 'base').sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
        const baseCourante = basesTri.find(b => b.est_base_courante) || basesTri[basesTri.length - 1] || null
        const basesHistorique = basesTri.filter(b => b.id !== baseCourante?.id)
        const manuelles = simulations.filter(s => s.type !== 'base')
        const colonnes = [
          ...(historiqueBasesOuvert ? basesHistorique : []),
          ...(baseCourante ? [baseCourante] : []),
          ...manuelles,
        ]
        const estBaseHisto = (sim) => sim.type === 'base' && sim.id !== baseCourante?.id
        const estBaseCourante = (sim) => sim.type === 'base' && sim.id === baseCourante?.id

        return (
        <div style={{display:'flex', flexDirection:'column', gap:14}}>
          <div className="card" style={{padding:'14px 22px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap'}}>
            <div>
              <h2 className="page" style={{fontSize:15}}>Comparateur de devis</h2>
              <div className="eyebrow" style={{marginTop:4}}>Simule des scénarios : inclusion des devis, montants ajustés, taux d&apos;honoraires.</div>
            </div>
            <div style={{display:'flex', gap:10, alignItems:'center', flexWrap:'wrap'}}>
              {basesHistorique.length > 0 && (
                <button onClick={() => setHistoriqueBasesOuvert(o => !o)} className="btn btn-ghost" style={{fontSize:12}}>
                  {historiqueBasesOuvert ? '▾' : '▸'} Historique bases ({basesHistorique.length})
                </button>
              )}
              <button onClick={ajouterSimulation} className="btn btn-primary" style={{fontSize:12.5}}>
                <PlusIcon /> Nouvelle simulation
              </button>
            </div>
          </div>

          {loadingComparateur ? (
            <div className="card" style={{padding:40, textAlign:'center', color:'var(--ink-400)', fontSize:13}}>Chargement…</div>
          ) : devis.length === 0 ? (
            <div className="card" style={{padding:40, textAlign:'center', color:'var(--ink-400)', fontSize:13}}>Aucun devis à comparer — ajoute des devis dans l&apos;onglet « Devis & artisans ».</div>
          ) : simulations.length === 0 ? (
            <div className="card" style={{padding:40, textAlign:'center', color:'var(--ink-400)', fontSize:13}}>Aucune simulation — clique « Nouvelle simulation ».</div>
          ) : (
            <div className="card" style={{padding:0, overflowX:'auto'}}>
              <table style={{width:'100%', borderCollapse:'collapse', fontSize:12.5, minWidth: 320 + colonnes.length * 180}}>
                <thead>
                  <tr>
                    <th style={{...thStyle, textAlign:'left', minWidth:190}}>Devis / artisan</th>
                    <th style={{...thStyle, minWidth:110}}>Actuel</th>
                    {colonnes.map(sim => {
                      const histo = estBaseHisto(sim), courante = estBaseCourante(sim)
                      return (
                      <th key={sim.id} style={{...thStyle, minWidth:170, background: courante ? 'rgba(0,148,212,0.06)' : histo ? 'var(--surface-2)' : undefined}}>
                        <div style={{display:'flex', flexDirection:'column', gap:4, alignItems:'center'}}>
                          <span style={{fontWeight: histo ? 500 : 700, color: histo ? 'var(--ink-500)' : 'var(--ink-900)', fontSize: histo ? 11.5 : 12.5}}>{sim.nom}</span>
                          {(courante || histo) && (
                            <span style={{fontSize:9.5, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em', color: courante ? 'var(--brand-700)' : 'var(--ink-400)'}}>
                              {courante ? '● Base courante' : 'Base · historique'}
                            </span>
                          )}
                          {editingTaux === sim.id ? (
                            <TauxEditor sim={sim} onSave={saveTaux} onCancel={() => setEditingTaux(null)} />
                          ) : (
                            <button onClick={() => setEditingTaux(sim.id)} style={linkBtn}>
                              Courtage&nbsp;{sim.taux_courtage}% · AMO&nbsp;{sim.taux_amo}%
                            </button>
                          )}
                        </div>
                      </th>
                    )})}
                  </tr>
                </thead>
                <tbody>
                  {devis.map(d => (
                    <tr key={d.id} style={{borderTop:'1px solid var(--ink-100)'}}>
                      <td style={{...tdStyle, textAlign:'left', whiteSpace:'normal'}}>
                        <div style={{fontWeight:600, color:'var(--ink-900)'}}>{d.artisan?.entreprise || '—'}</div>
                        {d.artisan?.metier && <div style={{fontSize:11, color:'var(--ink-500)'}}>{d.artisan.metier}</div>}
                      </td>
                      <td style={{...tdStyle, fontWeight:600}} className="tnum">{fmt(d.montant_ttc || 0)}</td>
                      {colonnes.map(sim => {
                        const l = ligneFor(sim, d.id)
                        if (!l) return <td key={sim.id} style={{...tdStyle, color:'var(--ink-400)'}}>—</td>
                        return (
                          <td key={sim.id} style={{...tdStyle, opacity: l.inclus ? 1 : 0.45}}>
                            <div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:6}}>
                              <button onClick={() => toggleInclus(sim.id, l.id, !l.inclus)}
                                title={l.inclus ? 'Exclure de la simulation' : 'Inclure dans la simulation'}
                                style={{border:'none', background:'none', cursor:'pointer', fontSize:13, fontWeight:700, color: l.inclus ? '#15803d' : '#b91c1c'}}>
                                {l.inclus ? '✓' : '✗'}
                              </button>
                              {editingMontant === l.id ? (
                                <input type="number" autoFocus defaultValue={l.montant_ttc_override ?? ''}
                                  placeholder={String(d.montant_ttc ?? '')}
                                  onBlur={e => saveMontant(sim.id, l.id, e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
                                  style={{width:90, fontSize:12, padding:'2px 4px', border:'1px solid var(--ink-200)', borderRadius:6, textAlign:'right'}} />
                              ) : (
                                <button onClick={() => setEditingMontant(l.id)} className="tnum"
                                  title="Modifier le montant pour cette simulation"
                                  style={{border:'none', background:'none', cursor:'pointer', color: l.montant_ttc_override != null ? '#0094d4' : 'var(--ink-700)', fontWeight: l.montant_ttc_override != null ? 700 : 400}}>
                                  {fmt(montantLigne(l))}
                                </button>
                              )}
                            </div>
                            {/* Sélecteur de version (4b) — si le devis a plusieurs versions. */}
                            {versionsDevis[d.id]?.length > 1 && (
                              sim.type === 'base' ? (
                                <div style={{fontSize:9.5, color:'var(--ink-400)', marginTop:3}}>
                                  {l.devis_version_id ? `v${versionById[l.devis_version_id]?.version_num ?? '?'}` : 'actuelle'}
                                </div>
                              ) : (
                                <select value={l.devis_version_id || ''}
                                  onChange={e => saveVersionLigne(sim.id, l.id, e.target.value)}
                                  title="Version du devis utilisée pour cette simulation"
                                  style={{marginTop:3, fontSize:10, padding:'1px 3px', border:'1px solid var(--ink-200)', borderRadius:4, color:'var(--ink-600)', maxWidth:130}}>
                                  <option value="">Actuelle</option>
                                  {versionsDevis[d.id].map(v => (
                                    <option key={v.id} value={v.id}>v{v.version_num} · {fmt(v.montant_ttc || 0)}</option>
                                  ))}
                                </select>
                              )
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}

                  <tr style={{borderTop:'2px solid var(--ink-300)', background:'var(--surface-2)'}}>
                    <td style={{...tdStyle, textAlign:'left', fontWeight:700}}>Total TTC</td>
                    <td style={{...tdStyle, fontWeight:700}} className="tnum">{fmt(totalBaseTTC)}</td>
                    {colonnes.map(sim => <td key={sim.id} style={{...tdStyle, fontWeight:700}} className="tnum">{fmt(totauxSim(sim).totalTTC)}</td>)}
                  </tr>
                  <tr style={{borderTop:'1px solid var(--ink-100)'}}>
                    <td style={{...tdStyle, textAlign:'left'}}>Honoraires courtage</td>
                    <td style={{...tdStyle, color:'var(--ink-400)'}}>—</td>
                    {colonnes.map(sim => <td key={sim.id} style={tdStyle} className="tnum">{fmt(totauxSim(sim).honCourtage)}</td>)}
                  </tr>
                  <tr>
                    <td style={{...tdStyle, textAlign:'left'}}>Honoraires AMO</td>
                    <td style={{...tdStyle, color:'var(--ink-400)'}}>—</td>
                    {colonnes.map(sim => <td key={sim.id} style={tdStyle} className="tnum">{fmt(totauxSim(sim).honAMO)}</td>)}
                  </tr>
                  <tr style={{borderTop:'1px solid var(--ink-200)'}}>
                    <td style={{...tdStyle, textAlign:'left', fontWeight:700, color:'var(--brand-800)'}}>Total chantier courtage</td>
                    <td style={{...tdStyle, color:'var(--ink-400)'}}>—</td>
                    {colonnes.map(sim => <td key={sim.id} style={{...tdStyle, fontWeight:700, color:'var(--brand-800)'}} className="tnum">{fmt(totauxSim(sim).totalCourtage)}</td>)}
                  </tr>
                  <tr>
                    <td style={{...tdStyle, textAlign:'left', fontWeight:700, color:'var(--brand-800)'}}>Total chantier AMO</td>
                    <td style={{...tdStyle, color:'var(--ink-400)'}}>—</td>
                    {colonnes.map(sim => <td key={sim.id} style={{...tdStyle, fontWeight:700, color:'var(--brand-800)'}} className="tnum">{fmt(totauxSim(sim).totalAMO)}</td>)}
                  </tr>
                  <tr style={{borderTop:'1px solid var(--ink-100)'}}>
                    <td style={tdStyle}></td>
                    <td style={tdStyle}></td>
                    {colonnes.map(sim => (
                      <td key={sim.id} style={tdStyle}>
                        {sim.type !== 'base' && (
                          <button onClick={() => supprimerSimulation(sim.id)} className="btn btn-ghost" style={{fontSize:11, color:'#b91c1c'}}>Supprimer</button>
                        )}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
        )
      })()}

      {/* ── PLANNING ── */}
      {onglet === 'planning' && (
      <div style={{display:'flex',flexDirection:'column',gap:16}}>

        {/* Planning : RDV + Interventions (maquette : 2 cards séparées) */}
        <div className="grid-2c" style={{gap:18}}>

          {/* Card RDV */}
          <div className="card" style={{padding:0, overflow:'hidden'}}>
            <div style={{padding:'14px 22px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid var(--ink-200)'}}>
              <div>
                <h2 className="page" style={{fontSize:15}}>Rendez-vous</h2>
                <div className="eyebrow" style={{marginTop:4}}>{rdvsDossier.length} RDV planifié{rdvsDossier.length > 1 ? 's' : ''}</div>
              </div>
              <button onClick={() => setModalRdvOuvert(true)} className="btn btn-primary" style={{fontSize:12.5}}>
                <PlusIcon /> Nouveau RDV
              </button>
            </div>
            <div style={{padding:'4px 16px'}}>
              {rdvsDossier.length === 0 ? (
                <div style={{padding:30, textAlign:'center', color:'var(--ink-400)', fontSize:13}}>Aucun rendez-vous</div>
              ) : rdvsDossier.map(r => {
                const dt = new Date(r.date_heure)
                const isPast = dt < new Date()
                const day = dt.toLocaleDateString('fr-FR', { day:'2-digit' })
                const month = dt.toLocaleDateString('fr-FR', { month:'short' }).replace('.','')
                const time = dt.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })
                const cfg = {
                  visite_technique_client:  { label:'R1 — Visite client',         color:'#0094d4' },
                  visite_technique_artisan: { label:'R2 — Visite artisan',        color:'#16a34a' },
                  presentation_devis:       { label:'R3 — Présentation devis',    color:'#f59e0b' },
                  suivi:                    { label:'Suivi de chantier',          color:'#7c3aed' },
                  reception:                { label:'Réception',                  color:'#10b981' },
                  etude:                    { label:'Étude/conception',           color:'#e05252' },
                  autres:                   { label: r.titre || 'Autre RDV',      color:'#94a3b8' },
                }[r.type_rdv] || { label:r.type_rdv, color:'#94a3b8' }
                return (
                  <div key={r.id} style={{
                    display:'grid', gridTemplateColumns:'56px 4px 1fr auto', gap:14,
                    padding:'12px 0', borderBottom:'1px solid var(--ink-100)', alignItems:'center',
                    opacity: isPast ? 0.55 : 1,
                  }}>
                    <div style={{textAlign:'center'}}>
                      <div className="tnum" style={{fontSize:18, fontWeight:800, color:'var(--ink-900)', lineHeight:1}}>{day}</div>
                      <div style={{fontSize:9.5, fontWeight:700, color:'var(--ink-500)', textTransform:'uppercase', marginTop:2, letterSpacing:0.04}}>{month}</div>
                    </div>
                    <div style={{width:4, alignSelf:'stretch', borderRadius:99, background: cfg.color}}/>
                    <div style={{minWidth:0}}>
                      <div className="clip-1" style={{fontSize:13, fontWeight:600, color:'var(--ink-900)'}}>{cfg.label}</div>
                      <div className="clip-1" style={{fontSize:11.5, color:'var(--ink-500)', marginTop:2}}>
                        {time} · {r.duree_minutes}min{r.artisan ? ` · ${r.artisan.entreprise}` : ''}
                        {r.notes && ` · ${r.notes}`}
                      </div>
                    </div>
                    <div style={{display:'flex', gap:4}}>
                      <button onClick={() => { setRdvEnEdition({ ...r, date_heure: instantToParisLocal(r.date_heure) }); setModalRdvOuvert(true) }}
                        className="btn btn-ghost" style={{padding:'4px 6px'}} title="Modifier">
                        <EditIcon />
                      </button>
                      <button onClick={() => supprimerRdvDossier(r.id)}
                        className="btn btn-ghost" style={{padding:'4px 6px', color:'#b91c1c'}} title="Supprimer">
                        <span style={{fontSize:14, lineHeight:1}}>×</span>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Card Interventions artisans */}
          <div className="card" style={{padding:0, overflow:'hidden'}}>
            <div style={{padding:'14px 22px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid var(--ink-200)'}}>
              <div>
                <h2 className="page" style={{fontSize:15}}>Interventions artisans</h2>
                <div className="eyebrow" style={{marginTop:4}}>{interventionsDossier.length} planifiée{interventionsDossier.length > 1 ? 's' : ''}</div>
              </div>
              <button onClick={() => { setNouvIntervArtisanId(null); setModalCreerIntervOuvert(true) }}
                className="btn btn-primary" style={{fontSize:12.5}}>
                <PlusIcon /> Planifier
              </button>
            </div>
            <div style={{padding:'4px 16px'}}>
              {interventionsDossier.length === 0 ? (
                <div style={{padding:30, textAlign:'center', color:'var(--ink-400)', fontSize:13}}>Aucune intervention planifiée</div>
              ) : interventionsDossier.map(i => {
                const fmtDate = (d) => new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'short' })
                const sub = i.type_intervention === 'periode'
                  ? (i.date_debut && i.date_fin ? `Du ${fmtDate(i.date_debut)} au ${fmtDate(i.date_fin)}` : 'Période')
                  : `${(i.jours_specifiques || []).length} jour(s) spécifique(s)`
                return (
                  <div key={i.id} style={{
                    display:'grid', gridTemplateColumns:'auto 1fr auto auto', gap:12,
                    padding:'12px 0', borderBottom:'1px solid var(--ink-100)', alignItems:'center',
                  }}>
                    <div style={{
                      width:36, height:36, borderRadius:8, background:'var(--brand-50)',
                      color:'var(--brand-800)', display:'grid', placeItems:'center',
                    }}>
                      <HammerIcon />
                    </div>
                    <div style={{minWidth:0}}>
                      <div className="clip-1" style={{fontSize:13, fontWeight:700, color:'var(--ink-900)'}}>{i.artisan?.entreprise || '—'}</div>
                      <div className="clip-1" style={{fontSize:11.5, color:'var(--ink-500)', marginTop:2}}>
                        {sub}{i.notes && ` · ${i.notes}`}
                      </div>
                    </div>
                    <Badge tone="info">Planifié</Badge>
                    <div style={{display:'flex', gap:4}}>
                      <button onClick={() => { setInterventionEnEdition(i); setModalInterventionOuvert(true) }}
                        className="btn btn-ghost" style={{padding:'4px 6px'}} title="Modifier">
                        <EditIcon />
                      </button>
                      <button onClick={() => supprimerInterventionDossier(i.id)}
                        className="btn btn-ghost" style={{padding:'4px 6px', color:'#b91c1c'}} title="Supprimer">
                        <span style={{fontSize:14, lineHeight:1}}>×</span>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

        </div>

        {/* Modal RDV (maquette) */}
        {modalRdvOuvert && (() => {
          const edit = !!rdvEnEdition
          const form = edit ? rdvEnEdition : nouveauRdvDossier
          const setForm = edit
            ? (patch) => setRdvEnEdition(r => ({ ...r, ...(typeof patch === 'function' ? patch(r) : patch) }))
            : (patch) => setNouveauRdvDossier(f => ({ ...f, ...(typeof patch === 'function' ? patch(f) : patch) }))
          // Réception : artisans ayant un DEVIS ACCEPTÉ sur ce chantier (devis est déjà
          // restreint au dossier courant → filtre sur statut seul). En édition, on conserve
          // l'artisan déjà choisi même sans devis accepté (donnée historique) pour ne pas le
          // faire disparaître du sélecteur.
          const artisansReceptionList = (() => {
            const m = new Map()
            devis.filter(d => d.statut === 'accepte' && d.artisan).forEach(d => m.set(d.artisan.id, d.artisan))
            if (form.artisan_id && form.artisan && !m.has(form.artisan_id)) m.set(form.artisan.id, form.artisan)
            return [...m.values()]
          })()
          const types = [
            { k: 'visite_technique_client',  l: 'R1',       sub: 'Visite client',        color: '#0094d4' },
            { k: 'visite_technique_artisan', l: 'R2',       sub: 'Visite artisan',       color: '#16a34a' },
            { k: 'presentation_devis',       l: 'R3',       sub: 'Présentation devis',   color: '#f59e0b' },
            { k: 'suivi',                    l: 'Suivi',    sub: 'Suivi de chantier',    color: '#7c3aed' },
            { k: 'reception',                l: 'Réception',sub: 'Réception',            color: '#10b981' },
            { k: 'etude',                    l: 'Étude',    sub: 'Étude/conception',     color: '#e05252' },
            { k: 'autres',                   l: 'Autre',    sub: 'RDV libre',            color: '#94a3b8' },
          ]
          const dateOnly = (form.date_heure || '').slice(0, 10)
          const timeOnly = (form.date_heure || '').slice(11, 16)
          const setDateHeure = (date, heure) => {
            const d = date || dateOnly
            const h = heure || timeOnly || '09:00'
            if (!d) return
            setForm({ date_heure: `${d}T${h}` })
          }
          const closeModal = () => { setModalRdvOuvert(false); setRdvEnEdition(null) }
          const valid = !!form.date_heure
          return (
            <ModalShell
              title={edit ? 'Modifier le rendez-vous' : 'Nouveau rendez-vous'}
              subtitle={`${dossier.reference} · ${nomComplet}`}
              onClose={closeModal}
              width={580}
              footer={(<>
                <button className="btn btn-ghost" onClick={closeModal}>Annuler</button>
                <button className="btn btn-primary" disabled={!valid}
                  onClick={edit ? modifierRdvDossier : sauvegarderRdvDossier}>
                  <CalIcon /> {edit ? 'Enregistrer' : 'Créer le RDV'}
                </button>
              </>)}
            >
              <div style={{padding:24, display:'flex', flexDirection:'column', gap:14}}>
                <ModalField label="Type de rendez-vous" required>
                  <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:6}}>
                    {types.map(t => {
                      const active = form.type_rdv === t.k
                      return (
                        <button key={t.k} type="button" onClick={() => setForm(f => ({ type_rdv: t.k, artisan_id: '' }))}
                          style={{
                            padding:'10px 6px', borderRadius:8, border:'1px solid',
                            borderColor: active ? t.color : 'var(--ink-200)',
                            background: active ? `${t.color}15` : '#fff',
                            color: active ? t.color : 'var(--ink-700)',
                            cursor:'pointer', fontWeight:700, fontSize:13,
                            display:'flex', flexDirection:'column', alignItems:'center', gap:2,
                            transition:'all 150ms',
                          }}>
                          <span>{t.l}</span>
                          <span style={{fontSize:10, fontWeight:600, opacity:0.85}}>{t.sub}</span>
                        </button>
                      )
                    })}
                  </div>
                </ModalField>

                {form.type_rdv === 'autres' && (
                  <ModalField label="Titre du rendez-vous" required>
                    <input className="input" type="text"
                      value={form.titre || ''}
                      onChange={e => setForm({ titre: e.target.value })}
                      placeholder="Ex : Réunion de chantier, Appel fournisseur…"
                      style={{height:38, padding:'0 12px', fontSize:13}} />
                  </ModalField>
                )}

                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
                  <ModalField label="Date" required>
                    <input className="input" type="date"
                      value={dateOnly}
                      onChange={e => setDateHeure(e.target.value, null)}
                      style={{height:38, padding:'0 12px', fontSize:13}} />
                  </ModalField>
                  <ModalField label="Heure">
                    <input className="input" type="time"
                      value={timeOnly}
                      onChange={e => setDateHeure(null, e.target.value)}
                      style={{height:38, padding:'0 12px', fontSize:13}} />
                  </ModalField>
                  <ModalField label="Durée">
                    <select className="input"
                      value={form.duree_minutes || 60}
                      onChange={e => setForm({ duree_minutes: e.target.value })}
                      style={{height:38, padding:'0 12px', fontSize:13}}>
                      <option value={30}>30 min</option>
                      <option value={60}>1h</option>
                      <option value={90}>1h30</option>
                      <option value={120}>2h</option>
                      <option value={180}>3h</option>
                    </select>
                  </ModalField>
                  <ModalField label="Lieu">
                    <LieuPicker value={form.lieu || 'client'} onChange={v => setForm({ lieu: v })} />
                  </ModalField>
                </div>

                {['visite_technique_artisan', 'reception'].includes(form.type_rdv) && (
                  <ModalField label="Artisan présent">
                    <select className="input"
                      value={form.artisan_id || ''}
                      onChange={e => setForm({ artisan_id: e.target.value })}
                      style={{height:38, padding:'0 12px', fontSize:13}}>
                      <option value="">— Choisir —</option>
                      {(form.type_rdv === 'reception' ? artisansReceptionList : artisans).map(a => <option key={a.id} value={a.id}>{a.entreprise}</option>)}
                    </select>
                    {form.type_rdv === 'reception' && artisansReceptionList.length === 0 && (
                      <div style={{fontSize:11.5, color:'var(--ink-500)', marginTop:4}}>Aucun artisan avec devis signé sur ce chantier</div>
                    )}
                  </ModalField>
                )}

                <ModalField label="Notes">
                  <textarea className="input"
                    value={form.notes || ''}
                    onChange={e => setForm({ notes: e.target.value })}
                    rows={3} placeholder="Points à aborder, préparation…"
                    style={{minHeight:80, padding:12, fontSize:13, lineHeight:1.5, resize:'vertical'}} />
                </ModalField>

                {/* Cible calendrier (lot 3b) — INERTE : le push lit encore GOOGLE_CALENDAR_ID (lot 4). */}
                {cibles.length > 0 && (
                  <ModalField label="Calendrier">
                    <select className="input"
                      value={form.cible_id || ''}
                      onChange={e => setForm({ cible_id: e.target.value })}
                      style={{height:38, padding:'0 12px', fontSize:13}}>
                      <option value="">— Choisir un calendrier —</option>
                      {cibles.map(c => <option key={c.id} value={c.id}>{libelleCible(c)}</option>)}
                    </select>
                  </ModalField>
                )}
              </div>
            </ModalShell>
          )
        })()}

      </div>
      )}

      {/* Modal Intervention edit — global (fixed overlay) */}
      {modalInterventionOuvert && interventionEnEdition && (() => {
        const i = interventionEnEdition
        const setI = (patch) => setInterventionEnEdition(prev => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }))
        const closeModal = () => { setModalInterventionOuvert(false); setInterventionEnEdition(null) }
        const valid = i.type_intervention === 'periode'
          ? (!!i.date_debut && !!i.date_fin)
          : (i.jours_specifiques || []).length > 0
        return (
          <ModalShell
            title="Modifier l'intervention"
            subtitle={i.artisan?.entreprise || ''}
            onClose={closeModal}
            width={580}
            footer={(<>
              <button className="btn btn-ghost" onClick={closeModal}>Annuler</button>
              <button className="btn btn-primary" disabled={!valid} onClick={modifierInterventionDossier}>
                <CalIcon /> Enregistrer
              </button>
            </>)}
          >
            <div style={{padding:24, display:'flex', flexDirection:'column', gap:14}}>

              {/* Artisan (affichage) */}
              <div style={{
                display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
                border:'1px solid var(--brand-200)', borderRadius:10, background:'var(--brand-50)',
              }}>
                <div style={{
                  width:32, height:32, borderRadius:8, background:'var(--brand-100)',
                  color:'var(--brand-800)', display:'grid', placeItems:'center',
                }}><HammerIcon /></div>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontSize:13, fontWeight:700, color:'var(--brand-900)'}}>{i.artisan?.entreprise || '—'}</div>
                </div>
              </div>

              <ModalField label="Type d'intervention">
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:6}}>
                  {[
                    { v: 'periode',           l: 'Période continue', sub: 'du X au Y' },
                    { v: 'jours_specifiques', l: 'Jours spécifiques', sub: 'liste de dates' },
                  ].map(o => {
                    const active = i.type_intervention === o.v
                    return (
                      <button key={o.v} type="button" onClick={() => setI({ type_intervention: o.v, jours_specifiques: [] })}
                        style={{
                          padding:'10px 12px', borderRadius:8, border:'1px solid',
                          borderColor: active ? 'var(--brand-500)' : 'var(--ink-200)',
                          background: active ? 'var(--brand-50)' : '#fff',
                          color: active ? 'var(--brand-800)' : 'var(--ink-700)',
                          cursor:'pointer', fontWeight:700, fontSize:13,
                          display:'flex', flexDirection:'column', gap:2, alignItems:'flex-start',
                        }}>
                        <span>{o.l}</span>
                        <span style={{fontSize:10.5, fontWeight:500, opacity:0.8}}>{o.sub}</span>
                      </button>
                    )
                  })}
                </div>
              </ModalField>

              {i.type_intervention === 'periode' && (
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
                  <ModalField label="Date de début" required>
                    <input className="input" type="date" value={i.date_debut || ''}
                      onChange={e => setI({ date_debut: e.target.value })}
                      style={{height:38, padding:'0 12px', fontSize:13}} />
                  </ModalField>
                  <ModalField label="Date de fin" required>
                    <input className="input" type="date" value={i.date_fin || ''}
                      onChange={e => setI({ date_fin: e.target.value })}
                      style={{height:38, padding:'0 12px', fontSize:13}} />
                  </ModalField>
                </div>
              )}

              {i.type_intervention === 'jours_specifiques' && (
                <ModalField label="Ajouter des jours">
                  <input className="input" type="date"
                    onChange={e => {
                      const date = e.target.value
                      if (!date) return
                      setI(prev => ({
                        ...prev,
                        jours_specifiques: (prev.jours_specifiques || []).includes(date)
                          ? (prev.jours_specifiques || []).filter(j => j !== date)
                          : [...(prev.jours_specifiques || []), date].sort(),
                      }))
                      e.target.value = ''
                    }}
                    style={{height:38, padding:'0 12px', fontSize:13}} />
                  {(i.jours_specifiques || []).length > 0 && (
                    <div style={{display:'flex', flexWrap:'wrap', gap:6, marginTop:8}}>
                      {(i.jours_specifiques || []).map(j => (
                        <span key={j} style={{
                          display:'inline-flex', alignItems:'center', gap:4,
                          fontSize:11.5, fontWeight:600, background:'var(--brand-50)', color:'var(--brand-800)',
                          padding:'4px 10px', borderRadius:99, border:'1px solid var(--brand-200)',
                        }}>
                          {new Date(j).toLocaleDateString('fr-FR')}
                          <button onClick={() => setI(p => ({ ...p, jours_specifiques: p.jours_specifiques.filter(d => d !== j) }))}
                            style={{border:'none', background:'transparent', color:'var(--brand-700)', cursor:'pointer', fontSize:14, lineHeight:1, padding:0, marginLeft:2}}>×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </ModalField>
              )}

              <ModalField label="Lieu">
                <LieuPicker value={i.lieu || 'client'} onChange={v => setI({ lieu: v })} />
              </ModalField>

              <ModalField label="Horaire">
                <label style={{
                  display:'flex', alignItems:'center', gap:8, padding:'8px 12px',
                  border:'1px solid var(--ink-200)', borderRadius:8, cursor:'pointer', fontSize:13,
                }}>
                  <input type="checkbox" checked={!i.heure_debut}
                    onChange={e => setI({ heure_debut: e.target.checked ? '' : '08:00' })}
                    style={{accentColor:'var(--brand-500)'}} />
                  <span style={{color:'var(--ink-700)', fontWeight:500}}>Journée entière</span>
                </label>
                {i.heure_debut && (
                  <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:8}}>
                    <input className="input" type="time" value={i.heure_debut}
                      onChange={e => setI({ heure_debut: e.target.value })}
                      style={{height:38, padding:'0 12px', fontSize:13}} />
                    <select className="input" value={i.duree_minutes || 60}
                      onChange={e => setI({ duree_minutes: Number(e.target.value) })}
                      style={{height:38, padding:'0 12px', fontSize:13}}>
                      {[30,60,90,120,180,240,300,360,480].map(m => (
                        <option key={m} value={m}>{m < 60 ? `${m} min` : `${m/60}h${m%60 ? m%60 : ''}`}</option>
                      ))}
                    </select>
                  </div>
                )}
              </ModalField>

              <ModalField label="Notes">
                <textarea className="input" value={i.notes || ''}
                  onChange={e => setI({ notes: e.target.value })}
                  rows={3} placeholder="Précisions, accès chantier, contact site…"
                  style={{minHeight:80, padding:12, fontSize:13, lineHeight:1.5, resize:'vertical'}} />
              </ModalField>

              {/* Cible calendrier (lot 3b) — INERTE : le push lit encore GOOGLE_CALENDAR_ID (lot 4). */}
              {cibles.length > 0 && (
                <ModalField label="Calendrier">
                  <select className="input"
                    value={i.cible_id || ''}
                    onChange={e => setI({ cible_id: e.target.value })}
                    style={{height:38, padding:'0 12px', fontSize:13}}>
                    <option value="">— Choisir un calendrier —</option>
                    {cibles.map(c => <option key={c.id} value={c.id}>{libelleCible(c)}</option>)}
                  </select>
                </ModalField>
              )}

            </div>
          </ModalShell>
        )
      })()}

      {/* ── COMPTES-RENDUS (maquette : 2 cols liste + sidebar IA) ── */}
      {onglet === 'cr' && (() => {
        const typeMeta = {
          r1:        { color: '#0094d4', label: 'R1', long: 'R1 — Visite technique' },
          r2:        { color: '#16a34a', label: 'R2', long: 'R2 — Visite artisans' },
          r3:        { color: '#f59e0b', label: 'R3', long: 'R3 — Présentation devis' },
          suivi:     { color: '#94a3b8', label: 'Suivi', long: 'Suivi de chantier' },
          reception: { color: '#16a34a', label: 'Récept.', long: 'Réception' },
        }
        return (
        <div className="cr-grid" style={{display:'grid', gridTemplateColumns:'1fr 320px', gap:18}}>

          {/* Liste CR */}
          <div className="card" style={{padding:0, overflow:'hidden'}}>
            <div style={{padding:'14px 22px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid var(--ink-200)', gap:8, flexWrap:'wrap'}}>
              <div>
                <h2 className="page" style={{fontSize:15}}>Comptes-rendus de visite</h2>
                <div className="eyebrow" style={{marginTop:4}}>
                  {comptesRendus.length} CR · les CR publiés sont visibles dans l&apos;espace client
                </div>
              </div>
              <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                <button onClick={() => { setCrEditId(null); setCrManuelForm({ type_visite: '', date_visite: '', contenu: '' }); setCrManuelModal(true) }} className="btn btn-ghost" style={{fontSize:12.5}}>
                  <PlusIcon /> CR manuel
                </button>
                <button onClick={() => { setCrModal(true); setCrEtape(1) }} className="btn btn-primary" style={{fontSize:12.5}}>
                  ✨ Générer avec l&apos;IA
                </button>
              </div>
            </div>

            <div style={{padding:'14px 22px', display:'flex', flexDirection:'column', gap:14}}>
              {comptesRendus.length === 0 && (
                <div style={{padding:30, textAlign:'center', color:'var(--ink-400)', fontSize:13}}>
                  Aucun compte-rendu pour le moment
                </div>
              )}
              {comptesRendus.map(cr => {
                const meta = typeMeta[cr.type_visite] || { color: '#94a3b8', label: cr.type_visite, long: cr.type_visite }
                const fmtD = cr.date_visite ? new Date(cr.date_visite).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' }) : null
                const apercu = stripMarkdown(cr.contenu_final)
                return (
                  <div key={cr.id} style={{
                    padding:16, border:'1px solid var(--ink-200)', borderRadius:12, background:'#fff', position:'relative',
                  }}>
                    <div style={{display:'flex', gap:10, alignItems:'center', marginBottom:10, flexWrap:'wrap'}}>
                      <span style={{
                        padding:'2px 8px', borderRadius:6, fontSize:11, fontWeight:800,
                        background: meta.color, color:'#fff', letterSpacing:0.04,
                      }}>{meta.label}</span>
                      <span style={{fontSize:13.5, fontWeight:700, color:'var(--ink-900)'}}>{meta.long}</span>
                      <div style={{flex:1}} />
                      <button onClick={() => toggleValide(cr.id, !cr.valide)}
                        style={{
                          padding:'3px 10px', borderRadius:99, fontSize:11, fontWeight:700,
                          border:'none', cursor:'pointer',
                          background: cr.valide ? 'rgba(22,163,74,0.12)' : 'rgba(148,163,184,0.18)',
                          color: cr.valide ? '#15803d' : 'var(--ink-600)',
                        }}>
                        {cr.valide ? '✓ Visible client' : 'Brouillon'}
                      </button>
                      {fmtD && (
                        <span className="tnum" style={{fontSize:11.5, color:'var(--ink-400)'}}>{fmtD}</span>
                      )}
                    </div>
                    {cr.contenu_final && (crOuvert === cr.id ? (
                      <div>
                        <MarkdownCR text={cr.contenu_final} variant="staff" />
                        <button onClick={() => setCrOuvert(null)} className="btn btn-ghost" style={{padding:'3px 10px', fontSize:11, marginTop:8}}>
                          ▲ Replier
                        </button>
                      </div>
                    ) : (
                      <p className="clip-2" onClick={() => setCrOuvert(cr.id)} title="Voir le CR complet"
                        style={{fontSize:13, color:'var(--ink-700)', lineHeight:1.55, margin:0, cursor:'pointer'}}>
                        {apercu.slice(0, 200)}{apercu.length > 200 ? '…' : ''} <span style={{color:'var(--ink-400)'}}>▼</span>
                      </p>
                    ))}
                    <div style={{
                      display:'flex', gap:8, marginTop:12, paddingTop:10,
                      borderTop:'1px solid var(--ink-100)', fontSize:11, color:'var(--ink-500)',
                      alignItems:'center', flexWrap:'wrap',
                    }}>
                      <div style={{flex:1}} />
                      <button onClick={() => editerCR(cr)} className="btn btn-ghost" style={{padding:'3px 10px', fontSize:11}}>
                        ✎ Modifier
                      </button>
                      {cr.contenu_final && (
                        <button onClick={() => generatePDF('cr', cr.id)} disabled={generatingPDF === `cr-${cr.id}`}
                          className="btn btn-ghost" style={{padding:'3px 10px', fontSize:11}}>
                          <DlIcon /> {generatingPDF === `cr-${cr.id}` ? 'Génération…' : 'PDF'}
                        </button>
                      )}
                      <button onClick={() => supprimerCR(cr.id)} className="btn btn-ghost" style={{padding:'3px 10px', fontSize:11, color:'#b91c1c'}}>
                        × Supprimer
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* ── Section : documents uploadés marqués compte-rendu (Lot 3) ──
                Vue additionnelle (pas une fusion) : on liste les chantier_documents
                tagués 'compte_rendu', distincts des CR générés ci-dessus. Filtre
                réactif sur le state `documents` → dé-taguer fait disparaître la ligne. */}
            {(() => {
              const docTypeLabel = (doc) => {
                const m = (doc.type_mime || '').toLowerCase()
                const n = (doc.nom || '').toLowerCase()
                if (m.includes('pdf') || n.endsWith('.pdf')) return 'pdf'
                if (m.startsWith('image') || /\.(jpg|jpeg|png|gif|webp|heic|heif)$/i.test(n)) return 'image'
                if (m.includes('word') || /\.(doc|docx)$/i.test(n)) return 'word'
                if (m.includes('excel') || /\.(xls|xlsx)$/i.test(n)) return 'tableur'
                return 'fichier'
              }
              const docsCR = documents.filter(d => d.categorie === 'compte_rendu')
              return (
                <div style={{borderTop:'1px solid var(--ink-200)', padding:'14px 22px'}}>
                  <h3 className="page" style={{fontSize:13.5}}>Documents joints marqués compte-rendu</h3>
                  <div className="eyebrow" style={{marginTop:4, marginBottom:10}}>
                    Fichiers uploadés dans l&apos;onglet Documents et tagués CR ({docsCR.length})
                  </div>
                  {docsCR.length === 0 ? (
                    <div style={{fontSize:12.5, color:'var(--ink-400)'}}>
                      Aucun document marqué compte-rendu — taguez un fichier depuis l&apos;onglet Documents (bouton « CR »).
                    </div>
                  ) : docsCR.map(doc => (
                    <div key={doc.id} className="row-hover" style={{
                      display:'flex', alignItems:'center', gap:12, padding:'10px 6px', borderBottom:'1px solid var(--ink-100)',
                    }}>
                      <div style={{width:32, height:32, borderRadius:8, background:'rgba(0,148,212,0.12)', color:'#0094d4', display:'grid', placeItems:'center', flex:'0 0 32px'}}>
                        <DocIcon />
                      </div>
                      <button onClick={() => ouvrirDocument(doc.path, doc.nom)} className="clip-1" style={{
                        flex:1, minWidth:0, fontSize:13, fontWeight:600, color:'var(--ink-900)',
                        background:'none', border:'none', cursor:'pointer', padding:0, textAlign:'left',
                      }}>
                        {doc.nom}
                      </button>
                      <span style={{fontSize:11, color:'var(--ink-500)', textTransform:'uppercase', letterSpacing:0.04}}>{docTypeLabel(doc)}</span>
                      <button onClick={() => ouvrirDocument(doc.path, doc.nom)} className="btn btn-ghost" style={{padding:'4px 8px'}} title="Voir">
                        <EyeIcon />
                      </button>
                      <button onClick={() => toggleCategorieCR(doc.id, false)} className="btn btn-ghost"
                        style={{padding:'4px 8px', fontSize:11, fontWeight:700, color:'#0094d4'}}
                        title="Retirer de la catégorie Compte-rendu">
                        ✓ CR
                      </button>
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>

          {/* Sidebar IA */}
          <div style={{display:'flex', flexDirection:'column', gap:14}}>
            <div className="card" style={{padding:18, background:'linear-gradient(135deg, rgba(0,148,212,0.06), rgba(0,87,142,0.02))'}}>
              <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:10}}>
                <div style={{
                  width:32, height:32, borderRadius:8, background:'var(--brand-500)', color:'#fff',
                  display:'grid', placeItems:'center', fontSize:16,
                }}>✨</div>
                <span style={{fontSize:14, fontWeight:700, color:'var(--ink-900)'}}>CR généré par IA</span>
              </div>
              <ol style={{paddingLeft:20, fontSize:12.5, color:'var(--ink-700)', lineHeight:1.6, margin:0}}>
                <li>Configure (type, date, intervenants)</li>
                <li>Dépose tes notes + photos + vocal</li>
                <li>Relis et valide le rendu structuré</li>
              </ol>
              <button onClick={() => { setCrModal(true); setCrEtape(1) }} className="btn btn-primary" style={{marginTop:14, width:'100%', justifyContent:'center'}}>
                ✨ Démarrer
              </button>
            </div>

            <div className="card" style={{padding:18}}>
              <div className="eyebrow" style={{marginBottom:10}}>Documents joignables au CR</div>
              {documents.length === 0 ? (
                <div style={{fontSize:12, color:'var(--ink-400)'}}>Aucun document — ajoute des fichiers dans l&apos;onglet Documents.</div>
              ) : (
                <div style={{display:'flex', flexDirection:'column', gap:8, fontSize:12.5, color:'var(--ink-700)'}}>
                  {documents.slice(0, 6).map(doc => (
                    <label key={doc.id} style={{display:'flex', alignItems:'center', gap:8, cursor:'pointer'}}>
                      <input type="checkbox" checked={doc.dans_restitution || false}
                        onChange={e => toggleDansRestitution(doc.id, e.target.checked)}
                        style={{accentColor:'var(--brand-500)'}} />
                      <DocIcon />
                      <span className="clip-1" style={{flex:1, minWidth:0}}>{doc.nom}</span>
                    </label>
                  ))}
                  {documents.length > 6 && (
                    <button onClick={() => setOnglet('documents')} className="btn btn-ghost" style={{fontSize:11, padding:'4px 8px', alignSelf:'flex-start'}}>
                      Voir les {documents.length - 6} autres
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

        </div>
        )
      })()}

      {/* ── MODAL CR SANS IA ── */}
      {crManuelModal && (
        <ModalShell
          title={crEditId ? '✎ Modifier le CR' : '📝 Nouveau CR sans IA'}
          subtitle={`${dossier.reference} · ${crEditId ? 'édition' : 'saisie manuelle'}`}
          onClose={fermerCRManuel}
          width={640}
          footer={(<>
            <button onClick={fermerCRManuel} className="btn btn-ghost">Annuler</button>
            <button onClick={() => sauvegarderCRManuel(false)} disabled={crManuelSaving || !crManuelForm.contenu.trim()}
              className="btn btn-ghost" style={{borderColor:'var(--brand-200)', color:'var(--brand-700)'}}>
              {crManuelSaving ? 'Enregistrement…' : 'Sauvegarder brouillon'}
            </button>
            <button onClick={() => sauvegarderCRManuel(true)} disabled={crManuelSaving || !crManuelForm.contenu.trim()}
              className="btn btn-primary">
              {crManuelSaving ? '…' : 'Publier au client'}
            </button>
          </>)}
        >
          <div style={{padding:24, display:'flex', flexDirection:'column', gap:14}}>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
              <ModalField label="Type de visite">
                <select value={crManuelForm.type_visite}
                  onChange={e => setCrManuelForm(f => ({ ...f, type_visite: e.target.value }))}
                  className="input" style={{height:38, padding:'0 12px', fontSize:13}}>
                  <option value="">— Sélectionner —</option>
                  <option value="r1">R1 — Visite technique</option>
                  <option value="r2">R2 — Visite artisans</option>
                  <option value="r3">R3 — Présentation devis</option>
                  <option value="suivi">Suivi de chantier</option>
                  <option value="reception">Réception</option>
                </select>
              </ModalField>
              <ModalField label="Date de visite">
                <input type="date" value={crManuelForm.date_visite}
                  onChange={e => setCrManuelForm(f => ({ ...f, date_visite: e.target.value }))}
                  className="input" style={{height:38, padding:'0 12px', fontSize:13}} />
              </ModalField>
            </div>

            <ModalField label="Contenu du CR" required>
              <textarea value={crManuelForm.contenu}
                onChange={e => setCrManuelForm(f => ({ ...f, contenu: e.target.value }))}
                rows={10} placeholder="Rédigez ou collez le contenu du compte-rendu…"
                className="input" style={{minHeight:200, padding:12, fontSize:13, lineHeight:1.5, resize:'vertical'}} />
            </ModalField>

          </div>
        </ModalShell>
      )}

      {/* ── MODAL CR AVEC IA (wizard 3 étapes) ── */}
      {crModal && (() => {
        const TYPES_CR = [
          { value: 'r1',        label: 'R1 — Visite technique',  emoji: '🔍' },
          { value: 'r2',        label: 'R2 — Visite artisans',    emoji: '🔨' },
          { value: 'r3',        label: 'R3 — Présentation devis', emoji: '📋' },
          { value: 'suivi',     label: 'Suivi de chantier',       emoji: '📊' },
          { value: 'reception', label: 'Réception',               emoji: '✓' },
        ]
        const intervenantsDispo = devis.filter(d => ['recu', 'accepte'].includes(d.statut))
        return (
          <ModalShell
            title={<>✨ Nouveau CR avec IA <span style={{fontSize:12, color:'var(--ink-400)', fontWeight:400, marginLeft:8}}>· Étape {crEtape}/3</span></>}
            subtitle={(
              <div style={{display:'flex', gap:6, marginTop:6}}>
                {[1,2,3].map(n => (
                  <div key={n} style={{
                    height:4, width:60, borderRadius:99,
                    background: n <= crEtape ? 'var(--brand-700)' : 'var(--ink-200)',
                    transition:'background 200ms',
                  }} />
                ))}
              </div>
            )}
            onClose={async () => {
              // Fermeture sans CR sauvegardé : les photos uploadées ne sont rattachées
              // à aucun CR → orphelines. Purge best-effort de Storage. Si ça rate (crash,
              // onglet fermé), le filet reste la colonne photos_paths : tout fichier sous
              // chantiers/{id}/cr/ référencé par aucun CR est un déchet purgeable plus tard.
              // (La sauvegarde d'un CR passe par setCrModal(false) direct, jamais par ici.)
              const aPurger = crImages.map(im => im.path)
              if (aPurger.length) { try { await supabase.storage.from('photos').remove(aPurger) } catch {} }
              setCrImages([])
              setCrPhotosDossier([]) // photos du dossier : simple désélection, JAMAIS de remove Storage
              setCrPhotosUp(false)
              setCrModal(false)
            }}
            width="min(1400px, 96vw)"
            maxH="94vh"
          >
            <div style={{padding:24, display:'flex', flexDirection:'column', gap:16}}>

              {/* ── ÉTAPE 1 : Configuration ── */}
              {crEtape === 1 && (
                <div style={{display:'flex', flexDirection:'column', gap:14}}>
                  <div style={{fontSize:13.5, fontWeight:600, color:'var(--ink-700)'}}>Configuration de la visite</div>

                  <ModalField label="Type de visite" required>
                    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:6}}>
                      {TYPES_CR.map(({ value, label, emoji }) => {
                        const active = crForm.type_visite === value
                        return (
                          <button key={value} onClick={() => setCrForm(f => ({ ...f, type_visite: value }))}
                            style={{
                              textAlign:'left', padding:'10px 14px', borderRadius:10,
                              border:'1px solid', cursor:'pointer', fontSize:13, transition:'all 150ms',
                              borderColor: active ? 'var(--brand-700)' : 'var(--ink-200)',
                              background: active ? 'var(--brand-50)' : '#fff',
                              color: active ? 'var(--brand-800)' : 'var(--ink-700)',
                              fontWeight: active ? 600 : 500,
                            }}>
                            {emoji} {label}
                          </button>
                        )
                      })}
                    </div>
                  </ModalField>

                  <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
                    <ModalField label="Date de la visite">
                      <input type="date" value={crForm.date_visite}
                        onChange={e => setCrForm(f => ({ ...f, date_visite: e.target.value }))}
                        className="input" style={{height:38, padding:'0 12px', fontSize:13}} />
                    </ModalField>
                    <ModalField label="Intervenants présents">
                      {intervenantsDispo.length > 0 ? (
                        <div style={{border:'1px solid var(--ink-200)', borderRadius:10, padding:6, display:'flex', flexDirection:'column', gap:2}}>
                          {intervenantsDispo.map(d => {
                            const selected = (crForm.intervenants || '').split(',').map(s => s.trim()).filter(Boolean).includes(d.artisan?.entreprise)
                            return (
                              <label key={d.id} style={{
                                display:'flex', alignItems:'center', gap:8, cursor:'pointer',
                                padding:'4px 8px', borderRadius:6, transition:'background 150ms',
                              }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)' }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                                <input type="checkbox" checked={selected}
                                  onChange={() => {
                                    const current = (crForm.intervenants || '').split(',').map(s => s.trim()).filter(Boolean)
                                    const updated = selected
                                      ? current.filter(n => n !== d.artisan?.entreprise)
                                      : [...current, d.artisan?.entreprise]
                                    setCrForm(f => ({ ...f, intervenants: updated.join(', ') }))
                                  }}
                                  style={{accentColor:'var(--brand-500)'}} />
                                <span style={{fontSize:13, color:'var(--ink-700)'}}>{d.artisan?.entreprise}</span>
                                <span style={{fontSize:11, color:'var(--ink-400)'}}>{d.artisan?.metier}</span>
                                <span style={{
                                  fontSize:10.5, padding:'2px 8px', borderRadius:99, marginLeft:'auto', fontWeight:700,
                                  background: d.statut === 'accepte' ? TONE_BG.ok : TONE_BG.info,
                                  color: d.statut === 'accepte' ? TONE_FG.ok : TONE_FG.info,
                                }}>
                                  {d.statut === 'accepte' ? 'Signé' : 'Reçu'}
                                </span>
                              </label>
                            )
                          })}
                        </div>
                      ) : (
                        <input type="text" value={crForm.intervenants}
                          onChange={e => setCrForm(f => ({ ...f, intervenants: e.target.value }))}
                          placeholder="Plaquiste, Électricien…"
                          className="input" style={{height:38, padding:'0 12px', fontSize:13}} />
                      )}
                    </ModalField>
                  </div>

                  <button onClick={() => crForm.type_visite && setCrEtape(2)}
                    disabled={!crForm.type_visite}
                    className="btn btn-primary"
                    style={{justifyContent:'center', height:42, fontSize:13, marginTop:4}}>
                    Suivant →
                  </button>
                </div>
              )}

              {/* ── ÉTAPE 2 : Notes brutes ── */}
              {crEtape === 2 && (
                <div style={{display:'flex', flexDirection:'column', gap:14}}>
                  <div>
                    <div style={{fontSize:13.5, fontWeight:600, color:'var(--ink-700)'}}>Saisie des notes brutes</div>
                    <div style={{fontSize:11.5, color:'var(--ink-400)', marginTop:2}}>Combinez plusieurs sources — l&apos;IA synthétise tout</div>
                  </div>

                  {/* 2 colonnes sur large écran (auto-fit → 1 colonne sur mobile) :
                      gauche = sources texte ; droite = photos & documents. */}
                  <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(340px, 1fr))', gap:16, alignItems:'start'}}>
                  <div style={{display:'flex', flexDirection:'column', gap:14, minWidth:0}}>

                  <ModalField label="📝 Texte (copier-coller depuis OneNote, Outlook…)">
                    <textarea value={crNotes} onChange={e => setCrNotes(e.target.value)}
                      rows={5} placeholder="Coller vos notes brutes ici — bullet points, phrases incomplètes, tout est ok…"
                      className="input" style={{minHeight:120, padding:12, fontSize:13, lineHeight:1.5, resize:'vertical'}} />
                  </ModalField>

                  <ModalField label="🎤 Vocal (dictée dans l'app)">
                    <div style={{display:'flex', gap:8, alignItems:'flex-start'}}>
                      <button onClick={crVocal ? arreterVocal : demarrerVocal}
                        style={{
                          flexShrink:0, padding:'8px 16px', borderRadius:10,
                          fontSize:13, fontWeight:600, border:'none', cursor:'pointer', transition:'all 150ms',
                          background: crVocal ? 'rgba(220,38,38,0.12)' : 'var(--surface-2)',
                          color: crVocal ? '#b91c1c' : 'var(--ink-700)',
                          animation: crVocal ? 'fadeIn 1s ease-in-out infinite alternate' : 'none',
                        }}>
                        {crVocal ? '⏹ Arrêter' : '🎙 Dicter'}
                      </button>
                      {crVocalTexte && (
                        <div style={{
                          flex:1, fontSize:12, color:'var(--ink-700)', background:'var(--surface-2)',
                          borderRadius:10, padding:10, minHeight:40,
                        }}>
                          {crVocalTexte}
                        </div>
                      )}
                    </div>
                  </ModalField>

                  <ModalField label="🎙️ Audio de visite (enregistrer ou déposer un fichier — iPhone compris)">
                    <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
                      <button onClick={crRecording ? arreterEnregistrement : demarrerEnregistrement} disabled={crTranscribing}
                        style={{
                          flexShrink:0, padding:'8px 16px', borderRadius:10,
                          fontSize:13, fontWeight:600, border:'none', cursor: crTranscribing ? 'default' : 'pointer', transition:'all 150ms',
                          background: crRecording ? 'rgba(220,38,38,0.12)' : 'var(--surface-2)',
                          color: crRecording ? '#b91c1c' : 'var(--ink-700)',
                          animation: crRecording ? 'fadeIn 1s ease-in-out infinite alternate' : 'none',
                          opacity: crTranscribing ? 0.6 : 1,
                        }}>
                        {crRecording ? '⏹ Arrêter et transcrire' : '🎙 Enregistrer'}
                      </button>
                      <label className="btn btn-ghost" style={{cursor: (crRecording || crTranscribing) ? 'default' : 'pointer', fontSize:13, padding:'8px 14px', opacity:(crRecording || crTranscribing) ? 0.6 : 1}}>
                        📂 Déposer un audio
                        <input type="file" accept="audio/*" style={{display:'none'}} disabled={crRecording || crTranscribing}
                          onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onAudioFile(f) }} />
                      </label>
                      {crTranscribing && <span style={{fontSize:12, color:'var(--ink-500)'}}>Transcription en cours…</span>}
                    </div>
                    <div style={{fontSize:11, color:'var(--ink-400)', marginTop:6}}>
                      ⚠️ Prévenez les participants que la visite est enregistrée.
                    </div>
                    {crAudioTexte && (
                      <textarea value={crAudioTexte} onChange={e => setCrAudioTexte(e.target.value)} rows={4}
                        placeholder="Transcription — relisez et corrigez si besoin avant de générer le CR."
                        className="input" style={{marginTop:8, minHeight:90, padding:10, fontSize:12.5, lineHeight:1.5, resize:'vertical'}} />
                    )}
                  </ModalField>

                  </div>
                  <div style={{display:'flex', flexDirection:'column', gap:14, minWidth:0}}>

                  <ModalField label="📷 Photos (cahier, capture d'écran, document)">
                    <div style={{display:'flex', flexWrap:'wrap', gap:8}}>
                      {crImages.map((img, i) => (
                        <div key={img.path} style={{position:'relative'}}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={img.url_signee} alt="" style={{width:80, height:80, objectFit:'cover', borderRadius:8, border:'1px solid var(--ink-200)'}} />
                          <button onClick={async () => {
                              // Fichier créé pour ce CR et pour lui seul → on le supprime de Storage.
                              try { await supabase.storage.from('photos').remove([img.path]) } catch {}
                              setCrImages(imgs => imgs.filter((_, j) => j !== i))
                            }}
                            style={{
                              position:'absolute', top:-6, right:-6,
                              width:18, height:18, borderRadius:'50%',
                              background:'#dc2626', color:'#fff', border:'none', cursor:'pointer',
                              fontSize:10, display:'grid', placeItems:'center',
                            }}>✕</button>
                        </div>
                      ))}
                      <label style={{
                        width:80, height:80, borderRadius:8,
                        border:'2px dashed var(--ink-300)', display:'grid', placeItems:'center',
                        cursor: crPhotosUp ? 'wait' : 'pointer', transition:'border-color 150ms',
                      }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand-500)' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--ink-300)' }}>
                        <span style={{fontSize:24, color:'var(--ink-300)', lineHeight:1}}>{crPhotosUp ? '…' : '+'}</span>
                        <input type="file" accept="image/*" multiple disabled={crPhotosUp} style={{display:'none'}}
                          onChange={async e => {
                            const files = Array.from(e.target.files || [])
                            e.target.value = '' // autorise la re-sélection des mêmes fichiers
                            if (!files.length) return
                            setCrPhotosUp(true)
                            for (const file of files) {
                              try {
                                // Compression puis upload direct dans Storage (bucket photos),
                                // sous chantiers/{id}/cr/ — emplacement dédié aux photos de CR,
                                // SANS insert dans la table `photos` (invisibles onglet Photos).
                                const blob = await compressImageToBlob(file)
                                const path = `chantiers/${id}/cr/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`
                                const { error: upErr } = await supabase.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' })
                                if (upErr) { setErreur('Échec de l’envoi d’une photo : ' + upErr.message); continue }
                                // Vignette : signed URL comme signerPhotos (bucket privé).
                                const { data: signed } = await supabase.storage.from('photos').createSignedUrl(path, 3600)
                                setCrImages(imgs => [...imgs, { path, url_signee: signed?.signedUrl || '' }])
                              } catch {
                                setErreur('Impossible de traiter une photo (format non supporté ?).')
                              }
                            }
                            setCrPhotosUp(false)
                          }} />
                      </label>
                    </div>
                  </ModalField>

                  {photos.length > 0 && (
                    <ModalField label="🖼️ Photos du chantier (jointes au CR)">
                      <div style={{
                        display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(80px, 1fr))', gap:8,
                        border:'1px solid var(--ink-200)', borderRadius:10, padding:8, maxHeight:200, overflowY:'auto',
                      }}>
                        {photos.filter(p => p.type_media !== 'video').map(p => {
                          const selected = crPhotosDossier.includes(p.url)
                          return (
                            // Clic = (dé)sélection. Aucun fichier n'est touché : ce sont des photos
                            // du dossier, on n'envoie que leur path. Jamais de remove Storage ici.
                            <button key={p.url} type="button"
                              onClick={() => setCrPhotosDossier(prev =>
                                selected ? prev.filter(u => u !== p.url) : [...prev, p.url]
                              )}
                              style={{
                                position:'relative', padding:0, border:'none', background:'none',
                                cursor:'pointer', aspectRatio:'1', borderRadius:8, overflow:'hidden',
                              }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={p.url_signee} alt="" style={{
                                width:'100%', height:'100%', objectFit:'cover', display:'block',
                                borderRadius:8,
                                border: selected ? '2px solid var(--brand-600)' : '1px solid var(--ink-200)',
                                opacity: selected ? 1 : 0.85,
                              }} />
                              {selected && (
                                <span style={{
                                  position:'absolute', top:4, right:4,
                                  width:18, height:18, borderRadius:'50%',
                                  background:'var(--brand-600)', color:'#fff',
                                  fontSize:11, display:'grid', placeItems:'center',
                                }}>✓</span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                      {crPhotosDossier.length > 0 && (
                        <div style={{fontSize:11, color:'var(--ink-400)', marginTop:6}}>
                          {crPhotosDossier.length} photo{crPhotosDossier.length > 1 ? 's' : ''} du chantier jointe{crPhotosDossier.length > 1 ? 's' : ''}
                        </div>
                      )}
                    </ModalField>
                  )}

                  {documents.length > 0 && (
                    <ModalField label="📎 Documents du chantier (contexte IA)">
                      <div style={{border:'1px solid var(--ink-200)', borderRadius:10, padding:6, display:'flex', flexDirection:'column', gap:2, maxHeight:144, overflowY:'auto'}}>
                        {documents.map(doc => {
                          const selected = crDocsSelectionnes.some(d => d.id === doc.id)
                          const supported = doc.type_mime?.includes('pdf') || doc.type_mime?.startsWith('image')
                          return (
                            <label key={doc.id} style={{
                              display:'flex', alignItems:'center', gap:8,
                              padding:'4px 8px', borderRadius:6, cursor: supported ? 'pointer' : 'not-allowed',
                              opacity: supported ? 1 : 0.4, transition:'background 150ms',
                            }}
                              onMouseEnter={e => { if (supported) e.currentTarget.style.background = 'var(--surface-2)' }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                              <input type="checkbox" checked={selected} disabled={!supported}
                                onChange={() => {
                                  if (!supported) return
                                  setCrDocsSelectionnes(prev =>
                                    selected ? prev.filter(d => d.id !== doc.id) : [...prev, doc]
                                  )
                                }}
                                style={{accentColor:'var(--brand-500)'}} />
                              <span className="clip-1" style={{fontSize:12, color:'var(--ink-700)', flex:1, minWidth:0}}>{doc.nom}</span>
                              {!supported && <span style={{fontSize:10.5, color:'var(--ink-400)'}}>non supporté</span>}
                            </label>
                          )
                        })}
                      </div>
                    </ModalField>
                  )}

                  </div>
                  </div>

                  <div style={{display:'flex', gap:10, paddingTop:6}}>
                    <button onClick={() => setCrEtape(1)} className="btn btn-ghost" style={{flex:1, justifyContent:'center', height:42}}>
                      ← Retour
                    </button>
                    <button onClick={genererCRAvecIA}
                      disabled={crGenerating || crPhotosUp || crTranscribing || crRecording || (!crNotes.trim() && !crVocalTexte.trim() && !crAudioTexte.trim() && crImages.length === 0 && crPhotosDossier.length === 0)}
                      className="btn btn-primary" style={{flex:2, justifyContent:'center', height:42, fontSize:13}}>
                      {crGenerating ? (
                        <span style={{display:'inline-flex', alignItems:'center', gap:8}}>
                          <span style={{
                            width:14, height:14, borderRadius:'50%',
                            border:'2px solid rgba(255,255,255,0.4)', borderTopColor:'#fff',
                            animation:'spin 0.65s linear infinite',
                          }} />
                          Génération en cours…
                        </span>
                      ) : '✨ Générer le CR'}
                    </button>
                  </div>
                </div>
              )}

              {/* ── ÉTAPE 3 : Relecture ── */}
              {crEtape === 3 && crGenere && (
                <div style={{display:'flex', flexDirection:'column', gap:14}}>
                  <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
                    <span style={{fontSize:14, fontWeight:700, color:'var(--ink-900)'}}>{crGenere.titre}</span>
                    <Badge tone="ok">Généré ✓</Badge>
                  </div>

                  <div style={{display:'flex', flexDirection:'column', gap:12}}>
                    {crSectionsEditees.map((section, idx) => (
                      <div key={idx} style={{
                        border:'1px solid', borderRadius:10, overflow:'hidden',
                        borderColor: section.important ? 'rgba(245,158,11,0.4)' : 'var(--ink-200)',
                      }}>
                        <div style={{
                          padding:'8px 14px', display:'flex', alignItems:'center', gap:8,
                          background: section.important ? 'rgba(245,158,11,0.10)' : 'var(--surface-2)',
                        }}>
                          <span style={{fontSize:11, fontWeight:800, color:'var(--ink-500)'}}>{section.numero}.</span>
                          <input
                            type="text"
                            value={section.titre}
                            onChange={e => setCrSectionsEditees(ss => ss.map((s, i) => i === idx ? { ...s, titre: e.target.value } : s))}
                            style={{flex:1, fontSize:13, fontWeight:600, background:'transparent', border:'none', outline:'none', color:'var(--ink-900)'}} />
                          <button onClick={() => setCrSectionsEditees(ss => ss.map((s, i) => i === idx ? { ...s, important: !s.important } : s))}
                            style={{
                              fontSize:13, padding:'2px 8px', borderRadius:6,
                              background:'transparent', border:'none', cursor:'pointer',
                              color: section.important ? '#a16207' : 'var(--ink-300)',
                            }}>⚠</button>
                        </div>
                        <textarea
                          value={section.contenu}
                          onChange={e => setCrSectionsEditees(ss => ss.map((s, i) => i === idx ? { ...s, contenu: e.target.value } : s))}
                          rows={Math.max(3, Math.ceil(section.contenu.length / 80))}
                          style={{
                            width:'100%', padding:'10px 14px', fontSize:12, color:'var(--ink-700)',
                            border:'none', outline:'none', resize:'vertical', lineHeight:1.55,
                            transition:'background 150ms', fontFamily:'inherit',
                          }}
                          onFocus={e => { e.target.style.background = 'var(--brand-50)' }}
                          onBlur={e => { e.target.style.background = 'transparent' }} />
                      </div>
                    ))}
                  </div>

                  <div style={{display:'flex', gap:10, paddingTop:6, flexWrap:'wrap'}}>
                    <button onClick={() => setCrEtape(2)} className="btn btn-ghost" style={{justifyContent:'center', height:42}}>
                      ← Retravailler
                    </button>
                    <button onClick={() => sauvegarderCRGenere(false)} disabled={crSavingFinal}
                      className="btn btn-ghost" style={{flex:1, justifyContent:'center', height:42, borderColor:'var(--brand-700)', color:'var(--brand-800)'}}>
                      Sauvegarder brouillon
                    </button>
                    <button onClick={() => sauvegarderCRGenere(true)} disabled={crSavingFinal}
                      className="btn btn-primary" style={{flex:1, justifyContent:'center', height:42, background:'#15803d', borderColor:'#15803d'}}>
                      ✓ Publier au client
                    </button>
                  </div>
                </div>
              )}

            </div>
          </ModalShell>
        )
      })()}

      {/* ── MESSAGES (maquette : conversation client AMO) ── */}
      {onglet === 'messages' && dossier?.typologie === 'amo' && (
      <div className="card" style={{padding:0, overflow:'hidden', display:'flex', flexDirection:'column', minHeight:520}}>
        {/* Header */}
        <div style={{padding:'14px 22px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid var(--ink-200)', gap:8, flexWrap:'wrap'}}>
          <div>
            <h2 className="page" style={{fontSize:15}}>Conversation client</h2>
            <div className="eyebrow" style={{marginTop:4}}>Visible dans l&apos;espace client AMO · {messages.length} message{messages.length > 1 ? 's' : ''}</div>
          </div>
          <div style={{display:'flex', gap:8, alignItems:'center'}}>
            {nbMsgNonLus > 0 && (
              <Badge tone="bad">{nbMsgNonLus} non lu{nbMsgNonLus > 1 ? 's' : ''}</Badge>
            )}
            <Badge tone="ok">● Temps réel</Badge>
          </div>
        </div>

        {/* Fil des messages */}
        <div style={{
          flex:1, padding:'24px 22px', background:'var(--surface-2)',
          display:'flex', flexDirection:'column', gap:14, overflowY:'auto',
          maxHeight:'min(70vh, 640px)',
        }}>
          {messages.length === 0 ? (
            <div style={{textAlign:'center', color:'var(--ink-400)', fontSize:13, paddingTop:32}}>
              Aucun message pour le moment — démarre la conversation.
            </div>
          ) : (
            messages.map(msg => {
              const isClient = msg.auteur_role === 'client'
              const who = isClient
                ? (msg.auteur?.prenom ? `${msg.auteur.prenom}${msg.auteur.nom ? ' ' + msg.auteur.nom : ''}` : (client ? `${client.prenom || ''} ${client.nom || ''}`.trim() : 'Client'))
                : (msg.auteur?.prenom ? `${msg.auteur.prenom}${msg.auteur.nom ? ' ' + msg.auteur.nom[0] + '.' : ''}` : 'Équipe')
              const when = fmtDateHeureFR(msg.created_at)
              const editable = msg.auteur_id === profile?.id
                && !String(msg.id).startsWith('tmp-')
                && estDansDelaiEdition(msg.created_at)
              return (
                <div key={msg.id} style={{display:'flex', gap:10, justifyContent: isClient ? 'flex-start' : 'flex-end'}}>
                  {isClient && <Avatar name={who} color="#0094d4" size={28} />}
                  <div style={{maxWidth:'min(70%, 420px)', minWidth:0}}>
                    <div style={{
                      background: isClient ? '#fff' : 'var(--brand-500)',
                      color: isClient ? 'var(--ink-800)' : '#fff',
                      padding: '10px 14px',
                      borderRadius: isClient ? '12px 12px 12px 4px' : '12px 12px 4px 12px',
                      fontSize: 13.5, lineHeight: 1.5,
                      boxShadow: isClient ? '0 1px 2px rgba(0,0,0,0.04)' : 'none',
                      wordBreak: 'break-word',
                      opacity: String(msg.id).startsWith('tmp-') ? 0.7 : 1,
                    }}>
                      {editingMsgId === msg.id ? (
                        <div style={{display:'flex', flexDirection:'column', gap:6}}>
                          <textarea value={editMsgText} onChange={e => setEditMsgText(e.target.value)} rows={2} autoFocus
                            style={{width:'100%', resize:'vertical', borderRadius:8, border:'1px solid var(--ink-200)', padding:'6px 8px', fontSize:13.5, color:'var(--ink-900)', background:'#fff'}} />
                          {editMsgError && <div style={{fontSize:11, color:'#fecaca', fontWeight:600}}>{editMsgError}</div>}
                          <div style={{display:'flex', gap:8, justifyContent:'flex-end'}}>
                            <button onClick={annulerEditionMsg} style={{fontSize:11, background:'transparent', border:0, color:'inherit', opacity:0.85, cursor:'pointer'}}>Annuler</button>
                            <button onClick={() => modifierMessage(msg)} disabled={!editMsgText.trim()} style={{fontSize:11, fontWeight:700, background:'#fff', color:'var(--brand-700)', border:0, borderRadius:6, padding:'2px 10px', cursor:'pointer'}}>Valider</button>
                          </div>
                        </div>
                      ) : (
                        msg.contenu
                      )}
                    </div>
                    <div style={{fontSize:10.5, color:'var(--ink-400)', marginTop:4, textAlign: isClient ? 'left' : 'right'}}>
                      {who} · {when}{msg.edited_at ? ' (modifié)' : ''}
                      {editable && editingMsgId !== msg.id && (
                        <button onClick={() => { setEditingMsgId(msg.id); setEditMsgText(msg.contenu); setEditMsgError('') }}
                          style={{marginLeft:8, fontSize:10.5, background:'transparent', border:0, color:'var(--brand-600)', cursor:'pointer', textDecoration:'underline', padding:0}}>modifier</button>
                      )}
                    </div>
                  </div>
                  {!isClient && <Avatar name={who} color="#00578e" size={28} />}
                </div>
              )
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Champ d'envoi */}
        <div style={{padding:'14px 18px', borderTop:'1px solid var(--ink-200)', display:'flex', gap:10, alignItems:'center'}}>
          <input className="input" type="text"
            value={reponseMsg}
            onChange={e => setReponseMsg(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyerReponse() } }}
            placeholder="Écrire un message au client…"
            disabled={sendingMsg}
            style={{flex:1, height:42}} />
          <button onClick={envoyerReponse} disabled={!reponseMsg.trim() || sendingMsg}
            className="btn btn-primary" style={{height:42, flexShrink:0}}>
            {sendingMsg ? '…' : '➤ Envoyer'}
          </button>
        </div>
      </div>
      )}

      {/* Modal Créer Intervention (maquette) */}
      {modalCreerIntervOuvert && (() => {
        const f = nouvIntervForm
        const setF = (patch) => setNouvIntervForm(prev => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }))
        const closeModal = () => { setModalCreerIntervOuvert(false); setNouvIntervArtisanId(null) }
        const valid = !!nouvIntervArtisanId && (
          f.type_intervention === 'periode'
            ? (!!f.date_debut && !!f.date_fin)
            : (f.jours_specifiques || []).length > 0
        )
        const artisanSelected = devis.find(d => d.artisan_id === nouvIntervArtisanId)?.artisan
        return (
          <ModalShell
            title="Planifier une intervention"
            subtitle={`${dossier.reference} · ${nomComplet}`}
            onClose={closeModal}
            width={580}
            footer={(<>
              <button className="btn btn-ghost" onClick={closeModal}>Annuler</button>
              <button className="btn btn-primary" disabled={!valid || saving} onClick={creerInterventionDossier}>
                <CalIcon /> {saving ? 'Enregistrement…' : 'Planifier'}
              </button>
            </>)}
          >
            <div style={{padding:24, display:'flex', flexDirection:'column', gap:14}}>

              {/* Artisan */}
              <ModalField label="Artisan" required>
                {artisanSelected ? (
                  <div style={{
                    display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
                    border:'1px solid var(--brand-200)', borderRadius:10, background:'var(--brand-50)',
                  }}>
                    <div style={{
                      width:32, height:32, borderRadius:8, background:'var(--brand-100)',
                      color:'var(--brand-800)', display:'grid', placeItems:'center',
                    }}>
                      <HammerIcon />
                    </div>
                    <div style={{flex:1, minWidth:0}}>
                      <div style={{fontSize:13, fontWeight:700, color:'var(--brand-900)'}}>{artisanSelected.entreprise}</div>
                      {artisanSelected.metier && <div style={{fontSize:11, color:'var(--brand-700)', marginTop:2}}>{artisanSelected.metier}</div>}
                    </div>
                    <button onClick={() => setNouvIntervArtisanId(null)} className="btn btn-ghost" style={{padding:'2px 8px', fontSize:11}}>Changer</button>
                  </div>
                ) : (
                  <>
                    <select className="input"
                      value={nouvIntervArtisanId || ''}
                      onChange={e => setNouvIntervArtisanId(e.target.value)}
                      style={{height:38, padding:'0 12px', fontSize:13}}>
                      <option value="">— Choisir un artisan (devis signé) —</option>
                      {devis.filter(d => d.statut === 'accepte').map(d => (
                        <option key={d.artisan_id} value={d.artisan_id}>
                          {d.artisan?.entreprise}{d.artisan?.metier ? ` · ${d.artisan.metier}` : ''}
                        </option>
                      ))}
                    </select>
                    {devis.filter(d => d.statut === 'accepte').length === 0 && (
                      <div style={{fontSize:11.5, color:'var(--ink-500)', marginTop:4}}>Aucun artisan avec devis signé sur ce chantier</div>
                    )}
                  </>
                )}
              </ModalField>

              {/* Type d'intervention (segmented) */}
              <ModalField label="Type d'intervention">
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:6}}>
                  {[
                    { v: 'periode',            l: 'Période continue', sub: 'du X au Y'   },
                    { v: 'jours_specifiques',  l: 'Jours spécifiques', sub: 'liste de dates' },
                  ].map(o => {
                    const active = f.type_intervention === o.v
                    return (
                      <button key={o.v} type="button" onClick={() => setF({ type_intervention: o.v, jours_specifiques: [] })}
                        style={{
                          padding:'10px 12px', borderRadius:8, border:'1px solid',
                          borderColor: active ? 'var(--brand-500)' : 'var(--ink-200)',
                          background: active ? 'var(--brand-50)' : '#fff',
                          color: active ? 'var(--brand-800)' : 'var(--ink-700)',
                          cursor:'pointer', fontWeight:700, fontSize:13,
                          display:'flex', flexDirection:'column', gap:2, alignItems:'flex-start',
                        }}>
                        <span>{o.l}</span>
                        <span style={{fontSize:10.5, fontWeight:500, opacity:0.8}}>{o.sub}</span>
                      </button>
                    )
                  })}
                </div>
              </ModalField>

              {/* Dates période */}
              {f.type_intervention === 'periode' && (
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
                  <ModalField label="Date de début" required>
                    <input className="input" type="date" value={f.date_debut}
                      onChange={e => setF({ date_debut: e.target.value })}
                      style={{height:38, padding:'0 12px', fontSize:13}} />
                  </ModalField>
                  <ModalField label="Date de fin" required>
                    <input className="input" type="date" value={f.date_fin}
                      onChange={e => setF({ date_fin: e.target.value })}
                      style={{height:38, padding:'0 12px', fontSize:13}} />
                  </ModalField>
                </div>
              )}

              {/* Jours spécifiques */}
              {f.type_intervention === 'jours_specifiques' && (
                <ModalField label="Ajouter des jours">
                  <input className="input" type="date"
                    onChange={e => {
                      const date = e.target.value
                      if (!date) return
                      setF(prev => ({
                        ...prev,
                        jours_specifiques: prev.jours_specifiques.includes(date)
                          ? prev.jours_specifiques.filter(j => j !== date)
                          : [...prev.jours_specifiques, date].sort(),
                      }))
                      e.target.value = ''
                    }}
                    style={{height:38, padding:'0 12px', fontSize:13}} />
                  {f.jours_specifiques.length > 0 && (
                    <div style={{display:'flex', flexWrap:'wrap', gap:6, marginTop:8}}>
                      {f.jours_specifiques.map(j => (
                        <span key={j} style={{
                          display:'inline-flex', alignItems:'center', gap:4,
                          fontSize:11.5, fontWeight:600, background:'var(--brand-50)', color:'var(--brand-800)',
                          padding:'4px 10px', borderRadius:99, border:'1px solid var(--brand-200)',
                        }}>
                          {new Date(j).toLocaleDateString('fr-FR')}
                          <button onClick={() => setF(p => ({ ...p, jours_specifiques: p.jours_specifiques.filter(d => d !== j) }))}
                            style={{border:'none', background:'transparent', color:'var(--brand-700)', cursor:'pointer', fontSize:14, lineHeight:1, padding:0, marginLeft:2}}>×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </ModalField>
              )}

              {/* Lieu */}
              <ModalField label="Lieu">
                <LieuPicker value={f.lieu || 'client'} onChange={v => setF({ lieu: v })} />
              </ModalField>

              {/* Horaire */}
              <ModalField label="Horaire">
                <label style={{
                  display:'flex', alignItems:'center', gap:8, padding:'8px 12px',
                  border:'1px solid var(--ink-200)', borderRadius:8, cursor:'pointer', fontSize:13,
                }}>
                  <input type="checkbox" checked={!f.heure_debut}
                    onChange={e => setF({ heure_debut: e.target.checked ? '' : '08:00' })}
                    style={{accentColor:'var(--brand-500)'}} />
                  <span style={{color:'var(--ink-700)', fontWeight:500}}>Journée entière</span>
                </label>
                {f.heure_debut && (
                  <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:8}}>
                    <input className="input" type="time" value={f.heure_debut}
                      onChange={e => setF({ heure_debut: e.target.value })}
                      style={{height:38, padding:'0 12px', fontSize:13}} />
                    <select className="input" value={f.duree_minutes}
                      onChange={e => setF({ duree_minutes: Number(e.target.value) })}
                      style={{height:38, padding:'0 12px', fontSize:13}}>
                      {[30,60,90,120,180,240,300,360,480].map(m => (
                        <option key={m} value={m}>{m < 60 ? `${m} min` : `${m/60}h${m%60 ? m%60 : ''}`}</option>
                      ))}
                    </select>
                  </div>
                )}
              </ModalField>

              {/* Notes */}
              <ModalField label="Notes">
                <textarea className="input" value={f.notes}
                  onChange={e => setF({ notes: e.target.value })}
                  rows={3} placeholder="Précisions, accès chantier, contact site…"
                  style={{minHeight:80, padding:12, fontSize:13, lineHeight:1.5, resize:'vertical'}} />
              </ModalField>

              {/* Cible calendrier (lot 3b) — INERTE : le push lit encore GOOGLE_CALENDAR_ID (lot 4). */}
              {cibles.length > 0 && (
                <ModalField label="Calendrier">
                  <select className="input"
                    value={f.cible_id || ''}
                    onChange={e => setF({ cible_id: e.target.value })}
                    style={{height:38, padding:'0 12px', fontSize:13}}>
                    <option value="">— Choisir un calendrier —</option>
                    {cibles.map(c => <option key={c.id} value={c.id}>{libelleCible(c)}</option>)}
                  </select>
                </ModalField>
              )}

            </div>
          </ModalShell>
        )
      })()}

      {/* Visionneuse de document */}
      {docViewer && (
        <DocViewer url={docViewer.url} nom={docViewer.nom} onClose={() => setDocViewer(null)} />
      )}

      {/* Modal d'ajout / édition de devis */}
      <DevisModal
        open={devisModal.open}
        devis={devisModal.devis}
        onClose={() => setDevisModal({ open: false, devis: null })}
        onSave={saveDevisFromModal}
        artisans={artisans}
      />
    </div>
  )
}
