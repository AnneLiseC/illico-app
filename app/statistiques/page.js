'use client'
import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { calculateDossierFinance } from '../lib/finance'

const round2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100
const fmt = (n) => { const num = Math.round(n || 0); return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + '\u00a0€' }
const fmtPct = (n, dec = 1) => `${(n || 0).toFixed(dec)}%`
const fmtDays = (n) => `${Math.round(n || 0)}\u00a0j`
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
  const isPos = delta > 0; const isNeg = delta < 0; const hasD = delta !== null && delta !== undefined && !isNaN(delta)
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-1"><span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</span>{icon && <span className="text-base">{icon}</span>}</div>
      <div className="flex items-end gap-2 mt-1">
        <span className="text-2xl font-bold" style={{ color: color || '#111827' }}>{value}</span>
        {hasD && <span className={`text-xs font-semibold mb-0.5 ${isPos ? 'text-emerald-600' : isNeg ? 'text-red-500' : 'text-gray-400'}`}>{isPos ? '▲' : isNeg ? '▼' : '='} {Math.abs(delta).toFixed(1)}%</span>}
      </div>
      {sub && <span className="text-xs text-gray-400 mt-0.5 block">{sub}</span>}
    </div>
  )
}

function ST({ children, sub }) {
  return <div className="mb-5"><h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">{children}</h2>{sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}</div>
}

