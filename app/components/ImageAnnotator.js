'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'

// Éditeur d'annotation de photo (style Archireport) : flèche, rectangle, cercle,
// crayon libre, texte, couleur + épaisseur. Modèle « tracer + annuler / effacer »
// (pas d'objets éditables → aucune dépendance). L'image est chargée via fetch→blob
// (URL same-origin) pour que le canvas ne soit pas « tainté » et que l'export marche.
// onSave reçoit un Blob JPEG aplati (photo + annotations).

const OUTILS = [
  { k: 'fleche',  l: '➘', t: 'Flèche' },
  { k: 'rect',    l: '▭', t: 'Rectangle' },
  { k: 'ellipse', l: '◯', t: 'Cercle' },
  { k: 'crayon',  l: '✎', t: 'Crayon' },
  { k: 'texte',   l: 'T', t: 'Texte' },
  { k: 'gomme',   l: '🧽', t: 'Gomme (efface les annotations)' },
]
const COULEURS = ['#e11d48', '#f59e0b', '#16a34a', '#2563eb', '#ffffff', '#111827']

export default function ImageAnnotator({ src, onSave, onClose, titre = 'Annoter la photo' }) {
  const canvasRef = useRef(null)
  const imgRef = useRef(null)
  const offRef = useRef(null)     // calque hors écran (photo seule) → source de la gomme
  const draftRef = useRef(null)
  const texteRef = useRef(null)   // input texte flottant (focus différé)
  const [pret, setPret] = useState(false)
  const [shapes, setShapes] = useState([])
  const [outil, setOutil] = useState('fleche')
  const [couleur, setCouleur] = useState('#e11d48')
  const [epaisseur, setEpaisseur] = useState(5)
  const [saving, setSaving] = useState(false)
  // Saisie texte : clic sur l'image → champ à cet endroit, puis on tape. { x, y, clientX, clientY, value }
  const [texteInput, setTexteInput] = useState(null)

  const dessinerFleche = (ctx, x0, y0, x1, y1, w) => {
    const head = Math.max(12, w * 3.2)
    const ang = Math.atan2(y1 - y0, x1 - x0)
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x1 - head * Math.cos(ang - Math.PI / 6), y1 - head * Math.sin(ang - Math.PI / 6))
    ctx.lineTo(x1 - head * Math.cos(ang + Math.PI / 6), y1 - head * Math.sin(ang + Math.PI / 6))
    ctx.closePath(); ctx.fill()
  }

  const dessinerShape = useCallback((ctx, s) => {
    ctx.strokeStyle = s.couleur; ctx.fillStyle = s.couleur; ctx.lineWidth = s.epaisseur
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    if (s.type === 'gomme') {
      // Efface les annotations en re-peignant la PHOTO d'origine le long du tracé
      // (calque hors écran). N'altère pas la photo (mêmes pixels), seulement ce
      // qui a été dessiné avant. La gomme est plus large que le trait.
      const off = offRef.current
      if (off && s.points.length) {
        ctx.save()
        ctx.strokeStyle = ctx.createPattern(off, 'no-repeat')
        ctx.lineWidth = Math.max(14, s.epaisseur * 4)
        ctx.beginPath(); s.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
        // point unique (simple clic) : petit trait pour marquer
        if (s.points.length === 1) { const p = s.points[0]; ctx.lineTo(p.x + 0.1, p.y + 0.1) }
        ctx.stroke()
        ctx.restore()
      }
    } else if (s.type === 'crayon') {
      ctx.beginPath(); s.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke()
    } else if (s.type === 'rect') {
      ctx.strokeRect(s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0)
    } else if (s.type === 'ellipse') {
      ctx.beginPath(); ctx.ellipse((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, Math.abs(s.x1 - s.x0) / 2, Math.abs(s.y1 - s.y0) / 2, 0, 0, 2 * Math.PI); ctx.stroke()
    } else if (s.type === 'fleche') {
      dessinerFleche(ctx, s.x0, s.y0, s.x1, s.y1, s.epaisseur)
    } else if (s.type === 'texte') {
      const px = Math.max(20, s.epaisseur * 6)
      ctx.font = `bold ${px}px system-ui, sans-serif`
      ctx.textBaseline = 'top'
      // liseré sombre pour lisibilité sur fond clair
      ctx.lineWidth = Math.max(2, px / 8); ctx.strokeStyle = 'rgba(0,0,0,0.55)'
      ctx.strokeText(s.texte, s.x, s.y); ctx.fillText(s.texte, s.x, s.y)
    }
  }, [])

  const redraw = useCallback((list, draft) => {
    const canvas = canvasRef.current, img = imgRef.current
    if (!canvas || !img) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    for (const s of (draft ? [...list, draft] : list)) dessinerShape(ctx, s)
  }, [dessinerShape])

  // Chargement image (fetch→blob : same-origin, canvas non tainté).
  useEffect(() => {
    let annule = false, objectUrl
    ;(async () => {
      try {
        const blob = await (await fetch(src)).blob()
        if (annule) return
        objectUrl = URL.createObjectURL(blob)
        const img = new Image()
        img.onload = () => {
          if (annule) return
          const canvas = canvasRef.current
          const maxSide = 1600
          const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
          canvas.width = Math.round(img.width * scale)
          canvas.height = Math.round(img.height * scale)
          imgRef.current = img
          // Calque hors écran (photo seule) pour la gomme.
          const off = document.createElement('canvas')
          off.width = canvas.width; off.height = canvas.height
          off.getContext('2d').drawImage(img, 0, 0, off.width, off.height)
          offRef.current = off
          setPret(true)
        }
        img.src = objectUrl
      } catch { /* image inaccessible */ }
    })()
    return () => { annule = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [src])

  useEffect(() => { if (pret) redraw(shapes) }, [pret, shapes, redraw])

  useEffect(() => {
    const h = (e) => {
      const dansChamp = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { if (!dansChamp) { e.preventDefault(); setShapes(s => s.slice(0, -1)) } }
      else if (e.key === 'Escape' && !dansChamp) onClose && onClose()
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const pos = (e) => {
    const canvas = canvasRef.current, rect = canvas.getBoundingClientRect()
    const t = e.touches ? e.touches[0] : e
    return {
      x: (t.clientX - rect.left) * (canvas.width / rect.width),
      y: (t.clientY - rect.top) * (canvas.height / rect.height),
      clientX: t.clientX, clientY: t.clientY,
    }
  }

  const onDown = (e) => {
    if (!pret || texteInput) return
    const p = pos(e)
    // Texte : clic → champ de saisie à cet endroit (le texte se pose en validant).
    if (outil === 'texte') { setTexteInput({ x: p.x, y: p.y, clientX: p.clientX, clientY: p.clientY, value: '' }); return }
    draftRef.current = (outil === 'crayon' || outil === 'gomme')
      ? { type: outil, points: [{ x: p.x, y: p.y }], couleur, epaisseur }
      : { type: outil, x0: p.x, y0: p.y, x1: p.x, y1: p.y, couleur, epaisseur }
    redraw(shapes, draftRef.current)
  }
  const onMove = (e) => {
    if (!draftRef.current) return
    const p = pos(e)
    if (draftRef.current.points) draftRef.current.points.push({ x: p.x, y: p.y })
    else { draftRef.current.x1 = p.x; draftRef.current.y1 = p.y }
    redraw(shapes, draftRef.current)
  }
  const onUp = () => {
    if (!draftRef.current) return
    const d = draftRef.current; draftRef.current = null
    setShapes(s => [...s, d])
  }

  // Focus DIFFÉRÉ du champ texte : au moment du clic, le navigateur redonne le
  // focus au <body> juste après (le canvas n'est pas focusable) → un focus
  // synchrone serait volé. rAF le repousse après ce comportement par défaut.
  useEffect(() => {
    if (!texteInput) return
    const id = requestAnimationFrame(() => texteRef.current && texteRef.current.focus())
    return () => cancelAnimationFrame(id)
  }, [!!texteInput])   // eslint-disable-line react-hooks/exhaustive-deps

  const commitTexte = () => {
    setTexteInput(t => {
      if (t && t.value.trim()) setShapes(s => [...s, { type: 'texte', x: t.x, y: t.y, texte: t.value.trim(), couleur, epaisseur }])
      return null
    })
  }

  const enregistrer = () => {
    // Intègre un texte encore en cours de saisie (setShapes est asynchrone).
    let list = shapes
    if (texteInput && texteInput.value.trim()) {
      list = [...shapes, { type: 'texte', x: texteInput.x, y: texteInput.y, texte: texteInput.value.trim(), couleur, epaisseur }]
      setShapes(list); setTexteInput(null)
    }
    setSaving(true)
    redraw(list)
    canvasRef.current.toBlob(async (blob) => {
      try { if (blob) await onSave(blob) } finally { setSaving(false) }
    }, 'image/jpeg', 0.9)
  }

  const btn = (actif) => ({
    padding: '7px 11px', borderRadius: 8, border: '1px solid',
    borderColor: actif ? 'var(--brand-500)' : 'rgba(255,255,255,0.25)',
    background: actif ? 'var(--brand-600)' : 'rgba(255,255,255,0.08)',
    color: '#fff', cursor: 'pointer', fontSize: 15, fontWeight: 600, lineHeight: 1,
  })

  const contenu = (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 400, display: 'flex', flexDirection: 'column' }}>
      {/* Barre d'outils — toujours visible (flexShrink:0), le canvas prend le reste */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(15,23,42,0.95)', flexWrap: 'wrap', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
        <span style={{ color: '#fff', fontSize: 13, fontWeight: 700, marginRight: 4 }}>{titre}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {OUTILS.map(o => <button key={o.k} title={o.t} onClick={() => setOutil(o.k)} style={btn(outil === o.k)}>{o.l}</button>)}
        </div>
        <div style={{ display: 'flex', gap: 5, marginLeft: 6 }}>
          {COULEURS.map(c => (
            <button key={c} onClick={() => setCouleur(c)} title={c}
              style={{ width: 24, height: 24, borderRadius: '50%', background: c, cursor: 'pointer', border: couleur === c ? '3px solid #fff' : '1px solid rgba(255,255,255,0.3)' }} />
          ))}
        </div>
        <input type="range" min="2" max="14" value={epaisseur} onChange={e => setEpaisseur(Number(e.target.value))} title="Épaisseur" style={{ width: 90 }} />
        <button onClick={() => setShapes(s => s.slice(0, -1))} disabled={!shapes.length} style={{ ...btn(false), opacity: shapes.length ? 1 : 0.4, fontSize: 12 }}>↶ Annuler</button>
        <button onClick={() => setShapes([])} disabled={!shapes.length} style={{ ...btn(false), opacity: shapes.length ? 1 : 0.4, fontSize: 12 }}>Effacer</button>
        <div style={{ flex: 1 }} />
        <button onClick={onClose} style={{ ...btn(false), fontSize: 12 }}>Annuler</button>
        <button onClick={enregistrer} disabled={saving || !pret} className="btn btn-primary" style={{ fontSize: 13 }}>{saving ? 'Enregistrement…' : '✓ Enregistrer'}</button>
      </div>
      {/* Zone canvas */}
      <div style={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', padding: 16, overflow: 'hidden', position: 'relative' }}>
        {!pret && <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>Chargement…</span>}
        <canvas ref={canvasRef}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
          onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
          style={{ maxWidth: '100%', maxHeight: '100%', display: pret ? 'block' : 'none', borderRadius: 8, touchAction: 'none', cursor: outil === 'texte' ? 'text' : 'crosshair', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }} />
        {pret && outil === 'texte' && !texteInput && (
          <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', background: 'rgba(15,23,42,0.9)', color: '#fff', fontSize: 12, padding: '6px 12px', borderRadius: 999, pointerEvents: 'none' }}>
            Cliquez sur l&apos;image à l&apos;endroit du texte, puis tapez
          </div>
        )}
      </div>
      {/* Saisie texte flottante : apparaît à l'endroit cliqué, focus différé. */}
      {texteInput && (
        <input
          ref={texteRef}
          value={texteInput.value}
          onChange={e => setTexteInput(t => ({ ...t, value: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitTexte() } else if (e.key === 'Escape') { e.preventDefault(); setTexteInput(null) } }}
          onBlur={commitTexte}
          placeholder="Tapez, puis Entrée"
          style={{ position: 'fixed', left: Math.min(texteInput.clientX, window.innerWidth - 220), top: Math.min(texteInput.clientY, window.innerHeight - 56), zIndex: 401, fontSize: 14, padding: '6px 10px', borderRadius: 8, border: '2px solid var(--brand-500)', background: '#fff', color: '#111', minWidth: 180 }} />
      )}
    </div>
  )

  // Rendu via portal sur <body> : l'overlay est garanti calé sur la fenêtre,
  // indépendamment de tout ancêtre (transform/contain/overflow) — sinon la barre
  // d'outils et la saisie texte pouvaient se retrouver hors écran.
  return typeof document !== 'undefined' ? createPortal(contenu, document.body) : null
}
