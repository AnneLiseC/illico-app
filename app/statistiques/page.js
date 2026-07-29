'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth-context'
import { computeCAMensuel, computeRoyalties, computeCABreakdown, computeFactureClient } from '../lib/ca-reel'
import { calcStatut } from '../lib/dossiers'
// chart.js (~150 Ko) chargé À LA DEMANDE : hors bundle initial de /statistiques,
// téléchargé seulement au premier dessin du graphique (après le premier affichage).
let _ChartLib = null
async function getChart() {
  if (_ChartLib) return _ChartLib
  const m = await import('chart.js')
  m.Chart.register(m.CategoryScale, m.LinearScale, m.BarElement, m.LineElement, m.PointElement, m.BarController, m.LineController, m.Tooltip, m.Legend)
  _ChartLib = m.Chart
  return _ChartLib
}

const MOIS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']
const TYPO_LABEL = { courtage: 'Courtage', amo: 'AMO', estimo: 'Estimo', merad: 'MERAD', audit_energetique: 'Audit énergétique', studio_jardin: 'Studio de jardin' }
const round2 = (n) => Math.round(((n || 0) + Number.EPSILON) * 100) / 100
const fmtEur = (n) => Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' €'


const somme = (parMois) => Object.values(parMois).reduce((s, v) => s + v, 0)

// Graphe barres (année N) + ligne (année N-1).
function BarLineChart({ id, courant, precedent, annee, couleur }) {
  useEffect(() => {
    if (typeof window === 'undefined') return
    const el = document.getElementById(id)
    if (!el) return
    let cancelled = false
    getChart().then(Chart => {
      if (cancelled || !el) return
      if (el._chartInstance) el._chartInstance.destroy()
      el._chartInstance = new Chart(el, {
      data: {
        labels: MOIS,
        datasets: [
          { type: 'bar',  label: String(annee),     data: MOIS.map((_, i) => Math.round(courant[i + 1] || 0)),   backgroundColor: couleur, borderRadius: 3, order: 2 },
          { type: 'line', label: String(annee - 1), data: MOIS.map((_, i) => Math.round(precedent[i + 1] || 0)), borderColor: '#94a3b8', borderWidth: 2, borderDash: [4, 3], pointRadius: 2, tension: 0.3, order: 1 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ctx.dataset.label + ' : ' + Math.round(ctx.parsed.y).toLocaleString('fr-FR') + ' €' } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#888' } },
          y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 10 }, color: '#888', callback: v => Math.round(v).toLocaleString('fr-FR') } },
        },
      },
      })
    })
    return () => { cancelled = true; if (el._chartInstance) { el._chartInstance.destroy(); el._chartInstance = null } }
  }, [id, courant, precedent, annee, couleur])
  return <div style={{ position: 'relative', width: '100%', height: 240 }}><canvas id={id} /></div>
}

function StatKpi({ label, value, sub, tone = 'brand' }) {
  const color = { brand: 'var(--ink-900)', ok: '#15803d', warn: '#a16207', bad: '#b91c1c' }[tone] || 'var(--ink-900)'
  return (
    <div className="card kpi">
      <div className="eyebrow" style={{ marginBottom: 8 }}>{label}</div>
      <div className="tnum" style={{ fontSize: 26, fontWeight: 800, color, letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

function Legende({ items }) {
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
      {items.map(({ color, label, dashed }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: dashed ? 'transparent' : color, border: dashed ? `2px dashed ${color}` : 'none' }} />
          <span style={{ fontSize: 11, color: 'var(--ink-500)' }}>{label}</span>
        </div>
      ))}
    </div>
  )
}

// Ligne d'un relevé comptable : libellé à gauche, montant à droite.
function LigneCompta({ label, value, bold, neg, accent }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '5px 0' }}>
      <span style={{ fontSize: 12.5, color: bold ? 'var(--ink-900)' : 'var(--ink-600)', fontWeight: bold ? 700 : 500 }}>{label}</span>
      <span className="tnum" style={{ fontSize: bold ? 17 : 14, fontWeight: bold ? 800 : 600, color: accent ? '#a16207' : neg ? '#b91c1c' : 'var(--ink-900)', whiteSpace: 'nowrap' }}>{fmtEur(value)}</span>
    </div>
  )
}

