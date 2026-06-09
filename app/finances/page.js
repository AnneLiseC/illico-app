// app/finances/page.js
'use client'
import React, { useState, useEffect, useMemo } from 'react'
import { Chart, CategoryScale, LinearScale, BarElement, LineElement, PointElement, BarController, LineController, ArcElement, DoughnutController, Tooltip, Legend, Filler } from 'chart.js'
Chart.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, BarController, LineController, ArcElement, DoughnutController, Tooltip, Legend, Filler)
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '../lib/auth-context'
import { calculateDossierFinance, getActiveDevis, getSignedDevis, ROYALTIES_RATE } from '../lib/finance'
import { Avatar } from '../components/shared'

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────────────────────

const MOIS = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
const MOIS_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']

// ─────────────────────────────────────────────────────────────────────────────
// UTILITAIRES PURS
// ─────────────────────────────────────────────────────────────────────────────

const round2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100
const fmt = (n) => {
  const v = (Number(n) || 0).toFixed(2)
  const [int, dec] = v.split('.')
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + '.' + dec + ' €'
}
const normalizeDossier = (d) => ({
  ...d,
  part_agente: d.part_agente ?? (d.referente?.role === 'admin' ? 0 : 0.5),
  frais_part_agente: d.frais_part_agente ?? null,
  taux_amo: d?.taux_amo ?? d?.honoraires_amo_taux,
  client: d?.client || null,
})

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS TABLEAU
// ─────────────────────────────────────────────────────────────────────────────

const thL = (label) => <th key={label} className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</th>
const thR = (label) => <th key={label} className="text-right px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</th>

function Th({ children, right }) {
  return <th style={{padding:'12px 16px',fontSize:11,fontWeight:700,color:'var(--ink-500)',textTransform:'uppercase',textAlign:right?'right':'left',whiteSpace:'nowrap'}}>{children}</th>
}
function Td({ children, right, mono, dim, bold, accent }) {
  return <td style={{padding:'14px 16px',fontSize:13,textAlign:right?'right':'left',color:accent?'var(--brand-800)':dim?'var(--ink-400)':'var(--ink-700)',fontWeight:bold?700:400,fontVariantNumeric:mono?'tabular-nums':undefined}}>{children}</td>
}
function StatutFacture({ f }) {
  const s = f?.statut || 'a_facturer'
  return <span style={{fontSize:11,padding:'2px 8px',borderRadius:99,fontWeight:600,background:s==='paye'?'rgba(22,163,74,0.1)':'var(--ink-100)',color:s==='paye'?'#15803d':'var(--ink-500)'}}>{s==='paye'?'✅ Reçu':'📋 À facturer'}</span>
}
function Row({ label, value, bold, dim, accent }) {
  return <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:8}}><span style={{fontSize:12,color:dim?'var(--ink-400)':'var(--ink-600)'}}>{label}</span><span style={{fontSize:13,fontWeight:bold?700:500,color:accent?'var(--brand-800)':'var(--ink-800)',fontVariantNumeric:'tabular-nums'}}>{value}</span></div>
}
function LegendRow({ color, label, value, pct }) {
  return <div style={{display:'flex',alignItems:'center',gap:8}}><div style={{width:10,height:10,borderRadius:2,background:color,flexShrink:0}}/><span style={{fontSize:12,color:'var(--ink-600)',flex:1}}>{label}</span><span style={{fontSize:12,color:'var(--ink-700)',fontVariantNumeric:'tabular-nums'}}>{value}</span>{pct!==undefined&&<span style={{fontSize:11,color:'var(--ink-400)',minWidth:34,textAlign:'right'}}>{pct}%</span>}</div>
}

// ─── COMPOSANTS VISUELS ────────────────────────────────────────────────────────

function FinKpiCard({ label, value, sub, tone, children }) {
  const toneColor = {
    brand: 'var(--brand-800)', ok: '#15803d',
    warn: '#a16207', bad: '#b91c1c', mute: 'var(--ink-500)'
  }[tone] || 'var(--brand-800)'
  return (
    <div className="card kpi">
      <div className="eyebrow" style={{marginBottom:8}}>{label}</div>
      <div className="tnum" style={{fontSize:26,fontWeight:800,color:toneColor,letterSpacing:'-0.02em',lineHeight:1}}>{value}</div>
      {sub && <div style={{fontSize:12,color:'var(--ink-500)',marginTop:6}}>{sub}</div>}
      {children}
    </div>
  )
}

function PillToggle({ options, active, onChange }) {
  return (
    <div className="pill-toggle">
      {options.map(o => (
        <button key={o.key} onClick={() => onChange(o.key)} style={{
          padding:'6px 14px',fontSize:12.5,fontWeight:600,borderRadius:7,
          background: active === o.key ? '#fff' : 'transparent',
          color: active === o.key ? 'var(--brand-800)' : 'var(--ink-500)',
          boxShadow: active === o.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
          transition:'all 150ms',border:0,cursor:'pointer',whiteSpace:'nowrap'
        }}>{o.label}</button>
      ))}
    </div>
  )
}

