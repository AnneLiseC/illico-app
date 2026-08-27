'use client'
// Gantt intégré (Lot 4-9) : arbre Lots/Sous-lots ÉDITABLE à gauche + timeline frappe-gantt à
// droite, alignés ligne par ligne. Remplace l'ancien « Gérer les lots » séparé : la donnée est
// saisie une seule fois, ici. frappe-gantt gère la timeline (glisser, flèches, ligne aujourd'hui) ;
// l'arbre gère l'édition (nom, artisan, dates, durée en jours ouvrés, dépendances, %).
//
// Alignement : hauteur de ligne = bar_height + padding ; l'en-tête de l'arbre est calé sur la
// hauteur réelle de l'en-tête du gantt (mesurée après rendu). Le conteneur externe scrolle
// verticalement les DEUX ensemble ; la timeline ne scrolle qu'horizontalement.
import { useEffect, useRef, useState, useMemo } from 'react'
import Gantt from 'frappe-gantt'
import { dureeJours, finApresJours } from '../../lib/joursOuvres'

const BAR = 30, PAD = 18, PITCH = BAR + PAD
// Le planning montre toujours au moins jusqu'à aujourd'hui + 4 semaines (voir fenêtre forcée).
const FUTUR_JOURS = 28
const VUES = [['fit', 'Vue ajustée'], ['Day', 'Jours'], ['Week', 'Semaines'], ['Month', 'Mois'], ['Year', 'Années']]

function iso(d) {
  if (!d) return null
  const dt = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(dt.getTime())) return null
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
// « fit » : choisit l'échelle selon l'étendue totale.
function modeAjuste(rows) {
  const ds = rows.map(r => r.debut).filter(Boolean).map(d => new Date(d).getTime())
  const fs = rows.map(r => r.fin).filter(Boolean).map(d => new Date(d).getTime())
  if (!ds.length) return 'Week'
  const jours = (Math.max(...fs) - Math.min(...ds)) / 86400000
  return jours <= 21 ? 'Day' : jours <= 120 ? 'Week' : jours <= 800 ? 'Month' : 'Year'
}

