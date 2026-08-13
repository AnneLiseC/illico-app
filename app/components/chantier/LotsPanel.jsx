'use client'
// Onglet « Lots / sous-lots » du chantier (Lot 1b du module CR).
// Référentiel lot/sous-lot partagé Gantt + CR : CRUD + pré-remplissage depuis les devis.
// Table `lots` (socle Lot 0). Hiérarchie via parent_lot_id. Sauvegarde directe Supabase
// (RLS staff). Aucune dépendance IA.
import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '../../lib/supabase'
import { apiFetch } from '../../lib/api-auth-client'
import { dureeOuvree, finApresOuvres, LIBELLES_JOURS, JOURS_DEFAUT } from '../../lib/joursOuvres'

// frappe-gantt manipule le DOM directement → jamais de SSR.
const GanttLots = dynamic(() => import('./GanttLots'), { ssr: false })

const COULEURS = ['#4f46e5', '#0ea5e9', '#16a34a', '#a16207', '#dc2626', '#7c3aed', '#0d9488', '#db2777']

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
  const [chargement, setChargement] = useState(true)
  const [vueGantt, setVueGantt] = useState('Week')
  const [ia, setIa] = useState(false)                 // appel IA en cours
  const [iaPropos, setIaPropos] = useState(null)      // propositions IA à relire (ou null)
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
    if (error) setErreur?.('Enregistrement : ' + error.message)
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
  const suggererIA = async () => {
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
    } finally { setIa(false) }
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
      <details className="card" open style={{ padding: 0, overflow: 'hidden' }}>
        <summary style={{ cursor: 'pointer', padding: '12px 14px', fontSize: 13, fontWeight: 600, listStyle: 'revert' }}>
          Gérer les lots <span style={{ fontWeight: 400, color: 'var(--ink-500)' }}>· {lotsRacine.length} lot{lotsRacine.length > 1 ? 's' : ''}</span>
        </summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '0 14px 14px' }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => ajouterLot(null)} className="btn btn-primary" style={{ fontSize: 12.5 }}>+ Lot</button>
        <button onClick={suggererIA} disabled={ia} className="btn btn-ghost" style={{ fontSize: 12.5 }} title="Lit les PDF de devis et propose lots + sous-lots (dates récupérées des interventions)">
          {ia ? 'Analyse des devis…' : '✨ Pré-remplir depuis les devis'}
        </button>
      </div>

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

      {lotsRacine.length === 0 && (
        <div className="card" style={{ padding: 20, textAlign: 'center', color: 'var(--ink-500)', fontSize: 13 }}>
          Aucun lot. Crée-en un ou pré-remplis depuis les devis.
        </div>
      )}

      {lotsRacine.map(lot => (
        <div key={lot.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <LigneLot lot={lot} artisans={artisans} niveau={0} jours={joursArtisan[lot.artisan_id] || JOURS_DEFAUT} onMaj={majLot} onSupprimer={supprimerLot} onAjouterSousLot={() => ajouterLot(lot.id)} />
          <LigneDeps lot={lot} lotsRacine={lotsRacine} deps={deps}
            jours={joursArtisan[lot.artisan_id] || JOURS_DEFAUT} onMajJours={lot.artisan_id ? (j => majJoursArtisan(lot.artisan_id, j)) : null}
            onAjouter={ajouterDep} onRetirer={retirerDep} />
          {sousLots(lot.id).map(sl => (
            <LigneLot key={sl.id} lot={sl} artisans={artisans} niveau={1} jours={joursArtisan[sl.artisan_id] || joursArtisan[lot.artisan_id] || JOURS_DEFAUT} onMaj={majLot} onSupprimer={supprimerLot} />
          ))}
        </div>
      ))}
        </div>
      </details>

      {(lotsRacine.length > 0 || (interventionsDossier || []).some(i => i.date_debut && i.date_fin)) && (
        <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Planning (Gantt)</span>
            <div style={{ flex: 1 }} />
            {['Day', 'Week', 'Month'].map(m => (
              <button key={m} onClick={() => setVueGantt(m)}
                className={vueGantt === m ? 'btn btn-primary' : 'btn btn-ghost'}
                style={{ fontSize: 11.5, padding: '4px 10px' }}>
                {m === 'Day' ? 'Jour' : m === 'Week' ? 'Semaine' : 'Mois'}
              </button>
            ))}
            <button onClick={() => setExportOuvert(o => !o)} className="btn btn-ghost" style={{ fontSize: 11.5, padding: '4px 10px' }}>⬇ Exporter PDF</button>
          </div>

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

          <GanttLots lots={lots} dependances={deps} interventions={interventionsDossier}
            onDateChange={majLot} onInterventionDateChange={onMajIntervention} viewMode={vueGantt} />
        </div>
      )}
    </div>
  )
}

