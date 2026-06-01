'use client'
import { useState, useEffect, use, Suspense } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '../../lib/auth-context'

function Svg({ size = 16, children }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
}
const ChevronLeft = ({ size=16 }) => <Svg size={size}><polyline points="15 18 9 12 15 6"/></Svg>
const PinIcon     = ({ size=16 }) => <Svg size={size}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></Svg>
const PhoneIcon   = ({ size=16 }) => <Svg size={size}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.38 2 2 0 0 1 3.58 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.54a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></Svg>
const MailIcon    = ({ size=16 }) => <Svg size={size}><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="2,4 12,13 22,4"/></Svg>
const EditIcon    = ({ size=16 }) => <Svg size={size}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></Svg>
const PlusIcon    = ({ size=16 }) => <Svg size={size}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></Svg>
const CalIcon     = ({ size=16 }) => <Svg size={size}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></Svg>

const fmtEur  = (n) => Math.round(n || 0).toLocaleString('fr-FR') + ' €'
const fmtDate = (d) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}
const diffJours = (d) => {
  if (!d) return null
  return Math.round((Date.now() - new Date(d)) / 86400000)
}

const STATUTS = {
  a_contacter:       { label: 'À contacter',    bg: 'rgba(234,179,8,0.1)',  color: '#a16207' },
  a_relancer:        { label: 'À relancer',      bg: 'rgba(249,115,22,0.1)', color: '#c2410c' },
  devis_en_attente:  { label: 'Devis en attente', bg: 'rgba(234,179,8,0.1)', color: '#a16207' },
  devis_a_modifier:  { label: 'Devis à modifier', bg: 'rgba(249,115,22,0.1)', color: '#c2410c' },
  en_cours_chantier: { label: 'En cours',        bg: 'rgba(22,163,74,0.1)', color: '#15803d' },
  termine:           { label: 'Terminé',          bg: 'var(--ink-100)',      color: 'var(--ink-500)' },
  annule:            { label: 'Annulé',           bg: 'rgba(239,68,68,0.1)', color: '#dc2626' },
}

const TYPOLOGIES = {
  courtage:          { label: 'Courtage',           bg: 'rgba(0,148,212,0.1)',   color: 'var(--brand-800)' },
  amo:               { label: 'AMO',                bg: 'rgba(124,58,237,0.1)', color: '#7c3aed' },
  estimo:            { label: 'Estimo',             bg: 'rgba(234,179,8,0.1)',  color: '#a16207' },
  merad:             { label: 'MERAD',              bg: 'rgba(249,115,22,0.1)', color: '#c2410c' },
  audit_energetique: { label: 'Audit énergétique',  bg: 'rgba(22,163,74,0.1)', color: '#15803d' },
  studio_jardin:     { label: 'Studio de jardin',   bg: 'rgba(236,72,153,0.1)', color: '#be185d' },
}

function StatutBadge({ statut }) {
  const s = STATUTS[statut] || { label: statut, bg: 'var(--ink-100)', color: 'var(--ink-500)' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 10px',
      borderRadius: 99, fontSize: 11.5, fontWeight: 700,
      background: s.bg, color: s.color, whiteSpace: 'nowrap',
    }}>{s.label}</span>
  )
}

function TypoBadge({ typo }) {
  const t = TYPOLOGIES[typo] || { label: typo, bg: 'var(--ink-100)', color: 'var(--ink-500)' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 8px',
      borderRadius: 99, fontSize: 11, fontWeight: 700,
      background: t.bg, color: t.color,
    }}>{t.label}</span>
  )
}

