// app/components/ui/StatutBadge.js
import { STATUT_CONFIG, calcStatut } from '../../lib/dossiers'
import { Badge } from './Badge'

// Mapping STATUT_CONFIG → Badge tones
const TONES = {
  a_contacter:       'info',
  a_relancer:        'warn',
  devis_en_attente:  'warn',
  devis_a_modifier:  'bad',
  en_cours_chantier: 'ok',
  termine:           'mute',
  annule:            'mute',
}

export function StatutBadge({ statut, dossier }) {
  const s = statut || (dossier ? calcStatut(dossier) : null)
  if (!s) return null
  const cfg = STATUT_CONFIG[s]
  if (!cfg) return null
  return <Badge tone={TONES[s] || 'mute'}>{cfg.label}</Badge>
}
