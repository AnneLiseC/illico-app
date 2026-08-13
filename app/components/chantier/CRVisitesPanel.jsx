'use client'
// Onglet « Rapports de visite » — nouveau système (Lot 1c-1).
// Liste de visites → page par visite avec ses ACTIONS (portée générale ou par lot,
// statut parmi les 16 + date). CRUD direct Supabase (RLS staff). Modèle ArchiReport.
// Photos + checklist = 1c-2 ; aide IA = 1c-3 ; report d'une visite à l'autre = Lot 2.
import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { compressImageToBlob } from '../../lib/images'
import { apiFetch } from '../../lib/api-auth-client'
import { TYPES_VISITE, ORDRE_TYPES } from '../../lib/crRegles'
import BoutonDictee from './BoutonDictee'

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
// Titre d'une visite dans la liste : R1/R2/R3 = le code ; réception = « Réception N » ;
// suivi (et non typé) = « Visite N ».
function titreVisite(v) {
  const t = v.type_visite
  if (t === 'r1' || t === 'r2' || t === 'r3') return t.toUpperCase()
  if (t === 'reception') return `Réception${v.numero_visite ? ' ' + v.numero_visite : ''}`
  return `Visite ${v.numero_visite || '—'}`
}

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : ''

export default function CRVisitesPanel({ id, setErreur, setSucces, setAnnot }) {
  const [visites, setVisites] = useState([])
  const [lots, setLots] = useState([])
  const [selected, setSelected] = useState(null)   // id de la visite ouverte
  const [chargement, setChargement] = useState(true)

  const rechargerVisites = useCallback(async () => {
    const { data, error } = await supabase.from('comptes_rendus')
      .select('id, numero_visite, date_visite, type_visite, prochaine_reunion_at, valide, created_at')
      .eq('dossier_id', id)
      .order('numero_visite', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
    if (error) { setErreur?.('Chargement des visites : ' + error.message); return }
    const visiteIds = (data || []).map(v => v.id)

    // Compteur de suivi par visite : actions du report (inclus) + créées dans la visite,
    // moins celles retirées. « ouvertes » = tout sauf Clôturé / Quitus transmis.
    let compteurs = {}
    if (visiteIds.length) {
      const { data: links } = await supabase.from('cr_actions').select('cr_id, action_id, inclus').in('cr_id', visiteIds)
      const { data: acts } = await supabase.from('actions').select('id, cr_origine_id, statut').eq('dossier_id', id)
      const statutById = Object.fromEntries((acts || []).map(a => [a.id, a.statut]))
      for (const v of (data || [])) {
        const incl = new Set(), excl = new Set()
        for (const l of (links || [])) if (l.cr_id === v.id) (l.inclus ? incl : excl).add(l.action_id)
        const ids = new Set()
        for (const a of (acts || [])) if ((a.cr_origine_id === v.id || incl.has(a.id)) && !excl.has(a.id)) ids.add(a.id)
        let ouvertes = 0
        ids.forEach(aid => { if (!CLOTURANTS.has(statutById[aid])) ouvertes++ })
        compteurs[v.id] = { total: ids.size, ouvertes }
      }
    }
    setVisites((data || []).map(v => ({ ...v, _compteur: compteurs[v.id] })))
  }, [id, setErreur])

  useEffect(() => {
    (async () => {
      await rechargerVisites()
      const { data: l } = await supabase.from('lots').select('id, nom, parent_lot_id, artisan:artisans(id, entreprise, metier)').eq('dossier_id', id).order('ordre')
      setLots(l || [])
      setChargement(false)
    })()
  }, [id, rechargerVisites])

  const nouvelleVisite = async () => {
    // Numérotation PAR TYPE (nouvelle visite = 'suivi' par défaut) : cohérent avec le backfill SQL.
    const maxNum = visites.filter(v => (v.type_visite || 'suivi') === 'suivi').reduce((m, v) => Math.max(m, v.numero_visite || 0), 0)
    const { data, error } = await supabase.from('comptes_rendus')
      .insert({ dossier_id: id, numero_visite: maxNum + 1, date_visite: new Date().toISOString().slice(0, 10), type_visite: 'suivi', valide: false })
      .select().single()
    if (error) { setErreur?.('Nouvelle visite : ' + error.message); return }
    // Report : on reprend toutes les actions NON clôturées du dossier dans la nouvelle visite.
    const { data: ouvertes } = await supabase.from('actions')
      .select('id, statut, texte').eq('dossier_id', id).not('statut', 'in', '(cloture,quitus_transmis)')
    if (ouvertes && ouvertes.length) {
      await supabase.from('cr_actions').insert(ouvertes.map(a => ({
        cr_id: data.id, action_id: a.id, statut_au_cr: a.statut, texte_au_cr: a.texte, inclus: true,
      })))
    }
    await rechargerVisites()
    setSelected(data.id)
  }

  // Supprimer un BROUILLON (jamais une visite publiée : elle a pu être envoyée au client).
  // Les actions NÉES dans ce brouillon (cr_origine_id) sont supprimées avec lui ; les actions
  // reportées d'autres visites ne perdent que leur lien (cr_actions en cascade).
  const supprimerVisite = async (v) => {
    if (v.valide) { setErreur?.('Une visite publiée ne peut pas être supprimée.'); return }
    if (!window.confirm(`Supprimer le brouillon « Visite ${v.numero_visite || ''} » ? Les actions créées dans ce brouillon seront supprimées.`)) return
    await supabase.from('actions').delete().eq('cr_origine_id', v.id)
    const { error } = await supabase.from('comptes_rendus').delete().eq('id', v.id)
    if (error) { setErreur?.('Suppression : ' + error.message); return }
    if (selected === v.id) setSelected(null)
    await rechargerVisites()
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
        <div key={v.id} className="card"
          style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div onClick={() => setSelected(v.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, cursor: 'pointer' }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink-900)' }}>
              {titreVisite(v)}
            </div>
            {!v.type_visite && (
              <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', background: '#94a3b81a', borderRadius: 20, padding: '2px 9px' }}
                title="Type non défini — ouvre la visite pour le choisir">type ?</span>
            )}
            <div style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>{fmtDate(v.date_visite)}</div>
            {v._compteur && v._compteur.total > 0 && (
              <span style={{ fontSize: 11.5, color: 'var(--ink-500)' }}>
                {v._compteur.total} action{v._compteur.total > 1 ? 's' : ''} · <b style={{ color: v._compteur.ouvertes ? '#b45309' : '#15803d' }}>{v._compteur.ouvertes} ouverte{v._compteur.ouvertes > 1 ? 's' : ''}</b>
              </span>
            )}
          </div>
          {v.valide
            ? <span style={{ fontSize: 11, fontWeight: 700, color: '#15803d' }}>Publié</span>
            : <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-500)' }}>Brouillon</span>}
          {!v.valide && (
            <button onClick={() => supprimerVisite(v)} className="btn btn-ghost"
              style={{ fontSize: 11.5, padding: '4px 8px', color: '#b91c1c' }} title="Supprimer ce brouillon">🗑</button>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Page d'une visite : ses actions (générales + par lot) ──
function VisitePage({ visite, dossierId, lots, setErreur, setSucces, setAnnot, onRetour, onMajVisite }) {
  const [actions, setActions] = useState([])
  const [chargement, setChargement] = useState(true)
  const [ancien, setAncien] = useState(null) // { contenu_final } — rapport ANCIEN format (prose), lecture seule
  const visiteId = visite?.id

  const recharger = useCallback(async () => {
    // Actions affichées dans cette visite = créées ici (cr_origine_id) OU reportées (cr_actions
    // inclus), moins celles retirées de cette visite (cr_actions inclus=false).
    const { data: links } = await supabase.from('cr_actions').select('action_id, inclus').eq('cr_id', visiteId)
    const inclusIds = new Set((links || []).filter(l => l.inclus).map(l => l.action_id))
    const exclusIds = new Set((links || []).filter(l => !l.inclus).map(l => l.action_id))
    const { data, error } = await supabase.from('actions')
      .select('*, cibles:action_cibles(id, lot_id, intervenant_id)')
      .eq('dossier_id', dossierId)
      .order('ordre', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) { setErreur?.('Chargement des actions : ' + error.message); return }
    const visibles = (data || []).filter(a => (a.cr_origine_id === visiteId || inclusIds.has(a.id)) && !exclusIds.has(a.id))
    setActions(visibles)
  }, [visiteId, dossierId, setErreur])

  useEffect(() => {
    (async () => {
      await recharger()
      // Pont : contenu prose des anciens rapports (avant le nouveau système), affiché en lecture seule.
      const { data: cr } = await supabase.from('comptes_rendus').select('contenu_final').eq('id', visiteId).maybeSingle()
      setAncien(cr?.contenu_final ? { contenu_final: cr.contenu_final } : null)
      setChargement(false)
    })()
  }, [recharger, visiteId])

  const ajouterAction = async (portee) => {
    const ordre = actions.length
    const numero = `${visite?.numero_visite || 1}.${ordre + 1}`
    const { data, error } = await supabase.from('actions')
      .insert({ dossier_id: dossierId, cr_origine_id: visiteId, portee, numero,
                statut: 'en_cours', statut_date: new Date().toISOString().slice(0, 10), ordre })
      .select('*, cibles:action_cibles(id, lot_id, intervenant_id)').single()
    if (error) { setErreur?.('Ajout action : ' + error.message); return }
    await supabase.from('cr_actions').insert({ cr_id: visiteId, action_id: data.id, statut_au_cr: data.statut, texte_au_cr: data.texte, inclus: true })
    setActions(prev => [...prev, data])
  }

  // Retirer une action REPORTÉE de cette visite (elle reste dans le dossier / les autres visites).
  const retirerDeVisite = async (actionId) => {
    setActions(prev => prev.filter(a => a.id !== actionId))
    const { error } = await supabase.from('cr_actions').upsert({ cr_id: visiteId, action_id: actionId, inclus: false }, { onConflict: 'cr_id,action_id' })
    if (error) { setErreur?.('Retrait : ' + error.message); recharger() }
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

  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfPanel, setPdfPanel] = useState(false)
  const [pdfOpts, setPdfOpts] = useState({ generales: true, parLot: true, photos: true, checklist: true, barrerCloturees: false })
  const [filtreLots, setFiltreLots] = useState(() => new Set()) // vide = toutes les entreprises
  const exporterPDF = async () => {
    setPdfLoading(true)
    try {
      const res = await apiFetch('/api/cr/visite-pdf', {
        method: 'POST',
        body: JSON.stringify({ visite_id: visiteId, options: pdfOpts, filtre_lot_ids: [...filtreLots] }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); setErreur?.(j.error || 'Export PDF impossible.'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch {
      setErreur?.('Erreur réseau export PDF.')
    } finally {
      setPdfLoading(false)
    }
  }
  const togglePdfOpt = (k) => setPdfOpts(o => ({ ...o, [k]: !o[k] }))

  // ── Diffusion (mail) — envoi UNIQUEMENT sur confirmation explicite ──
  const [diffPanel, setDiffPanel] = useState(false)
  const [diffLots, setDiffLots] = useState(() => new Set())
  const [diffClient, setDiffClient] = useState(false)
  const [filtrerParLot, setFiltrerParLot] = useState(false)
  const [diffLoading, setDiffLoading] = useState(false)
  const toggleDiffLot = (id) => setDiffLots(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const diffuser = async () => {
    const lot_ids = [...diffLots]
    const n = lot_ids.length + (diffClient ? 1 : 0)
    if (!n) { setErreur?.('Sélectionne au moins un destinataire.'); return }
    // Garde-fou : envoi réel de mails → confirmation obligatoire.
    if (!window.confirm(`Envoyer le rapport de visite par mail à ${n} destinataire(s) MAINTENANT ? Le mail part immédiatement.`)) return
    setDiffLoading(true)
    try {
      const res = await apiFetch('/api/cr/visite-diffuser', {
        method: 'POST',
        body: JSON.stringify({ visite_id: visiteId, lot_ids, inclure_client: diffClient, filtrer_par_lot: filtrerParLot }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErreur?.(j.error || 'Diffusion impossible.'); return }
      const envoyes = j.envoyes?.length || 0
      const erreurs = j.erreurs?.length || 0
      if (envoyes) setSucces?.(`${envoyes} mail(s) envoyé(s)${erreurs ? ` · ${erreurs} échec(s)` : ''} ✓`)
      else setErreur?.(erreurs ? `Aucun envoi — ${erreurs} destinataire(s) en échec (email manquant ?).` : 'Aucun destinataire.')
      setDiffPanel(false)
    } catch {
      setErreur?.('Erreur réseau diffusion.')
    } finally {
      setDiffLoading(false)
    }
  }

  // ── Aide IA (optionnelle) : notes → actions candidates → validation → insertion ──
  const [iaOuvert, setIaOuvert] = useState(false)
  const [iaNotes, setIaNotes] = useState('')
  const [iaLoading, setIaLoading] = useState(false)
  const [iaCandidats, setIaCandidats] = useState(null) // [{...action, sel}]
  const [datesCandidats, setDatesCandidats] = useState(null) // [{lot_id, date_debut, date_fin, sel}] (reprise ancien → planning)
  const [datesLoading, setDatesLoading] = useState(false)
  const [repriseOuvert, setRepriseOuvert] = useState(false) // panneau dédié de reprise d'un ancien rapport
  const repriseRef = useRef(null)

  const analyserIA = async (notesArg, source) => {
    const notes = (typeof notesArg === 'string' ? notesArg : iaNotes).trim()
    if (!notes) return
    setIaLoading(true); setIaCandidats(null)
    try {
      const res = await apiFetch('/api/actions/suggest', {
        method: 'POST',
        body: JSON.stringify({ notes, lots: lots.map(l => ({ id: l.id, nom: l.nom })), type_visite: visite?.type_visite || 'suivi', source: source || undefined }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErreur?.(j.error || 'Analyse IA impossible.'); return }
      setIaCandidats((j.actions || []).map(a => ({ ...a, sel: true })))
    } catch {
      setErreur?.('Erreur réseau IA.')
    } finally {
      setIaLoading(false)
    }
  }

  const importerIA = async () => {
    const choisies = (iaCandidats || []).filter(c => c.sel)
    if (!choisies.length) return
    let ordre = actions.length
    for (const c of choisies) {
      const numero = `${visite?.numero_visite || 1}.${ordre + 1}`
      const { data, error } = await supabase.from('actions')
        .insert({ dossier_id: dossierId, cr_origine_id: visiteId, portee: c.portee, numero,
                  titre: c.titre || null, texte: c.texte || null, statut: c.statut,
                  statut_date: c.statut_date || new Date().toISOString().slice(0, 10), ordre })
        .select().single()
      if (error) { setErreur?.('Import action : ' + error.message); continue }
      ordre++
      await supabase.from('cr_actions').insert({ cr_id: visiteId, action_id: data.id, statut_au_cr: data.statut, texte_au_cr: data.texte, inclus: true })
      if (c.portee === 'lot' && c.lot_nom) {
        const lot = lots.find(l => (l.nom || '').toLowerCase() === c.lot_nom.toLowerCase())
        if (lot) await supabase.from('action_cibles').insert({ action_id: data.id, lot_id: lot.id })
      }
    }
    setSucces?.(`${choisies.length} action(s) ajoutée(s) ✓`)
    if (!datesCandidats?.length) { setIaOuvert(false); setIaNotes('') }  // rien à valider côté dates → on ferme
    setIaCandidats(null)
    recharger()
  }

  // ── Extraction des DATES depuis un texte (reprise d'un ancien rapport → planning/Gantt) ──
  const extraireDates = async (notesArg) => {
    const notes = (typeof notesArg === 'string' ? notesArg : '').trim()
    if (!notes || !lots.length) return
    setDatesLoading(true); setDatesCandidats(null)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const res = await apiFetch('/api/lots/dates', {
        method: 'POST',
        body: JSON.stringify({ dossier_id: dossierId, notes, today, lots: lots.map(l => ({ id: l.id, nom: l.nom, artisan: l.artisan?.entreprise || '' })) }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErreur?.(j.error || 'Extraction des dates impossible.'); return }
      setDatesCandidats((j.propositions || []).map(p => ({ ...p, sel: true })))
    } catch {
      setErreur?.('Erreur réseau IA (dates).')
    } finally { setDatesLoading(false) }
  }

  // Applique les dates retenues aux LOTS → elles apparaissent dans le Gantt (onglet Planning).
  const appliquerDatesReprise = async () => {
    const choisies = (datesCandidats || []).filter(c => c.sel && c.lot_id)
    for (const c of choisies) {
      const { error } = await supabase.from('lots')
        .update({ date_debut: c.date_debut, date_fin: c.date_fin, updated_at: new Date().toISOString() })
        .eq('id', c.lot_id)
      if (error) setErreur?.('Dates : ' + error.message)
    }
    setDatesCandidats(null); setIaOuvert(false); setIaNotes('')
    setSucces?.(`${choisies.length} date(s) appliquée(s) au planning ✓`)
  }

  // Reprise complète d'un ancien rapport (prose) : actions + dates, à valider. N'altère jamais l'original.
  const reecrireDepuisAncien = () => {
    const notes = ancien?.contenu_final
    if (!notes) return
    setRepriseOuvert(true)
    analyserIA(notes, 'ancien_rapport')
    extraireDates(notes)
    setTimeout(() => repriseRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 250)
  }

  const nomLot = (lid) => lots.find(l => l.id === lid)?.nom || '—'

  const generales = actions.filter(a => a.portee === 'generale')
  const parLot = actions.filter(a => a.portee === 'lot')
  const ouvertes = actions.filter(a => !CLOTURANTS.has(a.statut)).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button onClick={onRetour} className="btn btn-ghost" style={{ fontSize: 12.5 }}>← Visites</button>
        <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--ink-900)' }}>
          Visite {visite?.numero_visite || '—'}
        </div>
        <select value={visite?.type_visite || 'suivi'}
          onChange={e => supabase.from('comptes_rendus').update({ type_visite: e.target.value }).eq('id', visiteId).then(onMajVisite)}
          className="input" style={{ height: 32, fontSize: 12, flex: '0 1 220px' }} title="Type de visite : oriente les règles de rédaction de l'IA">
          {ORDRE_TYPES.map(t => <option key={t} value={t}>{TYPES_VISITE[t]}</option>)}
        </select>
        {actions.length > 0 && (
          <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>
            {actions.length} action{actions.length > 1 ? 's' : ''} · <b style={{ color: ouvertes ? '#b45309' : '#15803d' }}>{ouvertes} ouverte{ouvertes > 1 ? 's' : ''}</b>
          </span>
        )}
        <input type="date" defaultValue={visite?.date_visite || ''} className="input" style={{ height: 34, fontSize: 12.5 }}
          onBlur={e => e.target.value !== visite?.date_visite && supabase.from('comptes_rendus').update({ date_visite: e.target.value || null }).eq('id', visiteId).then(onMajVisite)} />
        <div style={{ flex: 1 }} />
        <button onClick={() => setIaOuvert(o => !o)} className="btn btn-ghost" style={{ fontSize: 12.5 }}>Aide IA</button>
        <button onClick={() => setPdfPanel(p => !p)} className="btn btn-ghost" style={{ fontSize: 12.5 }}>Exporter PDF</button>
        <button onClick={() => setDiffPanel(p => !p)} className="btn btn-ghost" style={{ fontSize: 12.5 }}>Diffuser</button>
        {!visite?.valide && <button onClick={publier} className="btn btn-primary" style={{ fontSize: 12.5, background: '#15803d', borderColor: '#15803d' }}>Publier</button>}
      </div>

      {diffPanel && (
        <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, borderColor: 'rgba(220,38,38,0.3)' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-700)' }}>Diffuser le rapport de visite par mail</div>
          <div style={{ fontSize: 11.5, color: '#b45309' }}>Les destinataires cochés recevront un mail réel dès que tu confirmeras.</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-600)' }}>Artisans (par lot) :</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {lots.filter(l => !l.parent_lot_id).length === 0 && <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>Aucun lot — crée-les d’abord dans l’onglet Lots.</span>}
            {lots.filter(l => !l.parent_lot_id).map(l => {
              const art = l.artisan?.entreprise || l.artisan?.metier
              return (
                <label key={l.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                  <input type="checkbox" checked={diffLots.has(l.id)} onChange={() => toggleDiffLot(l.id)} style={{ accentColor: '#4f46e5' }} />
                  {art ? <b>{art}</b> : <span style={{ color: '#b45309' }}>{l.nom} (aucun artisan → pas d’envoi)</span>}
                </label>
              )
            })}
          </div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
            <input type="checkbox" checked={diffClient} onChange={() => setDiffClient(v => !v)} style={{ accentColor: '#4f46e5' }} /> Envoyer aussi au client
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <input type="checkbox" checked={filtrerParLot} onChange={() => setFiltrerParLot(v => !v)} style={{ accentColor: '#4f46e5' }} /> Chaque artisan ne reçoit que son lot (+ les générales)
          </label>
          <div>
            <button onClick={diffuser} disabled={diffLoading} className="btn btn-primary" style={{ fontSize: 12.5, background: '#b91c1c', borderColor: '#b91c1c' }}>
              {diffLoading ? 'Envoi…' : 'Envoyer (confirmation demandée)'}
            </button>
          </div>
        </div>
      )}

      {pdfPanel && (
        <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-700)' }}>Export PDF — que veux-tu dedans ?</div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5 }}>
            {[['generales', 'Remarques générales'], ['parLot', 'Par lot'], ['photos', 'Photos'], ['checklist', 'Checklist'], ['barrerCloturees', 'Barrer les clôturées']].map(([k, lbl]) => (
              <label key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={!!pdfOpts[k]} onChange={() => togglePdfOpt(k)} style={{ accentColor: '#4f46e5' }} /> {lbl}
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--ink-600)' }}>Limiter aux entreprises (rien de coché = toutes) :</span>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {lots.filter(l => !l.parent_lot_id).map(l => (
                <label key={l.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5 }}>
                  <input type="checkbox" checked={filtreLots.has(l.id)}
                    onChange={() => setFiltreLots(s => { const n = new Set(s); n.has(l.id) ? n.delete(l.id) : n.add(l.id); return n })}
                    style={{ accentColor: '#4f46e5' }} />
                  {l.artisan?.entreprise || l.nom}
                </label>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex' }}>
            <div style={{ flex: 1 }} />
            <button onClick={exporterPDF} disabled={pdfLoading} className="btn btn-primary" style={{ fontSize: 12.5 }}>{pdfLoading ? 'Génération…' : 'Générer le PDF'}</button>
          </div>
        </div>
      )}

      {iaOuvert && (
        <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, borderColor: 'rgba(99,102,241,0.35)' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-700)' }}>Notes de visite — dicte ou tape. Ensuite, au choix : laisse l&apos;IA proposer des actions, ou ajoute-les toi-même.</div>
          <textarea value={iaNotes} onChange={e => setIaNotes(e.target.value)} rows={4}
            placeholder="Dicte au micro ou tape tes notes… (ex. « muret entrée à refaire avant le 12/02 ; peinture RAS »)"
            className="input" style={{ padding: 10, fontSize: 12.5, lineHeight: 1.5, resize: 'vertical', minHeight: 80 }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <BoutonDictee dossierId={dossierId} setErreur={setErreur}
              onTexte={txt => setIaNotes(prev => [prev, txt].filter(Boolean).join(' '))} />
            <button onClick={analyserIA} disabled={iaLoading || !iaNotes.trim()} className="btn btn-primary" style={{ fontSize: 12.5 }}>
              {iaLoading ? 'Analyse…' : 'Analyser avec l’IA'}
            </button>
            {iaCandidats && iaCandidats.length > 0 && (
              <button onClick={importerIA} className="btn btn-ghost" style={{ fontSize: 12.5 }}>
                Ajouter les {iaCandidats.filter(c => c.sel).length} cochée(s)
              </button>
            )}
          </div>

          {iaCandidats && iaCandidats.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>Aucune action détectée dans ces notes.</div>
          )}
          {iaCandidats && iaCandidats.map((c, i) => {
            const s = STATUT_MAP[c.statut] || STATUTS[0]
            return (
              <label key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, padding: '4px 0', borderTop: '1px solid var(--ink-100)' }}>
                <input type="checkbox" checked={c.sel} onChange={() => setIaCandidats(prev => prev.map((x, j) => j === i ? { ...x, sel: !x.sel } : x))} style={{ marginTop: 3 }} />
                <span style={{ flex: 1 }}>
                  <b>{c.titre || c.texte.slice(0, 40)}</b>{c.texte && c.titre ? ` — ${c.texte}` : ''}
                  <span style={{ marginLeft: 6, color: s.c, fontWeight: 700 }}>· {s.l}</span>
                  {c.portee === 'lot' && c.lot_nom && <span style={{ color: 'var(--ink-500)' }}> · {c.lot_nom}</span>}
                  {c.statut_date && <span style={{ color: 'var(--ink-500)' }}> · {fmtDate(c.statut_date)}</span>}
                </span>
              </label>
            )
          })}
        </div>
      )}

      {!chargement && ancien?.contenu_final && (
        <div className="card" style={{ padding: 14, borderColor: 'rgba(99,102,241,0.35)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#4338ca', background: 'rgba(99,102,241,0.10)', padding: '4px 10px', borderRadius: 8, alignSelf: 'flex-start' }}>
            Ancien format · lecture seule
          </div>
          <RenderProse text={ancien.contenu_final} />
          <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>Ce rapport a été rédigé avec l&apos;ancien système. L&apos;original reste intact (il a pu être envoyé au client) — la réécriture ne fait qu&apos;en <b>extraire</b> des actions et des dates, à valider.</div>
          <button onClick={reecrireDepuisAncien} disabled={iaLoading || datesLoading} className="btn btn-primary" style={{ fontSize: 12.5, alignSelf: 'flex-start' }}>
            {(iaLoading || datesLoading) ? 'Analyse…' : 'Réécrire au nouveau format'}
          </button>
        </div>
      )}

      {repriseOuvert && (
        <div ref={repriseRef} className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14, borderColor: 'rgba(99,102,241,0.35)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-800)' }}>Reprise du rapport au nouveau format</span>
            <div style={{ flex: 1 }} />
            <button onClick={() => { setRepriseOuvert(false); setIaCandidats(null); setDatesCandidats(null) }} className="btn btn-ghost" style={{ fontSize: 11.5, padding: '4px 10px' }}>Fermer</button>
          </div>

          {/* Étape 1 — Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-700)' }}>1 · Actions à créer</div>
            {iaLoading && <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>Analyse en cours…</div>}
            {!iaLoading && iaCandidats && iaCandidats.length === 0 && <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>Aucune action détectée.</div>}
            {!iaLoading && !iaCandidats && <div style={{ fontSize: 12, color: '#15803d' }}>Actions traitées.</div>}
            {iaCandidats && iaCandidats.map((c, i) => {
              const s = STATUT_MAP[c.statut] || STATUTS[0]
              return (
                <label key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, padding: '4px 0', borderTop: '1px solid var(--ink-100)' }}>
                  <input type="checkbox" checked={c.sel} onChange={() => setIaCandidats(prev => prev.map((x, j) => j === i ? { ...x, sel: !x.sel } : x))} style={{ marginTop: 3 }} />
                  <span style={{ flex: 1 }}>
                    <b>{c.titre || c.texte.slice(0, 40)}</b>{c.texte && c.titre ? ` — ${c.texte}` : ''}
                    <span style={{ marginLeft: 6, color: s.c, fontWeight: 700 }}>· {s.l}</span>
                    {c.portee === 'lot' && c.lot_nom && <span style={{ color: 'var(--ink-500)' }}> · {c.lot_nom}</span>}
                    {c.statut_date && <span style={{ color: 'var(--ink-500)' }}> · {fmtDate(c.statut_date)}</span>}
                  </span>
                </label>
              )
            })}
            {iaCandidats && iaCandidats.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={importerIA} className="btn btn-primary" style={{ fontSize: 11.5, padding: '4px 12px' }}>Créer les {iaCandidats.filter(c => c.sel).length} action(s)</button>
              </div>
            )}
          </div>

          {/* Étape 2 — Dates */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid var(--ink-100)', paddingTop: 12 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-700)' }}>2 · Dates à placer dans le planning</div>
            {datesLoading && <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>Analyse en cours…</div>}
            {!datesLoading && datesCandidats && datesCandidats.length === 0 && <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>Aucune date de lot exploitable.</div>}
            {!datesLoading && !datesCandidats && <div style={{ fontSize: 12, color: '#15803d' }}>Dates traitées.</div>}
            {datesCandidats && datesCandidats.map((c, i) => (
              <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, flexWrap: 'wrap', opacity: c.sel ? 1 : 0.5 }}>
                <input type="checkbox" checked={c.sel} onChange={() => setDatesCandidats(prev => prev.map((x, j) => j === i ? { ...x, sel: !x.sel } : x))} />
                <b style={{ flex: '0 1 150px' }}>{nomLot(c.lot_id)}</b>
                <input type="date" value={c.date_debut} onChange={e => setDatesCandidats(prev => prev.map((x, j) => j === i ? { ...x, date_debut: e.target.value } : x))} className="input" style={{ height: 30, fontSize: 12 }} />
                <input type="date" value={c.date_fin} onChange={e => setDatesCandidats(prev => prev.map((x, j) => j === i ? { ...x, date_fin: e.target.value } : x))} className="input" style={{ height: 30, fontSize: 12 }} />
              </label>
            ))}
            {datesCandidats && datesCandidats.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={appliquerDatesReprise} className="btn btn-primary" style={{ fontSize: 11.5, padding: '4px 12px' }}>Appliquer au planning</button>
              </div>
            )}
          </div>
        </div>
      )}

      {chargement ? <div style={{ color: 'var(--ink-500)' }}>Chargement des actions…</div> : (
        <>
          <Section titre="Remarques générales" onAjouter={() => ajouterAction('generale')}>
            {generales.map(a => (
              <ActionCard key={a.id} action={a} lots={lots} dossierId={dossierId} setAnnot={setAnnot} setErreur={setErreur}
                carried={a.cr_origine_id !== visiteId} onMaj={majAction} onSupprimer={supprimerAction} onRetirer={() => retirerDeVisite(a.id)} />
            ))}
            {generales.length === 0 && <Vide />}
          </Section>

          <Section titre="Par lot / artisan" onAjouter={() => ajouterAction('lot')}>
            {parLot.map(a => (
              <ActionCard key={a.id} action={a} lots={lots} withLot dossierId={dossierId} setAnnot={setAnnot} setErreur={setErreur}
                carried={a.cr_origine_id !== visiteId} onMaj={majAction} onSupprimer={supprimerAction} onRetirer={() => retirerDeVisite(a.id)}
                onSetLot={(lotId) => setCibleLot(a, lotId)} />
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

// Rendu lisible d'un ancien rapport en prose (markdown léger : titres ##, gras **, listes -).
// Lecture seule : on n'altère jamais le texte original, on l'affiche juste proprement.
function inlineFmt(s) {
  return String(s).split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    (p.startsWith('**') && p.endsWith('**')) ? <b key={i}>{p.slice(2, -2)}</b> : <span key={i}>{p}</span>)
}
function RenderProse({ text }) {
  const lignes = String(text || '').split('\n')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, fontSize: 12.5, color: 'var(--ink-700)', lineHeight: 1.55 }}>
      {lignes.map((ln, i) => {
        const h = ln.match(/^\s*#{1,6}\s+(.*)/)
        if (h) return <div key={i} style={{ fontWeight: 700, color: 'var(--ink-900)', fontSize: 13, marginTop: i ? 9 : 0 }}>{inlineFmt(h[1])}</div>
        const b = ln.match(/^\s*[-*]\s+(.*)/)
        if (b) return <div key={i} style={{ paddingLeft: 14 }}>• {inlineFmt(b[1])}</div>
        if (!ln.trim()) return <div key={i} style={{ height: 5 }} />
        return <div key={i}>{inlineFmt(ln)}</div>
      })}
    </div>
  )
}

// ── Carte d'une action éditable (statut, texte, photos annotées, checklist vivante) ──
function ActionCard({ action, lots, withLot, carried, dossierId, setAnnot, setErreur, onMaj, onSupprimer, onRetirer, onSetLot }) {
  const st = STATUT_MAP[action.statut] || STATUTS[0]
  const cibleLot = action.cibles?.find(c => c.lot_id)?.lot_id || ''

  return (
    <div className="card" style={{ padding: 12, borderLeft: `3px solid ${st.c}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink-500)' }}>{action.numero}</span>
        {carried && <span style={{ fontSize: 10, fontWeight: 700, color: '#4338ca', background: 'rgba(99,102,241,0.12)', padding: '1px 6px', borderRadius: 99 }}>reportée</span>}

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
            {lots.map(l => <option key={l.id} value={l.id}>{l.parent_lot_id ? '— ' : ''}{l.nom}{l.artisan?.entreprise ? ' — ' + l.artisan.entreprise : ''}</option>)}
          </select>
        )}

        <div style={{ flex: 1 }} />
        {carried
          ? <button onClick={() => onRetirer?.()} className="btn btn-ghost" style={{ fontSize: 11.5, padding: '3px 8px', color: 'var(--ink-500)' }} title="Retirer de cette visite (l'action reste dans le dossier)">Retirer</button>
          : <button onClick={() => onSupprimer(action.id)} className="btn btn-ghost" style={{ fontSize: 11.5, padding: '3px 8px', color: '#b91c1c' }}>Supprimer</button>}
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
  const [picker, setPicker] = useState(false)          // sélecteur de photos du dossier
  const [dossierPhotos, setDossierPhotos] = useState(null)

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

  // Sélecteur : photos DÉJÀ dans le dossier (prises ailleurs dans l'app).
  const ouvrirPicker = async () => {
    setPicker(true)
    if (dossierPhotos) return
    const { data } = await supabase.from('photos').select('id, url, categorie').eq('dossier_id', dossierId).order('created_at', { ascending: false })
    const rows = data || []
    if (!rows.length) { setDossierPhotos([]); return }
    const { data: signed } = await supabase.storage.from('photos').createSignedUrls(rows.map(r => r.url), 3600)
    const urlByPath = Object.fromEntries((signed || []).map(s => [s.path, s.signedUrl]))
    setDossierPhotos(rows.map(r => ({ ...r, thumb: urlByPath[r.url] || '' })))
  }
  // Attache une photo du dossier : on COPIE vers un chemin propre à l'action → supprimer la
  // photo de l'action n'efface jamais l'originale du dossier.
  const attacher = async (p) => {
    const dest = `chantiers/${dossierId}/actions/${crypto.randomUUID()}.jpg`
    const { error } = await supabase.storage.from('photos').copy(p.url, dest)
    if (error) { setErreur?.('Ajout depuis le dossier : ' + error.message); return }
    await supabase.from('action_photos').insert({ action_id: action.id, path: dest, ordre: photos.length })
    setPicker(false)
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
      <label title="Ajouter depuis l'ordinateur" style={{ width: 72, height: 72, borderRadius: 8, border: '2px dashed var(--ink-300)', display: 'grid', placeItems: 'center', textAlign: 'center', cursor: up ? 'wait' : 'pointer', color: 'var(--ink-400)', fontSize: 10.5, lineHeight: 1.2, padding: 4 }}>
        {up ? 'Envoi…' : 'Depuis l’ordinateur'}
        <input type="file" accept="image/*" multiple disabled={up} style={{ display: 'none' }}
          onChange={e => { const fs = Array.from(e.target.files || []); e.target.value = ''; onFiles(fs) }} />
      </label>
      <button type="button" onClick={ouvrirPicker} title="Choisir parmi les photos du dossier"
        style={{ width: 72, height: 72, borderRadius: 8, border: '2px dashed var(--ink-300)', background: 'none', cursor: 'pointer', color: 'var(--ink-400)', fontSize: 10.5, lineHeight: 1.2, padding: 4 }}>
        Depuis le dossier
      </button>

      {picker && (
        <div style={{ flexBasis: '100%', border: '1px solid var(--ink-200)', borderRadius: 8, padding: 10, marginTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-600)' }}>Photos du dossier</span>
            <div style={{ flex: 1 }} />
            <button onClick={() => setPicker(false)} className="btn btn-ghost" style={{ fontSize: 11.5, padding: '3px 9px' }}>Fermer</button>
          </div>
          {dossierPhotos === null && <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>Chargement…</div>}
          {dossierPhotos && dossierPhotos.length === 0 && <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>Aucune photo dans ce dossier pour l’instant.</div>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(dossierPhotos || []).map(p => (
              <button key={p.id} type="button" onClick={() => attacher(p)} title={`Ajouter (${p.categorie || 'photo'})`}
                style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.thumb} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--ink-200)' }} />
              </button>
            ))}
          </div>
        </div>
      )}
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
