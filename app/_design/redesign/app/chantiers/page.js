'use client'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '../lib/auth-context'
import {
  getDossiersByScope,
  getFilteredDossiers,
  getCompteurs,
  calcStatut,
  STATUT_CONFIG,
} from '../lib/dossiers'
import {
  Icon,
  Badge,
  Avatar,
  avatarColor,
  Progress,
  StatutBadge,
  TypoBadge,
  typologieLabel,
  KpiCard,
} from '../components/ui'

const fmtEur = (n) => {
  const v = Math.round(Number(n) || 0).toString()
  return v.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' €'
}
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'

const nomClient = (c) =>
  c ? `${c.civilite || ''} ${c.prenom || ''} ${c.nom || ''}${c.prenom2 ? ` & ${c.prenom2} ${c.nom2 || ''}` : ''}`.replace(/\s+/g, ' ').trim() : '—'

const villeFromAddr = (addr) => {
  if (!addr) return ''
  const match = addr.match(/\d{5}\s+([A-Za-zÀ-ÿ\-\s]+)$/)
  return match ? match[1].trim() : ''
}

export default function ChantiersPage() {
  const router = useRouter()
  const { user, profile, initialized } = useAuth()
  const [dossiers, setDossiers] = useState([])
  const [agentes, setAgentes] = useState([])
  const [loading, setLoading] = useState(true)
  const [recherche, setRecherche] = useState('')
  const [filtreStatut, setFiltreStatut] = useState('tous')
  const [filtreTypo, setFiltreTypo] = useState('tous')
  const [onglet, setOnglet] = useState('moi')
  const [selectedId, setSelectedId] = useState(null)

  // ── Chargement ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!initialized) return
    if (!user) { router.push('/login'); return }
    if (!profile) return

    let query = supabase
      .from('dossiers')
      .select(`
        *,
        client:clients(civilite, prenom, nom, prenom2, nom2, adresse, tel, email),
        referente:profiles!dossiers_referente_id_fkey(id, prenom, nom, role),
        devis_artisans(id, statut, montant_ttc, montant_ht, commission_pourcentage, date_signature, artisan:artisans(id, entreprise, metier, ville)),
        comptes_rendus(id, type_visite),
        suivi_financier(*)
      `)
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
      setLoading(false)
    })
  }, [initialized, user?.id, profile?.id, profile?.role])

  const isMarine = profile?.role === 'admin'

  // ── Filtrage scope ─────────────────────────────────────────────────────
  const dossiersScope = useMemo(
    () => getDossiersByScope(dossiers, profile, onglet, agentes),
    [dossiers, profile, onglet, agentes]
  )
  const filtered = useMemo(
    () => getFilteredDossiers(dossiersScope, recherche, filtreStatut, filtreTypo, nomClient),
    [dossiersScope, recherche, filtreStatut, filtreTypo]
  )
  const compteurs = useMemo(() => getCompteurs(dossiersScope), [dossiersScope])

  // Sélection initiale + reset si filtré hors liste
  useEffect(() => {
    if (filtered.length === 0) { setSelectedId(null); return }
    if (!selectedId || !filtered.find(d => d.id === selectedId)) {
      setSelectedId(filtered[0].id)
    }
  }, [filtered, selectedId])

  const selected = filtered.find(d => d.id === selectedId)

  // ── Onglets dynamiques ─────────────────────────────────────────────────
  const scopeTabs = isMarine ? [
    { key: 'moi', label: 'Mes chantiers' },
    ...agentes.map(a => ({ key: a.id, label: `Chantiers ${a.prenom}` })),
    { key: 'tous', label: 'Tous les chantiers' },
  ] : []

  if (loading) return (
    <div className="page-content" style={{ display: 'grid', placeItems: 'center' }}>
      <p className="eyebrow">Chargement…</p>
    </div>
  )

  return (
    <div className="page-content page-enter" style={{ gap: 18 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Pilotage</div>
          <h1 className="page-h1">Chantiers</h1>
          <div style={{ color: 'var(--ink-500)', fontSize: 13, marginTop: 6 }}>
            {filtered.length} dossiers · {compteurs.enChantier} actifs · {compteurs.enDevis} en devis
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost"><Icon name="Doc" size={16} /> Exporter</button>
          <button className="btn btn-primary" onClick={() => router.push('/chantiers/nouveau')}>
            <Icon name="Plus" size={16} /> Nouveau chantier
          </button>
        </div>
      </div>

      {/* Tabs scope (Marine only) */}
      {isMarine && (
        <div className="tabs" style={{ overflowX: 'auto' }}>
          {scopeTabs.map(t => (
            <button key={t.key} className={`tab ${onglet === t.key ? 'active' : ''}`} onClick={() => setOnglet(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* KPI strip */}
      <div className="kpi-grid">
        {[
          { label: 'À traiter',   value: compteurs.aTraiter,   tone: 'info', icon: 'Folder' },
          { label: 'En devis',    value: compteurs.enDevis,    tone: 'warn', icon: 'Doc' },
          { label: 'En chantier', value: compteurs.enChantier, tone: 'ok',   icon: 'Building' },
          { label: 'Terminés',    value: compteurs.termines,   tone: 'mute', icon: 'Check' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div className="eyebrow">{k.label}</div>
              <div className="tnum" style={{ fontSize: 28, fontWeight: 800, color: 'var(--brand-800)', marginTop: 4, letterSpacing: -0.02 }}>{k.value}</div>
            </div>
            <span style={{
              width: 36, height: 36, borderRadius: 10,
              background:
                k.tone === 'ok' ? 'rgba(22,163,74,0.10)' :
                k.tone === 'warn' ? 'rgba(245,158,11,0.13)' :
                k.tone === 'info' ? 'rgba(0,148,212,0.12)' :
                'rgba(148,163,184,0.15)',
              color:
                k.tone === 'ok' ? '#15803d' :
                k.tone === 'warn' ? '#a16207' :
                k.tone === 'info' ? '#0078ad' :
                '#475569',
              display: 'grid', placeItems: 'center',
            }}>
              <Icon name={k.icon} size={18} />
            </span>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div className="card" style={{ padding: '14px 16px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-400)', pointerEvents: 'none' }}>
            <Icon name="Search" size={16} />
          </span>
          <input
            className="input"
            placeholder="Rechercher référence, client, adresse…"
            value={recherche}
            onChange={e => setRecherche(e.target.value)}
            style={{ paddingLeft: 36, width: '100%', height: 40 }}
          />
        </div>
        <select className="input" value={filtreStatut} onChange={e => setFiltreStatut(e.target.value)} style={{ height: 40, minWidth: 170 }}>
          <option value="tous">Tous les statuts</option>
          {Object.entries(STATUT_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="input" value={filtreTypo} onChange={e => setFiltreTypo(e.target.value)} style={{ height: 40, minWidth: 160 }}>
          <option value="tous">Toutes typologies</option>
          <option value="courtage">Courtage</option>
          <option value="amo">AMO</option>
          <option value="estimo">Estimo</option>
          <option value="merad">MERAD</option>
          <option value="audit_energetique">Audit énergétique</option>
          <option value="studio_jardin">Studio de jardin</option>
        </select>
      </div>

      {/* Liste / Détail */}
      <div className="grid-list" style={{ flex: 1, minHeight: 0 }}>
        <ChantiersList
          items={filtered}
          selectedId={selected?.id}
          onSelect={setSelectedId}
          showReferente={isMarine && (onglet === 'tous' || agentes.some(a => a.id === onglet))}
        />
        {selected
          ? <ChantierPreview d={selected} onOpen={() => router.push(`/chantiers/${selected.id}`)} />
          : <EmptyDetail />}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// LISTE
// ─────────────────────────────────────────────────────────────────────────────

function ChantiersList({ items, selectedId, onSelect, showReferente }) {
  const today = new Date()
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--ink-200)' }}>
        <div className="eyebrow">{items.length} résultats</div>
        <div style={{ display: 'flex', gap: 6, fontSize: 11, color: 'var(--ink-500)' }}>
          Tri : <strong style={{ color: 'var(--ink-700)' }}>Plus récent</strong>
          <Icon name="ChevronDown" size={12} />
        </div>
      </div>
      <div style={{ overflow: 'auto', flex: 1, padding: '8px 12px' }}>
        {items.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-400)' }}>
            Aucun dossier
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map(d => {
            const s = calcStatut(d)
            const limite = d.date_limite_devis ? new Date(d.date_limite_devis) : null
            const diff = limite ? Math.round((limite - today) / 86400000) : null
            const urgent = diff !== null && diff <= 7 && diff >= 0
            const enRetard = diff !== null && diff < 0 && !['termine', 'annule'].includes(s)
            const isSel = d.id === selectedId
            // Estimation d'un avancement basé sur le suivi_financier (heuristique)
            const sf = d.suivi_financier || []
            const fraisOk = sf.find(x => x.type_echeance === 'frais_consultation' && x.statut_client === 'regle')
            const acceptes = (d.devis_artisans || []).filter(dv => dv.statut === 'accepte')
            const acomptes = acceptes.filter(dv => sf.find(x => x.type_echeance === 'acompte_artisan' && x.artisan_id === (dv.artisan_id || dv.artisan?.id) && x.statut_client === 'regle'))
            const avancement = d.date_demarrage_chantier
              ? (acceptes.length > 0 ? Math.round(50 + (acomptes.length / acceptes.length) * 50) : 50)
              : (acceptes.length > 0 ? 35 : fraisOk ? 15 : 5)

            return (
              <button key={d.id} onClick={() => onSelect(d.id)} style={{
                textAlign: 'left', padding: '14px 14px', borderRadius: 12,
                border: '1px solid', borderColor: isSel ? 'var(--brand-500)' : 'transparent',
                background: isSel ? 'var(--brand-50)' : 'transparent',
                boxShadow: isSel ? '0 0 0 3px rgba(0,148,212,0.10)' : 'none',
                transition: 'all 150ms ease', position: 'relative', cursor: 'pointer', width: '100%',
              }} className={!isSel ? 'row-hover' : ''}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <span className="mono" style={{ fontSize: 11.5, color: 'var(--brand-800)', fontWeight: 700, letterSpacing: 0.02 }}>{d.reference}</span>
                      <TypoBadge typo={d.typologie} />
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-900)', letterSpacing: -0.01 }} className="clip-1">{nomClient(d.client)}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }} className="clip-1">
                      <Icon name="Pin3" size={12} /> {villeFromAddr(d.client?.adresse) || d.client?.adresse || ''}
                    </div>
                  </div>
                  <StatutBadge statut={s} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, gap: 10 }}>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                    {limite && (
                      <MiniMeta icon={<Icon name="Clock" size={12} />}>
                        <span style={{
                          color: enRetard ? '#b91c1c' : urgent ? '#a16207' : undefined,
                          fontWeight: enRetard || urgent ? 700 : 500,
                        }}>
                          {enRetard ? `retard ${Math.abs(diff)}j` : urgent ? `J-${diff}` : fmtDate(d.date_limite_devis)}
                        </span>
                      </MiniMeta>
                    )}
                    {!limite && d.date_fin_chantier && (
                      <MiniMeta icon={<Icon name="Calendar" size={12} />}>Fin {fmtDate(d.date_fin_chantier)}</MiniMeta>
                    )}
                    {showReferente && d.referente && (
                      <MiniMeta icon={<Icon name="Users" size={12} />}>{d.referente.prenom}</MiniMeta>
                    )}
                  </div>
                  {d.referente && <Avatar name={`${d.referente.prenom} ${d.referente.nom}`} color={avatarColor(d.referente.id)} size={24} />}
                </div>
                <div style={{ marginTop: 10 }}><Progress value={avancement} height={4} /></div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function MiniMeta({ icon, children }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--ink-500)', fontWeight: 500 }}>
      {icon}{children}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PREVIEW DOSSIER (lecture seule, lien vers la page détail)
// ─────────────────────────────────────────────────────────────────────────────

function ChantierPreview({ d, onOpen }) {
  const s = calcStatut(d)
  const ville = villeFromAddr(d.client?.adresse) || d.client?.adresse || ''
  const acceptes = (d.devis_artisans || []).filter(dv => dv.statut === 'accepte')
  const totalCom = acceptes.reduce((sum, dv) => sum + ((dv.montant_ht || 0) * (dv.commission_pourcentage || 0) / 100), 0)
  const sf = d.suivi_financier || []
  const acomptesRecus = acceptes.filter(dv => sf.find(x => x.type_echeance === 'acompte_artisan' && x.artisan_id === (dv.artisan_id || dv.artisan?.id) && x.statut_client === 'regle')).length
  const totalAcomptes = acceptes.length
  const facturesPaye = acceptes.filter(dv => sf.find(x => x.type_echeance === 'facture_finale' && x.artisan_id === (dv.artisan_id || dv.artisan?.id) && x.statut_client === 'regle')).length
  const totalFactures = acceptes.length

  // Avancement
  const avancement = d.date_demarrage_chantier
    ? (acceptes.length > 0 ? Math.round(50 + (acomptesRecus / Math.max(1, acceptes.length)) * 50) : 50)
    : (acceptes.length > 0 ? 35 : 5)

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Header */}
      <div style={{ padding: '18px 22px 16px', borderBottom: '1px solid var(--ink-200)', position: 'relative' }}>
        <div style={{
          position: 'absolute', top: 0, right: 0, width: 160, height: 80,
          background: 'linear-gradient(135deg, rgba(0,148,212,0.10), rgba(0,148,212,0))',
          pointerEvents: 'none', borderRadius: '0 var(--radius) 0 100%',
        }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <span className="mono" style={{ fontSize: 12, color: 'var(--brand-800)', fontWeight: 700 }}>{d.reference}</span>
              <TypoBadge typo={d.typologie} />
            </div>
            <h2 className="page-h2" style={{ fontSize: 22, letterSpacing: -0.02 }}>{nomClient(d.client)}</h2>
            {d.client?.adresse && (
              <div style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="Pin3" size={13} />{d.client.adresse}
              </div>
            )}
          </div>
          <StatutBadge statut={s} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <button onClick={onOpen} className="btn btn-primary" style={{ fontSize: 12, padding: '6px 12px' }}>
            <Icon name="Eye" size={14} /> Ouvrir le dossier
          </button>
          {d.client?.tel && (
            <a href={`tel:${d.client.tel}`} className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }}>
              <Icon name="Phone" size={14} /> Appeler
            </a>
          )}
          {d.client?.email && (
            <a href={`mailto:${d.client.email}`} className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }}>
              <Icon name="Mail" size={14} /> Email
            </a>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 22 }}>

        {/* Facts */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <FactRow label="Surface" value={d.surface ? `${d.surface} m²` : '—'} />
          <FactRow label="Montant chantier" value={d.montant_chantier_ttc > 0 ? fmtEur(d.montant_chantier_ttc) : '—'} highlight />
          <FactRow
            label="Contrat signé"
            value={d.contrat_signe ? (
              <span style={{ color: '#15803d', fontWeight: 600, display: 'inline-flex', gap: 5, alignItems: 'center' }}>
                <Icon name="Check" size={14} /> {fmtDate(d.date_signature_contrat)}
              </span>
            ) : <span style={{ color: '#b91c1c' }}>Non signé</span>}
          />
          {d.referente && (
            <FactRow
              label="Référente"
              value={
                <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <Avatar name={`${d.referente.prenom} ${d.referente.nom}`} color={avatarColor(d.referente.id)} size={20} />
                  {d.referente.prenom} {d.referente.nom}
                </span>
              }
            />
          )}
        </div>

        {/* Description */}
        {d.description && (
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Descriptif</div>
            <p style={{ fontSize: 13.5, color: 'var(--ink-700)', lineHeight: 1.55, margin: 0 }}>{d.description}</p>
          </div>
        )}

        {/* Avancement */}
        {(d.date_demarrage_chantier || acceptes.length > 0) && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <div className="eyebrow">Avancement</div>
              <span className="tnum" style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand-800)' }}>{avancement}%</span>
            </div>
            <Progress value={avancement} height={8} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11.5, color: 'var(--ink-500)' }}>
              <span>Démarrage : <span style={{ color: 'var(--ink-700)', fontWeight: 600 }}>{fmtDate(d.date_demarrage_chantier)}</span></span>
              <span>Fin prévue : <span style={{ color: 'var(--ink-700)', fontWeight: 600 }}>{fmtDate(d.date_fin_chantier)}</span></span>
            </div>
          </div>
        )}

        {/* Artisans */}
        {(d.devis_artisans || []).length > 0 && (
          <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Artisans · {acceptes.length} signés</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(d.devis_artisans || []).map(dv => (
                <div key={dv.id} style={{
                  display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'center',
                  padding: '10px 12px', borderRadius: 10, border: '1px solid var(--ink-200)',
                }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: 8,
                    background: 'var(--brand-50)', color: 'var(--brand-800)',
                    display: 'grid', placeItems: 'center',
                  }}><Icon name="Hammer" size={16} /></div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-900)' }} className="clip-1">{dv.artisan?.entreprise || '—'}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 1 }}>
                      {dv.artisan?.metier}{dv.artisan?.ville ? ` · ${dv.artisan.ville}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="tnum" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-900)' }}>{fmtEur(dv.montant_ttc)}</div>
                    <div style={{ marginTop: 3 }}>
                      {dv.statut === 'accepte' && <Badge tone="ok">Signé</Badge>}
                      {dv.statut === 'refuse'  && <Badge tone="bad">Refusé</Badge>}
                      {dv.statut === 'en_attente' && <Badge tone="warn">En attente</Badge>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Suivi finance */}
        {acceptes.length > 0 && (
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--ink-200)', borderRadius: 12, padding: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Suivi financier</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-500)', marginBottom: 4 }}>Acomptes reçus</div>
                <div className="tnum" style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink-900)' }}>{acomptesRecus} / {totalAcomptes}</div>
                <div style={{ marginTop: 6 }}><Progress value={totalAcomptes > 0 ? acomptesRecus / totalAcomptes * 100 : 0} height={4} /></div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-500)', marginBottom: 4 }}>Factures payées</div>
                <div className="tnum" style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink-900)' }}>{facturesPaye} / {totalFactures}</div>
                <div style={{ marginTop: 6 }}><Progress value={totalFactures > 0 ? facturesPaye / totalFactures * 100 : 0} height={4} /></div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-500)', marginBottom: 4 }}>Frais consultation</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-700)' }}>
                  {d.frais_consultation > 0 ? (
                    <>
                      <span className="tnum">{fmtEur(d.frais_consultation)}</span>{' '}
                      {d.frais_statut === 'regle' && <Badge tone="ok">Réglé</Badge>}
                      {d.frais_statut === 'en_attente' && <Badge tone="warn">En attente</Badge>}
                      {d.frais_statut === 'offerts' && <Badge tone="mute">Offerts</Badge>}
                    </>
                  ) : '—'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-500)', marginBottom: 4 }}>Commissions prévues</div>
                <div className="tnum" style={{ fontSize: 14, fontWeight: 600, color: 'var(--brand-800)' }}>{fmtEur(totalCom)} HT</div>
              </div>
            </div>
          </div>
        )}

        {/* Contact */}
        {(d.client?.tel || d.client?.email) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {d.client?.tel && (
              <FactRow label="Téléphone" value={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="Phone" size={13} />{d.client.tel}
                </span>
              } mono />
            )}
            {d.client?.email && (
              <FactRow label="Email" value={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="Mail" size={13} />{d.client.email}
                </span>
              } />
            )}
          </div>
        )}

      </div>
    </div>
  )
}

function FactRow({ label, value, highlight, mono }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div className="eyebrow" style={{ marginBottom: 4 }}>{label}</div>
      <div className={mono ? 'mono clip-1' : 'clip-1'} style={{
        fontSize: highlight ? 18 : 13.5,
        fontWeight: highlight ? 800 : 600,
        color: highlight ? 'var(--brand-800)' : 'var(--ink-900)',
        letterSpacing: highlight ? -0.02 : 0,
      }}>{value}</div>
    </div>
  )
}

function EmptyDetail() {
  return (
    <div className="card" style={{ padding: 40, display: 'grid', placeItems: 'center', textAlign: 'center', color: 'var(--ink-400)' }}>
      <div>
        <Icon name="Folder" size={36} />
        <div style={{ marginTop: 10 }}>Sélectionne un dossier pour voir l'aperçu</div>
      </div>
    </div>
  )
}