export default function GanttLots({
  lots, dependances = [], interventions = [], artisans = [], actionsParLot = {},
  onMajLot, onAjouterLot, onSupprimerLot, onAjouterDep, onRetirerDep,
  onDateChange, onInterventionDateChange,
}) {
  const [vue, setVue] = useState('fit')   // « Vue ajustée » par défaut : tout le planning tient à l'écran
  const [collapse, setCollapse] = useState(() => new Set())
  const [editId, setEditId] = useState(null)
  const conteneurRef = useRef(null)
  const headRef = useRef(null)
  const cbLot = useRef(onDateChange), cbInt = useRef(onInterventionDateChange)
  useEffect(() => { cbLot.current = onDateChange }, [onDateChange])
  useEffect(() => { cbInt.current = onInterventionDateChange }, [onInterventionDateChange])

  // ── Lignes visibles ordonnées : lot racine puis ses sous-lots (si non replié) ; puis les
  //    interventions non rattachées (lecture seule). Une ligne = une barre.
  const rows = useMemo(() => {
    const racines = lots.filter(l => !l.parent_lot_id)
    const sousDe = pid => lots.filter(l => l.parent_lot_id === pid)
    const r = []
    for (const lot of racines) {
      const enfants = sousDe(lot.id)
      r.push({ key: lot.id, id: lot.id, lot, niveau: 0, hasEnfants: enfants.length > 0,
        nom: lot.nom, couleur: lot.couleur, debut: lot.date_debut, fin: lot.date_fin, avancement: lot.avancement })
      if (!collapse.has(lot.id)) for (const s of enfants) {
        r.push({ key: s.id, id: s.id, lot: s, niveau: 1, hasEnfants: false,
          nom: s.nom, couleur: s.couleur, debut: s.date_debut, fin: s.date_fin, avancement: s.avancement })
      }
    }
    const interLiees = new Set(lots.map(l => l.intervention_id).filter(Boolean).map(String))
    for (const it of (interventions || [])) {
      if (it.type_intervention !== 'periode' || !it.date_debut || !it.date_fin) continue
      if (interLiees.has(String(it.id))) continue
      r.push({ key: 'int_' + it.id, id: 'int_' + it.id, inter: it, niveau: 0, readonly: true,
        nom: (it.artisan?.entreprise || it.artisan?.metier || 'Intervention'),
        couleur: '#9ca3af', debut: it.date_debut, fin: it.date_fin, avancement: 0 })
    }
    return r
  }, [lots, interventions, collapse])


  // Signature : reconstruit le gantt seulement si la donnée pertinente change.
  const sig = rows.map(r => `${r.id}|${r.nom}|${r.debut}|${r.fin}|${r.avancement}|${r.couleur}`).join('~')
    + '#' + dependances.map(d => d.lot_id + '>' + d.depend_de_lot_id).join(',') + '#' + vue

  useEffect(() => {
    const el = conteneurRef.current
    if (!el) return
    el.innerHTML = ''
    if (!rows.length) return

    const dates = rows.filter(r => r.debut && r.fin)
    // Date de référence pour les lignes SANS dates (barre invisible, juste pour aligner la ligne).
    const refDate = dates.length ? dates.map(r => r.debut).sort()[0] : iso(new Date())
    const idSet = new Set(dates.map(r => String(r.id)))
    const depsParLot = new Map()
    for (const d of (dependances || [])) {
      const c = String(d.lot_id), p = String(d.depend_de_lot_id)
      if (!idSet.has(c) || !idSet.has(p)) continue
      if (!depsParLot.has(c)) depsParLot.set(c, [])
      depsParLot.get(c).push(p)
    }
    // Une tâche PAR ligne (dates réelles ou placeholder invisible) → alignement parfait avec l'arbre.
    const taches = rows.map(r => {
      if (!r.debut || !r.fin) {
        return { id: String(r.id), name: '', start: refDate, end: refDate, progress: 0, dependencies: [], custom_class: 'bar-vide', readonly: true }
      }
      const duree = dureeJours(r.debut, r.fin)
      return {
        id: String(r.id),
        name: `${r.nom || 'Lot'} — ${duree} j (${r.avancement || 0} %)`,
        start: r.debut, end: r.fin,
        progress: Math.max(0, Math.min(100, Number(r.avancement) || 0)),
        dependencies: depsParLot.get(String(r.id)) || [],
        custom_class: r.readonly ? 'bar-intervention' : '',
        readonly: r.readonly && !cbInt.current,
      }
    })

    const mode = vue === 'fit' ? modeAjuste(rows) : vue
    const optsGantt = {
      view_mode: mode, date_format: 'YYYY-MM-DD', language: 'fr',
      bar_height: BAR, padding: PAD, container_height: 'auto',
      readonly_progress: true, today_button: false, view_mode_select: false, popup_on: 'hover',
      // infinite_padding (défaut true) faisait DEUX choses nuisibles : (a) fenêtre = premier lot
      // − 30 unités → un mois de vide avant la première barre en vue Jours ; (b) un handler
      // « mousewheel » qui rallongeait la période et re-rendait le gantt à CHAQUE coup de molette
      // (y compris un scroll vertical de la page) → dérive de l'axe et perte des couleurs peintes
      // en JS. À false, la lib utilise view_mode.padding et n'installe pas ce handler.
      infinite_padding: false,
      on_date_change: (task, start, end) => {
        if (!task?.id) return
        const maj = { date_debut: iso(start), date_fin: iso(end) }
        const s = String(task.id)
        if (s.startsWith('int_')) cbInt.current?.(s.slice(4), maj)
        else cbLot.current?.(s, maj)
      },
    }
    // « Vue ajustée » : largeur de colonne calculée pour que TOUT le planning tienne dans la
    // largeur visible. Sinon, en semaines, un chantier de plusieurs mois fait des milliers de px
    // et on ne voit qu'une fraction → le planning paraît « vide » à l'ouverture. Bornée (28–240)
    // pour garder des barres lisibles.
    if (vue === 'fit' && dates.length) {
      // La fenêtre forcée ci-dessous inclut aujourd'hui et les 4 semaines suivantes : la largeur
      // de colonne doit être calculée sur CETTE étendue, sinon « ajusté » ne tient plus à l'écran.
      const debs = dates.map(r => new Date(r.debut).getTime()).concat(Date.now())
      const fins = dates.map(r => new Date(r.fin).getTime()).concat(Date.now() + FUTUR_JOURS * 86400000)
      const spanJours = Math.max(1, (Math.max(...fins) - Math.min(...debs)) / 86400000)
      const unite = mode === 'Day' ? 1 : mode === 'Week' ? 7 : mode === 'Month' ? 30 : 365
      const colonnes = spanJours / unite + 4
      const dispo = (el.clientWidth || 900) - 16
      optsGantt.column_width = Math.max(28, Math.min(240, Math.floor(dispo / colonnes)))
    }
    let g
    try {
      g = new Gantt(el, taches, optsGantt)
    } catch (e) { console.error('[GanttLots]', e); return }

    // Fenêtre : frappe-gantt borne l'axe au premier et au dernier lot (+ padding). Si tous les
    // lots sont dans le passé, aujourd'hui et le futur ne sont tout simplement PAS dessinés.
    // On élargit donc l'axe pour couvrir au moins [aujourd'hui ; aujourd'hui + 4 semaines].
    // setup_date_values() + render() = le chemin interne que la lib s'applique à elle-même.
    try {
      const auj = new Date(); auj.setHours(0, 0, 0, 0)
      const finVoulue = new Date(auj); finVoulue.setDate(finVoulue.getDate() + FUTUR_JOURS)
      let elargi = false
      if (g.gantt_start > auj) { g.gantt_start = auj; elargi = true }
      if (g.gantt_end < finVoulue) { g.gantt_end = finVoulue; elargi = true }
      if (elargi) { g.setup_date_values(); g.render() }
    } catch (e) { console.error('[GanttLots] fenêtre', e) }

    // Couleur des barres (par lot) + alignement en-tête. Différé aussi en rAF : selon la version,
    // frappe-gantt peut finir de peindre le SVG juste après le constructeur, donc on repasse une
    // fois le DOM en place. Couleur de repli si le lot n'en a pas (jamais de barre invisible).
    const peindre = () => {
      let minX = Infinity
      for (const r of dates) {
        if (r.readonly) continue
        const bar = el.querySelector(`.bar-wrapper[data-id="${CSS.escape(String(r.id))}"] .bar`)
        if (bar) {
          const c = r.couleur || '#6366f1'; bar.style.fill = c; bar.style.stroke = c
          if (bar.getBBox) { try { const x = bar.getBBox().x; if (x < minX) minX = x } catch { /* SVG pas prêt */ } }
        }
      }
      const gh = el.querySelector('.grid-header')?.getBoundingClientRect().height
      if (gh && headRef.current) headRef.current.style.height = gh + 'px'
      // Scroll horizontal sur le DÉBUT des travaux (1re barre datée), pas sur « aujourd'hui » : si les
      // lots sont dans le passé/futur, today tombe sur une zone vide et le planning semble vide.
      const cont = el.querySelector('.gantt-container')
      if (cont && isFinite(minX)) cont.scrollLeft = Math.max(0, minX - 40)
    }
    peindre()
    const raf = requestAnimationFrame(peindre)

    return () => { cancelAnimationFrame(raf); if (el) el.innerHTML = '' }
  }, [sig])  // eslint-disable-line react-hooks/exhaustive-deps

  const vide = rows.length === 0

  return (
    <div style={{ border: '1px solid var(--ink-200)', borderRadius: 12, overflow: 'hidden' }}>
      {/* Barre de vues */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: 8, borderBottom: '1px solid var(--ink-100)' }}>
        {VUES.map(([m, lbl]) => (
          <button key={m} onClick={() => setVue(m)} className={vue === m ? 'btn btn-primary' : 'btn btn-ghost'}
            style={{ fontSize: 11.5, padding: '4px 12px' }}>{lbl}</button>
        ))}
      </div>

      {vide ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-500)', fontSize: 13 }}>
          Ajoute des lots et renseigne des dates (début + fin) pour voir le planning.
        </div>
      ) : null}

      {/* Arbre (gauche) + timeline (droite), alignés ligne par ligne. Le SCROLL HORIZONTAL du temps
          est géré en interne par frappe-gantt (overflow-x, voir globals.css) — il s'ouvre sur
          aujourd'hui (scroll_to). Pas de scroll vertical : tout est affiché, l'arbre suit. */}
      <div style={{ display: 'flex' }}>
        <div style={{ flex: '0 0 300px', borderRight: '1px solid var(--ink-200)' }}>
          <div ref={headRef} style={{ display: 'flex', alignItems: 'center', padding: '0 12px', fontWeight: 700, fontSize: 13, color: 'var(--ink-700)', borderBottom: '1px solid var(--ink-200)', boxSizing: 'border-box' }}>
            Lots / Sous-lots
          </div>
          {rows.map(r => (
            <div key={r.key}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: PITCH, boxSizing: 'border-box',
                padding: '0 10px', paddingLeft: r.niveau ? 28 : 10, borderBottom: '1px solid var(--ink-100)',
                background: editId === r.id ? 'var(--surface-2)' : 'var(--surface, #fff)' }}>
                {r.hasEnfants ? (
                  <button onClick={() => setCollapse(s => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n })}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ink-500)', fontSize: 12, width: 14, padding: 0 }}>
                    {collapse.has(r.id) ? '▸' : '▾'}
                  </button>
                ) : <span style={{ width: 14 }} />}
                <span style={{ width: 11, height: 11, borderRadius: '50%', background: r.couleur || '#94a3b8', flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13.5, fontWeight: r.niveau ? 500 : 600, color: 'var(--ink-900)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.nom || 'Lot'}
                </span>
                {actionsParLot[r.id]?.total > 0 && (
                  <span title="Actions de CR rattachées" style={{ fontSize: 10, color: 'var(--ink-500)', background: 'var(--ink-100)', borderRadius: 8, padding: '1px 5px' }}>
                    {actionsParLot[r.id].cloturees}/{actionsParLot[r.id].total}
                  </span>
                )}
                {!r.readonly && (
                  <>
                    <button onClick={() => setEditId(editId === r.id ? null : r.id)} title="Modifier" style={icBtn}>✎</button>
                    {r.niveau === 0 && <button onClick={() => onAjouterLot?.(r.id)} title="Ajouter un sous-lot" style={icBtn}>+</button>}
                    <button onClick={() => onSupprimerLot?.(r.id)} title="Supprimer" style={{ ...icBtn, color: '#b91c1c' }}>🗑</button>
                  </>
                )}
              </div>
              {editId === r.id && r.lot && (
                <EditPanel row={r} artisans={artisans} lotsRacine={lots.filter(l => !l.parent_lot_id)}
                  deps={dependances} onMaj={onMajLot}
                  onAjouterDep={onAjouterDep} onRetirerDep={onRetirerDep} />
              )}
            </div>
          ))}
        </div>
        <div ref={conteneurRef} className="gantt-lots" style={{ flex: 1, minWidth: 0 }} />
      </div>
    </div>
  )
}

