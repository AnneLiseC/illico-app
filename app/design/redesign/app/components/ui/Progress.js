// app/components/ui/Progress.js
export function Progress({ value = 0, tone, height = 6, showLabel = false }) {
  const pct = Math.max(0, Math.min(100, value || 0))
  const t = tone || (pct >= 100 ? 'ok' : pct >= 70 ? '' : pct >= 40 ? 'warn' : 'bad')
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <div className={`progress ${t}`} style={{ flex: 1, height }}>
        <span style={{ width: `${pct}%` }} />
      </div>
      {showLabel && (
        <span className="tnum" style={{ fontSize: 11, color: 'var(--ink-500)', fontWeight: 600, minWidth: 32, textAlign: 'right' }}>
          {Math.round(pct)}%
        </span>
      )}
    </div>
  )
}
