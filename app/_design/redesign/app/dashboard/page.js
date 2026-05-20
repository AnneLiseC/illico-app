'use client'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '../lib/auth-context'
import {
  calcStatut,
  getAlertesDevis,
  getCompteurs,
  STATUT_CONFIG,
} from '../lib/dossiers'
import { calculateDossierFinance } from '../lib/finance'
import { Icon, KpiCard, Progress, Badge, Avatar, avatarColor, StatutBadge, TypoBadge } from '../components/ui'

const TYPE_RDV_LABEL = {
  r1: 'Rendez-vous R1',
  r2: 'Rendez-vous R2',
  r3: 'Rendez-vous R3',
  visite_chantier: 'Visite chantier',
  reception: 'Réception',
  autre: 'Rendez-vous',
}
const TYPE_RDV_TONE = {
  r1: 'info', r2: 'info', r3: 'info',
  visite_chantier: 'ok', reception: 'ok',
  autre: 'mute',
}
const TONE_COLOR = {
  info: '#0094d4', ok: '#16a34a', warn: '#f59e0b', mute: '#94a3b8',
}

const fmtEur = (n) => {
  const v = Math.round(Number(n) || 0).toString()
  return v.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' €'
}
const ymKey = (date) => {
  if (!date) return null
  const dt = new Date(date)
  if (isNaN(dt)) return null
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
}

