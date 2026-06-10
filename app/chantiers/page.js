'use client'
import { Suspense, useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '../lib/auth-context'
import { getDossiersByScope, getFilteredDossiers, getCompteurs, calcStatut, calculerAvancement, STATUT_CONFIG } from '../lib/dossiers'
import { calculateDossierFinance } from '../lib/finance'
import { Avatar, StatutBadge, TypoBadge, Badge, Progress, MiniMeta } from '../components/shared'
import ModaleChoixClient from '../components/ModaleChoixClient'

/* ── Inline SVG icons ── */
function Svg({ size = 16, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}
const FolderIcon   = ({ size = 16 }) => <Svg size={size}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></Svg>
const SearchIcon   = ({ size = 16 }) => <Svg size={size}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></Svg>
const EyeIcon      = ({ size = 16 }) => <Svg size={size}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></Svg>
const PhoneIcon    = ({ size = 16 }) => <Svg size={size}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.38 2 2 0 0 1 3.58 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.54a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></Svg>
const MailIcon     = ({ size = 16 }) => <Svg size={size}><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="2,4 12,13 22,4"/></Svg>
const MoreIcon     = ({ size = 16 }) => <Svg size={size}><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></Svg>
const ClockIcon    = ({ size = 16 }) => <Svg size={size}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></Svg>
const CalendarIcon = ({ size = 16 }) => <Svg size={size}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></Svg>
const EuroIcon     = ({ size = 16 }) => <Svg size={size}><path d="M14 2H10a8 8 0 0 0 0 16h4"/><line x1="3" y1="9" x2="15" y2="9"/><line x1="3" y1="15" x2="15" y2="15"/></Svg>
const FilterIcon   = ({ size = 16 }) => <Svg size={size}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></Svg>
const CheckIcon    = ({ size = 16 }) => <Svg size={size}><polyline points="20 6 9 17 4 12"/></Svg>
const HammerIcon   = ({ size = 16 }) => <Svg size={size}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></Svg>
const DocIcon      = ({ size = 16 }) => <Svg size={size}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></Svg>
const PlusIcon     = ({ size = 16 }) => <Svg size={size}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></Svg>
const ChevronDown  = ({ size = 16 }) => <Svg size={size}><polyline points="6 9 12 15 18 9"/></Svg>
const PinIcon      = ({ size = 16 }) => <Svg size={size}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></Svg>

/* ── Helpers ── */
const fmtEur  = (n) => Math.round(n || 0).toLocaleString('fr-FR') + ' €'
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '—'
const villeFromAddr = (addr) => {
  if (!addr) return '—'
  const parts = addr.split(',')
  return parts[parts.length - 1]?.trim() || addr
}
const nomClient = (c) => c
  ? `${c.civilite || ''} ${c.prenom} ${c.nom}${c.prenom2 ? ` & ${c.prenom2} ${c.nom2}` : ''}`.trim()
  : '—'

const TYPOLOGIES = {
  courtage: 'Courtage', amo: 'AMO', estimo: 'Estimo',
  merad: 'MERAD', audit_energetique: 'Audit énergétique', studio_jardin: 'Studio de jardin',
}

/* ── FactRow ── */
function FactRow({ label, value, highlight, mono }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div className="eyebrow" style={{ marginBottom: 4 }}>{label}</div>
      <div className={`clip-1${mono ? ' mono' : ''}`} style={{
        fontSize: highlight ? 18 : 13.5, fontWeight: highlight ? 800 : 600,
        color: highlight ? 'var(--brand-800)' : 'var(--ink-900)',
        letterSpacing: highlight ? -0.02 : 0,
      }}>
        {value}
      </div>
    </div>
  )
}

/* ── Colonne liste ── */
function ChantiersList({ items, selectedId, onSelect, aujourdhui, isMobile }) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: isMobile ? 'auto' : '100%' }}>
      <div style={{ padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--ink-200)', flexShrink: 0 }}>
        <div className="eyebrow">{items.length} résultats</div>
        <div style={{ display: 'flex', gap: 6, fontSize: 11, color: 'var(--ink-500)', alignItems: 'center' }}>
          Tri : <strong style={{ color: 'var(--ink-700)' }}>Plus récent</strong>
          <ChevronDown size={12} />
        </div>
      </div>
      <div style={{ overflowY: isMobile ? 'visible' : 'auto', flex: 1, padding: '8px 12px' }}>
        {items.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-400)', fontSize: 13 }}>Aucun dossier</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map(d => {
            const s        = calcStatut(d)
            const limite   = d.date_limite_devis ? new Date(d.date_limite_devis) : null
            const diff     = limite ? Math.round((limite - aujourdhui) / 86400000) : null
            const urgent   = diff !== null && diff <= 7 && diff >= 0
            const enRetard = diff !== null && diff < 0 && !['termine', 'annule'].includes(s)
            const isSel    = d.id === selectedId
            return (
              <button key={d.id} onClick={() => onSelect(d.id)}
                className={!isSel ? 'row-hover' : ''}
                style={{
                  textAlign: 'left', padding: '14px 14px', borderRadius: 12,
                  border: '1px solid', borderColor: isSel ? 'var(--brand-500)' : 'transparent',
                  background: isSel ? 'var(--brand-50)' : 'transparent',
                  boxShadow: isSel ? '0 0 0 3px rgba(0,148,212,0.10)' : 'none',
                  transition: 'all 150ms ease', position: 'relative',
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <span className="mono" style={{ fontSize: 11.5, color: 'var(--brand-800)', fontWeight: 700, letterSpacing: 0.02 }}>{d.reference}</span>
                      <TypoBadge typo={d.typologie} />
                    </div>
                    <div className="clip-1" style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-900)', letterSpacing: -0.01 }}>
                      {nomClient(d.client)}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                      <PinIcon size={12} />
                      <span className="clip-1" style={{ minWidth: 0 }}>{villeFromAddr(d.client?.adresse)}</span>
                    </div>
                  </div>
                  <StatutBadge statut={s} />
                </div>
                {(() => {
                  const av = calculerAvancement(d)
                  return s === 'en_cours_chantier' && av > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: 'var(--ink-500)' }}>Avancement</span>
                        <span className="tnum" style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand-800)' }}>{av}%</span>
                      </div>
                      <Progress value={av} height={4} />
                    </div>
                  )
                })()}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, gap: 10 }}>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                    {limite ? (
                      <MiniMeta icon={<ClockIcon size={12} />} mute={!urgent && !enRetard}>
                        <span style={{ color: enRetard ? '#b91c1c' : urgent ? '#a16207' : undefined, fontWeight: enRetard || urgent ? 700 : 500 }}>
                          {enRetard ? `retard ${Math.abs(diff)}j` : urgent ? `J-${diff}` : fmtDate(d.date_limite_devis)}
                        </span>
                      </MiniMeta>
                    ) : d.date_fin_chantier ? (
                      <MiniMeta icon={<CalendarIcon size={12} />}>Fin {fmtDate(d.date_fin_chantier)}</MiniMeta>
                    ) : null}
                    {(() => {
                      const ttc = (d.devis_artisans || []).filter(dv => dv.statut === 'accepte').reduce((s, dv) => s + (dv.montant_ttc || 0), 0)
                      return ttc > 0 ? (
                        <MiniMeta icon={<EuroIcon size={12} />}>
                          <span className="tnum" style={{ fontWeight: 600, color: 'var(--ink-700)' }}>{fmtEur(ttc)}</span>
                        </MiniMeta>
                      ) : null
                    })()}
                  </div>
                  {d.referente && (
                    <Avatar name={`${d.referente.prenom} ${d.referente.nom}`} size={24} />
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

/* ── Aperçu latéral ── */
function ChantierPreview({ d, onOpen, onBack, isMobile }) {
  if (!d) return (
    <div className="card" style={{ display: 'grid', placeItems: 'center', textAlign: 'center', color: 'var(--ink-400)' }}>
      <div>
        <FolderIcon size={36} />
        <div style={{ marginTop: 10, fontSize: 13 }}>Sélectionne un dossier pour voir l'aperçu</div>
      </div>
    </div>
  )

  const s                  = calcStatut(d)
  const devisArtisans      = d.devis_artisans || []
  const devisAcceptes      = devisArtisans.filter(dv => dv.statut === 'accepte')
  const totalDevisTTCSignes = devisAcceptes.reduce((sum, dv) => sum + (dv.montant_ttc || 0), 0)
  const avancement         = calculerAvancement(d)
  const sf                 = d.suivi_financier || []
  const acomptesTotal      = devisAcceptes.length
  const acomptesRecus      = devisAcceptes.filter(dv => sf.find(x =>
    x.type_echeance === 'acompte_artisan' &&
    x.artisan_id === (dv.artisan_id || dv.artisan?.id) &&
    x.statut_illico === 'recu')).length
  const facturesTotal      = devisAcceptes.length
  const facturesPayees     = devisAcceptes.filter(dv => sf.find(x =>
    x.type_echeance === 'facture_finale' &&
    x.artisan_id === (dv.artisan_id || dv.artisan?.id) &&
    x.statut_illico === 'recu')).length
  const commissionsHT      = calculateDossierFinance(d).commissions.comHT

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: isMobile ? 'auto' : '100%' }}>
      {onBack && (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--ink-200)', flexShrink: 0 }}>
          <button className="btn btn-ghost" onClick={onBack} style={{ fontSize: 12, padding: '4px 10px' }}>← Retour à la liste</button>
        </div>
      )}

      {/* Header */}
      <div style={{ padding: '18px 22px 16px', borderBottom: '1px solid var(--ink-200)', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ position: 'absolute', top: 0, right: 0, width: 160, height: 80, background: 'linear-gradient(135deg, rgba(0,148,212,0.10), rgba(0,148,212,0))', pointerEvents: 'none', borderRadius: '0 var(--radius) 0 100%' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <span className="mono" style={{ fontSize: 12, color: 'var(--brand-800)', fontWeight: 700 }}>{d.reference}</span>
              <TypoBadge typo={d.typologie} />
            </div>
            <h2 className="page" style={{ fontSize: 22, letterSpacing: -0.02 }}>{nomClient(d.client)}</h2>
            <div style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <PinIcon size={13} />{d.client?.adresse}
            </div>
          </div>
          <StatutBadge statut={s} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => onOpen(d.id)}>
            <EyeIcon size={14} /> Ouvrir dossier
          </button>
          {d.client?.telephone && (
            <a href={`tel:${d.client.telephone}`} className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }}>
              <PhoneIcon size={14} /> Appeler
            </a>
          )}
          {d.client?.email && (
            <a href={`mailto:${d.client.email}`} className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }}>
              <MailIcon size={14} /> Email
            </a>
          )}
          <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 8px', marginLeft: 'auto' }}><MoreIcon size={14} /></button>
        </div>
      </div>

      {/* Body scrollable */}
      <div style={{ flex: 1, overflowY: isMobile ? 'visible' : 'auto', padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        {/* Quick facts */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {totalDevisTTCSignes > 0 && <FactRow label="Montant chantier" value={fmtEur(totalDevisTTCSignes)} highlight />}
          <FactRow label="Contrat signé" value={d.contrat_signe
            ? <span style={{ color: '#15803d', fontWeight: 600, display: 'inline-flex', gap: 5, alignItems: 'center' }}><CheckIcon size={14} /> {fmtDate(d.date_signature_contrat)}</span>
            : <span style={{ color: '#b91c1c' }}>Non signé</span>}
          />
          {d.referente && (
            <FactRow label="Référente" value={
              <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <Avatar name={`${d.referente.prenom} ${d.referente.nom}`} size={20} />
                {d.referente.prenom} {d.referente.nom}
              </span>
            } />
          )}
        </div>

        {/* Description */}
        {d.description && (
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Descriptif</div>
            <p style={{ fontSize: 13.5, color: 'var(--ink-700)', lineHeight: 1.55, margin: 0 }}>{d.description}</p>
          </div>
        )}


        {/* Avancement + dates */}
        {(d.date_demarrage_chantier || d.date_fin_chantier || s === 'en_cours_chantier') && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
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
        {devisArtisans.length > 0 && (
          <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Artisans · {devisAcceptes.length} signés</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {devisArtisans.map(dv => (
                <div key={dv.id} style={{
                  display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'center',
                  padding: '10px 12px', borderRadius: 10, border: '1px solid var(--ink-200)',
                }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--brand-50)', color: 'var(--brand-800)', display: 'grid', placeItems: 'center' }}>
                    <HammerIcon size={16} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="clip-1" style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-900)' }}>{dv.artisan?.entreprise || '—'}</div>
                    {dv.artisan?.metier && (
                      <div style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 1 }}>{dv.artisan.metier}{dv.artisan.ville ? ` · ${dv.artisan.ville}` : ''}</div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {dv.montant_ttc > 0 && <div className="tnum" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-900)' }}>{fmtEur(dv.montant_ttc)}</div>}
                    <div style={{ marginTop: 3 }}>
                      {dv.statut === 'accepte'    && <Badge tone="ok">Signé</Badge>}
                      {dv.statut === 'recu'       && <Badge tone="info">Reçu</Badge>}
                      {dv.statut === 'a_modifier' && <Badge tone="warn">À modifier</Badge>}
                      {dv.statut === 'refuse'     && <Badge tone="bad">Refusé</Badge>}
                      {dv.statut === 'en_attente' && <Badge tone="mute">En attente</Badge>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Suivi financier */}
        {devisAcceptes.length > 0 && (
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--ink-200)', borderRadius: 12, padding: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Suivi financier</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-500)', marginBottom: 4 }}>Acomptes reçus</div>
                <div className="tnum" style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink-900)' }}>{acomptesRecus} / {acomptesTotal}</div>
                {acomptesTotal > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <Progress value={acomptesRecus / acomptesTotal * 100} height={4} />
                  </div>
                )}
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-500)', marginBottom: 4 }}>Factures payées</div>
                <div className="tnum" style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink-900)' }}>{facturesPayees} / {facturesTotal}</div>
                {facturesTotal > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <Progress value={facturesPayees / facturesTotal * 100} height={4} />
                  </div>
                )}
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-500)', marginBottom: 4 }}>Frais consultation</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-700)' }}>
                  {d.frais_consultation > 0 ? (
                    <>
                      <span className="tnum">{fmtEur(d.frais_consultation)}</span>{' '}
                      {d.frais_statut === 'regle'      && <Badge tone="ok">Réglé</Badge>}
                      {d.frais_statut === 'en_attente' && <Badge tone="warn">En attente</Badge>}
                      {d.frais_statut === 'offerts'    && <Badge tone="mute">Offerts</Badge>}
                    </>
                  ) : '—'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-500)', marginBottom: 4 }}>Commissions prévues</div>
                <div className="tnum" style={{ fontSize: 14, fontWeight: 600, color: 'var(--brand-800)' }}>{fmtEur(commissionsHT)} HT</div>
              </div>
            </div>
          </div>
        )}

        {/* Contact */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {d.client?.telephone && (
            <FactRow label="Téléphone" mono value={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <PhoneIcon size={13} />{d.client.telephone}
              </span>
            } />
          )}
          {d.client?.email && (
            <FactRow label="Email" value={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <MailIcon size={13} />{d.client.email}
              </span>
            } />
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Page ── */
export default function Chantiers() {
  return (
    <Suspense fallback={<div className="page-loading" />}>
      <ChantiersInner />
    </Suspense>
  )
}

function ChantiersInner() {
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
  const [modaleClient, setModaleClient] = useState(false)
  const router        = useRouter()
  const searchParams  = useSearchParams()
  const { user, profile, initialized, agenceActive } = useAuth()

  useEffect(() => {
    if (searchParams.get('nouveau') === '1') {
      setModaleClient(true)
      router.replace('/chantiers')
    }
  }, [searchParams, router])

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
      .select('*, client:clients(civilite, prenom, nom, prenom2, nom2, adresse, telephone, email), referente:profiles!dossiers_referente_id_fkey(id, prenom, nom, role), devis_artisans(id, statut, montant_ht, montant_ttc, commission_pourcentage, artisan_id, artisan:artisans(id, entreprise, metier, ville)), comptes_rendus(id, type_visite), suivi_financier(type_echeance, montant_ttc, statut_illico, statut_client, artisan_id)')
      .eq('archive', false)
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

  const isAdmin = profile?.role === 'admin'

  // Scoping multi-agence (UX, pas sécurité — RLS reste la frontière) :
  // agenceActive null = tout ; uuid = seulement cette agence. Filtrage en mémoire,
  // SOURCE des dérivés (liste + compteurs) pour qu'ils restent cohérents.
  const dossiersScoped = useMemo(
    () => (agenceActive ? dossiers.filter(d => d.agence_id === agenceActive) : dossiers),
    [dossiers, agenceActive]
  )

  const dossiersFiltresOnglet = getDossiersByScope(dossiersScoped, profile, onglet, agentes)
  const dossiersFiltres       = getFilteredDossiers(dossiersFiltresOnglet, recherche, filtreStatut, filtreTypo, nomClient)
  const compteurs             = getCompteurs(dossiersFiltresOnglet)
  const aujourdhui            = new Date()

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

  const ongletsList = isAdmin ? [
    { key: 'moi', label: 'Mes chantiers' },
    ...agentes.map(a => ({ key: a.id, label: `${a.prenom} ${a.nom}` })),
    { key: 'tous', label: 'Tous' },
  ] : []

  if (loading) return <div className="page-loading" />

  const panelHeight = 'calc(100vh - 340px)' /* desktop only — mobile uses natural page flow */

  return (
    <div className="page-enter page-pad" style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1400, margin: '0 auto' }}>

      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Pilotage</div>
          <h1 className="page">Chantiers</h1>
          <div style={{ color: 'var(--ink-500)', fontSize: 13, marginTop: 6 }}>
            {dossiersFiltres.length} dossiers · {compteurs.enChantier} actifs · {compteurs.enDevis} en devis
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost"><DocIcon size={16} /> Exporter</button>
          <button className="btn btn-primary" onClick={() => setModaleClient(true)}>
            <PlusIcon size={16} /> Nouveau chantier
          </button>
        </div>
      </div>

      {/* Scope tabs (admin uniquement) */}
      {isAdmin && (
        <div className="tabs" style={{ overflowX: 'auto' }}>
          {ongletsList.map(({ key, label }) => (
            <button key={key} className={`tab ${onglet === key ? 'active' : ''}`}
              onClick={() => setOnglet(key)} style={{ whiteSpace: 'nowrap' }}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* KPI strip */}
      <div className="kpi-grid">
        {[
          { label: 'À traiter',   value: compteurs.aTraiter,   tone: 'info' },
          { label: 'En devis',    value: compteurs.enDevis,    tone: 'warn' },
          { label: 'En chantier', value: compteurs.enChantier, tone: 'ok' },
          { label: 'Terminés',    value: compteurs.termines,   tone: 'mute' },
        ].map(k => {
          const tc = {
            info: { bg: 'rgba(0,148,212,0.12)',   color: '#0078ad' },
            warn: { bg: 'rgba(245,158,11,0.13)',  color: '#a16207' },
            ok:   { bg: 'rgba(22,163,74,0.10)',   color: '#15803d' },
            mute: { bg: 'rgba(148,163,184,0.15)', color: '#475569' },
          }[k.tone]
          return (
            <div key={k.label} className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div className="eyebrow">{k.label}</div>
                <div className="tnum" style={{ fontSize: 28, fontWeight: 800, color: 'var(--brand-800)', marginTop: 4, letterSpacing: -0.02 }}>{k.value}</div>
              </div>
              <span style={{ width: 36, height: 36, borderRadius: 10, background: tc.bg, color: tc.color, display: 'grid', placeItems: 'center' }}>
                <FolderIcon size={18} />
              </span>
            </div>
          )
        })}
      </div>

      {/* Filtres */}
      <div className="card" style={{ padding: '14px 16px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: isMobile ? '100%' : 240 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-400)', pointerEvents: 'none' }}>
            <SearchIcon size={16} />
          </span>
          <input className="input" placeholder="Rechercher référence, client, adresse…"
            value={recherche} onChange={e => setRecherche(e.target.value)}
            style={{ paddingLeft: 36, width: '100%', height: 40 }} />
        </div>
        <select className="input" value={filtreStatut} onChange={e => setFiltreStatut(e.target.value)}
          style={{ height: 40, minWidth: 170 }}>
          <option value="tous">Tous les statuts</option>
          {Object.entries(STATUT_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="input" value={filtreTypo} onChange={e => setFiltreTypo(e.target.value)}
          style={{ height: 40, minWidth: 160 }}>
          <option value="tous">Toutes typologies</option>
          {Object.entries(TYPOLOGIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="btn btn-ghost" style={{ height: 40 }}><FilterIcon size={14} /> Plus de filtres</button>
      </div>

      {/* Grille liste + aperçu */}
      {isMobile ? (
        <div>
          {!showPreview
            ? <ChantiersList items={dossiersFiltres} selectedId={selected?.id} onSelect={handleSelect} aujourdhui={aujourdhui} isMobile />
            : <ChantierPreview d={selected} onOpen={(id) => router.push(`/chantiers/${id}`)} onBack={() => setShowPreview(false)} isMobile />
          }
        </div>
      ) : (
        <div className="grid-list" style={{ height: panelHeight }}>
          <ChantiersList items={dossiersFiltres} selectedId={selected?.id} onSelect={handleSelect} aujourdhui={aujourdhui} />
          <ChantierPreview d={selected} onOpen={(id) => router.push(`/chantiers/${id}`)} />
        </div>
      )}

      <ModaleChoixClient open={modaleClient} onClose={() => setModaleClient(false)} />

    </div>
  )
}
