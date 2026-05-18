'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '../lib/auth-context'
import { calculateDossierFinance, calculateDevisFinance } from '../lib/finance'

/* ── Composants visuels ── */

function DashKpiCard({ label, value, sub, tone, children }) {
  const colors = { brand: 'var(--brand-800)', ok: '#15803d', warn: '#a16207', bad: '#b91c1c' }
  return (
    <div className="card kpi">
      <div className="eyebrow" style={{ marginBottom: 8 }}>{label}</div>
      <div className="tnum" style={{ fontSize: 26, fontWeight: 800, color: colors[tone] || colors.brand, letterSpacing: '-0.02em', lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 6 }}>{sub}</div>}
      {children}
    </div>
  )
}

function ProgressBar({ value }) {
  return (
    <div className="progress" style={{ marginTop: 10 }}>
      <span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  )
}

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
    { key: 'a_traiter', label: 'À traiter',   tone: '#0094d4', match: s => ['a_contacter','a_relancer'].includes(s) },
    { key: 'en_devis',  label: 'En devis',     tone: '#f59e0b', match: s => ['devis_en_attente','devis_a_modifier'].includes(s) },
    { key: 'chantier',  label: 'En chantier',  tone: '#16a34a', match: s => s === 'en_cours_chantier' },
    { key: 'termine',   label: 'Terminés',     tone: '#94a3b8', match: s => s === 'termine' },
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

/* ── Icônes quick-nav (inchangées) ── */
function CardIcon({ children }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}
const Icons = {
  chantiers:    <CardIcon><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></CardIcon>,
  clients:      <CardIcon><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></CardIcon>,
  artisans:     <CardIcon><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></CardIcon>,
  planning:     <CardIcon><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></CardIcon>,
  finances:     <CardIcon><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></CardIcon>,
  statistiques: <CardIcon><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></CardIcon>,
}

const QUICK_LINKS = [
  { key: 'chantiers',    label: 'Chantiers',    href: '/chantiers',    desc: 'Gérer les dossiers' },
  { key: 'clients',      label: 'Clients',      href: '/clients',      desc: 'Fiches clients' },
  { key: 'artisans',     label: 'Artisans',     href: '/artisans',     desc: 'Partenaires & contacts' },
  { key: 'planning',     label: 'Planning',     href: '/planning',     desc: 'Rendez-vous' },
  { key: 'finances',     label: 'Finances',     href: '/finances',     desc: 'Suivi financier' },
  { key: 'statistiques', label: 'Statistiques', href: '/statistiques', desc: 'Tableaux de bord' },
]

/* ── Helpers finance (dashboard) ── */