export default function Dashboard() {
  const router = useRouter()
  const { user, profile, initialized } = useAuth()
  const [dossiers, setDossiers] = useState([])
  const [agenda, setAgenda] = useState([])
  const [objectifAnnuel, setObjectifAnnuel] = useState(0)
  const [objectifMois, setObjectifMois] = useState(0)
  const [loading, setLoading] = useState(true)

  // ── Garde + redirection ──────────────────────────────────────────────────
  useEffect(() => {
    if (!initialized) return
    if (!user) { router.replace('/login'); return }
    if (profile?.role === 'client') router.replace('/espace-client')
  }, [initialized, user?.id, profile?.role, router])

  // ── Chargement ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!initialized || !user || !profile) return
    if (profile.role === 'client') return

    let dossiersQuery = supabase
      .from('dossiers')
      .select(`
        *,
        client:clients(civilite, prenom, nom, prenom2, nom2, adresse),
        referente:profiles!dossiers_referente_id_fkey(id, prenom, nom, role, frais_part_agente_defaut),
        devis_artisans(*, artisan:artisans(id, entreprise, sans_royalties)),
        comptes_rendus(id, type_visite),
        suivi_financier(*)
      `)
      .order('created_at', { ascending: false })

    if (profile.role === 'agente') dossiersQuery = dossiersQuery.eq('referente_id', profile.id)

    const annee = new Date().getFullYear()
    const mois = new Date().getMonth() + 1
    const debutJour = new Date(); debutJour.setHours(0, 0, 0, 0)
    const finJour = new Date(); finJour.setHours(23, 59, 59, 999)

    Promise.all([
      dossiersQuery,
      supabase.from('rendez_vous')
        .select('id, type_visite, debut, fin, dossier:dossiers(reference, typologie, client:clients(prenom, nom))')
        .gte('debut', debutJour.toISOString())
        .lte('debut', finJour.toISOString())
        .order('debut', { ascending: true }),
      supabase.from('objectifs_ca').select('*').eq('annee', annee).is('agente_id', null),
    ]).then(([{ data: dossiersData }, { data: rdvData }, { data: objData }]) => {
      setDossiers(dossiersData || [])
      setAgenda(rdvData || [])
      const objAnnee = (objData || []).find(o => o.cible === 'ca_annuel' || o.cible === 'ca_total')?.montant || 0
      const objMoisVal = (objData || []).find(o => o.cible === 'ca_mensuel' || o.cible === 'mois')?.montant || 0
      setObjectifAnnuel(objAnnee)
      setObjectifMois(objMoisVal || objAnnee / 12)
      setLoading(false)
    }).catch(err => {
      console.error('Dashboard load error:', err)
      setLoading(false)
    })
  }, [initialized, user?.id, profile?.id, profile?.role])

  // ── Dérivés ──────────────────────────────────────────────────────────────
  const compteurs = useMemo(() => getCompteurs(dossiers), [dossiers])
  const alertes = useMemo(() => getAlertesDevis(dossiers), [dossiers])

  // CA réalisé du mois + cumul année (à partir des règlements suivi_financier)
  const { caMois, caAnnee, caParMois } = useMemo(() => {
    const annee = new Date().getFullYear()
    const moisKey = ymKey(new Date())
    const parMois = {}
    let mois = 0, total = 0
    for (const d of dossiers) {
      try {
        const finance = calculateDossierFinance(d)
        const fraisRegle = (d.suivi_financier || []).find(s => s.type_echeance === 'frais_consultation' && s.statut_client === 'regle')
        const courtRegle = (d.suivi_financier || []).find(s => s.type_echeance === 'honoraires_courtage' && s.statut_client === 'regle')
        const amoRegle = (d.suivi_financier || []).find(s => s.type_echeance === 'solde_amo' && s.statut_client === 'regle')
        const buckets = []
        if (fraisRegle && finance.frais.net > 0) buckets.push({ k: ymKey(fraisRegle.date_paiement || d.date_signature_contrat), v: finance.frais.net })
        if (courtRegle && finance.honoraires.courtage.net > 0) buckets.push({ k: ymKey(courtRegle.date_paiement || d.date_signature_contrat), v: finance.honoraires.courtage.net })
        if (amoRegle && finance.honoraires.soldeAmo.net > 0) buckets.push({ k: ymKey(amoRegle.date_paiement || d.date_fin_chantier), v: finance.honoraires.soldeAmo.net })
        // commissions débloquées
        for (const dv of finance.commissions.devis) {
          const artId = dv.artisan_id || dv.artisanId
          const debloque = (d.suivi_financier || []).find(s =>
            s.type_echeance === 'acompte_artisan' && s.artisan_id === artId && s.statut_illico === 'recu'
          )
          if (debloque && dv.netCom > 0 && !dv.isApporteur) {
            buckets.push({ k: ymKey(debloque.date_deblocage || debloque.date_paiement), v: dv.netCom })
          }
        }
        for (const b of buckets) {
          if (!b.k) continue
          if (!b.k.startsWith(String(annee))) continue
          parMois[b.k] = (parMois[b.k] || 0) + b.v
          total += b.v
          if (b.k === moisKey) mois += b.v
        }
      } catch { /* tolérant aux dossiers mal formés */ }
    }
    return { caMois: mois, caAnnee: total, caParMois: parMois }
  }, [dossiers])

  // CA prévisionnel (commissions HT + honoraires) — pour le graphique
  const caObjectifParMois = useMemo(() => {
    const annee = new Date().getFullYear()
    const obj = {}
    if (objectifAnnuel > 0) {
      // si pas d'objectif mensuel, on lisse
      for (let m = 1; m <= 12; m++) obj[`${annee}-${String(m).padStart(2,'0')}`] = objectifAnnuel / 12
    }
    if (objectifMois > 0) {
      const moisKey = ymKey(new Date())
      if (moisKey) obj[moisKey] = objectifMois
    }
    return obj
  }, [objectifAnnuel, objectifMois])

  if (!initialized || loading || !profile) {
    return (
      <div className="page-content" style={{ display: 'grid', placeItems: 'center' }}>
        <p className="eyebrow">Chargement…</p>
      </div>
    )
  }

  const today = new Date()
  const dateStr = today.toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  const weekNum = (() => {
    const d = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()))
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
  })()

  const caMoisPct = objectifMois > 0 ? Math.round(caMois / objectifMois * 100) : 0
  const caAnneePct = objectifAnnuel > 0 ? Math.round(caAnnee / objectifAnnuel * 100) : 0
  const enRetard = alertes.filter(d => {
    const limite = new Date(d.date_limite_devis)
    return (limite - today) / 86400000 < 0
  }).length

  // Activités récentes : dérivées du suivi_financier (5 derniers événements)
  const recentes = (() => {
    const events = []
    for (const d of dossiers) {
      for (const s of (d.suivi_financier || [])) {
        if (s.date_paiement || s.date_deblocage) {
          const dt = new Date(s.date_paiement || s.date_deblocage)
          if (!isNaN(dt)) {
            events.push({
              when: dt,
              ref: d.reference,
              type: s.type_echeance,
              statut: s.statut_client || s.statut_illico,
              dossierId: d.id,
              client: d.client,
            })
          }
        }
      }
    }
    return events.sort((a, b) => b.when - a.when).slice(0, 5)
  })()

  const ACTIVITE_LABEL = {
    frais_consultation: { icon: 'Euro', what: 'a réglé les frais de consultation' },
    honoraires_courtage:{ icon: 'Coins', what: 'a réglé les honoraires courtage' },
    solde_amo:          { icon: 'Coins', what: 'a réglé le solde AMO' },
    acompte_artisan:    { icon: 'Wallet', what: 'a vu son acompte débloqué' },
    facture_finale:     { icon: 'Doc', what: 'a réglé la facture finale' },
  }

  const nomClient = (c) => c ? `${c.prenom || ''} ${c.nom || ''}`.trim() : '—'
  const greeting = (h => h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir')(today.getHours())

  return (
    <div className="page-content page-enter" style={{ gap: 24 }}>

      {/* Welcome */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6, textTransform: 'capitalize' }}>
            {dateStr} · semaine {weekNum}
          </div>
          <h1 className="page-h1" style={{ fontSize: 28 }}>{greeting} {profile.prenom} 👋</h1>
          <div style={{ color: 'var(--ink-500)', fontSize: 14, marginTop: 6 }}>
            {alertes.length > 0 ? (
              <>Tu as <strong style={{ color: 'var(--ink-700)' }}>{alertes.length} devis à relancer</strong> cette semaine{agenda.length > 0 && <> et <strong style={{ color: 'var(--ink-700)' }}>{agenda.length} rendez-vous</strong> programmés aujourd'hui</>}.</>
            ) : agenda.length > 0 ? (
              <>Tu as <strong style={{ color: 'var(--ink-700)' }}>{agenda.length} rendez-vous</strong> programmés aujourd'hui.</>
            ) : (
              <>Tout est sous contrôle aujourd'hui ✨</>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => router.push('/chantiers')}>
            <Icon name="Doc" size={16} /> Voir les chantiers
          </button>
          <button className="btn btn-primary" onClick={() => router.push('/chantiers/nouveau')}>
            <Icon name="Plus" size={16} /> Nouveau chantier
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="kpi-grid">
        <KpiCard
          label="Chantiers en cours"
          value={compteurs.enChantier}
          sub={`${compteurs.enDevis} en devis · ${compteurs.aTraiter} à traiter`}
          icon={<Icon name="Building" size={20} />}
          tone="brand"
        />
        <KpiCard
          label="Devis à relancer <7j"
          value={alertes.length}
          sub={enRetard > 0 ? `${enRetard} en retard` : 'tout est dans les temps'}
          icon={<Icon name="Alert" size={20} />}
          tone="warn"
        />
        <KpiCard label="CA du mois (réel)" value={fmtEur(caMois)} icon={<Icon name="Euro" size={20} />} tone="ok">
          {objectifMois > 0 && (
            <div style={{ marginTop: 10 }}>
              <Progress value={caMoisPct} showLabel />
              <div style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 6 }}>
                Objectif : <span className="tnum" style={{ fontWeight: 600, color: 'var(--ink-700)' }}>{fmtEur(objectifMois)}</span>
              </div>
            </div>
          )}
        </KpiCard>
        <KpiCard label={`CA cumulé ${new Date().getFullYear()}`} value={fmtEur(caAnnee)} icon={<Icon name="TrendUp" size={20} />} tone="brand">
          {objectifAnnuel > 0 && (
            <div style={{ marginTop: 10 }}>
              <Progress value={caAnneePct} showLabel />
              <div style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 6 }}>
                Objectif annuel : <span className="tnum" style={{ fontWeight: 600, color: 'var(--ink-700)' }}>{fmtEur(objectifAnnuel)}</span>
              </div>
            </div>
          )}
        </KpiCard>
      </div>

      {/* Main grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20 }}>
        {/* LEFT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          <RelancesCard alertes={alertes} onOpen={(id) => router.push(`/chantiers/${id}`)} onNavList={() => router.push('/chantiers')} />
          <CAChart caParMois={caParMois} objParMois={caObjectifParMois} annee={new Date().getFullYear()} />
        </div>

        {/* RIGHT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          <AgendaCard agenda={agenda} onNav={() => router.push('/planning')} />
          <PipelineCard compteurs={compteurs} />
          <ActiviteCard items={recentes} labels={ACTIVITE_LABEL} nomClient={nomClient} onOpen={(id) => router.push(`/chantiers/${id}`)} />
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// RELANCES
// ─────────────────────────────────────────────────────────────────────────────

function RelancesCard({ alertes, onOpen, onNavList }) {
  const today = new Date()
  const fmtDate = (d) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
  const nomClient = (c) => c ? `${c.civilite || ''} ${c.prenom} ${c.nom}${c.prenom2 ? ` & ${c.prenom2}` : ''}`.trim() : '—'

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <h2 className="page-h2" style={{ fontSize: 16 }}>À relancer cette semaine</h2>
          <div className="eyebrow" style={{ marginTop: 4 }}>{alertes.length} dossiers · trier par échéance</div>
        </div>
        <button className="btn btn-ghost" onClick={onNavList}>Tout voir <Icon name="Arrow" size={14} /></button>
      </div>
      {alertes.length === 0 ? (
        <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--ink-400)', fontSize: 13 }}>
          Aucun devis à relancer cette semaine ✓
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--ink-200)' }}>
          {alertes.slice(0, 5).map(d => {
            const diff = Math.round((new Date(d.date_limite_devis) - today) / 86400000)
            const enRetard = diff < 0
            return (
              <button key={d.id} onClick={() => onOpen(d.id)} style={{
                display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: 14,
                alignItems: 'center', padding: '14px 4px', textAlign: 'left',
                borderBottom: '1px solid var(--ink-100)', background: 'none', border: 0, cursor: 'pointer',
              }} className="row-hover">
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: enRetard ? 'rgba(220,38,38,0.10)' : 'rgba(245,158,11,0.13)',
                  color: enRetard ? '#b91c1c' : '#a16207',
                  display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800,
                }} className="tnum">{enRetard ? `J${diff}` : `+${diff}j`}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className="mono" style={{ fontSize: 12, color: 'var(--brand-800)', fontWeight: 600 }}>{d.reference}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-900)' }}>{nomClient(d.client)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 3, alignItems: 'center' }}>
                    <TypoBadge typo={d.typologie} />
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>Limite</div>
                  <div className="tnum" style={{ fontSize: 13, fontWeight: 600, color: enRetard ? '#b91c1c' : 'var(--ink-700)' }}>
                    {fmtDate(d.date_limite_devis)}
                  </div>
                </div>
                {d.referente && <Avatar name={`${d.referente.prenom} ${d.referente.nom}`} color={avatarColor(d.referente.id)} size={28} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CA CHART
// ─────────────────────────────────────────────────────────────────────────────

function CAChart({ caParMois, objParMois, annee }) {
  const MOIS = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sept','Oct','Nov','Déc']
  const moisCourant = new Date().getMonth()
  const data = MOIS.map((m, i) => {
    const key = `${annee}-${String(i + 1).padStart(2, '0')}`
    return {
      m,
      reel: caParMois[key] || 0,
      objectif: objParMois[key] || 0,
      inProgress: i === moisCourant,
    }
  })
  const max = Math.max(1000, ...data.map(d => Math.max(d.reel, d.objectif))) * 1.1
  const W = 600, H = 200, padX = 30, padY = 24, barW = (W - padX * 2) / data.length

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18 }}>
        <div>
          <h2 className="page-h2" style={{ fontSize: 16 }}>Chiffre d'affaires {annee}</h2>
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
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 240 }}>
        {[0, 0.25, 0.5, 0.75, 1].map(p => (
          <line key={p} x1={padX} x2={W - padX} y1={padY + (H - padY * 2) * p} y2={padY + (H - padY * 2) * p} stroke="#e2e8f0" strokeWidth="1" strokeDasharray={p > 0 ? '2 4' : ''} />
        ))}
        {[1, 0.75, 0.5, 0.25, 0].map(p => (
          <text key={p} x={padX - 6} y={padY + (H - padY * 2) * (1 - p) + 4} textAnchor="end" fontSize="10" fill="#94a3b8">
            {Math.round(max * p / 1000)}k
          </text>
        ))}
        {data.map((d, i) => {
          const x = padX + barW * i + barW * 0.18
          const w = barW * 0.30
          const hReel = (H - padY * 2) * (d.reel / max)
          const hObj = (H - padY * 2) * (d.objectif / max)
          return (
            <g key={i}>
              {d.objectif > 0 && <rect x={x} y={H - padY - hObj} width={w} height={hObj} rx="3" fill="#e2e8f0" />}
              {d.reel > 0 && <rect x={x + w + 4} y={H - padY - hReel} width={w} height={hReel} rx="3" fill={d.inProgress ? '#7ccdef' : '#0094d4'} />}
              {d.reel > 0 && (
                <text x={x + w + w / 2 + 4} y={H - padY - hReel - 6} textAnchor="middle" fontSize="10" fontWeight="700" fill="#00578e">
                  {Math.round(d.reel / 1000)}k
                </text>
              )}
              <text x={x + w + 4} y={H - 6} textAnchor="middle" fontSize="11" fill={i === moisCourant ? '#0f2744' : '#64748b'} fontWeight={i === moisCourant ? 700 : 500}>{d.m}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENDA
// ─────────────────────────────────────────────────────────────────────────────

function AgendaCard({ agenda, onNav }) {
  const formatTime = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const formatDur = (debut, fin) => {
    if (!fin) return null
    const min = Math.round((new Date(fin) - new Date(debut)) / 60000)
    return min ? `${min}min` : null
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <h2 className="page-h2" style={{ fontSize: 16 }}>Aujourd'hui</h2>
          <div className="eyebrow" style={{ marginTop: 4 }}>{agenda.length} rendez-vous</div>
        </div>
        <button className="btn btn-ghost" onClick={onNav}><Icon name="Calendar" size={14} /> Planning</button>
      </div>
      {agenda.length === 0 ? (
        <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink-400)', fontSize: 13 }}>
          Pas de rendez-vous aujourd'hui
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, position: 'relative' }}>
          {agenda.map((rdv, i) => {
            const tone = TYPE_RDV_TONE[rdv.type_visite] || 'mute'
            const color = TONE_COLOR[tone]
            const label = TYPE_RDV_LABEL[rdv.type_visite] || 'Rendez-vous'
            const client = rdv.dossier?.client
            const clientName = client ? `${client.prenom || ''} ${client.nom || ''}`.trim() : ''
            return (
              <div key={rdv.id} style={{ display: 'grid', gridTemplateColumns: '60px 12px 1fr', gap: 14, alignItems: 'flex-start', paddingBottom: 14, position: 'relative' }}>
                <div className="mono tnum" style={{ fontSize: 12, color: 'var(--ink-500)', fontWeight: 600, paddingTop: 2 }}>
                  {formatTime(rdv.debut)}
                  {formatDur(rdv.debut, rdv.fin) && (
                    <div style={{ fontSize: 10, color: 'var(--ink-400)', fontWeight: 500, marginTop: 2 }}>{formatDur(rdv.debut, rdv.fin)}</div>
                  )}
                </div>
                <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                  <span style={{
                    width: 10, height: 10, borderRadius: 99, background: color,
                    marginTop: 6, boxShadow: '0 0 0 3px #fff, 0 0 0 4px rgba(0,148,212,0.18)',
                  }} />
                  {i < agenda.length - 1 && <span style={{ position: 'absolute', top: 18, bottom: -4, width: 1, background: 'var(--ink-200)' }} />}
                </div>
                <div style={{ paddingBottom: 10 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink-900)' }}>
                    {label}{clientName && ` — ${clientName}`}
                  </div>
                  {rdv.dossier && (
                    <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>
                      <span className="mono">{rdv.dossier.reference}</span>
                      {rdv.dossier.typologie && <> · {rdv.dossier.typologie}</>}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PIPELINE
// ─────────────────────────────────────────────────────────────────────────────

function PipelineCard({ compteurs }) {
  const buckets = [
    { key: 'aTraiter',   label: 'À traiter',     tone: '#0094d4' },
    { key: 'enDevis',    label: 'En devis',      tone: '#f59e0b' },
    { key: 'enChantier', label: 'En chantier',   tone: '#16a34a' },
    { key: 'termines',   label: 'Terminés',      tone: '#94a3b8' },
  ]
  const total = buckets.reduce((s, b) => s + (compteurs[b.key] || 0), 0) || 1

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ marginBottom: 14 }}>
        <h2 className="page-h2" style={{ fontSize: 16 }}>Pipeline</h2>
        <div className="eyebrow" style={{ marginTop: 4 }}>État des chantiers</div>
      </div>
      <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', height: 14, marginBottom: 18, background: 'var(--ink-100)' }}>
        {buckets.map(b => {
          const v = compteurs[b.key] || 0
          return <div key={b.key} style={{ width: `${v / total * 100}%`, background: b.tone, transition: 'width 400ms ease' }} />
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {buckets.map(b => (
          <div key={b.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: b.tone, flex: '0 0 10px' }} />
            <span style={{ fontSize: 12.5, color: 'var(--ink-700)', flex: 1 }}>{b.label}</span>
            <span className="tnum" style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink-900)', letterSpacing: -0.02 }}>{compteurs[b.key] || 0}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVITÉ RÉCENTE
// ─────────────────────────────────────────────────────────────────────────────

function ActiviteCard({ items, labels, nomClient, onOpen }) {
  const relative = (date) => {
    const diff = (new Date() - date) / 1000
    if (diff < 60) return 'il y a quelques secondes'
    if (diff < 3600) return `il y a ${Math.round(diff / 60)} min`
    if (diff < 86400) return `il y a ${Math.round(diff / 3600)} h`
    if (diff < 86400 * 7) return `il y a ${Math.round(diff / 86400)} j`
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 className="page-h2" style={{ fontSize: 16 }}>Activité récente</h2>
        <button className="btn btn-ghost" style={{ padding: '4px 8px' }}><Icon name="More" size={14} /></button>
      </div>
      {items.length === 0 ? (
        <div style={{ padding: '14px 0', textAlign: 'center', color: 'var(--ink-400)', fontSize: 13 }}>
          Aucune activité récente
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {items.map((n, i) => {
            const cfg = labels[n.type] || { icon: 'Doc', what: 'a été mis à jour' }
            return (
              <button key={i} onClick={() => onOpen(n.dossierId)} style={{
                display: 'flex', gap: 12, alignItems: 'flex-start', background: 'none',
                border: 0, padding: 0, textAlign: 'left', cursor: 'pointer', width: '100%',
              }} className="row-hover">
                <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--brand-50)', color: 'var(--brand-800)', display: 'grid', placeItems: 'center', flex: '0 0 32px' }}>
                  <Icon name={cfg.icon} size={16} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--ink-700)', lineHeight: 1.4 }}>
                    <strong style={{ color: 'var(--ink-900)' }}>{nomClient(n.client)}</strong> {cfg.what}{' '}
                    <span className="mono" style={{ color: 'var(--brand-800)' }}>{n.ref}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 3 }}>{relative(n.when)}</div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
