'use client'
// Gantt des lots/sous-lots (Lot 4-1 du module CR). Rendu via frappe-gantt (vanilla JS,
// compatible React 19 — pas de wrapper React tiers). Le CSS de la lib est inliné dans
// app/globals.css (le champ "exports" du paquet bloque l'import du sous-chemin CSS).
//
// Édition par glisser-déposer : on remonte les nouvelles dates via onDateChange(lotId, {date_debut, date_fin}).
// Seuls les lots qui ont date_debut ET date_fin apparaissent (frappe-gantt exige start+end).
import { useEffect, useRef } from 'react'
import Gantt from 'frappe-gantt'

// Date JS -> 'YYYY-MM-DD' (local, sans décalage UTC).
function iso(d) {
  if (!d) return null
  const dt = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(dt.getTime())) return null
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const j = String(dt.getDate()).padStart(2, '0')
  return `${dt.getFullYear()}-${m}-${j}`
}

const MODES = ['Day', 'Week', 'Month']

export default function GanttLots({ lots, onDateChange, viewMode = 'Week' }) {
  const conteneurRef = useRef(null)
  const ganttRef = useRef(null)
  // Callback dans une ref : évite de reconstruire le Gantt à chaque re-render du parent.
  const cbRef = useRef(onDateChange)
  useEffect(() => { cbRef.current = onDateChange }, [onDateChange])

  useEffect(() => {
    const el = conteneurRef.current
    if (!el) return

    // parent_lot_id -> préfixe visuel « ↳ » pour les sous-lots.
    const parents = new Set(lots.filter(l => !l.parent_lot_id).map(l => l.id))
    const taches = (lots || [])
      .filter(l => l.date_debut && l.date_fin)
      .map(l => ({
        id: String(l.id),
        name: (l.parent_lot_id ? '↳ ' : '') + (l.nom || 'Lot'),
        start: iso(l.date_debut),
        end: iso(l.date_fin),
        progress: Math.max(0, Math.min(100, Number(l.avancement) || 0)),
        custom_class: parents.has(l.parent_lot_id) ? 'bar-sous-lot' : '',
      }))

    el.innerHTML = ''
    if (!taches.length) {
      ganttRef.current = null
      return
    }

    try {
      ganttRef.current = new Gantt(el, taches, {
        view_mode: viewMode,
        date_format: 'YYYY-MM-DD',
        language: 'fr',
        readonly_progress: true,
        popup_on: 'hover',
        on_date_change: (task, start, end) => {
          const maj = { date_debut: iso(start), date_fin: iso(end) }
          cbRef.current?.(task.id, maj)
        },
      })
    } catch (e) {
      console.error('[GanttLots]', e)
      el.innerHTML = '<div style="padding:16px;color:var(--ink-500);font-size:13px">Impossible d’afficher le planning.</div>'
    }

    return () => { if (el) el.innerHTML = '' }
  }, [lots, viewMode])

  const nbAffichables = (lots || []).filter(l => l.date_debut && l.date_fin).length

  return (
    <div>
      {nbAffichables === 0 ? (
        <div className="card" style={{ padding: 20, textAlign: 'center', color: 'var(--ink-500)', fontSize: 13 }}>
          Renseigne des dates de début et de fin sur tes lots pour voir le planning.
        </div>
      ) : (
        <div ref={conteneurRef} className="gantt-lots" style={{ overflowX: 'auto' }} />
      )}
    </div>
  )
}
