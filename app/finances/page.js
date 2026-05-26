// app/finances/page.js
'use client'
import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Chart, CategoryScale, LinearScale, BarElement, LineElement, PointElement, BarController, LineController, ArcElement, DoughnutController, Tooltip, Legend, Filler } from 'chart.js'
Chart.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, BarController, LineController, ArcElement, DoughnutController, Tooltip, Legend, Filler)
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '../lib/auth-context'
import { calculateDossierFinance } from '../lib/finance'
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
// COMPOSANT CHECKBOX + DATE
// ─────────────────────────────────────────────────────────────────────────────

function CheckItem({ label, checked, date, onChange, onDateChange, alert, disabled = false, colorClass = '' }) {
  const [localDate, setLocalDate] = useState(date || '')
  const [syncedDate, setSyncedDate] = useState(date)
  if (syncedDate !== date) {
    setSyncedDate(date)
    setLocalDate(date || '')
  }

  const handleCheck = (isChecked) => {
    const autoDate = isChecked && !date ? new Date().toISOString().split('T')[0] : null
    onChange(isChecked, autoDate)
  }

  return (
    <div className={`flex items-center gap-2 flex-wrap py-1 ${disabled ? 'opacity-40' : ''}`}>
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={!!checked}
          disabled={disabled}
          onChange={e => !disabled && handleCheck(e.target.checked)}
          className="w-4 h-4 rounded accent-blue-700"
        />
        <span className={`text-xs font-medium ${colorClass || (checked ? 'text-green-700' : 'text-gray-600')}`}>
          {label}
        </span>
      </label>
      {alert && !checked && (
        <span className="text-xs text-red-500 font-medium">{alert}</span>
      )}
      {checked && (
        <input
          type="date"
          value={localDate}
          onChange={e => {
            setLocalDate(e.target.value)
            if (e.target.value && e.target.value !== date) onDateChange(e.target.value)
          }}
          onBlur={e => { if (e.target.value && e.target.value !== date) onDateChange(e.target.value) }}
          className="border border-gray-200 rounded px-2 py-0.5 text-xs focus:outline-none focus:border-blue-400"
        />
      )}
    </div>
  )
}

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
  return <span style={{fontSize:11,padding:'2px 8px',borderRadius:99,fontWeight:600,background:s==='paye'?'rgba(22,163,74,0.1)':s==='facture'?'rgba(0,87,142,0.1)':'var(--ink-100)',color:s==='paye'?'#15803d':s==='facture'?'var(--brand-700)':'var(--ink-500)'}}>{s==='paye'?'✅ Payé':s==='facture'?'📋 Facturé':'📋 À facturer'}</span>
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
  const [agentePeriod, setAgentePeriod]             = useState('mois')
  const [factPeriod, setFactPeriod]                 = useState('mois')
  const [suiviMode, setSuiviMode]                   = useState('ctp')
  const [dossierOuvert, setDossierOuvert]           = useState(null)
  const [dossiers, setDossiers]                     = useState([])
  const [redevances, setRedevances]                 = useState([])
  const [agentes, setAgentes]                       = useState([])
  const [agenteSelectionnee, setAgenteSelectionnee] = useState(null)
  const [nomFranchisee, setNomFranchisee]           = useState('CTP')
  const [facturesAgente, setFacturesAgente]         = useState([])
  const [uploadingFactureAgente, setUploadingFactureAgente] = useState(null)
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
  const { user, profile, initialized } = useAuth()

  // ── CHARGEMENT ─────────────────────────────────────────────────────────────

  const chargerTout = async () => {
    const [
      { data: dossiersData },
      { data: redevancesData },
      { data: facturesAgenteData },
      { data: agentesData },
      { data: adminData },
      { data: objectifsData },
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
      supabase.from('profiles').select('*').eq('role', 'agente').order('prenom'),
      supabase.from('profiles').select('prenom, nom').eq('role', 'admin').single(),
      supabase.from('objectifs_ca').select('*').eq('annee', new Date().getFullYear()),
    ])
    setDossiers(dossiersData || [])
    setRedevances(redevancesData || [])
    setFacturesAgente(facturesAgenteData || [])
    setAgentes(agentesData || [])
    setAgenteSelectionnee(prev => prev || (profile?.role === 'agente' ? profile.id : agentesData?.[0]?.id) || null)
    if (adminData) setNomFranchisee(`${adminData.prenom} ${adminData.nom}`)
    setObjectifs(objectifsData || [])
  }

  // ── INIT ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!initialized) return
    if (!user) { router.push('/login'); return }
    if (!profile) return
    chargerTout().then(() => setLoading(false))
  }, [initialized, user?.id, profile?.id, router])

  // Agente : périmètre forcé sur ses propres données (pas de sélecteur scope)
  useEffect(() => {
    if (profile?.role === 'agente') setScope('moi')
  }, [profile?.role])

  // ── HELPERS PROFIL ─────────────────────────────────────────────────────────

  const isMarine     = profile?.role === 'admin'
  const nomReferente = (d) => d.referente ? `${d.referente.prenom} ${d.referente.nom}` : 'Agente'

  const getObjectif = (cible, agenteId = null) =>
    objectifs.find(o => o.cible === cible && o.agente_id === agenteId)?.montant || 0

  const sauvegarderObjectif = async (cible, agenteId, montant) => {
    const annee = new Date().getFullYear()
    const payload = { annee, cible, agente_id: agenteId || null, montant: parseFloat(montant) || 0 }

    const query = supabase.from('objectifs_ca').select('id')
      .eq('annee', annee).eq('cible', cible)
    const { data: existing } = agenteId
      ? await query.eq('agente_id', agenteId).maybeSingle()
      : await query.is('agente_id', null).maybeSingle()

    if (existing) {
      await supabase.from('objectifs_ca').update({ montant: parseFloat(montant) || 0 }).eq('id', existing.id)
    } else {
      await supabase.from('objectifs_ca').insert(payload)
    }

    const { data } = await supabase.from('objectifs_ca').select('*').eq('annee', annee)
    setObjectifs(data || [])
  }

  // ── CALCUL FINANCIER ───────────────────────────────────────────────────────
  // calculer() : extrait les valeurs depuis lib/finance.js — zéro calcul inline
  // calculerReel() : applique les déclencheurs suivi_financier — une seule source de vérité

  const calculerBase = (d) => {
    const normalized = normalizeDossier(d)
    const f = calculateDossierFinance(normalized)

    const partAgente = f.settings.partAgente

    const estChantierMarine = d.referente?.role === 'admin'
    const devisActifs       = (d.devis_artisans || []).filter(dv => dv.statut !== 'refuse')
    const devisAcceptes     = devisActifs.filter(dv => dv.statut === 'accepte')

    // Map devisId → données finance
    const devisFinanceMap = new Map(f.commissions.devis.map(dv => [dv.id, dv]))
    // Map devisId → ligne apporteur
    const apporteurMap    = new Map((f.apporteur.lines || []).map(l => [l.devisId, l]))

    return {
      // Référence brute
      finance: f,
      estChantierMarine,
      devisActifs,
      devisAcceptes,
      devisFinanceMap,
      apporteurMap,
      partAgenteRate: partAgente,

      // Taux affichage
      tauxCourtagePct: round2(f.settings.tauxCourtage * 100),
      tauxAmoPct:      round2(f.settings.tauxAmo * 100),

      // Frais
      fraisHT:       round2(f.frais.fraisHT),
      fraisTTC:      round2(f.frais.fraisTTC),
      fraisRoyalties: round2(f.frais.royalties),
      fraisNet:      round2(f.frais.net),
      fraisAgente:   round2(f.frais.parts.agente),
      fraisAdmin:    round2(f.frais.parts.admin),

      // Commissions (tous devis actifs)
      comHT:          round2(f.commissions.comHT),
      comTTC:         round2(f.commissions.comTTC),
      royaltiesCom:   round2(f.commissions.royaltiesType2),
      netCom:         round2(f.commissions.netCom),
      comAgente:      round2(f.commissions.parts.agente),
      comAdmin:       round2(f.commissions.parts.admin),

      // Commissions signées uniquement
      comHTSigne:     round2(f.commissions.devis.filter(dv => dv.signed).reduce((s, dv) => s + dv.comHT, 0)),
      comTTCSigne:    round2(f.commissions.devis.filter(dv => dv.signed).reduce((s, dv) => s + dv.comTTC, 0)),
      royaltiesComSigne: round2(f.commissions.devis.filter(dv => dv.signed).reduce((s, dv) => s + dv.royaltiesType2, 0)),
      netComSigne:    round2(f.commissions.devis.filter(dv => dv.signed).reduce((s, dv) => s + dv.netCom, 0)),
      comAgenteSigne: round2(f.commissions.devis.filter(dv => dv.signed).reduce((s, dv) => s + dv.parts.agente, 0)),
      comAdminSigne:  round2(f.commissions.devis.filter(dv => dv.signed).reduce((s, dv) => s + dv.parts.admin, 0)),

      // Honoraires courtage
      courtTTC:       round2(f.honoraires.courtage.ttc),
      courtHT:        round2(f.honoraires.courtage.ht),
      courtRoyalties: round2(f.honoraires.courtage.royalties),
      courtNet:       round2(f.honoraires.courtage.net),
      courtAgente:    round2(f.honoraires.courtage.parts.agente),
      courtAdmin:     round2(f.honoraires.courtage.parts.admin),

      // Honoraires AMO solde
      amoTTC:         round2(f.honoraires.soldeAmo.ttc),
      amoHT:          round2(f.honoraires.soldeAmo.ht),
      amoRoyalties:   round2(f.honoraires.soldeAmo.royalties),
      amoNet:         round2(f.honoraires.soldeAmo.net),
      amoAgente:      round2(f.honoraires.soldeAmo.parts.agente),
      amoAdmin:       round2(f.honoraires.soldeAmo.parts.admin),

      // Honoraires total
      honTotalTTC:    round2(f.honoraires.totalTTC),
      honTotalNet:    round2(f.honoraires.totalNet),
      honAgente:      round2(f.honoraires.parts.agente),
      honAdmin:       round2(f.honoraires.parts.admin),

      // Apporteur client
      apporteurTotalHT: round2(f.apporteur.totalHT),
      apporteurAgente:  round2(f.apporteur.parts.agente),
      apporteurAdmin:   round2(f.apporteur.parts.admin),
      apporteurAgenteReel: round2(f.apporteur.partsReel.agente),
      apporteurAdminReel:  round2(f.apporteur.partsReel.admin),

      // Royalties globales
      royaltiesTotal: round2(f.royalties.total),
      sommeRoyalties: round2(f.royalties.total),

      // Gains prévisionnels nets
      gainsAgentePrevi: round2(f.gains.netsPrevi.agente),
      gainsAdminPrevi:  round2(f.gains.netsPrevi.admin),

      // Prévisionnel frais
      fraisNetPrevi:    d.frais_statut !== 'offerts' ? round2(f.frais.net) : 0,
      fraisAgentePrevi: d.frais_statut !== 'offerts' ? round2(f.frais.parts.agente) : 0,

      // Prévisionnel commissions tous devis
      netComTous: round2(f.commissions.netCom),
      comAgenteTous: round2(f.commissions.parts.agente),

      // Prévisionnel commissions apporteurs
      comApporteursPrevi: round2(
        f.commissions.devis.filter(dv => dv.isApporteur)
          .reduce((s, dv) => s + dv.netCom, 0)
      ),
      comApporteursAgentePrevi: round2(
        f.commissions.devis.filter(dv => dv.isApporteur)
          .reduce((s, dv) => s + dv.parts.agente, 0)
      ),

      // Prévisionnel honoraires (tous devis actifs)
      honPreviNet:    round2(f.honorairesPrevi.totalNet),
      honPreviAgente: round2(f.honorairesPrevi.parts.agente),
      honPreviAdmin:  round2(f.honorairesPrevi.parts.admin),

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

    // Acompte AMO — commun aux deux branches (Marine et non-Marine)
    const acompteAmoSF = d.typologie === 'amo'
      ? (d.suivi_financier || []).find(sf => sf.type_echeance === 'acompte_amo' && sf.statut_client === 'regle')
      : null
    const acompteAmoHT     = acompteAmoSF ? round2(Number(acompteAmoSF.montant_ttc || 0) / 1.1) : 0
    const acompteAmoRoy    = round2(acompteAmoHT * 0.05)
    const acompteAmoNet    = round2(acompteAmoHT - acompteAmoRoy)
    const acompteAmoAgente = round2(acompteAmoNet * c.partAgenteRate)

    if (c.estChantierMarine) {
      const fraisReel = d.frais_statut === 'regle' ? c.fraisNet : 0
      const courtageRegle = getSuivi(d, 'honoraires_courtage')?.statut_client === 'regle'
      const amoRegle = d.typologie === 'amo' && getSuivi(d, 'solde_amo')?.statut_client === 'regle'
      const soldeAmoNetM = amoRegle ? round2(c.amoNet - acompteAmoNet) : 0
      const honReel = round2((courtageRegle ? c.courtNet : 0) + acompteAmoNet + soldeAmoNetM)
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
      return { ...c, fraisReel, fraisAgenteReel: 0, honReel, comReelNet, comApporteursReel, royaltiesReelTotal: 0, apporteurRembourse: apporteurRetire, gainAgenteReel: 0, gainAdminReel, gainsAgenteReels: 0, acompteAmoNet, acompteAmoAgente, soldeAmoNet: soldeAmoNetM, soldeAmoAgente: 0 }
    }

    // Frais — HT net si réglé
    const fraisRegle         = d.frais_statut === 'regle'
    const fraisReel          = fraisRegle ? c.fraisNet : 0
    const fraisRoyaltiesReel = fraisRegle ? c.fraisRoyalties : 0
    const fraisAgenteReel    = fraisRegle ? c.fraisAgente : 0

    // Honoraires — HT net si réglé
    const courtageRegle  = getSuivi(d, 'honoraires_courtage')?.statut_client === 'regle'
    const amoRegle       = d.typologie === 'amo' && getSuivi(d, 'solde_amo')?.statut_client === 'regle'
    const honCourtageReel = courtageRegle ? c.courtNet : 0
    const soldeAmoNet    = amoRegle ? round2(c.amoNet - acompteAmoNet) : 0
    const soldeAmoAgente = amoRegle ? round2(c.amoAgente - acompteAmoAgente) : 0
    const honAMOReel     = round2(acompteAmoNet + soldeAmoNet)
    const honReel        = round2(honCourtageReel + honAMOReel)
    const royaltiesHonReel = round2(
      (courtageRegle ? c.courtRoyalties : 0) +
      acompteAmoRoy +
      (amoRegle ? round2(c.amoRoyalties - acompteAmoRoy) : 0)
    )
    const honAgenteReel  = round2(
      (courtageRegle ? c.courtAgente : 0) +
      acompteAmoAgente +
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

    const royaltiesReelTotal = round2(fraisRoyaltiesReel + royaltiesHonReel + royaltiesComReel)
    const gainAgenteReel = round2(fraisAgenteReel + honAgenteReel + comAgenteReel + comApporteursAgente - apporteurRembourse)
    const gainAdminReel = round2(fraisReel + honReel + comReelNet + comApporteursReel - gainAgenteReel)

    return {
      ...c,
      fraisReel,
      fraisAgenteReel,
      honReel,
      honAgenteReel,
      acompteAmoNet,
      acompteAmoAgente,
      soldeAmoNet,
      soldeAmoAgente,
      comReelNet,
      comAgenteReel,
      comApporteursReel,
      comApporteursAgente,
      royaltiesReelTotal,
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

  const majSuivi = async (dossierId, type, artisanId, champOrUpdates, valeur) => {
    setSaving(true)
    const updates = typeof champOrUpdates === 'object'
      ? champOrUpdates
      : { [champOrUpdates]: valeur }
    try {
      let query = supabase.from('suivi_financier').select('id')
        .eq('dossier_id', dossierId).eq('type_echeance', type)
      query = artisanId ? query.eq('artisan_id', artisanId) : query.is('artisan_id', null)
      const { data: existing } = await query.maybeSingle()

      let error
      if (existing) {
        ;({ error } = await supabase.from('suivi_financier').update(updates).eq('id', existing.id))
      } else {
        ;({ error } = await supabase.from('suivi_financier').insert({
          dossier_id: dossierId, type_echeance: type,
          artisan_id: artisanId || null, ...updates,
        }))
      }
      if (error) { alert('Erreur sauvegarde : ' + error.message); return }

      // Sync frais_statut sur dossiers
      if (type === 'frais_consultation' && updates.statut_client !== undefined) {
        await supabase.from('dossiers').update({ frais_statut: updates.statut_client }).eq('id', dossierId)
      }

      if (type === 'facture_finale' && updates.statut_client !== undefined && artisanId) {
        const statutFacture = updates.statut_client === 'regle' ? 'paye' : 'en_attente'
        await supabase.from('factures_artisans').update({ statut: statutFacture })
          .eq('dossier_id', dossierId).eq('artisan_id', artisanId)
      }
      await chargerTout()
    } finally {
      setSaving(false)
    }
  }

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

    // Sync redevance quand Facture 2 change de statut
    if (type === 'ctp_vers_agente') {
      const agenteProfile = agentes.find(a => a.id === agenteId)
      const montantRedevance = agenteProfile?.redevance_mensuelle_ht ?? null
      const { error: redevErr } = await supabase.from('redevances').upsert({
        agente_id: agenteId,
        annee,
        mois,
        montant_ht: montantRedevance,
        statut: updates.statut === 'paye' ? 'regle' : 'en_attente',
        date_paiement: updates.statut === 'paye' ? new Date().toISOString().split('T')[0] : null,
      }, { onConflict: 'agente_id,annee,mois' })
      if (redevErr) setErreur('Redevance : ' + redevErr.message)
    }

    const { data } = await supabase.from('factures_agente').select('*')
      .order('annee', { ascending: false }).order('mois', { ascending: false })
    setFacturesAgente(data || [])
    await chargerTout()
  }


  // ── LISTES DÉRIVÉES ────────────────────────────────────────────────────────

  const dossiersAgentes = dossiers.filter(d => d.referente?.role === 'agente')
  const mesDossiers     = isMarine
    ? dossiers.filter(d => d.referente?.role === 'admin')
    : dossiers.filter(d => d.referente?.id === profile?.id)
  const dossiersAgente   = agenteSelectionnee
    ? dossiers.filter(d => d.referente?.id === agenteSelectionnee)
    : dossiersAgentes
  const agenteActuelle   = agentes.find(a => a.id === agenteSelectionnee)
  const nomAgente        = agenteActuelle ? `${agenteActuelle.prenom} ${agenteActuelle.nom}` : 'Agente'
  const redevancesAgente = agenteSelectionnee
    ? redevances.filter(r => r.agente_id === agenteSelectionnee)
    : redevances
  const mesRedevances    = profile?.id ? redevances.filter(r => r.agente_id === profile.id) : redevances

  // ── PÉRIMÈTRE SCOPÉ (défini tôt pour pouvoir scoper les KPI) ──────────────
  const scopedDossiers = isMarine
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
    apporteurRembourseNet: 0,
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
    const suiviFrais = suivi.find(s => s.type_echeance === 'frais_consultation' && s.statut_client === 'regle')
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

      // Solde AMO
      const suiviAmo = suivi.find(s => s.type_echeance === 'solde_amo' && s.statut_client === 'regle')
      if (c.soldeAmoNet > 0 && suiviAmo) {
        const dateAmo = suiviAmo?.date_paiement || d.date_fin_chantier
        const key = getKeyFromDate(dateAmo, isAnnee)
        addToKey(key, 'amoNet', c.soldeAmoNet, d.id)
        addToKey(key, 'honAgenteNet', c.soldeAmoAgente, d.id)
      }

      // Acompte AMO
      const suiviAcompteAmo = suivi.find(s => s.type_echeance === 'acompte_amo' && s.statut_client === 'regle')
      if (c.acompteAmoNet > 0 && suiviAcompteAmo) {
        const dateAcompteAmo = suiviAcompteAmo?.date_paiement || d.date_fin_chantier
        const key = getKeyFromDate(dateAcompteAmo, isAnnee)
        addToKey(key, 'amoNet', c.acompteAmoNet, d.id)
        addToKey(key, 'honAgenteNet', c.acompteAmoAgente, d.id)
      }

      // Commissions artisans normaux
      const devisActifs = (d.devis_artisans || []).filter(dv => dv.statut === 'accepte')
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
        const ligne = finance.find(l => {
          const dv = (d.devis_artisans || []).find(dv => dv.id === l.devisId)
          return (dv?.artisan_id || dv?.artisan?.id) === sf.artisan_id
        })
        if (ligne) addToKey(key, 'apporteurRembourseNet', ligne.totalHT, d.id)
      }
    })

    // Calculer gains agente/admin par bucket
    Object.values(map).forEach(agg => {
      agg.honReel = round2(agg.courtNet + agg.amoNet)
      agg.comReelNet = agg.comNet
      agg.comApporteursReel = agg.comApporteursNet
      agg.gainsAgenteReels = round2(agg.fraisAgenteNet + agg.honAgenteNet + agg.comAgenteNet + agg.comApporteursAgenteNet)
      agg.gainAdminReel = round2(agg.fraisNet + agg.honReel + agg.comReelNet + agg.comApporteursReel - agg.gainsAgenteReels - agg.apporteurRembourseNet)    })

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

  const totalRedevancesReglees = redevances
    .filter(r => r.statut === 'regle' && r.annee === anneeEnCours)
    .reduce((s, r) => s + (r.montant_ttc || 540), 0)

  const totalGainsAgentesReels = (() => {
    const keysAnnee = rowsReelScoped
      .filter(([k]) => k.startsWith(String(anneeEnCours)))
      .map(([, agg]) => agg)
    return round2(keysAnnee.reduce((s, agg) => s + (agg.gainsAgenteReels || 0), 0))
  })()

  const totalNetCTP = (() => {
    const keysAnnee = rowsReelScoped.filter(([k]) => k.startsWith(String(anneeEnCours)))
    const reelProduits = keysAnnee.reduce((s, [, agg]) => s + round2((agg.fraisNet||0) + (agg.comReelNet||0) + (agg.honReel||0) + (agg.comApporteursReel||0)), 0)
    const reelRedev = (isMarine ? redevances : mesRedevances).filter(r => r.statut === 'regle' && r.annee === anneeEnCours).reduce((s, r) => s + (r.montant_ht || 0), 0)
    const reelCharges = keysAnnee.reduce((s, [, agg]) => s + (agg.gainsAgenteReels || 0), 0)
    return round2(reelProduits + reelRedev - reelCharges)
  })()

  const mesDossiersGainsPrevi  = mesDossiers.reduce((s, d) => s + calculer(d).gainsAgentePrevi, 0)
  const mesDossiersGainsReels  = mesDossiers.reduce((s, d) => s + calculerReel(d).gainsAgenteReels, 0)
  const mesApporteurDu         = mesDossiers.reduce((s, d) => s + calculer(d).apporteurAgente, 0)
  const mesRedevancesReglees   = mesRedevances.filter(r => r.statut === 'regle').reduce((s, r) => s + (r.montant_ttc || 540), 0)
  const monNet                 = mesDossiersGainsReels - mesRedevancesReglees - mesApporteurDu

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
  }, [scopedDossiers, objectifs])
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
                <RepartRow label="Apporteur client" value={`-${fmt(isReel ? r.apporteurRembourse : (c.estChantierMarine ? c.apporteurAdmin : c.apporteurAgente))}`} accent="warn" />
              )}
              <div style={{height:1, background:'var(--ink-200)', margin:'4px 0'}}/>
              <RepartRow label={labelNet} value={fmt(value)} bold />
              <div style={{height:1, background:'var(--ink-200)', margin:'4px 0'}}/>
              <RepartRow label={`${c.estChantierMarine ? 'Franchisée' : nomFranchisee} (${Math.round(partAdminRate * 100)}%)`} value={fmt(gainAdmin)} />
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

  // ── MES CHANTIERS par période ───────────────────────────────────────────────

  const renderMesPeriode = (listeDossiers, colLabel, rows) => {
    const colonnesMarine = [
      { label: 'Frais net',    key: 'fraisNet',          type: 'normal' },
      { label: 'Com. net',     key: 'comNet',             type: 'normal' },
      { label: 'Com. apport.', key: 'comApporteursNet',   type: 'normal' },
      { label: 'Hon. court.',  key: 'courtNet',           type: 'normal' },
      { label: 'Hon. AMO',     key: 'amoNet',             type: 'normal' },
      { label: 'Apporteur',    key: 'apporteurRembourseNet', type: 'neg' },
      { label: nomFranchisee,  key: 'gainAdminReel',      type: 'total'  },
    ]
    const colonnesAgente = [
      { label: 'Frais net',    key: 'fraisAgenteNet',          type: 'normal' },
      { label: 'Com. net',     key: 'comAgenteNet',            type: 'normal' },
      { label: 'Com. apport.', key: 'comApporteursAgenteNet',  type: 'normal' },
      { label: 'Hon. net',     key: 'honAgenteNet',            type: 'normal' },
      { label: 'Apporteur',    key: 'apporteurRembourseNet',   type: 'neg'    },
      { label: 'Mes gains',    key: 'gainsAgenteReels',        type: 'total'  },
    ]
    const colonnes = isMarine ? colonnesMarine : colonnesAgente
    const getDossierMontant = (d, key, periodKey) => {
      const agg = agrégerParPaiement([d], periodKey?.includes('-') ? false : true)
        .find(([k]) => k === periodKey)?.[1]
      if (!agg) return 0
      return agg[key] || 0
    }
    return renderTableauPeriode(listeDossiers, rows, colLabel, colonnes, (agg, key) => agg[key] || 0, getDossierMontant)
  }

  // ── TOUS LES CHANTIERS par période (admin) ─────────────────────────────────

  const renderTousPeriode = (listeDossiers, rows, colLabel) => {
    const colonnes = [
      { label: 'Frais net',    key: 'fraisNet',          type: 'normal' },
      { label: 'Com. net',     key: 'comNet',             type: 'normal' },
      { label: 'Com. apport.', key: 'comApporteursNet',   type: 'normal' },
      { label: 'Hon. net',     key: 'honReel',            type: 'normal' },
      { label: 'Apporteur',    key: 'apporteurRembourseNet', type: 'neg' },
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
      if (isCTP) return round2(brut - (r.gainsAgenteReels||0) - (r.apporteurRembourseNet||0))
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
      const reelCharges   = isCTP ? round2((r.gainsAgenteReels||0) + round2((r.comReelNet||0) * (0.05 / 0.95)) + (r.apporteurRembourseNet||0)) : 0
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
        { label: '(−) Royalties illiCO',      p: p.royalties||0,   r: round2((r.comReelNet||0) * (0.05 / 0.95)) },
        { label: '(−) Part agentes',          p: p.partAgentes||0, r: r.gainsAgenteReels||0 },
        { label: '(−) Apporteurs remboursés', p: p.apporteur||0,   r: r.apporteurRembourseNet||0 },
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
    const chartCharges = cles.map(cle => { const r = rowsReel.find(([k]) => k === cle)?.[1] || {}; return isCTP ? -round2((r.gainsAgenteReels||0) + (r.apporteurRembourseNet||0)) : 0 })
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
        totR.frais = round2(totR.frais + (r.fraisNet||0)); totR.com = round2(totR.com + (r.comReelNet||0)); totR.comApport = round2(totR.comApport + (r.comApporteursReel||0)); totR.hon = round2(totR.hon + (r.honReel||0)); totR.redev = round2(totR.redev + redev); totR.partAgentes = round2(totR.partAgentes + (r.gainsAgenteReels||0)); totR.royalties = round2(totR.royalties + round2((r.comReelNet||0) * (0.05 / 0.95)))
        const apporteurReel = dossiers.reduce((s, d) => { const lignes = (d.suivi_financier || []).filter(sf => sf.type_echeance === 'apporteur_agente' && sf.statut_ctp === 'rembourse' && sf.date_paiement && getKeyFromDate(sf.date_paiement, false) === cle); if (!lignes.length) return s; const c2 = calculerReel(d); return s + round2((c2.finance?.apporteur?.lines || []).reduce((sum, ligne) => { const dv = (d.devis_artisans || []).find(dv => dv.id === ligne.devisId); const artId = dv?.artisan_id || dv?.artisan?.id; const sf = (d.suivi_financier || []).find(s2 => s2.type_echeance === 'apporteur_agente' && s2.artisan_id === artId && s2.statut_ctp === 'rembourse' && s2.date_paiement && getKeyFromDate(s2.date_paiement, false) === cle); return sf ? sum + ligne.agente : sum }, 0)) }, 0)
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
      const chartChargesAnnee = clesMois.map(cle => { const r = rowsReelAnnee.find(([k]) => k === cle)?.[1] || {}; return isCTP ? -round2((r.gainsAgenteReels||0) + (r.apporteurRembourseNet||0)) : 0 })
      const chartNetAnnee = clesMois.map((_, i) => round2(chartProduitsAnnee[i] + chartChargesAnnee[i]))
      return (
        <div className="space-y-5">
          <ObjectifBar label={isCTP ? 'Objectif CA CTP (résultat net)' : 'Objectif CA agence (encaissements bruts)'} reel={reelNet} objectifMontant={getObjectif('agence')} cible="agence" canEdit={isMarine} onSave={sauvegarderObjectif} />
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
              objectifMontant={objectifMensuel} cible="agence" canEdit={isMarine} onSave={sauvegarderObjectif} />
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

  const renderFacturationMoisSuivi = () => {
    const rowsReel = agrégerParPaiement(mesDossiers, false)
    if (rowsReel.length === 0) return <p className="text-center text-gray-400 text-sm py-8">Aucune donnée</p>

    const getFactureAgenteMoisType = (mois, annee, type) =>
      facturesAgente.find(f => f.mois === mois && f.annee === annee && f.agente_id === profile?.id && f.type_facture === type)

    const upsertFactureMoisType = async (mois, annee, montant, type, updates) => {
      const existing = getFactureAgenteMoisType(mois, annee, type)
      const agenteId = profile?.id
      if (existing) {
        await supabase.from('factures_agente').update(updates).eq('id', existing.id)
      } else {
        await supabase.from('factures_agente').insert({ agente_id: agenteId, mois, annee, montant, type_facture: type, ...updates })
      }
      if (type === 'ctp_vers_agente') {
        const montantRedevance = profile?.redevance_mensuelle_ht ?? 540
        await supabase.from('redevances').upsert({
          agente_id: agenteId, annee, mois, montant_ttc: montantRedevance,
          statut: updates.statut === 'paye' ? 'regle' : 'en_attente',
          date_paiement: updates.statut === 'paye' ? new Date().toISOString().split('T')[0] : null,
        }, { onConflict: 'agente_id,annee,mois' })
      }
      const { data } = await supabase.from('factures_agente').select('*')
        .order('annee', { ascending: false }).order('mois', { ascending: false })
      setFacturesAgente(data || [])
      await chargerTout()
    }

    const uploadFacturePdfType = async (mois, annee, montant, type, fichier) => {
      setUploadingFactureAgente(`${annee}-${mois}-${type}`)
      const ext = fichier.name.split('.').pop()
      const chemin = `factures_agente/${profile?.id}/${annee}-${String(mois).padStart(2,'0')}-${type}.${ext}`
      const { error } = await supabase.storage.from('documents').upload(chemin, fichier, { upsert: true })
      if (!error) {
        await upsertFactureMoisType(mois, annee, montant, type, { facture_path: chemin, statut: 'facture' })
        setSucces('Facture uploadée ✓')
      } else { setErreur('Erreur upload : ' + error.message) }
      setUploadingFactureAgente(null)
    }

    // Côté agente : émettrice F1 (select+upload), réceptrice F2 (badge + case cochée payé)
    return (
      <div className="space-y-4">
        {succes && <p className="text-green-600 text-sm bg-green-50 border border-green-200 rounded-lg px-4 py-2">{succes}</p>}
        {erreur && <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-2">{erreur}</p>}
        {rowsReel.map(([key, agg]) => {
          const [anneeStr, moisStr] = key.split('-')
          const annee = parseInt(anneeStr); const mois = parseInt(moisStr)
          const label = `${MOIS[mois]} ${annee}`
          const montantF1 = round2((agg.fraisAgenteNet||0) + (agg.comAgenteNet||0) + (agg.honAgenteNet||0) + (agg.comApporteursAgenteNet||0))
          const debutRedev = profile?.redevance_debut ? new Date(profile.redevance_debut) : null
          const moisConcerne = new Date(annee, mois - 1, 1)
          const redevMois = debutRedev && moisConcerne >= debutRedev ? (profile?.redevance_mensuelle_ht ?? 540) : 0
          const apporteurMois = round2(agg.apporteurRembourseNet||0)
          const montantF2 = round2(redevMois + apporteurMois)
          const net = round2(montantF1 - montantF2)
          const f1 = getFactureAgenteMoisType(mois, annee, 'agente_vers_ctp')
          const f2 = getFactureAgenteMoisType(mois, annee, 'ctp_vers_agente')
          const uploadKey1 = `${annee}-${mois}-agente_vers_ctp`

          const statutBadge = (f) => {
            const s = f?.statut || 'a_facturer'
            return <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${s === 'paye' ? 'text-green-700 bg-green-50 border-green-300' : s === 'facture' ? 'text-blue-700 bg-blue-50 border-blue-300' : 'text-gray-500 bg-gray-50 border-gray-200'}`}>
              {s === 'paye' ? '✅ Payé' :  '📋 À facturer'}
            </span>
          }

          return (
            <div key={key} className="card">
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 18px',background:'var(--surface-2)',borderBottom:'1px solid var(--ink-100)'}}>
                <span style={{fontWeight:700,color:'var(--ink-900)',fontSize:14}}>{label}</span>
                <span style={{fontWeight:700,fontSize:13,color: net >= 0 ? '#15803d' : '#b91c1c'}}>Net : {net >= 0 ? '+' : ''}{fmt(net)}</span>
              </div>
              <div style={{padding:16,display:'flex',flexDirection:'column',gap:12}}>
                {/* Facture 1 — émettrice */}
                <div style={{border:'1px solid var(--ink-100)',borderRadius:10,padding:12,display:'flex',flexDirection:'column',gap:8}}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xs font-semibold text-green-800">{nomAgente} doit facturer à {nomFranchisee}</p>                    </div>
                    <span className="text-sm font-bold text-green-700">{fmt(montantF1)}</span>
                  </div>
                  <div className="space-y-1 text-xs text-green-700">
                    {(agg.fraisAgenteNet||0) > 0 && <div className="flex justify-between"><span>Frais consultation</span><span>{fmt(agg.fraisAgenteNet)}</span></div>}
                    {(agg.comAgenteNet||0) > 0 && <div className="flex justify-between"><span>Commissions</span><span>{fmt(agg.comAgenteNet)}</span></div>}
                    {(agg.honAgenteNet||0) > 0 && <div className="flex justify-between"><span>Honoraires</span><span>{fmt(agg.honAgenteNet)}</span></div>}
                    {(agg.comApporteursAgenteNet||0) > 0 && <div className="flex justify-between"><span>Com. apporteurs</span><span>{fmt(agg.comApporteursAgenteNet)}</span></div>}
                  </div>
                  {/* Agente = émettrice : select statut + upload */}
                  <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-green-100">
                    <select value={f1?.statut || 'a_facturer'}
                      onChange={e => upsertFactureMoisType(mois, annee, montantF1, 'agente_vers_ctp', { statut: e.target.value })}
                      className={`border rounded px-2 py-1 text-xs focus:outline-none ${f1?.statut === 'paye' ? 'border-green-300 bg-white text-green-700' : f1?.statut === 'facture' ? 'border-blue-300 bg-white text-blue-700' : 'border-gray-200 text-gray-600 bg-white'}`}>
                      <option value="a_facturer">📋 À facturer</option>
                      
                      <option value="paye">✅ Payé</option>
                    </select>
                    {f1?.facture_path ? (
                      <div className="flex items-center gap-2">
                        <button onClick={async () => { const { data } = await supabase.storage.from('documents').createSignedUrl(f1.facture_path, 3600); if (data?.signedUrl) window.open(data.signedUrl, '_blank') }} className="text-xs text-blue-600 hover:underline">📄 Voir</button>
                        <label className="text-xs text-gray-400 cursor-pointer hover:text-blue-600">Remplacer<input type="file" accept=".pdf" className="hidden" onChange={e => e.target.files[0] && uploadFacturePdfType(mois, annee, montantF1, 'agente_vers_ctp', e.target.files[0])} /></label>
                      </div>
                    ) : (
                      <label className={`text-xs cursor-pointer px-2 py-1 rounded border transition-all ${uploadingFactureAgente === uploadKey1 ? 'text-gray-400 border-gray-200' : 'text-blue-600 border-blue-200 bg-white hover:bg-blue-50'}`}>
                        {uploadingFactureAgente === uploadKey1 ? 'Upload...' : '+ Uploader PDF'}
                        <input type="file" accept=".pdf" className="hidden" disabled={uploadingFactureAgente === uploadKey1} onChange={e => e.target.files[0] && uploadFacturePdfType(mois, annee, montantF1, 'agente_vers_ctp', e.target.files[0])} />
                      </label>
                    )}
                  </div>
                </div>
                {/* Facture 2 — réceptrice */}
                {montantF2 > 0 && (
                  <div style={{border:'1px solid var(--ink-100)',borderRadius:10,padding:12,display:'flex',flexDirection:'column',gap:8}}>
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-xs font-semibold text-red-800">{nomFranchisee} doit facturer à {nomAgente}</p>
                      </div>
                      <span className="text-sm font-bold text-red-700">{fmt(montantF2)}</span>
                    </div>
                    <div className="space-y-1 text-xs text-red-700">
                      {redevMois > 0 && <div className="flex justify-between"><span>Redevance mensuelle</span><span>{fmt(redevMois)}</span></div>}
                      {apporteurMois > 0 && <div className="flex justify-between"><span>Apporteur client remboursé</span><span>{fmt(apporteurMois)}</span></div>}
                    </div>
                    {/* Agente = réceptrice : badge statut + case à cocher "J&apos;ai payé" */}
                    <div className="flex items-center gap-3 pt-1 border-t border-red-100 flex-wrap">
                      {statutBadge(f2)}
                      {f2?.facture_path && (
                        <button onClick={async () => { const { data } = await supabase.storage.from('documents').createSignedUrl(f2.facture_path, 3600); if (data?.signedUrl) window.open(data.signedUrl, '_blank') }} className="text-xs text-blue-600 hover:underline">📄 Voir facture</button>
                      )}
                      <label className="flex items-center gap-1.5 cursor-pointer ml-auto">
                        <input type="checkbox" checked={f2?.statut === 'paye'}
                          onChange={e => upsertFactureMoisType(mois, annee, montantF2, 'ctp_vers_agente', { statut: e.target.checked ? 'paye' : 'facture' })}
                          className="w-4 h-4 accent-red-600" />
                        <span className="text-xs text-red-700 font-medium">J&apos;ai payé</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ── FACTURATION ANNEE AGENTE ───────────────────────────────────────────────

  const renderFacturationAnneeAgente = () => {
    const annees = []
    for (let a = new Date().getFullYear(); a >= 2024; a--) annees.push(a)
    const rowsReel = agrégerParPaiement(mesDossiers, false)

    const clesMois = Array.from(new Set(rowsReel.map(([k]) => k)))
      .filter(k => k.startsWith(String(anneeSelectionnee))).sort()

    let totalF1 = 0, totalF2 = 0, totalPayeF1 = 0, totalPayeF2 = 0

    const lignes = clesMois.map(cle => {
      const [, mStr] = cle.split('-')
      const mois = parseInt(mStr)
      const agg = rowsReel.find(([k]) => k === cle)?.[1] || {}
      const montantF1 = round2((agg.fraisAgenteNet||0) + (agg.comAgenteNet||0) + (agg.honAgenteNet||0) + (agg.comApporteursAgenteNet||0))
      const debutRedev = profile?.redevance_debut ? new Date(profile.redevance_debut) : null
      const moisConcerne = new Date(anneeSelectionnee, mois - 1, 1)
      const redev = debutRedev && moisConcerne >= debutRedev ? (profile?.redevance_mensuelle_ht ?? 540) : 0
      const montantF2 = round2(redev + (agg.apporteurRembourseNet||0))
      const f1 = facturesAgente.find(f => f.mois === mois && f.annee === anneeSelectionnee && f.agente_id === profile?.id && f.type_facture === 'agente_vers_ctp')
      const f2 = facturesAgente.find(f => f.mois === mois && f.annee === anneeSelectionnee && f.agente_id === profile?.id && f.type_facture === 'ctp_vers_agente')
      totalF1 += montantF1; totalF2 += montantF2
      if (f1?.statut === 'paye') totalPayeF1 += montantF1
      if (f2?.statut === 'paye') totalPayeF2 += montantF2
      return { mois, cle, montantF1, montantF2, f1, f2 }
    })

    const statutBadge = (f) => {
      const s = f?.statut || 'a_facturer'
      return <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${s === 'paye' ? 'text-green-700 bg-green-50 border-green-300' : s === 'facture' ? 'text-blue-700 bg-blue-50 border-blue-300' : 'text-gray-500 bg-gray-50 border-gray-200'}`}>
        {s === 'paye' ? '✅ Payé' :  '📋 À facturer'}
      </span>
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="grid grid-cols-2 gap-3 flex-1">
            <div className="bg-green-50 border border-green-200 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1">📤 {nomFranchisee} me doit (F1)</p>
              <p className="text-lg font-bold text-green-700">{fmt(totalF1)}</p>
              <p className="text-xs text-gray-400 mt-0.5">Reçu : {fmt(totalPayeF1)} · En attente : {fmt(round2(totalF1 - totalPayeF1))}</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1">📥 Je dois à {nomFranchisee} (F2)</p>
              <p className="text-lg font-bold text-red-600">{fmt(totalF2)}</p>
              <p className="text-xs text-gray-400 mt-0.5">Payé : {fmt(totalPayeF2)} · Restant : {fmt(round2(totalF2 - totalPayeF2))}</p>
            </div>
            <div className={`border rounded-xl p-3 ${round2(totalF1-totalF2) >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'}`}>
              <p className="text-xs text-gray-500 mb-1">Net indicatif</p>
              <p className={`text-lg font-bold ${round2(totalF1-totalF2) >= 0 ? 'text-blue-700' : 'text-amber-600'}`}>
                  {round2(totalF1-totalF2) >= 0 ? '+' : ''}{fmt(round2(totalF1-totalF2))}
              </p>
            </div>
            <select value={anneeSelectionnee} onChange={e => setAnneeSelectionnee(parseInt(e.target.value))}
              className="ml-4 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-400">
              {annees.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>                   
        </div>
        <div className="card" style={{overflow:'hidden'}}>
          <table className="w-full text-xs">
            <thead style={{background:'var(--surface-2)',borderBottom:'1px solid var(--ink-200)'}}>
              <tr>
                {thL('Mois')}
                {thR('F1 (je facture)')}
                {thR('Statut F1')}
                {thR('F2 (je reçois)')}
                {thR('Statut F2')}
                {thR('Net')}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lignes.map(({ mois, montantF1, montantF2, f1, f2 }) => {
                const net = round2(montantF1 - montantF2)
                return (
                  <tr key={mois} className="hover:bg-gray-50">
                    <td className="px-3 py-2.5 font-medium text-gray-800">{MOIS[mois]} {anneeSelectionnee}</td>
                    <td className="px-3 py-2.5 text-right text-green-700 font-medium">{fmt(montantF1)}</td>
                    <td className="px-3 py-2.5 text-right">{statutBadge(f1)}</td>
                    <td className="px-3 py-2.5 text-right text-red-600">{montantF2 > 0 ? fmt(montantF2) : '—'}</td>
                    <td className="px-3 py-2.5 text-right">{montantF2 > 0 ? statutBadge(f2) : '—'}</td>
                    <td className={`px-3 py-2.5 text-right font-bold ${net >= 0 ? 'text-blue-700' : 'text-amber-600'}`}>{net >= 0 ? '+' : ''}{fmt(net)}</td>
                  </tr>
                )
              })}
              {lignes.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">Aucune donnée pour {anneeSelectionnee}</td></tr>}
            </tbody>
            {lignes.length > 0 && (
              <tfoot className="bg-gray-50 border-t-2 border-gray-300 font-bold">
                <tr>
                  <td className="px-3 py-2 text-gray-700">Total</td>
                  <td className="px-3 py-2 text-right text-green-700">{fmt(totalF1)}</td>
                  <td className="px-3 py-2 text-right text-xs text-gray-400">{fmt(totalPayeF1)} payé</td>
                  <td className="px-3 py-2 text-right text-red-600">{fmt(totalF2)}</td>
                  <td className="px-3 py-2 text-right text-xs text-gray-400">{fmt(totalPayeF2)} payé</td>
                  <td className={`px-3 py-2 text-right ${round2(totalF1-totalF2) >= 0 ? 'text-blue-700' : 'text-amber-600'}`}>{round2(totalF1-totalF2) >= 0 ? '+' : ''}{fmt(round2(totalF1-totalF2))}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    )
  }

  // ── SUIVI FINANCIER AGENTE ─────────────────────────────────────────────────

  const renderSuiviAgenteFinancier = () => {
    const rowsReel = agrégerParPaiement(mesDossiers, false)
    const objectifMensuel = round2(getObjectif('agente', profile?.id) / 12)
    const objectifAgence  = getObjectif('agence')

    const getReelNetAgente = (agg, redev) =>
      round2((agg.gainsAgenteReels||0) - redev - (agg.apporteurRembourseNet||0))

    const allKeys = new Set([
      ...rowsReel.map(([k]) => k),
      ...mesRedevances.filter(r => r.statut === 'regle').map(r => `${r.annee}-${String(r.mois).padStart(2, '0')}`),
    ])
    const cles = Array.from(allKeys).sort((a, b) => b.localeCompare(a))

    const sfSousOnglet    = agentePeriod
    const setSfSousOnglet = setAgentePeriod

    const chartLabels = cles.map(cle => { const [a, m] = cle.split('-'); return `${MOIS[parseInt(m)].slice(0,3)}. ${a}` })
    const chartProduits = cles.map(cle => {
      const agg = rowsReel.find(([k]) => k === cle)?.[1] || {}
      return round2((agg.fraisAgenteNet||0) + (agg.comAgenteNet||0) + (agg.honAgenteNet||0) + (agg.comApporteursAgenteNet||0))
    })
    const chartCharges = cles.map(cle => {
      const [a, m] = cle.split('-')
      const redev = mesRedevances.filter(r => r.statut === 'regle' && r.annee === parseInt(a) && r.mois === parseInt(m)).reduce((s, r) => s + (r.montant_ttc||540), 0)
      const agg = rowsReel.find(([k]) => k === cle)?.[1] || {}
      return -round2(redev + (agg.apporteurRembourseNet||0))
    })
    const chartNet = cles.map((_, i) => round2(chartProduits[i] + chartCharges[i]))

    // CR mensuel agente pour accordéon
    const crAgentePourCle = (cle) => {
      const [a, m] = cle.split('-')
      const agg = rowsReel.find(([k]) => k === cle)?.[1] || {}
      const redev = mesRedevances.filter(r => r.statut === 'regle' && r.annee === parseInt(a) && r.mois === parseInt(m)).reduce((s, r) => s + (r.montant_ttc||540), 0)
      const gains = round2((agg.fraisAgenteNet||0) + (agg.comAgenteNet||0) + (agg.honAgenteNet||0) + (agg.comApporteursAgenteNet||0))
      const charges = round2(redev + (agg.apporteurRembourseNet||0))
      const net = round2(gains - charges)
      const mapPrevi = {}
      mesDossiers.forEach(d => {
        const key = getKeyFromDate(d.date_signature_contrat || d.created_at, false)
        if (!key) return
        if (!mapPrevi[key]) mapPrevi[key] = { frais: 0, com: 0, hon: 0, comApport: 0, apporteur: 0 }
        const c = calculer(d)
        mapPrevi[key].frais     = round2(mapPrevi[key].frais     + c.fraisAgentePrevi)
        mapPrevi[key].com       = round2(mapPrevi[key].com       + c.comAgenteTous)
        mapPrevi[key].hon       = round2(mapPrevi[key].hon       + c.honPreviAgente)
        mapPrevi[key].comApport = round2(mapPrevi[key].comApport + c.comApporteursAgentePrevi)
        mapPrevi[key].apporteur = round2(mapPrevi[key].apporteur + c.apporteurAgente)
      })
      const p = mapPrevi[cle] || {}
      const previGains = round2((p.frais||0) + (p.com||0) + (p.hon||0) + (p.comApport||0))
      const previCharges = round2((p.apporteur||0) + redev)
      const previNet = round2(previGains - previCharges)
      const ecart = (pv, rv) => { const e = round2(rv-pv); return <span className={`text-xs font-medium ${e>=0?'text-green-600':'text-red-500'}`}>{e>=0?'+':''}{fmt(e)}</span> }
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
              {[
                { label: '(+) Frais consultation', p: p.frais||0, r: agg.fraisAgenteNet||0 },
                { label: '(+) Commissions',        p: p.com||0,   r: agg.comAgenteNet||0 },
                { label: '(+) Honoraires',         p: p.hon||0,   r: agg.honAgenteNet||0 },
                { label: '(+) Com. apporteurs',    p: p.comApport||0, r: agg.comApporteursAgenteNet||0 },
              ].map(({ label, p: pv, r: rv }) => (
                <tr key={label}>
                  <td className="px-2 py-1.5 text-gray-500">{label}</td>
                  <td className="px-2 py-1.5 text-right text-gray-500">{fmt(pv)}</td>
                  <td className="px-2 py-1.5 text-right text-green-700 font-medium">{fmt(rv)}</td>
                  <td className="px-2 py-1.5 text-right">{ecart(pv, rv)}</td>
                </tr>
              ))}
              <tr className="bg-gray-50 border-t border-gray-200">
                <td className="px-2 py-1.5 font-medium text-gray-700">= Total gains</td>
                <td className="px-2 py-1.5 text-right font-medium text-gray-700">{fmt(previGains)}</td>
                <td className="px-2 py-1.5 text-right font-medium text-green-700">{fmt(gains)}</td>
                <td className="px-2 py-1.5 text-right">{ecart(previGains, gains)}</td>
              </tr>
              <tr className="bg-gray-50"><td colSpan={4} className="px-2 py-1 text-xs font-medium text-gray-400 uppercase">Charges</td></tr>
              {[
                { label: '(−) Redevance', p: redev, r: redev },
                { label: '(−) Apporteur remboursé', p: p.apporteur||0, r: agg.apporteurRembourseNet||0 },
              ].map(({ label, p: pv, r: rv }) => (
                <tr key={label}>
                  <td className="px-2 py-1.5 text-gray-500">{label}</td>
                  <td className="px-2 py-1.5 text-right text-gray-500">{fmt(pv)}</td>
                  <td className="px-2 py-1.5 text-right text-red-500 font-medium">{fmt(rv)}</td>
                  <td className="px-2 py-1.5 text-right">{ecart(pv, rv)}</td>
                </tr>
              ))}
              <tr className="bg-gray-50 border-t border-gray-200">
                <td className="px-2 py-1.5 font-medium text-gray-700">= Total charges</td>
                <td className="px-2 py-1.5 text-right font-medium text-gray-700">{fmt(previCharges)}</td>
                <td className="px-2 py-1.5 text-right font-medium text-red-500">{fmt(charges)}</td>
                <td className="px-2 py-1.5 text-right">{ecart(previCharges, charges)}</td>
              </tr>
              <tr className="bg-blue-50 border-t-2 border-blue-100">
                <td className="px-2 py-2 font-bold text-blue-800">= Mon net</td>
                <td className="px-2 py-2 text-right font-bold text-gray-600">{fmt(previNet)}</td>
                <td className={`px-2 py-2 text-right font-bold ${net>=0?'text-blue-800':'text-red-600'}`}>{fmt(net)}</td>
                <td className="px-2 py-2 text-right">{ecart(previNet, net)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )
    }

    // CR annuel agente
    const crAgenteAnnuel = () => {
      const annees = []
      for (let a = new Date().getFullYear(); a >= 2024; a--) annees.push(a)
      const rowsReelAnnee = agrégerParPaiement(mesDossiers, false)
      const clesMois = Array.from(new Set([
        ...rowsReelAnnee.map(([k]) => k),
        ...mesRedevances.filter(r => r.statut === 'regle').map(r => `${r.annee}-${String(r.mois).padStart(2,'0')}`),
      ])).filter(k => k.startsWith(String(anneeSelectionnee))).sort()

      const totG = { frais: 0, com: 0, hon: 0, comApport: 0 }
      const totC = { redev: 0, apporteur: 0 }
      const prevG = { frais: 0, com: 0, hon: 0, comApport: 0 }
      const prevC = { redev: 0, apporteur: 0 }

      const mapPrevi = {}
      mesDossiers.forEach(d => {
        const key = getKeyFromDate(d.date_signature_contrat || d.created_at, false)
        if (!key) return
        if (!mapPrevi[key]) mapPrevi[key] = { frais: 0, com: 0, hon: 0, comApport: 0, apporteur: 0 }
        const c = calculer(d)
        mapPrevi[key].frais     = round2(mapPrevi[key].frais     + c.fraisAgentePrevi)
        mapPrevi[key].com       = round2(mapPrevi[key].com       + c.comAgenteTous)
        mapPrevi[key].hon       = round2(mapPrevi[key].hon       + c.honPreviAgente)
        mapPrevi[key].comApport = round2(mapPrevi[key].comApport + c.comApporteursAgentePrevi)
        mapPrevi[key].apporteur = round2(mapPrevi[key].apporteur + c.apporteurAgente)
      })

      clesMois.forEach(cle => {
        const [, m] = cle.split('-')
        const r = rowsReelAnnee.find(([k]) => k === cle)?.[1] || {}
        const p = mapPrevi[cle] || {}
        const redev = mesRedevances.filter(rv => rv.statut === 'regle' && rv.annee === anneeSelectionnee && rv.mois === parseInt(m)).reduce((s, rv) => s + (rv.montant_ttc||540), 0)
        totG.frais = round2(totG.frais + (r.fraisAgenteNet||0))
        totG.com   = round2(totG.com   + (r.comAgenteNet||0))
        totG.hon   = round2(totG.hon   + (r.honAgenteNet||0))
        totG.comApport = round2(totG.comApport + (r.comApporteursAgenteNet||0))
        totC.redev = round2(totC.redev + redev)
        totC.apporteur = round2(totC.apporteur + (r.apporteurRembourseNet||0))
        prevG.frais = round2(prevG.frais + (p.frais||0)); prevG.com = round2(prevG.com + (p.com||0))
        prevG.hon = round2(prevG.hon + (p.hon||0)); prevG.comApport = round2(prevG.comApport + (p.comApport||0))
        prevC.apporteur = round2(prevC.apporteur + (p.apporteur||0)); prevC.redev = round2(prevC.redev + redev)
      })

      const reelGains = round2(totG.frais + totG.com + totG.hon + totG.comApport)
      const reelCharges = round2(totC.redev + totC.apporteur)
      const reelNet = round2(reelGains - reelCharges)
      const previGains = round2(prevG.frais + prevG.com + prevG.hon + prevG.comApport)
      const previCharges = round2(prevC.redev + prevC.apporteur)
      const previNet = round2(previGains - previCharges)
      const ecart = (p, r) => { const e = round2(r-p); return <span className={`text-xs font-medium ${e>=0?'text-green-600':'text-red-500'}`}>{e>=0?'+':''}{fmt(e)}</span> }

      const chartLabelsA = clesMois.map(cle => { const [,m] = cle.split('-'); return MOIS[parseInt(m)].slice(0,3) })
      const chartProduitsA = clesMois.map(cle => { const r = rowsReelAnnee.find(([k])=>k===cle)?.[1]||{}; return round2((r.fraisAgenteNet||0)+(r.comAgenteNet||0)+(r.honAgenteNet||0)+(r.comApporteursAgenteNet||0)) })
      const chartChargesA = clesMois.map(cle => { const [,m]=cle.split('-'); const r=rowsReelAnnee.find(([k])=>k===cle)?.[1]||{}; const redev=mesRedevances.filter(rv=>rv.statut==='regle'&&rv.annee===anneeSelectionnee&&rv.mois===parseInt(m)).reduce((s,rv)=>s+(rv.montant_ttc||540),0); return -round2(redev+(r.apporteurRembourseNet||0)) })
      const chartNetA = clesMois.map((_,i)=>round2(chartProduitsA[i]+chartChargesA[i]))

      return (
        <div className="space-y-5">
          <ObjectifBar label="Mon objectif CA annuel" reel={reelNet}
            objectifMontant={getObjectif('agente', profile?.id)} cible="agente"
            agenteId={profile?.id} canEdit={true} onSave={sauvegarderObjectif} />
          {objectifAgence > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
              Objectif CA agence : <span className="font-bold">{fmt(objectifAgence)}</span>
            </div>
          )}
          <div className="card" style={{overflow:'hidden'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 20px',background:'var(--surface-2)',borderBottom:'1px solid var(--ink-200)'}}>
              <span style={{fontSize:14,fontWeight:600,color:'var(--ink-700)'}}>Mon compte de résultat</span>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <span style={{fontSize:11,padding:'2px 8px',borderRadius:99,background:'rgba(22,163,74,0.1)',color:'#15803d',fontWeight:600}}>réel encaissé</span>
                <select value={anneeSelectionnee} onChange={e => setAnneeSelectionnee(parseInt(e.target.value))}
                  className="input" style={{height:28,fontSize:12,padding:'0 8px'}}>
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
                  { label: '(+) Frais consultation', p: prevG.frais, r: totG.frais },
                  { label: '(+) Commissions', p: prevG.com, r: totG.com },
                  { label: '(+) Honoraires', p: prevG.hon, r: totG.hon },
                  { label: '(+) Com. apporteurs', p: prevG.comApport, r: totG.comApport },
                ].map(({ label, p, r }) => (
                  <tr key={label} className="hover:bg-gray-50">
                    <td className="px-5 py-2.5 text-gray-500 text-xs">{label}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500 text-xs">{fmt(p)}</td>
                    <td className="px-4 py-2.5 text-right text-green-700 text-xs font-medium">{fmt(r)}</td>
                    <td className="px-5 py-2.5 text-right">{ecart(p, r)}</td>
                  </tr>
                ))}
                <tr className="bg-gray-50 border-t border-gray-200">
                  <td className="px-5 py-2.5 font-medium text-gray-700 text-xs">= Total gains</td>
                  <td className="px-4 py-2.5 text-right font-medium text-gray-700 text-xs">{fmt(previGains)}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-green-700 text-xs">{fmt(reelGains)}</td>
                  <td className="px-5 py-2.5 text-right">{ecart(previGains, reelGains)}</td>
                </tr>
                <tr className="bg-gray-50"><td colSpan={4} className="px-5 py-1.5 text-xs font-medium text-gray-400 uppercase">Charges</td></tr>
                {[
                  { label: '(−) Redevances', p: prevC.redev, r: totC.redev },
                  { label: '(−) Apporteurs remboursés', p: prevC.apporteur, r: totC.apporteur },
                ].map(({ label, p, r }) => (
                  <tr key={label} className="hover:bg-gray-50">
                    <td className="px-5 py-2.5 text-gray-500 text-xs">{label}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500 text-xs">{fmt(p)}</td>
                    <td className="px-4 py-2.5 text-right text-red-500 text-xs font-medium">{fmt(r)}</td>
                    <td className="px-5 py-2.5 text-right">{ecart(p, r)}</td>
                  </tr>
                ))}
                <tr className="bg-gray-50 border-t border-gray-200">
                  <td className="px-5 py-2.5 font-medium text-gray-700 text-xs">= Total charges</td>
                  <td className="px-4 py-2.5 text-right font-medium text-gray-700 text-xs">{fmt(previCharges)}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-red-500 text-xs">{fmt(reelCharges)}</td>
                  <td className="px-5 py-2.5 text-right">{ecart(previCharges, reelCharges)}</td>
                </tr>
                <tr className="bg-blue-50 border-t-2 border-blue-100">
                  <td className="px-5 py-3 font-bold text-blue-800 text-sm">= Mon net {anneeSelectionnee}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-600 text-sm">{fmt(previNet)}</td>
                  <td className={`px-4 py-3 text-right font-bold text-sm ${reelNet>=0?'text-blue-800':'text-red-600'}`}>{fmt(reelNet)}</td>
                  <td className="px-5 py-3 text-right">{ecart(previNet, reelNet)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <SuiviCTPChart labels={chartLabelsA} produitsData={chartProduitsA} chargesData={chartChargesA} netData={chartNetA} chartId={`chart_agente_annee_${anneeSelectionnee}`} />
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
            <ObjectifBar label={`Mon objectif mensuel (${fmt(objectifMensuel)}/mois)`}
              reel={(() => {
                const moisCourant = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
                const agg = rowsReel.find(([k]) => k === moisCourant)?.[1] || {}
                const redev = mesRedevances.filter(rv => rv.statut === 'regle' && rv.annee === new Date().getFullYear() && rv.mois === new Date().getMonth() + 1).reduce((s, rv) => s + (rv.montant_ttc||540), 0)
                return getReelNetAgente(agg, redev)
              })()}
              objectifMontant={objectifMensuel} cible="agente" agenteId={profile?.id} canEdit={true} onSave={sauvegarderObjectif} />
            {objectifAgence > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
                Objectif CA agence : <span className="font-bold">{fmt(objectifAgence)}</span>
              </div>
            )}
            <SuiviCTPChart labels={chartLabels} produitsData={chartProduits} chargesData={chartCharges} netData={chartNet} chartId="chart_agente_mois" />
            <div className="card" style={{overflow:'hidden'}}>
              <table className="w-full text-xs">
                <thead style={{background:'var(--surface-2)',borderBottom:'1px solid var(--ink-200)'}}>
                  <tr>
                    <th style={{textAlign:'left',padding:'12px 16px',fontSize:11,fontWeight:700,color:'var(--ink-500)',textTransform:'uppercase'}}>Mois</th>
                    <th style={{textAlign:'right',padding:'12px 12px',fontSize:11,fontWeight:700,color:'var(--ink-500)',textTransform:'uppercase'}}>Réel net</th>
                    <th style={{textAlign:'right',padding:'12px 12px',fontSize:11,fontWeight:700,color:'var(--ink-500)',textTransform:'uppercase'}}>Objectif mois</th>
                    <th style={{textAlign:'right',padding:'12px 16px',fontSize:11,fontWeight:700,color:'var(--ink-500)',textTransform:'uppercase'}}>vs Objectif</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cles.map((cle, i) => {
                    const [a, m] = cle.split('-')
                    const label = `${MOIS[parseInt(m)].slice(0,3)}. ${a}`
                    const agg = rowsReel.find(([k]) => k === cle)?.[1] || {}
                    const redev = mesRedevances.filter(rv => rv.statut === 'regle' && rv.annee === parseInt(a) && rv.mois === parseInt(m)).reduce((s, rv) => s + (rv.montant_ttc||540), 0)
                    const reelNet = getReelNetAgente(agg, redev)
                    const ecartObj = round2(reelNet - objectifMensuel)
                    const isOpen = moisOuvert === `agente_${cle}`
                    const bg = i % 2 === 0 ? '' : 'bg-gray-50'
                    return (
                      <React.Fragment key={cle}>
                        <tr className={`cursor-pointer hover:bg-blue-50 ${bg}`} onClick={() => setMoisOuvert(isOpen ? null : `agente_${cle}`)}>
                          <td className="px-4 py-2.5 font-medium text-gray-700 flex items-center gap-2">
                            <span>{label}</span>
                            <span className="text-gray-300 text-xs">{isOpen ? '▲' : '▼'}</span>
                          </td>
                          <td className={`px-3 py-2.5 text-right font-medium ${reelNet >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmt(reelNet)}</td>
                          <td className="px-3 py-2.5 text-right text-gray-400">{fmt(objectifMensuel)}</td>
                          <td className={`px-4 py-2.5 text-right font-medium ${ecartObj >= 0 ? 'text-green-600' : 'text-red-500'}`}>{ecartObj >= 0 ? '+' : ''}{fmt(ecartObj)}</td>
                        </tr>
                        {isOpen && (
                          <tr className={bg}>
                            <td colSpan={4} className="px-4 pb-3">{crAgentePourCle(cle)}</td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                  <tr className="bg-gray-50 border-t-2 border-gray-300 font-bold text-xs">
                    <td className="px-4 py-2.5 text-gray-700">Total</td>
                    <td className={`px-3 py-2.5 text-right ${cles.reduce((s,cle)=>{const [a,m]=cle.split('-');const agg=rowsReel.find(([k])=>k===cle)?.[1]||{};const redev=mesRedevances.filter(rv=>rv.statut==='regle'&&rv.annee===parseInt(a)&&rv.mois===parseInt(m)).reduce((sv,rv)=>sv+(rv.montant_ttc||540),0);return s+getReelNetAgente(agg,redev)},0)>=0?'text-green-700':'text-red-600'}`}>
                      {fmt(cles.reduce((s,cle)=>{const [a,m]=cle.split('-');const agg=rowsReel.find(([k])=>k===cle)?.[1]||{};const redev=mesRedevances.filter(rv=>rv.statut==='regle'&&rv.annee===parseInt(a)&&rv.mois===parseInt(m)).reduce((sv,rv)=>sv+(rv.montant_ttc||540),0);return s+getReelNetAgente(agg,redev)},0))}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-400">{fmt(objectifMensuel * cles.length)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500">—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
        {sfSousOnglet === 'annee' && crAgenteAnnuel()}
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
    const totalF1     = facturesAg.filter(f => f.type_facture === 'agente_vers_ctp').reduce((s, f) => s + (f.montant||0), 0)
    const totalF1Paye = facturesAg.filter(f => f.type_facture === 'agente_vers_ctp' && f.statut === 'paye').reduce((s, f) => s + (f.montant||0), 0)
    const totalF2     = facturesAg.filter(f => f.type_facture === 'ctp_vers_agente').reduce((s, f) => s + (f.montant||0), 0)
    const totalF2Paye = facturesAg.filter(f => f.type_facture === 'ctp_vers_agente' && f.statut === 'paye').reduce((s, f) => s + (f.montant||0), 0)
    const totalRedev  = redevAg.filter(r => r.statut === 'regle').reduce((s, r) => s + (r.montant_ht||0), 0)
    const net         = round2(totalF1 - totalF2)

    const months = [...new Set(facturesAg.map(f => `${f.annee}-${String(f.mois).padStart(2,'0')}`))].sort((a, b) => b.localeCompare(a))

    const uploadPdf = async (f, fichier) => {
      const key = `${f.annee}-${f.mois}-${f.type_facture}`
      setUploadingFactureAgente(key)
      const ext = fichier.name.split('.').pop()
      const chemin = `factures_agente/${agenteSelectionnee}/${f.annee}-${String(f.mois).padStart(2,'0')}-${f.type_facture}.${ext}`
      const { error } = await supabase.storage.from('documents').upload(chemin, fichier, { upsert: true })
      if (!error) {
        await upsertFactureMoisType(f.mois, f.annee, f.montant||0, f.type_facture, { facture_path: chemin, statut: 'facture' })
        setSucces('Facture uploadée ✓')
      } else { setErreur('Erreur upload : ' + error.message) }
      setUploadingFactureAgente(null)
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
            {fs.map(f => (
              <div key={f.id} style={{display:'grid',gridTemplateColumns:'1fr auto auto',gap:12,alignItems:'center',padding:'12px 18px',borderTop:'1px solid var(--ink-100)'}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:'var(--ink-900)'}}>{MOIS[f.mois]} {f.annee}</div>
                  <div style={{fontSize:11,color:'var(--ink-500)',marginTop:2}}>
                    {f.facture_path
                      ? <button onClick={async () => { const { data } = await supabase.storage.from('documents').createSignedUrl(f.facture_path, 3600); if (data?.signedUrl) window.open(data.signedUrl, '_blank') }}
                          style={{fontSize:11,color:'var(--brand-700)',background:'none',border:'none',cursor:'pointer',padding:0}}>📄 Voir le PDF</button>
                      : <span style={{color:'var(--ink-400)'}}>Pas de PDF déposé</span>}
                  </div>
                </div>
                <div style={{fontWeight:700,color:'var(--ink-900)',fontVariantNumeric:'tabular-nums'}}>{fmt(f.montant||0)}</div>
                <div style={{display:'flex',gap:6,alignItems:'center'}}>
                  <StatutFacture f={f}/>
                  {!f.facture_path && (
                    <label style={{fontSize:11,padding:'4px 8px',borderRadius:6,border:'1px solid var(--ink-200)',cursor:'pointer',color:'var(--ink-600)',background:'#fff'}}>
                      📤 PDF
                      <input type="file" accept=".pdf" className="hidden" onChange={e => e.target.files[0] && uploadPdf(f, e.target.files[0])}/>
                    </label>
                  )}
                </div>
              </div>
            ))}
            {fs.length === 0 && <div style={{padding:24,textAlign:'center',color:'var(--ink-400)',fontSize:13}}>Aucune facture</div>}
          </div>
        </div>
      )
    }

    return (
      <div style={{display:'flex',flexDirection:'column',gap:18}}>
        {/* Sélecteur agente — admin uniquement (agente voit sa propre facturation) */}
        {isMarine && (
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
          <FinKpiCard label="F1 — Gains à facturer"       value={fmt(totalF1)}    sub={`Payé ${fmt(totalF1Paye)} · Reste ${fmt(round2(totalF1-totalF1Paye))}`} tone="ok"/>
          <FinKpiCard label="F2 — Redevances + apporteur" value={fmt(totalF2)}    sub={`Payé ${fmt(totalF2Paye)}`}                                              tone="warn"/>
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
                const [aStr, mStr] = key.split('-')
                const mois = parseInt(mStr); const annee = parseInt(aStr)
                const f1 = facturesAg.find(f => f.type_facture === 'agente_vers_ctp' && f.mois === mois && f.annee === annee)
                const f2 = facturesAg.find(f => f.type_facture === 'ctp_vers_agente' && f.mois === mois && f.annee === annee)
                const f1m = f1?.montant || 0
                const f2m = f2?.montant || 0
                const n   = round2(f1m - f2m)
                return (
                  <tr key={key} style={{borderTop:'1px solid var(--ink-100)'}} className="row-hover">
                    <td style={{padding:'14px 16px',fontWeight:700,color:'var(--ink-900)'}}>{MOIS[mois]} {annee}</td>
                    <td style={{padding:'14px 16px',textAlign:'right',fontWeight:600,color:f1m>0?'#15803d':'var(--ink-300)',fontVariantNumeric:'tabular-nums'}}>
                      {f1m > 0 ? fmt(f1m) : '—'}
                    </td>
                    <td style={{padding:'14px 16px',textAlign:'center'}}><StatutFacture f={f1}/></td>
                    <td style={{padding:'14px 16px',textAlign:'right',fontWeight:600,color:f2m>0?'#b91c1c':'var(--ink-300)',fontVariantNumeric:'tabular-nums'}}>
                      {f2m > 0 ? fmt(f2m) : '—'}
                    </td>
                    <td style={{padding:'14px 16px',textAlign:'center'}}><StatutFacture f={f2}/></td>
                    <td style={{padding:'14px 16px',textAlign:'right',fontWeight:800,color:n>=0?'var(--brand-800)':'#b91c1c',fontVariantNumeric:'tabular-nums'}}>
                      {n >= 0 ? '+' : ''}{fmt(n)}
                    </td>
                  </tr>
                )
              })}
              {months.length === 0 && (
                <tr><td colSpan={6} style={{padding:'32px 16px',textAlign:'center',color:'var(--ink-400)'}}>Aucune facture enregistrée</td></tr>
              )}
            </tbody>
            {months.length > 0 && (
              <tfoot>
                <tr style={{borderTop:'2px solid var(--ink-200)',background:'var(--surface-2)'}}>
                  <td style={{padding:'14px 16px',fontWeight:800,color:'var(--ink-900)'}}>Total</td>
                  <td style={{padding:'14px 16px',textAlign:'right',fontWeight:800,color:'#15803d',fontVariantNumeric:'tabular-nums'}}>{fmt(totalF1)}</td>
                  <td style={{padding:'14px 16px',textAlign:'center',fontSize:11,color:'var(--ink-400)'}}>{fmt(totalF1Paye)} payé</td>
                  <td style={{padding:'14px 16px',textAlign:'right',fontWeight:800,color:'#b91c1c',fontVariantNumeric:'tabular-nums'}}>{fmt(totalF2)}</td>
                  <td style={{padding:'14px 16px',textAlign:'center',fontSize:11,color:'var(--ink-400)'}}>{fmt(totalF2Paye)} payé</td>
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

  // ── AGENTE MOIS ADMIN ──────────────────────────────────────────────────────

  const renderAgenteMoisAdmin = () => {
    const isAnnee = factPeriod === 'annee'
    const rowsReel = agrégerParPaiement(dossiersAgente, isAnnee)

    // Totaux annuels si vue année
    if (isAnnee) {
      const annees = []
      for (let a = new Date().getFullYear(); a >= 2024; a--) annees.push(a)

      const clesMois = Array.from(new Set(rowsReel.map(([k]) => k)))
        .filter(k => k.startsWith(String(anneeSelectionnee))).sort()

      let totalF1 = 0, totalF2 = 0, totalPayeF1 = 0, totalPayeF2 = 0

      const lignes = clesMois.map(cle => {
        const [, mStr] = cle.split('-')
        const mois = parseInt(mStr)
        const agg = rowsReel.find(([k]) => k === cle)?.[1] || {}
        const gains = round2(agg.gainsAgenteReels||0)
        const debutRedev = agenteActuelle?.redevance_debut ? new Date(agenteActuelle.redevance_debut) : null
        const moisConcerne = new Date(anneeSelectionnee, mois - 1, 1)
        const redev = debutRedev && moisConcerne >= debutRedev ? (agenteActuelle?.redevance_mensuelle_ht ?? 540) : 0
        const apporteur = round2(agg.apporteurRembourseNet||0)
        const duParAgente = round2(redev + apporteur)
        const f1 = facturesAgente.find(f => f.mois === mois && f.annee === anneeSelectionnee && f.agente_id === agenteSelectionnee && f.type_facture === 'agente_vers_ctp')
        const f2 = facturesAgente.find(f => f.mois === mois && f.annee === anneeSelectionnee && f.agente_id === agenteSelectionnee && f.type_facture === 'ctp_vers_agente')
        totalF1 += gains; totalF2 += duParAgente
        if (f1?.statut === 'paye') totalPayeF1 += gains
        if (f2?.statut === 'paye') totalPayeF2 += duParAgente
        return { mois, gains, duParAgente, f1, f2 }
      })

      const statutBadge = (f) => {
        const s = f?.statut || 'a_facturer'
        return <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${s === 'paye' ? 'text-green-700 bg-green-50 border-green-300' : 'text-gray-500 bg-gray-50 border-gray-200'}`}>
          {s === 'paye' ? '✅ Payé' : '📋 À facturer'}
        </span>
      }

      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="grid grid-cols-2 gap-3 flex-1">
              <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-1">📥 {nomFranchisee} doit verser (F2)</p>
                <p className="text-lg font-bold text-green-700">{fmt(totalF2)}</p>
                <p className="text-xs text-gray-400 mt-0.5">Reçu : {fmt(totalPayeF2)} · En attente : {fmt(round2(totalF2 - totalPayeF2))}</p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-1">📤 {nomAgente} doit verser (F1)</p>
                <p className="text-lg font-bold text-red-600">{fmt(totalF1)}</p>
                <p className="text-xs text-gray-400 mt-0.5">Payé : {fmt(totalPayeF1)} · Restant : {fmt(round2(totalF1 - totalPayeF1))}</p>
              </div>
               <div className={`border rounded-xl p-3 ${round2(totalF2-totalF1) >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'}`}>
                <p className="text-xs text-gray-500 mb-1">Net indicatif</p>
                <p className={`text-lg font-bold ${round2(totalF2-totalF1) >= 0 ? 'text-blue-700' : 'text-amber-600'}`}>
                  {round2(totalF2-totalF1) >= 0 ? '+' : ''}{fmt(round2(totalF2-totalF1))}
                </p>
              </div>
              <select value={anneeSelectionnee} onChange={e => setAnneeSelectionnee(parseInt(e.target.value))}
                className="ml-4 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-400">
                {annees.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>

          <div className="card" style={{overflow:'hidden'}}>
            <table className="w-full text-xs">
              <thead style={{background:'var(--surface-2)',borderBottom:'1px solid var(--ink-200)'}}>
                <tr>
                  {thL('Mois')}
                  {thR('F2 (Marine facture)')}
                  {thR('Statut F2')}
                  {thR('F1 (Agente facture)')}
                  {thR('Statut F1')}
                  {thR('Net')}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lignes.map(({ mois, gains, duParAgente, f1, f2 }) => {
                  const net = round2(duParAgente - gains)
                  return (
                    <tr key={mois} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5 font-medium text-gray-800">{MOIS[mois]} {anneeSelectionnee}</td>
                      <td className="px-3 py-2.5 text-right text-green-700 font-medium">{duParAgente > 0 ? fmt(duParAgente) : '—'}</td>
                      <td className="px-3 py-2.5 text-right">{duParAgente > 0 ? statutBadge(f2) : '—'}</td>
                      <td className="px-3 py-2.5 text-right text-red-600">{gains > 0 ? fmt(gains) : '—'}</td>
                      <td className="px-3 py-2.5 text-right">{gains > 0 ? statutBadge(f1) : '—'}</td>
                      <td className={`px-3 py-2.5 text-right font-bold ${net >= 0 ? 'text-blue-700' : 'text-amber-600'}`}>{net >= 0 ? '+' : ''}{fmt(net)}</td>
                    </tr>
                  )
                })}
                {lignes.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">Aucune donnée pour {anneeSelectionnee}</td></tr>}
              </tbody>
              {lignes.length > 0 && (
                <tfoot className="bg-gray-50 border-t-2 border-gray-300 font-bold">
                  <tr>
                    <td className="px-3 py-2 text-gray-700">Total</td>
                    <td className="px-3 py-2 text-right text-green-700">{fmt(totalF2)}</td>
                    <td className="px-3 py-2 text-right text-xs text-gray-400">{fmt(totalPayeF2)} payé</td>
                    <td className="px-3 py-2 text-right text-red-600">{fmt(totalF1)}</td>
                    <td className="px-3 py-2 text-right text-xs text-gray-400">{fmt(totalPayeF1)} payé</td>
                    <td className={`px-3 py-2 text-right ${round2(totalF2-totalF1) >= 0 ? 'text-blue-700' : 'text-amber-600'}`}>{round2(totalF2-totalF1) >= 0 ? '+' : ''}{fmt(round2(totalF2-totalF1))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )
    }

    // Vue par mois — cartes détaillées
    return (
      <div className="space-y-4">
        {rowsReel.map(([key, agg]) => {
          const [anneeStr, moisStr] = key.split('-')
          const annee = parseInt(anneeStr)
          const mois  = parseInt(moisStr)
          const label = `${MOIS[mois]} ${annee}`
          const gains = round2(agg.gainsAgenteReels||0)
          const debutRedev = agenteActuelle?.redevance_debut ? new Date(agenteActuelle.redevance_debut) : null
          const moisConcerne = new Date(annee, mois - 1, 1)
          const redev = debutRedev && moisConcerne >= debutRedev ? (agenteActuelle?.redevance_mensuelle_ht ?? 540) : 0
          const apporteur = round2(agg.apporteurRembourseNet||0)
          const duParAgente = round2(redev + apporteur)
          const net = round2(duParAgente - gains)
          const f1 = facturesAgente.find(f => f.mois === mois && f.annee === annee && f.agente_id === agenteSelectionnee && f.type_facture === 'agente_vers_ctp')
          const f2 = facturesAgente.find(f => f.mois === mois && f.annee === annee && f.agente_id === agenteSelectionnee && f.type_facture === 'ctp_vers_agente')
          const uploadKey2 = `${annee}-${mois}-ctp_vers_agente`

          const uploadF2Pdf = async (fichier) => {
            setUploadingFactureAgente(uploadKey2)
            const ext = fichier.name.split('.').pop()
            const chemin = `factures_agente/${agenteSelectionnee}/${annee}-${String(mois).padStart(2,'0')}-ctp_vers_agente.${ext}`
            const { error } = await supabase.storage.from('documents').upload(chemin, fichier, { upsert: true })
            if (!error) {
              await upsertFactureMoisType(mois, annee, duParAgente, 'ctp_vers_agente', { facture_path: chemin, statut: 'facture' })
              setSucces('Facture F2 uploadée ✓')
            } else { setErreur('Erreur upload : ' + error.message) }
            setUploadingFactureAgente(null)
          }

          const statutBadge = (f) => {
            const s = f?.statut || 'a_facturer'
            return <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${s === 'paye' ? 'text-green-700 bg-green-50 border-green-300' : s === 'facture' ? 'text-blue-700 bg-blue-50 border-blue-300' : 'text-gray-500 bg-gray-50 border-gray-200'}`}>
              {s === 'paye' ? '✅ Payé' :  '📋 À facturer'}
            </span>
          }

          return (
            <div key={key} className="card">
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 18px',background:'var(--surface-2)',borderBottom:'1px solid var(--ink-100)'}}>
                <span style={{fontWeight:700,color:'var(--ink-900)',fontSize:14}}>{label}</span>
                <span style={{fontWeight:700,fontSize:13,color: net >= 0 ? 'var(--brand-800)' : '#a16207'}}>
                  Net : {net >= 0 ? '+' : ''}{fmt(net)}
                </span>
              </div>
              <div style={{padding:16,display:'flex',flexDirection:'column',gap:12}}>
          {/* F2 en premier — Marine émet, vert */}
          {duParAgente > 0 && (
            <div style={{border:'1px solid var(--ink-100)',borderRadius:10,padding:12,display:'flex',flexDirection:'column',gap:8}}>
              <div className="flex justify-between items-start">
                <p className="text-xs font-semibold text-green-800">{nomFranchisee} doit facturer à {nomAgente}</p>
                <span className="text-sm font-bold text-green-700">{fmt(duParAgente)}</span>
              </div>
              <div className="text-xs text-green-700 space-y-1">
                {redev > 0 && <div className="flex justify-between"><span>Redevance mensuelle</span><span>{fmt(redev)}</span></div>}
                {apporteur > 0 && <div className="flex justify-between"><span>Apporteur remboursé</span><span>{fmt(apporteur)}</span></div>}
              </div>
              <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-green-100">
                <select value={f2?.statut || 'a_facturer'}
                  onChange={e => upsertFactureMoisType(mois, annee, duParAgente, 'ctp_vers_agente', { statut: e.target.value })}
                  className={`border rounded px-2 py-1 text-xs focus:outline-none ${f2?.statut === 'paye' ? 'border-green-300 bg-white text-green-700' : 'border-gray-200 text-gray-600 bg-white'}`}>
                  <option value="a_facturer">📋 À facturer</option>
                  <option value="paye">✅ Payé</option>
                </select>
                {f2?.facture_path ? (
                  <div className="flex items-center gap-2">
                    <button onClick={async () => { const { data } = await supabase.storage.from('documents').createSignedUrl(f2.facture_path, 3600); if (data?.signedUrl) window.open(data.signedUrl, '_blank') }}
                      className="text-xs text-blue-600 hover:underline">📄 Voir</button>
                    <label className="text-xs text-gray-400 cursor-pointer hover:text-blue-600">
                      Remplacer
                      <input type="file" accept=".pdf" className="hidden" onChange={e => e.target.files[0] && uploadF2Pdf(e.target.files[0])} />
                    </label>
                  </div>
                ) : (
                  <label className={`text-xs cursor-pointer px-2 py-1 rounded border transition-all ${uploadingFactureAgente === uploadKey2 ? 'text-gray-400 border-gray-200' : 'text-blue-600 border-blue-200 bg-white hover:bg-blue-50'}`}>
                    {uploadingFactureAgente === uploadKey2 ? 'Upload...' : '+ Uploader PDF'}
                    <input type="file" accept=".pdf" className="hidden" disabled={uploadingFactureAgente === uploadKey2} onChange={e => e.target.files[0] && uploadF2Pdf(e.target.files[0])} />
                  </label>
                )}
              </div>
            </div>
          )}

          {/* F1 en second — agente émet, rouge */}
          <div style={{border:'1px solid var(--ink-100)',borderRadius:10,padding:12,display:'flex',flexDirection:'column',gap:8}}>
            <div className="flex justify-between items-start">
              <p className="text-xs font-semibold text-red-800">{nomAgente} doit facturer à {nomFranchisee}</p>
              <span className="text-sm font-bold text-red-700">{fmt(gains)}</span>
            </div>
            <div className="text-xs text-red-700 space-y-1">
              {(agg.fraisAgenteNet||0) > 0 && <div className="flex justify-between"><span>Frais</span><span>{fmt(agg.fraisAgenteNet)}</span></div>}
              {(agg.comAgenteNet||0) > 0 && <div className="flex justify-between"><span>Commissions</span><span>{fmt(agg.comAgenteNet)}</span></div>}
              {(agg.honAgenteNet||0) > 0 && <div className="flex justify-between"><span>Honoraires</span><span>{fmt(agg.honAgenteNet)}</span></div>}
            </div>
            <div className="flex items-center gap-3 pt-1 border-t border-red-100 flex-wrap">
              {statutBadge(f1)}
              {f1?.facture_path && (
                <button onClick={async () => { const { data } = await supabase.storage.from('documents').createSignedUrl(f1.facture_path, 3600); if (data?.signedUrl) window.open(data.signedUrl, '_blank') }}
                  className="text-xs text-blue-600 hover:underline">📄 Voir facture</button>
              )}
              <label className="flex items-center gap-1.5 cursor-pointer ml-auto">
                <input type="checkbox" checked={f1?.statut === 'paye'}
                  onChange={e => upsertFactureMoisType(mois, annee, gains, 'agente_vers_ctp', { statut: e.target.checked ? 'paye' : 'a_facturer' })}
                  className="w-4 h-4 accent-red-600" />
                <span className="text-xs text-red-700 font-medium">J&apos;ai payé</span>
              </label>
            </div>
          </div>
        </div>
            </div>
          )
        })}
        {rowsReel.length === 0 && <p className="text-center text-gray-400 text-sm py-8">Aucune donnée</p>}
      </div>
    )
  }

  // ── FACTURATION AGENTE PROPRE (INNER COMPONENT) ──────────────────────────

  function FacturationAgentePropre() {
    return (
      <div style={{display:'flex',flexDirection:'column',gap:16}}>
        <PillToggle
          options={[{key:'mois',label:'Par mois'},{key:'annee',label:'Par année'}]}
          active={factPeriod}
          onChange={setFactPeriod}
        />
        {factPeriod === 'mois'  && renderFacturationMoisSuivi()}
        {factPeriod === 'annee' && renderFacturationAnneeAgente()}
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDU PRINCIPAL
  // ─────────────────────────────────────────────────────────────────────────────

  const tabs = [
    { key: 'previsionnel', label: 'F1 Prévisionnel' },
    { key: 'reel',         label: 'F2 Réel'         },
    { key: 'synthese',     label: 'Synthèse'         },
    { key: 'suivi',        label: 'Suivi financier'  },
    { key: 'facturation',  label: 'Facturation'      },
  ]

  const periodOptions = [
    { key: 'chantier', label: 'Par chantier' },
    { key: 'mois',     label: 'Par mois'     },
    { key: 'annee',    label: 'Par année'    },
  ]

  if (loading) return <div className="page-loading" />

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
        <FinKpiCard label={isMarine ? "Part franchisée" : "Mes gains"}
          value={fmt(isMarine ? round2(totalNetCTP-totalGainsAgentesReels) : totalGainsAgentesReels)}
          sub={isMarine ? `Part agentes ${fmt(totalGainsAgentesReels)}` : 'Réels encaissés'}
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
            {isMarine && (
              <div style={{marginLeft:6,display:'flex',gap:4,alignItems:'center'}}>
                <div className="eyebrow">Périmètre</div>
                <div className="pill-toggle" style={{marginLeft:8}}>
                  {[
                    { key:'tous', label:'Tous' },
                    { key:'moi', label: profile?.prenom || 'Marine' },
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
            {isMarine && (
              <div style={{marginLeft:6,display:'flex',gap:4,alignItems:'center'}}>
                <div className="eyebrow">Périmètre</div>
                <div className="pill-toggle" style={{marginLeft:8}}>
                  {[
                    { key:'tous', label:'Tous' },
                    { key:'moi', label: profile?.prenom || 'Marine' },
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

      {/* ── SUIVI FINANCIER — même layout admin/agente, données scopées ── */}
      {tab === 'suivi' && (
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          <PillToggle
            options={[{key:'agence',label:'Agence — Encaissements bruts'},{key:'ctp',label:'CTP — Résultat net (charges incluses)'}]}
            active={suiviMode}
            onChange={setSuiviMode}
          />
          {renderSuiviFinancier(suiviMode)}
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