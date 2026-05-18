'use client'
import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Chart, CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, DoughnutController, BarController, LineController, Tooltip, Legend, Filler } from 'chart.js'
Chart.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, DoughnutController, BarController, LineController, Tooltip, Legend, Filler)
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '../lib/auth-context'
import { calculateDossierFinance } from '../lib/finance'

const round2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100
const fmt = (n) => {
  const v = (Number(n) || 0).toFixed(2)
  const [int, dec] = v.split('.')
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + '.' + dec + ' €'
}
const fmtPct = (n, dec = 1) => `${(n || 0).toFixed(dec)}%`
const fmtDays = (n) => `${Math.round(n || 0)} j`
const MOIS_SHORT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']
const TYPO_LABELS = { courtage: 'Courtage', amo: 'AMO', consultation: 'Consultation', estimo: 'Estimo', merad: 'MERAD', audit_energetique: 'Audit énergétique', studio_jardin: 'Studio jardin' }
const TYPO_COLORS = { courtage: '#2563EB', amo: '#7C3AED', consultation: '#059669', estimo: '#D97706', merad: '#34df16', audit_energetique: '#DB2777', studio_jardin: '#0891B2' }
const USER_PALETTE = [
  { dot: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
  { dot: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
  { dot: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
  { dot: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
]

const normalizeDossier = (d) => ({
  ...d,
  part_agente: d.part_agente ?? (d.referente?.role === 'admin' ? 0 : 0.5),
  frais_part_agente: d.frais_part_agente ?? null,
  taux_amo: d?.taux_amo ?? d?.honoraires_amo_taux,
  client: d?.client ? { ...d.client, apporteur_mode: d.client?.apporteur_base === 'total_chantier' ? 'total_chantier_ht' : 'par_devis' } : null,
})

const calculerStats = (d) => {
  const f = calculateDossierFinance(normalizeDossier(d))
  const devisActifs = (d.devis_artisans || []).filter(dv => dv.statut !== 'refuse')
  const devisSigns = devisActifs.filter(dv => dv.statut === 'accepte' || dv.date_signature)
  const montantTravauxHT = round2(devisSigns.reduce((s, dv) => s + (Number(dv.montant_ht) || 0), 0))
  const montantPipelineHT = round2(devisActifs.reduce((s, dv) => s + (Number(dv.montant_ht) || 0), 0))
  let dureeJours = null
  if (d.date_demarrage_chantier && d.date_fin_chantier) dureeJours = Math.round((new Date(d.date_fin_chantier) - new Date(d.date_demarrage_chantier)) / 86400000)
  const suiviRegles = (d.suivi_financier || []).filter(sf => sf.statut_client === 'regle' && sf.date_paiement)
  let delaiEncaissementJours = null
  if (d.date_signature_contrat && suiviRegles.length > 0) {
    const dateSign = new Date(d.date_signature_contrat)
    const delais = suiviRegles.map(sf => Math.max(0, Math.round((new Date(sf.date_paiement) - dateSign) / 86400000))).filter(v => v >= 0)
    if (delais.length > 0) delaiEncaissementJours = round2(delais.reduce((s, v) => s + v, 0) / delais.length)
  }
  return {
    aDevisSign: devisSigns.length > 0,
    montantTravauxHT, montantPipelineHT, dureeJours, delaiEncaissementJours,
    comHT: round2(f.commissions.comHT),
    honNet: round2(f.honoraires.totalNet),
    fraisNet: d.frais_statut !== 'offerts' ? round2(f.frais.net) : 0,
    royalties: round2(f.royalties.total),
    partAgente: round2(f.gains.netsPrevi.agente),
    partAdmin: round2(f.gains.netsPrevi.admin),
    netTotal: round2(f.frais.net + f.commissions.netCom + f.honoraires.totalNet),
  }
}

function KPICard({ label, value, sub, delta, color, icon }) {
  const isPos = delta > 0
  const isNeg = delta < 0
  const hasD = delta !== null && delta !== undefined && !isNaN(delta)
  return (
    <div className="card" style={{padding:'20px 24px'}}>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6}}>
        <span style={{fontSize:11, fontWeight:700, color:'var(--ink-400)', textTransform:'uppercase', letterSpacing:0.05}}>{label}</span>
        {icon && <span style={{fontSize:18}}>{icon}</span>}
      </div>
      <div style={{display:'flex', alignItems:'flex-end', gap:8, marginTop:6}}>
        <span className="tnum" style={{fontSize:22, fontWeight:800, color: color || 'var(--ink-900)'}}>{value}</span>
        {hasD && (
          <span style={{fontSize:11, fontWeight:700, marginBottom:2, color: isPos ? 'var(--ok)' : isNeg ? 'var(--bad)' : 'var(--ink-400)'}}>
            {isPos ? '▲' : isNeg ? '▼' : '='} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
      {sub && <span style={{fontSize:11.5, color:'var(--ink-400)', marginTop:6, display:'block'}}>{sub}</span>}
    </div>
  )
}

function ST({ children, sub }) {
  return (
    <div style={{marginBottom:18}}>
      <div className="eyebrow">{children}</div>
      {sub && <div style={{fontSize:12, color:'var(--ink-400)', marginTop:3}}>{sub}</div>}
    </div>
  )
}

function useChart(ref, type, data, options) {
  const dataStr = JSON.stringify(data)
  useEffect(() => {
    if (typeof Chart === 'undefined' || !ref.current) return
    const canvas = ref.current
    if (canvas._c) canvas._c.destroy()
    canvas._c = new Chart(canvas, { type, data, options })
    return () => {
      if (canvas._c) { canvas._c.destroy(); canvas._c = null }
    }
  }, [dataStr]) // eslint-disable-line react-hooks/exhaustive-deps
  return <div style={{ height: options._height || 220 }}><canvas ref={ref} /></div>
}

function BarChart({ labels, datasets, height = 220, stacked = false }) {
  const ref = useRef(null)
  const el = useChart(ref, 'bar', { labels, datasets }, {
    _height: height, responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: datasets.length > 1, position: 'top', labels: { boxWidth: 10, font: { size: 11 } } }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label || ''}: ${Math.round(ctx.parsed.y).toLocaleString('fr-FR')} €` } } },
    scales: { x: { stacked, grid: { display: false }, ticks: { font: { size: 11 }, color: '#9CA3AF' } }, y: { stacked, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 11 }, color: '#9CA3AF', callback: v => Math.round(v).toLocaleString('fr-FR') + ' €' } } },
  })
  return el
}

function LineChart({ labels, datasets, height = 200 }) {
  const ref = useRef(null)
  const el = useChart(ref, 'line', { labels, datasets }, {
    _height: height, responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: datasets.length > 1, position: 'top', labels: { boxWidth: 10, font: { size: 11 } } }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label || ''}: ${Math.round(ctx.parsed.y).toLocaleString('fr-FR')} €` } } },
    scales: { x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#9CA3AF' } }, y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 11 }, color: '#9CA3AF', callback: v => Math.round(v).toLocaleString('fr-FR') + ' €' } } },
  })
  return el
}

