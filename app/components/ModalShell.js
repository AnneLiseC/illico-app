'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

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

  const [monte, setMonte] = useState(false)
  useEffect(() => { setMonte(true) }, [])

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
  // PORTAIL VERS <body> — LE correctif du 14/09.
  //
  // Symptôme rapporté : sur un grand écran, le voile sombre s'arrêtait au milieu et
  // laissait une bande blanche en bas ; sur téléphone, la modale s'ouvrait hors du
  // visible et il fallait faire défiler pour la trouver ; sur tablette, rien à signaler.
  // Trois symptômes, une seule cause.
  //
  // Les modales étaient rendues DANS `<div className="page-enter">`, qui porte une
  // animation de `transform` avec `animation-fill-mode: both`. Une animation qui
  // « remplit » reste en effet après sa fin : l'élément demeure donc un BLOC CONTENEUR
  // pour ses descendants `position: fixed`. `inset: 0` ne désigne alors plus le visible,
  // mais la boîte de la page.
  //
  // Mesuré dans Chromium, voile de `inset:0` à l'intérieur de `.page-enter` :
  //   fenêtre 1600×1200, page de 300 px  → voile haut de 300 px  → bande blanche en bas
  //   fenêtre  390× 780, page de 3000 px → carte à 1150 px du haut → invisible sans défiler
  //   fenêtre 1280× 800, page de  760 px → tout paraît normal
  // C'est exactement ce qui était décrit, machine par machine.
  //
  // Le portail sort la modale de l'arbre de la page et la pose sur `<body>` : plus aucun
  // ancêtre transformé entre elle et le visible. On corrige AUSSI l'animation dans
  // globals.css, mais le portail est la garantie durable : le jour où quelqu'un ajoute
  // un `transform`, un `filter` ou un `contain` sur un conteneur de page, les modales
  // ne se remettront pas à dériver.
  //
  // `monte` : le portail a besoin de `document`, absent au rendu serveur.
  if (!monte) return null

  const contenu = (
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

  return createPortal(contenu, document.body)
}
