'use client'
// Onglet « Rapports de visite » — nouveau système (Lot 1c-1).
// Liste de visites → page par visite avec ses ACTIONS (portée générale ou par lot,
// statut parmi les 16 + date). CRUD direct Supabase (RLS staff). Modèle ArchiReport.
// Photos + checklist = 1c-2 ; aide IA = 1c-3 ; report d'une visite à l'autre = Lot 2.
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { compressImageToBlob } from '../../lib/images'

// 16 statuts figés (clés = CHECK de la table `actions`), 4 familles couleur + libellé daté.
export const STATUTS = [
  { k: 'en_cours',        l: 'En cours',            c: '#dc2626', libelle: 'Créée le' },
  { k: 'date_limite',     l: 'Date limite',         c: '#dc2626', libelle: 'À réaliser avant le' },
  { k: 'urgent',          l: 'Urgent',              c: '#dc2626', libelle: 'Urgent depuis le' },
  { k: 'refuse',          l: 'Refusé',              c: '#dc2626', libelle: 'Refusé le' },
  { k: 'en_retard',       l: 'En retard',           c: '#dc2626', libelle: 'En retard depuis le' },
  { k: 'rappel',          l: 'Rappel',              c: '#dc2626', libelle: 'Rappel du' },
  { k: 'en_attente',      l: 'En attente',          c: '#d97706', libelle: 'En attente depuis le' },
  { k: 'a_surveiller',    l: 'À surveiller',        c: '#d97706', libelle: 'À surveiller depuis le' },
  { k: 'programme',       l: 'Programmé',           c: '#2563eb', libelle: 'Programmé le' },
  { k: 'a_programmer',    l: 'À programmer',        c: '#2563eb', libelle: 'À programmer pour le' },
  { k: 'information',     l: 'Information',         c: '#2563eb', libelle: 'Info du' },
  { k: 'quitus_transmis', l: 'Quitus transmis',     c: '#16a34a', libelle: 'Quitus transmis le' },
  { k: 'garder_memoire',  l: 'Garder pour mémoire', c: '#16a34a', libelle: 'Noté le' },
  { k: 'constate',        l: 'Constaté',            c: '#16a34a', libelle: 'Constaté le' },
  { k: 'acte',            l: 'Acté',                c: '#16a34a', libelle: 'Acté le' },
  { k: 'cloture',         l: 'Clôturé',             c: '#16a34a', libelle: 'Clôturé le' },
]
const STATUT_MAP = Object.fromEntries(STATUTS.map(s => [s.k, s]))
const CLOTURANTS = new Set(['cloture', 'quitus_transmis']) // ferment le report

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : ''