// Barres horizontales : label · montant · barre proportionnelle.
function BarList({ items, couleur = '#6366f1' }) {
  const max = Math.max(...items.map(i => i.value), 1)
  if (items.length === 0) return <div style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>Aucune donnée sur la période.</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      {items.map((it, i) => (
        <div key={i}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5, marginBottom: 3 }}>
            <span style={{ color: 'var(--ink-700)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
            <span className="tnum" style={{ color: 'var(--ink-900)', fontWeight: 600, whiteSpace: 'nowrap' }}>{it.right}</span>
          </div>
          <div style={{ height: 7, borderRadius: 4, background: 'var(--ink-100)', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 4, background: couleur, width: `${Math.max(2, it.value / max * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Statistiques() {
  const { user, profile, initialized, agenceActive } = useAuth()
  const router = useRouter()
  const [dossiers, setDossiers] = useState([])
  const [objectifs, setObjectifs] = useState([])
  const [redevances, setRedevances] = useState([])
  const [loading, setLoading] = useState(true)
  const [annee, setAnnee] = useState(new Date().getFullYear())
  const [mode, setMode] = useState('agence')   // admin : 'agence' (CA généré) | 'societe' (résultat net)
  const isAdmin = profile?.role === 'admin'
  const modeEff = isAdmin ? mode : 'agence'

  useEffect(() => {
    if (!initialized) return
    if (!user) { router.replace('/login'); return }
    if (profile?.role === 'client') router.replace('/espace-client')
  }, [initialized, user?.id, profile?.role, router])

  useEffect(() => {
    if (!initialized || !user || !profile) return
    let annule = false
    async function load() {
      setLoading(true)
      // Pas de filtre referente : la RLS scope (admin = société, agente = ses dossiers).
      const [{ data: dos }, { data: obj }, { data: redev }] = await Promise.all([
        supabase.from('dossiers').select(`
          id, reference, statut, typologie, created_at, archive, agence_id,
          frais_statut, frais_consultation, part_agente, frais_part_agente,
          honoraires_amo_taux, taux_courtage, contrat_signe, apporteur_actif,
          date_signature_contrat, date_signature_devis, date_demarrage_chantier,
          date_fin_chantier, date_limite_devis, date_cloture,
          referente:profiles!dossiers_referente_id_fkey(id, prenom, nom, role, frais_part_agente_defaut),
          client:clients(prenom, nom, apporteur_pourcentage, apporteur_base),
          devis_artisans(id, montant_ht, montant_ttc, commission_pourcentage, statut, date_reception, date_signature, artisan:artisans(id, entreprise, metier, partenaire)),
          suivi_financier(*)
        `).order('created_at', { ascending: false }),
        supabase.from('objectifs_ca').select('*'),
        supabase.from('redevances').select('*'),
      ])
      if (annule) return
      setDossiers(dos || [])
      setObjectifs(obj || [])
      setRedevances(redev || [])
      setLoading(false)
    }
    load()
    return () => { annule = true }
  }, [initialized, user?.id, profile?.id])

  // Périmètre agence active (agenceActive) = base pour les royalties (charge sur
  // TOUT le CA agence) et le calcul de « ma part sur les chantiers des agentes ».
  const dossiersScoped = useMemo(() => {
    return agenceActive ? dossiers.filter(d => d.agence_id === agenceActive) : dossiers
  }, [dossiers, agenceActive])

  // « Société » = SÉPARATION de périmètre (le monde de la franchisée, à part des
  // agentes) : toutes les vues (CA, top artisans, métiers, typologie, entonnoir,
  // dossiers) portent sur les seuls dossiers de l'admin. Ce que la société gagne
  // grâce aux agentes (sa part + les loyers) s'ajoute en lignes séparées (compta).
  const dossiersVue = useMemo(() => {
    return (isAdmin && modeEff === 'societe')
      ? dossiersScoped.filter(d => d.referente?.id === profile?.id)
      : dossiersScoped
  }, [dossiersScoped, isAdmin, modeEff, profile?.id])

  // Découpages PAR agente : uniquement en vue Agence (admin).
  const showAgentes = isAdmin && modeEff === 'agence'

  const caMois    = useMemo(() => computeCAMensuel(dossiersVue, annee),     [dossiersVue, annee])
  const caMoisN1  = useMemo(() => computeCAMensuel(dossiersVue, annee - 1), [dossiersVue, annee])
  const roy       = useMemo(() => computeRoyalties(dossiersScoped, annee),     [dossiersScoped, annee])
  const royN1     = useMemo(() => computeRoyalties(dossiersScoped, annee - 1), [dossiersScoped, annee])

  // « Ce qu'on facture au client » (HT) : frais + honoraires, BRUT facturé sur les
  // dossiers signés de l'année. Base FACTURÉ (≠ réel encaissé du reste de la page).
  const factureClient   = useMemo(() => computeFactureClient(dossiersVue, annee),     [dossiersVue, annee])
  const factureClientN1 = useMemo(() => computeFactureClient(dossiersVue, annee - 1), [dossiersVue, annee])
  const evolFacture = factureClientN1.total > 0 ? Math.round((factureClient.total - factureClientN1.total) / factureClientN1.total * 100) : null

  const caTotal   = round2(somme(caMois))
  const caTotalN1 = round2(somme(caMoisN1))
  const evolCA    = caTotalN1 > 0 ? Math.round((caTotal - caTotalN1) / caTotalN1 * 100) : null

  // Dossiers signés / terminés dans l'année (par date).
  const nbSignes  = dossiersVue.filter(d => d.date_signature_contrat && new Date(d.date_signature_contrat).getFullYear() === annee).length
  const nbTermines = dossiersVue.filter(d => d.date_fin_chantier && new Date(d.date_fin_chantier).getFullYear() === annee).length

  // Objectif annuel selon le périmètre (les objectifs sont ANNUELS dans la base).
  const objectifAnnuel = useMemo(() => {
    const y = objectifs.filter(o => o.annee === annee)
    if (!isAdmin) {
      return y.find(o => o.cible === 'agente' && o.agente_id === profile?.id)?.montant
        || y.find(o => o.cible === 'agence' && o.agence_id === profile?.agence_id)?.montant || 0
    }
    if (agenceActive) return y.find(o => o.cible === 'agence' && o.agence_id === agenceActive)?.montant || 0
    return y.filter(o => o.cible === 'agence').reduce((s, o) => s + (o.montant || 0), 0)   // consolidé = somme
  }, [objectifs, annee, isAdmin, agenceActive, profile])
  const pctObjectif = objectifAnnuel > 0 ? Math.round(caTotal / objectifAnnuel * 100) : null

  const anneesDispo = (() => {
    const ymax = new Date().getFullYear()
    const ymin = dossiers.reduce((m, d) => {
      const y = d.created_at ? new Date(d.created_at).getFullYear() : ymax
      return Math.min(m, y)
    }, ymax)
    const arr = []; for (let a = ymax; a >= Math.min(ymin, ymax - 1); a--) arr.push(a)
    return arr
  })()

  // ── Sections 3-6 (mémoïsées) ──
  // Loyers agents encaissés (redevances statut 'regle') — REVENU de la société,
  // distinct du CA brokerage et des royalties (charge vers le franchiseur).
  const loyers = useMemo(() => {
    const base = agenceActive ? redevances.filter(r => r.agence_id === agenceActive) : redevances
    const enc = (an) => round2(base.filter(r => r.annee === an && r.statut === 'regle').reduce((s, r) => s + (Number(r.montant_ht) || 0), 0))
    return { annee: enc(annee), n1: enc(annee - 1) }
  }, [redevances, agenceActive, annee])

  const repartition = useMemo(() => {
    const caDe = (ds) => round2(somme(computeCAMensuel(ds, annee)))
    const gTypo = {}, gAg = {}
    for (const d of dossiersVue) {
      (gTypo[d.typologie || '—'] ||= []).push(d)
      const rid = d.referente?.id || '—'
      ;(gAg[rid] ||= { nom: d.referente ? `${d.referente.prenom || ''} ${d.referente.nom || ''}`.trim() : '—', ds: [] }).ds.push(d)
    }
    return {
      typo: Object.entries(gTypo).map(([t, ds]) => ({ label: TYPO_LABEL[t] || t, ca: caDe(ds) })).filter(x => x.ca > 0).sort((a, b) => b.ca - a.ca),
      agente: Object.values(gAg).map(g => ({ nom: g.nom, ca: caDe(g.ds) })).filter(x => x.ca > 0).sort((a, b) => b.ca - a.ca),
    }
  }, [dossiersVue, annee])

  const compta = useMemo(() => {
    const b = computeCABreakdown(dossiersVue, annee)                                       // produits de la VUE (société = mes dossiers)
    const caAgenceNet = round2(somme(computeCAMensuel(dossiersScoped, annee, 'agence')))   // CA agence net (parts incluses)
    const caAgenceSociete = round2(somme(computeCAMensuel(dossiersScoped, annee, 'societe'))) // net − parts sur toute l'agence
    return {
      ...b,
      caSociete: caAgenceSociete,
      partAgentes: round2(caAgenceNet - caAgenceSociete),   // parts versées aux agentes (vue Agence)
      partSurAgentes: round2(caAgenceSociete - b.total),    // ma part sur les chantiers des agentes (vue Société)
      royalties: roy.total,
    }
  }, [dossiersVue, dossiersScoped, annee, roy.total])

  const funnel = useMemo(() => {
    const actifs = dossiersVue.filter(d => d.archive !== true)
    const buckets = [
      { label: 'À traiter', match: s => ['a_contacter', 'a_relancer'].includes(s) },
      { label: 'En étude', match: s => ['en_etude', 'devis_en_attente', 'devis_prets', 'devis_a_modifier'].includes(s) },
      { label: 'Attente signature', match: s => s === 'en_attente_signature' },
      { label: 'Chantier à venir', match: s => s === 'chantier_a_venir' },
      { label: 'En chantier', match: s => s === 'en_cours_chantier' },
      { label: 'Terminés', match: s => s === 'termine' },
    ].map(b => ({ label: b.label, n: actifs.filter(d => b.match(calcStatut(d))).length }))
    const tot = dossiersVue.length
    const nbSign = dossiersVue.filter(d => d.contrat_signe).length
    let dvT = 0, dvA = 0
    for (const d of dossiersVue) for (const dv of (d.devis_artisans || [])) { dvT++; if (dv.statut === 'accepte' || dv.date_signature) dvA++ }
    const jours = (a, c) => (a && c) ? Math.round((new Date(c) - new Date(a)) / 86400000) : null
    const moy = (arr) => { const v = arr.filter(x => x != null && x >= 0); return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null }
    return {
      buckets,
      tauxSignature: tot ? Math.round(nbSign / tot * 100) : 0,
      tauxDevis: dvT ? Math.round(dvA / dvT * 100) : 0,
      delaiSign: moy(dossiersVue.map(d => jours(d.created_at, d.date_signature_contrat))),
      delaiChantier: moy(dossiersVue.map(d => jours(d.date_signature_contrat, d.date_fin_chantier))),
    }
  }, [dossiersVue])

  const devisArt = useMemo(() => {
    const art = {}, met = {}
    let sMnt = 0, nMnt = 0
    for (const d of dossiersVue) for (const dv of (d.devis_artisans || [])) {
      if (!(dv.statut === 'accepte' || dv.date_signature)) continue
      const mnt = Number(dv.montant_ht) || 0
      sMnt += mnt; nMnt++
      const e = dv.artisan?.entreprise || '—', m = dv.artisan?.metier || '—'
      ;(art[e] ||= { montant: 0, commission: 0, metier: m }); art[e].montant += mnt; art[e].commission += round2(mnt * (Number(dv.commission_pourcentage) || 0))
      ;(met[m] ||= { montant: 0, n: 0 }); met[m].montant += mnt; met[m].n++
    }
    return {
      montantMoyen: nMnt ? round2(sMnt / nMnt) : 0,
      nbSignes: nMnt,
      topArtisans: Object.entries(art).map(([e, v]) => ({ e, ...v })).sort((a, b) => b.montant - a.montant).slice(0, 8),
      topMetiers: Object.entries(met).map(([m, v]) => ({ m, ...v })).sort((a, b) => b.montant - a.montant).slice(0, 6),
    }
  }, [dossiersVue])

  const agentesRows = useMemo(() => {
    if (!isAdmin) return []
    const g = {}
    for (const d of dossiersScoped) { const r = d.referente; if (!r) continue; (g[r.id] ||= { nom: `${r.prenom || ''} ${r.nom || ''}`.trim(), role: r.role, ds: [] }).ds.push(d) }
    return Object.entries(g).map(([id, v]) => {
      const ca = round2(somme(computeCAMensuel(v.ds, annee, 'agence')))
      const nb = v.ds.length
      const signed = v.ds.filter(d => d.contrat_signe).length
      return {
        nom: v.nom, role: v.role, ca, nb,
        caSoc: round2(somme(computeCAMensuel(v.ds, annee, 'societe'))),
        taux: nb ? Math.round(signed / nb * 100) : 0,
        roy: computeRoyalties(v.ds, annee).total,
        obj: objectifs.find(o => o.annee === annee && o.cible === 'agente' && o.agente_id === id)?.montant || 0,
      }
    }).sort((a, b) => b.ca - a.ca)
  }, [dossiersScoped, annee, isAdmin, objectifs])

  if (!initialized || loading) {
    return (
      <div className="page-enter page-pad">
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--ink-500)', fontSize: 13 }}>Chargement des statistiques…</div>
      </div>
    )
  }

  return (
    <div className="page-enter page-pad" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* En-tête + sélecteur d'année */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Analyse{isAdmin ? ' · reddition franchiseur' : ''}</div>
          <h1 className="page">Statistiques</h1>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {isAdmin && (
            <div style={{ display: 'flex', borderRadius: 8, border: '1px solid var(--ink-200)', overflow: 'hidden' }}>
              {[{ k: 'agence', l: 'Agence' }, { k: 'societe', l: 'Société' }].map(o => (
                <button key={o.k} onClick={() => setMode(o.k)}
                  style={{ padding: '6px 14px', fontSize: 12.5, fontWeight: 600, border: 'none', cursor: 'pointer',
                    background: mode === o.k ? 'var(--brand-700)' : 'transparent', color: mode === o.k ? '#fff' : 'var(--ink-600)' }}>
                  {o.l}
                </button>
              ))}
            </div>
          )}
          <select value={annee} onChange={e => setAnnee(Number(e.target.value))}
            style={{ fontSize: 13, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--ink-200)', background: 'var(--surface-1)', color: 'var(--ink-700)' }}>
            {anneesDispo.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>
      {isAdmin && (
        <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: -8 }}>
          {modeEff === 'societe'
            ? <><strong style={{ color: 'var(--ink-700)' }}>Société</strong> · tes dossiers d&apos;admin uniquement ; ta part sur les chantiers agents + leurs loyers s&apos;ajoutent dans les chiffres clés.</>
            : <><strong style={{ color: 'var(--ink-700)' }}>Agence</strong> · toute l&apos;agence, agents inclus.</>}
        </div>
      )}

      {/* ── SECTION 1 — Synthèse franchiseur ── */}
      <div className="kpi-grid">
        <StatKpi label={modeEff === 'societe' ? `Mon CA ${annee}` : `CA généré ${annee}`} value={fmtEur(caTotal)} tone="brand"
          sub={evolCA != null ? `${evolCA >= 0 ? '▲' : '▼'} ${Math.abs(evolCA)}% vs ${annee - 1} (${fmtEur(caTotalN1)})` : `vs ${annee - 1} : n/a`} />
        <StatKpi label={`Facturé aux clients · HT ${annee}`} value={fmtEur(factureClient.total)} tone="brand"
          sub={`Frais ${fmtEur(factureClient.frais)} · Honoraires ${fmtEur(factureClient.honoraires)}${evolFacture != null ? ` · ${evolFacture >= 0 ? '▲' : '▼'} ${Math.abs(evolFacture)}% vs ${annee - 1}` : ''}`} />
        {isAdmin ? (
          <StatKpi label="Royalties reversées au franchiseur" value={fmtEur(roy.total)} tone="brand"
            sub={`Frais ${fmtEur(roy.parPoste.frais)} · Comm. ${fmtEur(roy.parPoste.commissions)} · Hono. ${fmtEur(roy.parPoste.honoraires)}`} />
        ) : (
          <StatKpi label="Mes gains (part agent)" value={fmtEur(compta.partAgentes)} tone="brand"
            sub={`Royalties générées ${fmtEur(roy.total)}`} />
        )}
        <StatKpi label="Dossiers" value={`${nbSignes} signés`} tone="ok"
          sub={`${nbTermines} chantiers terminés en ${annee}`} />
        {modeEff !== 'societe' && (
          <StatKpi label="Objectif CA agence" value={objectifAnnuel > 0 ? fmtEur(objectifAnnuel) : '—'} tone="brand"
            sub={pctObjectif != null ? `${pctObjectif}% atteint` : 'objectif non défini'} />
        )}
      </div>
      {modeEff !== 'societe' && objectifAnnuel > 0 && (
        <div className="card" style={{ padding: '12px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink-500)', marginBottom: 6 }}>
            <span>Avancement objectif {annee}</span>
            <span className="tnum" style={{ fontWeight: 700, color: 'var(--ink-700)' }}>{fmtEur(caTotal)} / {fmtEur(objectifAnnuel)} · {pctObjectif}%</span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: 'var(--ink-100)', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 4, background: 'var(--brand-500)', width: `${Math.min(pctObjectif || 0, 100)}%` }} />
          </div>
        </div>
      )}

      {/* ── SECTION 2 — CA & royalties dans le temps (N vs N-1) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
        <div className="card" style={{ padding: 20 }}>
          <h2 className="page" style={{ fontSize: 15, marginBottom: 4 }}>{modeEff === 'societe' ? 'Mon CA par mois' : 'CA généré par mois'}</h2>
          <div className="subtitle" style={{ marginBottom: 12 }}>Réel encaissé · {annee} vs {annee - 1}</div>
          <Legende items={[{ color: 'var(--ink-900)', label: `${annee}` }, { color: '#94a3b8', label: `${annee - 1}`, dashed: true }]} />
          <BarLineChart id="stats_ca" courant={caMois} precedent={caMoisN1} annee={annee} couleur="#6366f1" />
        </div>
        <div className="card" style={{ padding: 20 }}>
          <h2 className="page" style={{ fontSize: 15, marginBottom: 4 }}>Royalties franchiseur par mois</h2>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Reversées au franchiseur · {annee} vs {annee - 1}</div>
          <Legende items={[{ color: '#d97706', label: `Royalties ${annee}` }, { color: '#94a3b8', label: `${annee - 1}`, dashed: true }]} />
          <BarLineChart id="stats_roy" courant={roy.parMois} precedent={royN1.parMois} annee={annee} couleur="#d97706" />
        </div>
      </div>

      {/* ── SECTION 3 — D'où vient le CA (typologie / agente) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <div className="card" style={{ padding: 20 }}>
          <h2 className="page" style={{ fontSize: 15, marginBottom: 4 }}>CA par typologie</h2>
          <div className="eyebrow" style={{ marginBottom: 14 }}>D&apos;où vient le chiffre d&apos;affaires · {annee}</div>
          <BarList items={repartition.typo.map(t => ({ label: t.label, value: t.ca, right: fmtEur(t.ca) }))} couleur="#6366f1" />
        </div>
        {showAgentes && (
          <div className="card" style={{ padding: 20 }}>
            <h2 className="page" style={{ fontSize: 15, marginBottom: 4 }}>CA par agent</h2>
            <div className="eyebrow" style={{ marginBottom: 14 }}>Contribution de chacun · {annee}</div>
            <BarList items={repartition.agente.map(a => ({ label: a.nom, value: a.ca, right: fmtEur(a.ca) }))} couleur="#8b5cf6" />
          </div>
        )}
      </div>

      {/* ── Bloc comptable — Chiffres clés ── */}
      <div className="card" style={{ padding: 20 }}>
        <h2 className="page" style={{ fontSize: 15, marginBottom: 4 }}>Chiffres clés {annee}</h2>
        <div className="eyebrow" style={{ marginBottom: 14 }}>Réel encaissé</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 28 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Produits encaissés{modeEff === 'societe' ? ' · mes dossiers' : ''}</div>
            <LigneCompta label="Frais de consultation" value={compta.frais} />
            <LigneCompta label="Commissions" value={compta.commissions} />
            <LigneCompta label="Honoraires" value={compta.honoraires} />
            <LigneCompta label="Apporteur client remboursé" value={-compta.apporteur} neg />
            <div style={{ borderTop: '1px solid var(--ink-200)', marginTop: 6, paddingTop: 6 }}>
              <LigneCompta label={modeEff === 'societe' ? 'Mon CA (net)' : 'CA généré (net)'} value={compta.total} bold />
            </div>
          </div>
          {showAgentes ? (
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Répartition du CA net</div>
              <LigneCompta label="Part société" value={compta.caSociete} />
              <LigneCompta label="Part agents" value={compta.partAgentes} />
              <div style={{ borderTop: '1px solid var(--ink-200)', marginTop: 6, paddingTop: 6 }}>
                <LigneCompta label="Royalties au franchiseur (déjà déduites, indicatif)" value={compta.royalties} accent />
              </div>
            </div>
          ) : modeEff === 'societe' ? (
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Revenu total de la société</div>
              <LigneCompta label="Mon CA (mes dossiers)" value={compta.total} />
              <LigneCompta label="Ma part sur chantiers agents" value={compta.partSurAgentes} />
              <LigneCompta label="Loyers agents encaissés" value={loyers.annee} />
              <div style={{ borderTop: '1px solid var(--ink-200)', marginTop: 6, paddingTop: 6 }}>
                <LigneCompta label="Total encaissé société" value={round2(compta.total + compta.partSurAgentes + loyers.annee)} bold />
              </div>
              <div style={{ marginTop: 10 }}>
                <LigneCompta label="Royalties au franchiseur (déjà déduites, indicatif)" value={compta.royalties} accent />
              </div>
            </div>
          ) : (
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Royalties franchiseur</div>
              <LigneCompta label="Royalties générées (indicatif)" value={compta.royalties} accent />
            </div>
          )}
        </div>
      </div>

      {/* ── SECTION 4 — Entonnoir de conversion ── */}
      <div className="card" style={{ padding: 20 }}>
        <h2 className="page" style={{ fontSize: 15, marginBottom: 4 }}>Entonnoir de conversion</h2>
        <div className="eyebrow" style={{ marginBottom: 14 }}>Où en sont les dossiers actifs · taux &amp; délais</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 16 }}>
          {funnel.buckets.map(b => (
            <div key={b.label} style={{ padding: '10px 12px', border: '1px solid var(--ink-100)', borderRadius: 8, textAlign: 'center' }}>
              <div className="tnum" style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink-900)' }}>{b.n}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>{b.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--ink-600)' }}>
          <div>Taux de contrat signé : <strong style={{ color: 'var(--ink-900)' }}>{funnel.tauxSignature}%</strong></div>
          <div>Devis acceptés : <strong style={{ color: 'var(--ink-900)' }}>{funnel.tauxDevis}%</strong></div>
          <div>Délai moyen → signature : <strong style={{ color: 'var(--ink-900)' }}>{funnel.delaiSign != null ? `${funnel.delaiSign} j` : '—'}</strong></div>
          <div>Durée moyenne chantier : <strong style={{ color: 'var(--ink-900)' }}>{funnel.delaiChantier != null ? `${funnel.delaiChantier} j` : '—'}</strong></div>
        </div>
      </div>

      {/* ── SECTION 5 — Devis & artisans ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <div className="card" style={{ padding: 20 }}>
          <h2 className="page" style={{ fontSize: 15, marginBottom: 4 }}>Top artisans</h2>
          <div className="eyebrow" style={{ marginBottom: 14 }}>Volume signé · commission générée</div>
          <BarList items={devisArt.topArtisans.map(a => ({ label: `${a.e}${a.metier && a.metier !== '—' ? ' · ' + a.metier : ''}`, value: a.montant, right: `${fmtEur(a.montant)} · ${fmtEur(a.commission)}` }))} couleur="#16a34a" />
        </div>
        <div className="card" style={{ padding: 20 }}>
          <h2 className="page" style={{ fontSize: 15, marginBottom: 4 }}>Par métier</h2>
          <div className="eyebrow" style={{ marginBottom: 14 }}>{devisArt.nbSignes} devis signés · montant moyen {fmtEur(devisArt.montantMoyen)}</div>
          <BarList items={devisArt.topMetiers.map(m => ({ label: m.m, value: m.montant, right: `${fmtEur(m.montant)} (${m.n})` }))} couleur="#f59e0b" />
        </div>
      </div>

      {/* ── SECTION 6 — Performance par agent (admin) ── */}
      {showAgentes && agentesRows.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--ink-200)' }}>
            <h2 className="page" style={{ fontSize: 15 }}>Performance par agent · {annee}</h2>
            <div className="eyebrow" style={{ marginTop: 3 }}>La reddition déclinée par agent</div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)' }}>
                  {['Agent', 'CA généré', 'Part société', 'Dossiers', 'Taux signé', 'Royalties', 'vs Objectif'].map((h, i) => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: i === 0 ? 'left' : 'right', fontSize: 11, fontWeight: 700, color: 'var(--ink-500)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {agentesRows.map(r => (
                  <tr key={r.nom} style={{ borderTop: '1px solid var(--ink-100)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--ink-900)', whiteSpace: 'nowrap' }}>{r.nom}{r.role === 'admin' ? ' · admin' : ''}</td>
                    <td className="tnum" style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>{fmtEur(r.ca)}</td>
                    <td className="tnum" style={{ padding: '10px 14px', textAlign: 'right' }}>{fmtEur(r.caSoc)}</td>
                    <td className="tnum" style={{ padding: '10px 14px', textAlign: 'right' }}>{r.nb}</td>
                    <td className="tnum" style={{ padding: '10px 14px', textAlign: 'right' }}>{r.taux}%</td>
                    <td className="tnum" style={{ padding: '10px 14px', textAlign: 'right', color: '#a16207' }}>{fmtEur(r.roy)}</td>
                    <td className="tnum" style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--ink-500)' }}>{r.obj > 0 ? `${Math.round(r.ca / r.obj * 100)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
