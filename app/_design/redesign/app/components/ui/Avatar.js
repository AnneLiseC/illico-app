// app/components/ui/Avatar.js
// Cercle initiales — couleur de fond paramétrable.
export function Avatar({ name, color, size = 28, ring = false, style }) {
  const initials = (name || '?')
    .split(' ')
    .filter(Boolean)
    .map(s => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'inline-grid',
        placeItems: 'center',
        fontSize: Math.round(size * 0.42),
        fontWeight: 700,
        color: '#fff',
        background: color || 'var(--brand-500)',
        boxShadow: ring ? '0 0 0 2px #fff' : 'none',
        flex: `0 0 ${size}px`,
        ...style,
      }}
    >
      {initials}
    </span>
  )
}

// Couleur stable dérivée d'une string (pour les agentes/clients sans couleur stockée)
const PALETTE = ['#0094d4', '#00578e', '#16a34a', '#f59e0b', '#8b5cf6', '#e11d48', '#0891b2', '#64748b']
export function avatarColor(seed) {
  if (!seed) return PALETTE[0]
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return PALETTE[Math.abs(h) % PALETTE.length]
}
