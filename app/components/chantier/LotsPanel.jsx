'use client'
// Onglet « Lots / sous-lots » du chantier (Lot 1b du module CR).
// Référentiel lot/sous-lot partagé Gantt + CR : CRUD + pré-remplissage depuis les devis.
// Table `lots` (socle Lot 0). Hiérarchie via parent_lot_id. Sauvegarde directe Supabase
// (RLS staff). Aucune dépendance IA.
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

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

export default function LotsPanel({ id, devis, interventionsDossier, setErreur }) {
  const [lots, setLots] = useState([])
  const [chargement, setChargement] = useState(true)
  const [prefill, setPrefill] = useState(false)

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

  // ── Suppression (cascade sur les sous-lots via FK ON DELETE CASCADE) ──
  const supprimerLot = async (lotId) => {
    setLots(prev => prev.filter(l => l.id !== lotId && l.parent_lot_id !== lotId))
    const { error } = await supabase.from('lots').delete().eq('id', lotId)
    if (error) { setErreur?.('Suppression : ' + error.message); recharger() }
  }

  // ── Pré-remplissage depuis les devis (1 devis non refusé → 1 lot ; dates de l'intervention) ──
  const prefillDevis = async () => {
    setPrefill(true)
    try {
      const dejaArtisans = new Set(lots.map(l => l.artisan_id).filter(Boolean))
      const seen = new Set()
      const aCreer = []
      let ordre = lotsRacine.length
      for (const d of (devis || [])) {
        if (d.statut === 'refuse') continue
        const a = d.artisan
        if (!a?.id || seen.has(a.id) || dejaArtisans.has(a.id)) continue
        seen.add(a.id)
        const inter = (interventionsDossier || []).find(i => i.artisan_id === a.id)
        aCreer.push({
          dossier_id: id, parent_lot_id: null, artisan_id: a.id,
          intervention_id: inter?.id || null,
          nom: a.metier || a.entreprise || 'Lot',
          date_debut: inter?.date_debut || null,
          date_fin: inter?.date_fin || null,
          couleur: COULEURS[(ordre) % COULEURS.length],
          ordre: ordre++,
        })
      }
      if (!aCreer.length) { setErreur?.('Aucun nouveau lot à créer depuis les devis.'); return }
      const { error } = await supabase.from('lots').insert(aCreer)
      if (error) { setErreur?.('Pré-remplissage : ' + error.message); return }
      await recharger()
    } finally {
      setPrefill(false)
    }
  }

  if (chargement) return <div style={{ padding: 24, color: 'var(--ink-500)' }}>Chargement des lots…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => ajouterLot(null)} className="btn btn-primary" style={{ fontSize: 12.5 }}>+ Lot</button>
        <button onClick={prefillDevis} disabled={prefill} className="btn btn-ghost" style={{ fontSize: 12.5 }}>
          {prefill ? 'Pré-remplissage…' : 'Pré-remplir depuis les devis'}
        </button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>{lotsRacine.length} lot{lotsRacine.length > 1 ? 's' : ''}</span>
      </div>

      {lotsRacine.length === 0 && (
        <div className="card" style={{ padding: 20, textAlign: 'center', color: 'var(--ink-500)', fontSize: 13 }}>
          Aucun lot. Crée-en un ou pré-remplis depuis les devis.
        </div>
      )}

      {lotsRacine.map(lot => (
        <div key={lot.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <LigneLot lot={lot} artisans={artisans} niveau={0} onMaj={majLot} onSupprimer={supprimerLot} onAjouterSousLot={() => ajouterLot(lot.id)} />
          {sousLots(lot.id).map(sl => (
            <LigneLot key={sl.id} lot={sl} artisans={artisans} niveau={1} onMaj={majLot} onSupprimer={supprimerLot} />
          ))}
        </div>
      ))}
    </div>
  )
}

// Une ligne éditable (lot ou sous-lot). Nom NON contrôlé (defaultValue + save au blur) :
// évite de resynchroniser un state local à chaque maj optimiste du parent.
function LigneLot({ lot, artisans, niveau, onMaj, onSupprimer, onAjouterSousLot }) {
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
