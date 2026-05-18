'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '../lib/auth-context'
import { getDossiersByScope, getFilteredDossiers, getCompteurs, calcStatut } from '../lib/dossiers'

/* ── Badges visuels ── */

const STATUT_BADGE = {
  a_contacter:       { bg: 'rgba(0,148,212,0.10)',   color: '#0078ad',  label: 'À contacter' },
  a_relancer:        { bg: 'rgba(0,148,212,0.10)',   color: '#0078ad',  label: 'À relancer' },
  devis_en_attente:  { bg: 'rgba(245,158,11,0.12)',  color: '#a16207',  label: 'Devis en attente' },
  devis_a_modifier:  { bg: 'rgba(220,38,38,0.10)',   color: '#b91c1c',  label: 'Devis à modifier' },
  en_cours_chantier: { bg: 'rgba(22,163,74,0.10)',   color: '#15803d',  label: 'En chantier' },
  termine:           { bg: 'rgba(148,163,184,0.15)', color: '#475569',  label: 'Terminé' },
  annule:            { bg: 'rgba(220,38,38,0.10)',   color: '#b91c1c',  label: 'Annulé' },
}

function StatutBadge({ statut }) {
  const s = STATUT_BADGE[statut] || { bg: 'var(--surface-2)', color: 'var(--ink-500)', label: statut }
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 99, background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  )
}

const TYPO_LABEL = {
  courtage: 'Courtage', amo: 'AMO', estimo: 'Estimo',
  merad: 'MERAD', audit_energetique: 'Audit énergétique', studio_jardin: 'Studio de jardin',
}

function TypoBadge({ typo }) {
  if (!typo) return null
  return (
    <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 6, background: 'var(--brand-50)', color: 'var(--brand-800)', whiteSpace: 'nowrap' }}>
      {TYPO_LABEL[typo] || typo}
    </span>
  )
}

function FactRow({ label, value, highlight }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div className="eyebrow" style={{ marginBottom: 4 }}>{label}</div>
      <div className="clip-1" style={{ fontSize: highlight ? 18 : 13.5, fontWeight: highlight ? 800 : 600, color: highlight ? 'var(--brand-800)' : 'var(--ink-900)', letterSpacing: highlight ? -0.02 : 0 }}>
        {value}
      </div>
    </div>
  )
}

const villeFromAddr = (addr) => {
  if (!addr) return '—'
  const parts = addr.split(',')
  return parts[parts.length - 1]?.trim() || addr
}

/* ── Colonne liste ── */

