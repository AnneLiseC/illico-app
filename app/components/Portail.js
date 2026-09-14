'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

// Pose son contenu sur <body>, hors de l'arbre de la page.
//
// ═══════════════════════════════════════════════════════════════════════════════════════
// POURQUOI CE COMPOSANT EXISTE (14/09)
//
// Tout élément en `position: fixed` rendu à l'intérieur d'un ancêtre TRANSFORMÉ cesse
// d'être positionné par rapport au visible : il l'est par rapport à cet ancêtre. C'est
// une règle CSS, pas un bug de navigateur.
//
// Or chaque page de BATILIS est enveloppée dans `<div className="page-enter">`, qui porte
// une animation de `transform`. Conséquence mesurée dans Chromium sur un voile `inset: 0` :
//
//   fenêtre 1600×1200, page de  300 px → voile haut de 300 px    → bande blanche en bas
//   fenêtre  390× 780, page de 3000 px → carte à 1150 px du haut → hors champ, il faut défiler
//   fenêtre 1280× 800, page de  760 px → tout paraît normal
//
// Trois symptômes très différents, une seule cause, et celui du milieu ne se voit que sur
// téléphone : c'est ce qui a rendu le diagnostic si long.
//
// L'animation a été corrigée dans globals.css, mais ça ne suffit pas comme garantie : il
// suffira d'un `transform`, d'un `filter`, d'un `contain` ou d'un `will-change` posé un
// jour sur un conteneur de page pour que tout recommence, silencieusement, et seulement
// sur certaines tailles d'écran. Le portail, lui, ferme la question définitivement.
//
// ═══════════════════════════════════════════════════════════════════════════════════════
// QUAND S'EN SERVIR
//
// Pour TOUT ce qui se positionne par rapport au visible : voiles de modale, visionneuses
// plein écran, et menus contextuels placés aux coordonnées de la souris — ces derniers
// sont touchés exactement de la même façon, ils s'ouvrent décalés.
//
// Les modales bâties sur ModalShell n'en ont pas besoin : la coquille porte déjà son
// propre portail.
//
// `monte` : `createPortal` a besoin de `document`, absent au rendu serveur. Tant qu'on
// n'est pas monté côté navigateur, on ne rend rien — une modale n'a de toute façon rien
// à faire dans le HTML initial.
// ═══════════════════════════════════════════════════════════════════════════════════════
export default function Portail({ children }) {
  const [monte, setMonte] = useState(false)
  useEffect(() => { setMonte(true) }, [])
  if (!monte) return null
  return createPortal(children, document.body)
}