function MiniKpi({ label, value, sub, tone = 'brand' }) {
  const color = tone === 'ok' ? '#15803d' : tone === 'info' ? '#0369a1' : 'var(--brand-800)'
  return (
    <div className="card" style={{ padding: '16px 20px' }}>
      <div className="eyebrow" style={{ marginBottom: 6 }}>{label}</div>
      <div className="tnum" style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--ink-700)', marginBottom: 6 }
const inputProps = { className: 'input', style: { width: '100%', height: 40 } }

export default function FicheClient({ params }) {
  return (
    <Suspense fallback={<div className="page-loading" />}>
      <FicheClientInner params={params} />
    </Suspense>
  )
}

function FicheClientInner({ params }) {
  const { id } = use(params)
  const [client, setClient] = useState(null)
  const [profiles, setProfiles] = useState([])
  const [dossiers, setDossiers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [erreur, setErreur] = useState('')
  const [succes, setSucces] = useState('')
  const [mode, setMode] = useState('vue')
  const router = useRouter()
  const searchParams = useSearchParams()
  const editParam = searchParams.get('edit')
  const { user, profile: authProfile, initialized } = useAuth()

  useEffect(() => {
    if (!initialized) return
    if (!user) { router.push('/login'); return }

    const init = async () => {
      const [{ data: allProfiles }, { data: clientData }, { data: dossiersData }] = await Promise.all([
        supabase.from('profiles').select('id, prenom, nom, role').in('role', ['admin', 'agente']),
        supabase.from('clients')
          .select('*, referente:profiles!clients_referente_fkey(id, prenom, nom, role)')
          .eq('id', id).single(),
        supabase.from('dossiers')
          .select('*, rendez_vous(id, type_rdv, titre, date_heure), devis_artisans(id, statut, montant_ttc), suivi_financier(type_echeance, date_reglement, statut_client, montant_ttc)')
          .eq('client_id', id)
          .order('created_at', { ascending: false }),
      ])

      setProfiles(allProfiles || [])

      if (!clientData) { setLoading(false); return }
      const sameAddress = !clientData.adresse_chantier || clientData.adresse_chantier === clientData.adresse
      setClient({ ...clientData, adresse_chantier_identique: sameAddress })
      setDossiers(dossiersData || [])
      setLoading(false)
    }
    init()
  }, [initialized, user?.id, id, router])

  // L20 — ouverture directe en mode édition depuis le menu de la liste (?edit=list).
  // useEffect dédié : le param n'est jamais réécrit ici → pas de reboucle avec l'init.
  useEffect(() => {
    if (editParam === 'list') setMode('edition')
  }, [editParam])

  const set = (champ, valeur) => setClient(c => ({ ...c, [champ]: valeur }))

  const handleSave = async () => {
    setSaving(true)
    setErreur('')
    setSucces('')

    const adresseChantier = client.adresse_chantier_identique
      ? client.adresse || null
      : client.adresse_chantier || null

    const { error } = await supabase.from('clients').update({
      civilite:             client.civilite,
      nom:                  client.nom,
      prenom:               client.prenom,
      nom2:                 client.nom2 || null,
      prenom2:              client.prenom2 || null,
      email:                client.email || null,
      email2:               client.email2 || null,
      telephone:            client.telephone || null,
      telephone2:           client.telephone2 || null,
      adresse:              client.adresse || null,
      adresse_chantier:     adresseChantier,
      type_client:          client.type_client,
      referente:            client.referente?.id || client.referente || null,
      apporteur_affaires:   client.apporteur_affaires,
      apporteur_nom:        client.apporteur_affaires ? client.apporteur_nom : null,
      apporteur_pourcentage: client.apporteur_affaires ? parseFloat(client.apporteur_pourcentage) : null,
      apporteur_base:       client.apporteur_affaires ? client.apporteur_base : null,
      notes:                client.notes || null,
    }).eq('id', id)

    if (error) {
      setErreur('Erreur : ' + error.message)
    } else if (editParam === 'list') {
      // Édition ouverte depuis la liste → retour à la liste après enregistrement.
      router.push('/clients')
      return
    } else {
      setSucces('Modifications enregistrées ✓')
      setMode('vue')
    }
    setSaving(false)
  }

  const estCouple = ['M. et Mme', 'Mme et Mme', 'M. et M.'].includes(client?.civilite)

  if (loading) return <div className="page-loading" />

  if (!client) return (
    <div style={{ paddingTop: 96, textAlign: 'center', color: 'var(--ink-400)' }}>Client introuvable</div>
  )

  const isPro = client.type_client === 'professionnel'
  const initials = `${(client.prenom || '').charAt(0)}${(client.nom || '').charAt(0)}`.toUpperCase()

  const nomDisplay = estCouple
    ? `${client.civilite} ${client.prenom} ${(client.nom || '').toUpperCase()} & ${client.prenom2 || ''} ${(client.nom2 || '').toUpperCase()}`.trim()
    : `${client.civilite} ${client.prenom} ${(client.nom || '').toUpperCase()}`

  const montantTotal = dossiers.reduce((s, d) =>
    s + (d.devis_artisans || []).filter(dv => dv.statut === 'accepte')
      .reduce((s2, dv) => s2 + (dv.montant_ttc || 0), 0), 0)

  const allRdvs = dossiers.flatMap(d => (d.rendez_vous || []))
    .sort((a, b) => new Date(a.date_heure) - new Date(b.date_heure))

  const dernierRdv = allRdvs[allRdvs.length - 1] || null

  const signesCount = dossiers.filter(d => d.contrat_signe === true).length
  const clientActif = dossiers.some(d => d.statut === 'en_cours_chantier')

  const ECHEANCE_LABELS = {
    acompte_amo:         'Acompte AMO reçu',
    acompte_artisan:     'Acompte artisan réglé',
    apporteur_agente:    'Commission apporteur réglée',
    facture_finale:      'Facture finale réglée',
    frais_consultation:  'Frais de consultation réglés',
    honoraires_courtage: 'Honoraires courtage reçus',
    solde_amo:           'Solde AMO reçu',
  }

  const RDV_LABELS = {
    visite_technique_client:  'R1',
    visite_technique_artisan: 'R2',
    presentation_devis:       'R3',
  }
  const labelRdv = (rdv) => RDV_LABELS[rdv?.type_rdv] || rdv?.titre || rdv?.type_rdv || 'Rendez-vous'

  const historiqueRaw = [
    ...allRdvs.map(rdv => ({
      text: labelRdv(rdv),
      date: rdv.date_heure,
    })),
    ...dossiers.flatMap(d => (d.suivi_financier || [])
      .filter(sf => sf.statut_client === 'regle' && sf.date_reglement)
      .map(sf => ({
        text: ECHEANCE_LABELS[sf.type_echeance] || sf.type_echeance,
        date: sf.date_reglement,
        montant: sf.montant_ttc,
      }))
    ),
  ].sort((a, b) => new Date(b.date) - new Date(a.date))

  const historiqueItems = historiqueRaw.slice(0, 4)

  const dernierRdvSub = dernierRdv
    ? `${labelRdv(dernierRdv)} · avec ${client.referente?.prenom || '—'}`
    : null

  // ── VUE ──────────────────────────────────────────────────────────────
  if (mode === 'vue') {
    return (
      <div className="page-enter page-pad" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--ink-500)' }}>
          <button onClick={() => router.push('/clients')} className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }}>
            <ChevronLeft size={14}/> Tous les clients
          </button>
          <span style={{ color: 'var(--ink-300)' }}>/</span>
          <span style={{ color: 'var(--ink-700)', fontWeight: 600 }}>{nomDisplay}</span>
        </div>

        {/* Hero card */}
        <div className="card" style={{ padding: 28 }}>
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{
              width: 72, height: 72, borderRadius: 14, flexShrink: 0,
              background: isPro ? '#7c3aed' : 'var(--brand-700)', color: '#fff',
              display: 'grid', placeItems: 'center', fontSize: 24, fontWeight: 800,
            }}>{initials}</div>

            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', padding: '2px 10px',
                  borderRadius: 99, fontSize: 11.5, fontWeight: 700,
                  background: isPro ? 'rgba(124,58,237,0.1)' : 'rgba(0,148,212,0.1)',
                  color: isPro ? '#7c3aed' : 'var(--brand-800)',
                }}>{isPro ? 'Pro' : 'Particulier'}</span>
                {clientActif && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', padding: '2px 10px',
                    borderRadius: 99, fontSize: 11.5, fontWeight: 700,
                    background: 'rgba(22,163,74,0.1)', color: '#15803d',
                  }}>Client actif</span>
                )}
                {client.apporteur_affaires && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', padding: '2px 10px',
                    borderRadius: 99, fontSize: 11.5, fontWeight: 700,
                    background: 'rgba(234,179,8,0.1)', color: '#a16207',
                  }}>★ Apporteur {client.apporteur_pourcentage}%</span>
                )}
              </div>
              <h1 className="page" style={{ fontSize: 26, letterSpacing: -0.02 }}>{nomDisplay}</h1>
              {client.adresse && (
                <div style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <PinIcon size={14}/>{client.adresse}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
              <button className="btn btn-ghost" onClick={() => setMode('edition')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <EditIcon size={14}/> Modifier
              </button>
              {client.telephone && (
                <a href={`tel:${client.telephone}`} className="btn btn-ghost" style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <PhoneIcon size={14}/>
                </a>
              )}
              {client.email && (
                <a href={`mailto:${client.email}`} className="btn btn-ghost" style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <MailIcon size={14}/>
                </a>
              )}
              <button className="btn btn-primary" onClick={() => router.push(`/chantiers/nouveau?client=${id}`)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <PlusIcon size={14}/> Nouveau dossier
              </button>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="kpi-grid">
          <MiniKpi label="Dossiers" value={dossiers.length} sub={`${signesCount} signés`} tone="brand"/>
          <MiniKpi label="Montant total" value={fmtEur(montantTotal)} sub="TTC tous chantiers" tone="ok"/>
          <MiniKpi
            label="Premier contact"
            value={fmtDate(client.created_at)}
            sub={`il y a ${diffJours(client.created_at)} jours`}
            tone="brand"
          />
          <MiniKpi
            label="Dernier RDV"
            value={dernierRdv ? fmtDate(dernierRdv.date_heure) : '—'}
            sub={dernierRdvSub || 'Aucun rendez-vous'}
            tone="info"
          />
        </div>

        {/* Two-column: dossiers + contact/historique */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 18, alignItems: 'start' }}>

          {/* Dossiers */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--ink-200)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 className="page" style={{ fontSize: 15 }}>Dossiers du client</h2>
              <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => router.push(`/chantiers/nouveau?client=${id}`)}>
                + Nouveau
              </button>
            </div>
            {dossiers.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-400)', fontSize: 13 }}>
                Aucun dossier pour ce client
              </div>
            ) : (
              dossiers.map(d => {
                const montantDossier = (d.devis_artisans || [])
                  .filter(dv => dv.statut === 'accepte')
                  .reduce((s, dv) => s + (dv.montant_ttc || 0), 0)
                return (
                  <div key={d.id} onClick={() => router.push(`/chantiers/${d.id}`)} className="row-hover"
                    style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 14, padding: '14px 22px', borderTop: '1px solid var(--ink-100)', alignItems: 'center', cursor: 'pointer' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--brand-800)', fontWeight: 700 }}>{d.reference}</span>
                        {d.typologie && <TypoBadge typo={d.typologie}/>}
                      </div>
                      {d.objet && (
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink-900)', marginTop: 4 }}>{d.objet}</div>
                      )}
                      {d.description && (
                        <div className="clip-1" style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 3, lineHeight: 1.4 }}>{d.description}</div>
                      )}
                    </div>
                    {montantDossier > 0 && (
                      <div className="tnum" style={{ fontWeight: 700, color: 'var(--ink-900)' }}>{fmtEur(montantDossier)}</div>
                    )}
                    <StatutBadge statut={d.statut}/>
                  </div>
                )
              })
            )}
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Contact */}
            <div className="card" style={{ padding: 22 }}>
              <h2 className="page" style={{ fontSize: 15, marginBottom: 12 }}>Contact</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { label: 'Téléphone',   value: client.telephone,  icon: <PhoneIcon size={14}/> },
                  { label: 'Téléphone 2', value: client.telephone2, icon: <PhoneIcon size={14}/> },
                  { label: 'Email',       value: client.email,      icon: <MailIcon size={14}/> },
                  { label: 'Email 2',     value: client.email2,     icon: <MailIcon size={14}/> },
                ].filter(row => row.value).map(row => (
                  <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--brand-50)', color: 'var(--brand-800)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                      {row.icon}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="eyebrow">{row.label}</div>
                      <div style={{ fontWeight: 600, fontSize: 13 }} className="clip-1">{row.value}</div>
                    </div>
                  </div>
                ))}
                {!client.telephone && !client.email && (
                  <div style={{ fontSize: 13, color: 'var(--ink-400)' }}>Aucun contact renseigné</div>
                )}
              </div>
            </div>

            {/* Historique */}
            <div className="card" style={{ padding: 22 }}>
              <h2 className="page" style={{ fontSize: 15, marginBottom: 12 }}>Historique</h2>
              {historiqueRaw.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--ink-400)' }}>Aucun événement enregistré</div>
              ) : (
                <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {historiqueItems.map((e, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <CalIcon size={13} style={{ color: 'var(--ink-400)', flexShrink: 0 }}/>
                      <span style={{ flex: 1, color: 'var(--ink-700)' }}>{e.text}</span>
                      <span className="tnum" style={{ color: 'var(--ink-400)', whiteSpace: 'nowrap' }}>{fmtDate(e.date)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    )
  }

  // ── ÉDITION ──────────────────────────────────────────────────────────
  return (
    <div className="page-enter page-pad" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* Header édition */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}>
        <div>
          <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12, marginBottom: 6 }} onClick={() => setMode('vue')}>
            <ChevronLeft size={14}/> Retour
          </button>
          <h1 className="page">Modifier le client</h1>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" onClick={() => setMode('vue')}>Annuler</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>

      {succes && <div style={{ background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.3)', borderRadius: 10, padding: '10px 16px', fontSize: 13, color: '#15803d' }}>{succes}</div>}
      {erreur && <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '10px 16px', fontSize: 13, color: '#dc2626' }}>{erreur}</div>}

      {/* Informations */}
      <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="eyebrow">Informations client</div>

        <div>
          <label style={labelStyle}>Civilité</label>
          <select {...inputProps} value={client.civilite} onChange={e => set('civilite', e.target.value)}>
            <option value="M.">M.</option>
            <option value="Mme">Mme</option>
            <option value="M. et Mme">M. et Mme</option>
            <option value="Mme et Mme">Mme et Mme</option>
            <option value="M. et M.">M. et M.</option>
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Prénom{estCouple ? ' 1' : ''}</label>
            <input {...inputProps} type="text" value={client.prenom || ''} onChange={e => set('prenom', e.target.value)}/>
          </div>
          <div>
            <label style={labelStyle}>Nom{estCouple ? ' 1' : ''}</label>
            <input {...inputProps} type="text" value={client.nom || ''} onChange={e => set('nom', e.target.value)}/>
          </div>
        </div>

        {estCouple && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, paddingTop: 12, borderTop: '1px solid var(--ink-100)' }}>
            <div>
              <label style={labelStyle}>Prénom 2</label>
              <input {...inputProps} type="text" value={client.prenom2 || ''} onChange={e => set('prenom2', e.target.value)}/>
            </div>
            <div>
              <label style={labelStyle}>Nom 2</label>
              <input {...inputProps} type="text" value={client.nom2 || ''} onChange={e => set('nom2', e.target.value)}/>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Email 1</label>
            <input {...inputProps} type="email" value={client.email || ''} onChange={e => set('email', e.target.value)}/>
          </div>
          <div>
            <label style={labelStyle}>Email 2 <span style={{ color: 'var(--ink-400)', fontWeight: 400 }}>(optionnel)</span></label>
            <input {...inputProps} type="email" value={client.email2 || ''} onChange={e => set('email2', e.target.value)}/>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Téléphone 1</label>
            <input {...inputProps} type="tel" value={client.telephone || ''} onChange={e => set('telephone', e.target.value)}/>
          </div>
          <div>
            <label style={labelStyle}>Téléphone 2 <span style={{ color: 'var(--ink-400)', fontWeight: 400 }}>(optionnel)</span></label>
            <input {...inputProps} type="tel" value={client.telephone2 || ''} onChange={e => set('telephone2', e.target.value)}/>
          </div>
        </div>

        <div>
          <label style={labelStyle}>Adresse client</label>
          <input {...inputProps} type="text" value={client.adresse || ''} onChange={e => set('adresse', e.target.value)}/>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)' }}>Adresse chantier</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: 'var(--ink-500)' }}>
              <input type="checkbox" checked={client.adresse_chantier_identique ?? true} onChange={e => set('adresse_chantier_identique', e.target.checked)} style={{ width: 14, height: 14 }}/>
              Identique à l'adresse client
            </label>
          </div>
          {!(client.adresse_chantier_identique ?? true) ? (
            <input {...inputProps} type="text" value={client.adresse_chantier || ''} onChange={e => set('adresse_chantier', e.target.value)} placeholder="Adresse du chantier"/>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--ink-400)', padding: '8px 0' }}>= {client.adresse || 'Adresse client non renseignée'}</div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Type</label>
            <select {...inputProps} value={client.type_client || ''} onChange={e => set('type_client', e.target.value)}>
              <option value="particulier">Particulier</option>
              <option value="professionnel">Professionnel</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Référente</label>
            {authProfile?.role === 'admin' ? (
              <select {...inputProps} value={client.referente?.id || client.referente || ''} onChange={e => set('referente', e.target.value)}>
                <option value="">— Choisir —</option>
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.prenom} {p.nom} ({p.role === 'admin' ? 'Franchisée' : 'Agente'})</option>
                ))}
              </select>
            ) : (
              <input {...inputProps} type="text" disabled
                value={client.referente ? `${client.referente.prenom} ${client.referente.nom}` : ''}
                style={{ ...inputProps.style, opacity: 0.6 }}/>
            )}
          </div>
        </div>
      </div>

      {/* Apporteur d'affaires */}
      <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="eyebrow">Apporteur d'affaires</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
            <input type="checkbox" checked={client.apporteur_affaires || false} onChange={e => set('apporteur_affaires', e.target.checked)} style={{ width: 14, height: 14 }}/>
            Activer
          </label>
        </div>
        {client.apporteur_affaires ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8, borderTop: '1px solid var(--ink-100)' }}>
            <div>
              <label style={labelStyle}>Nom de l'apporteur</label>
              <input {...inputProps} type="text" value={client.apporteur_nom || ''} onChange={e => set('apporteur_nom', e.target.value)}/>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Commission (%)</label>
                <input {...inputProps} type="number" step="0.01" min="0" max="100"
                  value={client.apporteur_pourcentage || ''} onChange={e => set('apporteur_pourcentage', e.target.value)}/>
              </div>
              <div>
                <label style={labelStyle}>Calculé sur</label>
                <select {...inputProps} value={client.apporteur_base || 'total_chantier'} onChange={e => set('apporteur_base', e.target.value)}>
                  <option value="total_chantier">Total du chantier HT</option>
                  <option value="par_devis">Par devis signé</option>
                </select>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--ink-400)' }}>Aucun apporteur d'affaires</div>
        )}
      </div>

      {/* Notes */}
      <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="eyebrow">Notes</div>
        <textarea className="input" value={client.notes || ''} onChange={e => set('notes', e.target.value)}
          rows={4} placeholder="Informations complémentaires sur le client…"
          style={{ width: '100%', resize: 'vertical', padding: '10px 12px', lineHeight: 1.5 }}/>
      </div>

    </div>
  )
}
