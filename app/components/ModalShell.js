'use client'
import { useEffect } from 'react'

// Coquille de modale PARTAGÉE (source unique) : overlay + carte + en-tête
// (titre / sous-titre / bouton fermer) + zone scrollable + pied optionnel.
// Ferme avec Échap. Centrée, avec padding et scroll → responsive par défaut.
//
// Props :
//   title      : titre (ReactNode)
//   subtitle   : sous-titre optionnel (ReactNode)
//   onClose    : fermeture (bouton ×, Échap)
//   width      : largeur max (nombre px ou chaîne CSS, ex. "min(1400px, 96vw)")
//   maxH       : hauteur max (défaut '90vh')
//   footer     : contenu du pied (boutons), aligné à droite
//   children   : corps
export default function ModalShell({ title, subtitle, onClose, width = 580, maxH = '90vh', children, footer }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose && onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])
  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(15,39,68,0.55)', zIndex:200,
      display:'grid', placeItems:'center', padding:20, overflow:'auto',
    }}>
      <div className="card" style={{
        padding:0, maxWidth:width, width:'100%', maxHeight:maxH,
        overflow:'hidden', display:'flex', flexDirection:'column',
      }}>
        {(title || subtitle) && (
          <div style={{
            padding:'18px 24px', borderBottom:'1px solid var(--ink-200)',
            display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:14,
          }}>
            <div style={{minWidth:0}}>
              {title && <h2 className="page" style={{fontSize:17}}>{title}</h2>}
              {subtitle && <div className="eyebrow" style={{marginTop:4}}>{subtitle}</div>}
            </div>
            {onClose && <button className="btn btn-ghost" style={{padding:'6px 10px', fontSize:16, lineHeight:1}} onClick={onClose} aria-label="Fermer">×</button>}
          </div>
        )}
        <div style={{flex:1, overflow:'auto'}}>{children}</div>
        {footer && (
          <div style={{padding:'14px 24px', borderTop:'1px solid var(--ink-200)', display:'flex', justifyContent:'flex-end', gap:8, flexWrap:'wrap'}}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