export default function CRVisitesPanel({ id, setErreur, setSucces, setAnnot }) {
  const [visites, setVisites] = useState([])
  const [lots, setLots] = useState([])
  const [selected, setSelected] = useState(null)   // id de la visite ouverte
  const [chargement, setChargement] = useState(true)

  const rechargerVisites = useCallback(async () => {
    const { data, error } = await supabase.from('comptes_rendus')
      .select('id, numero_visite, date_visite, prochaine_reunion_at, valide, created_at')
      .eq('dossier_id', id)
      .order('numero_visite', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
    if (error) { setErreur?.('Chargement des visites : ' + error.message); return }
    setVisites(data || [])
  }, [id, setErreur])

  useEffect(() => {
    (async () => {
      await rechargerVisites()
      const { data: l } = await supabase.from('lots').select('id, nom, parent_lot_id').eq('dossier_id', id).order('ordre')
      setLots(l || [])
      setChargement(false)
    })()
  }, [id, rechargerVisites])

  const nouvelleVisite = async () => {
    const maxNum = visites.reduce((m, v) => Math.max(m, v.numero_visite || 0), 0)
    const { data, error } = await supabase.from('comptes_rendus')
      .insert({ dossier_id: id, numero_visite: maxNum + 1, date_visite: new Date().toISOString().slice(0, 10), valide: false })
      .select().single()
    if (error) { setErreur?.('Nouvelle visite : ' + error.message); return }
    await rechargerVisites()
    setSelected(data.id)
  }

  if (chargement) return <div style={{ padding: 24, color: 'var(--ink-500)' }}>Chargement…</div>

  if (selected) {
    const visite = visites.find(v => v.id === selected)
    return <VisitePage visite={visite} dossierId={id} lots={lots} setErreur={setErreur} setSucces={setSucces} setAnnot={setAnnot}
             onRetour={() => { setSelected(null); rechargerVisites() }} onMajVisite={rechargerVisites} />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={nouvelleVisite} className="btn btn-primary" style={{ fontSize: 12.5 }}>+ Nouvelle visite</button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>{visites.length} visite{visites.length > 1 ? 's' : ''}</span>
      </div>

      {visites.length === 0 && (
        <div className="card" style={{ padding: 20, textAlign: 'center', color: 'var(--ink-500)', fontSize: 13 }}>
          Aucune visite. Crée la première.
        </div>
      )}

      {visites.map(v => (
        <button key={v.id} onClick={() => setSelected(v.id)} className="card"
          style={{ padding: '14px 16px', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink-900)' }}>
            Visite de chantier {v.numero_visite || '—'}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>{fmtDate(v.date_visite)}</div>
          <div style={{ flex: 1 }} />
          {v.valide
            ? <span style={{ fontSize: 11, fontWeight: 700, color: '#15803d' }}>Publié</span>
            : <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-500)' }}>Brouillon</span>}
        </button>
      ))}
    </div>
  )
}

// ── Page d'une visite : ses actions (générales + par lot) ──
function VisitePage({ visite, dossierId, lots, setErreur, setSucces, setAnnot, onRetour, onMajVisite }) {
  const [actions, setActions] = useState([])
  const [chargement, setChargement] = useState(true)
  const visiteId = visite?.id

  const recharger = useCallback(async () => {
    const { data, error } = await supabase.from('actions')
      .select('*, cibles:action_cibles(id, lot_id, intervenant_id)')
      .eq('cr_origine_id', visiteId)
      .order('ordre', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) { setErreur?.('Chargement des actions : ' + error.message); return }
    setActions(data || [])
  }, [visiteId, setErreur])

  useEffect(() => { (async () => { await recharger(); setChargement(false) })() }, [recharger])

  const ajouterAction = async (portee) => {
    const ordre = actions.length
    const numero = `${visite?.numero_visite || 1}.${ordre + 1}`
    const { data, error } = await supabase.from('actions')
      .insert({ dossier_id: dossierId, cr_origine_id: visiteId, portee, numero,
                statut: 'en_cours', statut_date: new Date().toISOString().slice(0, 10), ordre })
      .select('*, cibles:action_cibles(id, lot_id, intervenant_id)').single()
    if (error) { setErreur?.('Ajout action : ' + error.message); return }
    setActions(prev => [...prev, data])
  }

  const majAction = async (actionId, champs) => {
    setActions(prev => prev.map(a => a.id === actionId ? { ...a, ...champs } : a))
    const { error } = await supabase.from('actions').update({ ...champs, updated_at: new Date().toISOString() }).eq('id', actionId)
    if (error) setErreur?.('Enregistrement : ' + error.message)
  }

  const supprimerAction = async (actionId) => {
    setActions(prev => prev.filter(a => a.id !== actionId))
    const { error } = await supabase.from('actions').delete().eq('id', actionId)
    if (error) { setErreur?.('Suppression : ' + error.message); recharger() }
  }

  // Cible unique par lot pour 1c-1 (multi-cible = plus tard). Remplace la cible existante.
  const setCibleLot = async (action, lotId) => {
    await supabase.from('action_cibles').delete().eq('action_id', action.id)
    if (lotId) await supabase.from('action_cibles').insert({ action_id: action.id, lot_id: lotId })
    recharger()
  }

  const publier = async () => {
    const { error } = await supabase.from('comptes_rendus').update({ valide: true }).eq('id', visiteId)
    if (error) { setErreur?.('Publication : ' + error.message); return }
    setSucces?.('Visite publiée ✓')
    onMajVisite?.()
  }

  const generales = actions.filter(a => a.portee === 'generale')
  const parLot = actions.filter(a => a.portee === 'lot')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button onClick={onRetour} className="btn btn-ghost" style={{ fontSize: 12.5 }}>← Visites</button>
        <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--ink-900)' }}>
          Visite de chantier {visite?.numero_visite || '—'}
        </div>
        <input type="date" defaultValue={visite?.date_visite || ''} className="input" style={{ height: 34, fontSize: 12.5 }}
          onBlur={e => e.target.value !== visite?.date_visite && supabase.from('comptes_rendus').update({ date_visite: e.target.value || null }).eq('id', visiteId).then(onMajVisite)} />
        <div style={{ flex: 1 }} />
        {!visite?.valide && <button onClick={publier} className="btn btn-primary" style={{ fontSize: 12.5, background: '#15803d', borderColor: '#15803d' }}>Publier</button>}
      </div>

      {chargement ? <div style={{ color: 'var(--ink-500)' }}>Chargement des actions…</div> : (
        <>
          <Section titre="Remarques générales" onAjouter={() => ajouterAction('generale')}>
            {generales.map(a => (
              <ActionCard key={a.id} action={a} lots={lots} dossierId={dossierId} setAnnot={setAnnot} setErreur={setErreur}
                onMaj={majAction} onSupprimer={supprimerAction} />
            ))}
            {generales.length === 0 && <Vide />}
          </Section>

          <Section titre="Par lot / artisan" onAjouter={() => ajouterAction('lot')}>
            {parLot.map(a => (
              <ActionCard key={a.id} action={a} lots={lots} withLot dossierId={dossierId} setAnnot={setAnnot} setErreur={setErreur}
                onMaj={majAction} onSupprimer={supprimerAction} onSetLot={(lotId) => setCibleLot(a, lotId)} />
            ))}
            {parLot.length === 0 && <Vide />}
          </Section>
        </>
      )}
    </div>
  )
}