const normDossier = (d) => ({
  ...d,
  part_agente:       d.part_agente ?? (d.referente?.role === 'admin' ? 0 : 0.5),
  frais_part_agente: d.frais_part_agente ?? null,
  taux_amo:          d?.taux_amo ?? d?.honoraires_amo_taux,
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
    for (const dv of (d.devis_artisans || []).filter(dv => dv?.statut !== 'refuse')) {
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
  const [erreur,    setErreur]    = useState('')
  const [dossiers,  setDossiers]  = useState([])
  const [objectifs, setObjectifs] = useState([])
  const [loading,   setLoading]   = useState(true)
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
    if (!user) return
    const annee = new Date().getFullYear()
    async function loadData() {
      const [{ data: dos }, { data: obj }] = await Promise.all([
        supabase.from('dossiers').select(`
          id, reference, statut, date_limite_devis, date_signature_contrat,
          frais_statut, frais_deduits, frais_consultation, part_agente, frais_part_agente,
          taux_amo, honoraires_amo_taux, taux_courtage, typologie, created_at,
          referente:profiles!dossiers_referente_id_fkey(id, prenom, nom, role, frais_part_agente_defaut),
          client:clients(prenom, nom, apporteur_pourcentage, apporteur_base),
          devis_artisans(id, montant_ht, montant_ttc, commission_pourcentage, statut, date_signature, artisan:artisans(id, entreprise, sans_royalties)),
          suivi_financier(*)
        `).order('created_at', { ascending: false }),
        supabase.from('objectifs_ca').select('*').eq('annee', annee),
      ])
      if (dos) setDossiers(dos)
      if (obj) setObjectifs(obj)
      setLoading(false)
    }
    loadData()
  }, [user?.id])

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

  const enCours    = dossiers.filter(d => d.statut === 'en_cours_chantier')
  const aRelancer  = dossiers.filter(d => {
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

  const chartData = Array.from({ length: moisCourant }, (_, i) => ({
    mois:       i + 1,
    reel:       caParMois[i + 1] || 0,
    objectif:   objectifs.find(o => o.mois === i + 1)?.montant || 0,
    inProgress: i + 1 === moisCourant,
  })).slice(-6)

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
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '28px 32px', maxWidth: 1400, margin: '0 auto' }}>

      {/* ── Welcome ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6, textTransform: 'capitalize' }}>{todayLabel}</div>
          <h1 className="page" style={{ fontSize: 28 }}>Bonjour {profile.prenom} 👋</h1>
          <p style={{ color: 'var(--ink-500)', fontSize: 14, marginTop: 6 }}>
            {aRelancer.length > 0
              ? <>{`Tu as `}<strong style={{ color: 'var(--ink-700)' }}>{aRelancer.length} devis à relancer</strong> cette semaine.</>
              : <>{roleLabel(profile.role)} · illiCO travaux Martigues</>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => router.push('/chantiers')}>Voir les chantiers</button>
          <button className="btn btn-primary" onClick={() => router.push('/chantiers/nouveau')}>+ Nouveau chantier</button>
        </div>
      </div>

      {/* ── KPI Row ── */}
      <div className="kpi-grid">
        <DashKpiCard label="Chantiers en cours" value={loading ? '—' : enCours.length}
          sub={`${dossiers.filter(d => !['termine','annule'].includes(d.statut)).length} dossiers actifs`} tone="brand" />
        <DashKpiCard label="Devis à relancer <7j" value={loading ? '—' : aRelancer.length}
          sub={enRetardCount > 0 ? `${enRetardCount} en retard` : 'aucun en retard'}
          tone={aRelancer.length > 0 ? 'warn' : 'brand'} />
        <DashKpiCard label="CA du mois (réel)" value={loading ? '—' : fmtEur(caMoisReel)} tone="ok">
          {!loading && caMoisObjectif > 0 && <>
            <ProgressBar value={caMoisPct} />
            <div style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 6 }}>
              Objectif : <span className="tnum" style={{ fontWeight: 600, color: 'var(--ink-700)' }}>{fmtEur(caMoisObjectif)}</span>
            </div>
          </>}
        </DashKpiCard>
        <DashKpiCard label={`CA cumulé ${annee}`} value={loading ? '—' : fmtEur(caAnneeReel)} tone="brand">
          {!loading && caAnneeObj > 0 && <>
            <ProgressBar value={caAnneePct} />
            <div style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 6 }}>
              Objectif annuel : <span className="tnum" style={{ fontWeight: 600, color: 'var(--ink-700)' }}>{fmtEur(caAnneeObj)}</span>
            </div>
          </>}
        </DashKpiCard>
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

          {/* Pipeline */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ marginBottom: 14 }}>
              <h2 className="page" style={{ fontSize: 16 }}>Pipeline</h2>
              <div className="eyebrow" style={{ marginTop: 4 }}>État des dossiers</div>
            </div>
            {loading
              ? <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="eyebrow">Chargement…</span></div>
              : <Pipeline dossiers={dossiers} />}
          </div>

          {/* Chantiers récents */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h2 className="page" style={{ fontSize: 16 }}>Chantiers récents</h2>
                <div className="eyebrow" style={{ marginTop: 4 }}>Derniers dossiers créés</div>
              </div>
              <button className="btn btn-ghost" onClick={() => router.push('/chantiers')}>Voir tout →</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {loading ? <span className="eyebrow">Chargement…</span> : dossiers.slice(0, 6).map(d => {
                const nomClient = d.client ? `${d.client.prenom || ''} ${d.client.nom || ''}`.trim() : '—'
                const s = STATUT_STYLE[d.statut] || { bg: 'var(--surface-2)', color: 'var(--ink-500)', label: d.statut }
                return (
                  <button key={d.id} onClick={() => router.push(`/chantiers/${d.id}`)} className="row-hover"
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid var(--ink-100)', cursor: 'pointer', width: '100%' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--brand-800)', fontWeight: 600, marginRight: 8 }}>{d.reference}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-900)' }}>{nomClient}</span>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>{s.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Raccourcis (pleine largeur) ── */}
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-900)', letterSpacing: '-0.01em', marginBottom: 16 }}>Raccourcis</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
          {QUICK_LINKS.map(item => (
            <button key={item.key} onClick={() => router.push(item.href)} className="card"
              style={{ padding: '20px 18px', textAlign: 'left', cursor: 'pointer', transition: 'border-color 150ms, box-shadow 150ms, transform 100ms', background: '#fff' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand-300)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,87,142,0.10)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--ink-200)'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(15,23,42,0.06)'; e.currentTarget.style.transform = 'none' }}>
              <div style={{ width: 36, height: 36, background: 'var(--brand-50)', borderRadius: 10, display: 'grid', placeItems: 'center', color: 'var(--brand-700)', marginBottom: 12 }}>
                {Icons[item.key]}
              </div>
              <div style={{ fontWeight: 600, color: 'var(--ink-800)', fontSize: 13.5 }}>{item.label}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 4 }}>{item.desc}</div>
            </button>
          ))}
        </div>
      </div>

    </div>
  )
}
