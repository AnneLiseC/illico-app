// app/components/ui/Badge.js
export function Badge({ tone = 'mute', children, dot = true, className = '' }) {
  const cls = {
    ok: 'badge-ok', warn: 'badge-warn', bad: 'badge-bad',
    mute: 'badge-mute', info: 'badge-info', brand: 'badge-brand'
  }[tone] || 'badge-mute'
  return (
    <span className={`badge ${cls} ${className}`}>
      {dot && <span className="dot" />}
      {children}
    </span>
  )
}
