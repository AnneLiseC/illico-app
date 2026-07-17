'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth-context'
import { calculateDossierFinance, calculateDevisFinance, getActiveDevis, calculateSoldeAmoReel } from '../lib/finance'
import {
  Chart, CategoryScale, LinearScale, BarElement, LineElement, PointElement,
  BarController, LineController, Tooltip, Legend,
} from 'chart.js'
Chart.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, BarController, LineController, Tooltip, Legend)

const MOIS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']
const round2 = (n) => Math.round(((n || 0) + Number.EPSILON) * 100) / 100
const fmtEur = (n) => Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' €'

// Normalisation identique au dashboard (part_agente, taux_amo, mode apporteur).
const normDossier = (d) => ({
  ...d,
  part_agente:       d.part_agente ?? (d.referente?.role === 'admin' ? 0 : 0.5),
  frais_part_agente: d.frais_part_agente ?? null,
  taux_amo:          d?.honoraires_amo_taux,
  client: d?.client ? {
    ...d.client,
    apporteur_mode: d.client?.apporteur_base === 'total_chantier' ? 'total_chantier_ht' : 'par_devis',
  } : null,
})

// CA réel encaissé par mois — logique IDENTIQUE au dashboard (source unique).
// mode 'agence' = CA généré (net, parts agentes incluses).
// mode 'societe' = résultat net société (parts agentes déduites → part société).
function computeCAMensuel(dossiers, annee, mode = 'agence') {
  const soc = mode === 'societe'
  const monthly = {}
  const add = (dateStr, net, agente) => {
    const amount = soc ? (net - (agente || 0)) : net
    if (!dateStr || !amount) return
    const d = new Date(dateStr)
    if (d.getFullYear() !== annee) return
    monthly[d.getMonth() + 1] = (monthly[d.getMonth() + 1] || 0) + amount
  }
  for (const d of dossiers) {
    const nd = normDossier(d)
    const fin = calculateDossierFinance(nd)
    const suivi = d.suivi_financier || []
    const sfFrais    = suivi.find(s => s.type_echeance === 'frais_consultation'  && s.statut_illico === 'recu')
    const sfCourtage = suivi.find(s => s.type_echeance === 'honoraires_courtage' && s.statut_illico === 'recu')
    const sfAmo      = suivi.find(s => s.type_echeance === 'solde_amo'           && s.statut_illico === 'recu')
    if (sfFrais && nd.frais_statut !== 'offerts') add(sfFrais.date_paiement || nd.date_signature_contrat, fin.frais.net, fin.frais.parts.agente)
    if (sfCourtage) add(sfCourtage.date_paiement || nd.date_signature_contrat, fin.honoraires.courtage.net, fin.honoraires.courtage.parts.agente)
    const soldeAmoR = calculateSoldeAmoReel({ ...nd, suivi_financier: suivi })
    if (soldeAmoR.hasTranches) { for (const t of soldeAmoR.tranches) add(t.date_paiement, t.net, t.parts?.agente) }
    else if (sfAmo) add(sfAmo.date_paiement, fin.honoraires.soldeAmo.net, fin.honoraires.soldeAmo.parts.agente)
    for (const dv of getActiveDevis(d)) {
      const artId = dv.artisan?.id
      const sfAcompte = suivi.find(s => s.type_echeance === 'acompte_artisan' && s.devis_id === dv.id && s.statut_illico === 'recu')
      const sfFacture = suivi.find(s => s.type_echeance === 'facture_finale'  && s.artisan_id === artId && s.statut_illico === 'recu')
      const dvFin = calculateDevisFinance(dv, nd)
      if (sfAcompte)      add(sfAcompte.date_deblocage || sfAcompte.date_paiement, dvFin.netCom, dvFin.parts.agente)
      else if (sfFacture) add(sfFacture.date_paiement, dvFin.netCom, dvFin.parts.agente)
    }
  }
  return monthly
}