function ObjectifBar({ label, reel, objectifMontant, cible, agenteId = null, canEdit, onSave }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(String(objectifMontant || ''))
  const pct = objectifMontant > 0 ? Math.min(100, Math.round((reel / objectifMontant) * 100)) : 0

  return (
    <div className="card" style={{padding:'16px 20px'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
        <span className="eyebrow">{label}</span>
        {canEdit && !editing && (
          <button onClick={() => { setVal(String(objectifMontant || '')); setEditing(true) }}
            className="btn btn-ghost" style={{fontSize:11,padding:'3px 8px'}}>
            {objectifMontant > 0 ? 'Modifier' : '+ Objectif'}
          </button>
        )}
      </div>
      <div style={{display:'flex',alignItems:'baseline',gap:8,marginBottom:objectifMontant > 0 ? 10 : 0}}>
        <span className="tnum" style={{fontSize:22,fontWeight:800,color:'var(--brand-800)'}}>{fmt(reel)}</span>
        {objectifMontant > 0 && (
          <span style={{fontSize:12,color:'var(--ink-400)'}}>/ {fmt(objectifMontant)} · {pct}%</span>
        )}
      </div>
      {objectifMontant > 0 && (
        <div className="progress"><span style={{width:`${pct}%`}}/></div>
      )}
      {editing && (
        <div style={{display:'flex',gap:8,alignItems:'center',marginTop:10}}>
          <input
            type="number"
            value={val}
            onChange={e => setVal(e.target.value)}
            placeholder="Objectif annuel €"
            className="input" style={{height:30,fontSize:12,flex:1}}
          />
          <button onClick={() => { onSave(cible, agenteId, val); setEditing(false) }}
            className="btn btn-dark" style={{fontSize:12,padding:'5px 12px'}}>
            OK
          </button>
          <button onClick={() => setEditing(false)} style={{fontSize:13,color:'var(--ink-400)',cursor:'pointer'}}>✕</button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSANT PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────


export default function Finances() {

  // ── STATE ──────────────────────────────────────────────────────────────────

  const [loading, setLoading]                       = useState(true)
  const [saving, setSaving]                         = useState(false)
  const [erreur, setErreur]                         = useState('')
  const [succes, setSucces]                         = useState('')
  const [tab, setTab]                               = useState('synthese')
  const [period, setPeriod]                         = useState('chantier')
  const [scope, setScope]                           = useState('tous')
  const [suiviMode, setSuiviMode]                   = useState('ctp')
  const [dossierOuvert, setDossierOuvert]           = useState(null)
  const [dossiers, setDossiers]                     = useState([])
  const [redevances, setRedevances]                 = useState([])
  const [agentes, setAgentes]                       = useState([])
  const [agenteSelectionnee, setAgenteSelectionnee] = useState(null)
  const [nomFranchisee, setNomFranchisee]           = useState('CTP')
  const [facturesAgente, setFacturesAgente]         = useState([])
  const [objectifs, setObjectifs]                   = useState([])
  const [anneeSelectionnee, setAnneeSelectionnee]   = useState(new Date().getFullYear())
  const [moisOuvert, setMoisOuvert]                 = useState(null)
  const [sfSousOngletCTP, setSfSousOngletCTP]       = useState('mois')
  const [isMobile, setIsMobile]                     = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const handler = (e) => setIsMobile(e.matches)
    setIsMobile(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const router = useRouter()
  const { user, profile, initialized, agenceActive } = useAuth()

  // ── CHARGEMENT ─────────────────────────────────────────────────────────────

  const chargerTout = async () => {
    // Lectures admin-only sur profiles (policy L5a-1) : conditionnées au rôle.
    // Le profile est déjà chargé via useAuth → on connaît le rôle ici (isAdmin, niveau composant).

    const [
      dossiersRes,
      redevancesRes,
      facturesAgenteRes,
      agentesRes,
      adminRes,
      objectifsRes,
    ] = await Promise.all([
      supabase.from('dossiers').select(`
        *,
        referente:profiles!dossiers_referente_id_fkey(id, prenom, nom, role, frais_part_agente_defaut),
        client:clients(civilite, prenom, nom, apporteur_affaires, apporteur_nom, apporteur_pourcentage, apporteur_base),
        devis_artisans(*, artisan:artisans(id, entreprise, partenaire, paiement_direct)),
        suivi_financier(*)
      `).order('created_at', { ascending: false }),
      supabase.from('redevances').select('*').order('annee', { ascending: false }).order('mois', { ascending: false }),
      supabase.from('factures_agente').select('*').order('annee', { ascending: false }).order('mois', { ascending: false }),
      isAdmin
        ? supabase.from('profiles').select('*').eq('role', 'agente').order('prenom')
        : Promise.resolve({ data: [] }),
      isAdmin
        ? supabase.from('profiles').select('prenom, nom').eq('role', 'admin').maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from('objectifs_ca').select('*').eq('annee', new Date().getFullYear()),
    ])

    // Requêtes critiques : sans elles, les montants affichés seraient faux (0 €
    // silencieux). On remonte l'erreur plutôt que d'afficher des chiffres erronés.
    const critiques = {
      'dossiers':        dossiersRes,
      'redevances':      redevancesRes,
      'factures agente': facturesAgenteRes,
      'objectifs':       objectifsRes,
    }
    for (const [nom, res] of Object.entries(critiques)) {
      if (res?.error) throw new Error(`${nom} : ${res.error.message}`)
    }

    setDossiers(dossiersRes.data || [])
    setRedevances(redevancesRes.data || [])
    setFacturesAgente(facturesAgenteRes.data || [])
    setAgentes(agentesRes.data || [])
    setAgenteSelectionnee(prev => prev || (profile?.role === 'agente' ? profile.id : agentesRes.data?.[0]?.id) || null)
    if (adminRes.data) setNomFranchisee(`${adminRes.data.prenom} ${adminRes.data.nom}`)
    setObjectifs(objectifsRes.data || [])
  }

  // ── INIT ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!initialized) return
    if (!user) { router.push('/login'); return }
    if (!profile) return
    setErreur('')
    chargerTout()
      .then(() => setLoading(false))
      .catch((e) => {
        setErreur('Impossible de charger les données financières (' + (e?.message || e) + '). Rechargez la page.')
        setLoading(false)
      })
  }, [initialized, user?.id, profile?.id, router])

  // Agente : périmètre forcé sur ses propres données (pas de sélecteur scope)
  useEffect(() => {
    if (profile?.role === 'agente') setScope('moi')
  }, [profile?.role])

  // ── HELPERS PROFIL ─────────────────────────────────────────────────────────

  const isAdmin     = profile?.role === 'admin'
  const nomReferente = (d) => d.referente ? `${d.referente.prenom} ${d.referente.nom}` : 'Agente'

  // Objectif d'agence sensible à la vue active (4c-1) :
  //  - agenceActive = uuid  → objectif de CETTE agence (discriminé par agence_id) ;
  //  - agenceActive = null  → somme des objectifs d'agence de toute la société
  //    (Consolidé / admin mono / 1 agence ; objectifs_ca chargé société-wide via RLS).
  // La branche 'agente' (et tout autre cible) est INCHANGÉE : discriminée par agente_id.
  const getObjectif = (cible, agenteId = null) => {
    if (cible === 'agence') {
      return agenceActive
        ? (objectifs.find(o => o.cible === 'agence' && o.agence_id === agenceActive)?.montant || 0)
        : objectifs.filter(o => o.cible === 'agence').reduce((s, o) => s + (o.montant || 0), 0)
    }
    return objectifs.find(o => o.cible === cible && o.agente_id === agenteId)?.montant || 0
  }

  // ── CALCUL FINANCIER ───────────────────────────────────────────────────────
  // calculer() : extrait les valeurs depuis lib/finance.js — zéro calcul inline
  // calculerReel() : applique les déclencheurs suivi_financier — une seule source de vérité

  const calculerBase = (d) => {
    const normalized = normalizeDossier(d)
    const f = calculateDossierFinance(normalized)

    const partAgente = f.settings.partAgente

    const referentEstAdmin = d.referente?.role === 'admin'
    const devisActifs       = getActiveDevis(d)
    const devisAcceptes     = getSignedDevis(d)

    // Map devisId → données finance
    const devisFinanceMap = new Map(f.commissions.devis.map(dv => [dv.id, dv]))
    // Map devisId → ligne apporteur
    const apporteurMap    = new Map((f.apporteur.lines || []).map(l => [l.devisId, l]))

    return {
      // Référence brute
      finance: f,
      referentEstAdmin,
      devisActifs,
      devisAcceptes,
      devisFinanceMap,
      apporteurMap,
      partAgenteRate: partAgente,

      // Frais
      fraisHT:       round2(f.frais.fraisHT),
      fraisRoyalties: round2(f.frais.royalties),
      fraisNet:      round2(f.frais.net),
      fraisAgente:   round2(f.frais.parts.agente),

      // Commissions (tous devis actifs)
      comHT:          round2(f.commissions.comHT),
      netCom:         round2(f.commissions.netCom),

      // Honoraires courtage
      courtRoyalties: round2(f.honoraires.courtage.royalties),
      courtNet:       round2(f.honoraires.courtage.net),
      courtAgente:    round2(f.honoraires.courtage.parts.agente),

      // Honoraires AMO solde
      amoRoyalties:   round2(f.honoraires.soldeAmo.royalties),
      amoNet:         round2(f.honoraires.soldeAmo.net),
      amoAgente:      round2(f.honoraires.soldeAmo.parts.agente),

      // Honoraires total
      honTotalNet:    round2(f.honoraires.totalNet),

      // Apporteur client
      apporteurTotalHT: round2(f.apporteur.totalHT),
      apporteurAgente:  round2(f.apporteur.parts.agente),
      apporteurAdmin:   round2(f.apporteur.parts.admin),
      apporteurAgenteReel: round2(f.apporteur.partsReel.agente),
      apporteurAdminReel:  round2(f.apporteur.partsReel.admin),

      // Royalties globales
      royaltiesTotal: round2(f.royalties.total),

      // Gains prévisionnels nets
      gainsAgentePrevi: round2(f.gains.netsPrevi.agente),
      gainsAdminPrevi:  round2(f.gains.netsPrevi.admin),

      // Prévisionnel frais
      fraisNetPrevi:    d.frais_statut !== 'offerts' ? round2(f.frais.net) : 0,

      // Prévisionnel commissions tous devis
      netComTous: round2(f.commissions.netCom),

      // Prévisionnel commissions apporteurs
      comApporteursPrevi: round2(
        f.commissions.devis.filter(dv => dv.isApporteur)
          .reduce((s, dv) => s + dv.netCom, 0)
      ),

      // Prévisionnel honoraires (tous devis actifs)
      honPreviNet:    round2(f.honorairesPrevi.totalNet),

      // Gains prévisionnels complets
      gainsAgentePreviTotal: round2(
        (f.frais.net > 0 && d.frais_statut !== 'offerts' ? f.frais.parts.agente : 0) +
        f.commissions.parts.agente +
        f.honorairesPrevi.parts.agente -
        f.apporteur.parts.agente
      ),
      gainsAdminPreviTotal: round2(
        (f.frais.net > 0 && d.frais_statut !== 'offerts' ? f.frais.net : 0) +
        f.commissions.netCom +
        f.honorairesPrevi.totalNet -
        ((f.frais.net > 0 && d.frais_statut !== 'offerts' ? f.frais.parts.agente : 0) +
        f.commissions.parts.agente +
        f.honorairesPrevi.parts.agente -
        f.apporteur.parts.agente)
      ),
    }
  }
  const calculerReelBase = (d) => {
    const c = calculerBase(d)

    if (c.referentEstAdmin) {
      const fraisReel = d.frais_statut === 'regle' ? c.fraisNet : 0
      const courtageRegle = getSuivi(d, 'honoraires_courtage')?.statut_client === 'regle'
      const amoRegle = d.typologie === 'amo' && getSuivi(d, 'solde_amo')?.statut_client === 'regle'
      // AMO : l'acompte AMO = la part courtage (même encaissement, compté via le courtage).
      // Le solde AMO ajoute la part AMO pleine (finance.js) quand il est réglé. Jamais les deux.
      const soldeAmoNetM = amoRegle ? c.amoNet : 0
      const honReel = round2((courtageRegle ? c.courtNet : 0) + soldeAmoNetM)
      let comReelNet = 0
      for (const dv of c.devisAcceptes) {
        if (dv.artisan?.paiement_direct) continue
        const artId = dv.artisan_id || dv.artisan?.id
        const dvF = c.devisFinanceMap.get(dv.id)
        if (!dvF) continue
        const suivi = getSuivi(d, 'acompte_artisan', artId)
        if (suivi?.statut_illico === 'recu') comReelNet = round2(comReelNet + dvF.netCom)
      }
      const comApporteursReel = round2(
        c.finance.commissions.devis
          .filter(dv => dv.isApporteur && dv.signed)
          .reduce((s, dv) => s + dv.netCom, 0)
      )
      // Réel = coût apporteur sur les acomptes débloqués (finance.js).
      // Admin référent porte tout (part_agente = 0).
      const apporteurRetire = c.apporteurAdminReel

      const gainAdminReel = round2(fraisReel + honReel + comReelNet + comApporteursReel - apporteurRetire)
      return { ...c, fraisReel, fraisAgenteReel: 0, honReel, comReelNet, comApporteursReel, apporteurRembourse: apporteurRetire, gainAgenteReel: 0, gainAdminReel, gainsAgenteReels: 0, soldeAmoNet: soldeAmoNetM, soldeAmoAgente: 0 }
    }

    // Frais — HT net si réglé
    const fraisRegle         = d.frais_statut === 'regle'
    const fraisReel          = fraisRegle ? c.fraisNet : 0
    const fraisRoyaltiesReel = fraisRegle ? c.fraisRoyalties : 0
    const fraisAgenteReel    = fraisRegle ? c.fraisAgente : 0

    // Honoraires — HT net si réglé
    const courtageRegle  = getSuivi(d, 'honoraires_courtage')?.statut_client === 'regle'
    const amoRegle       = d.typologie === 'amo' && getSuivi(d, 'solde_amo')?.statut_client === 'regle'
    // AMO : l'acompte AMO = la part courtage (même encaissement, compté via le courtage).
    // Le solde AMO ajoute la part AMO pleine (finance.js) quand il est réglé. Jamais les deux.
    const honCourtageReel = courtageRegle ? c.courtNet : 0
    const soldeAmoNet    = amoRegle ? c.amoNet : 0
    const soldeAmoAgente = amoRegle ? c.amoAgente : 0
    const honAMOReel     = soldeAmoNet
    const honReel        = round2(honCourtageReel + honAMOReel)
    const royaltiesHonReel = round2(
      (courtageRegle ? c.courtRoyalties : 0) +
      (amoRegle ? c.amoRoyalties : 0)
    )
    const honAgenteReel  = round2(
      (courtageRegle ? c.courtAgente : 0) +
      soldeAmoAgente
    )

    // Commissions — HT net si acompte illiCO débloqué (hors apporteurs artisans)
    let comReelNet        = 0
    let royaltiesComReel  = 0
    let comAgenteReel     = 0

    for (const dv of c.devisAcceptes) {
      if (dv.artisan?.paiement_direct) continue // paiement direct : commission déclenchée dès signé
      const artId      = dv.artisan_id || dv.artisan?.id
      const dvF        = c.devisFinanceMap.get(dv.id)
      if (!dvF) continue
      const suivi      = getSuivi(d, 'acompte_artisan', artId)
      const debloque   = suivi?.statut_illico === 'recu'
      if (debloque) {
        comReelNet       = round2(comReelNet       + dvF.netCom)
        royaltiesComReel = round2(royaltiesComReel + dvF.royaltiesType2)
        comAgenteReel    = round2(comAgenteReel    + dvF.parts.agente)
      }
    }

    // Commissions apporteurs artisans — déclenchées dès devis signé
    let comApporteursReel     = 0
    let comApporteursAgente   = 0
    for (const dv of c.devisAcceptes) {
      if (!dv.artisan?.paiement_direct) continue
      const dvF = c.devisFinanceMap.get(dv.id)
      if (!dvF || !dvF.signed) continue
      comApporteursReel   = round2(comApporteursReel   + dvF.netCom)
      comApporteursAgente = round2(comApporteursAgente + dvF.parts.agente)
    }

    // Apporteur client réel = part agente sur les acomptes débloqués (finance.js).
    const apporteurRembourse = c.apporteurAgenteReel

    const gainAgenteReel = round2(fraisAgenteReel + honAgenteReel + comAgenteReel + comApporteursAgente - apporteurRembourse)
    const gainAdminReel = round2(fraisReel + honReel + comReelNet + comApporteursReel - gainAgenteReel)

    return {
      ...c,
      fraisReel,
      fraisAgenteReel,
      honReel,
      soldeAmoNet,
      soldeAmoAgente,
      comReelNet,
      comApporteursReel,
      apporteurRembourse,
      gainAgenteReel,
      gainAdminReel,
      gainsAgenteReels: gainAgenteReel,
    }
  }

  // ── SUIVI FINANCIER ────────────────────────────────────────────────────────

  const getSuivi = (d, type, artisanId = null) =>
    (d.suivi_financier || []).find(
      s => s.type_echeance === type && (!artisanId || s.artisan_id === artisanId)
    )

  // ───────────────────────────────────────────────────────────────────────────
  // ⚠️ INVARIANT CACHE FINANCE — NE PAS CONTOURNER
  // financeCache mémoïse calculerBase/calculerReelBase par dossier (fonctions
  // PURES de `d`). Il ne se recalcule QUE lorsque la référence `dossiers` change.
  // Donc TOUTE mutation d'un dossier / devis / suivi_financier DOIT passer par
  // chargerTout() (qui fait setDossiers(nouvelArray)). NE JAMAIS patcher `dossiers`
  // en place : sinon le cache — et tous les montants affichés — resteraient PÉRIMÉS.
  // ───────────────────────────────────────────────────────────────────────────
  const financeCache = useMemo(() => {
    const m = new Map()
    for (const d of dossiers) m.set(d.id, { c: calculerBase(d), r: calculerReelBase(d) })
    return m
  }, [dossiers])

  const calculer     = (d) => financeCache.get(d.id)?.c ?? calculerBase(d)
  const calculerReel = (d) => financeCache.get(d.id)?.r ?? calculerReelBase(d)

  // ── ALERTES ────────────────────────────────────────────────────────────────

  const alerte48h = (date) => date && new Date() > new Date(new Date(date).getTime() + 48 * 3600000)
  const alerte7j  = (date) => date && new Date() > new Date(new Date(date).getTime() + 7 * 24 * 3600000)

  // ── FACTURES AGENTE ────────────────────────────────────────────────────────
  const upsertFactureMoisType = async (mois, annee, montant, type, updates) => {
    const agenteId = agenteSelectionnee || profile?.id
    const existing = facturesAgente.find(f => f.mois === mois && f.annee === annee && f.agente_id === agenteId && f.type_facture === type)

    if (existing) {
      await supabase.from('factures_agente').update(updates).eq('id', existing.id)
    } else {
      await supabase.from('factures_agente').insert({
        agente_id: agenteId, mois, annee, montant, type_facture: type, ...updates
      })
    }

    // La synchro redevance suit le CHANGEMENT DE STATUT F2, pas toute écriture sur la ligne.
    // Tout appelant qui doit (dé)cocher la redevance DOIT passer `statut` dans updates.
    // Un upload PDF (facture_path seul, sans statut) ne déclenche donc PAS la synchro — découplage voulu.
    if (type === 'ctp_vers_agente' && 'statut' in updates) {
      const agenteProfile = agentes.find(a => a.id === agenteId)
      if (!agenteProfile?.agence_id) {
        setErreur('Redevance : agence de l\'agente introuvable')
      } else {
        const montantRedevance = agenteProfile?.redevance_mensuelle_ht ?? null
        const { error: redevErr } = await supabase.from('redevances').upsert({
          agente_id: agenteId,
          agence_id: agenteProfile.agence_id,
          annee,
          mois,
          montant_ht: montantRedevance,
          statut: updates.statut === 'paye' ? 'regle' : 'en_attente',
          date_paiement: updates.statut === 'paye' ? new Date().toISOString().split('T')[0] : null,
        }, { onConflict: 'agente_id,annee,mois' })
        if (redevErr) setErreur('Redevance : ' + redevErr.message)
      }
    }

    const { data } = await supabase.from('factures_agente').select('*')
      .order('annee', { ascending: false }).order('mois', { ascending: false })
    setFacturesAgente(data || [])
    await chargerTout()
  }


  // ── LISTES DÉRIVÉES ────────────────────────────────────────────────────────

  const dossiersAgentes = dossiers.filter(d => d.referente?.role === 'agente')
  const mesDossiers     = isAdmin
    ? dossiers.filter(d => d.referente?.role === 'admin')
    : dossiers.filter(d => d.referente?.id === profile?.id)
  const dossiersAgente   = agenteSelectionnee
    ? dossiers.filter(d => d.referente?.id === agenteSelectionnee)
    : dossiersAgentes
  const agenteActuelle   = agentes.find(a => a.id === agenteSelectionnee)
  const redevancesAgente = agenteSelectionnee
    ? redevances.filter(r => r.agente_id === agenteSelectionnee)
    : redevances
  const mesRedevances    = profile?.id ? redevances.filter(r => r.agente_id === profile.id) : redevances

  // ── PÉRIMÈTRE SCOPÉ (défini tôt pour pouvoir scoper les KPI) ──────────────
  const scopedDossiers = isAdmin
    ? (scope === 'tous' ? dossiers
      : scope === 'moi'  ? mesDossiers
      : dossiers.filter(d => d.referente?.id === scope))
    : mesDossiers

// ── AGRÉGATION PAR PÉRIODE ─────────────────────────────────────────────────

  const getKeyFromDate = (dateStr, isAnnee = false) => {
    if (!dateStr) return null
    const dt = new Date(dateStr)
    if (isNaN(dt)) return null
    return isAnnee
      ? String(dt.getFullYear())
      : `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
  }

  const emptyAgg = () => ({
    fraisNet: 0, courtNet: 0, amoNet: 0,
    comNet: 0, comApporteursNet: 0,
    honReel: 0, comReelNet: 0, comApporteursReel: 0,
    gainsAgenteReels: 0, gainAdminReel: 0,
    comAgenteNet: 0, comApporteursAgenteNet: 0,
    fraisAgenteNet: 0, honAgenteNet: 0,
    apporteurCoutTotalNet: 0, apporteurPartAgenteNet: 0,
    dossierIds: new Set(),
  })

  const agrégerParPaiement = (listeDossiers, isAnnee = false) => {
  const map = {}

  const addToKey = (key, champ, montant, dossierId) => {
    if (!key) return
    if (!map[key]) map[key] = emptyAgg()
    map[key][champ] = round2((map[key][champ] || 0) + montant)
    map[key].dossierIds.add(dossierId)
  }

  listeDossiers.forEach(d => {
    const c = calculerReel(d)
    const suivi = d.suivi_financier || []

    // Frais consultation
    const suiviFrais = suivi.find(s => s.type_echeance === 'frais_consultation')
      if (c.fraisReel > 0) {
        // Priorité : date_paiement du suivi → date_signature_contrat comme fallback
        const dateFrais = suiviFrais?.date_paiement || d.date_signature_contrat
        const key = getKeyFromDate(dateFrais, isAnnee)
        addToKey(key, 'fraisNet', c.fraisReel, d.id)
        addToKey(key, 'fraisAgenteNet', c.fraisAgenteReel ?? c.fraisAgente, d.id)
      }

      // Honoraires courtage
      const suiviCourtage = suivi.find(s => s.type_echeance === 'honoraires_courtage' && s.statut_client === 'regle')
      if (c.courtNet > 0 && suiviCourtage) {
        const dateCourtage = suiviCourtage?.date_paiement || d.date_signature_contrat
        const key = getKeyFromDate(dateCourtage, isAnnee)
        addToKey(key, 'courtNet', c.courtNet, d.id)
        addToKey(key, 'honAgenteNet', c.courtAgente, d.id)
      }

      // Solde AMO — part AMO pleine (finance.js), gated par solde_amo réglé.
      // L'acompte AMO n'ajoute PLUS son montant : c'est la part courtage, déjà
      // comptée par le bloc « Honoraires courtage » ci-dessus (même encaissement).
      const suiviAmo = suivi.find(s => s.type_echeance === 'solde_amo' && s.statut_client === 'regle')
      if (c.soldeAmoNet > 0 && suiviAmo) {
        const dateAmo = suiviAmo?.date_paiement || d.date_fin_chantier
        const key = getKeyFromDate(dateAmo, isAnnee)
        addToKey(key, 'amoNet', c.soldeAmoNet, d.id)
        addToKey(key, 'honAgenteNet', c.soldeAmoAgente, d.id)
      }

      // Commissions artisans normaux
      const devisActifs = getSignedDevis(d)
      for (const dv of devisActifs) {
        if (dv.artisan?.paiement_direct) continue
        const artId = dv.artisan_id || dv.artisan?.id
        const suiviAcompte = suivi.find(s => s.type_echeance === 'acompte_artisan' && s.artisan_id === artId && s.statut_illico === 'recu')
        if (!suiviAcompte) continue
        const dvF = c.devisFinanceMap.get(dv.id)
        if (!dvF) continue
        const key = getKeyFromDate(suiviAcompte.date_deblocage || suiviAcompte.date_paiement, isAnnee)
        addToKey(key, 'comNet', dvF.netCom, d.id)
        addToKey(key, 'comAgenteNet', dvF.parts.agente, d.id)
      }

      // Commissions paiement direct (déclenchées dès signé — date_signature du devis)
      for (const dv of devisActifs) {
        if (!dv.artisan?.paiement_direct) continue
        const dvF = c.devisFinanceMap.get(dv.id)
        if (!dvF || !dvF.signed) continue
        const key = getKeyFromDate(dv.date_signature, isAnnee)
        addToKey(key, 'comApporteursNet', dvF.netCom, d.id)
        addToKey(key, 'comApporteursAgenteNet', dvF.parts.agente, d.id)
      }

            // Apporteur client remboursé par ligne
      for (const sf of suivi.filter(s =>
        s.type_echeance === 'apporteur_agente' &&
        s.statut_ctp === 'rembourse' &&
        s.date_paiement
      )) {
        const key = getKeyFromDate(sf.date_paiement, isAnnee)
        const finance = c.finance?.apporteur?.lines || []
        // Routage selon le mode (un seul mode par dossier, ensembles exclusifs) :
        // - mode total (sf.artisan_id NULL) → l'unique ligne finance 'total_chantier_ht'.
        // - par_devis (artisan_id renseigné) → la ligne du devis de cet artisan (inchangé).
        const ligne = sf.artisan_id === null
          ? finance.find(l => l.type === 'total_chantier_ht')
          : finance.find(l => {
              const dv = (d.devis_artisans || []).find(dv => dv.id === l.devisId)
              return (dv?.artisan_id || dv?.artisan?.id) === sf.artisan_id
            })
        if (ligne) {
          // Côté CTP : coût Kiosque entier (CTP paie tout). Côté agente : sa PART réelle (ce qu'elle rembourse à CTP).
          addToKey(key, 'apporteurCoutTotalNet', ligne.totalHT, d.id)
          addToKey(key, 'apporteurPartAgenteNet', ligne.agenteReel, d.id)
        }
      }
    })

    // Calculer gains agente/admin par bucket
    Object.values(map).forEach(agg => {
      agg.honReel = round2(agg.courtNet + agg.amoNet)
      agg.comReelNet = agg.comNet
      agg.comApporteursReel = agg.comApporteursNet
      agg.gainsAgenteReels = round2(agg.fraisAgenteNet + agg.honAgenteNet + agg.comAgenteNet + agg.comApporteursAgenteNet)
      agg.gainAdminReel = round2(agg.fraisNet + agg.honReel + agg.comReelNet + agg.comApporteursReel - agg.gainsAgenteReels - agg.apporteurCoutTotalNet)    })

    return Object.entries(map)
      .map(([key, agg]) => [key, { ...agg, dossierIds: Array.from(agg.dossierIds) }])
      .sort((a, b) => b[0].localeCompare(a[0]))
  }


  // ── TOTAUX GLOBAUX ─────────────────────────────────────────────────────────

  const anneeEnCours = new Date().getFullYear()
  const rowsReelAnneeEnCours = agrégerParPaiement(dossiers, false)
  const rowsReelScoped       = agrégerParPaiement(scopedDossiers, false)
  const chantiersAnneeEnCours = dossiers.filter(d => {
    const date = d.date_fin_chantier || d.date_demarrage_chantier || d.date_signature_contrat || d.created_at
    return date && new Date(date).getFullYear() === anneeEnCours
  }).length

  const totalGainsAgentesReels = (() => {
    const keysAnnee = rowsReelScoped
      .filter(([k]) => k.startsWith(String(anneeEnCours)))
      .map(([, agg]) => agg)
    return round2(keysAnnee.reduce((s, agg) => s + (agg.gainsAgenteReels || 0), 0))
  })()

  // 4c-2 — Redevances alignées sur le périmètre des produits du CA net (KPI uniquement).
  // agente : ses redevances (inchangé) · admin Consolidé (agenceActive null) : toutes
  // les redevances société (inchangé) · admin vue agence : celles de l'agence active
  // (r.agence_id, NOT NULL). NE concerne QUE totalNetCTP/KPI — le Suivi reste sur redevances brut (4c-3).
  const redevancesScoped = useMemo(() => {
    if (!isAdmin) return mesRedevances
    return agenceActive ? redevances.filter(r => r.agence_id === agenceActive) : redevances
  }, [isAdmin, agenceActive, redevances, mesRedevances])

  const totalNetCTP = (() => {
    const keysAnnee = rowsReelScoped.filter(([k]) => k.startsWith(String(anneeEnCours)))
    const reelProduits = keysAnnee.reduce((s, [, agg]) => s + round2((agg.fraisNet||0) + (agg.comReelNet||0) + (agg.honReel||0) + (agg.comApporteursReel||0)), 0)
    const reelRedev = redevancesScoped.filter(r => r.statut === 'regle' && r.annee === anneeEnCours).reduce((s, r) => s + (r.montant_ht || 0), 0)
    const reelCharges = keysAnnee.reduce((s, [, agg]) => s + (agg.gainsAgenteReels || 0), 0)
    return round2(reelProduits + reelRedev - reelCharges)
  })()

  // ── PÉRIMÈTRE SCOPÉ ────────────────────────────────────────────────────────
  // scopedDossiers est défini plus haut (avant les KPI réels)

  const scopedKpi = useMemo(() => {
    const totPreviNet  = scopedDossiers.reduce((s, d) => s + calculer(d).gainsAdminPreviTotal + calculer(d).gainsAgentePreviTotal, 0)
    const totComHT     = scopedDossiers.reduce((s, d) => s + calculer(d).comHT, 0)
    const totFraisHT   = scopedDossiers.reduce((s, d) => s + calculer(d).fraisHT, 0)
    const totRoyalties = scopedDossiers.reduce((s, d) => s + calculer(d).royaltiesTotal, 0)
    const objectifAnnuel = getObjectif('agence')
    const pctObjectif    = objectifAnnuel > 0 ? Math.round(totalNetCTP / objectifAnnuel * 100) : 0
    return { totPreviNet, totComHT, totFraisHT, totRoyalties, objectifAnnuel, pctObjectif }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedDossiers, objectifs, agenceActive])
  const { totPreviNet, totComHT, totFraisHT, totRoyalties, objectifAnnuel, pctObjectif } = scopedKpi


  // ─────────────────────────────────────────────────────────────────────────────
  // COMPOSANTS DE RENDU
  // ─────────────────────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────────────────
  // DÉTAIL DOSSIER & TABLEAU FINANCE
  // ─────────────────────────────────────────────────────────────────────────────

  const renderDossierDetail = (d, isReel) => {
    const c = calculer(d)
    const r = calculerReel(d)
    const devisAcc = c.devisAcceptes || []
    const netPrevi = round2(c.gainsAdminPreviTotal + c.gainsAgentePreviTotal)
    const netReel  = round2(r.gainAdminReel + r.gainsAgenteReels)
    const value    = isReel ? netReel : netPrevi
    const labelNet = isReel ? 'Encaissé net' : 'Prévi net'
    const partAgenteRate = c.partAgenteRate
    const partAdminRate  = 1 - partAgenteRate
    const gainAgente = isReel ? r.gainAgenteReel : c.gainsAgentePrevi
    const gainAdmin  = isReel ? r.gainAdminReel  : c.gainsAdminPrevi

    return (
      <div className="detail-expansion" style={{borderTop:'1px solid var(--ink-100)', padding:'14px 22px 18px', background:'var(--surface-2)'}}>
        <div style={{display:'grid', gridTemplateColumns:'2fr 1fr', gap:18, alignItems:'flex-start'}}>

          {/* ── Détail des devis acceptés ── */}
          <div>
            <div className="eyebrow" style={{marginBottom:10}}>Détail des devis acceptés</div>
            {devisAcc.length === 0 ? (
              <div style={{padding:'14px 12px', background:'#fff', borderRadius:10, border:'1px solid var(--ink-200)', fontSize:12.5, color:'var(--ink-400)', textAlign:'center'}}>
                Aucun devis signé
              </div>
            ) : (
              <div className="table-scroll" style={{background:'#fff', borderRadius:10, border:'1px solid var(--ink-200)', overflow:'hidden'}}>
                <table style={{width:'100%', borderCollapse:'collapse', fontSize:12.5}}>
                  <thead>
                    <tr style={{color:'var(--ink-400)', fontWeight:600, background:'var(--surface-2)'}}>
                      <td style={{padding:'8px 12px'}}>Artisan</td>
                      <td style={{padding:'8px 12px', textAlign:'right'}}>HT</td>
                      <td style={{padding:'8px 12px', textAlign:'right'}}>%</td>
                      <td style={{padding:'8px 12px', textAlign:'right'}}>Commission HT</td>
                      <td style={{padding:'8px 12px', textAlign:'right'}}>Statut</td>
                    </tr>
                  </thead>
                  <tbody>
                    {devisAcc.map(dv => {
                      const artId = dv.artisan_id || dv.artisan?.id
                      const dvF   = c.devisFinanceMap.get(dv.id)
                      const pct   = dvF?.commissionPct ? parseFloat((dvF.commissionPct * 100).toFixed(1)) : 0
                      const comHT = dvF?.comHT || 0
                      const sf    = getSuivi(d, 'acompte_artisan', artId)
                      const estPaiementDirect = dv.artisan?.paiement_direct
                      const estPartenaire     = dv.artisan?.partenaire
                      let badge
                      if (isReel) {
                        const debloque = estPaiementDirect ? true : (sf?.statut_illico === 'recu')
                        badge = debloque
                          ? <span style={{fontSize:10.5, fontWeight:700, padding:'2px 8px', borderRadius:99, background:'rgba(22,163,74,0.12)', color:'#15803d'}}>Encaissé</span>
                          : <span style={{fontSize:10.5, fontWeight:700, padding:'2px 8px', borderRadius:99, background:'rgba(245,158,11,0.13)', color:'#a16207'}}>En attente</span>
                      } else {
                        badge = <span style={{fontSize:10.5, fontWeight:700, padding:'2px 8px', borderRadius:99, background:'rgba(0,148,212,0.10)', color:'var(--brand-800)'}}>Engagé</span>
                      }
                      return (
                        <tr key={dv.id} style={{borderTop:'1px solid var(--ink-100)'}}>
                          <td style={{padding:'10px 12px', fontWeight:600, color:'var(--ink-800)'}}>
                            🔨 {dv.artisan?.entreprise || '—'}
                            {estPartenaire && <span style={{marginLeft:6, fontSize:10, padding:'1px 6px', borderRadius:99, background:'rgba(245,158,11,0.15)', color:'#b45309'}}>Partenaire</span>}
                          </td>
                          <td className="tnum" style={{padding:'10px 12px', textAlign:'right', color:'var(--ink-700)'}}>{fmt(dv.montant_ht)}</td>
                          <td className="tnum" style={{padding:'10px 12px', textAlign:'right', color:'var(--ink-500)'}}>{pct}%</td>
                          <td className="tnum" style={{padding:'10px 12px', textAlign:'right', fontWeight:700, color:'var(--brand-800)'}}>{fmt(comHT)}</td>
                          <td style={{padding:'10px 12px', textAlign:'right'}}>{badge}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <button onClick={() => router.push(`/chantiers/${d.id}`)} className="btn btn-ghost" style={{fontSize:12, marginTop:10}}>
              → Voir la fiche chantier
            </button>
          </div>

          {/* ── Répartition ── */}
          <div style={{padding:14, background:'#fff', borderRadius:10, border:'1px solid var(--ink-200)'}}>
            <div className="eyebrow" style={{marginBottom:10}}>Répartition</div>
            <div style={{display:'flex', flexDirection:'column', gap:8, fontSize:12.5}}>
              <RepartRow label="Frais consultation HT" value={fmt(isReel ? r.fraisReel : c.fraisNet)} />
              <RepartRow label="Commissions HT" value={fmt(c.comHT)} />
              {c.honTotalNet > 0 && <RepartRow label="Honoraires" value={fmt(isReel ? r.honReel : c.honTotalNet)} />}
              <RepartRow label="Royalties" value={`-${fmt(c.royaltiesTotal)}`} dim />
              {c.apporteurTotalHT > 0 && (
                <RepartRow label="Apporteur client" value={`-${fmt(isReel ? r.apporteurRembourse : (c.referentEstAdmin ? c.apporteurAdmin : c.apporteurAgente))}`} accent="warn" />
              )}
              <div style={{height:1, background:'var(--ink-200)', margin:'4px 0'}}/>
              <RepartRow label={labelNet} value={fmt(value)} bold />
              <div style={{height:1, background:'var(--ink-200)', margin:'4px 0'}}/>
              <RepartRow label={`${c.referentEstAdmin ? 'Franchisée' : nomFranchisee} (${Math.round(partAdminRate * 100)}%)`} value={fmt(gainAdmin)} />
              {partAgenteRate > 0 && (
                <RepartRow label={`${nomReferente(d)} (${Math.round(partAgenteRate * 100)}%)`} value={fmt(gainAgente)} accent="brand" />
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const RepartRow = ({ label, value, bold, dim, accent }) => {
    const color = accent === 'brand' ? 'var(--brand-800)'
      : accent === 'warn' ? '#c2410c'
      : dim ? 'var(--ink-400)'
      : bold ? 'var(--ink-900)'
      : 'var(--ink-900)'
    return (
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <span style={{color: dim ? 'var(--ink-400)' : 'var(--ink-500)', fontSize:12}}>{label}</span>
        <span className="tnum" style={{ fontWeight: bold ? 800 : 600, fontSize: bold ? 15 : 12.5, color }}>{value}</span>
      </div>
    )
  }

  const renderFinanceTable = (listeDossiers, isReel) => {
    const totals = listeDossiers.reduce((acc, d) => {
      const c = calculer(d)
      const r = calculerReel(d)
      return {
        fraisHT:   round2(acc.fraisHT   + c.fraisHT),
        comHT:     round2(acc.comHT     + c.comHT),
        royalties: round2(acc.royalties + c.royaltiesTotal),
        net:       round2(acc.net + (isReel
          ? (r.gainAdminReel + r.gainsAgenteReels)
          : (c.gainsAdminPreviTotal + c.gainsAgentePreviTotal))),
      }
    }, { fraisHT: 0, comHT: 0, royalties: 0, net: 0 })

    return (
      <div className="card" style={{padding:0,overflow:'hidden'}}>
        <div style={{padding:'14px 22px',display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid var(--ink-200)'}}>
          <div>
            <div style={{fontSize:16,fontWeight:700,color:'var(--ink-900)'}}>
              {isReel ? 'F2 — Encaissements réels' : 'F1 — Engagements prévisionnels'} · {listeDossiers.length} dossiers
            </div>
            <div className="eyebrow" style={{marginTop:4}}>
              {period === 'chantier' ? 'Détail par chantier' : period === 'mois' ? 'Agrégation par mois de paiement' : 'Agrégation annuelle'}
            </div>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button className="btn btn-ghost" style={{padding:'6px 10px',fontSize:12}}>▼</button>
            <button className="btn btn-ghost" style={{padding:'6px 10px',fontSize:12}}>📄 CSV</button>
          </div>
        </div>
        <div className="table-scroll">
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead style={{position:'sticky',top:0,zIndex:1}}>
            <tr style={{borderBottom:'1px solid var(--ink-200)'}}>
              <Th>Dossier</Th>
              <Th>Référente</Th>
              <Th>Statut</Th>
              <Th right>Frais HT</Th>
              <Th right>Commissions HT</Th>
              <Th right>Royalties</Th>
              <Th right>Net {isReel ? 'réel' : 'prévisionnel'}</Th>
              <Th right>Avancement</Th>
              <Th right></Th>
            </tr>
          </thead>
          <tbody>
            {listeDossiers.map(d => {
              const c       = calculer(d)
              const r       = calculerReel(d)
              const netPrevi = round2(c.gainsAdminPreviTotal + c.gainsAgentePreviTotal)
              const netReel  = round2(r.gainAdminReel + r.gainsAgenteReels)
              const net      = isReel ? netReel : netPrevi
              const avancement = netPrevi > 0 ? Math.min(100, Math.round(netReel / netPrevi * 100)) : 0
              const isOpen   = dossierOuvert === d.id
              const nbAlertes = [
                d.contrat_signe && d.frais_statut !== 'regle' && alerte48h(d.date_signature_contrat),
                ...c.devisAcceptes.map(dv => {
                  const artId = dv.artisan_id || dv.artisan?.id
                  return dv.date_signature && alerte7j(dv.date_signature) && getSuivi(d, 'acompte_artisan', artId)?.statut_client !== 'regle'
                }),
                d.date_fin_chantier && d.typologie === 'amo' && alerte48h(d.date_fin_chantier) && getSuivi(d, 'solde_amo')?.statut_client !== 'regle',
              ].filter(Boolean).length
              return (
                <React.Fragment key={d.id}>
                  <tr onClick={() => setDossierOuvert(isOpen ? null : d.id)}
                    style={{cursor:'pointer',borderTop:'1px solid var(--ink-100)',background:isOpen?'var(--brand-50)':'transparent'}}
                    className="row-hover">
                    <Td>
                      <div style={{display:'flex',flexDirection:'column',gap:2}}>
                        <span style={{fontSize:11.5,color:'var(--brand-800)',fontWeight:700,fontVariantNumeric:'tabular-nums'}}>{d.reference}</span>
                        <span style={{fontSize:12,color:'var(--ink-600)'}}>{d.client?.prenom} {d.client?.nom}</span>
                        <span style={{fontSize:10,padding:'1px 6px',borderRadius:99,background:'var(--ink-100)',color:'var(--ink-500)',fontWeight:600,alignSelf:'flex-start'}}>{d.typologie}</span>
                      </div>
                    </Td>
                    <Td>
                      <div style={{display:'inline-flex',alignItems:'center',gap:6}}>
                        <Avatar name={nomReferente(d)} size={22}/>
                        <span style={{fontSize:12,color:'var(--ink-700)'}}>{d.referente?.prenom || nomReferente(d)}</span>
                      </div>
                    </Td>
                    <Td>
                      <span style={{fontSize:11,padding:'2px 8px',borderRadius:99,fontWeight:600,
                        background:d.statut==='annule'?'rgba(220,38,38,0.1)':d.statut==='termine'?'rgba(22,163,74,0.1)':'rgba(0,87,142,0.1)',
                        color:d.statut==='annule'?'#b91c1c':d.statut==='termine'?'#15803d':'var(--brand-700)'}}>
                        {d.statut === 'annule' ? 'Annulé' : d.statut === 'termine' ? 'Terminé' : 'En cours'}
                      </span>
                      {nbAlertes > 0 && <span style={{fontSize:10,marginLeft:4,color:'#b91c1c'}}>⚠️ {nbAlertes}</span>}
                    </Td>
                    <Td right mono>{fmt(c.fraisHT)}</Td>
                    <Td right mono>{fmt(c.comHT)}</Td>
                    <Td right mono dim>{fmt(c.royaltiesTotal)}</Td>
                    <Td right mono bold accent={net > 0}>{fmt(net)}</Td>
                    <Td right>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <div style={{width:60,height:4,borderRadius:2,background:'var(--ink-100)',overflow:'hidden'}}>
                          <div style={{height:'100%',borderRadius:2,background:'var(--brand-500)',width:`${avancement}%`}}/>
                        </div>
                        <span style={{fontSize:11,color:'var(--ink-400)',minWidth:28}}>{avancement}%</span>
                      </div>
                    </Td>
                    <Td right><span style={{color:'var(--ink-300)',fontSize:11}}>{isOpen ? '▲' : '▼'}</span></Td>
                  </tr>
                  {isOpen && !isMobile && (
                    <tr><td colSpan={9} style={{padding:0,borderTop:'1px solid var(--ink-100)'}}>
                      {renderDossierDetail(d, isReel)}
                    </td></tr>
                  )}
                </React.Fragment>
              )
            })}
            {listeDossiers.length === 0 && (
              <tr><td colSpan={9} style={{textAlign:'center',color:'var(--ink-400)',fontSize:13,padding:'32px 0'}}>Aucun chantier</td></tr>
            )}
          </tbody>
          {listeDossiers.length > 0 && (
            <tfoot style={{background:'var(--surface-2)',borderTop:'2px solid var(--ink-200)'}}>
              <tr>
                <td colSpan={3} style={{padding:'12px 16px',fontSize:12,fontWeight:700,color:'var(--ink-600)'}}>Total ({listeDossiers.length})</td>
                <td style={{padding:'12px 16px',textAlign:'right',fontSize:13,fontWeight:700,fontVariantNumeric:'tabular-nums',color:'var(--ink-700)'}}>{fmt(totals.fraisHT)}</td>
                <td style={{padding:'12px 16px',textAlign:'right',fontSize:13,fontWeight:700,fontVariantNumeric:'tabular-nums',color:'var(--ink-700)'}}>{fmt(totals.comHT)}</td>
                <td style={{padding:'12px 16px',textAlign:'right',fontSize:13,fontWeight:700,fontVariantNumeric:'tabular-nums',color:'var(--ink-400)'}}>{fmt(totals.royalties)}</td>
                <td style={{padding:'12px 16px',textAlign:'right',fontSize:13,fontWeight:700,fontVariantNumeric:'tabular-nums',color:'var(--brand-800)'}}>{fmt(totals.net)}</td>
                <td colSpan={2}/>
              </tr>
            </tfoot>
          )}
        </table>
        </div>
        {/* Sur mobile, on rend le détail du dossier ouvert HORS du tableau
            scrollable, en pleine largeur viewport, pour que la "Répartition"
            soit entièrement lisible sans scroll horizontal interne. */}
        {isMobile && (() => {
          const d = listeDossiers.find(d => d.id === dossierOuvert)
          if (!d) return null
          return (
            <div style={{borderTop:'1px solid var(--ink-200)'}}>
              {renderDossierDetail(d, isReel)}
            </div>
          )
        })()}
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TABLEAUX PAR PÉRIODE
  // ─────────────────────────────────────────────────────────────────────────────

  const renderTableauPeriode = (listeDossiers, rows, colLabel, colonnes, getMontant, getDossierMontant) => (
    <div className="card" style={{overflow:'hidden'}}>
      <table className="w-full text-sm">
        <thead style={{background:'var(--surface-2)',borderBottom:'1px solid var(--ink-200)'}}>
          <tr>
            <th style={{textAlign:'left',padding:'12px 16px',fontSize:11,fontWeight:700,color:'var(--ink-500)',textTransform:'uppercase',whiteSpace:'nowrap'}}>{colLabel}</th>
            {colonnes.map(c => <th key={c.key} style={{textAlign:'right',padding:'12px 16px',fontSize:11,fontWeight:700,color:'var(--ink-500)',textTransform:'uppercase',whiteSpace:'nowrap'}}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map(([key, agg]) => {
            const label = (() => {
              if (!key.includes('-')) return key
              const [a, m] = key.split('-')
              return `${MOIS[parseInt(m)]} ${a}`
            })()
            const dossierspériode = listeDossiers.filter(d => agg.dossierIds?.includes(d.id))
            return (
              <React.Fragment key={key}>
                {/* Ligne période */}
                <tr className="bg-gray-50 border-t-2 border-gray-200">
                  <td className="px-3 py-2 font-bold text-gray-800">{label}</td>
                  {colonnes.map(col => {
                    const val = getMontant(agg, col.key)
                    if (col.type === 'neg') return <td key={col.key} className="px-3 py-2 text-right text-red-400 text-sm font-bold">{val > 0 ? `— ${fmt(val)}` : '—'}</td>
                    if (col.type === 'total') return <td key={col.key} className={`px-3 py-2 text-right text-sm font-bold ${(val || 0) >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmt(val)}</td>
                    return <td key={col.key} className="px-3 py-2 text-right text-sm font-bold text-gray-700">{fmt(val)}</td>
                  })}
                </tr>
                {/* Lignes dossiers */}
                {dossierspériode.map(d => {
                  const nomClient = d.client ? `${d.client.prenom} ${d.client.nom}` : '—'
                  return (
                    <tr key={d.id} className="hover:bg-blue-50 border-t border-gray-100">
                      <td className="px-3 py-1.5 text-gray-500">
                        <span className="text-gray-300 mr-2">└</span>
                        <span className="font-medium text-blue-800 text-xs">{d.reference}</span>
                        <span className="text-gray-500 text-xs ml-2">— {nomClient}</span>
                      </td>
                      {colonnes.map(col => {
                        const val = getDossierMontant(d, col.key, key)
                        if (col.type === 'neg') return <td key={col.key} className="px-3 py-1.5 text-right text-red-300 text-xs">{val > 0 ? `— ${fmt(val)}` : '—'}</td>
                        if (col.type === 'total') return <td key={col.key} className={`px-3 py-1.5 text-right text-xs font-medium ${(val || 0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmt(val)}</td>
                        return <td key={col.key} className="px-3 py-1.5 text-right text-xs text-gray-500">{fmt(val)}</td>
                      })}
                    </tr>
                  )
                })}
              </React.Fragment>
            )
          })}
          {rows.length === 0 && <tr><td colSpan={colonnes.length + 1} className="px-3 py-8 text-center text-gray-400">Aucune donnée</td></tr>}
        </tbody>
        <tfoot className="bg-gray-50 border-t-2 border-gray-300 font-bold">
          <tr>
            <td className="px-3 py-2">Total</td>
            {colonnes.map(col => {
              const total = rows.reduce((s, [, agg]) => s + (getMontant(agg, col.key) || 0), 0)
              if (col.type === 'neg') return <td key={col.key} className="px-3 py-2 text-right text-red-400 text-sm font-bold">— {fmt(total)}</td>
              if (col.type === 'total') return <td key={col.key} className={`px-3 py-2 text-right text-sm font-bold ${total >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmt(total)}</td>
              return <td key={col.key} className="px-3 py-2 text-right text-sm">{fmt(total)}</td>
            })}
          </tr>
        </tfoot>
      </table>
    </div>
  )

  // ── TOUS LES CHANTIERS par période (admin) ─────────────────────────────────

  const renderTousPeriode = (listeDossiers, rows, colLabel) => {
    const colonnes = [
      { label: 'Frais net',    key: 'fraisNet',          type: 'normal' },
      { label: 'Com. net',     key: 'comNet',             type: 'normal' },
      { label: 'Com. apport.', key: 'comApporteursNet',   type: 'normal' },
      { label: 'Hon. net',     key: 'honReel',            type: 'normal' },
      { label: 'Apporteur',    key: 'apporteurCoutTotalNet', type: 'neg' },
      { label: nomFranchisee,  key: 'gainAdminReel',      type: 'total'  },
    ]
    const getDossierMontant = (d, key, periodKey) => {
      const agg = agrégerParPaiement([d], periodKey?.includes('-') ? false : true)
        .find(([k]) => k === periodKey)?.[1]
      if (!agg) return 0
      return agg[key] || 0
    }
    return renderTableauPeriode(listeDossiers, rows, colLabel, colonnes, (agg, key) => agg[key] || 0, getDossierMontant)
  }

  // ── GRAPHIQUE CTP ──────────────────────────────────────────────────────────
  function SuiviCTPChart({ labels, produitsData, chargesData, netData, chartId }) {
    useEffect(() => {
      if (typeof window === 'undefined' || typeof Chart === 'undefined') return
      const el = document.getElementById(chartId)
      if (!el) return
      if (el._chartInstance) el._chartInstance.destroy()
      el._chartInstance = new Chart(el, {
        data: {
          labels,
          datasets: [
            { type: 'bar', label: 'Gains', data: produitsData, backgroundColor: '#3B7DD8', borderRadius: 3, order: 2 },
            { type: 'bar', label: 'Charges', data: chargesData, backgroundColor: '#E24B4A', borderRadius: 3, order: 2 },
            { type: 'line', label: 'Résultats', data: netData, borderColor: '#1F5FA6', backgroundColor: 'rgba(31,95,166,0.06)', borderWidth: 2, borderDash: [4, 3], pointRadius: 4, pointBackgroundColor: '#1F5FA6', tension: 0.3, order: 1 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => ctx.dataset.label + ' : ' + Math.abs(ctx.parsed.y).toLocaleString('fr-FR') + ' €' } }
          },
          scales: {
            x: { stacked: false, grid: { display: false }, ticks: { font: { size: 11 }, color: '#888', maxRotation: 30, autoSkip: false } },
            y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 }, color: '#888', callback: v => Math.abs(v).toLocaleString('fr-FR') + ' €' } }
          }
        }
      })
      return () => { if (el._chartInstance) { el._chartInstance.destroy(); el._chartInstance = null } }
    }, [labels, produitsData, chargesData, netData, chartId])

    return (
      <div className="card" style={{padding:20}}>
        <div className="flex gap-4 mb-4 flex-wrap">
          {[
            { color: '#3B7DD8', label: 'Gains encaissés' },
            { color: '#E24B4A', label: 'Charges' },
            { color: '#1F5FA6', label: 'Résultat', dashed: true },
          ].map(({ color, label, dashed }) => (
            <div key={label} className="flex items-center gap-2">
              <div style={{ width: 10, height: 10, borderRadius: 2, background: dashed ? 'transparent' : color, border: dashed ? `2px dashed ${color}` : 'none' }} />
              <span className="text-xs text-gray-500">{label}</span>
            </div>
          ))}
        </div>
        <div style={{ position: 'relative', width: '100%', height: 220 }}>
          <canvas id={chartId} role="img" aria-label="Graphique produits et charges CTP par période" />
        </div>
      </div>
    )
  }
  
  // ── SUIVI FINANCIER (Agence et CTP) ──────────────────────────────────────

  const renderSuiviFinancier = (mode) => {
    const isCTP = mode === 'ctp'
    const rowsReel = agrégerParPaiement(dossiers, false)
    const objectifMensuel = round2(getObjectif('agence') / 12)
    const getReelNet = (r, redev) => {
      const brut = round2((r.fraisNet||0) + (r.comReelNet||0) + (r.honReel||0) + (r.comApporteursReel||0) + redev)
      if (isCTP) return round2(brut - (r.gainsAgenteReels||0) - (r.apporteurCoutTotalNet||0))
      return brut
    }
    const crPourCle = (cle) => {
      const mapPrevi = {}
      dossiers.forEach(d => {
        const key = getKeyFromDate(d.date_signature_contrat || d.created_at, false)
        if (!key) return
        if (!mapPrevi[key]) mapPrevi[key] = { frais: 0, com: 0, comApport: 0, hon: 0, partAgentes: 0, apporteur: 0, royalties: 0 }
        const c = calculer(d)
        mapPrevi[key].frais       = round2(mapPrevi[key].frais       + c.fraisNetPrevi)
        mapPrevi[key].com         = round2(mapPrevi[key].com         + c.netComTous)
        mapPrevi[key].comApport   = round2(mapPrevi[key].comApport   + c.comApporteursPrevi)
        mapPrevi[key].hon         = round2(mapPrevi[key].hon         + c.honPreviNet)
        mapPrevi[key].partAgentes = round2(mapPrevi[key].partAgentes + c.gainsAgentePreviTotal)
        mapPrevi[key].apporteur   = round2(mapPrevi[key].apporteur   + c.apporteurTotalHT)
        mapPrevi[key].royalties   = round2(mapPrevi[key].royalties   + c.royaltiesTotal)
      })
      const [annee, mois] = cle.split('-')
      const redevMois = redevances.filter(r => r.statut === 'regle' && r.annee === parseInt(annee) && r.mois === parseInt(mois)).reduce((s, r) => s + (r.montant_ht || 0), 0)
      const p = mapPrevi[cle] || {}
      const r = rowsReel.find(([k]) => k === cle)?.[1] || {}
      const previProduits = round2((p.frais||0) + (p.com||0) + (p.hon||0) + (p.comApport||0) + (isCTP ? redevMois : 0))
      const previCharges  = isCTP ? round2((p.partAgentes||0) + (p.apporteur||0) + (p.royalties||0)) : 0
      const previNet      = round2(previProduits - previCharges)
      const reelProduits  = round2((r.fraisNet||0) + (r.comReelNet||0) + (r.honReel||0) + (r.comApporteursReel||0) + (isCTP ? redevMois : 0))
      const reelCharges   = isCTP ? round2((r.gainsAgenteReels||0) + round2((r.comReelNet||0) * (ROYALTIES_RATE / (1 - ROYALTIES_RATE))) + (r.apporteurCoutTotalNet||0)) : 0
      const reelNet       = round2(reelProduits - reelCharges)
      const ecart = (pv, rv) => { const e = round2(rv - pv); return <span className={`text-xs font-medium ${e >= 0 ? 'text-green-600' : 'text-red-500'}`}>{e >= 0 ? '+' : ''}{fmt(e)}</span> }
      const lignesProduits = [
        { label: '(+) Frais consultation', p: p.frais||0, r: r.fraisNet||0 },
        { label: '(+) Commissions',        p: p.com||0,   r: r.comReelNet||0 },
        { label: '(+) Honoraires',         p: p.hon||0,   r: r.honReel||0 },
        { label: '(+) Com. apporteurs',    p: p.comApport||0, r: r.comApporteursReel||0 },
        ...(isCTP ? [{ label: '(+) Redevances agentes', p: redevMois, r: redevMois }] : []),
      ]
      const lignesCharges = isCTP ? [
        { label: '(−) Royalties illiCO',      p: p.royalties||0,   r: round2((r.comReelNet||0) * (ROYALTIES_RATE / (1 - ROYALTIES_RATE))) },
        { label: '(−) Part agentes',          p: p.partAgentes||0, r: r.gainsAgenteReels||0 },
        { label: '(−) Apporteurs remboursés', p: p.apporteur||0,   r: r.apporteurCoutTotalNet||0 },
      ] : []
      return (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-gray-100">
              <th className="text-left px-2 py-1 text-gray-400 uppercase w-1/2">Ligne</th>
              <th className="text-right px-2 py-1 text-gray-400 uppercase">Prévi</th>
              <th className="text-right px-2 py-1 text-gray-400 uppercase">Réel</th>
              <th className="text-right px-2 py-1 text-gray-400 uppercase">Écart</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              <tr className="bg-gray-50"><td colSpan={4} className="px-2 py-1 text-xs font-medium text-gray-400 uppercase">Gains</td></tr>
              {lignesProduits.map(({ label, p: pv, r: rv }) => (
                <tr key={label}><td className="px-2 py-1.5 text-gray-500">{label}</td><td className="px-2 py-1.5 text-right text-gray-500">{fmt(pv)}</td><td className="px-2 py-1.5 text-right text-green-700 font-medium">{fmt(rv)}</td><td className="px-2 py-1.5 text-right">{ecart(pv, rv)}</td></tr>
              ))}
              <tr className="bg-gray-50 border-t border-gray-200"><td className="px-2 py-1.5 font-medium text-gray-700">= Total gains</td><td className="px-2 py-1.5 text-right font-medium text-gray-700">{fmt(previProduits)}</td><td className="px-2 py-1.5 text-right font-medium text-green-700">{fmt(reelProduits)}</td><td className="px-2 py-1.5 text-right">{ecart(previProduits, reelProduits)}</td></tr>
              {isCTP && <><tr className="bg-gray-50"><td colSpan={4} className="px-2 py-1 text-xs font-medium text-gray-400 uppercase">Charges</td></tr>
              {lignesCharges.map(({ label, p: pv, r: rv }) => (
                <tr key={label}><td className="px-2 py-1.5 text-gray-500">{label}</td><td className="px-2 py-1.5 text-right text-gray-500">{fmt(pv)}</td><td className="px-2 py-1.5 text-right text-red-500 font-medium">{fmt(rv)}</td><td className="px-2 py-1.5 text-right">{ecart(pv, rv)}</td></tr>
              ))}
              <tr className="bg-gray-50 border-t border-gray-200"><td className="px-2 py-1.5 font-medium text-gray-700">= Total charges</td><td className="px-2 py-1.5 text-right font-medium text-gray-700">{fmt(previCharges)}</td><td className="px-2 py-1.5 text-right font-medium text-red-500">{fmt(reelCharges)}</td><td className="px-2 py-1.5 text-right">{ecart(previCharges, reelCharges)}</td></tr></>}
              <tr className="bg-blue-50 border-t-2 border-blue-100"><td className="px-2 py-2 font-bold text-blue-800">= {isCTP ? 'Résultat net CTP' : 'Total encaissé agence'}</td><td className="px-2 py-2 text-right font-bold text-gray-600">{fmt(previNet)}</td><td className={`px-2 py-2 text-right font-bold ${reelNet >= 0 ? 'text-blue-800' : 'text-red-600'}`}>{fmt(reelNet)}</td><td className="px-2 py-2 text-right">{ecart(previNet, reelNet)}</td></tr>
            </tbody>
          </table>
        </div>
      )
    }
    const allKeys = new Set([...rowsReel.map(([k]) => k), ...redevances.filter(r => r.statut === 'regle').map(r => `${r.annee}-${String(r.mois).padStart(2, '0')}`)])
    const cles = Array.from(allKeys).sort((a, b) => b.localeCompare(a))
    const chartLabels = cles.map(cle => { const [a, m] = cle.split('-'); return `${MOIS[parseInt(m)].slice(0,3)}. ${a}` })
    const chartProduits = cles.map(cle => { const [a, m] = cle.split('-'); const r = rowsReel.find(([k]) => k === cle)?.[1] || {}; const redev = redevances.filter(rv => rv.statut === 'regle' && rv.annee === parseInt(a) && rv.mois === parseInt(m)).reduce((s, rv) => s + (rv.montant_ht||0), 0); return round2((r.fraisNet||0) + (r.comReelNet||0) + (r.honReel||0) + (r.comApporteursReel||0) + (isCTP ? redev : 0)) })
    const chartCharges = cles.map(cle => { const r = rowsReel.find(([k]) => k === cle)?.[1] || {}; return isCTP ? -round2((r.gainsAgenteReels||0) + (r.apporteurCoutTotalNet||0)) : 0 })
    const chartNet = cles.map((_, i) => round2(chartProduits[i] + chartCharges[i]))
    const sfSousOnglet = sfSousOngletCTP; const setSfSousOnglet = setSfSousOngletCTP

    const renderAnnuel = () => {
      const annees = []; for (let a = new Date().getFullYear(); a >= 2024; a--) annees.push(a)
      const rowsReelAnnee = agrégerParPaiement(dossiers, false)
      const clesMois = Array.from(new Set([...rowsReelAnnee.map(([k]) => k), ...redevances.filter(r => r.statut === 'regle').map(r => `${r.annee}-${String(r.mois).padStart(2, '0')}`)])).filter(k => k.startsWith(String(anneeSelectionnee))).sort()
      const mapPrevi = {}
      dossiers.forEach(d => {
        const key = getKeyFromDate(d.date_signature_contrat || d.created_at, false)
        if (!key || !key.startsWith(String(anneeSelectionnee))) return
        if (!mapPrevi[key]) mapPrevi[key] = { frais: 0, com: 0, comApport: 0, hon: 0, partAgentes: 0, apporteur: 0, royalties: 0 }
        const c = calculer(d)
        mapPrevi[key].frais       = round2(mapPrevi[key].frais       + c.fraisNetPrevi)
        mapPrevi[key].com         = round2(mapPrevi[key].com         + c.netComTous)
        mapPrevi[key].comApport   = round2(mapPrevi[key].comApport   + c.comApporteursPrevi)
        mapPrevi[key].hon         = round2(mapPrevi[key].hon         + c.honPreviNet)
        mapPrevi[key].partAgentes = round2(mapPrevi[key].partAgentes + c.gainsAgentePreviTotal)
        mapPrevi[key].royalties   = round2(mapPrevi[key].royalties   + c.royaltiesTotal)
      })
      const totP = { frais: 0, com: 0, comApport: 0, hon: 0, redev: 0, partAgentes: 0, apporteur: 0, royalties: 0 }
      const totR = { frais: 0, com: 0, comApport: 0, hon: 0, redev: 0, partAgentes: 0, royalties: 0, apporteur: 0 }
      clesMois.forEach(cle => {
        const [, m] = cle.split('-')
        const redev = redevances.filter(r => r.statut === 'regle' && r.annee === anneeSelectionnee && r.mois === parseInt(m)).reduce((s, r) => s + (r.montant_ht || 0), 0)
        const p = mapPrevi[cle] || {}; const r = rowsReelAnnee.find(([k]) => k === cle)?.[1] || {}
        totP.frais = round2(totP.frais + (p.frais||0)); totP.com = round2(totP.com + (p.com||0)); totP.comApport = round2(totP.comApport + (p.comApport||0)); totP.hon = round2(totP.hon + (p.hon||0)); totP.redev = round2(totP.redev + redev); totP.partAgentes = round2(totP.partAgentes + (p.partAgentes||0)); totP.royalties = round2(totP.royalties + (p.royalties||0))
        totR.frais = round2(totR.frais + (r.fraisNet||0)); totR.com = round2(totR.com + (r.comReelNet||0)); totR.comApport = round2(totR.comApport + (r.comApporteursReel||0)); totR.hon = round2(totR.hon + (r.honReel||0)); totR.redev = round2(totR.redev + redev); totR.partAgentes = round2(totR.partAgentes + (r.gainsAgenteReels||0)); totR.royalties = round2(totR.royalties + round2((r.comReelNet||0) * (ROYALTIES_RATE / (1 - ROYALTIES_RATE))))
        const apporteurReel = dossiers.reduce((s, d) => { const lignes = (d.suivi_financier || []).filter(sf => sf.type_echeance === 'apporteur_agente' && sf.statut_ctp === 'rembourse' && sf.date_paiement && getKeyFromDate(sf.date_paiement, false) === cle); if (!lignes.length) return s; const c2 = calculerReel(d); return s + round2((c2.finance?.apporteur?.lines || []).reduce((sum, ligne) => { const dv = (d.devis_artisans || []).find(dv => dv.id === ligne.devisId); const artId = dv?.artisan_id || dv?.artisan?.id; const sf = (d.suivi_financier || []).find(s2 => s2.type_echeance === 'apporteur_agente' && (ligne.type === 'total_chantier_ht' ? s2.artisan_id === null : s2.artisan_id === artId) && s2.statut_ctp === 'rembourse' && s2.date_paiement && getKeyFromDate(s2.date_paiement, false) === cle); return sf ? sum + ligne.totalHT : sum }, 0)) }, 0)
        totR.apporteur = round2(totR.apporteur + apporteurReel)
      })
      const previProduits = round2(totP.frais + totP.com + totP.comApport + totP.hon + (isCTP ? totP.redev : 0))
      const previCharges  = isCTP ? round2(totP.partAgentes + totP.apporteur + totP.royalties) : 0
      const previNet      = round2(previProduits - previCharges)
      const reelProduits  = round2(totR.frais + totR.com + totR.comApport + totR.hon + (isCTP ? totR.redev : 0))
      const reelCharges   = isCTP ? round2(totR.partAgentes + totR.royalties + totR.apporteur) : 0
      const reelNet       = round2(reelProduits - reelCharges)
      const ecart = (p, r) => { const e = round2(r - p); return <span className={`text-xs font-medium ${e >= 0 ? 'text-green-600' : 'text-red-500'}`}>{e >= 0 ? '+' : ''}{fmt(e)}</span> }
      const chartLabelsAnnee = clesMois.map(cle => { const [, m] = cle.split('-'); return MOIS[parseInt(m)].slice(0, 3) })
      const chartProduitsAnnee = clesMois.map(cle => { const [, m] = cle.split('-'); const r = rowsReelAnnee.find(([k]) => k === cle)?.[1] || {}; const redev = redevances.filter(rv => rv.statut === 'regle' && rv.annee === anneeSelectionnee && rv.mois === parseInt(m)).reduce((s, rv) => s + (rv.montant_ht||0), 0); return round2((r.fraisNet||0) + (r.comReelNet||0) + (r.honReel||0) + (r.comApporteursReel||0) + (isCTP ? redev : 0)) })
      const chartChargesAnnee = clesMois.map(cle => { const r = rowsReelAnnee.find(([k]) => k === cle)?.[1] || {}; return isCTP ? -round2((r.gainsAgenteReels||0) + (r.apporteurCoutTotalNet||0)) : 0 })
      const chartNetAnnee = clesMois.map((_, i) => round2(chartProduitsAnnee[i] + chartChargesAnnee[i]))
      return (
        <div className="space-y-5">
          <ObjectifBar label={isCTP ? 'Objectif CA CTP (résultat net)' : 'Objectif CA agence (encaissements bruts)'} reel={reelNet} objectifMontant={getObjectif('agence')} cible="agence" canEdit={false} />
          <div className="card" style={{overflow:'hidden'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 20px',background:'var(--surface-2)',borderBottom:'1px solid var(--ink-200)'}}>
              <span style={{fontSize:14,fontWeight:600,color:'var(--ink-700)'}}>Compte de résultat {isCTP ? 'CTP' : 'Agence'}</span>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <span style={{fontSize:11,padding:'2px 8px',borderRadius:99,background:'rgba(22,163,74,0.1)',color:'#15803d',fontWeight:600}}>réel encaissé</span>
                <select value={anneeSelectionnee} onChange={e => setAnneeSelectionnee(parseInt(e.target.value))} className="input" style={{height:28,fontSize:12,padding:'0 8px'}}>
                  {annees.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100">
                <th className="text-left px-5 py-2 text-xs font-medium text-gray-400 uppercase w-1/2">Ligne</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-gray-400 uppercase">Prévisionnel</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-gray-400 uppercase">Réel</th>
                <th className="text-right px-5 py-2 text-xs font-medium text-gray-400 uppercase">Écart</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                <tr className="bg-gray-50"><td colSpan={4} className="px-5 py-1.5 text-xs font-medium text-gray-400 uppercase">Gains</td></tr>
                {[
                  { label: '(+) Frais consultation', p: totP.frais, r: totR.frais },
                  { label: '(+) Commissions', p: totP.com, r: totR.com },
                  { label: '(+) Honoraires', p: totP.hon, r: totR.hon },
                  { label: '(+) Com. apporteurs', p: totP.comApport, r: totR.comApport },
                  ...(isCTP ? [{ label: '(+) Redevances agentes', p: totP.redev, r: totR.redev }] : []),
                ].map(({ label, p, r }) => (<tr key={label} className="hover:bg-gray-50"><td className="px-5 py-2.5 text-gray-500 text-xs">{label}</td><td className="px-4 py-2.5 text-right text-gray-500 text-xs">{fmt(p)}</td><td className="px-4 py-2.5 text-right text-green-700 text-xs font-medium">{fmt(r)}</td><td className="px-5 py-2.5 text-right">{ecart(p, r)}</td></tr>))}
                <tr className="bg-gray-50 border-t border-gray-200"><td className="px-5 py-2.5 font-medium text-gray-700 text-xs">= Total gains</td><td className="px-4 py-2.5 text-right font-medium text-gray-700 text-xs">{fmt(previProduits)}</td><td className="px-4 py-2.5 text-right font-medium text-green-700 text-xs">{fmt(reelProduits)}</td><td className="px-5 py-2.5 text-right">{ecart(previProduits, reelProduits)}</td></tr>
                {isCTP && <><tr className="bg-gray-50"><td colSpan={4} className="px-5 py-1.5 text-xs font-medium text-gray-400 uppercase">Charges</td></tr>
                {[{ label: '(−) Royalties illiCO', p: totP.royalties, r: totR.royalties }, { label: '(−) Part agentes', p: totP.partAgentes, r: totR.partAgentes }, { label: '(−) Apporteurs remboursés', p: totP.apporteur, r: totR.apporteur }].map(({ label, p, r }) => (<tr key={label} className="hover:bg-gray-50"><td className="px-5 py-2.5 text-gray-500 text-xs">{label}</td><td className="px-4 py-2.5 text-right text-gray-500 text-xs">{fmt(p)}</td><td className="px-4 py-2.5 text-right text-red-500 text-xs font-medium">{fmt(r)}</td><td className="px-5 py-2.5 text-right">{ecart(p, r)}</td></tr>))}
                <tr className="bg-gray-50 border-t border-gray-200"><td className="px-5 py-2.5 font-medium text-gray-700 text-xs">= Total charges</td><td className="px-4 py-2.5 text-right font-medium text-gray-700 text-xs">{fmt(previCharges)}</td><td className="px-4 py-2.5 text-right font-medium text-red-500 text-xs">{fmt(reelCharges)}</td><td className="px-5 py-2.5 text-right">{ecart(previCharges, reelCharges)}</td></tr></>}
                <tr className="bg-blue-50 border-t-2 border-blue-100"><td className="px-5 py-3 font-bold text-blue-800 text-sm">= {isCTP ? `Résultat net CTP ${anneeSelectionnee}` : `Encaissements bruts agence ${anneeSelectionnee}`}</td><td className="px-4 py-3 text-right font-bold text-gray-600 text-sm">{fmt(previNet)}</td><td className={`px-4 py-3 text-right font-bold text-sm ${reelNet >= 0 ? 'text-blue-800' : 'text-red-600'}`}>{fmt(reelNet)}</td><td className="px-5 py-3 text-right">{ecart(previNet, reelNet)}</td></tr>
              </tbody>
            </table>
          </div>
          <SuiviCTPChart labels={chartLabelsAnnee} produitsData={chartProduitsAnnee} chargesData={chartChargesAnnee} netData={chartNetAnnee} chartId={`chart_${mode}_annee_${anneeSelectionnee}`} />
        </div>
      )
    }

    return (
      <div style={{display:'flex',flexDirection:'column',gap:16}}>
        <PillToggle
          options={[{key:'mois',label:'Par mois'},{key:'annee',label:'Par année'}]}
          active={sfSousOnglet}
          onChange={setSfSousOnglet}
        />
        {sfSousOnglet === 'mois' && (
          <div className="space-y-5">
            <ObjectifBar label={isCTP ? `Objectif mensuel CTP (${fmt(objectifMensuel)}/mois)` : `Objectif mensuel agence (${fmt(objectifMensuel)}/mois)`}
              reel={(() => { const moisCourant = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`; const r = rowsReel.find(([k]) => k === moisCourant)?.[1] || {}; const redev = redevances.filter(rv => rv.statut === 'regle' && rv.annee === new Date().getFullYear() && rv.mois === new Date().getMonth() + 1).reduce((s, rv) => s + (rv.montant_ht||0), 0); return getReelNet(r, redev) })()}
              objectifMontant={objectifMensuel} cible="agence" canEdit={false} />
            <SuiviCTPChart labels={chartLabels} produitsData={chartProduits} chargesData={chartCharges} netData={chartNet} chartId={`chart_${mode}_mois`} />
            <div className="card" style={{overflow:'hidden'}}>
              <table className="w-full text-xs">
                <thead style={{background:'var(--surface-2)',borderBottom:'1px solid var(--ink-200)'}}>
                  <tr>
                    <th style={{textAlign:'left',padding:'12px 16px',fontSize:11,fontWeight:700,color:'var(--ink-500)',textTransform:'uppercase'}}>Mois</th>
                    <th style={{textAlign:'right',padding:'12px 12px',fontSize:11,fontWeight:700,color:'var(--ink-500)',textTransform:'uppercase'}}>Réel encaissé</th>
                    <th style={{textAlign:'right',padding:'12px 12px',fontSize:11,fontWeight:700,color:'var(--ink-500)',textTransform:'uppercase'}}>Objectif mois</th>
                    <th style={{textAlign:'right',padding:'12px 16px',fontSize:11,fontWeight:700,color:'var(--ink-500)',textTransform:'uppercase'}}>vs Objectif</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cles.map((cle, i) => {
                    const [a, m] = cle.split('-')
                    const label = `${MOIS[parseInt(m)].slice(0, 3)}. ${a}`
                    const r = rowsReel.find(([k]) => k === cle)?.[1] || {}
                    const redev = redevances.filter(rv => rv.statut === 'regle' && rv.annee === parseInt(a) && rv.mois === parseInt(m)).reduce((s, rv) => s + (rv.montant_ht||0), 0)
                    const reelNet = getReelNet(r, redev)
                    const ecartObj = round2(reelNet - objectifMensuel)
                    const isOpen = moisOuvert === `${mode}_${cle}`
                    const bg = i % 2 === 0 ? '' : 'bg-gray-50'
                    return (
                      <React.Fragment key={cle}>
                        <tr className={`cursor-pointer hover:bg-blue-50 ${bg}`} onClick={() => setMoisOuvert(isOpen ? null : `${mode}_${cle}`)}>
                          <td className="px-4 py-2.5 font-medium text-gray-700 flex items-center gap-2"><span>{label}</span><span className="text-gray-300 text-xs">{isOpen ? '▲' : '▼'}</span></td>
                          <td className={`px-3 py-2.5 text-right font-medium ${reelNet >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmt(reelNet)}</td>
                          <td className="px-3 py-2.5 text-right text-gray-400">{fmt(objectifMensuel)}</td>
                          <td className={`px-4 py-2.5 text-right font-medium ${ecartObj >= 0 ? 'text-green-600' : 'text-red-500'}`}>{ecartObj >= 0 ? '+' : ''}{fmt(ecartObj)}</td>
                        </tr>
                        {isOpen && (<tr className={bg}><td colSpan={4} className="px-4 pb-3">{crPourCle(cle)}</td></tr>)}
                      </React.Fragment>
                    )
                  })}
                  <tr className="bg-gray-50 border-t-2 border-gray-300 font-bold text-xs">
                    <td className="px-4 py-2.5 text-gray-700">Total</td>
                    <td className={`px-3 py-2.5 text-right ${cles.reduce((s,cle)=>{const [a,m]=cle.split('-');const r=rowsReel.find(([k])=>k===cle)?.[1]||{};const redev=redevances.filter(rv=>rv.statut==='regle'&&rv.annee===parseInt(a)&&rv.mois===parseInt(m)).reduce((sv,rv)=>sv+(rv.montant_ht||0),0);return s+getReelNet(r,redev)},0)>=0?'text-green-700':'text-red-600'}`}>{fmt(cles.reduce((s,cle)=>{const [a,m]=cle.split('-');const r=rowsReel.find(([k])=>k===cle)?.[1]||{};const redev=redevances.filter(rv=>rv.statut==='regle'&&rv.annee===parseInt(a)&&rv.mois===parseInt(m)).reduce((sv,rv)=>sv+(rv.montant_ht||0),0);return s+getReelNet(r,redev)},0))}</td>
                    <td className="px-3 py-2.5 text-right text-gray-400">{fmt(objectifMensuel * cles.length)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500">—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
        {sfSousOnglet === 'annee' && renderAnnuel()}
      </div>
    )
  }

  // ── SYNTHESE VIEW ──────────────────────────────────────────────────────────

  function SyntheseView() {
    const chartId = 'synthese_monthly_chart'
    const donutId = 'synthese_donut_chart'

    const reelData = useMemo(() => Array.from({length:12}, (_, i) => {
      const key = `${anneeEnCours}-${String(i+1).padStart(2,'0')}`
      const agg = rowsReelAnneeEnCours.find(([k]) => k === key)?.[1] || {}
      return round2((agg.fraisNet||0) + (agg.comReelNet||0) + (agg.honReel||0) + (agg.comApporteursReel||0))
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [rowsReelAnneeEnCours])

    const previData = useMemo(() => {
      const map = {}
      scopedDossiers.forEach(d => {
        const key = getKeyFromDate(d.date_signature_contrat || d.created_at, false)
        if (!key || !key.startsWith(String(anneeEnCours))) return
        if (!map[key]) map[key] = 0
        const c = calculer(d)
        map[key] = round2(map[key] + c.gainsAdminPreviTotal + c.gainsAgentePreviTotal)
      })
      return Array.from({length:12}, (_, i) => {
        const key = `${anneeEnCours}-${String(i+1).padStart(2,'0')}`
        return map[key] || 0
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scopedDossiers])


    useEffect(() => {
      if (typeof window === 'undefined') return
      const el = document.getElementById(chartId)
      if (!el) return
      if (el._chartInstance) el._chartInstance.destroy()
      el._chartInstance = new Chart(el, {
        data: {
          labels: MOIS_LABELS,
          datasets: [
            { type: 'bar', label: 'Réel', data: reelData, backgroundColor: 'rgba(0, 123, 255, 0.7)', borderColor: 'rgba(0, 123, 255, 1)', borderWidth: 1, barPercentage: 0.5,categoryPercentage: 0.5, yAxisID: 'y', },
            { type: 'bar', label: 'Prévi', data: previData, backgroundColor: 'rgba(0, 123, 255, 0.1)',borderColor: 'rgba(0, 123, 255, 0.5)', borderDash: [5, 5], pointRadius: 0, yAxisID: 'y',}
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => ctx.dataset.label + ' : ' + Math.abs(ctx.parsed.y).toLocaleString('fr-FR') + ' €' } }
          },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#888', maxRotation: 30 } },
            y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 }, color: '#888', callback: v => Math.abs(v).toLocaleString('fr-FR') + ' €' } }
          }
        }
      })
      return () => { if (el._chartInstance) { el._chartInstance.destroy(); el._chartInstance = null } }
    }, [reelData, previData])

    useEffect(() => {
      if (typeof window === 'undefined') return
      const el = document.getElementById(donutId)
      if (!el) return
      if (el._chartInstance) el._chartInstance.destroy()
      el._chartInstance = new Chart(el, {
        type: 'doughnut',
        data: {
          labels: ['Commissions HT', 'Frais HT', 'Royalties'],
          datasets: [{ data: [totComHT, totFraisHT, totRoyalties], backgroundColor: ['#00578e','#0094d4','#94a3b8'], borderWidth: 0, hoverOffset: 4 }]
        },
        options: {
          cutout: '70%', responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => ctx.label + ' : ' + (ctx.parsed).toLocaleString('fr-FR') + ' €' } }
          }
        }
      })
      return () => { if (el._chartInstance) { el._chartInstance.destroy(); el._chartInstance = null } }
    }, [totComHT, totFraisHT, totRoyalties])

    const totalDonut = totComHT + totFraisHT + totRoyalties
    const reelTotal  = reelData.reduce((s,v) => s+v, 0)

    return (
      <div style={{display:'flex',flexDirection:'column',gap:20}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
          {/* LEFT : bar+line chart + totaux */}
          <div className="card" style={{padding:20}}>
            <div className="eyebrow" style={{marginBottom:12}}>Évolution mensuelle {anneeEnCours} \nCA RÉEL NET VS PRÉVISIONNEL </div>
            <div style={{display:'flex',gap:16,marginBottom:12,flexWrap:'wrap'}}>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <div style={{width:10,height:10,borderRadius:2,background:'#3B7DD8'}}/>
                <span style={{fontSize:11,color:'var(--ink-500)'}}>Réel</span>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <div style={{width:10,height:10,borderRadius:2,border:'2px dashed #94a3b8',background:'transparent'}}/>
                <span style={{fontSize:11,color:'var(--ink-500)'}}>Prévi</span>
              </div>
            </div>
            <div style={{position:'relative',height:220}}>
              <canvas id={chartId} role="img" aria-label="Gains mensuels" />
            </div>
            <div style={{marginTop:16,display:'flex',flexDirection:'column',gap:6}}>
              <Row label="Total réel" value={fmt(reelTotal)} bold accent />
              <Row label="Total prévi" value={fmt(totPreviNet)} dim />
              {pctObjectif > 0 && <Row label={`Objectif ${anneeEnCours} (${pctObjectif}%)`} value={fmt(objectifAnnuel)} dim />}
            </div>
          </div>
          {/* RIGHT : donut + répartition */}
          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            <div className="card" style={{padding:20}}>
              <div className="eyebrow" style={{marginBottom:12}}>Répartition prévisionnel</div>
              <div style={{position:'relative',height:160}}>
                <canvas id={donutId} role="img" aria-label="Répartition" />
              </div>
              <div style={{marginTop:12,display:'flex',flexDirection:'column',gap:6}}>
                <LegendRow color="#00578e" label="Commissions HT" value={fmt(totComHT)} pct={totalDonut>0?Math.round(totComHT/totalDonut*100):0} />
                <LegendRow color="#0094d4" label="Frais HT"       value={fmt(totFraisHT)} pct={totalDonut>0?Math.round(totFraisHT/totalDonut*100):0} />
                <LegendRow color="#94a3b8" label="Royalties"      value={fmt(totRoyalties)} pct={totalDonut>0?Math.round(totRoyalties/totalDonut*100):0} />
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── FACTURATION AGENTES (INNER COMPONENT) ────────────────────────────────

  function FacturationAgentes() {
    const facturesAg  = facturesAgente.filter(f => f.agente_id === agenteSelectionnee)
    const redevAg     = redevancesAgente
    const [moisDeplie, setMoisDeplie] = useState(null)

    // Montants F1/F2 calculés EN LIVE (source unique : agrégerParPaiement → finance.js).
    // Le snapshot factures_agente ne sert plus qu'à lire le statut + le PDF (read-only ici).
    const rowsReel   = agrégerParPaiement(dossiersAgente, false)
    const aggParMois = new Map(rowsReel)
    // Seuil de redevance dérivé de la CHAÎNE "YYYY-MM-DD" (zéro Date → zéro fuseau).
    const debutIndex = agenteActuelle?.redevance_debut
      ? (() => { const [y, m] = agenteActuelle.redevance_debut.split('-').map(Number); return y * 12 + (m - 1) })()
      : null
    const redevParam = agenteActuelle?.redevance_mensuelle_ht   // paramètre, jamais de littéral

    // F1 (agente → CTP) = frais + commissions + honoraires + part partenaire (= gainsAgenteReels)
    // F2 (CTP → agente) = redevance HT datée (param) + apporteur remboursé
    const calcMois = (annee, mois) => {
      const agg = aggParMois.get(`${annee}-${String(mois).padStart(2, '0')}`) || {}
      const fraisN = round2(agg.fraisAgenteNet || 0)
      const comN   = round2(agg.comAgenteNet || 0)
      const honN   = round2(agg.honAgenteNet || 0)
      const partN  = round2(agg.comApporteursAgenteNet || 0)
      const montantF1 = round2(fraisN + comN + honN + partN)
      const moisIndex = annee * 12 + (mois - 1)
      const redev = (debutIndex != null && redevParam != null && moisIndex >= debutIndex) ? round2(redevParam) : 0
      const apporteur = round2(agg.apporteurPartAgenteNet || 0)
      const montantF2 = round2(redev + apporteur)
      return { fraisN, comN, honN, partN, montantF1, redev, apporteur, montantF2 }
    }

    // F1/F2 effectif : figé (snapshot factures_agente.montant) si payé, sinon live.
    const f1Eff = (f, liveF1) => f?.statut === 'paye' ? round2(f.montant || 0) : liveF1
    const f2Eff = (f, liveF2) => f?.statut === 'paye' ? round2(f.montant || 0) : liveF2

    // Facturation décalée : la facture du mois M porte sur l'activité du mois M−1.
    // P2 : on persiste / apparie / toggle sur le mois d'ACTIVITÉ ; seul le libellé est décalé.
    const shiftMoisKey = (key, delta) => {
      const [y, m] = key.split('-').map(Number)
      const dt = new Date(y, m - 1 + delta, 1)            // Date gère le rollover d'année
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
    }

    // Tous les mois de redevance due : de debutIndex au mois courant (activité) INCLUS, même creux.
    const now = new Date()
    const moisCourantIndex = now.getFullYear() * 12 + now.getMonth()    // getMonth() 0-based = (mois-1), cohérent avec debutIndex
    const redevanceDueKeys = []
    if (debutIndex != null) {
      for (let i = debutIndex; i <= moisCourantIndex; i++) {
        redevanceDueKeys.push(`${Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`)   // clé activité "YYYY-MM"
      }
    }

    // Lignes = mois de FACTURE (= activité + 1). Sources activité : rowsReel + factures persistées (P2) + redevances dues.
    const months = [...new Set([
      ...rowsReel.map(([k]) => shiftMoisKey(k, +1)),
      ...facturesAg.map(f => shiftMoisKey(`${f.annee}-${String(f.mois).padStart(2, '0')}`, +1)),
      ...redevanceDueKeys.map(k => shiftMoisKey(k, +1)),
    ])].sort((a, b) => b.localeCompare(a))

    let totalF1 = 0, totalF1Paye = 0, totalF2 = 0, totalF2Paye = 0
    months.forEach(key => {
      const [aStr, mStr] = shiftMoisKey(key, -1).split('-')   // mois d'activité (M−1)
      const annee = parseInt(aStr), mois = parseInt(mStr)
      const { montantF1, montantF2 } = calcMois(annee, mois)
      const f1 = facturesAg.find(f => f.type_facture === 'agente_vers_ctp' && f.mois === mois && f.annee === annee)
      const f2 = facturesAg.find(f => f.type_facture === 'ctp_vers_agente' && f.mois === mois && f.annee === annee)
      const f1eff = f1Eff(f1, montantF1)
      const f2eff = f2Eff(f2, montantF2)
      totalF1 = round2(totalF1 + f1eff); totalF2 = round2(totalF2 + f2eff)
      if (f1?.statut === 'paye') totalF1Paye = round2(totalF1Paye + f1eff)
      if (f2?.statut === 'paye') totalF2Paye = round2(totalF2Paye + f2eff)
    })
    const totalRedev = redevAg.filter(r => r.statut === 'regle').reduce((s, r) => round2(s + (r.montant_ht || 0)), 0)
    const net        = round2(totalF1 - totalF2)

    const uploadPdf = async (f, fichier) => {
      setErreur(''); setSucces('')
      const ext = fichier.name.split('.').pop().toLowerCase()
      const chemin = `factures_agente/${agenteSelectionnee}/${f.annee}-${String(f.mois).padStart(2,'0')}-${f.type_facture}.${ext}`
      const { error } = await supabase.storage.from('documents').upload(chemin, fichier, { upsert: true })
      if (!error) {
        await upsertFactureMoisType(f.mois, f.annee, f.montant||0, f.type_facture, { facture_path: chemin })
        setSucces('Facture uploadée ✓')
      } else { setErreur('Erreur upload : ' + error.message) }
    }

    // Bascule du statut F1 (agente → CTP). Au clic « payé » : fige le montant LIVE
    // (calcMois, jamais f.montant). Au déclic : montant remis à NULL → le live reprend.
    // INSERT si le mois n'a pas de ligne (montant positionnel), UPDATE sinon (montant dans updates).
    const toggleF1Statut = async (annee, mois, f1) => {
      const live = calcMois(annee, mois).montantF1
      if (f1?.statut === 'paye') {
        await upsertFactureMoisType(mois, annee, live, 'agente_vers_ctp', { statut: 'a_facturer', montant: null })
      } else {
        await upsertFactureMoisType(mois, annee, live, 'agente_vers_ctp', { statut: 'paye', montant: live })
      }
    }

    // Bascule du statut F2 (CTP → agente). ADMIN ONLY (appelé uniquement depuis la
    // branche isAdmin de la cellule). Fige le montant LIVE (calcMois().montantF2,
    // jamais f.montant) au clic « reçu », NULL au déclic. Le type 'ctp_vers_agente'
    // déclenche la synchro redevances dans upsertFactureMoisType (regle / en_attente).
    const toggleF2Statut = async (annee, mois, f2) => {
      const live = calcMois(annee, mois).montantF2
      if (f2?.statut === 'paye') {
        await upsertFactureMoisType(mois, annee, live, 'ctp_vers_agente', { statut: 'a_facturer', montant: null })
      } else {
        await upsertFactureMoisType(mois, annee, live, 'ctp_vers_agente', { statut: 'paye', montant: live })
      }
    }

    const FactureDetailCard = ({ title, subtitle, type, accent }) => {
      const fs = facturesAg.filter(f => f.type_facture === type)
      return (
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <div style={{padding:'14px 18px',borderBottom:'1px solid var(--ink-200)',borderLeft:`4px solid ${accent}`}}>
            <div style={{fontSize:14,fontWeight:700,color:'var(--ink-900)'}}>{title}</div>
            <div style={{fontSize:11.5,color:'var(--ink-500)',marginTop:4,lineHeight:1.4}}>{subtitle}</div>
          </div>
          <div>
            {fs.map(f => {
              const m = calcMois(f.annee, f.mois)
              const montant = type === 'agente_vers_ctp' ? f1Eff(f, m.montantF1) : f2Eff(f, m.montantF2)
              const [fFaStr, fFmStr] = shiftMoisKey(`${f.annee}-${String(f.mois).padStart(2, '0')}`, +1).split('-')
              return (
              <div key={f.id} style={{display:'grid',gridTemplateColumns:'1fr auto auto',gap:12,alignItems:'center',padding:'12px 18px',borderTop:'1px solid var(--ink-100)'}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:'var(--ink-900)'}}>{MOIS[parseInt(fFmStr)]} {fFaStr}</div>
                  <div style={{fontSize:10,color:'var(--ink-400)'}}>activité de {MOIS[f.mois]} {f.annee}</div>
                  <div style={{fontSize:11,color:'var(--ink-500)',marginTop:2}}>
                    {f.facture_path
                      ? <button onClick={async () => { const { data } = await supabase.storage.from('documents').createSignedUrl(f.facture_path, 3600); if (data?.signedUrl) window.open(data.signedUrl + '&t=' + Date.now(), '_blank') }}
                          style={{fontSize:11,color:'var(--brand-700)',background:'none',border:'none',cursor:'pointer',padding:0}}>📄 Voir le PDF</button>
                      : <span style={{color:'var(--ink-400)'}}>Pas de PDF déposé</span>}
                  </div>
                </div>
                <div style={{fontWeight:700,color:'var(--ink-900)',fontVariantNumeric:'tabular-nums'}}>{fmt(montant)}</div>
                <div style={{display:'flex',gap:6,alignItems:'center'}}>
                  <StatutFacture f={f}/>
                  <label style={{fontSize:11,padding:'4px 8px',borderRadius:6,border:'1px solid var(--ink-200)',cursor:'pointer',color:'var(--ink-600)',background:'#fff'}}>
                    {f.facture_path ? '📤 Remplacer le PDF' : '📤 Déposer un PDF'}
                    <input type="file" accept=".pdf" className="hidden" onChange={e => e.target.files[0] && uploadPdf(f, e.target.files[0])}/>
                  </label>
                </div>
              </div>
              )
            })}
            {fs.length === 0 && <div style={{padding:24,textAlign:'center',color:'var(--ink-400)',fontSize:13}}>Aucune facture</div>}
          </div>
        </div>
      )
    }

    return (
      <div style={{display:'flex',flexDirection:'column',gap:18}}>
        {succes && <div style={{background:'rgba(22,163,74,0.07)',border:'1px solid rgba(22,163,74,0.25)',borderRadius:10,padding:'10px 16px',fontSize:13,color:'#15803d'}}>{succes}</div>}
        {erreur && <div style={{background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:10,padding:'10px 16px',fontSize:13,color:'#b91c1c'}}>{erreur}</div>}
        {/* Sélecteur agente — admin uniquement (agente voit sa propre facturation) */}
        {isAdmin && (
          <div className="card" style={{padding:'14px 18px',display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}>
            <div className="eyebrow">Agente :</div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {agentes.filter(a => a.role === 'agente').map(a => (
                <button key={a.id} onClick={() => setAgenteSelectionnee(a.id)} style={{
                  display:'inline-flex',alignItems:'center',gap:6,padding:'6px 12px',borderRadius:99,
                  border:'1px solid',borderColor: agenteSelectionnee === a.id ? 'var(--brand-500)' : 'var(--ink-200)',
                  background: agenteSelectionnee === a.id ? 'var(--brand-50)' : '#fff',
                  color: agenteSelectionnee === a.id ? 'var(--brand-800)' : 'var(--ink-700)',
                  fontSize:12,fontWeight:600,cursor:'pointer',
                }}>
                  <Avatar name={`${a.prenom} ${a.nom}`} size={20}/>
                  {a.prenom} {a.nom}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* KPI strip */}
        <div className="kpi-grid">
          <FinKpiCard label="F1 — Gains à facturer"       value={fmt(totalF1)}    sub={`Reçu ${fmt(totalF1Paye)} · Reste ${fmt(round2(totalF1-totalF1Paye))}`} tone="ok"/>
          <FinKpiCard label="F2 — Redevances + apporteur" value={fmt(totalF2)}    sub={`Reçu ${fmt(totalF2Paye)}`}                                              tone="warn"/>
          <FinKpiCard label="Redevances réglées"           value={fmt(totalRedev)} sub={`${redevAg.filter(r=>r.statut==='regle').length} mois · ${agenteActuelle?.redevance_mensuelle_ht != null ? `${agenteActuelle.redevance_mensuelle_ht} €/mois` : 'à paramétrer'}`}     tone="brand"/>
          <FinKpiCard label="Net à virer à l'agente"       value={(net >= 0 ? '+' : '') + fmt(Math.abs(net))} sub={net >= 0 ? 'F1 − F2' : "L'agente doit à CTP"} tone={net >= 0 ? 'brand' : 'bad'}/>
        </div>

        {/* Tableau mensuel F1 / F2 */}
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <div style={{padding:'14px 22px',borderBottom:'1px solid var(--ink-200)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{fontSize:15,fontWeight:700,color:'var(--ink-900)'}}>
                Facturation mensuelle · {agenteActuelle ? `${agenteActuelle.prenom} ${agenteActuelle.nom}` : '—'}
              </div>
              <div className="eyebrow" style={{marginTop:4}}>F1 = facture émise par l&apos;agente · F2 = facture émise par la franchisée</div>
            </div>
          </div>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead style={{background:'var(--surface-2)'}}>
              <tr>
                {thL('Mois')}
                {thR('F1 (Agente → CTP)')}
                <th style={{padding:'12px 16px',textAlign:'center',fontSize:11,fontWeight:700,color:'var(--ink-500)',textTransform:'uppercase'}}>Statut F1</th>
                {thR('F2 (CTP → Agente)')}
                <th style={{padding:'12px 16px',textAlign:'center',fontSize:11,fontWeight:700,color:'var(--ink-500)',textTransform:'uppercase'}}>Statut F2</th>
                {thR('Net')}
              </tr>
            </thead>
            <tbody>
              {months.map(key => {
                const [faStr, fmStr] = key.split('-')
                const fMois = parseInt(fmStr); const fAnnee = parseInt(faStr)        // mois de FACTURE (libellé)
                const [aStr, mStr] = shiftMoisKey(key, -1).split('-')
                const mois = parseInt(mStr); const annee = parseInt(aStr)            // mois d'ACTIVITÉ (M−1) : données, appariement, toggle
                const f1 = facturesAg.find(f => f.type_facture === 'agente_vers_ctp' && f.mois === mois && f.annee === annee)
                const f2 = facturesAg.find(f => f.type_facture === 'ctp_vers_agente' && f.mois === mois && f.annee === annee)
                const d   = calcMois(annee, mois)
                const f1m = f1Eff(f1, d.montantF1)
                const f2m = f2Eff(f2, d.montantF2)
                const n   = round2(f1m - f2m)
                const isOpen = moisDeplie === key
                const voirPdf = async (path) => { const { data } = await supabase.storage.from('documents').createSignedUrl(path, 3600); if (data?.signedUrl) window.open(data.signedUrl + '&t=' + Date.now(), '_blank') }
                return (
                  <React.Fragment key={key}>
                  <tr style={{borderTop:'1px solid var(--ink-100)',cursor:'pointer'}} className="row-hover" onClick={() => setMoisDeplie(isOpen ? null : key)}>
                    <td style={{padding:'14px 16px',fontWeight:700,color:'var(--ink-900)'}}>
                      <span style={{display:'inline-block',width:14,color:'var(--ink-400)'}}>{isOpen ? '▾' : '▸'}</span>{MOIS[fMois]} {fAnnee}
                      <div style={{fontSize:11,fontWeight:500,color:'var(--ink-400)',marginLeft:14}}>activité de {MOIS[mois]} {annee}</div>
                    </td>
                    <td style={{padding:'14px 16px',textAlign:'right',fontWeight:600,color:f1m>0?'#15803d':'var(--ink-300)',fontVariantNumeric:'tabular-nums'}}>
                      {f1m > 0 ? fmt(f1m) : '—'}
                    </td>
                    <td style={{padding:'14px 16px',textAlign:'center'}}>
                      {(f1m === 0 && f1?.statut !== 'paye') ? (
                        <span style={{color:'var(--ink-400)'}}>—</span>
                      ) : (
                        <span
                          onClick={(e) => { e.stopPropagation(); toggleF1Statut(annee, mois, f1) }}
                          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.06)'; e.currentTarget.style.filter = 'brightness(0.93)' }}
                          onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.filter = 'none' }}
                          title={f1?.statut === 'paye' ? 'Cliquer pour repasser « à facturer » (le montant redevient live)' : 'Cliquer pour marquer « reçu » (fige le montant)'}
                          style={{cursor:'pointer',display:'inline-block',borderRadius:99,transition:'transform .12s, filter .12s'}}>
                          <StatutFacture f={f1}/>
                        </span>
                      )}
                    </td>
                    <td style={{padding:'14px 16px',textAlign:'right',fontWeight:600,color:f2m>0?'#b91c1c':'var(--ink-300)',fontVariantNumeric:'tabular-nums'}}>
                      {f2m > 0 ? fmt(f2m) : '—'}
                    </td>
                    <td style={{padding:'14px 16px',textAlign:'center'}}>
                      {(f2m === 0 && f2?.statut !== 'paye') ? (
                        <span style={{color:'var(--ink-400)'}}>—</span>
                      ) : isAdmin ? (
                        <span
                          onClick={(e) => { e.stopPropagation(); toggleF2Statut(annee, mois, f2) }}
                          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.06)'; e.currentTarget.style.filter = 'brightness(0.93)' }}
                          onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.filter = 'none' }}
                          title={f2?.statut === 'paye' ? 'Cliquer pour repasser « à facturer » (le montant redevient live)' : 'Cliquer pour marquer « reçu » (fige le montant)'}
                          style={{cursor:'pointer',display:'inline-block',borderRadius:99,transition:'transform .12s, filter .12s'}}>
                          <StatutFacture f={f2}/>
                        </span>
                      ) : (
                        <StatutFacture f={f2}/>
                      )}
                    </td>
                    <td style={{padding:'14px 16px',textAlign:'right',fontWeight:800,color:n>=0?'var(--brand-800)':'#b91c1c',fontVariantNumeric:'tabular-nums'}}>
                      {n >= 0 ? '+' : ''}{fmt(n)}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr style={{background:'var(--surface-2)'}}>
                      <td colSpan={6} style={{padding:'4px 16px 16px'}}>
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:24,maxWidth:720}}>
                          <div style={{display:'flex',flexDirection:'column',gap:6}}>
                            <div className="eyebrow" style={{color:'#15803d'}}>F1 — Agente facture CTP</div>
                            {d.fraisN > 0 && <Row label="Frais de consultation" value={fmt(d.fraisN)} />}
                            {d.comN   > 0 && <Row label="Commissions artisans"   value={fmt(d.comN)} />}
                            {d.honN   > 0 && <Row label="Honoraires (courtage + AMO)" value={fmt(d.honN)} />}
                            {d.partN  > 0 && <Row label="Part partenaire"         value={fmt(d.partN)} />}
                            {f1m === 0 && <span style={{fontSize:12,color:'var(--ink-400)'}}>Aucun gain encaissé ce mois</span>}
                            <Row label="Total F1" value={fmt(f1m)} bold accent />
                            {f1?.facture_path && <button onClick={() => voirPdf(f1.facture_path)} style={{alignSelf:'flex-start',fontSize:11,color:'var(--brand-700)',background:'none',border:'none',cursor:'pointer',padding:0}}>📄 Voir le PDF</button>}
                          </div>
                          <div style={{display:'flex',flexDirection:'column',gap:6}}>
                            <div className="eyebrow" style={{color:'#b91c1c'}}>F2 — CTP facture l&apos;agente</div>
                            {d.redev     > 0 && <Row label="Redevance mensuelle (HT)" value={fmt(d.redev)} />}
                            {d.apporteur > 0 && <Row label="Apporteur remboursé"      value={fmt(d.apporteur)} />}
                            {f2m === 0 && <span style={{fontSize:12,color:'var(--ink-400)'}}>Aucune charge ce mois</span>}
                            <Row label="Total F2" value={fmt(f2m)} bold accent />
                            {f2?.facture_path && <button onClick={() => voirPdf(f2.facture_path)} style={{alignSelf:'flex-start',fontSize:11,color:'var(--brand-700)',background:'none',border:'none',cursor:'pointer',padding:0}}>📄 Voir le PDF</button>}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                )
              })}
              {months.length === 0 && (
                <tr><td colSpan={6} style={{padding:'32px 16px',textAlign:'center',color:'var(--ink-400)'}}>Aucune facturation à afficher</td></tr>
              )}
            </tbody>
            {months.length > 0 && (
              <tfoot>
                <tr style={{borderTop:'2px solid var(--ink-200)',background:'var(--surface-2)'}}>
                  <td style={{padding:'14px 16px',fontWeight:800,color:'var(--ink-900)'}}>Total</td>
                  <td style={{padding:'14px 16px',textAlign:'right',fontWeight:800,color:'#15803d',fontVariantNumeric:'tabular-nums'}}>{fmt(totalF1)}</td>
                  <td style={{padding:'14px 16px',textAlign:'center',fontSize:11,color:'var(--ink-400)'}}>{fmt(totalF1Paye)} reçu</td>
                  <td style={{padding:'14px 16px',textAlign:'right',fontWeight:800,color:'#b91c1c',fontVariantNumeric:'tabular-nums'}}>{fmt(totalF2)}</td>
                  <td style={{padding:'14px 16px',textAlign:'center',fontSize:11,color:'var(--ink-400)'}}>{fmt(totalF2Paye)} reçu</td>
                  <td style={{padding:'14px 16px',textAlign:'right',fontWeight:800,fontSize:15,fontVariantNumeric:'tabular-nums',color:net>=0?'var(--brand-800)':'#b91c1c'}}>
                    {net >= 0 ? '+' : ''}{fmt(net)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Détail factures F1 + F2 côte à côte */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:18}}>
          <FactureDetailCard
            title="F1 — Factures émises par l'agente"
            subtitle="L'agente facture CTP pour ses gains du mois (frais + commissions + honoraires)"
            type="agente_vers_ctp"
            accent="#16a34a"
          />
          <FactureDetailCard
            title="F2 — Factures émises par la franchisée"
            subtitle="CTP facture l'agente pour la redevance + apporteur remboursé"
            type="ctp_vers_agente"
            accent="#dc2626"
          />
        </div>

        {/* Redevances 12 mois */}
        <div className="card" style={{padding:22}}>
          <div style={{fontSize:15,fontWeight:700,color:'var(--ink-900)',marginBottom:14}}>Redevances mensuelles · {agenteActuelle?.redevance_mensuelle_ht != null ? `${agenteActuelle.redevance_mensuelle_ht} € HT` : 'montant à paramétrer'}</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(12,1fr)',gap:6}}>
            {MOIS_LABELS.map((mLabel, i) => {
              const r = redevAg.find(rv => rv.mois === i+1 && rv.annee === anneeEnCours)
              const isPast = new Date(anneeEnCours, i, 1) < new Date()
              return (
                <div key={i} style={{
                  padding:'10px 6px',textAlign:'center',borderRadius:8,
                  background:  r?.statut === 'regle' ? 'rgba(22,163,74,0.10)' : isPast ? 'rgba(245,158,11,0.13)' : 'var(--ink-50)',
                  border:'1px solid',borderColor: r?.statut === 'regle' ? 'rgba(22,163,74,0.2)' : isPast ? 'rgba(245,158,11,0.3)' : 'var(--ink-200)',
                }}>
                  <div style={{fontSize:10,fontWeight:700,color:'var(--ink-500)',textTransform:'uppercase'}}>{mLabel.slice(0,3)}</div>
                  <div style={{marginTop:6,fontSize:11.5,fontWeight:700,color:r?.statut==='regle'?'#15803d':isPast?'#a16207':'var(--ink-300)'}}>
                    {r?.statut === 'regle' ? '✓' : isPast ? '⌛' : '—'}
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{marginTop:14,fontSize:12.5,color:'var(--ink-500)'}}>
            {redevAg.filter(r => r.statut === 'regle').length} mois réglés ·
            <span style={{fontWeight:700,color:'var(--brand-800)',marginLeft:6,fontVariantNumeric:'tabular-nums'}}>{fmt(totalRedev)}</span> sur l&apos;année
          </div>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDU PRINCIPAL
  // ─────────────────────────────────────────────────────────────────────────────

  const periodOptions = [
    { key: 'chantier', label: 'Par chantier' },
    { key: 'mois',     label: 'Par mois'     },
    { key: 'annee',    label: 'Par année'    },
  ]

  if (loading) return <div className="page-loading" />

  // Panne de chargement : afficher l'erreur plutôt que des montants à 0 € trompeurs.
  // Ne se déclenche que sans données chargées ; les erreurs d'action (redevance/upload,
  // données déjà présentes) restent gérées par le bandeau de section existant.
  if (erreur && !dossiers.length) return (
    <div className="page-pad" style={{maxWidth:1400,margin:'0 auto'}}>
      <button onClick={() => router.push('/dashboard')} style={{fontSize:12,color:'var(--ink-400)',marginBottom:12,cursor:'pointer',display:'flex',alignItems:'center',gap:4,background:'none',border:0}}>← Retour</button>
      <div style={{background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:10,padding:'16px 20px',fontSize:14,color:'#b91c1c'}}>⚠️ {erreur}</div>
    </div>
  )

  return (
    <div className="page-enter page-pad" style={{display:'flex',flexDirection:'column',gap:20,maxWidth:1400,margin:'0 auto'}}>

      {/* En-tête page */}
      <div className="header-row" style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',gap:16,flexWrap:'wrap'}}>
        <div>
          <button onClick={() => router.push('/dashboard')} style={{fontSize:12,color:'var(--ink-400)',marginBottom:6,cursor:'pointer',display:'flex',alignItems:'center',gap:4,background:'none',border:0}}>← Retour</button>
          <div className="eyebrow" style={{marginBottom:4}}>Pilotage financier</div>
          <h1 className="page">Finances</h1>
          <div style={{color:'var(--ink-500)',fontSize:13,marginTop:6}}>
            Année <strong style={{color:'var(--ink-700)'}}>{anneeEnCours}</strong> · {dossiers.length} dossiers actifs
            {saving && <span style={{marginLeft:12,color:'var(--ink-400)',fontSize:12}}>Enregistrement…</span>}
          </div>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <button className="btn btn-ghost">📄 Exporter le bilan</button>
          <button className="btn btn-primary">🪙 Saisir un règlement</button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="tabs">
        <button className={`tab ${tab==='previsionnel'?'active':''}`} onClick={() => setTab('previsionnel')}>
          <span style={{display:'inline-flex',gap:8,alignItems:'center'}}>
            <span style={{padding:'1px 6px',borderRadius:5,fontSize:10,fontWeight:800,fontVariantNumeric:'tabular-nums',
              background:tab==='previsionnel'?'var(--brand-800)':'var(--ink-100)',
              color:tab==='previsionnel'?'#fff':'var(--ink-500)'}}>F1</span>
            F1 Prévisionnel
          </span>
        </button>
        <button className={`tab ${tab==='reel'?'active':''}`} onClick={() => setTab('reel')}>
          <span style={{display:'inline-flex',gap:8,alignItems:'center'}}>
            <span style={{padding:'1px 6px',borderRadius:5,fontSize:10,fontWeight:800,fontVariantNumeric:'tabular-nums',
              background:tab==='reel'?'var(--brand-800)':'var(--ink-100)',
              color:tab==='reel'?'#fff':'var(--ink-500)'}}>F2</span>
            F2 Réel
          </span>
        </button>
        <button className={`tab ${tab==='synthese'?'active':''}`} onClick={() => setTab('synthese')}>Synthèse</button>
        <button className={`tab ${tab==='suivi'?'active':''}`} onClick={() => setTab('suivi')}>📈Suivi financier</button>
        <button className={`tab ${tab==='facturation'?'active':''}`} onClick={() => setTab('facturation')}>🗒️Facturation agentes</button>
      </div>

      {/* KPI strip — même layout pour admin et agente, données scopées */}
      <div className="kpi-grid">
        <FinKpiCard label={`CA réel net ${anneeEnCours}`} value={fmt(totalNetCTP)} tone="brand">
          <div style={{marginTop:8}}>
            <div style={{height:4,borderRadius:2,background:'var(--ink-100)',overflow:'hidden',marginBottom:4}}>
              <div style={{height:'100%',borderRadius:2,background:'var(--brand-500)',width:`${Math.min(pctObjectif,100)}%`}}/>
            </div>
            <div style={{fontSize:11,color:'var(--ink-500)'}}>
              Objectif <span style={{fontWeight:600,color:'var(--ink-700)',fontVariantNumeric:'tabular-nums'}}>{fmt(objectifAnnuel)}</span> · {pctObjectif}%
            </div>
          </div>
        </FinKpiCard>
        <FinKpiCard label="CA prévisionnel"
          value={fmt(totPreviNet)}
          sub={`${fmt(round2(totComHT+totFraisHT))} brut · ${fmt(totRoyalties)} royalties`}
          tone="ok"/>
        <FinKpiCard label="Commissions HT"
          value={fmt(totComHT)}
          sub={`Frais conso. ${fmt(totFraisHT)} HT`}
          tone="warn"/>
        <FinKpiCard label={isAdmin ? "Part franchisée" : "Mes gains"}
          value={fmt(isAdmin ? round2(totalNetCTP-totalGainsAgentesReels) : totalGainsAgentesReels)}
          sub={isAdmin ? `Part agentes ${fmt(totalGainsAgentesReels)}` : 'Réels encaissés'}
          tone="brand"/>
      </div>

      {/* ── F1 PRÉVISIONNEL ── */}
      {tab === 'previsionnel' && (
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          <div className="card" style={{padding:'12px 16px',display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}>
            <div className="eyebrow">Vue</div>
            <div className="pill-toggle">
              {periodOptions.map(p => (
                <button key={p.key} onClick={() => setPeriod(p.key)} style={{
                  padding:'6px 12px', fontSize:12.5, fontWeight:600, borderRadius:7, border:'none', cursor:'pointer',
                  background: period === p.key ? '#fff' : 'transparent',
                  color:      period === p.key ? 'var(--brand-800)' : 'var(--ink-500)',
                  boxShadow:  period === p.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}>{p.label}</button>
              ))}
            </div>
            {isAdmin && (
              <div style={{marginLeft:6,display:'flex',gap:4,alignItems:'center'}}>
                <div className="eyebrow">Périmètre</div>
                <div className="pill-toggle" style={{marginLeft:8}}>
                  {[
                    { key:'tous', label:'Tous' },
                    { key:'moi', label: profile?.prenom || 'Moi' },
                    ...agentes.map(a => ({ key: a.id, label: a.prenom })),
                  ].map(s => (
                    <button key={s.key} onClick={() => setScope(s.key)} style={{
                      padding:'6px 12px', fontSize:12.5, fontWeight:600, borderRadius:7, border:'none', cursor:'pointer',
                      background: scope === s.key ? '#fff' : 'transparent',
                      color:      scope === s.key ? 'var(--brand-800)' : 'var(--ink-500)',
                      boxShadow:  scope === s.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    }}>{s.label}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {period === 'chantier' && renderFinanceTable(scopedDossiers, false)}
          {period === 'mois'     && renderTousPeriode(scopedDossiers, agrégerParPaiement(scopedDossiers, false), 'Mois')}
          {period === 'annee'    && renderTousPeriode(scopedDossiers, agrégerParPaiement(scopedDossiers, true), 'Année')}
        </div>
      )}

      {/* ── F2 RÉEL ── */}
      {tab === 'reel' && (
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          <div className="card" style={{padding:'12px 16px',display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}>
            <div className="eyebrow">Vue</div>
            <div className="pill-toggle">
              {periodOptions.map(p => (
                <button key={p.key} onClick={() => setPeriod(p.key)} style={{
                  padding:'6px 12px', fontSize:12.5, fontWeight:600, borderRadius:7, border:'none', cursor:'pointer',
                  background: period === p.key ? '#fff' : 'transparent',
                  color:      period === p.key ? 'var(--brand-800)' : 'var(--ink-500)',
                  boxShadow:  period === p.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}>{p.label}</button>
              ))}
            </div>
            {isAdmin && (
              <div style={{marginLeft:6,display:'flex',gap:4,alignItems:'center'}}>
                <div className="eyebrow">Périmètre</div>
                <div className="pill-toggle" style={{marginLeft:8}}>
                  {[
                    { key:'tous', label:'Tous' },
                    { key:'moi', label: profile?.prenom || 'Moi' },
                    ...agentes.map(a => ({ key: a.id, label: a.prenom })),
                  ].map(s => (
                    <button key={s.key} onClick={() => setScope(s.key)} style={{
                      padding:'6px 12px', fontSize:12.5, fontWeight:600, borderRadius:7, border:'none', cursor:'pointer',
                      background: scope === s.key ? '#fff' : 'transparent',
                      color:      scope === s.key ? 'var(--brand-800)' : 'var(--ink-500)',
                      boxShadow:  scope === s.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    }}>{s.label}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {period === 'chantier' && renderFinanceTable(scopedDossiers, true)}
          {period === 'mois'     && renderTousPeriode(scopedDossiers, agrégerParPaiement(scopedDossiers, false), 'Mois')}
          {period === 'annee'    && renderTousPeriode(scopedDossiers, agrégerParPaiement(scopedDossiers, true), 'Année')}
        </div>
      )}

      {/* ── SYNTHÈSE ── */}
      {tab === 'synthese' && <SyntheseView />}

      {/* ── SUIVI FINANCIER — toggle Agence/CTP admin-only ; agente : mode agence forcé ── */}
      {tab === 'suivi' && (
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          {isAdmin && (
            <PillToggle
              options={[{key:'agence',label:'Agence — Encaissements bruts'},{key:'ctp',label:'CTP — Résultat net (charges incluses)'}]}
              active={suiviMode}
              onChange={setSuiviMode}
            />
          )}
          {renderSuiviFinancier(isAdmin ? suiviMode : 'agence')}
        </div>
      )}

      {/* ── FACTURATION — même composant, données filtrées sur agente connectée ── */}
      {tab === 'facturation' && (
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          <FacturationAgentes />
        </div>
      )}

    </div>
  )
}