'use client'

import { useEffect } from 'react'

// L19 — neutralise le scroll-molette sur les <input type="number"> (comportement
// natif qui change la valeur par inadvertance, dangereux sur les champs financiers).
// Handler global unique : si la molette survole l'input number ACTUELLEMENT focalisé,
// on le blur → le scroll-to-change natif (qui exige le focus) est annulé, la page
// continue de scroller normalement. Listener PASSIF (pas de preventDefault) → perf OK.
// N'intercepte QUE l'événement wheel : clavier (saisie + flèches ↑↓) et focus intacts.
export default function DisableNumberInputScroll() {
  useEffect(() => {
    const handler = (e) => {
      const el = document.activeElement
      if (el && el.tagName === 'INPUT' && el.type === 'number' && el === e.target) {
        el.blur()
      }
    }
    document.addEventListener('wheel', handler, { passive: true })
    return () => document.removeEventListener('wheel', handler)
  }, [])

  return null
}
