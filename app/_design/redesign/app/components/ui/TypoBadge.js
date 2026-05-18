// app/components/ui/TypoBadge.js
const TYPO_LABELS = {
  courtage: 'Courtage',
  amo: 'AMO',
  estimo: 'Estimo',
  merad: 'MERAD',
  audit_energetique: 'Audit énergétique',
  studio_jardin: 'Studio de jardin',
}

export function typologieLabel(typo) {
  return TYPO_LABELS[typo] || typo
}

export function TypoBadge({ typo }) {
  return (
    <span style={{
      fontSize: 11,
      fontWeight: 600,
      color: 'var(--ink-500)',
      background: '#eef2f7',
      padding: '3px 8px',
      borderRadius: 6,
      letterSpacing: 0.02,
    }}>
      {typologieLabel(typo)}
    </span>
  )
}
