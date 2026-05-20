// app/components/ui/KpiCard.js
import { Icon } from './Icon'

const CORNER_COLORS = {
  brand: 'rgba(0,148,212,0.10)',
  ok:    'rgba(22,163,74,0.10)',
  warn:  'rgba(245,158,11,0.12)',
  bad:   'rgba(220,38,38,0.10)',
}

export function KpiCard({ label, value, sub, tone = 'brand', icon, corner = true, trend, children }) {
  return (
    <div className="card" style={{ position: 'relative', overflow: 'hidden', padding: 22, minHeight: 128 }}>
      {corner && (
        <svg
          viewBox="0 0 80 80"
          aria-hidden
          style={{ position: 'absolute', top: 0, right: 0, width: 80, height: 80, opacity: 0.5, pointerEvents: 'none' }}
        >
          <path d="M0 0 L80 0 L80 80 Z" fill={CORNER_COLORS[tone] || CORNER_COLORS.brand} />
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
          {trend.up ? <Icon name="TrendUp" size={14} /> : <Icon name="TrendDown" size={14} />}
          <span>{trend.label}</span>
        </div>
      )}
    </div>
  )
}
