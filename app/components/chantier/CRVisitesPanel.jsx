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

// Types gérés par l'ancien système prose (générateur IA + CR manuel), pas par les actions.
const TYPES_ANCIENS = new Set(['r1', 'r2', 'r3'])

export default function CRVisitesPanel({ id, setErreur, setSucces, setAnnot, onCreerAncien, onEditerAncien, onPdfProse, refreshKey }) {
  const [visites, setVisites] = useState([])
  const [lots, setLots] = useState([])
  const [selected, setSelected] = useState(null)   // id de la visite ouverte
  const [chargement, setChargement] = useState(true)
  const [menuNouv, setMenuNouv] = useState(false)   // menu de choix du type à la création

  const rechargerVisites = useCallback(async () => {
    const { data, error } = await supabase.from('comptes_rendus')
      .select('id, numero_visite, date_visite, type_visite, contenu_final, photos_jointes, prochaine_reunion_at, valide, created_at')
      .eq('dossier_id', id)
      .order('numero_visite', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
    if (error) { setErreur?.('Chargement des visites : ' + error.message); return }
    // Affiche la LISTE tout de suite (sans attendre les compteurs ni les lots) → plus de « Chargement… » bloquant.
    setVisites(data || [])
    setChargement(false)
    const visiteIds = (data || []).map(v => v.id)

    // Compteur de suivi par visite : actions du report (inclus) + créées dans la visite,
    // moins celles retirées. « ouvertes » = tout sauf Clôturé / Quitus transmis. Calculé APRÈS
    // l'affichage (les 2 requêtes en parallèle), puis fusionné dans la liste déjà visible.
    let compteurs = {}
    if (visiteIds.length) {
      const [{ data: links }, { data: acts }] = await Promise.all([
        supabase.from('cr_actions').select('cr_id, action_id, inclus').in('cr_id', visiteIds),
        supabase.from('actions').select('id, cr_origine_id, statut').eq('dossier_id', id),
      ])
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
    // Lots en PARALLÈLE (utilisés seulement à l'ouverture d'une visite) — ne bloque pas la liste.
    // ⚠ On n'utilise PAS l'embed « artisan:artisans(...) » : il ne peuplait pas les lots (dropdown
    // vide) alors que la page Lots, qui fait un simple .select('*') + fetch artisans séparé, marche.
    // On copie donc ce pattern éprouvé, et on vérifie l'erreur au lieu de l'avaler (setLots(data||[])).
    ;(async () => {
      const { data: lotsData, error } = await supabase.from('lots')
        .select('id, nom, parent_lot_id, date_debut, date_fin, artisan_id').eq('dossier_id', id).order('ordre')
      if (error) { setErreur?.('Chargement des lots : ' + error.message); setLots([]); return }
      const rows = lotsData || []
      const artIds = [...new Set(rows.map(l => l.artisan_id).filter(Boolean))]
      let artById = {}
      if (artIds.length) {
        const { data: arts } = await supabase.from('artisans').select('id, entreprise, metier').in('id', artIds)
        artById = Object.fromEntries((arts || []).map(a => [a.id, a]))
      }
      setLots(rows.map(l => ({ ...l, artisan: l.artisan_id ? (artById[l.artisan_id] || null) : null })))
    })()
    rechargerVisites()  // affiche la liste dès qu'elle arrive + bascule chargement=false (voir plus haut)
  }, [id, rechargerVisites, refreshKey, setErreur])  // refreshKey : re-fetch après création/édition prose (ancien modal)

  // Nouvelle visite STRUCTURÉE (suivi / réception uniquement — R1/R2/R3 passent par l'ancien).
  const nouvelleVisite = async (type = 'suivi') => {
    setMenuNouv(false)
    // Numérotation PAR TYPE : cohérent avec le backfill SQL.
    const maxNum = visites.filter(v => (v.type_visite || 'suivi') === type).reduce((m, v) => Math.max(m, v.numero_visite || 0), 0)
    const { data, error } = await supabase.from('comptes_rendus')
      .insert({ dossier_id: id, numero_visite: maxNum + 1, date_visite: new Date().toISOString().slice(0, 10), type_visite: type, valide: false })
      .select().single()
    if (error) { setErreur?.('Nouvelle visite : ' + error.message); return }
    // Report : on reprend les actions ouvertes du dossier, SAUF les clôturées/quitus/actées et SAUF
    // les ARCHIVÉES (supprime_at) — le marqueur permanent garantit qu'une remarque archivée ne
    // revient jamais, même plusieurs CR plus tard.
    const { data: ouvertes } = await supabase.from('actions')
      .select('id, statut, texte').eq('dossier_id', id).is('supprime_at', null).not('statut', 'in', '(cloture,quitus_transmis,acte)')
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
    // Nombre de rapports PROSE (ancien système) du dossier → conditionne le bouton « Consolider ».
    const anciensProse = visites.filter(v => (v.contenu_final || '').trim()).length
    return <VisitePage visite={visite} dossierId={id} lots={lots} setErreur={setErreur} setSucces={setSucces} setAnnot={setAnnot}
             anciensProse={anciensProse} onEditerAncien={onEditerAncien} onPdfProse={onPdfProse}
             onRetour={() => { setSelected(null); rechargerVisites() }} onMajVisite={rechargerVisites} />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', position: 'relative' }}>
        <button onClick={() => setMenuNouv(m => !m)} className="btn btn-primary" style={{ fontSize: 12.5 }}>+ Nouvelle visite</button>
        {menuNouv && (
          <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 20, background: 'var(--surface, #fff)', border: '1px solid var(--ink-200)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 6, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 240 }}>
            <button onClick={() => nouvelleVisite('suivi')} className="btn btn-ghost" style={{ fontSize: 12.5, justifyContent: 'flex-start' }}>Suivi de chantier <span style={{ color: 'var(--ink-400)', marginLeft: 4 }}>· actions</span></button>
            <button onClick={() => nouvelleVisite('reception')} className="btn btn-ghost" style={{ fontSize: 12.5, justifyContent: 'flex-start' }}>Réception <span style={{ color: 'var(--ink-400)', marginLeft: 4 }}>· actions</span></button>
            <div style={{ borderTop: '1px solid var(--ink-100)', margin: '2px 0' }} />
            <button onClick={() => { setMenuNouv(false); onCreerAncien?.() }} className="btn btn-ghost" style={{ fontSize: 12.5, justifyContent: 'flex-start' }}>R1 / R2 / R3</button>
          </div>
        )}
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
          <div onClick={() => setSelected(v.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, cursor: 'pointer' }}>
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
function VisitePage({ visite, dossierId, lots, setErreur, setSucces, setAnnot, anciensProse = 0, onEditerAncien, onPdfProse, onRetour, onMajVisite }) {
  // R1/R2/R3 = ancien système prose : page de LECTURE (pas d'actions), affichage instantané.
  const estProse = TYPES_ANCIENS.has(visite?.type_visite)
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
    // Pas de filtre supprime_at ici : l'appartenance à CE CR (cr_origine / cr_actions inclus) fait foi.
    // Une remarque archivée est retirée du CR courant (inclus=false) mais reste dans les CR passés.
    const { data, error } = await supabase.from('actions')
      .select('*, cibles:action_cibles(id, lot_id, intervenant_id)')
      .eq('dossier_id', dossierId)
      .order('ordre', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) { setErreur?.('Chargement des actions : ' + error.message); return }
    const visibles = (data || []).filter(a => (a.cr_origine_id === visiteId || inclusIds.has(a.id)) && !exclusIds.has(a.id))
    setActions(visibles)
  }, [visiteId, dossierId, setErreur])

  // ── Historique / Corbeille : actions RETIRÉES de cette visite (récupérables) + actions
  //    SUPPRIMÉES du dossier (archivées). Permet de comprendre où est passée une action et de la récupérer.
  const [histOuvert, setHistOuvert] = useState(false)
  const [hist, setHist] = useState(null)   // { retirees: [...], supprimees: [...] } | null
  const chargerHistorique = useCallback(async () => {
    const FERMES = new Set(['cloture', 'quitus_transmis', 'acte'])
    const { data: all } = await supabase.from('actions')
      .select('id, numero, portee, statut, titre, texte, supprime_at')
      .eq('dossier_id', dossierId).order('numero')
    const rows = all || []
    // Archivées (retirées / supprimées) → récupérables.
    const archivees = rows.filter(a => a.supprime_at)
      .sort((x, y) => String(y.supprime_at).localeCompare(String(x.supprime_at)))
    // Qui ne se reportent pas (Clôturé / Quitus transmis / Acté), non archivées → pour mémoire.
    const fermees = rows.filter(a => !a.supprime_at && FERMES.has(a.statut))
    setHist({ archivees, fermees })
  }, [dossierId])

  useEffect(() => {
    (async () => {
      // R1/R2/R3 : pas d'actions à charger — on affiche direct le contenu prose déjà en mémoire.
      if (estProse) { setChargement(false); return }
      await recharger()
      // Pont : contenu prose des anciens rapports (avant le nouveau système), affiché en lecture seule.
      const { data: cr } = await supabase.from('comptes_rendus').select('contenu_final').eq('id', visiteId).maybeSingle()
      setAncien(cr?.contenu_final ? { contenu_final: cr.contenu_final } : null)
      setChargement(false)
    })()
  }, [recharger, visiteId, estProse])

  // Prochain suffixe de numéro pour CETTE visite : max des suffixes déjà utilisés par ses propres
  // actions + 1. Robuste aux doublons (l'ancien calcul basé sur actions.length, qui comptait aussi
  // les actions reportées, produisait des collisions type « 9.15 » en double).
  const maxSuffixeVisite = () => {
    const s = actions
      .filter(a => a.cr_origine_id === visiteId)
      .map(a => parseInt(String(a.numero || '').split('.')[1] || '0', 10))
      .filter(Number.isFinite)
    return s.length ? Math.max(...s) : 0
  }

  const ajouterAction = async (portee) => {
    const ordre = actions.length
    const numero = `${visite?.numero_visite || 1}.${maxSuffixeVisite() + 1}`
    const { data, error } = await supabase.from('actions')
      .insert({ dossier_id: dossierId, cr_origine_id: visiteId, portee, numero,
                statut: 'en_cours', statut_date: new Date().toISOString().slice(0, 10), ordre })
      .select('*, cibles:action_cibles(id, lot_id, intervenant_id)').single()
    if (error) { setErreur?.('Ajout action : ' + error.message); return }
    await supabase.from('cr_actions').insert({ cr_id: visiteId, action_id: data.id, statut_au_cr: data.statut, texte_au_cr: data.texte, inclus: true })
    setActions(prev => [...prev, data])
  }

  // ARCHIVER une remarque : marqueur permanent (supprime_at) + retrait de CE CR (inclus=false).
  // → elle sort d'ici ET des CR suivants (jamais reportée), reste dans les CR passés (leur lien
  // inclus=true est intact), et devient récupérable via l'Historique.
  const archiver = async (actionId) => {
    setActions(prev => prev.filter(a => a.id !== actionId))
    const { error } = await supabase.from('actions').update({ supprime_at: new Date().toISOString() }).eq('id', actionId)
    if (error) { setErreur?.('Archivage : ' + error.message); recharger(); return }
    await supabase.from('cr_actions').upsert({ cr_id: visiteId, action_id: actionId, inclus: false }, { onConflict: 'cr_id,action_id' })
  }

  // « Retirer du CR » (remarque reportée) = archivage.
  const retirerDeVisite = archiver

  const majAction = async (actionId, champs) => {
    setActions(prev => prev.map(a => a.id === actionId ? { ...a, ...champs } : a))
    const { error } = await supabase.from('actions').update({ ...champs, updated_at: new Date().toISOString() }).eq('id', actionId)
    if (error) setErreur?.('Enregistrement : ' + error.message)
  }

  // JOURNAL cumulatif : une modification (IA ou manuelle) s'AJOUTE au journal de l'action au lieu
  // d'écraser son texte d'origine (qui reste en noir). Chaque entrée est datée + rattachée à la visite.
  // Si un statut est fourni, il met aussi à jour l'action (la pastille reflète l'état courant).
  const ajouterJournal = async (actionId, { texte = '', statut = null } = {}) => {
    const a = actions.find(x => x.id === actionId)
    const t = (texte || '').trim()
    if (!t && !statut) return
    const champs = {}
    // Le journal = uniquement des NOTES datées (texte). Un changement de statut met à jour la
    // pastille (état courant), sans créer d'entrée « (→ statut) » : le statut n'a pas à polluer
    // l'historique des remarques.
    if (t) {
      const entree = { at: new Date().toISOString(), cr_id: visiteId, visite: titreVisite(visite), texte: t }
      champs.journal = [...(Array.isArray(a?.journal) ? a.journal : []), entree]
    }
    if (statut) { champs.statut = statut; champs.statut_date = new Date().toISOString().slice(0, 10) }
    setActions(prev => prev.map(x => x.id === actionId ? { ...x, ...champs } : x))
    const { error } = await supabase.from('actions').update({ ...champs, updated_at: new Date().toISOString() }).eq('id', actionId)
    if (error) setErreur?.('Journal : ' + error.message)
  }

  // Correction d'une entrée de journal déjà posée (clic dans la note → champ → clic dehors = enregistré).
  // On ne supprime jamais : un texte vidé est ignoré (garde la note d'origine).
  const modifierJournal = async (actionId, index, texte) => {
    const a = actions.find(x => x.id === actionId)
    const src = Array.isArray(a?.journal) ? a.journal : []
    if (!src[index]) return
    const t = (texte || '').trim()
    if (!t || t === (src[index].texte || '')) return
    const journal = src.map((e, i) => i === index ? { ...e, texte: t, edite_at: new Date().toISOString() } : e)
    setActions(prev => prev.map(x => x.id === actionId ? { ...x, journal } : x))
    const { error } = await supabase.from('actions').update({ journal, updated_at: new Date().toISOString() }).eq('id', actionId)
    if (error) setErreur?.('Journal : ' + error.message)
  }

  // Suppression d'une note datée (erreur de saisie / redondance).
  const supprimerJournal = async (actionId, index) => {
    const a = actions.find(x => x.id === actionId)
    const src = Array.isArray(a?.journal) ? a.journal : []
    if (!src[index]) return
    const journal = src.filter((_, i) => i !== index)
    setActions(prev => prev.map(x => x.id === actionId ? { ...x, journal } : x))
    const { error } = await supabase.from('actions').update({ journal, updated_at: new Date().toISOString() }).eq('id', actionId)
    if (error) setErreur?.('Journal : ' + error.message)
  }

  // « Supprimer » (remarque créée dans CE CR) : si le CR est un BROUILLON (non publié) → suppression
  // DÉFINITIVE (la remarque n'a jamais été envoyée, pas d'historique). Si le CR est PUBLIÉ → archivage
  // (récupérable), pour ne rien perdre de ce qui a été envoyé au client.
  const supprimerAction = async (actionId) => {
    if (!visite?.valide) {
      setActions(prev => prev.filter(a => a.id !== actionId))
      await supabase.from('cr_actions').delete().eq('action_id', actionId)
      const { error } = await supabase.from('actions').delete().eq('id', actionId)
      if (error) { setErreur?.('Suppression : ' + error.message); recharger() }
      return
    }
    await archiver(actionId)
  }

  // Récupère une remarque ARCHIVÉE et la remet dans le CR courant (marqueur levé + inclus=true).
  const restaurer = async (actionId) => {
    await supabase.from('actions').update({ supprime_at: null }).eq('id', actionId)
    const { error } = await supabase.from('cr_actions').upsert({ cr_id: visiteId, action_id: actionId, inclus: true }, { onConflict: 'cr_id,action_id' })
    if (error) { setErreur?.('Récupération : ' + error.message); return }
    await recharger(); await chargerHistorique()
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
  const [pdfOpts, setPdfOpts] = useState({ generales: true, parLot: true, photos: true, checklist: true })
  const exporterPDF = async () => {
    setPdfLoading(true)
    // Onglet ouvert TOUT DE SUITE (dans le geste) → pas de blocage popup après l'await.
    const win = window.open('', '_blank')
    if (win) try { win.document.write('<!doctype html><meta charset="utf-8"><title>Génération du PDF…</title><body style="margin:0;font:16px system-ui;display:flex;height:100vh;align-items:center;justify-content:center;color:#334155">Génération du PDF en cours, patiente…</body>') } catch { /* onglet indispo */ }
    try {
      const res = await apiFetch('/api/cr/visite-pdf', {
        method: 'POST',
        body: JSON.stringify({ visite_id: visiteId, options: pdfOpts }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); setErreur?.(j.error || 'Export PDF impossible.'); win?.close(); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      if (win) win.location.href = url
      else window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch {
      setErreur?.('Erreur réseau export PDF.')
      win?.close()
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
  const [iaUpdates, setIaUpdates] = useState(null)     // [{action_id, ref, statut, texte, note, avant, sel}] — MAJ d'actions existantes
  const [datesCandidats, setDatesCandidats] = useState(null) // [{lot_id, date_debut, date_fin, sel}] (reprise ancien → planning)
  const [datesLoading, setDatesLoading] = useState(false)
  const [repriseOuvert, setRepriseOuvert] = useState(false) // panneau dédié de reprise d'un ancien rapport
  const [analyseSecs, setAnalyseSecs] = useState(0)          // compteur affiché pendant l'analyse IA (longue)
  const [triMode, setTriMode] = useState('plat')             // relecture « Par lot » : 'plat' | 'lot' | 'artisan'
  const [grpFermes, setGrpFermes] = useState(() => new Set()) // clés de groupes repliés (tri par lot/artisan)
  const repriseRef = useRef(null)
  const iaEnCoursRef = useRef(false)      // garde anti-double-clic (appel IA facturé)
  const importEnCoursRef = useRef(false)  // garde anti-double-clic sur l'INSERTION des actions
  const [importing, setImporting] = useState(false)

  // Compteur de secondes pendant l'analyse IA (rassure : l'analyse consolidée est longue).
  useEffect(() => {
    if (!iaLoading) { setAnalyseSecs(0); return }
    const t = setInterval(() => setAnalyseSecs(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [iaLoading])

  const analyserIA = async (notesArg, source) => {
    const notes = (typeof notesArg === 'string' ? notesArg : iaNotes).trim()
    if (!notes) return
    if (iaEnCoursRef.current) return
    iaEnCoursRef.current = true
    setIaLoading(true); setIaCandidats(null); setIaUpdates(null)
    // Actions DÉJÀ présentes → envoyées à l'IA pour qu'elle propose des MISES À JOUR (pas des doublons).
    // La "ref" = index+1 ; on garde la correspondance ref → action locale pour appliquer ensuite.
    const lotNomAction = (a) => {
      const lid = a.cibles?.find(c => c.lot_id)?.lot_id
      return lots.find(l => l.id === lid)?.nom || ''
    }
    const existantes = actions.map((a, i) => ({
      ref: i + 1, titre: a.titre || '', texte: a.texte || '', statut: a.statut, lot_nom: lotNomAction(a),
    }))
    try {
      const res = await apiFetch('/api/actions/suggest', {
        method: 'POST',
        body: JSON.stringify({ notes, lots: lots.map(l => ({ id: l.id, nom: l.nom })), type_visite: visite?.type_visite || 'suivi', source: source || undefined, existantes }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErreur?.(j.error || 'Analyse IA impossible.'); return }
      setIaCandidats((j.actions || []).map(a => ({ ...a, sel: true })))
      // Rattache chaque MAJ à l'action locale via sa ref, et garde l'état "avant" pour l'affichage.
      setIaUpdates((j.updates || []).map(u => {
        const a = actions[u.ref - 1]
        if (!a) return null
        return { ...u, action_id: a.id, avant: { statut: a.statut, titre: a.titre, texte: a.texte }, sel: true }
      }).filter(Boolean))
    } catch {
      setErreur?.('Erreur réseau IA.')
    } finally {
      setIaLoading(false); iaEnCoursRef.current = false
    }
  }

  const importerIA = async () => {
    // Verrou synchrone : le bouton est lent (N insertions), un double-clic ré-insérait tout
    // → doublons. La garde bloque le 2e appel AVANT tout await, le bouton est aussi désactivé.
    if (importEnCoursRef.current) return
    const choisies = (iaCandidats || []).filter(c => c.sel)
    const majChoisies = (iaUpdates || []).filter(u => u.sel)
    if (!choisies.length && !majChoisies.length) return
    importEnCoursRef.current = true
    setImporting(true)
    try {
      // 1) MAJ d'actions EXISTANTES → AJOUT au JOURNAL (jamais d'écrasement du texte d'origine).
      for (const u of majChoisies) {
        await ajouterJournal(u.action_id, { texte: u.texte || u.note || '', statut: u.statut || null })
      }
      // 2) Nouvelles actions. Suffixe = max existant de la visite + 1, incrémenté par item → jamais
      //    de doublon (ni entre elles, ni avec les générales/par lot déjà créées).
      let ordre = actions.length
      let suffixe = maxSuffixeVisite()
      for (const c of choisies) {
        suffixe++
        const numero = `${visite?.numero_visite || 1}.${suffixe}`
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
      const bouts = []
      if (majChoisies.length) bouts.push(`${majChoisies.length} mise(s) à jour`)
      if (choisies.length) bouts.push(`${choisies.length} nouvelle(s)`)
      setSucces?.(`${bouts.join(' + ')} ✓`)
      if (!datesCandidats?.length) { setIaOuvert(false); setIaNotes('') }  // rien à valider côté dates → on ferme
      setIaCandidats(null); setIaUpdates(null)
      await recharger()
    } finally {
      setImporting(false); importEnCoursRef.current = false
    }
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

  // CONSOLIDATION des anciens rapports prose → UNE liste d'actions dédoublonnée (Claude lit
  // les 6 rapports d'un coup, cf. /api/actions/consolider), + dates du DERNIER rapport (planning
  // courant). Remplace l'ancienne reprise « par rapport » qui ré-extrayait les mêmes points N fois.
  // N'altère jamais les originaux : ne fait qu'ouvrir un panneau de candidats à cocher.
  const consoliderAnciens = async () => {
    if (iaEnCoursRef.current) return
    iaEnCoursRef.current = true
    setRepriseOuvert(true)
    // Actions ET dates sortent de la MÊME passe (les 6 rapports d'un coup) → les deux sections
    // passent en « analyse en cours » ensemble, et « le plus récent gagne » vaut pour les deux.
    setIaLoading(true); setDatesLoading(true); setIaCandidats(null); setDatesCandidats(null)
    setTimeout(() => repriseRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 250)
    try {
      const res = await apiFetch('/api/actions/consolider', {
        method: 'POST',
        body: JSON.stringify({ dossier_id: dossierId, lots: lots.map(l => ({ id: l.id, nom: l.nom })) }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErreur?.(j.error || 'Consolidation impossible.'); return }
      setIaCandidats((j.actions || []).map(a => ({ ...a, sel: true })))
      if (!j.actions?.length) setErreur?.('Aucun ancien rapport prose à consolider.')
      else if (j.tronquee) setErreur?.(`Liste longue : l'IA a peut-être été coupée (${j.actions.length} actions récupérées). Vérifie qu'il ne manque rien, ou relance.`)
      // Dates de planning consolidées (tous les rapports, période la plus récente par lot).
      // On mappe lot_nom → lot local, et on décoche les lots DÉJÀ planifiés (pas d'écrasement).
      const dcands = (j.dates || []).map(d => {
        const lot = lots.find(l => (l.nom || '').toLowerCase() === (d.lot_nom || '').toLowerCase())
        if (!lot) return null
        const dejaPlanifie = !!(lot.date_debut || lot.date_fin)
        return { lot_id: lot.id, date_debut: d.date_debut, date_fin: d.date_fin, dejaPlanifie, dateDebutActuelle: lot.date_debut || null, dateFinActuelle: lot.date_fin || null, sel: !dejaPlanifie }
      }).filter(Boolean)
      setDatesCandidats(dcands)
    } catch {
      setErreur?.('Erreur réseau IA.')
    } finally {
      setIaLoading(false); setDatesLoading(false); iaEnCoursRef.current = false
    }
  }

  const nomLot = (lid) => lots.find(l => l.id === lid)?.nom || '—'

  const generales = actions.filter(a => a.portee === 'generale')
  const parLot = actions.filter(a => a.portee === 'lot')
  const ouvertes = actions.filter(a => !CLOTURANTS.has(a.statut)).length
  // MAJ IA cochées mais PAS ENCORE appliquées → prévisualisation de l'ajout au journal sur l'action.
  const majEnAttente = new Map((iaUpdates || []).filter(u => u.sel).map(u => [u.action_id, u]))

  // ── Page LECTURE d'un R1/R2/R3 (prose) : contenu + Modifier + Export PDF. Pas d'actions. ──
  if (estProse) {
    const contenu = (visite?.contenu_final || '').trim()
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={onRetour} className="btn btn-ghost" style={{ fontSize: 12.5 }}>← Visites</button>
          <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--ink-900)' }}>{titreVisite(visite)}</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>{fmtDate(visite?.date_visite)}</div>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#4338ca', background: 'rgba(99,102,241,0.10)', borderRadius: 20, padding: '2px 9px' }}>ancien format</span>
          <div style={{ flex: 1 }} />
          <button onClick={() => onEditerAncien?.(visite)} className="btn btn-ghost" style={{ fontSize: 12.5 }}>Modifier</button>
          {contenu && <button onClick={() => onPdfProse?.(visiteId)} className="btn btn-primary" style={{ fontSize: 12.5 }}>Exporter PDF</button>}
        </div>
        {contenu
          ? <div className="card" style={{ padding: 16 }}><RenderProse text={contenu} /></div>
          : <div style={{ fontSize: 13, color: 'var(--ink-500)' }}>Ce rapport n&apos;a pas encore de contenu. Clique sur <b>Modifier</b> pour le rédiger.</div>}
      </div>
    )
  }

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
        {actions.length > 0 && (() => {
          // Compteur par COULEUR de statut : chaque nombre écrit dans la couleur de sa famille.
          const cnt = { '#dc2626': 0, '#d97706': 0, '#2563eb': 0, '#16a34a': 0 }
          actions.forEach(a => { const c = (STATUT_MAP[a.statut] || {}).c; if (c in cnt) cnt[c]++ })
          return (
            <span style={{ fontSize: 12, color: 'var(--ink-500)', display: 'inline-flex', gap: 8, alignItems: 'center' }}>
              <span>{actions.length} action{actions.length > 1 ? 's' : ''} ·</span>
              {['#dc2626', '#d97706', '#2563eb', '#16a34a'].filter(c => cnt[c] > 0).map(c => <b key={c} style={{ color: c, fontSize: 13 }}>{cnt[c]}</b>)}
            </span>
          )
        })()}
        <input type="date" defaultValue={visite?.date_visite || ''} className="input" style={{ height: 34, fontSize: 12.5 }}
          onBlur={e => e.target.value !== visite?.date_visite && supabase.from('comptes_rendus').update({ date_visite: e.target.value || null }).eq('id', visiteId).then(onMajVisite)} />
        <div style={{ flex: 1 }} />
        {/* Migration : visible seulement dans un brouillon VIDE quand il existe des rapports prose.
            Dès qu'une action existe (consolidation importée, ou report d'un chantier déjà migré),
            actions.length > 0 → le bouton disparaît de lui-même. Jamais sur un chantier 100 % neuf. */}
        {visite?.valide === false && !ancien?.contenu_final && anciensProse > 0 && actions.length === 0 && (
          <button onClick={consoliderAnciens} disabled={iaLoading} className="btn btn-primary" style={{ fontSize: 12.5, background: '#4338ca', borderColor: '#4338ca' }}>
            {iaLoading ? 'Consolidation…' : 'Consolider les anciens rapports'}
          </button>
        )}
        <button onClick={() => setIaOuvert(o => !o)} className="btn btn-ghost" style={{ fontSize: 12.5 }}>Aide IA</button>
        <button onClick={() => setHistOuvert(o => { const n = !o; if (n) chargerHistorique(); return n })} className="btn btn-ghost" style={{ fontSize: 12.5 }}>Historique</button>
        <button onClick={() => setPdfPanel(p => !p)} className="btn btn-ghost" style={{ fontSize: 12.5 }}>Exporter PDF</button>
        <button onClick={() => setDiffPanel(p => !p)} className="btn btn-ghost" style={{ fontSize: 12.5 }}>Diffuser</button>
        <button onClick={publier} disabled={!!visite?.valide} className="btn btn-primary" style={{ fontSize: 12.5, background: '#15803d', borderColor: '#15803d', opacity: visite?.valide ? 0.6 : 1 }}>{visite?.valide ? 'Publié' : 'Publier'}</button>
      </div>

      {histOuvert && (
        <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, borderColor: 'rgba(99,102,241,0.3)' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-700)' }}>Historique — retrouver et récupérer des actions</div>
          {!hist && <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>Chargement…</div>}
          {hist && (<>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#b91c1c', marginTop: 2 }}>Archivées — retirées / supprimées ({hist.archivees.length})</div>
            <div style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: -4 }}>Récupérables — « Remettre » les réintègre dans ce CR.</div>
            {hist.archivees.length === 0 && <div style={{ fontSize: 11.5, color: 'var(--ink-400)' }}>Aucune.</div>}
            {hist.archivees.map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, lineHeight: 1.4 }}>
                <span style={{ fontWeight: 800, color: 'var(--ink-500)', flexShrink: 0 }}>{a.numero}</span>
                <span style={{ flex: 1 }}>{a.titre ? <b>{a.titre} — </b> : null}{a.texte}<span style={{ color: 'var(--ink-400)' }}> · le {fmtDate(a.supprime_at)}</span></span>
                <button onClick={() => restaurer(a.id)} className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px', flexShrink: 0 }}>Remettre</button>
              </div>
            ))}
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-600)', marginTop: 8 }}>Ne se reportent pas — clôturées / actées ({hist.fermees.length})</div>
            <div style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: -4 }}>Elles restent sur leur CR et ne sont pas reprises automatiquement — « Remettre » pour l'afficher dans ce CR.</div>
            {hist.fermees.length === 0 && <div style={{ fontSize: 11.5, color: 'var(--ink-400)' }}>Aucune.</div>}
            {hist.fermees.map(a => {
              const s = STATUT_MAP[a.statut]
              const deja = actions.some(x => x.id === a.id)
              return (
                <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, lineHeight: 1.4 }}>
                  <span style={{ fontWeight: 800, color: 'var(--ink-500)', flexShrink: 0 }}>{a.numero}</span>
                  <span style={{ flex: 1 }}>{a.titre ? <b>{a.titre} — </b> : null}{a.texte}{s ? <span style={{ color: s.c, fontWeight: 700 }}> · {s.l}</span> : null}</span>
                  {deja
                    ? <span style={{ fontSize: 10.5, color: 'var(--ink-400)', flexShrink: 0, alignSelf: 'center' }}>affichée</span>
                    : <button onClick={() => restaurer(a.id)} className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px', flexShrink: 0 }}>Remettre</button>}
                </div>
              )
            })}
          </>)}
        </div>
      )}

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
            {[['generales', 'Remarques générales'], ['parLot', 'Par lot'], ['photos', 'Photos'], ['checklist', 'Checklist']].map(([k, lbl]) => (
              <label key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={!!pdfOpts[k]} onChange={() => togglePdfOpt(k)} style={{ accentColor: '#4f46e5' }} /> {lbl}
              </label>
            ))}
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
          <textarea value={iaNotes} onChange={e => setIaNotes(e.target.value)} rows={12}
            placeholder="Dicte au micro ou tape tes notes… (ex. « muret entrée à refaire avant le 12/02 ; peinture RAS »)"
            className="input" style={{ padding: 12, fontSize: 13, lineHeight: 1.6, resize: 'vertical', minHeight: 260 }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <BoutonDictee dossierId={dossierId} setErreur={setErreur}
              onTexte={txt => setIaNotes(prev => [prev, txt].filter(Boolean).join(' '))} />
            <button onClick={analyserIA} disabled={iaLoading || !iaNotes.trim()} className="btn btn-primary" style={{ fontSize: 12.5 }}>
              {iaLoading ? 'Analyse…' : 'Analyser avec l’IA'}
            </button>
            {((iaCandidats && iaCandidats.length > 0) || (iaUpdates && iaUpdates.length > 0)) && (
              <button onClick={importerIA} disabled={importing} className="btn btn-ghost" style={{ fontSize: 12.5, opacity: importing ? 0.55 : 1 }}>
                {importing ? 'Application…' : `Appliquer${(iaUpdates?.filter(u => u.sel).length) ? ` ${iaUpdates.filter(u => u.sel).length} MAJ` : ''}${(iaCandidats?.filter(c => c.sel).length) ? ` + ${iaCandidats.filter(c => c.sel).length} nouvelle(s)` : ''}`}
              </button>
            )}
          </div>

          {/* Mises à jour proposées d'actions DÉJÀ présentes (évite les doublons). */}
          {iaUpdates && iaUpdates.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: '#b45309', marginTop: 4 }}>Mises à jour d&apos;actions existantes ({iaUpdates.length})</div>
              {iaUpdates.map((u, i) => {
                const sAv = STATUT_MAP[u.avant?.statut] || STATUTS[0]
                const sAp = u.statut ? (STATUT_MAP[u.statut] || STATUTS[0]) : null
                return (
                  <label key={`u${i}`} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, padding: '4px 0', borderTop: '1px solid var(--ink-100)', background: 'rgba(180,83,9,0.05)' }}>
                    <input type="checkbox" checked={u.sel} onChange={() => setIaUpdates(prev => prev.map((x, j) => j === i ? { ...x, sel: !x.sel } : x))} style={{ marginTop: 3 }} />
                    <span style={{ flex: 1 }}>
                      <b>{u.avant?.titre || (u.avant?.texte || '').slice(0, 40)}</b>
                      {sAp && <span style={{ marginLeft: 6 }}><span style={{ color: sAv.c }}>{sAv.l}</span> <span style={{ color: 'var(--ink-400)' }}>→</span> <span style={{ color: sAp.c, fontWeight: 700 }}>{sAp.l}</span></span>}
                      {u.note && <span style={{ color: 'var(--ink-500)' }}> · {u.note}</span>}
                      {u.texte && <div style={{ color: 'var(--ink-600)', marginTop: 2 }}>{u.texte}</div>}
                    </span>
                  </label>
                )
              })}
            </div>
          )}

          {iaCandidats && iaCandidats.length === 0 && (!iaUpdates || iaUpdates.length === 0) && (
            <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>Aucune action détectée dans ces notes.</div>
          )}
          {iaCandidats && iaCandidats.length > 0 && <div style={{ fontSize: 11.5, fontWeight: 800, color: '#4338ca', marginTop: 4 }}>Nouvelles actions ({iaCandidats.length})</div>}
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
          <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>Ce rapport a été rédigé avec l&apos;ancien système et reste en lecture seule (il a pu être envoyé au client). Pour repartir sur le nouveau format, ouvre un <b>brouillon</b> et utilise <b>« Consolider les anciens rapports »</b> — l&apos;IA lit tous les anciens rapports d&apos;un coup et en sort une liste d&apos;actions <b>sans doublon</b>.</div>
        </div>
      )}

      {repriseOuvert && (
        <div ref={repriseRef} className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14, borderColor: 'rgba(99,102,241,0.35)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-800)' }}>Consolidation des anciens rapports</span>
            <div style={{ flex: 1 }} />
            <button onClick={() => { setRepriseOuvert(false); setIaCandidats(null); setDatesCandidats(null) }} className="btn btn-ghost" style={{ fontSize: 11.5, padding: '4px 10px' }}>Fermer</button>
          </div>

          {/* Étape 1 — Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-700)' }}>1 · Actions à créer</div>
            {iaLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>Lecture et fusion des anciens rapports… {analyseSecs}s <span style={{ color: 'var(--ink-400)' }}>(gros historique = jusqu&apos;à 2-3 min, ne ferme pas)</span></div>
                <div className="barre-indet" />
              </div>
            )}
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
                <button onClick={importerIA} disabled={importing} className="btn btn-primary" style={{ fontSize: 11.5, padding: '4px 12px', opacity: importing ? 0.55 : 1 }}>{importing ? 'Création…' : `Créer les ${iaCandidats.filter(c => c.sel).length} action(s)`}</button>
              </div>
            )}
          </div>

          {/* Étape 2 — Dates */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid var(--ink-100)', paddingTop: 12 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-700)' }}>2 · Dates à placer dans le planning</div>
            {datesLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>Analyse des dates en cours…</div>
                <div className="barre-indet" />
              </div>
            )}
            {!datesLoading && datesCandidats && datesCandidats.length === 0 && <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>Aucune date de lot exploitable.</div>}
            {!datesLoading && datesCandidats && datesCandidats.some(c => c.dejaPlanifie) && (
              <div style={{ fontSize: 11.5, color: '#b45309' }}>Les lots <b>déjà planifiés</b> sont décochés : coche-les seulement si tu veux <b>remplacer</b> leurs dates actuelles.</div>
            )}
            {datesCandidats && datesCandidats.map((c, i) => (
              <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, flexWrap: 'wrap', opacity: c.sel ? 1 : 0.5 }}>
                <input type="checkbox" checked={c.sel} onChange={() => setDatesCandidats(prev => prev.map((x, j) => j === i ? { ...x, sel: !x.sel } : x))} />
                <b style={{ flex: '0 1 150px' }}>{nomLot(c.lot_id)}</b>
                {c.dejaPlanifie && <span style={{ fontSize: 10, fontWeight: 700, color: '#b45309', background: 'rgba(180,83,9,0.10)', padding: '1px 6px', borderRadius: 99 }} title={`Déjà au planning : ${c.dateDebutActuelle ? fmtDate(c.dateDebutActuelle) : '—'} → ${c.dateFinActuelle ? fmtDate(c.dateFinActuelle) : '—'}`}>déjà planifié</span>}
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

      {/* On n'affiche plus un écran « Chargement… » bloquant : les sections apparaissent tout de
          suite (vides puis remplies), ce qui évite le flash surtout quand il n'y a pas d'action. */}
      {(
        <>
          <Section titre="Remarques générales" onAjouter={() => ajouterAction('generale')}>
            {generales.map(a => (
              <ActionCard key={a.id} action={a} lots={lots} dossierId={dossierId} setAnnot={setAnnot} setErreur={setErreur} aMaj={majEnAttente.get(a.id)} onJournal={ajouterJournal} onModifierJournal={modifierJournal} onSupprimerJournal={supprimerJournal} visiteId={visiteId} visitePubliee={!!visite?.valide}
                carried={a.cr_origine_id !== visiteId} onMaj={majAction} onSupprimer={supprimerAction} onRetirer={() => retirerDeVisite(a.id)} />
            ))}
            {generales.length === 0 && <Vide />}
          </Section>

          <Section titre="Par lot / artisan" onAjouter={() => ajouterAction('lot')}>
            {parLot.length > 1 && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                {[['plat', 'À plat'], ['lot', 'Par lot'], ['artisan', 'Par artisan']].map(([k, lbl]) => (
                  <button key={k} onClick={() => setTriMode(k)}
                    className={triMode === k ? 'btn btn-primary' : 'btn btn-ghost'} style={{ fontSize: 11, padding: '3px 10px' }}>{lbl}</button>
                ))}
              </div>
            )}
            {parLot.length === 0 && <Vide />}
            {triMode === 'plat' && parLot.map(a => (
              <ActionCard key={a.id} action={a} lots={lots} withLot dossierId={dossierId} setAnnot={setAnnot} setErreur={setErreur} aMaj={majEnAttente.get(a.id)} onJournal={ajouterJournal} onModifierJournal={modifierJournal} onSupprimerJournal={supprimerJournal} visiteId={visiteId} visitePubliee={!!visite?.valide}
                carried={a.cr_origine_id !== visiteId} onMaj={majAction} onSupprimer={supprimerAction} onRetirer={() => retirerDeVisite(a.id)}
                onSetLot={(lotId) => setCibleLot(a, lotId)} />
            ))}
            {triMode !== 'plat' && (() => {
              // Regroupement dépliable pour la relecture. « Par lot » : un bloc par lot. « Par artisan » :
              // un bloc par entreprise (un artisan peut avoir plusieurs lots → tout est réuni). Non
              // attribué → en dernier. Clic sur l'en-tête = replier/déplier.
              const groupes = new Map()
              parLot.forEach(a => {
                const lotId = a.cibles?.find(c => c.lot_id)?.lot_id || null
                const lot = lots.find(l => l.id === lotId) || null
                let key, label
                if (triMode === 'artisan') {
                  const artId = lot?.artisan?.id || lot?.artisan_id || null
                  key = artId ? 'art_' + artId : '__none__'
                  label = lot?.artisan?.entreprise || lot?.artisan?.metier || 'Non attribué'
                } else {
                  key = lotId || '__none__'
                  label = lot ? (lot.nom + (lot.artisan?.entreprise ? ' — ' + lot.artisan.entreprise : '')) : 'Non attribué'
                }
                if (!groupes.has(key)) groupes.set(key, { key, label, lot, acts: [] })
                groupes.get(key).acts.push(a)
              })
              const rang = (id) => { const i = lots.findIndex(l => l.id === id); return i === -1 ? 1e9 : i }
              const blocs = [...groupes.values()].sort((x, y) => rang(x.lot?.id) - rang(y.lot?.id))
              return blocs.map(({ key, label, acts }) => {
                const ouvert = !grpFermes.has(key)
                return (
                  <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div onClick={() => setGrpFermes(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, padding: '4px 10px', background: 'var(--ink-100)', borderRadius: 6, cursor: 'pointer' }}>
                      <span style={{ fontSize: 12, color: 'var(--ink-500)', width: 12 }}>{ouvert ? '▾' : '▸'}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ink-800)' }}>{label}</span>
                      <span style={{ fontSize: 11, color: 'var(--ink-500)' }}>({acts.length})</span>
                    </div>
                    {ouvert && acts.map(a => (
                      <ActionCard key={a.id} action={a} lots={lots} withLot dossierId={dossierId} setAnnot={setAnnot} setErreur={setErreur} aMaj={majEnAttente.get(a.id)} onJournal={ajouterJournal} onModifierJournal={modifierJournal} onSupprimerJournal={supprimerJournal} visiteId={visiteId} visitePubliee={!!visite?.valide}
                        carried={a.cr_origine_id !== visiteId} onMaj={majAction} onSupprimer={supprimerAction} onRetirer={() => retirerDeVisite(a.id)}
                        onSetLot={(lotId) => setCibleLot(a, lotId)} />
                    ))}
                  </div>
                )
              })
            })()}
          </Section>
        </>
      )}

      {/* Mêmes actions qu'en haut, répétées EN BAS pour ne pas avoir à remonter. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderTop: '1px solid var(--ink-100)', paddingTop: 12, marginTop: 4 }}>
        <div style={{ flex: 1 }} />
        <button onClick={() => setPdfPanel(p => !p)} className="btn btn-ghost" style={{ fontSize: 12.5 }}>Exporter PDF</button>
        <button onClick={() => setDiffPanel(p => !p)} className="btn btn-ghost" style={{ fontSize: 12.5 }}>Diffuser</button>
        <button onClick={publier} disabled={!!visite?.valide} className="btn btn-primary" style={{ fontSize: 12.5, background: '#15803d', borderColor: '#15803d', opacity: visite?.valide ? 0.6 : 1 }}>{visite?.valide ? 'Publié' : 'Publier'}</button>
      </div>
    </div>
  )
}

function Section({ titre, onAjouter, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderLeft: '3px solid #4338ca', paddingLeft: 10 }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--ink-900)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{titre}</div>
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

// Rend un texte avec balises **gras** et ~~barré~~ en éléments React (aperçu app + journal).
function renderInline(txt) {
  if (!txt) return null
  const out = []; const re = /(\*\*[^*]+\*\*|~~[^~]+~~)/g
  let last = 0, m, k = 0
  while ((m = re.exec(txt))) {
    if (m.index > last) out.push(<span key={k++}>{txt.slice(last, m.index)}</span>)
    const tok = m[0]
    if (tok.startsWith('**')) out.push(<b key={k++}>{tok.slice(2, -2)}</b>)
    else out.push(<s key={k++}>{tok.slice(2, -2)}</s>)
    last = re.lastIndex
  }
  if (last < txt.length) out.push(<span key={k++}>{txt.slice(last)}</span>)
  return out
}

// Champ description avec mise en forme : sélectionner du texte puis B (gras) / S (barré).
// Stocke des balises **…** / ~~…~~ (rendues dans l'app et dans le PDF). Sauvegarde au blur.
function FormattedTextField({ defaultValue, placeholder, onSave }) {
  const ref = useRef(null)
  const [preview, setPreview] = useState(defaultValue || '')
  const wrap = (mark) => {
    const ta = ref.current; if (!ta) return
    const s = ta.selectionStart, e = ta.selectionEnd
    if (s === e) return
    const v = ta.value
    ta.value = v.slice(0, s) + mark + v.slice(s, e) + mark + v.slice(e)
    ta.focus(); ta.setSelectionRange(s, e + 2 * mark.length)
    setPreview(ta.value); onSave(ta.value)
  }
  const btn = { fontSize: 12, padding: '2px 9px', lineHeight: 1 }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => wrap('**')} className="btn btn-ghost" style={btn} title="Gras (sélectionne du texte d'abord)"><b>B</b></button>
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => wrap('~~')} className="btn btn-ghost" style={btn} title="Barré (sélectionne du texte d'abord)"><s>S</s></button>
        <span style={{ fontSize: 10.5, color: 'var(--ink-400)' }}>Sélectionne du texte puis B / S</span>
      </div>
      <textarea ref={ref} defaultValue={defaultValue || ''} placeholder={placeholder} rows={4}
        onChange={e => setPreview(e.target.value)} onBlur={e => onSave(e.target.value)}
        className="input" style={{ padding: 10, fontSize: 12.5, lineHeight: 1.5, resize: 'vertical' }} />
      {/(\*\*|~~)/.test(preview) && (
        <div style={{ fontSize: 12, color: 'var(--ink-600)', padding: '1px 2px' }}>Aperçu : {renderInline(preview)}</div>
      )}
    </div>
  )
}

// Une entrée de journal (note datée) : cliquer dessus (si éditable) → champ → clic dehors =
// enregistré. Bouton ✕ pour supprimer une note erronée ou redondante.
function JournalEntry({ entry, index, onSave, onDelete, editable, color }) {
  const [editing, setEditing] = useState(false)
  if (editing) {
    return (
      <textarea defaultValue={entry.texte || ''} autoFocus rows={2}
        onBlur={e => { setEditing(false); onSave(index, e.target.value) }}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.target.blur() } }}
        className="input" style={{ fontSize: 12, padding: 6, lineHeight: 1.4, resize: 'vertical' }} />
    )
  }
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
      <div onClick={editable ? () => setEditing(true) : undefined}
        title={editable ? 'Cliquer pour corriger' : undefined}
        style={{ flex: 1, fontSize: 12, color, lineHeight: 1.45, cursor: editable ? 'text' : 'default' }}>
        <b>[{entry.at ? fmtDate(entry.at) : 'Note'}]</b> {renderInline(entry.texte)}
        {entry.edite_at && <span style={{ fontStyle: 'italic', opacity: 0.7 }}> · modifié</span>}
      </div>
      {editable && onDelete && (
        <button onClick={() => onDelete(index)} title="Supprimer cette note"
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#b91c1c', fontSize: 13, padding: 0, lineHeight: 1, flexShrink: 0 }}>✕</button>
      )}
    </div>
  )
}

// ── Carte d'une action éditable (statut, texte, photos annotées, checklist vivante) ──
function ActionCard({ action, lots, withLot, carried, aMaj, onJournal, onModifierJournal, onSupprimerJournal, visiteId, visitePubliee, dossierId, setAnnot, setErreur, onMaj, onSupprimer, onRetirer, onSetLot }) {
  const st = STATUT_MAP[action.statut] || STATUTS[0]
  const cibleLot = action.cibles?.find(c => c.lot_id)?.lot_id || ''
  const journal = Array.isArray(action.journal) ? action.journal : []
  const ferme = CLOTURANTS.has(action.statut)   // action clôturée → on n'ajoute plus au journal
  const [note, setNote] = useState('')
  const JCOL = '#b45309'                          // couleur du journal (le texte d'origine reste noir)

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
            {lots.filter(l => !l.parent_lot_id).map(l => <option key={l.id} value={l.id}>{l.nom}{l.artisan?.entreprise ? ' — ' + l.artisan.entreprise : ''}</option>)}
          </select>
        )}

        <div style={{ flex: 1 }} />
        {carried
          ? <button onClick={() => onRetirer?.()} className="btn btn-ghost" style={{ fontSize: 11.5, padding: '3px 8px', color: 'var(--ink-500)' }} title="Archive la remarque : elle sort de ce CR et des suivants, reste dans les CR passés, et est récupérable via Historique.">Retirer du CR</button>
          : <button onClick={() => onSupprimer(action.id)} className="btn btn-ghost" style={{ fontSize: 11.5, padding: '3px 8px', color: '#b91c1c' }} title="Supprime la remarque (créée dans ce CR). Brouillon : définitif. CR publié : archivée et récupérable via Historique.">Supprimer</button>}
      </div>

      <FormattedTextField defaultValue={action.texte || ''} placeholder="Description de la remarque…"
        onSave={v => v !== (action.texte || '') && onMaj(action.id, { texte: v })} />

      {/* JOURNAL cumulatif : texte d'origine en noir ci-dessus, modifications en couleur ici. */}
      {(journal.length > 0 || aMaj) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, borderLeft: `2px solid ${JCOL}`, paddingLeft: 8 }}>
          {journal.map((e, i) => {
            // Suppression possible UNIQUEMENT pour une note créée dans CETTE visite et non publiée.
            // Les notes reportées d'autres visites (ou déjà envoyées) sont protégées.
            const supprimable = !visitePubliee && !!onSupprimerJournal && e.cr_id === visiteId
            return (
              <JournalEntry key={i} entry={e} index={i} color={JCOL}
                editable={!ferme && !!onModifierJournal}
                onSave={(idx, val) => onModifierJournal(action.id, idx, val)}
                onDelete={supprimable ? (idx) => onSupprimerJournal(action.id, idx) : null} />
            )
          })}
          {aMaj && (
            <div style={{ fontSize: 12, color: JCOL, lineHeight: 1.45, opacity: 0.85, fontStyle: 'italic' }}>
              <b>[à ajouter]</b> {aMaj.texte || aMaj.note || 'mise à jour'}
              <span style={{ color: 'var(--ink-500)', fontStyle: 'normal' }}> — coche « Appliquer » pour valider</span>
            </div>
          )}
        </div>
      )}

      {/* Ajout manuel d'une entrée de journal (tant que l'action n'est pas clôturée). */}
      {!ferme && onJournal && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <textarea value={note} onChange={e => setNote(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && note.trim()) { e.preventDefault(); onJournal(action.id, { texte: note }); setNote('') } }}
            placeholder="+ Ajouter une note datée (avancement, décision…) — Entrée pour valider, Maj+Entrée pour un retour à la ligne" rows={4}
            className="input" style={{ flex: 1, fontSize: 12.5, lineHeight: 1.5, resize: 'vertical' }} />
          <button onClick={() => { if (note.trim()) { onJournal(action.id, { texte: note }); setNote('') } }}
            disabled={!note.trim()} className="btn btn-ghost" style={{ fontSize: 11.5, padding: '3px 10px', opacity: note.trim() ? 1 : 0.5 }}>Ajouter</button>
        </div>
      )}

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
  const [lightbox, setLightbox] = useState(null)       // url de la photo affichée en grand (ou null)

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Bandeau horizontal défilant : vignettes plus grandes, clic = agrandir. */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
        {photos.map(ph => (
          <div key={ph.id} style={{ position: 'relative', flex: '0 0 auto' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ph.url} alt="" onClick={() => ph.url && setLightbox(ph.url)} title="Agrandir"
              style={{ width: 116, height: 116, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--ink-200)', cursor: 'zoom-in', display: 'block' }} />
            <button onClick={() => supprimer(ph)} title="Supprimer"
              style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, display: 'grid', placeItems: 'center' }}>✕</button>
            {ph.url && (
              <button onClick={() => annoter(ph)} title="Annoter"
                style={{ position: 'absolute', bottom: -6, right: -6, width: 22, height: 22, borderRadius: '50%', background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, display: 'grid', placeItems: 'center' }}>✎</button>
            )}
          </div>
        ))}
        <label title="Ajouter depuis l'ordinateur" style={{ flex: '0 0 auto', width: 116, height: 116, borderRadius: 8, border: '2px dashed var(--ink-300)', display: 'grid', placeItems: 'center', textAlign: 'center', cursor: up ? 'wait' : 'pointer', color: 'var(--ink-400)', fontSize: 11, lineHeight: 1.2, padding: 4 }}>
          {up ? 'Envoi…' : '+ Ordinateur'}
          <input type="file" accept="image/*" multiple disabled={up} style={{ display: 'none' }}
            onChange={e => { const fs = Array.from(e.target.files || []); e.target.value = ''; onFiles(fs) }} />
        </label>
        <button type="button" onClick={ouvrirPicker} title="Choisir parmi les photos du dossier"
          style={{ flex: '0 0 auto', width: 116, height: 116, borderRadius: 8, border: '2px dashed var(--ink-300)', background: 'none', cursor: 'pointer', color: 'var(--ink-400)', fontSize: 11, lineHeight: 1.2, padding: 4 }}>
          + Dossier
        </button>
      </div>

      {/* Lightbox : photo en grand, clic n'importe où pour fermer. */}
      {lightbox && (
        <div onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 500, display: 'grid', placeItems: 'center', cursor: 'zoom-out', padding: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" style={{ maxWidth: '95%', maxHeight: '95%', objectFit: 'contain', borderRadius: 8 }} />
        </div>
      )}

      {picker && (
        <div style={{ flexBasis: '100%', border: '1px solid var(--ink-200)', borderRadius: 8, padding: 10, marginTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-600)' }}>Photos du dossier</span>
            <div style={{ flex: 1 }} />
            <button onClick={() => setPicker(false)} className="btn btn-ghost" style={{ fontSize: 11.5, padding: '3px 9px' }}>Fermer</button>
          </div>
          {dossierPhotos === null && <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>Chargement…</div>}
          {dossierPhotos && dossierPhotos.length === 0 && <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>Aucune photo dans ce dossier pour l’instant.</div>}
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            {(dossierPhotos || []).map(p => (
              <button key={p.id} type="button" onClick={() => attacher(p)} title={`Ajouter (${p.categorie || 'photo'})`}
                style={{ flex: '0 0 auto', border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.thumb} alt="" style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--ink-200)' }} />
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
        Checklist{items.length ? ` · ${pct}% (${done}/${items.length})` : ''}
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
          placeholder="Ajouter à la checklist…" className="input" style={{ flex: 1, height: 30, fontSize: 12 }} />
        <button onClick={ajouter} className="btn btn-ghost" style={{ fontSize: 11.5, padding: '3px 9px' }}>+</button>
      </div>
    </div>
  )
}
