'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '../lib/auth-context'
import { calculateDossierFinance, calculateDevisFinance, getActiveDevis } from '../lib/finance'
import { KpiCard, Progress } from '../components/shared'
import ModaleChoixClient from '../components/ModaleChoixClient'

/* ── Icônes KPI ── */

const KpiIcon = ({ children, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
)
const BuildingIcon = () => <KpiIcon><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></KpiIcon>
const AlertIcon    = () => <KpiIcon><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></KpiIcon>
const EuroKpiIcon  = () => <KpiIcon><path d="M14 2H10a8 8 0 0 0 0 16h4"/><line x1="3" y1="9" x2="15" y2="9"/><line x1="3" y1="15" x2="15" y2="15"/></KpiIcon>
const TrendUpIcon  = () => <KpiIcon><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></KpiIcon>

function CABarChart({ data }) {
  const MOIS_COURT = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']
  const max = Math.max(...data.map(d => Math.max(d.reel, d.objectif)), 1) * 1.1
  const W = 600, H = 200, padX = 36, padY = 24
  const barW = (W - padX * 2) / data.length
  return (
    <div style={{ width: '100%', overflow: 'hidden' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 240 }}>
        {[0, 0.25, 0.5, 0.75, 1].map(p => (
          <line key={p} x1={padX} x2={W - padX} y1={padY + (H - padY * 2) * p} y2={padY + (H - padY * 2) * p}
            stroke="#e2e8f0" strokeWidth="1" strokeDasharray={p > 0 ? '2 4' : ''} />
        ))}
        {[1, 0.75, 0.5, 0.25, 0].map(p => (
          <text key={p} x={padX - 6} y={padY + (H - padY * 2) * (1 - p) + 4}
            textAnchor="end" fontSize="10" fill="#94a3b8">
            {Math.round(max * p / 1000)}k
          </text>
        ))}
        {data.map((d, i) => {
          const x    = padX + barW * i + barW * 0.18
          const w    = barW * 0.30
          const hReel = (H - padY * 2) * (d.reel / max)
          const hObj  = (H - padY * 2) * (d.objectif / max)
          return (
            <g key={i}>
              <rect x={x} y={H - padY - hObj} width={w} height={hObj} rx="3" fill="#e2e8f0" />
              <rect x={x + w + 4} y={H - padY - hReel} width={w} height={hReel} rx="3"
                fill={d.inProgress ? '#7ccdef' : '#0094d4'} style={{ transition: 'all 400ms ease' }} />
              {d.reel > 0 && (
                <text x={x + w + w / 2 + 4} y={H - padY - hReel - 5}
                  textAnchor="middle" fontSize="10" fontWeight="700" fill="#00578e">
                  {Math.round(d.reel / 1000)}k
                </text>
              )}
              <text x={x + w + 4} y={H - 6} textAnchor="middle" fontSize="11" fill="#64748b" fontWeight="500">
                {MOIS_COURT[d.mois - 1]}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function Pipeline({ dossiers }) {
  const buckets = [
    { key: 'a_traiter', label: 'À traiter',  tone: '#0094d4', match: s => ['a_contacter','a_relancer'].includes(s) },
    { key: 'en_devis',  label: 'En devis',   tone: '#f59e0b', match: s => ['devis_en_attente','devis_a_modifier'].includes(s) },
    { key: 'chantier',  label: 'En chantier',tone: '#16a34a', match: s => s === 'en_cours_chantier' },
    { key: 'termine',   label: 'Terminés',   tone: '#94a3b8', match: s => s === 'termine' },
  ]
  const counts = buckets.map(b => dossiers.filter(d => b.match(d.statut)).length)
  const total  = counts.reduce((a, b) => a + b, 0) || 1
  return (
    <div>
      <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', height: 14, marginBottom: 18, background: 'var(--ink-100)' }}>
        {buckets.map((b, i) => (
          <div key={b.key} style={{ width: `${counts[i] / total * 100}%`, background: b.tone, transition: 'width 400ms ease' }} />
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {buckets.map((b, i) => (
          <div key={b.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: b.tone, flex: '0 0 10px' }} />
            <span style={{ fontSize: 12.5, color: 'var(--ink-700)', flex: 1 }}>{b.label}</span>
            <span className="tnum" style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink-900)', letterSpacing: -0.02 }}>{counts[i]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Helpers finance (dashboard) ── */

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

function computeCAMensuel(dossiers, annee) {
  const monthly = {}
  const add = (dateStr, amount) => {
    if (!dateStr || !amount) return
    const d = new Date(dateStr)
    if (d.getFullYear() !== annee) return
    const m = d.getMonth() + 1
    monthly[m] = (monthly[m] || 0) + amount
  }
  for (const d of dossiers) {
    const nd    = normDossier(d)
    const fin   = calculateDossierFinance(nd)
    const suivi = d.suivi_financier || []
    const sfFrais    = suivi.find(s => s.type_echeance === 'frais_consultation'  && s.statut_illico === 'recu')
    const sfCourtage = suivi.find(s => s.type_echeance === 'honoraires_courtage' && s.statut_illico === 'recu')
    const sfAmo      = suivi.find(s => s.type_echeance === 'solde_amo'           && s.statut_illico === 'recu')
    if (sfFrais    && nd.frais_statut !== 'offerts') add(sfFrais.date_paiement    || nd.date_signature_contrat, fin.frais.net)
    if (sfCourtage) add(sfCourtage.date_paiement || nd.date_signature_contrat, fin.honoraires.courtage.net)
    if (sfAmo)      add(sfAmo.date_paiement, fin.honoraires.soldeAmo.net)
    for (const dv of getActiveDevis(d)) {
      const artId     = dv.artisan?.id
      const sfAcompte = suivi.find(s => s.type_echeance === 'acompte_artisan' && s.artisan_id === artId && s.statut_illico === 'recu')
      const sfFacture = suivi.find(s => s.type_echeance === 'facture_finale'  && s.artisan_id === artId && s.statut_illico === 'recu')
      const dvFin = calculateDevisFinance(dv, nd)
      if (sfAcompte)      add(sfAcompte.date_deblocage || sfAcompte.date_paiement, dvFin.netCom)
      else if (sfFacture) add(sfFacture.date_paiement, dvFin.netCom)
    }
  }
  return monthly
}

const fmtEur = (n) =>
  Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' €'

/* ── Page ── */

export default function Dashboard() {
  const [erreur,       setErreur]       = useState('')
  const [dossiers,     setDossiers]     = useState([])
  const [objectifs,    setObjectifs]    = useState([])
  const [rdvAujourdhui, setRdvAujourdhui] = useState([])
  const [loading,      setLoading]      = useState(true)
  const [modaleClient, setModaleClient] = useState(false)
  const router = useRouter()
  const { user, profile, initialized, fetchProfile } = useAuth()
  const retriedRef = useRef(false)

  useEffect(() => {
    if (!initialized) return
    if (!user) { router.replace('/login'); return }
    if (!profile) return
    if (profile.role === 'client') router.replace('/espace-client')
  }, [initialized, user?.id, profile?.id, profile?.role, router])

  // Filet de sécurité : si le profil n'est pas chargé après init, on retente une fois
  useEffect(() => {
    if (!initialized || !user || profile || retriedRef.current) return
    retriedRef.current = true
    fetchProfile(user.id)
  }, [initialized, user?.id, profile, fetchProfile])

  useEffect(() => {
    if (!initialized || !user || !profile) return
    const annee = new Date().getFullYear()
    async function loadData() {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
      const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1)
      const [{ data: dos }, { data: obj }, { data: rdv }] = await Promise.all([
        supabase.from('dossiers').select(`
          id, reference, statut, date_limite_devis, date_signature_contrat,
          frais_statut, frais_consultation, part_agente, frais_part_agente,
          honoraires_amo_taux, taux_courtage, typologie, created_at, archive,
          referente:profiles!dossiers_referente_id_fkey(id, prenom, nom, role, frais_part_agente_defaut),
          client:clients(prenom, nom, apporteur_pourcentage, apporteur_base),
          devis_artisans(id, montant_ht, montant_ttc, commission_pourcentage, statut, date_signature, artisan:artisans(id, entreprise)),
          suivi_financier(*)
        `).eq('referente_id', profile.id).order('created_at', { ascending: false }),
        supabase.from('objectifs_ca').select('*').eq('annee', annee).eq('agente_id', profile.id),
        supabase.from('rendez_vous').select(`
          id, titre, type_rdv, date_heure, duree_minutes, notes,
          dossier:dossiers(reference, archive, client:clients(prenom, nom))
        `).gte('date_heure', todayStart.toISOString()).lt('date_heure', tomorrowStart.toISOString()).order('date_heure', { ascending: true }),
      ])
      setDossiers(dos || [])
      setObjectifs(obj || [])
      // Masquage archive (3b) : les RDV du jour rattachés à un dossier archivé
      // sont retirés ; ceux sans dossier sont conservés (dossier?.archive !== true).
      setRdvAujourdhui((rdv || []).filter(r => r.dossier?.archive !== true))
      setLoading(false)
    }
    loadData()
  }, [initialized, user?.id, profile?.id])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const roleLabel = (role) => {
    if (role === 'admin') return 'Franchisée'
    if (role === 'agente') return 'Agente'
    return 'Client'
  }

  if (erreur) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 96 }}>
      <p style={{ color: 'var(--bad)' }}>{erreur}</p>
    </div>
  )

  if (!profile) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 96 }}>
      <p className="eyebrow">Chargement…</p>
    </div>
  )

  const today        = new Date()
  const annee        = today.getFullYear()
  const moisCourant  = today.getMonth() + 1
  const todayLabel   = today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const getWeekNumber = (d) => {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    const dayNum = date.getUTCDay() || 7
    date.setUTCDate(date.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7)
  }
  const semaine = getWeekNumber(today)
  const relTime = (dateStr) => {
    const diff = (Date.now() - new Date(dateStr)) / 1000
    if (diff < 3600) return `il y a ${Math.round(diff / 60)} min`
    if (diff < 86400) return `il y a ${Math.round(diff / 3600)}h`
    if (diff < 86400 * 7) return `il y a ${Math.round(diff / 86400)}j`
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  }

  // Masquage fin (3b) : `dossiers` (tous) sert au CALCUL du CA (computeCAMensuel,
  // plus bas) — archivés inclus, compta préservée. `dossiersActifs` (archivés
  // retirés) ne sert QU'aux listes opérationnelles affichées ci-dessous.
  const dossiersActifs = dossiers.filter(d => d.archive !== true)

  const enCours    = dossiersActifs.filter(d => d.statut === 'en_cours_chantier')
  const aRelancer  = dossiersActifs.filter(d => {
    if (!d.date_limite_devis) return false
    const diff = (new Date(d.date_limite_devis) - today) / 86400000
    return diff <= 7 && diff >= -2 && !['termine','annule'].includes(d.statut)
  }).sort((a, b) => new Date(a.date_limite_devis) - new Date(b.date_limite_devis))
  const enRetardCount = aRelancer.filter(d => (new Date(d.date_limite_devis) - today) / 86400000 < 0).length

  const caParMois      = computeCAMensuel(dossiers, annee)
  const caMoisReel     = caParMois[moisCourant] || 0
  const objMois        = objectifs.find(o => o.mois === moisCourant)
  const caMoisObjectif = objMois?.montant || 0
  const caMoisPct      = caMoisObjectif > 0 ? Math.round(caMoisReel / caMoisObjectif * 100) : 0
  const caAnneeReel    = Object.values(caParMois).reduce((s, v) => s + v, 0)
  const caAnneeObj     = objectifs.reduce((s, o) => s + (o.montant || 0), 0)
  const caAnneePct     = caAnneeObj > 0 ? Math.round(caAnneeReel / caAnneeObj * 100) : 0

  const chartData = Array.from({ length: 12 }, (_, i) => ({
    mois:       i + 1,
    reel:       caParMois[i + 1] || 0,
    objectif:   objectifs.find(o => o.mois === i + 1)?.montant || 0,
    inProgress: i + 1 === moisCourant,
  }))

  const STATUT_STYLE = {
    'a_contacter':       { bg: 'rgba(0,148,212,0.08)',   color: '#0094d4',  label: 'À contacter' },
    'a_relancer':        { bg: 'rgba(0,148,212,0.08)',   color: '#0094d4',  label: 'À relancer' },
    'devis_en_attente':  { bg: 'rgba(245,158,11,0.10)',  color: '#a16207',  label: 'En devis' },
    'devis_a_modifier':  { bg: 'rgba(245,158,11,0.10)',  color: '#a16207',  label: 'Devis à revoir' },
    'en_cours_chantier': { bg: 'rgba(22,163,74,0.08)',   color: '#15803d',  label: 'En chantier' },
    'termine':           { bg: 'rgba(148,163,184,0.12)', color: '#64748b',  label: 'Terminé' },
    'annule':            { bg: 'rgba(220,38,38,0.08)',   color: '#b91c1c',  label: 'Annulé' },
  }

  return (
    <div className="page-enter page-pad" style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1400, margin: '0 auto' }}>

      {/* ── Welcome ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6, textTransform: 'capitalize' }}>{todayLabel} · semaine {semaine}</div>
          <h1 className="page" style={{ fontSize: 28 }}>Bonjour {profile.prenom} 👋</h1>
          <p style={{ color: 'var(--ink-500)', fontSize: 14, marginTop: 6 }}>
            Tu as <strong style={{ color: 'var(--ink-700)' }}>{aRelancer.length} devis à relancer</strong> cette semaine
            {rdvAujourdhui.length > 0 && <> et <strong style={{ color: 'var(--ink-700)' }}>{rdvAujourdhui.length} rendez-vous</strong> programmés aujourd'hui</>}.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => router.push('/chantiers')}>Voir les chantiers</button>
          <button className="btn btn-primary" onClick={() => setModaleClient(true)}>+ Nouveau chantier</button>
        </div>
      </div>

      {/* ── KPI Row ── */}
      <div className="kpi-grid">
        <KpiCard label="Chantiers en cours" value={loading ? '—' : enCours.length}
          sub={`${dossiersActifs.filter(d => !['termine','annule'].includes(d.statut)).length} dossiers actifs`}
          icon={<BuildingIcon />} tone="brand" />
        <KpiCard label="Devis à relancer <7j" value={loading ? '—' : aRelancer.length}
          sub={enRetardCount > 0 ? `${enRetardCount} en retard` : 'aucun en retard'}
          icon={<AlertIcon />}
          tone={aRelancer.length > 0 ? 'warn' : 'brand'} />
        <KpiCard label="CA du mois (réel)" value={loading ? '—' : fmtEur(caMoisReel)} icon={<EuroKpiIcon />} tone="ok">
          {!loading && caMoisObjectif > 0 && (
            <div style={{ marginTop: 10 }}>
              <Progress value={caMoisPct} showLabel />
              <div style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 6 }}>
                Objectif : <span className="tnum" style={{ fontWeight: 600, color: 'var(--ink-700)' }}>{fmtEur(caMoisObjectif)}</span>
              </div>
            </div>
          )}
        </KpiCard>
        <KpiCard label={`CA cumulé ${annee}`} value={loading ? '—' : fmtEur(caAnneeReel)} icon={<TrendUpIcon />} tone="brand">
          {!loading && caAnneeObj > 0 && (
            <div style={{ marginTop: 10 }}>
              <Progress value={caAnneePct} showLabel />
              <div style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 6 }}>
                Objectif annuel : <span className="tnum" style={{ fontWeight: 600, color: 'var(--ink-700)' }}>{fmtEur(caAnneeObj)}</span>
              </div>
            </div>
          )}
        </KpiCard>
      </div>

      {/* ── Grille principale ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20 }}>

        {/* Colonne gauche */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>

          {/* À relancer */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h2 className="page" style={{ fontSize: 16 }}>À relancer cette semaine</h2>
                <div className="eyebrow" style={{ marginTop: 4 }}>{aRelancer.length} dossiers · triés par échéance</div>
              </div>
              <button className="btn btn-ghost" onClick={() => router.push('/chantiers')}>Tout voir →</button>
            </div>
            {loading ? (
              <div style={{ padding: '20px 0', textAlign: 'center' }}><span className="eyebrow">Chargement…</span></div>
            ) : aRelancer.length === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink-400)', fontSize: 13 }}>
                Aucun devis à relancer cette semaine
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--ink-200)' }}>
                {aRelancer.slice(0, 5).map(d => {
                  const diff      = Math.round((new Date(d.date_limite_devis) - today) / 86400000)
                  const enRetard  = diff < 0
                  const nomClient = d.client ? `${d.client.prenom || ''} ${d.client.nom || ''}`.trim() : '—'
                  return (
                    <button key={d.id} onClick={() => router.push(`/chantiers/${d.id}`)} className="row-hover"
                      style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: 14, alignItems: 'center', padding: '14px 4px', textAlign: 'left', cursor: 'pointer', background: 'none', border: 'none', borderBottom: '1px solid var(--ink-100)', width: '100%' }}>
                      <div className="tnum" style={{ width: 36, height: 36, borderRadius: 10, background: enRetard ? 'rgba(220,38,38,0.10)' : 'rgba(245,158,11,0.13)', color: enRetard ? '#b91c1c' : '#a16207', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800 }}>
                        {enRetard ? `J${diff}` : `+${diff}j`}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span className="mono" style={{ fontSize: 12, color: 'var(--brand-800)', fontWeight: 600 }}>{d.reference}</span>
                          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nomClient}</span>
                        </div>
                        {d.referente && <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>{d.referente.prenom} {d.referente.nom}</div>}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>Limite</div>
                        <div className="tnum" style={{ fontSize: 13, fontWeight: 600, color: enRetard ? '#b91c1c' : 'var(--ink-700)' }}>
                          {new Date(d.date_limite_devis).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                        </div>
                      </div>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--brand-100)', color: 'var(--brand-800)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, flex: '0 0 28px' }}>
                        {d.referente ? (d.referente.prenom?.[0] || '') + (d.referente.nom?.[0] || '') : '?'}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* CA Chart */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18 }}>
              <div>
                <h2 className="page" style={{ fontSize: 16 }}>Chiffre d'affaires {annee}</h2>
                <div className="eyebrow" style={{ marginTop: 4 }}>Réel vs objectif mensuel</div>
              </div>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-500)' }}>
                  <span style={{ width: 10, height: 10, background: 'var(--brand-500)', borderRadius: 3 }} /> Réel
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-500)' }}>
                  <span style={{ width: 10, height: 10, background: 'var(--ink-200)', borderRadius: 3 }} /> Objectif
                </span>
              </div>
            </div>
            {loading
              ? <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="eyebrow">Chargement…</span></div>
              : <CABarChart data={chartData} />}
          </div>
        </div>

        {/* Colonne droite */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>

          {/* Aujourd'hui — agenda */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h2 className="page" style={{ fontSize: 16 }}>Aujourd'hui</h2>
                <div className="eyebrow" style={{ marginTop: 4 }}>
                  {loading ? '…' : rdvAujourdhui.length === 0 ? 'Aucun rendez-vous' : `${rdvAujourdhui.length} rendez-vous`}
                </div>
              </div>
              <button className="btn btn-ghost" onClick={() => router.push('/planning')}>Planning →</button>
            </div>
            {loading ? (
              <div style={{ padding: '16px 0', textAlign: 'center' }}><span className="eyebrow">Chargement…</span></div>
            ) : rdvAujourdhui.length === 0 ? (
              <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--ink-400)', fontSize: 13 }}>
                Aucun rendez-vous programmé aujourd'hui
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0, position: 'relative' }}>
                {rdvAujourdhui.map((a, i) => {
                  const heure = new Date(a.date_heure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                  const tone = a.type_rdv === 'visite_technique_client' ? 'info' : a.type_rdv === 'visite_technique_artisan' ? 'ok' : a.type_rdv === 'presentation_devis' ? 'warn' : 'mute'
                  const dotColor = tone === 'info' ? '#0094d4' : tone === 'ok' ? '#16a34a' : tone === 'warn' ? '#f59e0b' : '#94a3b8'
                  const nomClient = a.dossier?.client ? `${a.dossier.client.prenom || ''} ${a.dossier.client.nom || ''}`.trim() : ''
                  const label = a.titre || (a.type_rdv === 'visite_technique_client' ? 'Visite client' : a.type_rdv === 'visite_technique_artisan' ? 'Visite artisan' : a.type_rdv === 'presentation_devis' ? 'Présentation devis' : 'Rendez-vous')
                  const sub = [a.dossier?.reference, nomClient].filter(Boolean).join(' · ')
                  return (
                    <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '60px 12px 1fr', gap: 14, alignItems: 'flex-start', paddingBottom: 14, position: 'relative' }}>
                      <div className="mono tnum" style={{ fontSize: 12, color: 'var(--ink-500)', fontWeight: 600, paddingTop: 2 }}>
                        {heure}
                        {a.duree_minutes && <div style={{ fontSize: 10, color: 'var(--ink-400)', fontWeight: 500, marginTop: 2 }}>{a.duree_minutes}min</div>}
                      </div>
                      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                        <span style={{ width: 10, height: 10, borderRadius: 99, background: dotColor, marginTop: 6, boxShadow: '0 0 0 3px #fff, 0 0 0 4px rgba(0,148,212,0.18)', flexShrink: 0 }} />
                        {i < rdvAujourdhui.length - 1 && <span style={{ position: 'absolute', top: 18, bottom: -4, width: 1, background: 'var(--ink-200)' }} />}
                      </div>
                      <div style={{ paddingBottom: 10 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink-900)' }}>{label}</div>
                        {sub && <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>{sub}</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Pipeline */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ marginBottom: 14 }}>
              <h2 className="page" style={{ fontSize: 16 }}>Pipeline</h2>
              <div className="eyebrow" style={{ marginTop: 4 }}>État des dossiers</div>
            </div>
            {loading
              ? <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="eyebrow">Chargement…</span></div>
              : <Pipeline dossiers={dossiersActifs} />}
          </div>

          {/* Activité récente */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 className="page" style={{ fontSize: 16 }}>Activité récente</h2>
              <button className="btn btn-ghost" style={{ padding: '4px 8px' }} onClick={() => router.push('/chantiers')}>Voir tout →</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {loading ? <span className="eyebrow">Chargement…</span> : dossiersActifs.slice(0, 5).map(d => {
                const nomClient = d.client ? `${d.client.prenom || ''} ${d.client.nom || ''}`.trim() : '—'
                const s = STATUT_STYLE[d.statut] || { bg: 'var(--surface-2)', color: 'var(--ink-500)', label: d.statut }
                const actionLabel = d.statut === 'en_cours_chantier' ? 'chantier en cours' : d.statut === 'termine' ? 'chantier terminé' : ['devis_en_attente','devis_a_modifier'].includes(d.statut) ? 'devis en attente' : d.statut === 'annule' ? 'dossier annulé' : 'à contacter'
                return (
                  <button key={d.id} onClick={() => router.push(`/chantiers/${d.id}`)}
                    style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, width: '100%' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--brand-50)', color: 'var(--brand-800)', display: 'grid', placeItems: 'center', flex: '0 0 32px', fontSize: 14 }}>
                      {d.statut === 'en_cours_chantier' ? '🔨' : d.statut === 'termine' ? '✅' : ['devis_en_attente','devis_a_modifier'].includes(d.statut) ? '📄' : '📁'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: 'var(--ink-700)', lineHeight: 1.4 }}>
                        <strong style={{ color: 'var(--ink-900)' }}>{nomClient}</strong> — {actionLabel}{' '}
                        <span className="mono" style={{ color: 'var(--brand-800)' }}>{d.reference}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 3 }}>{relTime(d.created_at)}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <ModaleChoixClient open={modaleClient} onClose={() => setModaleClient(false)} />

    </div>
  )
}