function ChantiersList({ items, selectedId, onSelect, aujourd_hui }) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--ink-200)', flexShrink: 0 }}>
        <div className="eyebrow">{items.length} résultats</div>
      </div>
      <div style={{ overflowY: 'auto', flex: 1, padding: '8px 10px' }}>
        {items.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-400)', fontSize: 13 }}>Aucun dossier</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.map(d => {
            const s        = calcStatut(d)
            const limite   = d.date_limite_devis ? new Date(d.date_limite_devis) : null
            const diff     = limite ? Math.round((limite - aujourd_hui) / 86400000) : null
            const urgent   = diff !== null && diff <= 7 && diff >= 0
            const enRetard = diff !== null && diff < 0 && !['termine','annule'].includes(s)
            const isSel    = d.id === selectedId
            return (
              <button key={d.id} onClick={() => onSelect(d.id)}
                className={!isSel ? 'row-hover' : ''}
                style={{
                  textAlign: 'left', padding: '14px 14px', borderRadius: 12,
                  border: '1px solid', borderColor: isSel ? 'var(--brand-500)' : 'transparent',
                  background: isSel ? 'var(--brand-50)' : 'transparent',
                  boxShadow: isSel ? '0 0 0 3px rgba(0,148,212,0.10)' : 'none',
                  transition: 'all 150ms ease',
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <span className="mono" style={{ fontSize: 11.5, color: 'var(--brand-800)', fontWeight: 700 }}>{d.reference}</span>
                      <TypoBadge typo={d.typologie} />
                    </div>
                    <div className="clip-1" style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink-900)', letterSpacing: -0.01 }}>
                      {d.client ? `${d.client.civilite || ''} ${d.client.prenom} ${d.client.nom}${d.client.prenom2 ? ` & ${d.client.prenom2} ${d.client.nom2}` : ''}`.trim() : '—'}
                    </div>
                    <div className="clip-1" style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>
                      {villeFromAddr(d.client?.adresse)}
                    </div>
                  </div>
                  <StatutBadge statut={s} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, gap: 10 }}>
                  {limite && (
                    <span className="tnum" style={{ fontSize: 11.5, color: enRetard ? '#b91c1c' : urgent ? '#a16207' : 'var(--ink-400)', fontWeight: enRetard || urgent ? 700 : 400 }}>
                      {enRetard ? `Retard ${Math.abs(diff)}j` : urgent ? `J-${diff}` : limite.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                    </span>
                  )}
                  {d.referente && (
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--brand-100)', color: 'var(--brand-800)', display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700, marginLeft: 'auto' }}>
                      {(d.referente.prenom?.[0] || '') + (d.referente.nom?.[0] || '')}
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ── Colonne aperçu ── */

function ChantierPreview({ d, onOpen, onBack }) {
  if (!d) return (
    <div className="card" style={{ display: 'grid', placeItems: 'center', textAlign: 'center', color: 'var(--ink-400)' }}>
      <div>
        <div style={{ fontSize: 36, marginBottom: 10 }}>📁</div>
        <div style={{ fontSize: 13 }}>Sélectionne un dossier pour voir l'aperçu</div>
      </div>
    </div>
  )

  const s             = calcStatut(d)
  const nomClient     = d.client ? `${d.client.civilite || ''} ${d.client.prenom} ${d.client.nom}${d.client.prenom2 ? ` & ${d.client.prenom2} ${d.client.nom2}` : ''}`.trim() : '—'
  const devisActifs   = (d.devis_artisans || []).filter(dv => dv.statut !== 'refuse')
  const devisAcceptes = devisActifs.filter(dv => dv.statut === 'accepte')
  const fmtEur = (n) => Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' €'

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Bouton retour mobile */}
      {onBack && (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--ink-200)', flexShrink: 0 }}>
          <button className="btn btn-ghost" onClick={onBack} style={{ fontSize: 12, padding: '4px 10px' }}>
            ← Retour à la liste
          </button>
        </div>
      )}

      {/* Header */}
      <div style={{ padding: '20px 22px 16px', borderBottom: '1px solid var(--ink-200)', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ position: 'absolute', top: 0, right: 0, width: 160, height: 80, background: 'linear-gradient(135deg, rgba(0,148,212,0.10), rgba(0,148,212,0))', pointerEvents: 'none', borderRadius: '0 var(--radius) 0 100%' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <span className="mono" style={{ fontSize: 12, color: 'var(--brand-800)', fontWeight: 700 }}>{d.reference}</span>
              <TypoBadge typo={d.typologie} />
            </div>
            <h2 className="page" style={{ fontSize: 20, letterSpacing: -0.02 }}>{nomClient}</h2>
            <div style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 6 }}>{d.client?.adresse}</div>
          </div>
          <StatutBadge statut={s} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => onOpen(d.id)}>
            Ouvrir dossier →
          </button>
          {d.client?.tel && (
            <a href={`tel:${d.client.tel}`} className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }}>
              📞 {d.client.tel}
            </a>
          )}
          {d.client?.email && (
            <a href={`mailto:${d.client.email}`} className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }}>
              ✉️ Email
            </a>
          )}
        </div>
      </div>

      {/* Body scrollable */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Méta */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {d.surface > 0 && <FactRow label="Surface" value={`${d.surface} m²`} />}
          {d.montant_chantier_ttc > 0 && <FactRow label="Montant chantier" value={fmtEur(d.montant_chantier_ttc)} highlight />}
          <FactRow label="Contrat" value={d.contrat_signe
            ? <span style={{ color: '#15803d', fontWeight: 600 }}>✓ {d.date_signature_contrat ? new Date(d.date_signature_contrat).toLocaleDateString('fr-FR') : 'Signé'}</span>
            : <span style={{ color: '#b91c1c' }}>Non signé</span>}
          />
          {d.referente && <FactRow label="Référente" value={`${d.referente.prenom} ${d.referente.nom}`} />}
        </div>

        {/* Description */}
        {d.description && (
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Descriptif</div>
            <p style={{ fontSize: 13.5, color: 'var(--ink-700)', lineHeight: 1.55, margin: 0 }}>{d.description}</p>
          </div>
        )}

        {/* Avancement */}
        {d.avancement > 0 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <div className="eyebrow">Avancement</div>
              <span className="tnum" style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand-800)' }}>{d.avancement}%</span>
            </div>
            <div className="progress" style={{ height: 8 }}>
              <span style={{ width: `${d.avancement}%` }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11.5, color: 'var(--ink-500)' }}>
              {d.date_demarrage_chantier && <span>Démarrage : <strong>{new Date(d.date_demarrage_chantier).toLocaleDateString('fr-FR')}</strong></span>}
              {d.date_fin_chantier && <span>Fin prévue : <strong>{new Date(d.date_fin_chantier).toLocaleDateString('fr-FR')}</strong></span>}
            </div>
          </div>
        )}

        {/* Artisans */}
        {devisActifs.length > 0 && (
          <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Artisans · {devisAcceptes.length} signés</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {devisActifs.map(dv => (
                <div key={dv.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--ink-200)' }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="clip-1" style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-900)' }}>{dv.artisan?.entreprise || '—'}</div>
                    {dv.montant_ttc > 0 && <div className="tnum" style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 2 }}>{fmtEur(dv.montant_ttc)}</div>}
                  </div>
                  <div>
                    {dv.statut === 'accepte'    && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: 'rgba(22,163,74,0.10)',   color: '#15803d' }}>Signé</span>}
                    {dv.statut === 'refuse'     && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: 'rgba(220,38,38,0.10)',   color: '#b91c1c' }}>Refusé</span>}
                    {dv.statut === 'en_attente' && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: 'rgba(245,158,11,0.12)', color: '#a16207' }}>En attente</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Finance summary */}
        {devisAcceptes.length > 0 && (
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--ink-200)', borderRadius: 12, padding: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Suivi financier</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <FactRow label="Frais consultation"
                value={d.frais_consultation > 0 ? fmtEur(d.frais_consultation) : '—'} />
              <FactRow label="Commissions prévues"
                value={fmtEur(devisAcceptes.reduce((s, dv) => s + ((dv.montant_ht || 0) * (dv.commission_pourcentage || 0) / 100), 0))} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Page ── */

export default function Chantiers() {
  const [dossiers,     setDossiers]     = useState([])
  const [agentes,      setAgentes]      = useState([])
  const [loading,      setLoading]      = useState(true)
  const [recherche,    setRecherche]    = useState('')
  const [filtreStatut, setFiltreStatut] = useState('tous')
  const [filtreTypo,   setFiltreTypo]   = useState('tous')
  const [onglet,       setOnglet]       = useState('moi')
  const [selectedId,   setSelectedId]   = useState(null)
  const [isMobile,     setIsMobile]     = useState(false)
  const [showPreview,  setShowPreview]  = useState(false)
  const router = useRouter()
  const { user, profile, initialized } = useAuth()

  // Détection mobile
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const handler = (e) => setIsMobile(e.matches)
    setIsMobile(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    if (!initialized) return
    if (!user) { router.push('/login'); return }
    if (!profile) return

    let query = supabase
      .from('dossiers')
      .select('*, client:clients(civilite, prenom, nom, prenom2, nom2, adresse, tel, email), referente:profiles!dossiers_referente_id_fkey(id, prenom, nom, role), devis_artisans(id, statut, montant_ht, montant_ttc, commission_pourcentage, artisan:artisans(id, entreprise)), comptes_rendus(id, type_visite)')
      .order('created_at', { ascending: false })
    if (profile.role === 'agente') query = query.eq('referente_id', profile.id)

    Promise.all([
      query,
      profile.role === 'admin'
        ? supabase.from('profiles').select('id, prenom, nom').eq('role', 'agente').order('prenom')
        : Promise.resolve({ data: [] }),
    ]).then(([{ data }, { data: agentesData }]) => {
      setDossiers(data || [])
      setAgentes(agentesData || [])
      if (data?.length) setSelectedId(data[0].id)
      setLoading(false)
    })
  }, [initialized, user?.id, profile?.id, router])

  const nomClient = (c) => c
    ? `${c.civilite || ''} ${c.prenom} ${c.nom}${c.prenom2 ? ` & ${c.prenom2} ${c.nom2}` : ''}`.trim()
    : '—'

  const isMarine = profile?.role === 'admin'

  const dossiersFiltresOnglet = getDossiersByScope(dossiers, profile, onglet, agentes)
  const dossiersFiltres       = getFilteredDossiers(dossiersFiltresOnglet, recherche, filtreStatut, filtreTypo, nomClient)
  const compteurs             = getCompteurs(dossiersFiltresOnglet)
  const aujourd_hui           = new Date()

  // Reset selected si filtré hors liste
  useEffect(() => {
    if (!dossiersFiltres.find(d => d.id === selectedId) && dossiersFiltres[0]) {
      setSelectedId(dossiersFiltres[0].id)
      setShowPreview(false)
    }
  }, [dossiersFiltres, selectedId])

  const selected = dossiersFiltres.find(d => d.id === selectedId) || dossiersFiltres[0] || null

  const handleSelect = (id) => {
    setSelectedId(id)
    if (isMobile) setShowPreview(true)
  }

  const ongletsList = isMarine ? [
    { key: 'moi', label: 'Mes chantiers' },
    ...agentes.map(a => ({ key: a.id, label: `${a.prenom} ${a.nom}` })),
    { key: 'tous', label: 'Tous' },
  ] : []

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 96 }}>
      <p className="eyebrow">Chargement…</p>
    </div>
  )

  // Hauteur de la zone liste/aperçu
  const panelHeight = isMobile ? 'calc(100vh - 200px)' : 'calc(100vh - 340px)'

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: isMobile ? '16px' : '28px 32px', maxWidth: 1400, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Pilotage</div>
          <h1 className="page">Chantiers</h1>
          <div style={{ color: 'var(--ink-500)', fontSize: 13, marginTop: 6 }}>
            {dossiersFiltres.length} dossiers · {compteurs.enChantier} actifs · {compteurs.enDevis} en devis
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => router.push('/dashboard')}>← Retour</button>
          <button className="btn btn-primary" onClick={() => router.push('/chantiers/nouveau')}>+ Nouveau chantier</button>
        </div>
      </div>

      {/* ── Onglets scope (admin uniquement) ── */}
      {isMarine && (
        <div className="tabs" style={{ overflowX: 'auto' }}>
          {ongletsList.map(({ key, label }) => (
            <button key={key} className={`tab ${onglet === key ? 'active' : ''}`} onClick={() => setOnglet(key)}
              style={{ whiteSpace: 'nowrap' }}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ── KPI strip ── */}
      <div className="kpi-grid">
        {[
          { label: 'À traiter',   value: compteurs.aTraiter,   tone: 'info' },
          { label: 'En devis',    value: compteurs.enDevis,    tone: 'warn' },
          { label: 'En chantier', value: compteurs.enChantier, tone: 'ok' },
          { label: 'Terminés',    value: compteurs.termines,   tone: 'mute' },
        ].map(k => {
          const tc = { info: { bg:'rgba(0,148,212,0.12)',color:'#0078ad' }, warn:{bg:'rgba(245,158,11,0.13)',color:'#a16207'}, ok:{bg:'rgba(22,163,74,0.10)',color:'#15803d'}, mute:{bg:'rgba(148,163,184,0.15)',color:'#475569'} }[k.tone]
          return (
            <div key={k.label} className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div className="eyebrow">{k.label}</div>
                <div className="tnum" style={{ fontSize: 28, fontWeight: 800, color: 'var(--brand-800)', marginTop: 4, letterSpacing: -0.02 }}>{k.value}</div>
              </div>
              <span style={{ width: 36, height: 36, borderRadius: 10, background: tc.bg, color: tc.color, display: 'grid', placeItems: 'center', fontSize: 16, fontWeight: 800 }}>
                {k.value}
              </span>
            </div>
          )
        })}
      </div>

      {/* ── Filtres ── */}
      <div className="card" style={{ padding: '14px 16px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="input" placeholder="Rechercher référence, client, adresse…"
          value={recherche} onChange={e => setRecherche(e.target.value)}
          style={{ flex: 1, minWidth: isMobile ? '100%' : 240, height: 40 }} />
        <select className="input" value={filtreStatut} onChange={e => setFiltreStatut(e.target.value)}
          style={{ height: 40, minWidth: 170 }}>
          <option value="tous">Tous les statuts</option>
          <option value="a_contacter">À contacter</option>
          <option value="a_relancer">À relancer</option>
          <option value="devis_en_attente">Devis en attente</option>
          <option value="devis_a_modifier">Devis à modifier</option>
          <option value="en_cours_chantier">En cours de chantier</option>
          <option value="termine">Terminé</option>
          <option value="annule">Annulé</option>
        </select>
        <select className="input" value={filtreTypo} onChange={e => setFiltreTypo(e.target.value)}
          style={{ height: 40, minWidth: 160 }}>
          <option value="tous">Toutes typologies</option>
          <option value="courtage">Courtage</option>
          <option value="amo">AMO</option>
          <option value="estimo">Estimo</option>
          <option value="merad">MERAD</option>
          <option value="audit_energetique">Audit énergétique</option>
          <option value="studio_jardin">Studio de jardin</option>
        </select>
      </div>

      {/* ── Grille liste + aperçu ── */}
      {isMobile ? (
        /* Mobile : une seule colonne, bascule liste ↔ aperçu */
        <div style={{ height: panelHeight }}>
          {!showPreview
            ? <ChantiersList items={dossiersFiltres} selectedId={selected?.id} onSelect={handleSelect} aujourd_hui={aujourd_hui} />
            : <ChantierPreview d={selected} onOpen={(id) => router.push(`/chantiers/${id}`)} onBack={() => setShowPreview(false)} />
          }
        </div>
      ) : (
        /* Desktop : deux colonnes */
        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 20, height: panelHeight }}>
          <ChantiersList items={dossiersFiltres} selectedId={selected?.id} onSelect={handleSelect} aujourd_hui={aujourd_hui} />
          <ChantierPreview d={selected} onOpen={(id) => router.push(`/chantiers/${id}`)} />
        </div>
      )}

    </div>
  )
}
