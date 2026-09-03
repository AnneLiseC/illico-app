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
export default function ModalShell({ title, subtitle, onClose, width = 580, maxH, children, footer }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose && onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // HAUTEUR — `vh` ment sur mobile. Sur iOS comme sur Android, 100vh vaut la hauteur
  // de l'écran SANS la barre d'adresse : une carte à 90vh dépasse donc le visible dès
  // que la barre est affichée. `dvh` mesure ce qu'on voit vraiment. `min()` garde un
  // repli utilisable pour les navigateurs qui ignorent `dvh`.
  const hauteurMax = maxH || 'min(90dvh, 92vh)'

  // CENTRAGE — `place-items:center` sur un conteneur qui défile est un piège connu :
  // dès que l'enfant dépasse, le centrage pousse SON HAUT au-dessus de la zone
  // défilable, et ce haut devient inatteignable. On voit du gris, on fait défiler,
  // la modale reste hors de portée — et sur téléphone le bouton « fermer », qui est
  // tout en haut, part avec elle. D'où « un enfer pour sortir de la modale ».
  // `align-items:flex-start` + `margin:auto` fait les deux : centré quand ça tient,
  // atteignable par le haut quand ça déborde.
  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(15,39,68,0.55)', zIndex:200,
      display:'flex', alignItems:'flex-start', justifyContent:'center',
      padding:'20px 20px max(20px, env(safe-area-inset-bottom))',
      overflow:'auto', WebkitOverflowScrolling:'touch',
    }}>
      <div className="card" style={{
        padding:0, maxWidth:width, width:'100%', maxHeight:hauteurMax,
        margin:'auto',   // centre verticalement sans rendre le haut inatteignable
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