const icBtn = { border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ink-400)', fontSize: 13, padding: '0 2px', lineHeight: 1 }

// Panneau d'édition détaillée d'un lot (déplié sous sa ligne).
function EditPanel({ row, artisans, lotsRacine, deps, onMaj, onAjouterDep, onRetirerDep }) {
  const lot = row.lot
  const nbJours = (lot.date_debut && lot.date_fin) ? dureeJours(lot.date_debut, lot.date_fin) : ''
  const mesDeps = deps.filter(d => d.lot_id === lot.id)
  const dejaPred = new Set(mesDeps.map(d => d.depend_de_lot_id))
  const options = lotsRacine.filter(l => l.id !== lot.id && !dejaPred.has(l.id))
  const nomDe = lid => lotsRacine.find(l => l.id === lid)?.nom || '—'
  const estRacine = !lot.parent_lot_id
  return (
    <div style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--ink-100)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input defaultValue={lot.nom || ''} key={lot.id + lot.nom} placeholder={estRacine ? 'Nom du lot' : 'Nom du sous-lot'}
          onBlur={e => { const v = e.target.value.trim() || 'Lot'; if (v !== lot.nom) onMaj(lot.id, { nom: v }) }}
          className="input" style={{ flex: '1 1 140px', height: 32, fontSize: 12.5, fontWeight: 600 }} />
        <select value={lot.artisan_id || ''} onChange={e => onMaj(lot.id, { artisan_id: e.target.value || null })}
          className="input" style={{ height: 32, fontSize: 12, flex: '0 1 160px' }}>
          <option value="">— Artisan —</option>
          {artisans.map(a => <option key={a.id} value={a.id}>{a.entreprise || a.metier}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="date" value={lot.date_debut || ''} onChange={e => onMaj(lot.id, { date_debut: e.target.value || null })} className="input" style={{ height: 32, fontSize: 12 }} title="Début" />
        <input type="date" value={lot.date_fin || ''} onChange={e => onMaj(lot.id, { date_fin: e.target.value || null })} className="input" style={{ height: 32, fontSize: 12 }} title="Fin" />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--ink-500)' }} title="Durée en jours (calendaires)">
          <input type="number" min={1} value={nbJours} disabled={!lot.date_debut}
            onChange={e => { const n = Number(e.target.value); if (lot.date_debut && n >= 1) onMaj(lot.id, { date_fin: finApresJours(lot.date_debut, n) }) }}
            className="input" style={{ width: 50, height: 32, fontSize: 12 }} /> j.
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--ink-500)' }}>
          <input type="number" min={0} max={100} value={lot.avancement ?? 0}
            onChange={e => onMaj(lot.id, { avancement: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
            className="input" style={{ width: 54, height: 32, fontSize: 12 }} /> %
        </label>
      </div>
      {estRacine && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11.5, color: 'var(--ink-500)' }}>Après :</span>
          {mesDeps.length === 0 && <span style={{ fontSize: 11.5, color: 'var(--ink-400)' }}>aucune</span>}
          {mesDeps.map(d => (
            <span key={d.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, background: 'var(--ink-100)', borderRadius: 12, padding: '2px 6px 2px 8px' }}>
              {nomDe(d.depend_de_lot_id)}
              <button onClick={() => onRetirerDep(d.id)} title="Retirer" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#b91c1c', fontSize: 13, padding: 0 }}>×</button>
            </span>
          ))}
          {options.length > 0 && (
            <select value="" onChange={e => { if (e.target.value) onAjouterDep(lot.id, e.target.value) }} className="input" style={{ height: 28, fontSize: 11.5, flex: '0 1 150px' }}>
              <option value="">+ dépendance…</option>
              {options.map(l => <option key={l.id} value={l.id}>{l.nom}</option>)}
            </select>
          )}
        </div>
      )}
    </div>
  )
}