// Royalties RÉELLES (redevance franchiseur) — même reconnaissance à l'encaissement
// que le CA, mais on somme les royalties par poste (frais / commissions / honoraires).
function computeRoyalties(dossiers, annee) {
  const parMois = {}
  const parPoste = { frais: 0, commissions: 0, honoraires: 0 }
  const add = (dateStr, amount, poste) => {
    if (!dateStr || !amount) return
    const d = new Date(dateStr)
    if (d.getFullYear() !== annee) return
    parMois[d.getMonth() + 1] = (parMois[d.getMonth() + 1] || 0) + amount
    parPoste[poste] += amount
  }
  for (const d of dossiers) {
    const nd = normDossier(d)
    const fin = calculateDossierFinance(nd)
    const suivi = d.suivi_financier || []
    const sfFrais    = suivi.find(s => s.type_echeance === 'frais_consultation'  && s.statut_illico === 'recu')
    const sfCourtage = suivi.find(s => s.type_echeance === 'honoraires_courtage' && s.statut_illico === 'recu')
    const sfAmo      = suivi.find(s => s.type_echeance === 'solde_amo'           && s.statut_illico === 'recu')
    if (sfFrais && nd.frais_statut !== 'offerts') add(sfFrais.date_paiement || nd.date_signature_contrat, fin.frais.royalties, 'frais')
    if (sfCourtage) add(sfCourtage.date_paiement || nd.date_signature_contrat, fin.honoraires.courtage.royalties, 'honoraires')
    const soldeAmoR = calculateSoldeAmoReel({ ...nd, suivi_financier: suivi })
    if (soldeAmoR.hasTranches) { for (const t of soldeAmoR.tranches) add(t.date_paiement, t.royalties, 'honoraires') }
    else if (sfAmo) add(sfAmo.date_paiement, fin.honoraires.soldeAmo.royalties, 'honoraires')
    for (const dv of getActiveDevis(d)) {
      const artId = dv.artisan?.id
      const sfAcompte = suivi.find(s => s.type_echeance === 'acompte_artisan' && s.devis_id === dv.id && s.statut_illico === 'recu')
      const sfFacture = suivi.find(s => s.type_echeance === 'facture_finale'  && s.artisan_id === artId && s.statut_illico === 'recu')
      const dvFin = calculateDevisFinance(dv, nd)
      if (sfAcompte)      add(sfAcompte.date_deblocage || sfAcompte.date_paiement, dvFin.royaltiesType2, 'commissions')
      else if (sfFacture) add(sfFacture.date_paiement, dvFin.royaltiesType2, 'commissions')
    }
  }
  const total = round2(parPoste.frais + parPoste.commissions + parPoste.honoraires)
  return { parMois, parPoste, total }
}

const somme = (parMois) => Object.values(parMois).reduce((s, v) => s + v, 0)

// Graphe barres (année N) + ligne (année N-1).
function BarLineChart({ id, courant, precedent, annee, couleur }) {
  useEffect(() => {
    if (typeof window === 'undefined') return
    const el = document.getElementById(id)
    if (!el) return
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
    return () => { if (el._chartInstance) { el._chartInstance.destroy(); el._chartInstance = null } }
  }, [id, courant, precedent, annee, couleur])
  return <div style={{ position: 'relative', width: '100%', height: 240 }}><canvas id={id} /></div>
}