function DoughnutChart({ labels, data, colors, height = 160 }) {
  const ref = useRef(null)
  const el = useChart(ref, 'doughnut', { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }] }, {
    _height: height, responsive: true, maintainAspectRatio: false, cutout: '68%',
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.parsed}` } } },
  })
  return el
}

function Dlt({ value, inverse = false }) {
  if (value === null || value === undefined || isNaN(value)) return <span style={{fontSize:11, color:'var(--ink-300)'}}>—</span>
  const isGood = inverse ? value < 0 : value > 0
  const bg = value === 0 ? 'var(--ink-100)' : isGood ? 'rgba(22,163,74,0.1)' : 'rgba(239,68,68,0.1)'
  const clr = value === 0 ? 'var(--ink-400)' : isGood ? '#15803d' : '#b91c1c'
  return <span style={{fontSize:11, fontWeight:700, padding:'2px 6px', borderRadius:99, background:bg, color:clr}}>{value > 0 ? '+' : ''}{value.toFixed(1)}%</span>
}

function PBar({ value, max, color = '#2563EB', height = 6 }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return <div style={{flex:1, background:'var(--ink-100)', borderRadius:99, height}}><div style={{width:`${pct}%`, height, backgroundColor:color, borderRadius:99}}/></div>
}

export default function Statistiques() {
  const [dossiers, setDossiers] = useState([])
  const [agentes, setAgentes] = useState([])
  const [loading, setLoading] = useState(true)
  const [onglet, setOnglet] = useState('overview')
  const [annee, setAnnee] = useState(new Date().getFullYear())
  const router = useRouter()
  const { user, profile, initialized } = useAuth()

  useEffect(() => {
    if (!initialized) return
    if (!user) { router.push('/login'); return }
    if (!profile) return
    Promise.all([
      supabase.from('dossiers').select(`*, referente:profiles!dossiers_referente_id_fkey(id, prenom, nom, role), client:clients(id, prenom, nom, civilite), devis_artisans(*, artisan:artisans(id, entreprise, metier, sans_royalties)), suivi_financier(*)`).order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').in('role', ['admin', 'agente']).order('prenom'),
    ]).then(([{ data: dossiersData }, { data: agentesData }]) => {
      setDossiers(dossiersData || [])
      setAgentes(agentesData || [])
      setLoading(false)
    })
  }, [initialized, user?.id, profile?.id, router])

  const isMarine = profile?.role === 'admin'

  const dossiersVisibles = useMemo(() =>
    isMarine ? dossiers : dossiers.filter(d => d.referente?.id === profile?.id)
  , [dossiers, isMarine, profile?.id])

  const anneesDispos = useMemo(() =>
    [...new Set(dossiersVisibles.map(d => { const dt = d.date_signature_contrat || d.created_at; return dt ? new Date(dt).getFullYear() : null }).filter(Boolean))].sort((a, b) => b - a)
  , [dossiersVisibles])

  const dN = useMemo(() =>
    dossiersVisibles
      .filter(d => { const dt = d.date_signature_contrat || d.created_at; return dt && new Date(dt).getFullYear() === annee })
      .map(d => ({ ...d, _s: calculerStats(d) }))
  , [dossiersVisibles, annee])

  const dN1 = useMemo(() =>
    dossiersVisibles
      .filter(d => { const dt = d.date_signature_contrat || d.created_at; return dt && new Date(dt).getFullYear() === annee - 1 })
      .map(d => ({ ...d, _s: calculerStats(d) }))
  , [dossiersVisibles, annee])

  const metriques = (list) => {
    const nb = list.length
    const avecDevis = list.filter(d => d._s.aDevisSign).length
    const tauxTransfo = nb > 0 ? (avecDevis / nb) * 100 : 0
    const pipeline = list.filter(d => d.statut === 'en_cours').reduce((s, d) => s + d._s.montantPipelineHT, 0)
    const travaux = list.reduce((s, d) => s + d._s.montantTravauxHT, 0)
    const comHT = list.reduce((s, d) => s + d._s.comHT, 0)
    const honNet = list.reduce((s, d) => s + d._s.honNet, 0)
    const fraisNet = list.reduce((s, d) => s + d._s.fraisNet, 0)
    const royalties = list.reduce((s, d) => s + d._s.royalties, 0)
    const netTotal = round2(list.reduce((s, d) => s + d._s.netTotal, 0))
    const gainAgente = list.reduce((s, d) => s + d._s.partAgente, 0)
    const gainAdmin = list.reduce((s, d) => s + d._s.partAdmin, 0)
    const panierMoyen = avecDevis > 0 ? travaux / avecDevis : 0
    const durees = list.map(d => d._s.dureeJours).filter(v => v !== null && v > 0)
    const dureeMoyenne = durees.length > 0 ? round2(durees.reduce((s, v) => s + v, 0) / durees.length) : null
    const delais = list.map(d => d._s.delaiEncaissementJours).filter(v => v !== null && v >= 0)
    const delaiMoyen = delais.length > 0 ? round2(delais.reduce((s, v) => s + v, 0) / delais.length) : null
    const parStatut = { en_cours: list.filter(d => d.statut === 'en_cours').length, en_attente: list.filter(d => d.statut === 'en_attente').length, termine: list.filter(d => d.statut === 'termine').length, annule: list.filter(d => d.statut === 'annule').length }
    return { nb, avecDevis, tauxTransfo, pipeline, travaux, comHT, honNet, fraisNet, royalties, netTotal, gainAgente, gainAdmin, panierMoyen, dureeMoyenne, delaiMoyen, parStatut }
  }

  const mN = useMemo(() => metriques(dN), [dN])
  const mN1 = useMemo(() => metriques(dN1), [dN1])
  const delta = (a, b) => (!b || b === 0) ? null : round2(((a - b) / b) * 100)
  const caParMoisN = useMemo(() => { const arr = Array(12).fill(0); dN.forEach(d => { const dt = d.date_signature_contrat || d.created_at; if (dt) arr[new Date(dt).getMonth()] += d._s.netTotal }); return arr }, [dN])
  const caParMoisN1 = useMemo(() => { const arr = Array(12).fill(0); dN1.forEach(d => { const dt = d.date_signature_contrat || d.created_at; if (dt) arr[new Date(dt).getMonth()] += d._s.netTotal }); return arr }, [dN1])
  const cumulatif = (arr) => arr.reduce((acc, v, i) => { acc.push((acc[i-1] || 0) + v); return acc }, [])

  const typologies = useMemo(() => {
    const map = {}
    dN.forEach(d => { const t = d.typologie || 'autre'; if (!map[t]) map[t] = { label: TYPO_LABELS[t] || t, color: TYPO_COLORS[t] || '#6B7280', nb: 0, ca: 0, com: 0, hon: 0 }; map[t].nb++; map[t].ca += d._s.montantTravauxHT; map[t].com += d._s.comHT; map[t].hon += d._s.honNet })
    return Object.entries(map).sort((a, b) => b[1].nb - a[1].nb)
  }, [dN])

  const topArtisans = useMemo(() => {
    const map = {}
    dN.forEach(d => { (d.devis_artisans || []).filter(dv => dv.statut !== 'refuse').forEach(dv => { const id = dv.artisan?.id; if (!id) return; if (!map[id]) map[id] = { id, entreprise: dv.artisan?.entreprise || '—', metier: dv.artisan?.metier || '—', volumeHT: 0, comHT: 0, nb: 0, signes: 0, chantiers: new Set() }; map[id].volumeHT += Number(dv.montant_ht) || 0; map[id].comHT += (Number(dv.montant_ht) || 0) * (Number(dv.commission_pourcentage) || 0); map[id].nb++; if (dv.statut === 'accepte' || dv.date_signature) map[id].signes++; map[id].chantiers.add(d.id) }) })
    return Object.values(map).map(a => ({ ...a, nbChantiers: a.chantiers.size, tauxSign: a.nb > 0 ? (a.signes / a.nb) * 100 : 0 })).sort((a, b) => b.volumeHT - a.volumeHT).slice(0, 15)
  }, [dN])

  const topClients = (() => {
    const map = {}
    dN.forEach(d => { const id = d.client?.id; if (!id) return; if (!map[id]) map[id] = { id, prenom: d.client?.prenom || '', nom: d.client?.nom || '', ca: 0, nb: 0, typologies: new Set() }; map[id].ca += d._s.montantTravauxHT; map[id].nb++; if (d.typologie) map[id].typologies.add(d.typologie) })
    return Object.values(map).map(c => ({ ...c, typologies: [...c.typologies] })).sort((a, b) => b.ca - a.ca).slice(0, 15)
  })()

  const filterAnnee = (list, y) => list.filter(d => { const dt = d.date_signature_contrat || d.created_at; return dt && new Date(dt).getFullYear() === y })
  const enrichir = (list) => list.map(d => ({ ...d, _s: calculerStats(d) }))
  const caParMois = (list) => { const arr = Array(12).fill(0); list.forEach(d => { const dt = d.date_signature_contrat || d.created_at; if (dt) arr[new Date(dt).getMonth()] += d._s.netTotal }); return arr }

  const statsAgentes = agentes.map((a, i) => {
    const listN = enrichir(filterAnnee(dossiers.filter(d => d.referente?.id === a.id), annee))
    const listN1 = enrichir(filterAnnee(dossiers.filter(d => d.referente?.id === a.id), annee - 1))
    return { agente: a, color: USER_PALETTE[i % USER_PALETTE.length], m: metriques(listN), mP: metriques(listN1), caParMoisA: caParMois(listN) }
  })

  const onglets = [
    { key: 'overview', label: "Vue d'ensemble" },
    { key: 'commercial', label: 'Commercial' },
    { key: 'financier', label: 'Financier' },
    { key: 'operationnel', label: 'Opérationnel' },
    ...(isMarine ? [{ key: 'equipe', label: 'Équipe' }] : []),
  ]

  if (loading) return <div style={{paddingTop:96, textAlign:'center', color:'var(--ink-400)'}}>Chargement…</div>

  return (
    <div className="page-enter" style={{display:'flex', flexDirection:'column', gap:24}}>

      {/* En-tête */}
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-end', gap:16, flexWrap:'wrap'}}>
        <div>
          <div className="eyebrow" style={{marginBottom:4}}>Analyse</div>
          <h1 className="page">Statistiques</h1>
          <div style={{color:'var(--ink-500)', fontSize:13, marginTop:6}}>
            Année <strong style={{color:'var(--ink-700)'}}>{annee}</strong> · {dN.length} dossiers · {mN.avecDevis} avec devis signé
          </div>
        </div>
        <div style={{display:'flex', gap:8, alignItems:'center'}}>
          <span style={{fontSize:12, color:'var(--ink-400)'}}>Exercice</span>
          <select className="input" value={annee} onChange={e => setAnnee(parseInt(e.target.value))} style={{height:36, minWidth:100}}>
            {anneesDispos.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <span style={{fontSize:12, color:'var(--ink-300)'}}>vs {annee - 1}</span>
        </div>
      </div>

      {/* Onglets */}
      <div className="tabs" style={{overflowX:'auto'}}>
        {onglets.map(({ key, label }) => (
          <button key={key} className={`tab ${onglet === key ? 'active' : ''}`} onClick={() => setOnglet(key)}>{label}</button>
        ))}
      </div>

      {onglet === 'overview' && (
        <div style={{display:'flex', flexDirection:'column', gap:18}}>
          <div>
            <ST sub={`${annee} vs ${annee - 1} — variation en %`}>Indicateurs clés de performance</ST>
            <div className="kpi-grid" style={{marginBottom:6}}>
              <KPICard label="Chantiers ouverts" value={mN.nb} sub={`${mN.avecDevis} avec devis signé`} delta={delta(mN.nb, mN1.nb)} />
              <KPICard label="Volume travaux HT" value={fmt(mN.travaux)} sub={`N-1 : ${fmt(mN1.travaux)}`} delta={delta(mN.travaux, mN1.travaux)} color="#1D4ED8"/>
              <KPICard label="Net agence" value={fmt(mN.netTotal)} sub={`Royalties : ${fmt(mN.royalties)}`} delta={delta(mN.netTotal, mN1.netTotal)} color="#7C3AED"/>
              <KPICard label="Taux de transformation" value={fmtPct(mN.tauxTransfo)} sub={`N-1 : ${fmtPct(mN1.tauxTransfo)}`} delta={delta(mN.tauxTransfo, mN1.tauxTransfo)} color="#059669"  />
            </div>
          </div>
          <div className="kpi-grid">
            <KPICard label="Panier actif" value={fmt(mN.pipeline)} sub={`${mN.parStatut.en_cours} dossier(s) en cours`} color="#0891B2" />
            <KPICard label="Panier moyen" value={fmt(mN.panierMoyen)} sub={`N-1 : ${fmt(mN1.panierMoyen)}`} delta={delta(mN.panierMoyen, mN1.panierMoyen)} />
            <KPICard label="Durée moy. chantier" value={mN.dureeMoyenne !== null ? fmtDays(mN.dureeMoyenne) : '—'} sub="démarrage → fin" />
            <KPICard label="Délai moy. encaissement" value={mN.delaiMoyen !== null ? fmtDays(mN.delaiMoyen) : '—'} sub="signature → paiement" />
          </div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:18}}>
            <div className="card" style={{padding:24}}>
              <ST>Statuts des dossiers</ST>
              <div style={{display:'flex', flexDirection:'column', gap:12}}>
                {[{ key: 'en_cours', label: 'En cours', color: '#059669' }, { key: 'en_attente', label: 'En attente', color: '#D97706' }, { key: 'termine', label: 'Terminés', color: '#6B7280' }, { key: 'annule', label: 'Annulés', color: '#DC2626' }].map(({ key, label, color }) => (
                  <div key={key} style={{display:'flex', alignItems:'center', gap:10}}>
                    <span style={{fontSize:12, color:'var(--ink-500)', width:96, flexShrink:0}}>{label}</span>
                    <PBar value={mN.parStatut[key]} max={mN.nb || 1} color={color} />
                    <span className="tnum" style={{fontSize:13, fontWeight:700, color:'var(--ink-800)', width:24, textAlign:'right'}}>{mN.parStatut[key]}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="card" style={{padding:24}}>
              <ST>Répartition typologies</ST>
              {typologies.length === 0 ? <p style={{fontSize:12, color:'var(--ink-400)', textAlign:'center', paddingTop:24}}>Aucune donnée</p> : (
                <div style={{display:'flex', gap:20, alignItems:'center'}}>
                  <div style={{ width: 150, flexShrink: 0 }}>
                    <DoughnutChart labels={typologies.map(([, t]) => t.label)} data={typologies.map(([, t]) => t.nb)} colors={typologies.map(([, t]) => t.color)} height={150} />
                  </div>
                  <div style={{display:'flex', flexDirection:'column', gap:8, flex:1}}>
                    {typologies.map(([key, t]) => (
                      <div key={key} style={{display:'flex', alignItems:'center', gap:8}}>
                        <div style={{width:8, height:8, borderRadius:99, flexShrink:0, backgroundColor:t.color}} />
                        <span style={{fontSize:12, color:'var(--ink-600)', flex:1}}>{t.label}</span>
                        <span className="tnum" style={{fontSize:12, fontWeight:700, color:'var(--ink-800)'}}>{t.nb}</span>
                        <span style={{fontSize:12, color:'var(--ink-400)'}}>{fmtPct((t.nb / (mN.nb || 1)) * 100, 0)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="card" style={{padding:24}}>
            <ST sub={`Comparaison mensuelle ${annee} vs ${annee - 1}`}>CA net mensuel</ST>
            <BarChart labels={MOIS_SHORT} datasets={[{ label: String(annee), data: caParMoisN, backgroundColor: '#2563EB', borderRadius: 4 }, { label: String(annee - 1), data: caParMoisN1, backgroundColor: '#BFDBFE', borderRadius: 4 }]} />
          </div>
          <div className="card" style={{padding:24}}>
            <ST sub="CA net cumulé sur l'exercice">Progression cumulative</ST>
            <LineChart labels={MOIS_SHORT} datasets={[{ label: String(annee), data: cumulatif(caParMoisN), borderColor: '#2563EB', backgroundColor: 'rgba(37,99,235,0.08)', tension: 0.4, fill: true, pointRadius: 4, pointBackgroundColor: '#2563EB' }, { label: String(annee - 1), data: cumulatif(caParMoisN1), borderColor: '#CBD5E1', backgroundColor: 'transparent', tension: 0.4, borderDash: [5, 4], pointRadius: 3 }]} />
          </div>
        </div>
      )}

      {onglet === 'commercial' && (
        <div style={{display:'flex', flexDirection:'column', gap:18}}>
          <div>
            <ST sub="Pipeline, transformation, volume signé">Performance commerciale</ST>
            <div className="kpi-grid">
              <KPICard label="Taux de transformation" value={fmtPct(mN.tauxTransfo)} sub={`N-1 : ${fmtPct(mN1.tauxTransfo)}`} delta={delta(mN.tauxTransfo, mN1.tauxTransfo)} color="#059669" />
              <KPICard label="Dossiers signés" value={mN.avecDevis} sub={`sur ${mN.nb} ouverts`} delta={delta(mN.avecDevis, mN1.avecDevis)} />
              <KPICard label="Volume travaux HT" value={fmt(mN.travaux)} delta={delta(mN.travaux, mN1.travaux)} color="#1D4ED8"/>
              <KPICard label="Panier moyen" value={fmt(mN.panierMoyen)} delta={delta(mN.panierMoyen, mN1.panierMoyen)} />
            </div>
          </div>
          <div className="card" style={{padding:24}}>
            <ST sub="Valeur des dossiers actifs avec devis non refusés">Pipeline actif — dossiers en cours</ST>
            <div style={{display:'grid', gridTemplateColumns:'1fr 2fr', gap:24}}>
              <div style={{display:'flex', flexDirection:'column', gap:10}}>
                <div style={{padding:16, background:'rgba(37,99,235,0.06)', borderRadius:12, border:'1px solid rgba(37,99,235,0.15)'}}><p style={{fontSize:11, color:'#2563EB', fontWeight:600, marginBottom:4}}>Valeur totale</p><p className="tnum" style={{fontSize:22, fontWeight:800, color:'#1D4ED8'}}>{fmt(mN.pipeline)}</p><p style={{fontSize:11, color:'#60A5FA', marginTop:4}}>{mN.parStatut.en_cours} dossier(s)</p></div>
                <div style={{padding:16, background:'rgba(124,58,237,0.06)', borderRadius:12, border:'1px solid rgba(124,58,237,0.15)'}}><p style={{fontSize:11, color:'#7C3AED', fontWeight:600, marginBottom:4}}>Commissions potentielles</p><p className="tnum" style={{fontSize:18, fontWeight:800, color:'#6D28D9'}}>{fmt(mN.comHT)}</p></div>
                <div style={{padding:16, background:'rgba(5,150,105,0.06)', borderRadius:12, border:'1px solid rgba(5,150,105,0.15)'}}><p style={{fontSize:11, color:'#059669', fontWeight:600, marginBottom:4}}>Honoraires potentiels</p><p className="tnum" style={{fontSize:18, fontWeight:800, color:'#047857'}}>{fmt(mN.honNet)}</p></div>
              </div>
              <div style={{display:'flex', flexDirection:'column', gap:8}}>
                <p style={{fontSize:11.5, fontWeight:600, color:'var(--ink-400)', marginBottom:4}}>Dossiers en cours — volume pipeline HT</p>
                {dN.filter(d => d.statut === 'en_cours' && d._s.montantPipelineHT > 0).sort((a, b) => b._s.montantPipelineHT - a._s.montantPipelineHT).slice(0, 8).map(d => {
                  const maxP = Math.max(...dN.filter(d => d.statut === 'en_cours').map(d => d._s.montantPipelineHT), 1)
                  return (<div key={d.id} style={{display:'flex', alignItems:'center', gap:10}}><span style={{fontSize:11.5, color:'var(--ink-500)', width:112, flexShrink:0}} className="clip-1">{d.client?.prenom} {d.client?.nom}</span><PBar value={d._s.montantPipelineHT} max={maxP} color={TYPO_COLORS[d.typologie] || '#2563EB'} height={8} /><span className="tnum" style={{fontSize:11.5, fontWeight:700, color:'var(--ink-700)', width:96, textAlign:'right'}}>{fmt(d._s.montantPipelineHT)}</span></div>)
                })}
              </div>
            </div>
          </div>
          <div className="card" style={{padding:24}}>
            <ST sub="Volume et commissions par type de mission">Répartition par typologie</ST>
            {typologies.length === 0 ? <p style={{fontSize:12, color:'var(--ink-400)', textAlign:'center', paddingTop:24}}>Aucune donnée</p> : (
              <div style={{display:'flex', flexDirection:'column', gap:16}}>
                <div style={{display:'flex', borderRadius:99, overflow:'hidden', height:10}}>{typologies.map(([key, t]) => <div key={key} style={{ flex: t.nb, backgroundColor: t.color }} />)}</div>
                <table style={{width:'100%'}}>
                  <thead style={{borderBottom:'1px solid var(--ink-100)'}}><tr>
                    {['Typologie','Dossiers','CA HT','COM HT','Honoraires','Taux moy.'].map((h,i) => <th key={h} style={{textAlign:i===0?'left':'right',padding:'8px 0',fontSize:11,fontWeight:700,color:'var(--ink-400)',textTransform:'uppercase'}}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {typologies.map(([key, t]) => (
                      <tr key={key} className="row-hover" style={{borderTop:'1px solid var(--ink-100)'}}>
                        <td style={{padding:'12px 0'}}><div style={{display:'flex',alignItems:'center',gap:8}}><div style={{width:10,height:10,borderRadius:99,backgroundColor:t.color}}/><span style={{fontWeight:600,color:'var(--ink-800)'}}>{t.label}</span></div></td>
                        <td className="tnum" style={{padding:'12px 0',textAlign:'right',color:'var(--ink-600)',fontWeight:600}}>{t.nb}</td>
                        <td className="tnum" style={{padding:'12px 0',textAlign:'right',fontWeight:700,color:t.color}}>{fmt(t.ca)}</td>
                        <td className="tnum" style={{padding:'12px 0',textAlign:'right',color:'var(--ink-600)'}}>{fmt(t.com)}</td>
                        <td className="tnum" style={{padding:'12px 0',textAlign:'right',color:'var(--ink-600)'}}>{fmt(t.hon)}</td>
                        <td className="tnum" style={{padding:'12px 0',textAlign:'right',color:'var(--ink-500)'}}>{t.ca > 0 ? fmtPct((t.com / t.ca) * 100) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {onglet === 'financier' && (
        <div style={{display:'flex', flexDirection:'column', gap:18}}>
          <div>
            <ST sub={`Marges, royalties, répartition — ${annee} vs ${annee - 1}`}>Performance financière</ST>
            <div className="kpi-grid">
              <KPICard label="Net agence total" value={fmt(mN.netTotal)} delta={delta(mN.netTotal, mN1.netTotal)} color="#7C3AED" />
              <KPICard label="Commissions HT" value={fmt(mN.comHT)} delta={delta(mN.comHT, mN1.comHT)} />
              <KPICard label="Honoraires net" value={fmt(mN.honNet)} delta={delta(mN.honNet, mN1.honNet)} />
              <KPICard label="Royalties versées" value={fmt(mN.royalties)} color="#DC2626"/>
            </div>
          </div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:18}}>
            <div className="card" style={{padding:24}}>
              <ST>Répartition des gains {annee}</ST>
              <div style={{display:'flex', flexDirection:'column', gap:14, marginTop:8}}>
                {[{ label: 'Commissions HT', value: mN.comHT, color: '#2563EB' }, { label: 'Honoraires net', value: mN.honNet, color: '#7C3AED' }, { label: 'Frais consultation', value: mN.fraisNet, color: '#059669' }].map(({ label, value, color }) => {
                  const base = Math.max(mN.comHT + mN.honNet + mN.fraisNet, 1)
                  return (<div key={label} style={{display:'flex', flexDirection:'column', gap:6}}><div style={{display:'flex',justifyContent:'space-between', fontSize:12}}><span style={{color:'var(--ink-500)'}}>{label}</span><span style={{fontWeight:700, color}}>{fmt(value)}</span></div><PBar value={value} max={base} color={color} height={6} /></div>)
                })}
              </div>
            </div>
            <div className="card" style={{padding:24}}>
              <ST>Compte de résultat comparé</ST>
              <table style={{width:'100%', fontSize:12, marginTop:8}}>
                <thead style={{borderBottom:'1px solid var(--ink-100)'}}><tr>
                  {['Ligne', annee, annee-1, 'Évol.'].map((h,i) => <th key={i} style={{textAlign:i===0?'left':'right',padding:'8px 0',fontSize:11,fontWeight:700,color:'var(--ink-400)',textTransform:'uppercase'}}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {[{ label: 'Commissions HT', n: mN.comHT, n1: mN1.comHT }, { label: 'Honoraires net', n: mN.honNet, n1: mN1.honNet }, { label: 'Frais consultation', n: mN.fraisNet, n1: mN1.fraisNet }, { label: '= Net total', n: mN.netTotal, n1: mN1.netTotal, bold: true }, { label: '(−) Royalties', n: mN.royalties, n1: mN1.royalties, inverse: true, red: true }].map(({ label, n, n1, bold, inverse, red }) => (
                    <tr key={label} style={{background: bold ? 'rgba(37,99,235,0.04)' : 'transparent', borderTop:'1px solid var(--ink-100)'}}>
                      <td style={{padding:'10px 0', fontWeight:bold?700:400, color:bold?'var(--ink-900)':'var(--ink-600)'}}>{label}</td>
                      <td className="tnum" style={{padding:'10px 0',textAlign:'right',fontWeight:700,color:bold?'#1D4ED8':red?'#DC2626':'var(--ink-700)'}}>{fmt(n)}</td>
                      <td className="tnum" style={{padding:'10px 0',textAlign:'right',color:'var(--ink-400)'}}>{fmt(n1)}</td>
                      <td style={{padding:'10px 0',textAlign:'right'}}><Dlt value={delta(n, n1)} inverse={inverse} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card" style={{padding:24}}>
            <ST sub={`${annee} vs ${annee - 1}`}>CA net mensuel</ST>
            <BarChart labels={MOIS_SHORT} datasets={[{ label: String(annee), data: caParMoisN, backgroundColor: '#7C3AED', borderRadius: 4 }, { label: String(annee - 1), data: caParMoisN1, backgroundColor: '#DDD6FE', borderRadius: 4 }]} />
          </div>
          <div className="card" style={{padding:24}}>
            <ST sub="Progression cumulée sur l'exercice">CA net cumulatif</ST>
            <LineChart labels={MOIS_SHORT} datasets={[{ label: String(annee), data: cumulatif(caParMoisN), borderColor: '#7C3AED', backgroundColor: 'rgba(124,58,237,0.07)', tension: 0.4, fill: true, pointRadius: 4, pointBackgroundColor: '#7C3AED' }, { label: String(annee - 1), data: cumulatif(caParMoisN1), borderColor: '#CBD5E1', backgroundColor: 'transparent', tension: 0.4, borderDash: [5, 4], pointRadius: 3 }]} />
          </div>
        </div>
      )}

      {onglet === 'operationnel' && (
        <div style={{display:'flex', flexDirection:'column', gap:18}}>
          <div>
            <ST sub="Durées, délais, fiabilité">Performance opérationnelle</ST>
            <div className="kpi-grid">
              <KPICard label="Durée moy. chantier" value={mN.dureeMoyenne !== null ? fmtDays(mN.dureeMoyenne) : '—'} sub="démarrage → fin" />
              <KPICard label="Délai moy. encaissement" value={mN.delaiMoyen !== null ? fmtDays(mN.delaiMoyen) : '—'} sub="signature → paiement" />
              <KPICard label="Chantiers terminés" value={mN.parStatut.termine} sub={`sur ${mN.nb} total`} color="#059669" />
              <KPICard label="Taux complétion" value={mN.nb > 0 ? fmtPct((mN.parStatut.termine / mN.nb) * 100) : '—'} color="#0891B2" />
            </div>
          </div>
          <div className="card" style={{padding:24}}>
            <ST sub="Délai moyen entre signature contrat et paiements réglés">Délais d'encaissement par dossier</ST>
            {dN.filter(d => d._s.delaiEncaissementJours !== null).length === 0 ? (
              <p style={{fontSize:12,color:'var(--ink-400)',textAlign:'center',paddingTop:24}}>Aucune donnée de paiement disponible</p>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                {dN.filter(d => d._s.delaiEncaissementJours !== null).sort((a, b) => b._s.delaiEncaissementJours - a._s.delaiEncaissementJours).map(d => {
                  const maxD = Math.max(...dN.filter(d => d._s.delaiEncaissementJours !== null).map(d => d._s.delaiEncaissementJours), 1)
                  const color = d._s.delaiEncaissementJours > 60 ? '#DC2626' : d._s.delaiEncaissementJours > 30 ? '#D97706' : '#059669'
                  return (<div key={d.id} style={{display:'flex',alignItems:'center',gap:10}}><span style={{fontSize:11.5,color:'var(--ink-500)',width:144,flexShrink:0}} className="clip-1">{d.client?.prenom} {d.client?.nom}</span><span style={{fontSize:11.5,color:'var(--ink-400)',width:112,flexShrink:0}} className="clip-1">{d.reference}</span><PBar value={d._s.delaiEncaissementJours} max={maxD} color={color} height={6} /><span className="tnum" style={{fontSize:11.5,fontWeight:700,width:48,textAlign:'right',color}}>{fmtDays(d._s.delaiEncaissementJours)}</span></div>)
                })}
              </div>
            )}
          </div>
          <div className="card" style={{padding:0, overflow:'hidden'}}>
            <div style={{padding:'16px 24px', borderBottom:'1px solid var(--ink-100)', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <div><p style={{fontWeight:700,color:'var(--ink-900)',fontSize:14}}>Classement artisans — {annee}</p><p style={{fontSize:11.5,color:'var(--ink-400)'}}>{topArtisans.length} artisans · volume confié HT</p></div>
              <span className="tnum" style={{fontSize:14,fontWeight:700,color:'#1D4ED8'}}>{fmt(topArtisans.reduce((s, a) => s + a.volumeHT, 0))}</span>
            </div>
            <table style={{width:'100%'}}>
              <thead style={{background:'var(--surface-2)', borderBottom:'1px solid var(--ink-100)'}}>
                <tr>
                  {['#','Artisan','Chantiers','Devis signés','Volume HT','COM HT'].map((h,i) => (
                    <th key={h} className={h==='Volume HT'?'hidden sm:table-cell':''} style={{textAlign:i<=1?'left':'right',padding:'10px 16px',fontSize:11,fontWeight:700,color:'var(--ink-400)',textTransform:'uppercase'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topArtisans.map((a, i) => (
                  <tr key={a.id} className="row-hover" style={{borderTop:'1px solid var(--ink-100)'}}>
                    <td style={{padding:'12px 24px',fontSize:13,fontWeight:800,color:'var(--ink-200)'}}>{i + 1}</td>
                    <td style={{padding:'12px 16px'}}><p style={{fontSize:13,fontWeight:600,color:'var(--ink-800)'}}>{a.entreprise}</p><p style={{fontSize:11.5,color:'var(--ink-400)'}}>{a.metier}</p></td>
                    <td className="tnum" style={{padding:'12px 16px',textAlign:'right',color:'var(--ink-600)'}}>{a.nbChantiers}</td>
                    <td style={{padding:'12px 16px',textAlign:'right'}}><span style={{fontSize:11.5,fontWeight:600}}>{a.signes}/{a.nb}</span><span style={{fontSize:11.5,color:'var(--ink-400)',marginLeft:4}}>({fmtPct(a.tauxSign, 0)})</span></td>
                    <td className="tnum hidden sm:table-cell" style={{padding:'12px 16px',textAlign:'right',fontWeight:700,color:'#1D4ED8'}}>{fmt(a.volumeHT)}</td>
                    <td className="tnum" style={{padding:'12px 24px',textAlign:'right',color:'var(--ink-600)'}}>{fmt(a.comHT)}</td>
                  </tr>
                ))}
                {topArtisans.length === 0 && <tr><td colSpan={6} style={{padding:'32px 24px',textAlign:'center',color:'var(--ink-400)',fontSize:13}}>Aucune donnée</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {onglet === 'equipe' && isMarine && (
        <div style={{display:'flex', flexDirection:'column', gap:18}}>
          <ST sub={`Performance individuelle — exercice ${annee} vs ${annee - 1}`}>Équipe</ST>
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:18}}>
            {statsAgentes.map(({ agente, color, m, mP }) => (
              <div key={agente.id} className="card" style={{padding:24, borderColor:color.border, display:'flex', flexDirection:'column', gap:16}}>
                <div style={{display:'flex', alignItems:'center', gap:8}}>
                  <div style={{width:12, height:12, borderRadius:99, backgroundColor:color.dot, flexShrink:0}} />
                  <span style={{fontWeight:700, color:'var(--ink-900)', flex:1}}>{agente.prenom} {agente.nom}</span>
                  <span style={{fontSize:11, padding:'2px 8px', borderRadius:99, color:'#fff', backgroundColor:color.dot}}>{agente.role === 'admin' ? 'Franchisée' : 'Agente'}</span>
                </div>
                <div style={{display:'flex', flexDirection:'column', gap:4}}>
                  {[
                    { label: 'Chantiers', vN: m.nb, vP: mP.nb, fmtFn: v => v },
                    { label: 'Volume HT', vN: m.travaux, vP: mP.travaux, fmtFn: fmt },
                    { label: 'Taux transfo', vN: m.tauxTransfo, vP: mP.tauxTransfo, fmtFn: fmtPct },
                    { label: 'Net agence', vN: m.netTotal, vP: mP.netTotal, fmtFn: fmt },
                    { label: 'Gains perso', vN: agente.role === 'admin' ? m.gainAdmin : m.gainAgente, vP: agente.role === 'admin' ? mP.gainAdmin : mP.gainAgente, fmtFn: fmt },
                  ].map(({ label, vN, vP, fmtFn }) => (
                    <div key={label} style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid var(--ink-100)'}}>
                      <span style={{fontSize:12, color:'var(--ink-500)'}}>{label}</span>
                      <div style={{display:'flex', alignItems:'center', gap:8}}><span style={{fontSize:12, fontWeight:700, color:'var(--ink-800)'}}>{fmtFn(vN)}</span><Dlt value={delta(vN, vP)} /></div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {statsAgentes.length > 1 && (
            <div className="card" style={{padding:24}}>
              <ST sub="CA net mensuel par membre de l'équipe">CA mensuel comparé</ST>
              <BarChart labels={MOIS_SHORT} datasets={statsAgentes.map(({ agente, color, caParMoisA }) => ({ label: `${agente.prenom} ${agente.nom}`, data: caParMoisA, backgroundColor: color.dot, borderRadius: 4 }))} />
              <div style={{display:'flex', gap:16, marginTop:12, flexWrap:'wrap'}}>{statsAgentes.map(({ agente, color }) => (<div key={agente.id} style={{display:'flex', alignItems:'center', gap:6}}><div style={{width:10,height:10,borderRadius:3,backgroundColor:color.dot}}/><span style={{fontSize:12,color:'var(--ink-500)'}}>{agente.prenom} {agente.nom}</span></div>))}</div>
            </div>
          )}
          <div className="card" style={{padding:0, overflow:'hidden'}}>
            <div style={{padding:'16px 24px', borderBottom:'1px solid var(--ink-100)'}}><p style={{fontWeight:700,color:'var(--ink-900)',fontSize:14}}>Récapitulatif équipe — {annee}</p></div>
            <table style={{width:'100%'}}>
              <thead style={{background:'var(--surface-2)', borderBottom:'1px solid var(--ink-100)'}}>
                <tr>{['Membre','Chantiers','Volume HT','Taux transfo','Net agence','Gains perso'].map((h,i) => <th key={h} style={{textAlign:i===0?'left':'right',padding:'12px 16px',fontSize:11,fontWeight:700,color:'var(--ink-400)',textTransform:'uppercase'}}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {statsAgentes.map(({ agente, color, m }) => (
                  <tr key={agente.id} className="row-hover" style={{borderTop:'1px solid var(--ink-100)'}}>
                    <td style={{padding:'12px 16px'}}><div style={{display:'flex',alignItems:'center',gap:8}}><div style={{width:8,height:8,borderRadius:99,backgroundColor:color.dot}}/><span style={{fontWeight:600,color:'var(--ink-800)'}}>{agente.prenom} {agente.nom}</span><span style={{fontSize:11.5,color:'var(--ink-400)'}}>{agente.role === 'admin' ? 'Franchisée' : 'Agente'}</span></div></td>
                    <td className="tnum" style={{padding:'12px 16px',textAlign:'right',color:'var(--ink-600)'}}>{m.nb}</td>
                    <td className="tnum" style={{padding:'12px 16px',textAlign:'right',fontWeight:700,color:color.dot}}>{fmt(m.travaux)}</td>
                    <td className="tnum" style={{padding:'12px 16px',textAlign:'right',color:'var(--ink-600)'}}>{fmtPct(m.tauxTransfo)}</td>
                    <td className="tnum" style={{padding:'12px 16px',textAlign:'right',color:'var(--ink-600)'}}>{fmt(m.netTotal)}</td>
                    <td className="tnum" style={{padding:'12px 24px',textAlign:'right',fontWeight:700,color:'var(--ink-900)'}}>{fmt(agente.role === 'admin' ? m.gainAdmin : m.gainAgente)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot style={{background:'var(--surface-2)', borderTop:'2px solid var(--ink-200)', fontWeight:700}}>
                <tr><td style={{padding:'12px 16px',color:'var(--ink-700)'}}>Total</td><td className="tnum" style={{padding:'12px 16px',textAlign:'right',color:'var(--ink-700)'}}>{mN.nb}</td><td className="tnum" style={{padding:'12px 16px',textAlign:'right',color:'#1D4ED8'}}>{fmt(mN.travaux)}</td><td className="tnum" style={{padding:'12px 16px',textAlign:'right',color:'var(--ink-700)'}}>{fmtPct(mN.tauxTransfo)}</td><td className="tnum" style={{padding:'12px 16px',textAlign:'right',color:'var(--ink-700)'}}>{fmt(mN.netTotal)}</td><td className="tnum" style={{padding:'12px 24px',textAlign:'right',color:'var(--ink-700)'}}>{fmt(mN.gainAgente + mN.gainAdmin)}</td></tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

    </div>
  )
}