function Section({ titre, onAjouter, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink-700)' }}>{titre}</div>
        <button onClick={onAjouter} className="btn btn-ghost" style={{ fontSize: 11.5, padding: '3px 9px' }}>+ Action</button>
      </div>
      {children}
    </div>
  )
}

const Vide = () => <div style={{ fontSize: 12, color: 'var(--ink-400)', fontStyle: 'italic' }}>Aucune action.</div>

// ── Carte d'une action éditable (statut, texte, photos annotées, checklist vivante) ──
function ActionCard({ action, lots, withLot, dossierId, setAnnot, setErreur, onMaj, onSupprimer, onSetLot }) {
  const st = STATUT_MAP[action.statut] || STATUTS[0]
  const cibleLot = action.cibles?.find(c => c.lot_id)?.lot_id || ''

  return (
    <div className="card" style={{ padding: 12, borderLeft: `3px solid ${st.c}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink-500)' }}>{action.numero}</span>

        {/* Statut */}
        <select value={action.statut} onChange={e => {
          const k = e.target.value
          const champs = { statut: k, statut_date: action.statut_date || new Date().toISOString().slice(0, 10) }
          champs.cr_cloture_id = CLOTURANTS.has(k) ? action.cr_origine_id : null
          onMaj(action.id, champs)
        }} className="input" style={{ height: 30, fontSize: 12, color: st.c, fontWeight: 700, flex: '0 1 190px' }}>
          {STATUTS.map(s => <option key={s.k} value={s.k} style={{ color: s.c }}>{s.l}</option>)}
        </select>

        {/* Date de statut */}
        <input type="date" value={action.statut_date || ''} onChange={e => onMaj(action.id, { statut_date: e.target.value || null })}
          className="input" style={{ height: 30, fontSize: 12 }} title={st.libelle} />

        {withLot && (
          <select value={cibleLot} onChange={e => onSetLot(e.target.value || null)} className="input" style={{ height: 30, fontSize: 12, flex: '0 1 170px' }}>
            <option value="">— Lot —</option>
            {lots.map(l => <option key={l.id} value={l.id}>{l.parent_lot_id ? '— ' : ''}{l.nom}</option>)}
          </select>
        )}

        <div style={{ flex: 1 }} />
        <button onClick={() => onSupprimer(action.id)} className="btn btn-ghost" style={{ fontSize: 11.5, padding: '3px 8px', color: '#b91c1c' }}>Supprimer</button>
      </div>

      <input defaultValue={action.titre || ''} placeholder="Titre (optionnel)"
        onBlur={e => e.target.value !== (action.titre || '') && onMaj(action.id, { titre: e.target.value })}
        className="input" style={{ height: 32, fontSize: 12.5, fontWeight: 600 }} />

      <textarea defaultValue={action.texte || ''} placeholder="Description de la remarque…" rows={2}
        onBlur={e => e.target.value !== (action.texte || '') && onMaj(action.id, { texte: e.target.value })}
        className="input" style={{ padding: 10, fontSize: 12.5, lineHeight: 1.5, resize: 'vertical', minHeight: 52 }} />

      <ActionPhotos action={action} dossierId={dossierId} setAnnot={setAnnot} setErreur={setErreur} />
      <ActionChecklist action={action} setErreur={setErreur} />

      <div style={{ fontSize: 10.5, color: 'var(--ink-400)' }}>{st.libelle} {fmtDate(action.statut_date)}</div>
    </div>
  )
}

// ── Photos d'une action (upload compressé + annotation + suppression) ──
function ActionPhotos({ action, dossierId, setAnnot, setErreur }) {
  const [photos, setPhotos] = useState([])
  const [up, setUp] = useState(false)

  const recharger = useCallback(async () => {
    const { data } = await supabase.from('action_photos').select('id, path, annotations, ordre').eq('action_id', action.id).order('ordre')
    const rows = data || []
    if (!rows.length) { setPhotos([]); return }
    const { data: signed } = await supabase.storage.from('photos').createSignedUrls(rows.map(r => r.path), 3600)
    const urlByPath = Object.fromEntries((signed || []).map(s => [s.path, s.signedUrl]))
    setPhotos(rows.map(r => ({ ...r, url: urlByPath[r.path] || '' })))
  }, [action.id])

  useEffect(() => { (async () => { await recharger() })() }, [recharger])

  const onFiles = async (files) => {
    if (!files.length) return
    setUp(true)
    let ordre = photos.length
    for (const file of files) {
      try {
        const blob = await compressImageToBlob(file)
        const path = `chantiers/${dossierId}/actions/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`
        const { error } = await supabase.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' })
        if (error) { setErreur?.('Envoi photo : ' + error.message); continue }
        await supabase.from('action_photos').insert({ action_id: action.id, path, ordre: ordre++ })
      } catch { setErreur?.('Photo non traitée (format ?).') }
    }
    setUp(false)
    recharger()
  }

  const supprimer = async (ph) => {
    try { await supabase.storage.from('photos').remove([ph.path]) } catch { /* best effort */ }
    await supabase.from('action_photos').delete().eq('id', ph.id)
    recharger()
  }

  const annoter = (ph) => setAnnot?.({
    src: ph.url, titre: 'Annoter la photo',
    onSave: async (blob) => {
      const path = `chantiers/${dossierId}/actions/${Date.now()}_annot_${Math.random().toString(36).slice(2)}.jpg`
      const { error } = await supabase.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' })
      if (error) { setErreur?.('Annotation : ' + error.message); setAnnot?.(null); return }
      await supabase.from('action_photos').update({ path }).eq('id', ph.id)
      try { await supabase.storage.from('photos').remove([ph.path]) } catch { /* best effort */ }
      setAnnot?.(null); recharger()
    },
  })

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {photos.map(ph => (
        <div key={ph.id} style={{ position: 'relative' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ph.url} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--ink-200)' }} />
          <button onClick={() => supprimer(ph)} title="Supprimer"
            style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, display: 'grid', placeItems: 'center' }}>✕</button>
          {ph.url && (
            <button onClick={() => annoter(ph)} title="Annoter"
              style={{ position: 'absolute', bottom: -6, right: -6, width: 22, height: 22, borderRadius: '50%', background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, display: 'grid', placeItems: 'center' }}>✎</button>
          )}
        </div>
      ))}
      <label style={{ width: 72, height: 72, borderRadius: 8, border: '2px dashed var(--ink-300)', display: 'grid', placeItems: 'center', cursor: up ? 'wait' : 'pointer' }}>
        <span style={{ fontSize: 22, color: 'var(--ink-300)' }}>{up ? '…' : '+'}</span>
        <input type="file" accept="image/*" multiple disabled={up} style={{ display: 'none' }}
          onChange={e => { const fs = Array.from(e.target.files || []); e.target.value = ''; onFiles(fs) }} />
      </label>
    </div>
  )
}

// ── Checklist vivante d'une action (points de contrôle : cocher + ajouter) ──
function ActionChecklist({ action, setErreur }) {
  const [items, setItems] = useState([])
  const [label, setLabel] = useState('')

  const recharger = useCallback(async () => {
    const { data } = await supabase.from('action_checklist').select('*').eq('action_id', action.id).order('ordre')
    setItems(data || [])
  }, [action.id])

  useEffect(() => { (async () => { await recharger() })() }, [recharger])

  const ajouter = async () => {
    const l = label.trim(); if (!l) return
    setLabel('')
    const { error } = await supabase.from('action_checklist').insert({ action_id: action.id, label: l, ordre: items.length })
    if (error) { setErreur?.('Checklist : ' + error.message); return }
    recharger()
  }

  const cocher = async (item) => {
    const checked = !item.checked
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, checked } : i))
    await supabase.from('action_checklist').update({ checked, checked_at: checked ? new Date().toISOString() : null }).eq('id', item.id)
  }

  const supprimer = async (item) => {
    setItems(prev => prev.filter(i => i.id !== item.id))
    await supabase.from('action_checklist').delete().eq('id', item.id)
  }

  const done = items.filter(i => i.checked).length
  const pct = items.length ? Math.round((done / items.length) * 100) : 0

  return (
    <div style={{ borderTop: '1px solid var(--ink-100)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-500)' }}>
        Points de contrôle{items.length ? ` · ${pct}% (${done}/${items.length})` : ''}
      </div>
      {items.map(item => (
        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={!!item.checked} onChange={() => cocher(item)} style={{ accentColor: '#16a34a' }} />
          <span style={{ flex: 1, fontSize: 12, color: 'var(--ink-700)', textDecoration: item.checked ? 'line-through' : 'none' }}>{item.label}</span>
          <button onClick={() => supprimer(item)} className="btn btn-ghost" style={{ fontSize: 11, padding: '1px 6px', color: '#b91c1c' }}>✕</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={label} onChange={e => setLabel(e.target.value)} onKeyDown={e => e.key === 'Enter' && ajouter()}
          placeholder="Ajouter un point de contrôle…" className="input" style={{ flex: 1, height: 30, fontSize: 12 }} />
        <button onClick={ajouter} className="btn btn-ghost" style={{ fontSize: 11.5, padding: '3px 9px' }}>+</button>
      </div>
    </div>
  )
}
