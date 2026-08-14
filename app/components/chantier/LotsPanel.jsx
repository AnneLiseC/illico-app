'use client'
// Onglet « Lots / sous-lots » du chantier (Lot 1b du module CR).
// Référentiel lot/sous-lot partagé Gantt + CR : CRUD + pré-remplissage depuis les devis.
// Table `lots` (socle Lot 0). Hiérarchie via parent_lot_id. Sauvegarde directe Supabase
// (RLS staff). Aucune dépendance IA.
import { useEffect, useState, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '../../lib/supabase'
import { apiFetch } from '../../lib/api-auth-client'
import { dureeOuvree, finApresOuvres, LIBELLES_JOURS, JOURS_DEFAUT } from '../../lib/joursOuvres'

// frappe-gantt manipule le DOM directement → jamais de SSR.
const GanttLots = dynamic(() => import('./GanttLots'), { ssr: false })

const COULEURS = ['#4f46e5', '#0ea5e9', '#16a34a', '#a16207', '#dc2626', '#7c3aed', '#0d9488', '#db2777']
// Statuts « clôturants » (mêmes clés que le CR) : une action y est considérée comme réglée.
const CLOTURANTS = new Set(['cloture', 'quitus_transmis'])

// Artisans disponibles (dédupliqués) tirés des devis du dossier.
function artisansDepuisDevis(devis) {
  const map = new Map()
  for (const d of (devis || [])) {
    const a = d.artisan
    if (a?.id && !map.has(a.id)) map.set(a.id, a)
  }
  return [...map.values()]
}

export default function LotsPanel({ id, devis, interventionsDossier, onMajIntervention, setErreur }) {
  const [lots, setLots] = useState([])
  const [deps, setDeps] = useState([])          // lot_dependances : { id, lot_id, depend_de_lot_id }
  const [joursArtisan, setJoursArtisan] = useState({})  // artisan_id -> jours_travailles (int[] ISO)
  const [actionsParLot, setActionsParLot] = useState({})  // lot_id -> { total, cloturees } (lien CR↔planning)
  const [chargement, setChargement] = useState(true)
  const [ia, setIa] = useState(false)                 // appel IA en cours (pré-remplissage)
  const iaEnCoursRef = useRef(false)                  // garde anti-double-clic (facturation)
  const [iaPropos, setIaPropos] = useState(null)      // propositions IA à relire (ou null)
  const [liaisonPropos, setLiaisonPropos] = useState(null)  // liaisons interventions -> lots à valider
  const [exportOuvert, setExportOuvert] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [expFormat, setExpFormat] = useState('A4')
  const [expCols, setExpCols] = useState({ artisan: true, debut: true, fin: true, duree: true, avancement: false })
  const [expMention, setExpMention] = useState('Planning prévisionnel indicatif, sans valeur contractuelle. Les dates sont susceptibles d’évoluer en fonction de l’avancement du chantier et des aléas.')

  const artisans = artisansDepuisDevis(devis)

  const recharger = useCallback(async () => {
    const { data, error } = await supabase
      .from('lots')
      .select('*')
      .eq('dossier_id', id)
      .order('ordre', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) { setErreur?.('Chargement des lots : ' + error.message); return }
    setLots(data || [])
    // Dépendances du dossier (via les lots du dossier).
    const ids = (data || []).map(l => l.id)
    if (ids.length) {
      const { data: dd } = await supabase.from('lot_dependances').select('id, lot_id, depend_de_lot_id').in('lot_id', ids)
      setDeps(dd || [])
    } else { setDeps([]) }
    // Jours travaillés des artisans référencés par les lots (pour la durée en jours ouvrés).
    const artIds = [...new Set((data || []).map(l => l.artisan_id).filter(Boolean))]
    if (artIds.length) {
      const { data: arts } = await supabase.from('artisans').select('id, jours_travailles').in('id', artIds)
      setJoursArtisan(Object.fromEntries((arts || []).map(a => [a.id, a.jours_travailles || JOURS_DEFAUT])))
    } else { setJoursArtisan({}) }
    // Actions de CR rattachées à chaque lot (lien Planning ↔ Rapports de visite).
    if (ids.length) {
      const { data: cbl } = await supabase.from('action_cibles').select('lot_id, action:actions(id, statut)').in('lot_id', ids)
      const map = {}
      for (const c of (cbl || [])) {
        if (!c.lot_id || !c.action) continue
        const m = map[c.lot_id] || (map[c.lot_id] = { total: 0, cloturees: 0 })
        m.total++; if (CLOTURANTS.has(c.action.statut)) m.cloturees++
      }
      setActionsParLot(map)
    } else { setActionsParLot({}) }
  }, [id, setErreur])

  useEffect(() => { (async () => { await recharger(); setChargement(false) })() }, [recharger])

  const lotsRacine = lots.filter(l => !l.parent_lot_id)
  const sousLots = (lotId) => lots.filter(l => l.parent_lot_id === lotId)

  // ── Création ──
  const ajouterLot = async (parentLotId = null) => {
    const ordre = (parentLotId ? sousLots(parentLotId) : lotsRacine).length
    const { data, error } = await supabase.from('lots')
      .insert({ dossier_id: id, parent_lot_id: parentLotId, nom: parentLotId ? 'Nouveau sous-lot' : 'Nouveau lot',
                couleur: COULEURS[lotsRacine.length % COULEURS.length], ordre })
      .select().single()
    if (error) { setErreur?.('Création du lot : ' + error.message); return }
    setLots(prev => [...prev, data])
  }

  // ── Mise à jour d'un champ (optimiste) ──
  const majLot = async (lotId, champs) => {
    setLots(prev => prev.map(l => l.id === lotId ? { ...l, ...champs } : l))
    const { error } = await supabase.from('lots').update({ ...champs, updated_at: new Date().toISOString() }).eq('id', lotId)
    if (error) { setErreur?.('Enregistrement : ' + error.message); recharger() }  // rollback optimiste
  }

  // ── Jours travaillés d'un artisan (global à l'entreprise, pas au dossier) ──
  const majJoursArtisan = async (artisanId, jours) => {
    if (!artisanId) return
    const tri = [...new Set(jours)].filter(n => n >= 1 && n <= 7).sort((a, b) => a - b)
    setJoursArtisan(prev => ({ ...prev, [artisanId]: tri }))
    const { error } = await supabase.from('artisans').update({ jours_travailles: tri }).eq('id', artisanId)
    if (error) setErreur?.('Jours travaillés : ' + error.message)
  }

  // ── Dépendances (lot_id « après » depend_de_lot_id) ──
  const ajouterDep = async (lotId, dependDeId) => {
    if (!dependDeId || lotId === dependDeId) return
    if (deps.some(d => d.lot_id === lotId && d.depend_de_lot_id === dependDeId)) return
    // Anti-cycle simple : refuse si l'autre dépend déjà (directement) de celui-ci.
    if (deps.some(d => d.lot_id === dependDeId && d.depend_de_lot_id === lotId)) {
      setErreur?.('Dépendance circulaire refusée.'); return
    }
    const { data, error } = await supabase.from('lot_dependances')
      .insert({ lot_id: lotId, depend_de_lot_id: dependDeId }).select().single()
    if (error) { setErreur?.('Dépendance : ' + error.message); return }
    setDeps(prev => [...prev, data])
  }
  const retirerDep = async (depId) => {
    setDeps(prev => prev.filter(d => d.id !== depId))
    const { error } = await supabase.from('lot_dependances').delete().eq('id', depId)
    if (error) { setErreur?.('Suppression dépendance : ' + error.message); recharger() }
  }

  // ── Suppression (cascade sur les sous-lots via FK ON DELETE CASCADE) ──
  const supprimerLot = async (lotId) => {
    setLots(prev => prev.filter(l => l.id !== lotId && l.parent_lot_id !== lotId))
    const { error } = await supabase.from('lots').delete().eq('id', lotId)
    if (error) { setErreur?.('Suppression : ' + error.message); recharger() }
  }

  // ── Pré-remplissage IA depuis les devis : lit les PDF → propose lots + sous-lots (relus avant insertion) ──
  // Garde anti-réentrance (ref synchrone) : un double-clic rapide ne relance JAMAIS un appel
  // facturé avant que le bouton ne soit désactivé au re-render.
  const suggererIA = async () => {
    if (iaEnCoursRef.current) return
    iaEnCoursRef.current = true
    setIa(true)
    try {
      const res = await apiFetch('/api/lots/suggest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dossier_id: id }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErreur?.(j.error || 'Aide IA indisponible.'); return }
      const dejaArtisans = new Set(lots.map(l => l.artisan_id).filter(Boolean))
      // On coche par défaut ce qui n'existe pas déjà.
      const props = (j.propositions || []).map((p, i) => ({
        ...p, _key: p.artisan_id || 'p' + i,
        inclus: !dejaArtisans.has(p.artisan_id),
        sous_lots: (p.sous_lots || []).map(s => ({ nom: s, inclus: true })),
      }))
      if (!props.length) { setErreur?.('Aucune proposition (pas de devis exploitable).'); return }
      setIaPropos(props)
    } catch (e) {
      setErreur?.('Aide IA : ' + (e?.message || 'erreur'))
    } finally { setIa(false); iaEnCoursRef.current = false }
  }

  // Applique la sélection : 1 proposition cochée → 1 lot + ses sous-lots cochés.
  const appliquerIA = async () => {
    const choisis = (iaPropos || []).filter(p => p.inclus)
    if (!choisis.length) { setIaPropos(null); return }
    let ordre = lotsRacine.length
    for (const p of choisis) {
      // Rattache l'intervention de cet artisan (si elle existe) → le lot hérite de ses dates,
      // pour que le planning existant se retrouve dans le Gantt.
      const inter = (interventionsDossier || []).find(i => i.artisan_id === p.artisan_id)
      const { data: parent, error } = await supabase.from('lots')
        .insert({ dossier_id: id, parent_lot_id: null, artisan_id: p.artisan_id || null,
                  intervention_id: inter?.id || null,
                  date_debut: inter?.date_debut || null, date_fin: inter?.date_fin || null,
                  nom: p.lot_nom || 'Lot', couleur: COULEURS[ordre % COULEURS.length], ordre: ordre++ })
        .select().single()
      if (error) { setErreur?.('Création lot : ' + error.message); continue }
      const enfants = p.sous_lots.filter(s => s.inclus && s.nom.trim())
      if (enfants.length) {
        const { error: e2 } = await supabase.from('lots').insert(
          enfants.map((s, k) => ({ dossier_id: id, parent_lot_id: parent.id, nom: s.nom.trim(), couleur: parent.couleur, ordre: k }))
        )
        if (e2) setErreur?.('Création sous-lots : ' + e2.message)
      }
    }
    setIaPropos(null)
    await recharger()
  }


  // ── Relier les interventions existantes aux lots (Lot 4-7) : matching par artisan, sans IA ──
  const interLiees = new Set(lots.map(l => l.intervention_id).filter(Boolean).map(String))
  const interARelier = (interventionsDossier || []).filter(i =>
    i.type_intervention === 'periode' && i.date_debut && i.date_fin && !interLiees.has(String(i.id)))

  const proposerLiaisons = () => {
    const usedLot = new Set()
    const props = interARelier.map(it => {
      const lot = lots.find(l => !l.parent_lot_id && l.artisan_id === it.artisan_id && !l.intervention_id && !usedLot.has(l.id))
      if (lot) usedLot.add(lot.id)
      return {
        intervention_id: it.id,
        artisan_nom: it.artisan?.entreprise || it.artisan?.metier || 'Artisan',
        lot_id: lot?.id || null, lot_nom: lot?.nom || null,
        date_debut: it.date_debut, date_fin: it.date_fin,
        ecrase: lot ? !!(lot.date_debut || lot.date_fin) : false,
        inclus: !!lot,
      }
    })
    setLiaisonPropos(props)
  }

  const appliquerLiaisons = async () => {
    for (const p of (liaisonPropos || [])) {
      if (!p.inclus || !p.lot_id) continue
      await majLot(p.lot_id, { intervention_id: p.intervention_id, date_debut: p.date_debut, date_fin: p.date_fin })
    }
    setLiaisonPropos(null)
    await recharger()
  }

  // ── Export PDF du planning (A4/A3, colonnes, mention légale) ──
  const exporterPlanning = async () => {
    setExporting(true)
    try {
      const res = await apiFetch('/api/planning/pdf', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dossier_id: id, format: expFormat, colonnes: expCols, mention: expMention }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setErreur?.(j.error || 'Export du planning impossible.'); return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
      setExportOuvert(false)
    } catch (e) {
      setErreur?.('Export : ' + (e?.message || 'erreur'))
    } finally { setExporting(false) }
  }

  if (chargement) return <div style={{ padding: 24, color: 'var(--ink-500)' }}>Chargement des lots…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => ajouterLot(null)} className="btn btn-primary" style={{ fontSize: 12.5 }}>+ Lot</button>
        <button onClick={suggererIA} disabled={ia} className="btn btn-ghost" style={{ fontSize: 12.5 }} title="Lit les PDF de devis et propose lots + sous-lots (dates récupérées des interventions)">
          {ia ? 'Analyse des devis…' : 'Pré-remplir depuis les devis'}
        </button>
        {interARelier.length > 0 && (
          <button onClick={proposerLiaisons} className="btn btn-ghost" style={{ fontSize: 12.5 }} title="Relie les interventions existantes aux lots du même artisan (dates récupérées)">
            Relier les interventions ({interARelier.length})
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={() => setExportOuvert(o => !o)} className="btn btn-ghost" style={{ fontSize: 12.5 }}>Exporter PDF</button>
      </div>

      {/* Repère : ce que chaque colonne représente (source de confusion fréquente). */}
      <div style={{ fontSize: 11.5, color: 'var(--ink-500)', background: 'var(--surface-2)', borderRadius: 8, padding: '8px 12px' }}>
        Chaque ligne : <b>nom du lot</b> (le corps d’état, ex. « PLACO ») · <b>artisan</b> (l’entreprise qui le réalise) · dates · <b>durée en jours ouvrés</b> · avancement.
        Le nom et l’artisan sont <b>indépendants</b> : « Pré-remplir depuis les devis » remplit les deux (nom déduit du PDF, artisan depuis le devis), mais tu peux tout modifier à la main.
      </div>

      {liaisonPropos && (
        <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, borderLeft: '3px solid #16a34a' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Relier les interventions aux lots</span>
            <div style={{ flex: 1 }} />
            <button onClick={() => setLiaisonPropos(null)} className="btn btn-ghost" style={{ fontSize: 11.5, padding: '4px 8px' }}>Annuler</button>
            <button onClick={appliquerLiaisons} className="btn btn-primary" style={{ fontSize: 11.5, padding: '4px 10px' }}>Relier la sélection</button>
          </div>
          {liaisonPropos.map((p, pi) => (
            <div key={pi} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12.5, opacity: (p.inclus && p.lot_id) ? 1 : 0.55 }}>
              {p.lot_id ? (
                <>
                  <input type="checkbox" checked={p.inclus}
                    onChange={e => setLiaisonPropos(prev => prev.map((x, i) => i === pi ? { ...x, inclus: e.target.checked } : x))} />
                  <span><b>{p.artisan_nom}</b> ({p.date_debut} → {p.date_fin})</span>
                  <span style={{ color: 'var(--ink-400)' }}>→ lot</span>
                  <span style={{ fontWeight: 600 }}>{p.lot_nom}</span>
                  {p.ecrase && <span style={{ fontSize: 11, color: '#b45309' }}>écrase les dates du lot</span>}
                </>
              ) : (
                <span style={{ color: 'var(--ink-500)' }}>⨯ <b>{p.artisan_nom}</b> ({p.date_debut} → {p.date_fin}) — aucun lot pour cet artisan (pré-remplis depuis les devis d’abord)</span>
              )}
            </div>
          ))}
        </div>
      )}

      {iaPropos && (
        <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, borderLeft: '3px solid #7c3aed' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Propositions IA — relis et décoche ce que tu ne veux pas</span>
            <div style={{ flex: 1 }} />
            <button onClick={() => setIaPropos(null)} className="btn btn-ghost" style={{ fontSize: 11.5, padding: '4px 8px' }}>Annuler</button>
            <button onClick={appliquerIA} className="btn btn-primary" style={{ fontSize: 11.5, padding: '4px 10px' }}>Ajouter la sélection</button>
          </div>
          {iaPropos.map((p, pi) => (
            <div key={p._key} style={{ border: '1px solid var(--ink-100)', borderRadius: 8, padding: '8px 10px', opacity: p.inclus ? 1 : 0.5 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={p.inclus}
                  onChange={e => setIaPropos(prev => prev.map((x, i) => i === pi ? { ...x, inclus: e.target.checked } : x))} />
                <input value={p.lot_nom}
                  onChange={e => setIaPropos(prev => prev.map((x, i) => i === pi ? { ...x, lot_nom: e.target.value } : x))}
                  className="input" style={{ flex: '1 1 180px', height: 30, fontSize: 13, fontWeight: 600 }} />
                <span style={{ fontSize: 11, color: 'var(--ink-500)' }}>{p.artisan_nom}{p.source === 'metier' ? ' · sans PDF' : ''}</span>
              </label>
              {p.note && <div style={{ fontSize: 11, color: '#b45309', marginLeft: 26, marginTop: 2 }}>{p.note}</div>}
              {p.sous_lots.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginLeft: 26, marginTop: 6 }}>
                  {p.sous_lots.map((s, si) => (
                    <label key={si} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--ink-600)' }}>
                      <input type="checkbox" checked={s.inclus}
                        onChange={e => setIaPropos(prev => prev.map((x, i) => i === pi
                          ? { ...x, sous_lots: x.sous_lots.map((y, k) => k === si ? { ...y, inclus: e.target.checked } : y) } : x))} />
                      {s.nom}
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {exportOuvert && (
        <div style={{ border: '1px solid var(--ink-200)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--surface-2)' }}>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>Format :</span>
            {['A4', 'A3'].map(f => (
              <label key={f} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5 }}>
                <input type="radio" name="expfmt" checked={expFormat === f} onChange={() => setExpFormat(f)} /> {f} paysage
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>Colonnes :</span>
            {[['artisan', 'Artisan'], ['debut', 'Début'], ['fin', 'Fin'], ['duree', 'Durée'], ['avancement', '%']].map(([k, lbl]) => (
              <label key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5 }}>
                <input type="checkbox" checked={!!expCols[k]} onChange={e => setExpCols(c => ({ ...c, [k]: e.target.checked }))} /> {lbl}
              </label>
            ))}
          </div>
          <label style={{ fontSize: 12, color: 'var(--ink-500)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            Mention légale (pied de page)
            <textarea value={expMention} onChange={e => setExpMention(e.target.value)} rows={2}
              className="input" style={{ fontSize: 12, resize: 'vertical' }} />
          </label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setExportOuvert(false)} className="btn btn-ghost" style={{ fontSize: 11.5, padding: '4px 10px' }}>Annuler</button>
            <button onClick={exporterPlanning} disabled={exporting} className="btn btn-primary" style={{ fontSize: 11.5, padding: '4px 12px' }}>
              {exporting ? 'Génération…' : 'Générer le PDF'}
            </button>
          </div>
        </div>
      )}
      </div>

      <GanttLots lots={lots} dependances={deps} interventions={interventionsDossier}
        joursArtisan={joursArtisan} artisans={artisans} actionsParLot={actionsParLot}
        onMajLot={majLot} onAjouterLot={ajouterLot} onSupprimerLot={supprimerLot}
        onAjouterDep={ajouterDep} onRetirerDep={retirerDep} onMajJoursArtisan={majJoursArtisan}
        onDateChange={majLot} onInterventionDateChange={onMajIntervention} />
    </div>
  )
}

