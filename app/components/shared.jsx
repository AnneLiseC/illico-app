'use client'
import { STATUT_CONFIG, calcStatut } from '../lib/dossiers'

const STATUT_TONES = {
  a_contacter:       'info',
  a_relancer:        'warn',
  devis_en_attente:  'warn',
  devis_a_modifier:  'bad',
  en_cours_chantier: 'ok',
  termine:           'mute',
  annule:            'mute',
}

const TYPOLOGIES = {
  courtage:          'Courtage',
  amo:               'AMO',
  estimo:            'Estimo',
  merad:             'MERAD',
  audit_energetique: 'Audit énergétique',
  studio_jardin:     'Studio de jardin',
}

function TrendUp() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
      <polyline points="17 6 23 6 23 12"/>
    </svg>
  )
}
function TrendDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/>
      <polyline points="17 18 23 18 23 12"/>
    </svg>
  )
}

export function Badge({ tone = 'mute', children, dot = true, className = '' }) {
  const cls = {
    ok: 'badge-ok', warn: 'badge-warn', bad: 'badge-bad',
    mute: 'badge-mute', info: 'badge-info', brand: 'badge-brand',
  }[tone] || 'badge-mute'
  return (
    <span className={`badge ${cls} ${className}`}>
      {dot && <span className="dot" />}
      {children}
    </span>
  )
}

export function StatutBadge({ statut, dossier }) {
  const s = statut || (dossier ? calcStatut(dossier) : null)
  if (!s) return null
  const cfg = STATUT_CONFIG[s]
  if (!cfg) return null
  return <Badge tone={STATUT_TONES[s] || 'mute'}>{cfg.label}</Badge>
}

export function TypoBadge({ typo }) {
  const label = TYPOLOGIES[typo] || typo
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, color: 'var(--ink-500)',
      background: '#eef2f7', padding: '3px 8px', borderRadius: 6,
      letterSpacing: 0.02,
    }}>
      {label}
    </span>
  )
}

export function Avatar({ name, color, size = 28, ring = false }) {
  const initials = name?.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase() || '?'
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%',
      display: 'inline-grid', placeItems: 'center',
      fontSize: Math.round(size * 0.42), fontWeight: 700,
      color: '#fff', background: color || 'var(--brand-500)',
      boxShadow: ring ? '0 0 0 2px #fff' : 'none',
      flex: `0 0 ${size}px`,
    }}>
      {initials}
    </span>
  )
}

export function KpiCard({ label, value, sub, tone = 'brand', icon, corner = true, trend, children }) {
  const cornerColor = {
    brand: 'rgba(0,148,212,0.10)',
    ok:    'rgba(22,163,74,0.10)',
    warn:  'rgba(245,158,11,0.12)',
    bad:   'rgba(220,38,38,0.10)',
  }[tone]
  return (
    <div className="card kpi" style={{ minHeight: 128 }}>
      {corner && (
        <svg className="kpi-corner" viewBox="0 0 80 80" aria-hidden="true">
          <path d="M0 0 L80 0 L80 80 Z" fill={cornerColor} />
        </svg>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, position: 'relative' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>{label}</div>
          <div className="big-num tnum">{value}</div>
          {sub && <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 8 }}>{sub}</div>}
          {children}
        </div>
        {icon && (
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'rgba(0,87,142,0.08)', color: 'var(--brand-800)',
            display: 'grid', placeItems: 'center', flex: '0 0 36px',
          }}>
            {icon}
          </div>
        )}
      </div>
      {trend && (
        <div style={{
          marginTop: 10, display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 12, color: trend.up ? '#15803d' : '#b91c1c', fontWeight: 600,
        }}>
          {trend.up ? <TrendUp /> : <TrendDown />}
          <span>{trend.label}</span>
        </div>
      )}
    </div>
  )
}

export function Progress({ value = 0, tone, height = 6, showLabel = false }) {
  const pct = Math.max(0, Math.min(100, value))
  const t = tone || (pct >= 100 ? 'ok' : pct >= 70 ? '' : pct >= 40 ? 'warn' : 'bad')
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <div className={`progress ${t}`} style={{ flex: 1, height }}>
        <span style={{ width: `${pct}%` }} />
      </div>
      {showLabel && (
        <span className="tnum" style={{
          fontSize: 11, color: 'var(--ink-500)', fontWeight: 600,
          minWidth: 32, textAlign: 'right',
        }}>
          {pct}%
        </span>
      )}
    </div>
  )
}

export function MiniMeta({ icon, children, mute = true }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 12, color: mute ? 'var(--ink-500)' : 'var(--ink-700)', fontWeight: 500,
    }}>
      {icon}{children}
    </span>
  )
}

export function Section({ title, action, children, dense, style }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0, ...(style || {}) }}>
      {(title || action) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          {title && <h2 className="page" style={{ fontSize: dense ? 15 : 18 }}>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <span className="eyebrow">{label}</span>
      {children}
    </label>
  )
}
