'use client'
// Zone de texte dont la hauteur suit le contenu (recalculée à chaque frappe) :
// une phrase courte = une ligne, un paragraphe = sa hauteur réelle. Évite les blocs
// fixes trop grands. `rows` (défaut 1) reste la hauteur minimale.
import { useLayoutEffect, useRef } from 'react'

export default function AutoTextarea({ value, style, rows = 1, ...props }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [value])
  return <textarea ref={ref} value={value} rows={rows} style={{ ...style, overflowY: 'hidden', resize: 'none' }} {...props} />
}