function useChart(ref, type, data, options) {
  useEffect(() => {
    if (typeof Chart === 'undefined' || !ref.current) return
    if (ref.current._c) ref.current._c.destroy()
    ref.current._c = new Chart(ref.current, { type, data, options })
    return () => { if (ref.current?._c) { ref.current._c.destroy(); ref.current._c = null } }
  }, [JSON.stringify(data)])
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
  if (value === null || value === undefined || isNaN(value)) return <span className="text-xs text-gray-300">—</span>
  const isGood = inverse ? value < 0 : value > 0
  return <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${value === 0 ? 'bg-gray-100 text-gray-400' : isGood ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>{value > 0 ? '+' : ''}{value.toFixed(1)}%</span>
}

function PBar({ value, max, color = '#2563EB', height = 6 }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return <div className="flex-1 bg-gray-100 rounded-full" style={{ height }}><div style={{ width: `${pct}%`, height, backgroundColor: color, borderRadius: 9999 }} /></div>
}

export default function Statistiques() {
  const [profile, setProfile] = useState(null)
  const [dossiers, setDossiers] = useState([])
  const [agentes, setAgentes] = useState([])
  const [loading, setLoading] = useState(true)
  const [onglet, setOnglet] = useState('overview')
  const [annee, setAnnee] = useState(new Date().getFullYear())
  const router = useRouter()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profData } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(profData)
      const { data: dossiersData } = await supabase.from('dossiers').select(`*, referente:profiles!dossiers_referente_id_fkey(id, prenom, nom, role), client:clients(id, prenom, nom, civilite), devis_artisans(*, artisan:artisans(id, entreprise, metier, sans_royalties)), suivi_financier(*)`).order('created_at', { ascending: false })
      setDossiers(dossiersData || [])
      const { data: agentesData } = await supabase.from('profiles').select('*').in('role', ['admin', 'agente']).order('prenom')
      setAgentes(agentesData || [])
      setLoading(false)
    }
    init()
  }, [router])

  const isMarine = profile?.role === 'admin'
  const dossiersVisibles = isMarine ? dossiers : dossiers.filter(d => d.referente?.id === profile?.id)
  const anneesDispos = [...new Set(dossiersVisibles.map(d => { const dt = d.date_signature_contrat || d.created_at; return dt ? new Date(dt).getFullYear() : null }).filter(Boolean))].sort((a, b) => b - a)
  const filterAnnee = (list, a) => list.filter(d => { const dt = d.date_signature_contrat || d.created_at; return dt && new Date(dt).getFullYear() === a })
  const enrichir = (list) => list.map(d => ({ ...d, _s: calculerStats(d) }))
  const dN = enrichir(filterAnnee(dossiersVisibles, annee))
  const dN1 = enrichir(filterAnnee(dossiersVisibles, annee - 1))

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

  const mN = metriques(dN); const mN1 = metriques(dN1)
  const delta = (a, b) => (!b || b === 0) ? null : round2(((a - b) / b) * 100)
  const caParMois = (list) => { const arr = Array(12).fill(0); list.forEach(d => { const dt = d.date_signature_contrat || d.created_at; if (dt) arr[new Date(dt).getMonth()] += d._s.netTotal }); return arr }
  const caParMoisN = caParMois(dN); const caParMoisN1 = caParMois(dN1)
  const cumulatif = (arr) => arr.reduce((acc, v, i) => { acc.push((acc[i-1] || 0) + v); return acc }, [])

  const typologies = (() => {
    const map = {}
    dN.forEach(d => { const t = d.typologie || 'autre'; if (!map[t]) map[t] = { label: TYPO_LABELS[t] || t, color: TYPO_COLORS[t] || '#6B7280', nb: 0, ca: 0, com: 0, hon: 0 }; map[t].nb++; map[t].ca += d._s.montantTravauxHT; map[t].com += d._s.comHT; map[t].hon += d._s.honNet })
    return Object.entries(map).sort((a, b) => b[1].nb - a[1].nb)
  })()

  const topArtisans = (() => {
    const map = {}
    dN.forEach(d => { (d.devis_artisans || []).filter(dv => dv.statut !== 'refuse').forEach(dv => { const id = dv.artisan?.id; if (!id) return; if (!map[id]) map[id] = { id, entreprise: dv.artisan?.entreprise || '—', metier: dv.artisan?.metier || '—', volumeHT: 0, comHT: 0, nb: 0, signes: 0, chantiers: new Set() }; map[id].volumeHT += Number(dv.montant_ht) || 0; map[id].comHT += (Number(dv.montant_ht) || 0) * (Number(dv.commission_pourcentage) || 0); map[id].nb++; if (dv.statut === 'accepte' || dv.date_signature) map[id].signes++; map[id].chantiers.add(d.id) }) })
    return Object.values(map).map(a => ({ ...a, nbChantiers: a.chantiers.size, tauxSign: a.nb > 0 ? (a.signes / a.nb) * 100 : 0 })).sort((a, b) => b.volumeHT - a.volumeHT).slice(0, 15)
  })()

  const topClients = (() => {
    const map = {}
    dN.forEach(d => { const id = d.client?.id; if (!id) return; if (!map[id]) map[id] = { id, prenom: d.client?.prenom || '', nom: d.client?.nom || '', ca: 0, nb: 0, typologies: new Set() }; map[id].ca += d._s.montantTravauxHT; map[id].nb++; if (d.typologie) map[id].typologies.add(d.typologie) })
    return Object.values(map).map(c => ({ ...c, typologies: [...c.typologies] })).sort((a, b) => b.ca - a.ca).slice(0, 15)
  })()

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

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-400 text-sm">Chargement…</p></div>

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4 flex-wrap">
          <button onClick={() => router.push('/dashboard')} className="text-gray-400 hover:text-gray-600 text-sm">← Retour</button>
          <h1 className="text-base font-bold text-gray-900">Statistiques</h1>
          <div className="flex gap-1 flex-wrap">
            {onglets.map(({ key, label }) => (
              <button key={key} onClick={() => setOnglet(key)} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${onglet === key ? 'bg-blue-800 text-white' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}>{label}</button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-gray-400">Exercice</span>
          <select value={annee} onChange={e => setAnnee(parseInt(e.target.value))} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            {anneesDispos.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <span className="text-xs text-gray-300">vs {annee - 1}</span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">

        {onglet === 'overview' && (
          <div className="space-y-8">
            <div><ST sub={`${annee} vs ${annee - 1} — variation en %`}>Indicateurs clés de performance</ST>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KPICard label="Chantiers ouverts" value={mN.nb} sub={`${mN.avecDevis} avec devis signé`} delta={delta(mN.nb, mN1.nb)} icon="📁" />
                <KPICard label="Volume travaux HT" value={fmt(mN.travaux)} sub={`N-1 : ${fmt(mN1.travaux)}`} delta={delta(mN.travaux, mN1.travaux)} color="#1D4ED8" icon="🏗" />
                <KPICard label="Net agence" value={fmt(mN.netTotal)} sub={`Royalties : ${fmt(mN.royalties)}`} delta={delta(mN.netTotal, mN1.netTotal)} color="#7C3AED" icon="💰" />
                <KPICard label="Taux de transformation" value={fmtPct(mN.tauxTransfo)} sub={`N-1 : ${fmtPct(mN1.tauxTransfo)}`} delta={delta(mN.tauxTransfo, mN1.tauxTransfo)} color="#059669" icon="🎯" />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KPICard label="Pipeline actif" value={fmt(mN.pipeline)} sub={`${mN.parStatut.en_cours} dossier(s) en cours`} icon="📊" color="#0891B2" />
              <KPICard label="Panier moyen" value={fmt(mN.panierMoyen)} sub={`N-1 : ${fmt(mN1.panierMoyen)}`} delta={delta(mN.panierMoyen, mN1.panierMoyen)} icon="🧮" />
              <KPICard label="Durée moy. chantier" value={mN.dureeMoyenne !== null ? fmtDays(mN.dureeMoyenne) : '—'} sub="démarrage → fin" icon="📅" />
              <KPICard label="Délai moy. encaissement" value={mN.delaiMoyen !== null ? fmtDays(mN.delaiMoyen) : '—'} sub="signature → paiement" icon="⏱" />
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
                <ST>Statuts des dossiers</ST>
                <div className="space-y-4">
                  {[{ key: 'en_cours', label: 'En cours', color: '#059669' }, { key: 'en_attente', label: 'En attente', color: '#D97706' }, { key: 'termine', label: 'Terminés', color: '#6B7280' }, { key: 'annule', label: 'Annulés', color: '#DC2626' }].map(({ key, label, color }) => (
                    <div key={key} className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 w-24">{label}</span>
                      <PBar value={mN.parStatut[key]} max={mN.nb || 1} color={color} />
                      <span className="text-sm font-bold text-gray-800 w-6 text-right">{mN.parStatut[key]}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
                <ST>Répartition typologies</ST>
                {typologies.length === 0 ? <p className="text-xs text-gray-400 py-8 text-center">Aucune donnée</p> : (
                  <div className="flex gap-5 items-center">
                    <div style={{ width: 150, flexShrink: 0 }}>
                      <DoughnutChart labels={typologies.map(([, t]) => t.label)} data={typologies.map(([, t]) => t.nb)} colors={typologies.map(([, t]) => t.color)} height={150} />
                    </div>
                    <div className="space-y-2 flex-1">
                      {typologies.map(([key, t]) => (
                        <div key={key} className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                          <span className="text-xs text-gray-600 flex-1">{t.label}</span>
                          <span className="text-xs font-bold text-gray-800">{t.nb}</span>
                          <span className="text-xs text-gray-400">{fmtPct((t.nb / (mN.nb || 1)) * 100, 0)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
              <ST sub={`Comparaison mensuelle ${annee} vs ${annee - 1}`}>CA net mensuel</ST>
              <BarChart labels={MOIS_SHORT} datasets={[{ label: String(annee), data: caParMoisN, backgroundColor: '#2563EB', borderRadius: 4 }, { label: String(annee - 1), data: caParMoisN1, backgroundColor: '#BFDBFE', borderRadius: 4 }]} />
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
              <ST sub="CA net cumulé sur l'exercice">Progression cumulative</ST>
              <LineChart labels={MOIS_SHORT} datasets={[{ label: String(annee), data: cumulatif(caParMoisN), borderColor: '#2563EB', backgroundColor: 'rgba(37,99,235,0.08)', tension: 0.4, fill: true, pointRadius: 4, pointBackgroundColor: '#2563EB' }, { label: String(annee - 1), data: cumulatif(caParMoisN1), borderColor: '#CBD5E1', backgroundColor: 'transparent', tension: 0.4, borderDash: [5, 4], pointRadius: 3 }]} />
            </div>
          </div>
        )}

        {onglet === 'commercial' && (
          <div className="space-y-8">
            <div><ST sub="Pipeline, transformation, volume signé">Performance commerciale</ST>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KPICard label="Taux de transformation" value={fmtPct(mN.tauxTransfo)} sub={`N-1 : ${fmtPct(mN1.tauxTransfo)}`} delta={delta(mN.tauxTransfo, mN1.tauxTransfo)} color="#059669" icon="🎯" />
                <KPICard label="Dossiers signés" value={mN.avecDevis} sub={`sur ${mN.nb} ouverts`} delta={delta(mN.avecDevis, mN1.avecDevis)} icon="✅" />
                <KPICard label="Volume travaux HT" value={fmt(mN.travaux)} delta={delta(mN.travaux, mN1.travaux)} color="#1D4ED8" icon="🏗" />
                <KPICard label="Panier moyen" value={fmt(mN.panierMoyen)} delta={delta(mN.panierMoyen, mN1.panierMoyen)} icon="🧮" />
              </div>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
              <ST sub="Valeur des dossiers actifs avec devis non refusés">Pipeline actif — dossiers en cours</ST>
              <div className="grid grid-cols-3 gap-6">
                <div className="space-y-3">
                  <div className="p-4 bg-blue-50 rounded-xl border border-blue-100"><p className="text-xs text-blue-600 font-medium mb-1">Valeur totale</p><p className="text-2xl font-bold text-blue-800">{fmt(mN.pipeline)}</p><p className="text-xs text-blue-400 mt-1">{mN.parStatut.en_cours} dossier(s)</p></div>
                  <div className="p-4 bg-purple-50 rounded-xl border border-purple-100"><p className="text-xs text-purple-600 font-medium mb-1">Commissions potentielles</p><p className="text-xl font-bold text-purple-800">{fmt(mN.comHT)}</p></div>
                  <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100"><p className="text-xs text-emerald-600 font-medium mb-1">Honoraires potentiels</p><p className="text-xl font-bold text-emerald-800">{fmt(mN.honNet)}</p></div>
                </div>
                <div className="col-span-2 space-y-2">
                  <p className="text-xs font-medium text-gray-400 mb-3">Dossiers en cours — volume pipeline HT</p>
                  {dN.filter(d => d.statut === 'en_cours' && d._s.montantPipelineHT > 0).sort((a, b) => b._s.montantPipelineHT - a._s.montantPipelineHT).slice(0, 8).map(d => {
                    const maxP = Math.max(...dN.filter(d => d.statut === 'en_cours').map(d => d._s.montantPipelineHT), 1)
                    return (<div key={d.id} className="flex items-center gap-3"><span className="text-xs text-gray-500 w-28 truncate">{d.client?.prenom} {d.client?.nom}</span><PBar value={d._s.montantPipelineHT} max={maxP} color={TYPO_COLORS[d.typologie] || '#2563EB'} height={8} /><span className="text-xs font-bold text-gray-700 w-24 text-right">{fmt(d._s.montantPipelineHT)}</span></div>)
                  })}
                </div>
              </div>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
              <ST sub="Volume et commissions par type de mission">Répartition par typologie</ST>
              {typologies.length === 0 ? <p className="text-xs text-gray-400 py-8 text-center">Aucune donnée</p> : (
                <div className="space-y-4">
                  <div className="flex rounded-full overflow-hidden h-2.5">{typologies.map(([key, t]) => <div key={key} style={{ flex: t.nb, backgroundColor: t.color }} />)}</div>
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-gray-100"><th className="text-left py-2 text-xs font-medium text-gray-400 uppercase">Typologie</th><th className="text-right py-2 text-xs font-medium text-gray-400 uppercase">Dossiers</th><th className="text-right py-2 text-xs font-medium text-gray-400 uppercase">CA HT</th><th className="text-right py-2 text-xs font-medium text-gray-400 uppercase">COM HT</th><th className="text-right py-2 text-xs font-medium text-gray-400 uppercase">Honoraires</th><th className="text-right py-2 text-xs font-medium text-gray-400 uppercase">Taux moy.</th></tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {typologies.map(([key, t]) => (
                        <tr key={key} className="hover:bg-gray-50">
                          <td className="py-3"><div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color }} /><span className="font-medium text-gray-800">{t.label}</span></div></td>
                          <td className="py-3 text-right text-gray-600 font-medium">{t.nb}</td>
                          <td className="py-3 text-right font-bold" style={{ color: t.color }}>{fmt(t.ca)}</td>
                          <td className="py-3 text-right text-gray-600">{fmt(t.com)}</td>
                          <td className="py-3 text-right text-gray-600">{fmt(t.hon)}</td>
                          <td className="py-3 text-right text-gray-500">{t.ca > 0 ? fmtPct((t.com / t.ca) * 100) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                <div><p className="font-semibold text-gray-800 text-sm">Top clients — {annee}</p><p className="text-xs text-gray-400">{topClients.length} client(s)</p></div>
                <span className="text-sm font-bold text-emerald-700">{fmt(topClients.reduce((s, c) => s + c.ca, 0))}</span>
              </div>
              <div className="divide-y divide-gray-50">
                {topClients.map((c, i) => (
                  <div key={c.id} className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50">
                    <span className="text-sm font-bold text-gray-200 w-5 text-center">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{c.prenom} {c.nom}</p>
                      <div className="flex gap-1 mt-0.5 flex-wrap">{c.typologies.map(t => (<span key={t} className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: (TYPO_COLORS[t] || '#6B7280') + '20', color: TYPO_COLORS[t] || '#6B7280' }}>{TYPO_LABELS[t] || t}</span>))}</div>
                    </div>
                    <div className="w-32 hidden md:block"><PBar value={c.ca} max={topClients[0]?.ca || 1} color="#059669" height={5} /></div>
                    <div className="text-right min-w-[100px]"><p className="text-sm font-bold text-emerald-700">{fmt(c.ca)}</p><p className="text-xs text-gray-400">{c.nb} dossier{c.nb > 1 ? 's' : ''}</p></div>
                  </div>
                ))}
                {topClients.length === 0 && <p className="text-center text-gray-400 text-sm py-10">Aucune donnée</p>}
              </div>
            </div>
          </div>
        )}

        {onglet === 'financier' && (
          <div className="space-y-8">
            <div><ST sub={`Marges, royalties, répartition — ${annee} vs ${annee - 1}`}>Performance financière</ST>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KPICard label="Net agence total" value={fmt(mN.netTotal)} delta={delta(mN.netTotal, mN1.netTotal)} color="#7C3AED" icon="💰" />
                <KPICard label="Commissions HT" value={fmt(mN.comHT)} delta={delta(mN.comHT, mN1.comHT)} icon="📈" />
                <KPICard label="Honoraires net" value={fmt(mN.honNet)} delta={delta(mN.honNet, mN1.honNet)} icon="🏷️" />
                <KPICard label="Royalties versées" value={fmt(mN.royalties)} color="#DC2626" icon="🔴" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
                <ST>Répartition des gains {annee}</ST>
                <div className="space-y-4 mt-2">
                  {[{ label: 'Commissions HT', value: mN.comHT, color: '#2563EB' }, { label: 'Honoraires net', value: mN.honNet, color: '#7C3AED' }, { label: 'Frais consultation', value: mN.fraisNet, color: '#059669' }].map(({ label, value, color }) => {
                    const base = Math.max(mN.comHT + mN.honNet + mN.fraisNet, 1)
                    return (<div key={label} className="space-y-1.5"><div className="flex justify-between text-xs"><span className="text-gray-500">{label}</span><span className="font-bold" style={{ color }}>{fmt(value)}</span></div><PBar value={value} max={base} color={color} height={6} /></div>)
                  })}
                </div>
              </div>
              <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
                <ST>Compte de résultat comparé</ST>
                <table className="w-full text-xs mt-2">
                  <thead><tr className="border-b border-gray-100"><th className="text-left py-2 text-gray-400 uppercase">Ligne</th><th className="text-right py-2 text-gray-400 uppercase">{annee}</th><th className="text-right py-2 text-gray-400 uppercase">{annee - 1}</th><th className="text-right py-2 text-gray-400 uppercase">Évol.</th></tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {[{ label: 'Commissions HT', n: mN.comHT, n1: mN1.comHT }, { label: 'Honoraires net', n: mN.honNet, n1: mN1.honNet }, { label: 'Frais consultation', n: mN.fraisNet, n1: mN1.fraisNet }, { label: '= Net total', n: mN.netTotal, n1: mN1.netTotal, bold: true }, { label: '(−) Royalties', n: mN.royalties, n1: mN1.royalties, inverse: true, red: true }].map(({ label, n, n1, bold, inverse, red }) => (
                      <tr key={label} className={bold ? 'bg-blue-50' : ''}>
                        <td className={`py-2.5 ${bold ? 'font-bold text-gray-800' : 'text-gray-600'}`}>{label}</td>
                        <td className={`py-2.5 text-right font-bold ${bold ? 'text-blue-700' : red ? 'text-red-500' : 'text-gray-700'}`}>{fmt(n)}</td>
                        <td className="py-2.5 text-right text-gray-400">{fmt(n1)}</td>
                        <td className="py-2.5 text-right"><Dlt value={delta(n, n1)} inverse={inverse} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
              <ST sub={`${annee} vs ${annee - 1}`}>CA net mensuel</ST>
              <BarChart labels={MOIS_SHORT} datasets={[{ label: String(annee), data: caParMoisN, backgroundColor: '#7C3AED', borderRadius: 4 }, { label: String(annee - 1), data: caParMoisN1, backgroundColor: '#DDD6FE', borderRadius: 4 }]} />
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
              <ST sub="Progression cumulée sur l'exercice">CA net cumulatif</ST>
              <LineChart labels={MOIS_SHORT} datasets={[{ label: String(annee), data: cumulatif(caParMoisN), borderColor: '#7C3AED', backgroundColor: 'rgba(124,58,237,0.07)', tension: 0.4, fill: true, pointRadius: 4, pointBackgroundColor: '#7C3AED' }, { label: String(annee - 1), data: cumulatif(caParMoisN1), borderColor: '#CBD5E1', backgroundColor: 'transparent', tension: 0.4, borderDash: [5, 4], pointRadius: 3 }]} />
            </div>
          </div>
        )}

        {onglet === 'operationnel' && (
          <div className="space-y-8">
            <div><ST sub="Durées, délais, fiabilité">Performance opérationnelle</ST>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KPICard label="Durée moy. chantier" value={mN.dureeMoyenne !== null ? fmtDays(mN.dureeMoyenne) : '—'} sub="démarrage → fin" icon="📅" />
                <KPICard label="Délai moy. encaissement" value={mN.delaiMoyen !== null ? fmtDays(mN.delaiMoyen) : '—'} sub="signature → paiement" icon="⏱" />
                <KPICard label="Chantiers terminés" value={mN.parStatut.termine} sub={`sur ${mN.nb} total`} color="#059669" icon="✅" />
                <KPICard label="Taux complétion" value={mN.nb > 0 ? fmtPct((mN.parStatut.termine / mN.nb) * 100) : '—'} icon="📊" color="#0891B2" />
              </div>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
              <ST sub="Délai moyen entre signature contrat et paiements réglés">Délais d'encaissement par dossier</ST>
              {dN.filter(d => d._s.delaiEncaissementJours !== null).length === 0 ? (
                <p className="text-xs text-gray-400 py-8 text-center">Aucune donnée de paiement disponible</p>
              ) : (
                <div className="space-y-3">
                  {dN.filter(d => d._s.delaiEncaissementJours !== null).sort((a, b) => b._s.delaiEncaissementJours - a._s.delaiEncaissementJours).map(d => {
                    const maxD = Math.max(...dN.filter(d => d._s.delaiEncaissementJours !== null).map(d => d._s.delaiEncaissementJours), 1)
                    const color = d._s.delaiEncaissementJours > 60 ? '#DC2626' : d._s.delaiEncaissementJours > 30 ? '#D97706' : '#059669'
                    return (<div key={d.id} className="flex items-center gap-3"><span className="text-xs text-gray-500 w-36 truncate">{d.client?.prenom} {d.client?.nom}</span><span className="text-xs text-gray-400 w-28 truncate">{d.reference}</span><PBar value={d._s.delaiEncaissementJours} max={maxD} color={color} height={6} /><span className="text-xs font-bold w-12 text-right" style={{ color }}>{fmtDays(d._s.delaiEncaissementJours)}</span></div>)
                  })}
                </div>
              )}
            </div>
            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                <div><p className="font-semibold text-gray-800 text-sm">Classement artisans — {annee}</p><p className="text-xs text-gray-400">{topArtisans.length} artisans · volume confié HT</p></div>
                <span className="text-sm font-bold text-blue-700">{fmt(topArtisans.reduce((s, a) => s + a.volumeHT, 0))}</span>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr><th className="text-left px-6 py-2 text-xs font-medium text-gray-400 uppercase">#</th><th className="text-left px-3 py-2 text-xs font-medium text-gray-400 uppercase">Artisan</th><th className="text-right px-3 py-2 text-xs font-medium text-gray-400 uppercase">Chantiers</th><th className="text-right px-3 py-2 text-xs font-medium text-gray-400 uppercase">Devis signés</th><th className="text-right px-3 py-2 text-xs font-medium text-gray-400 uppercase hidden md:table-cell">Volume HT</th><th className="text-right px-6 py-2 text-xs font-medium text-gray-400 uppercase">COM HT</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {topArtisans.map((a, i) => (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-sm font-bold text-gray-200">{i + 1}</td>
                      <td className="px-3 py-3"><p className="text-sm font-medium text-gray-800">{a.entreprise}</p><p className="text-xs text-gray-400">{a.metier}</p></td>
                      <td className="px-3 py-3 text-right text-gray-600">{a.nbChantiers}</td>
                      <td className="px-3 py-3 text-right"><span className="text-xs font-medium">{a.signes}/{a.nb}</span><span className="text-xs text-gray-400 ml-1">({fmtPct(a.tauxSign, 0)})</span></td>
                      <td className="px-3 py-3 text-right font-bold text-blue-700 hidden md:table-cell">{fmt(a.volumeHT)}</td>
                      <td className="px-6 py-3 text-right text-gray-600">{fmt(a.comHT)}</td>
                    </tr>
                  ))}
                  {topArtisans.length === 0 && <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-400 text-sm">Aucune donnée</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {onglet === 'equipe' && isMarine && (
          <div className="space-y-8">
            <ST sub={`Performance individuelle — exercice ${annee} vs ${annee - 1}`}>Équipe</ST>
            <div className={`grid gap-5 ${statsAgentes.length <= 2 ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-3'}`}>
              {statsAgentes.map(({ agente, color, m, mP }) => (
                <div key={agente.id} className="bg-white border rounded-xl p-6 shadow-sm space-y-4" style={{ borderColor: color.border }}>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color.dot }} />
                    <span className="font-semibold text-gray-800">{agente.prenom} {agente.nom}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full text-white ml-auto" style={{ backgroundColor: color.dot }}>{agente.role === 'admin' ? 'Franchisée' : 'Agente'}</span>
                  </div>
                  <div className="space-y-1.5">
                    {[
                      { label: 'Chantiers', vN: m.nb, vP: mP.nb, fmtFn: v => v },
                      { label: 'Volume HT', vN: m.travaux, vP: mP.travaux, fmtFn: fmt },
                      { label: 'Taux transfo', vN: m.tauxTransfo, vP: mP.tauxTransfo, fmtFn: fmtPct },
                      { label: 'Net agence', vN: m.netTotal, vP: mP.netTotal, fmtFn: fmt },
                      { label: 'Gains perso', vN: agente.role === 'admin' ? m.gainAdmin : m.gainAgente, vP: agente.role === 'admin' ? mP.gainAdmin : mP.gainAgente, fmtFn: fmt },
                    ].map(({ label, vN, vP, fmtFn }) => (
                      <div key={label} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                        <span className="text-xs text-gray-500">{label}</span>
                        <div className="flex items-center gap-2"><span className="text-xs font-bold text-gray-800">{fmtFn(vN)}</span><Dlt value={delta(vN, vP)} /></div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {statsAgentes.length > 1 && (
              <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
                <ST sub="CA net mensuel par membre de l'équipe">CA mensuel comparé</ST>
                <BarChart labels={MOIS_SHORT} datasets={statsAgentes.map(({ agente, color, caParMoisA }) => ({ label: `${agente.prenom} ${agente.nom}`, data: caParMoisA, backgroundColor: color.dot, borderRadius: 4 }))} />
                <div className="flex gap-4 mt-3 flex-wrap">{statsAgentes.map(({ agente, color }) => (<div key={agente.id} className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: color.dot }} /><span className="text-xs text-gray-500">{agente.prenom} {agente.nom}</span></div>))}</div>
              </div>
            )}
            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100"><p className="font-semibold text-gray-800 text-sm">Récapitulatif équipe — {annee}</p></div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr><th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase">Membre</th><th className="text-right px-3 py-3 text-xs font-medium text-gray-400 uppercase">Chantiers</th><th className="text-right px-3 py-3 text-xs font-medium text-gray-400 uppercase">Volume HT</th><th className="text-right px-3 py-3 text-xs font-medium text-gray-400 uppercase">Taux transfo</th><th className="text-right px-3 py-3 text-xs font-medium text-gray-400 uppercase">Net agence</th><th className="text-right px-6 py-3 text-xs font-medium text-gray-400 uppercase">Gains perso</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {statsAgentes.map(({ agente, color, m }) => (
                    <tr key={agente.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3"><div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{ backgroundColor: color.dot }} /><span className="font-medium text-gray-800">{agente.prenom} {agente.nom}</span><span className="text-xs text-gray-400">{agente.role === 'admin' ? 'Franchisée' : 'Agente'}</span></div></td>
                      <td className="px-3 py-3 text-right text-gray-600">{m.nb}</td>
                      <td className="px-3 py-3 text-right font-bold" style={{ color: color.dot }}>{fmt(m.travaux)}</td>
                      <td className="px-3 py-3 text-right text-gray-600">{fmtPct(m.tauxTransfo)}</td>
                      <td className="px-3 py-3 text-right text-gray-600">{fmt(m.netTotal)}</td>
                      <td className="px-6 py-3 text-right font-bold text-gray-800">{fmt(agente.role === 'admin' ? m.gainAdmin : m.gainAgente)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t-2 border-gray-200 font-bold">
                  <tr><td className="px-6 py-3 text-gray-700">Total</td><td className="px-3 py-3 text-right text-gray-700">{mN.nb}</td><td className="px-3 py-3 text-right text-blue-700">{fmt(mN.travaux)}</td><td className="px-3 py-3 text-right text-gray-700">{fmtPct(mN.tauxTransfo)}</td><td className="px-3 py-3 text-right text-gray-700">{fmt(mN.netTotal)}</td><td className="px-6 py-3 text-right text-gray-700">{fmt(mN.gainAgente + mN.gainAdmin)}</td></tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}