function StatKpi({ label, value, sub, tone = 'brand' }) {
  const color = { brand: 'var(--brand-800)', ok: '#15803d', warn: '#a16207', bad: '#b91c1c' }[tone] || 'var(--brand-800)'
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

export default function Statistiques() {
  const { user, profile, initialized, agenceActive } = useAuth()
  const router = useRouter()
  const [dossiers, setDossiers] = useState([])
  const [objectifs, setObjectifs] = useState([])
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
      const [{ data: dos }, { data: obj }] = await Promise.all([
        supabase.from('dossiers').select(`
          id, reference, statut, typologie, created_at, archive, agence_id,
          frais_statut, frais_consultation, part_agente, frais_part_agente,
          honoraires_amo_taux, taux_courtage, contrat_signe,
          date_signature_contrat, date_signature_devis, date_demarrage_chantier,
          date_fin_chantier, date_limite_devis, date_cloture,
          referente:profiles!dossiers_referente_id_fkey(id, prenom, nom, role, frais_part_agente_defaut),
          client:clients(prenom, nom, apporteur_pourcentage, apporteur_base),
          devis_artisans(id, montant_ht, montant_ttc, commission_pourcentage, statut, date_reception, date_signature, artisan:artisans(id, entreprise, metier, partenaire)),
          suivi_financier(*)
        `).order('created_at', { ascending: false }),
        supabase.from('objectifs_ca').select('*'),
      ])
      if (annule) return
      setDossiers(dos || [])
      setObjectifs(obj || [])
      setLoading(false)
    }
    load()
    return () => { annule = true }
  }, [initialized, user?.id, profile?.id])

  // Périmètre admin : Consolidé (null) = toutes les agences ; sinon une agence.
  const dossiersScoped = useMemo(
    () => (agenceActive ? dossiers.filter(d => d.agence_id === agenceActive) : dossiers),
    [dossiers, agenceActive]
  )

  const caMois    = useMemo(() => computeCAMensuel(dossiersScoped, annee,     modeEff), [dossiersScoped, annee, modeEff])
  const caMoisN1  = useMemo(() => computeCAMensuel(dossiersScoped, annee - 1, modeEff), [dossiersScoped, annee, modeEff])
  const roy       = useMemo(() => computeRoyalties(dossiersScoped, annee),     [dossiersScoped, annee])
  const royN1     = useMemo(() => computeRoyalties(dossiersScoped, annee - 1), [dossiersScoped, annee])

  const caTotal   = round2(somme(caMois))
  const caTotalN1 = round2(somme(caMoisN1))
  const evolCA    = caTotalN1 > 0 ? Math.round((caTotal - caTotalN1) / caTotalN1 * 100) : null

  // Dossiers signés / terminés dans l'année (par date).
  const nbSignes  = dossiersScoped.filter(d => d.date_signature_contrat && new Date(d.date_signature_contrat).getFullYear() === annee).length
  const nbTermines = dossiersScoped.filter(d => d.date_fin_chantier && new Date(d.date_fin_chantier).getFullYear() === annee).length

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

  if (!initialized || loading) {
    return (
      <div className="page-enter page-pad">
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--ink-400)', fontSize: 13 }}>Chargement des statistiques…</div>
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
            ? <><strong style={{ color: 'var(--ink-700)' }}>Société (franchisé)</strong> · résultat net conservé, après déduction des parts agentes.</>
            : <><strong style={{ color: 'var(--ink-700)' }}>Agence</strong> · CA généré au niveau activité, parts agentes incluses.</>}
        </div>
      )}

      {/* ── SECTION 1 — Synthèse franchiseur ── */}
      <div className="kpi-grid">
        <StatKpi label={modeEff === 'societe' ? `Résultat société ${annee}` : `CA généré ${annee}`} value={fmtEur(caTotal)} tone="brand"
          sub={evolCA != null ? `${evolCA >= 0 ? '▲' : '▼'} ${Math.abs(evolCA)}% vs ${annee - 1} (${fmtEur(caTotalN1)})` : `vs ${annee - 1} : n/a`} />
        <StatKpi label={isAdmin ? 'Royalties dues au franchiseur' : 'Redevances générées'} value={fmtEur(roy.total)} tone="warn"
          sub={`Frais ${fmtEur(roy.parPoste.frais)} · Comm. ${fmtEur(roy.parPoste.commissions)} · Hono. ${fmtEur(roy.parPoste.honoraires)}`} />
        <StatKpi label="Dossiers" value={`${nbSignes} signés`} tone="ok"
          sub={`${nbTermines} chantiers terminés en ${annee}`} />
        <StatKpi label="Objectif CA agence" value={objectifAnnuel > 0 ? fmtEur(objectifAnnuel) : '—'} tone="brand"
          sub={pctObjectif != null ? `${pctObjectif}% atteint` : 'objectif non défini'} >
        </StatKpi>
      </div>
      {objectifAnnuel > 0 && (
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
          <h2 className="page" style={{ fontSize: 15, marginBottom: 4 }}>{modeEff === 'societe' ? 'Résultat société par mois' : 'CA généré par mois'}</h2>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Réel encaissé · {annee} vs {annee - 1}</div>
          <Legende items={[{ color: '#0094d4', label: `${annee}` }, { color: '#94a3b8', label: `${annee - 1}`, dashed: true }]} />
          <BarLineChart id="stats_ca" courant={caMois} precedent={caMoisN1} annee={annee} couleur="#0094d4" />
        </div>
        <div className="card" style={{ padding: 20 }}>
          <h2 className="page" style={{ fontSize: 15, marginBottom: 4 }}>Royalties franchiseur par mois</h2>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Redevance reversée · {annee} vs {annee - 1}</div>
          <Legende items={[{ color: '#d97706', label: `Royalties ${annee}` }, { color: '#94a3b8', label: `${annee - 1}`, dashed: true }]} />
          <BarLineChart id="stats_roy" courant={roy.parMois} precedent={royN1.parMois} annee={annee} couleur="#d97706" />
        </div>
      </div>

      <div className="card" style={{ padding: '14px 18px', fontSize: 12.5, color: 'var(--ink-500)' }}>
        Sections à venir : <strong>répartition du CA</strong> (typologie / agente), <strong>entonnoir de conversion</strong>, <strong>devis &amp; artisans</strong>, et <strong>performance par agente</strong>.
      </div>
    </div>
  )
}