// Dépendances d'un lot racine : « Après : [chips] + sélecteur ». L'arête Gantt part du
// prédécesseur. On ne propose que les AUTRES lots racine (les sous-lots héritent du parent).
function LigneDeps({ lot, lotsRacine, deps, jours = JOURS_DEFAUT, onMajJours, onAjouter, onRetirer }) {
  const mesDeps = deps.filter(d => d.lot_id === lot.id)
  const dejaPred = new Set(mesDeps.map(d => d.depend_de_lot_id))
  const options = lotsRacine.filter(l => l.id !== lot.id && !dejaPred.has(l.id))
  const nomDe = (lid) => lotsRacine.find(l => l.id === lid)?.nom || '—'
  const jset = new Set(jours)
  const toggleJour = (iso) => {
    if (!onMajJours) return
    onMajJours(jset.has(iso) ? jours.filter(j => j !== iso) : [...jours, iso])
  }
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
      padding: '6px 14px 8px', paddingLeft: 34, borderTop: '1px solid var(--ink-100)', background: 'var(--surface-2)' }}>
      <span style={{ fontSize: 11.5, color: 'var(--ink-500)' }}>Après&nbsp;:</span>
      {mesDeps.length === 0 && <span style={{ fontSize: 11.5, color: 'var(--ink-400)' }}>aucune</span>}
      {mesDeps.map(d => (
        <span key={d.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5,
          background: 'var(--ink-100)', borderRadius: 12, padding: '2px 6px 2px 8px' }}>
          {nomDe(d.depend_de_lot_id)}
          <button onClick={() => onRetirer(d.id)} title="Retirer"
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#b91c1c', fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
        </span>
      ))}
      {options.length > 0 && (
        <select value="" onChange={e => { if (e.target.value) onAjouter(lot.id, e.target.value) }}
          className="input" style={{ height: 28, fontSize: 11.5, flex: '0 1 160px' }}>
          <option value="">+ dépendance…</option>
          {options.map(l => <option key={l.id} value={l.id}>{l.nom}</option>)}
        </select>
      )}

      {onMajJours && (
        <>
          <span style={{ fontSize: 11.5, color: 'var(--ink-500)', marginLeft: 10 }} title="Jours travaillés de l'entreprise (sert au calcul de durée). S'applique à toute l'entreprise.">Jours&nbsp;:</span>
          {LIBELLES_JOURS.map(j => {
            const actif = jset.has(j.iso)
            return (
              <button key={j.iso} onClick={() => toggleJour(j.iso)} title={actif ? 'Travaillé' : 'Non travaillé'}
                style={{ width: 22, height: 22, borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  border: '1px solid ' + (actif ? '#4f46e5' : 'var(--ink-200)'),
                  background: actif ? '#4f46e5' : 'transparent', color: actif ? '#fff' : 'var(--ink-500)' }}>
                {j.l}
              </button>
            )
          })}
        </>
      )}
    </div>
  )
}

// Une ligne éditable (lot ou sous-lot). Nom NON contrôlé (defaultValue + save au blur) :
// évite de resynchroniser un state local à chaque maj optimiste du parent.
function LigneLot({ lot, artisans, niveau, jours = JOURS_DEFAUT, onMaj, onSupprimer, onAjouterSousLot }) {
  const nbOuvres = (lot.date_debut && lot.date_fin) ? dureeOuvree(lot.date_debut, lot.date_fin, jours) : ''
  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'center', padding: '10px 14px', flexWrap: 'wrap',
      borderTop: niveau ? '1px solid var(--ink-100)' : 'none',
      background: niveau ? 'var(--surface-2)' : 'transparent',
      paddingLeft: niveau ? 34 : 14,
    }}>
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: lot.couleur || '#94a3b8', flexShrink: 0 }} />

      <input key={lot.id} defaultValue={lot.nom || ''}
        onBlur={e => { const v = e.target.value.trim() || 'Lot'; if (v !== lot.nom) onMaj(lot.id, { nom: v }) }}
        className="input" style={{ flex: '1 1 160px', minWidth: 120, height: 34, fontSize: 13, fontWeight: niveau ? 500 : 600 }} />

      <select value={lot.artisan_id || ''} onChange={e => onMaj(lot.id, { artisan_id: e.target.value || null })}
        className="input" style={{ height: 34, fontSize: 12.5, flex: '0 1 170px' }}>
        <option value="">— Artisan —</option>
        {artisans.map(a => <option key={a.id} value={a.id}>{a.entreprise || a.metier}</option>)}
      </select>

      <input type="date" value={lot.date_debut || ''} onChange={e => onMaj(lot.id, { date_debut: e.target.value || null })}
        className="input" style={{ height: 34, fontSize: 12.5 }} title="Début" />
      <input type="date" value={lot.date_fin || ''} onChange={e => onMaj(lot.id, { date_fin: e.target.value || null })}
        className="input" style={{ height: 34, fontSize: 12.5 }} title="Fin" />

      {/* Durée en jours OUVRÉS de l'artisan : saisir recalcule la date de fin. */}
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--ink-500)' }} title="Durée en jours ouvrés (selon les jours travaillés de l'artisan)">
        <input type="number" min={1} value={nbOuvres}
          disabled={!lot.date_debut}
          onChange={e => {
            const n = Number(e.target.value)
            if (!lot.date_debut || !n || n < 1) return
            onMaj(lot.id, { date_fin: finApresOuvres(lot.date_debut, n, jours) })
          }}
          className="input" style={{ width: 52, height: 34, fontSize: 12.5 }} /> j.o.
      </label>

      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--ink-500)' }}>
        <input type="number" min={0} max={100} value={lot.avancement ?? 0}
          onChange={e => onMaj(lot.id, { avancement: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
          className="input" style={{ width: 58, height: 34, fontSize: 12.5 }} /> %
      </label>

      <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
        {niveau === 0 && (
          <button onClick={onAjouterSousLot} className="btn btn-ghost" style={{ fontSize: 11.5, padding: '4px 8px' }}>+ Sous-lot</button>
        )}
        <button onClick={() => onSupprimer(lot.id)} className="btn btn-ghost"
          style={{ fontSize: 11.5, padding: '4px 8px', color: '#b91c1c' }}>Supprimer</button>
      </div>
    </div>
  )
}
