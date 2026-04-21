// app/finances/page.js
'use client'
import React from 'react'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { calculateDossierFinance } from '../lib/finance'

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────────────────────

const MOIS = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
const MOIS_LABELS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

// ─────────────────────────────────────────────────────────────────────────────
// UTILITAIRES PURS
// ─────────────────────────────────────────────────────────────────────────────

const round2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100
const fmt    = (n) => (Number(n) || 0).toFixed(2) + ' €'

const normalizeDossier = (d) => ({
  ...d,
  part_agente: d.part_agente ?? (d.referente?.role === 'admin' ? 0 : 0.5),
  frais_part_agente: d.frais_part_agente ?? null,
  taux_amo: d?.taux_amo ?? d?.honoraires_amo_taux,
  client: d?.client ? {
    ...d.client,
    apporteur_mode: d.client?.apporteur_base === 'total_chantier'
      ? 'total_chantier_ht' : 'par_devis',
  } : null,
})

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSANT CHECKBOX + DATE
// ─────────────────────────────────────────────────────────────────────────────

function CheckItem({ label, checked, date, onChange, onDateChange, alert, disabled = false, colorClass = '' }) {
  const handleCheck = (isChecked) => {
    onChange(isChecked)
    if (isChecked && !date) {
      onDateChange(new Date().toISOString().split('T')[0])
    }
  }

  return (
    <div className={`flex items-center gap-2 flex-wrap py-1 ${disabled ? 'opacity-40' : ''}`}>
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={!!checked}
          disabled={disabled}
          onChange={e => !disabled && handleCheck(e.target.checked)}
          className="w-4 h-4 rounded accent-blue-700"
        />
        <span className={`text-xs font-medium ${colorClass || (checked ? 'text-green-700' : 'text-gray-600')}`}>
          {label}
        </span>
      </label>
      {alert && !checked && (
        <span className="text-xs text-red-500 font-medium">{alert}</span>
      )}
      {checked && (
        <input
          type="date"
          value={date || ''}
          onChange={e => onDateChange(e.target.value)}
          className="border border-gray-200 rounded px-2 py-0.5 text-xs focus:outline-none focus:border-blue-400"
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS TABLEAU
// ─────────────────────────────────────────────────────────────────────────────

const thL = (label) => <th key={label} className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</th>
const thR = (label) => <th key={label} className="text-right px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</th>

function ObjectifBar({ label, reel, objectifMontant, cible, agenteId = null, canEdit, onSave }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(String(objectifMontant || ''))
  const pct = objectifMontant > 0 ? Math.min(100, Math.round((reel / objectifMontant) * 100)) : 0
  const color = pct >= 100 ? 'bg-green-500' : pct >= 70 ? 'bg-blue-500' : pct >= 40 ? 'bg-amber-400' : 'bg-red-400'

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600">{label}</span>
        {canEdit && !editing && (
          <button onClick={() => { setVal(String(objectifMontant || '')); setEditing(true) }}
            className="text-xs text-gray-400 hover:text-blue-600">
            {objectifMontant > 0 ? 'Modifier' : '+ Objectif'}
          </button>
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-bold text-gray-800">{(Number(reel) || 0).toFixed(2)} €</span>
        {objectifMontant > 0 && (
          <span className="text-xs text-gray-400">/ {(Number(objectifMontant) || 0).toFixed(2)} € · {pct}%</span>
        )}
      </div>
      {objectifMontant > 0 && (
        <div className="w-full bg-gray-100 rounded-full h-1.5">
          <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
        </div>
      )}
      {editing && (
        <div className="flex gap-2 items-center pt-1">
          <input
            type="number"
            value={val}
            onChange={e => setVal(e.target.value)}
            placeholder="Objectif annuel €"
            className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-400"
          />
          <button onClick={() => { onSave(cible, agenteId, val); setEditing(false) }}
            className="text-xs bg-blue-800 text-white px-2 py-1 rounded hover:bg-blue-900">
            OK
          </button>
          <button onClick={() => setEditing(false)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSANT PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────


export default function Finances() {

  // ── STATE ──────────────────────────────────────────────────────────────────

  const [profile, setProfile]                       = useState(null)
  const [loading, setLoading]                       = useState(true)
  const [saving, setSaving]                         = useState(false)
  const [erreur, setErreur]                         = useState('')
  const [succes, setSucces]                         = useState('')
  const [onglet, setOnglet]                         = useState('mes_chantiers')
  const [sousOnglet, setSousOnglet]                 = useState('chantier')
  const [dossierOuvert, setDossierOuvert]           = useState(null)
  const [dossiers, setDossiers]                     = useState([])
  const [redevances, setRedevances]                 = useState([])
  const [agentes, setAgentes]                       = useState([])
  const [agenteSelectionnee, setAgenteSelectionnee] = useState(null)
  const [nomFranchisee, setNomFranchisee]           = useState('CTP')
  const [facturesAgente, setFacturesAgente]         = useState([])
  const [uploadingFactureAgente, setUploadingFactureAgente] = useState(null)
  const [objectifs, setObjectifs] = useState([])
  const [anneeSelectionnee, setAnneeSelectionnee] = useState(new Date().getFullYear())
  const [moisOuvert, setMoisOuvert] = useState(null)

  const [sfSousOngletCTP, setSfSousOngletCTP]       = useState('mois')
  const [sfSousOngletAgente, setSfSousOngletAgente] = useState('mois')

  const router = useRouter()

  // ── CHARGEMENT ─────────────────────────────────────────────────────────────

  const chargerTout = async () => {
    const { data: dossiersData, error: dossiersError } = await supabase
      .from('dossiers')
      .select(`
        *,
        referente:profiles!dossiers_referente_id_fkey(id, prenom, nom, role, frais_part_agente_defaut),
        client:clients(civilite, prenom, nom, apporteur_affaires, apporteur_nom, apporteur_pourcentage, apporteur_base),
        devis_artisans(*, artisan:artisans(id, entreprise, sans_royalties)),
        suivi_financier(*)
      `)
      .order('created_at', { ascending: false })
    setDossiers(dossiersData || [])

    const { data: redevancesData } = await supabase
      .from('redevances').select('*')
      .order('annee', { ascending: false }).order('mois', { ascending: false })
    setRedevances(redevancesData || [])

    const { data: facturesAgenteData } = await supabase
      .from('factures_agente').select('*')
      .order('annee', { ascending: false }).order('mois', { ascending: false })
    setFacturesAgente(facturesAgenteData || [])

    const { data: agentesData } = await supabase
      .from('profiles').select('*').eq('role', 'agente').order('prenom')
    setAgentes(agentesData || [])
    setAgenteSelectionnee(prev => prev || agentesData?.[0]?.id || null)

    const { data: adminData } = await supabase
      .from('profiles').select('prenom, nom').eq('role', 'admin').single()
    if (adminData) setNomFranchisee(`${adminData.prenom} ${adminData.nom}`)

    const { data: objectifsData } = await supabase
      .from('objectifs_ca')
      .select('*')
      .eq('annee', new Date().getFullYear())
    setObjectifs(objectifsData || [])

  }

  // ── INIT ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profData } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(profData)
      await chargerTout()
      setLoading(false)
    }
    init()
  }, [router])

  // ── HELPERS PROFIL ─────────────────────────────────────────────────────────

  const isMarine     = profile?.role === 'admin'
  const nomReferente = (d) => d.referente ? `${d.referente.prenom} ${d.referente.nom}` : 'Agente'

  const getObjectif = (cible, agenteId = null) =>
    objectifs.find(o => o.cible === cible && o.agente_id === agenteId)?.montant || 0

  const sauvegarderObjectif = async (cible, agenteId, montant) => {
    const annee = new Date().getFullYear()
    const payload = { annee, cible, agente_id: agenteId || null, montant: parseFloat(montant) || 0 }

    const query = supabase.from('objectifs_ca').select('id')
      .eq('annee', annee).eq('cible', cible)
    const { data: existing } = agenteId
      ? await query.eq('agente_id', agenteId).maybeSingle()
      : await query.is('agente_id', null).maybeSingle()

    if (existing) {
      await supabase.from('objectifs_ca').update({ montant: parseFloat(montant) || 0 }).eq('id', existing.id)
    } else {
      await supabase.from('objectifs_ca').insert(payload)
    }

    const { data } = await supabase.from('objectifs_ca').select('*').eq('annee', annee)
    setObjectifs(data || [])
  }

  // ── CALCUL FINANCIER ───────────────────────────────────────────────────────
  // calculer() : extrait les valeurs depuis lib/finance.js — zéro calcul inline
  // calculerReel() : applique les déclencheurs suivi_financier — une seule source de vérité

  const calculer = (d) => {
    const normalized = normalizeDossier(d)
    const f = calculateDossierFinance(normalized)

    const partAgente = f.settings.partAgente

    const estChantierMarine = d.referente?.role === 'admin'
    const devisActifs       = (d.devis_artisans || []).filter(dv => dv.statut !== 'refuse')
    const devisAcceptes     = devisActifs.filter(dv => dv.statut === 'accepte')

    // Map devisId → données finance
    const devisFinanceMap = new Map(f.commissions.devis.map(dv => [dv.id, dv]))
    // Map devisId → ligne apporteur
    const apporteurMap    = new Map((f.apporteur.lines || []).map(l => [l.devisId, l]))

    return {
      // Référence brute
      finance: f,
      estChantierMarine,
      devisActifs,
      devisAcceptes,
      devisFinanceMap,
      apporteurMap,
      partAgenteRate: partAgente,

      // Taux affichage
      tauxCourtagePct: round2(f.settings.tauxCourtage * 100),
      tauxAmoPct:      round2(f.settings.tauxAmo * 100),

      // Frais
      fraisHT:       round2(f.frais.fraisHT),
      fraisTTC:      round2(f.frais.fraisTTC),
      fraisRoyalties: round2(f.frais.royalties),
      fraisNet:      round2(f.frais.net),
      fraisAgente:   round2(f.frais.parts.agente),
      fraisAdmin:    round2(f.frais.parts.admin),

      // Commissions (tous devis actifs)
      comHT:          round2(f.commissions.comHT),
      comTTC:         round2(f.commissions.comTTC),
      royaltiesCom:   round2(f.commissions.royaltiesType2),
      netCom:         round2(f.commissions.netCom),
      comAgente:      round2(f.commissions.parts.agente),
      comAdmin:       round2(f.commissions.parts.admin),

      // Commissions signées uniquement
      comHTSigne:     round2(f.commissions.devis.filter(dv => dv.signed).reduce((s, dv) => s + dv.comHT, 0)),
      comTTCSigne:    round2(f.commissions.devis.filter(dv => dv.signed).reduce((s, dv) => s + dv.comTTC, 0)),
      royaltiesComSigne: round2(f.commissions.devis.filter(dv => dv.signed).reduce((s, dv) => s + dv.royaltiesType2, 0)),
      netComSigne:    round2(f.commissions.devis.filter(dv => dv.signed).reduce((s, dv) => s + dv.netCom, 0)),
      comAgenteSigne: round2(f.commissions.devis.filter(dv => dv.signed).reduce((s, dv) => s + dv.parts.agente, 0)),
      comAdminSigne:  round2(f.commissions.devis.filter(dv => dv.signed).reduce((s, dv) => s + dv.parts.admin, 0)),

      // Honoraires courtage
      courtTTC:       round2(f.honoraires.courtage.ttc),
      courtHT:        round2(f.honoraires.courtage.ht),
      courtRoyalties: round2(f.honoraires.courtage.royalties),
      courtNet:       round2(f.honoraires.courtage.net),
      courtAgente:    round2(f.honoraires.courtage.parts.agente),
      courtAdmin:     round2(f.honoraires.courtage.parts.admin),

      // Honoraires AMO solde
      amoTTC:         round2(f.honoraires.soldeAmo.ttc),
      amoHT:          round2(f.honoraires.soldeAmo.ht),
      amoRoyalties:   round2(f.honoraires.soldeAmo.royalties),
      amoNet:         round2(f.honoraires.soldeAmo.net),
      amoAgente:      round2(f.honoraires.soldeAmo.parts.agente),
      amoAdmin:       round2(f.honoraires.soldeAmo.parts.admin),

      // Honoraires total
      honTotalTTC:    round2(f.honoraires.totalTTC),
      honTotalNet:    round2(f.honoraires.totalNet),
      honAgente:      round2(f.honoraires.parts.agente),
      honAdmin:       round2(f.honoraires.parts.admin),

      // Apporteur client
      apporteurTotalHT: round2(f.apporteur.totalHT),
      apporteurAgente:  round2(f.apporteur.parts.agente),
      apporteurAdmin:   round2(f.apporteur.parts.admin),

      // Royalties globales
      royaltiesTotal: round2(f.royalties.total),
      sommeRoyalties: round2(f.royalties.total),

      // Gains prévisionnels nets
      gainsAgentePrevi: round2(f.gains.netsPrevi.agente),
      gainsAdminPrevi:  round2(f.gains.netsPrevi.admin),

      // Prévisionnel frais
      fraisNetPrevi:    d.frais_statut !== 'offerts' ? round2(f.frais.net) : 0,
      fraisAgentePrevi: d.frais_statut !== 'offerts' ? round2(f.frais.parts.agente) : 0,

      // Prévisionnel commissions tous devis
      netComTous: round2(f.commissions.netCom),
      comAgenteTous: round2(f.commissions.parts.agente),

      // Prévisionnel commissions apporteurs
      comApporteursPrevi: round2(
        f.commissions.devis.filter(dv => dv.isApporteur)
          .reduce((s, dv) => s + dv.netCom, 0)
      ),
      comApporteursAgentePrevi: round2(
        f.commissions.devis.filter(dv => dv.isApporteur)
          .reduce((s, dv) => s + dv.parts.agente, 0)
      ),

      // Prévisionnel honoraires (tous devis actifs)
      honPreviNet:    round2(f.honorairesPrevi.totalNet),
      honPreviAgente: round2(f.honorairesPrevi.parts.agente),
      honPreviAdmin:  round2(f.honorairesPrevi.parts.admin),

      // Gains prévisionnels complets
      gainsAgentePreviTotal: round2(
        (f.frais.net > 0 && d.frais_statut !== 'offerts' ? f.frais.parts.agente : 0) +
        f.commissions.parts.agente +
        f.honorairesPrevi.parts.agente -
        f.apporteur.parts.agente
      ),
      gainsAdminPreviTotal: round2(
        (f.frais.net > 0 && d.frais_statut !== 'offerts' ? f.frais.net : 0) +
        f.commissions.netCom +
        f.honorairesPrevi.totalNet -
        ((f.frais.net > 0 && d.frais_statut !== 'offerts' ? f.frais.parts.agente : 0) +
        f.commissions.parts.agente +
        f.honorairesPrevi.parts.agente -
        f.apporteur.parts.agente)
      ),
    }
  }
  const calculerReel = (d) => {
    const c = calculer(d)

    if (c.estChantierMarine) {
      const fraisReel = d.frais_statut === 'regle' ? c.fraisNet : 0
      const courtageRegle = getSuivi(d, 'honoraires_courtage')?.statut_client === 'regle'
      const amoRegle = d.typologie === 'amo' && getSuivi(d, 'solde_amo')?.statut_client === 'regle'
      const honReel = round2((courtageRegle ? c.courtNet : 0) + (amoRegle ? c.amoNet : 0))
      let comReelNet = 0
      for (const dv of c.devisAcceptes) {
        if (dv.artisan?.sans_royalties) continue
        const artId = dv.artisan_id || dv.artisan?.id
        const dvF = c.devisFinanceMap.get(dv.id)
        if (!dvF) continue
        const suivi = getSuivi(d, 'acompte_artisan', artId)
        if (suivi?.statut_illico === 'recu') comReelNet = round2(comReelNet + dvF.netCom)
      }
      const comApporteursReel = round2(
        c.finance.commissions.devis
          .filter(dv => dv.isApporteur && dv.signed)
          .reduce((s, dv) => s + dv.netCom, 0)
      )
      const apporteurRetire = round2(
        (c.finance?.apporteur?.lines || []).reduce((sum, ligne) => {
          const devisOriginal = c.devisAcceptes.find(dv => dv.id === ligne.devisId)
          const artId = devisOriginal?.artisan_id || devisOriginal?.artisan?.id
          const suivi = getSuivi(d, 'apporteur_agente', artId)
          return suivi?.statut_client === 'retire' ? sum + ligne.totalHT : sum
        }, 0)
      )

      const gainAdminReel = round2(fraisReel + honReel + comReelNet + comApporteursReel - apporteurRetire)
      return { ...c, fraisReel, honReel, comReelNet, comApporteursReel, royaltiesReelTotal: 0, apporteurRembourse: apporteurRetire, gainAgenteReel: 0, gainAdminReel, gainsAgenteReels: 0 }
    }

    // Frais — HT net si réglé
    const fraisRegle         = d.frais_statut === 'regle'
    const fraisReel          = fraisRegle ? c.fraisNet : 0
    const fraisRoyaltiesReel = fraisRegle ? c.fraisRoyalties : 0
    const fraisAgenteReel    = fraisRegle ? c.fraisAgente : 0

    // Honoraires — HT net si réglé
    const courtageRegle    = getSuivi(d, 'honoraires_courtage')?.statut_client === 'regle'
    const amoRegle         = d.typologie === 'amo' && getSuivi(d, 'solde_amo')?.statut_client === 'regle'
    const honCourtageReel  = courtageRegle ? c.courtNet : 0
    const honAMOReel       = amoRegle      ? c.amoNet   : 0
    const honReel          = round2(honCourtageReel + honAMOReel)
    const royaltiesHonReel = round2(
      (courtageRegle ? c.courtRoyalties : 0) +
      (amoRegle      ? c.amoRoyalties   : 0)
    )
    const honAgenteReel    = round2(
      (courtageRegle ? c.courtAgente : 0) +
      (amoRegle      ? c.amoAgente   : 0)
    )

    // Commissions — HT net si acompte illiCO débloqué (hors apporteurs artisans)
    let comReelNet        = 0
    let royaltiesComReel  = 0
    let comAgenteReel     = 0

    for (const dv of c.devisAcceptes) {
      if (dv.artisan?.sans_royalties) continue // apporteurs artisans : déclenchés dès signé
      const artId      = dv.artisan_id || dv.artisan?.id
      const dvF        = c.devisFinanceMap.get(dv.id)
      if (!dvF) continue
      const suivi      = getSuivi(d, 'acompte_artisan', artId)
      const debloque   = suivi?.statut_illico === 'recu'
      if (debloque) {
        comReelNet       = round2(comReelNet       + dvF.netCom)
        royaltiesComReel = round2(royaltiesComReel + dvF.royaltiesType2)
        comAgenteReel    = round2(comAgenteReel    + dvF.parts.agente)
      }
    }

    // Commissions apporteurs artisans — déclenchées dès devis signé
    let comApporteursReel     = 0
    let comApporteursAgente   = 0
    for (const dv of c.devisAcceptes) {
      if (!dv.artisan?.sans_royalties) continue
      const dvF = c.devisFinanceMap.get(dv.id)
      if (!dvF || !dvF.signed) continue
      comApporteursReel   = round2(comApporteursReel   + dvF.netCom)
      comApporteursAgente = round2(comApporteursAgente + dvF.parts.agente)
    }

    // Apporteur client remboursé
    const apporteurRembourse = round2(
      (c.finance?.apporteur?.lines || []).reduce((sum, ligne) => {
        const devisOriginal = c.devisAcceptes.find(dv => dv.id === ligne.devisId)
        const artId = devisOriginal?.artisan_id || devisOriginal?.artisan?.id
        const suivi = getSuivi(d, 'apporteur_agente', artId)
        return suivi?.statut_ctp === 'rembourse' ? sum + ligne.agente : sum
      }, 0)
    )

    const royaltiesReelTotal = round2(fraisRoyaltiesReel + royaltiesHonReel + royaltiesComReel)
    const gainAgenteReel = round2(fraisAgenteReel + honAgenteReel + comAgenteReel + comApporteursAgente - apporteurRembourse)
    const gainAdminReel = round2(fraisReel + honReel + comReelNet + comApporteursReel - gainAgenteReel)

    return {
      ...c,
      fraisReel,
      honReel,
      honAgenteReel,      
      comReelNet,
      comAgenteReel,      
      comApporteursReel,
      comApporteursAgente, 
      royaltiesReelTotal,
      apporteurRembourse,
      gainAgenteReel,
      gainAdminReel,
      gainsAgenteReels: gainAgenteReel,
    }
  }

  // ── SUIVI FINANCIER ────────────────────────────────────────────────────────

  const getSuivi = (d, type, artisanId = null) =>
    (d.suivi_financier || []).find(
      s => s.type_echeance === type && (!artisanId || s.artisan_id === artisanId)
    )

  const majSuivi = async (dossierId, type, artisanId, champ, valeur) => {
    setSaving(true)
    let query = supabase.from('suivi_financier').select('id')
      .eq('dossier_id', dossierId).eq('type_echeance', type)
    query = artisanId ? query.eq('artisan_id', artisanId) : query.is('artisan_id', null)
    const { data: existing } = await query.maybeSingle()

    if (existing) {
      await supabase.from('suivi_financier').update({ [champ]: valeur }).eq('id', existing.id)
    } else {
      await supabase.from('suivi_financier').insert({
        dossier_id: dossierId, type_echeance: type,
        artisan_id: artisanId || null, [champ]: valeur,
      })
    }

    // Sync frais_statut sur dossiers
    if (type === 'frais_consultation' && champ === 'statut_client') {
      await supabase.from('dossiers').update({ frais_statut: valeur }).eq('id', dossierId)
    }

    if (type === 'facture_finale' && champ === 'statut_client' && artisanId) {
      const statutFacture = valeur === 'regle' ? 'paye' : 'en_attente'
      await supabase.from('factures_artisans').update({ statut: statutFacture })
        .eq('dossier_id', dossierId).eq('artisan_id', artisanId)
    }
    await chargerTout()
    setSaving(false)
  }

  // ── ALERTES ────────────────────────────────────────────────────────────────

  const alerte48h = (date) => date && new Date() > new Date(new Date(date).getTime() + 48 * 3600000)
  const alerte7j  = (date) => date && new Date() > new Date(new Date(date).getTime() + 7 * 24 * 3600000)

  // ── FACTURES AGENTE ────────────────────────────────────────────────────────
  const upsertFactureMoisType = async (mois, annee, montant, type, updates) => {
    const agenteId = agenteSelectionnee || profile?.id
    const existing = facturesAgente.find(f => f.mois === mois && f.annee === annee && f.agente_id === agenteId && f.type_facture === type)

    if (existing) {
      await supabase.from('factures_agente').update(updates).eq('id', existing.id)
    } else {
      await supabase.from('factures_agente').insert({
        agente_id: agenteId, mois, annee, montant, type_facture: type, ...updates
      })
    }

    // Sync redevance quand Facture 2 change de statut
    if (type === 'ctp_vers_agente') {
      await supabase.from('redevances').upsert({
        agente_id: agenteId,
        annee,
        mois,
        montant_ttc: 540,
        statut: updates.statut === 'paye' ? 'regle' : 'en_attente',
        date_paiement: updates.statut === 'paye' ? new Date().toISOString().split('T')[0] : null,
      }, { onConflict: 'agente_id,annee,mois' })
    }

    const { data } = await supabase.from('factures_agente').select('*')
      .order('annee', { ascending: false }).order('mois', { ascending: false })
    setFacturesAgente(data || [])
    await chargerTout()
  }


  // ── LISTES DÉRIVÉES ────────────────────────────────────────────────────────

  const dossiersAgentes = dossiers.filter(d => d.referente?.role === 'agente')
  const mesDossiers     = isMarine
    ? dossiers.filter(d => d.referente?.role === 'admin')
    : dossiers.filter(d => d.referente?.id === profile?.id)
  const dossiersAgente   = agenteSelectionnee
    ? dossiers.filter(d => d.referente?.id === agenteSelectionnee)
    : dossiersAgentes
  const agenteActuelle   = agentes.find(a => a.id === agenteSelectionnee)
  const nomAgente        = agenteActuelle ? `${agenteActuelle.prenom} ${agenteActuelle.nom}` : 'Agente'
  const redevancesAgente = agenteSelectionnee
    ? redevances.filter(r => r.agente_id === agenteSelectionnee)
    : redevances
  const mesRedevances    = profile?.id ? redevances.filter(r => r.agente_id === profile.id) : redevances

// ── AGRÉGATION PAR PÉRIODE ─────────────────────────────────────────────────

  const getKeyFromDate = (dateStr, isAnnee = false) => {
    if (!dateStr) return null
    const dt = new Date(dateStr)
    if (isNaN(dt)) return null
    return isAnnee
      ? String(dt.getFullYear())
      : `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
  }

  const emptyAgg = () => ({
    fraisNet: 0, courtNet: 0, amoNet: 0,
    comNet: 0, comApporteursNet: 0,
    honReel: 0, comReelNet: 0, comApporteursReel: 0,
    gainsAgenteReels: 0, gainAdminReel: 0,
    comAgenteNet: 0, comApporteursAgenteNet: 0,
    fraisAgenteNet: 0, honAgenteNet: 0,
    apporteurRembourseNet: 0,
    dossierIds: new Set(),
  })

  const agrégerParPaiement = (listeDossiers, isAnnee = false) => {
  const map = {}

  const addToKey = (key, champ, montant, dossierId) => {
    if (!key) return
    if (!map[key]) map[key] = emptyAgg()
    map[key][champ] = round2((map[key][champ] || 0) + montant)
    map[key].dossierIds.add(dossierId)
  }

  listeDossiers.forEach(d => {
    const c = calculerReel(d)
    const suivi = d.suivi_financier || []

    // Frais consultation
    const suiviFrais = suivi.find(s => s.type_echeance === 'frais_consultation' && s.statut_client === 'regle')
      if (c.fraisReel > 0 && suiviFrais) {
        // Priorité : date_paiement du suivi → date_signature_contrat comme fallback
        const dateFrais = suiviFrais?.date_paiement || d.date_signature_contrat
        const key = getKeyFromDate(dateFrais, isAnnee)
        addToKey(key, 'fraisNet', c.fraisReel, d.id)
        addToKey(key, 'fraisAgenteNet', c.fraisAgenteReel ?? c.fraisAgente, d.id)
      }

      // Honoraires courtage
      const suiviCourtage = suivi.find(s => s.type_echeance === 'honoraires_courtage' && s.statut_client === 'regle')
      if (c.courtNet > 0 && suiviCourtage) {
        const dateCourtage = suiviCourtage?.date_paiement || d.date_signature_contrat
        const key = getKeyFromDate(dateCourtage, isAnnee)
        addToKey(key, 'courtNet', c.courtNet, d.id)
        addToKey(key, 'honAgenteNet', c.courtAgente, d.id)
      }

      // Solde AMO
      const suiviAmo = suivi.find(s => s.type_echeance === 'solde_amo' && s.statut_client === 'regle')
      if (c.amoNet > 0 && suiviAmo) {
        const dateAmo = suiviAmo?.date_paiement || d.date_fin_chantier
        const key = getKeyFromDate(dateAmo, isAnnee)
        addToKey(key, 'amoNet', c.amoNet, d.id)
        addToKey(key, 'honAgenteNet', c.courtAgente, d.id)
      }

      // Commissions artisans normaux
      const devisActifs = (d.devis_artisans || []).filter(dv => dv.statut === 'accepte')
      for (const dv of devisActifs) {
        if (dv.artisan?.sans_royalties) continue
        const artId = dv.artisan_id || dv.artisan?.id
        const suiviAcompte = suivi.find(s => s.type_echeance === 'acompte_artisan' && s.artisan_id === artId && s.statut_illico === 'recu')
        if (!suiviAcompte) continue
        const dvF = c.devisFinanceMap.get(dv.id)
        if (!dvF) continue
        const key = getKeyFromDate(suiviAcompte.date_paiement, isAnnee)
        addToKey(key, 'comNet', dvF.netCom, d.id)
        addToKey(key, 'comAgenteNet', dvF.parts.agente, d.id)
      }

      // Commissions apporteurs artisans (déclenchées dès signé — date_signature du devis)
      for (const dv of devisActifs) {
        if (!dv.artisan?.sans_royalties) continue
        const dvF = c.devisFinanceMap.get(dv.id)
        if (!dvF || !dvF.signed) continue
        const key = getKeyFromDate(dv.date_signature, isAnnee)
        addToKey(key, 'comApporteursNet', dvF.netCom, d.id)
      }

            // Apporteur client remboursé par ligne
      for (const sf of suivi.filter(s =>
        s.type_echeance === 'apporteur_agente' &&
        s.statut_ctp === 'rembourse' &&
        s.date_paiement
      )) {
        const key = getKeyFromDate(sf.date_paiement, isAnnee)
        const finance = c.finance?.apporteur?.lines || []
        const ligne = finance.find(l => {
          const dv = (d.devis_artisans || []).find(dv => dv.id === l.devisId)
          return (dv?.artisan_id || dv?.artisan?.id) === sf.artisan_id
        })
        if (ligne) addToKey(key, 'apporteurRembourseNet', ligne.totalHT, d.id)
      }
    })

    // Calculer gains agente/admin par bucket
    Object.values(map).forEach(agg => {
      agg.honReel = round2(agg.courtNet + agg.amoNet)
      agg.comReelNet = agg.comNet
      agg.comApporteursReel = agg.comApporteursNet
      agg.gainsAgenteReels = round2(agg.fraisAgenteNet + agg.honAgenteNet + agg.comAgenteNet + agg.comApporteursAgenteNet)
      agg.gainAdminReel = round2(agg.fraisNet + agg.honReel + agg.comReelNet + agg.comApporteursReel - agg.gainsAgenteReels - agg.apporteurRembourseNet)    })

    return Object.entries(map)
      .map(([key, agg]) => [key, { ...agg, dossierIds: Array.from(agg.dossierIds) }])
      .sort((a, b) => b[0].localeCompare(a[0]))
  }


  // ── TOTAUX GLOBAUX ─────────────────────────────────────────────────────────

  const anneeEnCours = new Date().getFullYear()
  const rowsReelAnneeEnCours = agrégerParPaiement(dossiers, false)
  const chantiersAnneeEnCours = dossiers.filter(d => {
    const date = d.date_fin_chantier || d.date_demarrage_chantier || d.date_signature_contrat || d.created_at
    return date && new Date(date).getFullYear() === anneeEnCours
  }).length

  const totalRedevancesReglees = redevances
    .filter(r => r.statut === 'regle' && r.annee === anneeEnCours)
    .reduce((s, r) => s + (r.montant_ttc || 540), 0)

  const totalGainsAgentesReels = (() => {
    const keysAnnee = rowsReelAnneeEnCours
      .filter(([k]) => k.startsWith(String(anneeEnCours)))
      .map(([, agg]) => agg)
    return round2(keysAnnee.reduce((s, agg) => s + (agg.gainsAgenteReels || 0), 0))
  })()

  const totalNetCTP = (() => {
    const keysAnnee = rowsReelAnneeEnCours.filter(([k]) => k.startsWith(String(anneeEnCours)))
    const reelProduits = keysAnnee.reduce((s, [, agg]) => s + round2((agg.fraisNet||0) + (agg.comReelNet||0) + (agg.honReel||0) + (agg.comApporteursReel||0)), 0)
    const reelRedev = redevances.filter(r => r.statut === 'regle' && r.annee === anneeEnCours).reduce((s, r) => s + (r.montant_ttc || 540), 0)
    const reelCharges = keysAnnee.reduce((s, [, agg]) => s + (agg.gainsAgenteReels || 0), 0)
    return round2(reelProduits + reelRedev - reelCharges)
  })()  

  const mesDossiersGainsPrevi  = mesDossiers.reduce((s, d) => s + calculer(d).gainsAgentePrevi, 0)
  const mesDossiersGainsReels  = mesDossiers.reduce((s, d) => s + calculerReel(d).gainsAgenteReels, 0)
  const mesApporteurDu         = mesDossiers.reduce((s, d) => s + calculer(d).apporteurAgente, 0)
  const mesRedevancesReglees   = mesRedevances.filter(r => r.statut === 'regle').reduce((s, r) => s + (r.montant_ttc || 540), 0)
  const monNet                 = mesDossiersGainsReels - mesRedevancesReglees - mesApporteurDu

  
  // ─────────────────────────────────────────────────────────────────────────────
  // COMPOSANTS DE RENDU
  // ─────────────────────────────────────────────────────────────────────────────

  const renderSousOnglets = () => (
    <div className="flex gap-2">
      {[{ key: 'chantier', label: 'Par chantier' }, { key: 'mois', label: 'Par mois' }, { key: 'annee', label: 'Par année' }].map(({ key, label }) => (
        <button key={key} onClick={() => setSousOnglet(key)}
          className={`text-sm px-3 py-1.5 rounded-lg border transition-all ${sousOnglet === key ? 'bg-blue-800 text-white border-blue-800' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}>
          {label}
        </button>
      ))}
    </div>
  )

  const renderSélecteurAgente = () => agentes.length > 1 && (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-500">Agente :</span>
      <div className="flex gap-2 flex-wrap">
        {agentes.map(a => (
          <button key={a.id} onClick={() => setAgenteSelectionnee(a.id)}
            className={`text-sm px-3 py-1.5 rounded-lg border transition-all ${agenteSelectionnee === a.id ? 'bg-blue-800 text-white border-blue-800' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}>
            {a.prenom} {a.nom}
          </button>
        ))}
      </div>
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────────
  // ACCORDÉON
  // ─────────────────────────────────────────────────────────────────────────────

  const renderAccordeon = (listeDossiers, showBadge = false) => (
    <div className="space-y-2">
      {listeDossiers.map(d => {
        const c      = calculer(d)
        const r      = calculerReel(d)
        const isOpen = dossierOuvert === d.id

        const nbAlertes = [
          d.contrat_signe && d.frais_statut !== 'regle' && alerte48h(d.date_signature_contrat),
          ...c.devisAcceptes.map(dv => {
            const artId = dv.artisan_id || dv.artisan?.id
            return dv.date_signature && alerte7j(dv.date_signature) &&
              getSuivi(d, 'acompte_artisan', artId)?.statut_client !== 'regle'
          }),
          d.date_fin_chantier && d.typologie === 'amo' &&
            alerte48h(d.date_fin_chantier) &&
            getSuivi(d, 'solde_amo')?.statut_client !== 'regle',
        ].filter(Boolean).length

        return (
          <div key={d.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {/* En-tête */}
            <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
              onClick={() => setDossierOuvert(isOpen ? null : d.id)}>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-bold text-blue-900">{d.reference}</span>
                <span className="text-sm text-gray-500">{d.client?.prenom} {d.client?.nom}</span>
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{d.typologie}</span>
                {showBadge && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${c.estChantierMarine ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                    {c.estChantierMarine ? nomFranchisee : nomReferente(d)}
                  </span>
                )}
                {nbAlertes > 0 && (
                  <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">⚠️ {nbAlertes}</span>
                )}
              </div>
              <div className="flex items-center gap-4">
                {showBadge ? (
                  <>
                    {!c.estChantierMarine && <span className="text-sm text-blue-700 font-medium">{nomReferente(d)} : {fmt(c.gainsAgentePrevi)}</span>}
                    <span className="text-sm text-purple-700 font-medium">CTP : {fmt(c.gainsAdminPrevi)}</span>
                  </>
                ) : (
                  <span className="text-sm text-gray-700 font-medium">
                    {isMarine ? `CTP : ${fmt(c.gainsAdminPrevi)}` : `Net : ${fmt(c.gainsAgentePrevi)}`}
                  </span>
                )}
                <span className="text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</span>
              </div>
            </div>

            {/* Contenu */}
            {isOpen && (
              <div className="border-t border-gray-100 p-4 space-y-4">

                {/* Infos contrat */}
                <div className="flex items-center gap-3 flex-wrap text-xs">
                  <span className={`px-2 py-1 rounded-full font-medium ${d.contrat_signe ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                    Contrat {d.contrat_signe ? `✅ ${d.date_signature_contrat ? new Date(d.date_signature_contrat).toLocaleDateString('fr-FR') : ''}` : '❌ non signé'}
                  </span>
                  {d.date_demarrage_chantier && <span className="text-gray-400">Démarrage : {new Date(d.date_demarrage_chantier).toLocaleDateString('fr-FR')}</span>}
                  {d.date_fin_chantier && <span className="text-gray-400">Fin : {new Date(d.date_fin_chantier).toLocaleDateString('fr-FR')}</span>}
                  <span className="text-gray-400">Répartition : {Math.round(c.partAgenteRate * 100)} / {Math.round((1 - c.partAgenteRate) * 100)}</span>
                </div>

                {/* Frais de consultation */}
                {d.frais_consultation > 0 && (
                  <div className="border border-gray-100 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-gray-600 uppercase">Frais de consultation</p>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span>{fmt(c.fraisHT)} HT</span>
                        <span className="text-red-400">- {fmt(c.fraisRoyalties)} royalties</span>
                        <span className="font-medium text-gray-700">= {fmt(c.fraisNet)} net</span>
                        {!c.estChantierMarine && c.partAgenteRate < 1 && <span className="text-blue-600">agente : {fmt(c.fraisAgente)}</span>}
                      </div>
                    </div>
                    <CheckItem
                      label="Réglé"
                      checked={d.frais_statut === 'regle'}
                      date={getSuivi(d, 'frais_consultation')?.date_paiement}
                      onChange={checked => majSuivi(d.id, 'frais_consultation', null, 'statut_client', checked ? 'regle' : 'en_attente')}
                      onDateChange={date => majSuivi(d.id, 'frais_consultation', null, 'date_paiement', date)}
                      alert={alerte48h(d.date_signature_contrat) && d.frais_statut !== 'regle' ? '⚠️ Retard 48h' : null}
                    />
                    <label className="flex items-center gap-2 cursor-pointer border-t border-gray-100 pt-2">
                      <input
                        type="checkbox"
                        checked={d.frais_deduits || false}
                        onChange={async (e) => {
                          const val = e.target.checked
                          await supabase.from('dossiers').update({ frais_deduits: val }).eq('id', d.id)
                          await chargerTout()
                        }}
                        className="w-4 h-4 accent-blue-700"
                      />
                      <span className={`text-xs font-medium ${d.frais_deduits ? 'text-purple-600' : 'text-gray-500'}`}>
                        Remboursés — déduit du courtage
                      </span>
                      {d.frais_deduits && (
                        <span className="text-xs text-purple-500 ml-auto">
                          — {fmt(c.fraisHT)} HT
                        </span>
                      )}
                    </label>
                  </div>
                )}

                {/* Artisans */}
                {c.devisActifs.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase">Acomptes & Factures par artisan</p>
                    {c.devisActifs.map(dv => {
                      const artId        = dv.artisan_id || dv.artisan?.id
                      const dvF          = c.devisFinanceMap.get(dv.id)
                      const estSigne     = dv.statut === 'accepte'
                      const estApporteur = dv.artisan?.sans_royalties
                      const suiviAcompte = getSuivi(d, 'acompte_artisan', artId)
                      const suiviFact    = getSuivi(d, 'facture_finale', artId)
                      const suiviApp     = getSuivi(d, 'apporteur_agente', artId)
                      const appLigne     = c.apporteurMap.get(dv.id)

                      const acompteCalc = dv.acompte_pourcentage === -1
                        ? (dv.acompte_montant_fixe || 0)
                        : (dv.montant_ttc || 0) * ((dv.acompte_pourcentage || 30) / 100)
                      const soldeCalc = (dv.montant_ttc || 0) - acompteCalc

                      return (
                        <div key={dv.id} className="border border-gray-100 rounded-lg p-3 space-y-2">
                          {/* En-tête artisan */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-800">🔨 {dv.artisan?.entreprise}</span>
                            {estApporteur && <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full">Apporteur d'affaires</span>}
                            <span className="text-xs text-gray-400">{(dv.montant_ht || 0).toFixed(2)} € HT / {(dv.montant_ttc || 0).toFixed(2)} € TTC</span>
                            {dv.commission_pourcentage > 0 && dvF && (
                              <span className="text-xs text-gray-500">
                                Com. {dv.commission_pourcentage}% → {fmt(dvF.comHT)} HT → net {fmt(dvF.netCom)}
                                {!c.estChantierMarine && <span className="text-blue-600"> (agente : {fmt(dvF.parts.agente)})</span>}
                              </span>
                            )}
                            {estSigne
                              ? <span className="text-xs text-green-600">Signé le {dv.date_signature ? new Date(dv.date_signature).toLocaleDateString('fr-FR') : '—'}</span>
                              : <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Non signé</span>
                            }
                          </div>

                          {/* Contrôles — uniquement si signé */}
                          {estSigne && (
                            <div className="pl-2 space-y-1 border-l-2 border-gray-100">
                              {/* Acompte client */}
                              {acompteCalc > 0 && (
                                <CheckItem
                                  label={`Acompte client payé — ${acompteCalc.toFixed(2)} € TTC`}
                                  checked={suiviAcompte?.statut_client === 'regle'}
                                  date={suiviAcompte?.date_paiement}
                                  onChange={checked => majSuivi(d.id, 'acompte_artisan', artId, 'statut_client', checked ? 'regle' : 'en_attente')}
                                  onDateChange={date => majSuivi(d.id, 'acompte_artisan', artId, 'date_paiement', date)}
                                  alert={alerte7j(dv.date_signature) && suiviAcompte?.statut_client !== 'regle' ? '⚠️ Retard 7j' : null}
                                />
                              )}
                              {/* illiCO débloqué — seulement si pas apporteur artisan */}
                              {!estApporteur && (
                                <CheckItem
                                  label="illiCO France — acompte débloqué"
                                  checked={suiviAcompte?.statut_illico === 'recu'}
                                  date={suiviAcompte?.date_paiement}
                                  onChange={checked => majSuivi(d.id, 'acompte_artisan', artId, 'statut_illico', checked ? 'recu' : 'en_attente')}
                                  onDateChange={date => majSuivi(d.id, 'acompte_artisan', artId, 'date_paiement', date)}
                                  colorClass="text-indigo-600"
                                />
                              )}
                              {/* Facture finale AMO */}
                              {d.typologie === 'amo' && (
                                <CheckItem
                                  label={`Facture finale client payée — ${soldeCalc.toFixed(2)} € TTC`}
                                  checked={suiviFact?.statut_client === 'regle'}
                                  date={suiviFact?.date_paiement}
                                  onChange={checked => majSuivi(d.id, 'facture_finale', artId, 'statut_client', checked ? 'regle' : 'en_attente')}
                                  onDateChange={date => majSuivi(d.id, 'facture_finale', artId, 'date_paiement', date)}
                                  alert={alerte48h(d.date_fin_chantier) && suiviFact?.statut_client !== 'regle' ? '⚠️ Retard 48h' : null}
                                />
                              )}
                              {/* Apporteur client par devis */}
                              {c.finance?.apporteur?.enabled && appLigne && appLigne.totalHT > 0 && (
                                <div className="pt-1 space-y-1 border-t border-gray-100">
                                  <p className="text-xs text-orange-600 font-medium">
                                    Apporteur {d.client?.apporteur_nom} — {fmt(appLigne.totalHT)} HT
                                    {!c.estChantierMarine && ` (agente : ${fmt(appLigne.agente)})`}
                                  </p>
                                  {/* Remboursement agente → CTP : visible si chantier agente, peu importe la vue */}
                                  {!c.estChantierMarine && (
                                    <CheckItem
                                      label={`Agente → CTP remboursé — ${fmt(appLigne.agente)}`}
                                      checked={suiviApp?.statut_ctp === 'rembourse'}
                                      date={suiviApp?.date_paiement}
                                      onChange={checked => majSuivi(d.id, 'apporteur_agente', artId, 'statut_ctp', checked ? 'rembourse' : 'en_attente')}
                                      onDateChange={date => majSuivi(d.id, 'apporteur_agente', artId, 'date_paiement', date)}
                                      colorClass="text-orange-600"
                                    />
                                  )}
                                  {/* CTP retiré : visible uniquement sur chantier Marine, vue admin */}
                                  {c.estChantierMarine && isMarine && (
                                    <CheckItem
                                      label={`CTP retiré — ${fmt(appLigne.admin)}`}
                                      checked={suiviApp?.statut_client === 'retire'}
                                      date={suiviApp?.date_paiement}
                                      onChange={checked => majSuivi(d.id, 'apporteur_agente', artId, 'statut_client', checked ? 'retire' : 'en_attente')}
                                      onDateChange={date => majSuivi(d.id, 'apporteur_agente', artId, 'date_paiement', date)}
                                      colorClass="text-purple-600"
                                    />
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Honoraires */}
                {['courtage', 'amo'].includes(d.typologie) && c.honTotalTTC > 0 && (
                  <div className="border border-gray-100 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-semibold text-gray-600 uppercase">Honoraires client</p>
                    <div className="space-y-3">
                      {/* Courtage */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
                          <span className="font-medium text-gray-700">Courtage ({c.tauxCourtagePct}%)</span>
                          <span>{fmt(c.courtHT)} HT</span>
                          <span className="text-red-400">- {fmt(c.courtRoyalties)} royalties</span>
                          <span className="font-medium">= {fmt(c.courtNet)} net</span>
                          {!c.estChantierMarine && <span className="text-blue-600">agente : {fmt(c.courtAgente)}</span>}
                        </div>
                        <CheckItem
                          label="Client réglé"
                          checked={getSuivi(d, 'honoraires_courtage')?.statut_client === 'regle'}
                          date={getSuivi(d, 'honoraires_courtage')?.date_paiement}
                          onChange={checked => majSuivi(d.id, 'honoraires_courtage', null, 'statut_client', checked ? 'regle' : 'en_attente')}
                          onDateChange={date => majSuivi(d.id, 'honoraires_courtage', null, 'date_paiement', date)}
                        />
                      </div>
                      {/* AMO solde */}
                      {d.typologie === 'amo' && (
                        <div className="space-y-1 border-t border-gray-100 pt-2">
                          <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
                            <span className="font-medium text-blue-700">AMO solde ({c.tauxAmoPct}%)</span>
                            <span>{fmt(c.amoHT)} HT</span>
                            <span className="text-red-400">- {fmt(c.amoRoyalties)} royalties</span>
                            <span className="font-medium">= {fmt(c.amoNet)} net</span>
                            {!c.estChantierMarine && <span className="text-blue-600">agente : {fmt(c.amoAgente)}</span>}
                          </div>
                          <CheckItem
                            label="Client réglé"
                            checked={getSuivi(d, 'solde_amo')?.statut_client === 'regle'}
                            date={getSuivi(d, 'solde_amo')?.date_paiement}
                            onChange={checked => majSuivi(d.id, 'solde_amo', null, 'statut_client', checked ? 'regle' : 'en_attente')}
                            onDateChange={date => majSuivi(d.id, 'solde_amo', null, 'date_paiement', date)}
                            alert={alerte48h(d.date_fin_chantier) && getSuivi(d, 'solde_amo')?.statut_client !== 'regle' ? '⚠️ Retard 48h' : null}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Apporteur client global (résumé) */}
                {d.client?.apporteur_affaires && c.apporteurTotalHT > 0 && (
                  <div className="border border-orange-100 rounded-lg p-3 bg-orange-50">
                    <p className="text-xs font-medium text-orange-700">
                      Apporteur {d.client.apporteur_nom} ({d.client.apporteur_pourcentage}%) — total {fmt(c.apporteurTotalHT)} HT
                      {!c.estChantierMarine && ` · part agente : ${fmt(c.apporteurAgente)}`}
                    </p>
                  </div>
                )}

                {/* Total gain chantier */}
                <div className="border-2 border-gray-200 rounded-lg p-3 bg-gray-50">
                  <p className="text-xs font-bold text-gray-700 uppercase mb-3">Total gain chantier</p>
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    {/* Prévisionnel */}
                    <div className="space-y-1">
                      <p className="font-semibold text-gray-500 mb-2">Prévisionnel (HT net)</p>
                      {c.fraisNet > 0 && <div className="flex justify-between"><span className="text-gray-500">Frais consul.</span><span>+ {fmt(c.fraisNet)}</span></div>}
                      {c.honTotalNet > 0 && <div className="flex justify-between"><span className="text-gray-500">Honoraires</span><span>+ {fmt(c.honTotalNet)}</span></div>}
                      {c.netComSigne > 0 && <div className="flex justify-between"><span className="text-gray-500">Commissions</span><span>+ {fmt(c.netComSigne)}</span></div>}
                      {(() => {
                        const comApporteursPrevi = round2(
                          c.finance.commissions.devis
                            .filter(dv => dv.isApporteur && dv.signed)
                            .reduce((s, dv) => s + dv.netCom, 0)
                        )
                        return comApporteursPrevi > 0
                          ? <div className="flex justify-between"><span className="text-gray-500">Com. apporteurs</span><span>+ {fmt(comApporteursPrevi)}</span></div>
                          : null
                      })()}
                        {c.apporteurTotalHT > 0 && (
                          <div className="flex justify-between">
                            <span className="text-orange-500">Apporteur client</span>
                            <span className="text-orange-500">— {fmt(c.estChantierMarine ? c.apporteurAdmin : c.apporteurAgente)}</span>
                          </div>
                        )}                      
                        <div className="border-t border-gray-200 pt-1 mt-1 space-y-0.5">
                        {!c.estChantierMarine && <div className="flex justify-between font-bold"><span className="text-blue-700">{nomReferente(d)}</span><span className="text-blue-700">{fmt(c.gainsAgentePrevi)}</span></div>}
                        <div className="flex justify-between font-bold">
                          <span className={c.estChantierMarine ? 'text-gray-700' : 'text-purple-700'}>{c.estChantierMarine ? 'Net' : nomFranchisee}</span>
                          <span className={c.estChantierMarine ? 'text-gray-700' : 'text-purple-700'}>{fmt(c.gainsAdminPrevi)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Réel */}
                    <div className="space-y-1">
                      <p className="font-semibold text-green-700 mb-2">Réel encaissé (HT net)</p>
                      {r.fraisReel > 0 && <div className="flex justify-between"><span className="text-gray-500">Frais consul.</span><span>+ {fmt(r.fraisReel)}</span></div>}
                      {r.honReel > 0 && <div className="flex justify-between"><span className="text-gray-500">Honoraires</span><span>+ {fmt(r.honReel)}</span></div>}
                      {r.comReelNet > 0 && <div className="flex justify-between"><span className="text-gray-500">Commissions</span><span>+ {fmt(r.comReelNet)}</span></div>}
                      {r.comApporteursReel > 0 && <div className="flex justify-between"><span className="text-gray-500">Com. apporteurs</span><span>+ {fmt(r.comApporteursReel)}</span></div>}
                      {c.apporteurTotalHT > 0 && (
                        <div className="flex justify-between">
                          <span className="text-orange-500">Apporteur remboursé</span>
                          <span className="text-orange-500">— {fmt(r.apporteurRembourse)}</span>
                        </div>
                      )}
                      <div className="border-t border-green-200 pt-1 mt-1 space-y-0.5">
                        {!c.estChantierMarine && <div className="flex justify-between font-bold"><span className="text-blue-700">{nomReferente(d)}</span><span className="text-blue-700">{fmt(r.gainAgenteReel)}</span></div>}
                        <div className="flex justify-between font-bold">
                          <span className={c.estChantierMarine ? 'text-gray-700' : 'text-purple-700'}>{c.estChantierMarine ? 'Net' : nomFranchisee}</span>
                          <span className={c.estChantierMarine ? 'text-gray-700' : 'text-purple-700'}>{fmt(r.gainAdminReel)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <button onClick={() => router.push(`/chantiers/${d.id}`)} className="text-xs text-blue-600 hover:underline">
                  → Voir la fiche chantier
                </button>
              </div>
            )}
          </div>
        )
      })}
      {listeDossiers.length === 0 && <p className="text-center text-gray-400 text-sm py-8">Aucun chantier</p>}
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────────
  // TABLEAUX PAR PÉRIODE
  // ─────────────────────────────────────────────────────────────────────────────

  const renderTableauPeriode = (listeDossiers, rows, colLabel, colonnes, getMontant, getDossierMontant) => (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>{thL(colLabel)}{colonnes.map(c => thR(c.label))}</tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map(([key, agg]) => {
            const label = (() => {
              if (!key.includes('-')) return key
              const [a, m] = key.split('-')
              return `${MOIS[parseInt(m)]} ${a}`
            })()
            const dossierspériode = listeDossiers.filter(d => agg.dossierIds?.includes(d.id))
            return (
              <React.Fragment key={key}>
                {/* Ligne période */}
                <tr className="bg-gray-50 border-t-2 border-gray-200">
                  <td className="px-3 py-2 font-bold text-gray-800">{label}</td>
                  {colonnes.map(col => {
                    const val = getMontant(agg, col.key)
                    if (col.type === 'neg') return <td key={col.key} className="px-3 py-2 text-right text-red-400 text-sm font-bold">{val > 0 ? `— ${fmt(val)}` : '—'}</td>
                    if (col.type === 'total') return <td key={col.key} className={`px-3 py-2 text-right text-sm font-bold ${(val || 0) >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmt(val)}</td>
                    return <td key={col.key} className="px-3 py-2 text-right text-sm font-bold text-gray-700">{fmt(val)}</td>
                  })}
                </tr>
                {/* Lignes dossiers */}
                {dossierspériode.map(d => {
                  const nomClient = d.client ? `${d.client.prenom} ${d.client.nom}` : '—'
                  return (
                    <tr key={d.id} className="hover:bg-blue-50 border-t border-gray-100">
                      <td className="px-3 py-1.5 text-gray-500">
                        <span className="text-gray-300 mr-2">└</span>
                        <span className="font-medium text-blue-800 text-xs">{d.reference}</span>
                        <span className="text-gray-500 text-xs ml-2">— {nomClient}</span>
                      </td>
                      {colonnes.map(col => {
                        const val = getDossierMontant(d, col.key, key)
                        if (col.type === 'neg') return <td key={col.key} className="px-3 py-1.5 text-right text-red-300 text-xs">{val > 0 ? `— ${fmt(val)}` : '—'}</td>
                        if (col.type === 'total') return <td key={col.key} className={`px-3 py-1.5 text-right text-xs font-medium ${(val || 0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmt(val)}</td>
                        return <td key={col.key} className="px-3 py-1.5 text-right text-xs text-gray-500">{fmt(val)}</td>
                      })}
                    </tr>
                  )
                })}
              </React.Fragment>
            )
          })}
          {rows.length === 0 && <tr><td colSpan={colonnes.length + 1} className="px-3 py-8 text-center text-gray-400">Aucune donnée</td></tr>}
        </tbody>
        <tfoot className="bg-gray-50 border-t-2 border-gray-300 font-bold">
          <tr>
            <td className="px-3 py-2">Total</td>
            {colonnes.map(col => {
              const total = rows.reduce((s, [, agg]) => s + (getMontant(agg, col.key) || 0), 0)
              if (col.type === 'neg') return <td key={col.key} className="px-3 py-2 text-right text-red-400 text-sm font-bold">— {fmt(total)}</td>
              if (col.type === 'total') return <td key={col.key} className={`px-3 py-2 text-right text-sm font-bold ${total >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmt(total)}</td>
              return <td key={col.key} className="px-3 py-2 text-right text-sm">{fmt(total)}</td>
            })}
          </tr>
        </tfoot>
      </table>
    </div>
  )

  // ── MES CHANTIERS par période ───────────────────────────────────────────────

  const renderMesPeriode = (listeDossiers, colLabel, rows) => {
    const colonnesMarine = [
      { label: 'Frais net',    key: 'fraisNet',          type: 'normal' },
      { label: 'Com. net',     key: 'comNet',             type: 'normal' },
      { label: 'Com. apport.', key: 'comApporteursNet',   type: 'normal' },
      { label: 'Hon. court.',  key: 'courtNet',           type: 'normal' },
      { label: 'Hon. AMO',     key: 'amoNet',             type: 'normal' },
      { label: 'Apporteur',    key: 'apporteurRembourseNet', type: 'neg' },
      { label: nomFranchisee,  key: 'gainAdminReel',      type: 'total'  },
    ]
    const colonnesAgente = [
      { label: 'Frais net',    key: 'fraisNet',           type: 'normal' },
      { label: 'Com. net',     key: 'comNet',             type: 'normal' },
      { label: 'Com. apport.', key: 'comApporteursNet',   type: 'normal' },
      { label: 'Hon. net',     key: 'honReel',            type: 'normal' },
      { label: 'Apporteur',    key: 'apporteurRembourseNet', type: 'neg' },
      { label: 'Mes gains',    key: 'gainsAgenteReels',   type: 'total'  },
    ]
    const colonnes = isMarine ? colonnesMarine : colonnesAgente
    const getDossierMontant = (d, key, periodKey) => {
      const agg = agrégerParPaiement([d], periodKey?.includes('-') ? false : true)
        .find(([k]) => k === periodKey)?.[1]
      if (!agg) return 0
      return agg[key] || 0
    }
    return renderTableauPeriode(listeDossiers, rows, colLabel, colonnes, (agg, key) => agg[key] || 0, getDossierMontant)
  }

  // ── TOUS LES CHANTIERS par période (admin) ─────────────────────────────────

  const renderTousPeriode = (listeDossiers, rows, colLabel) => {
    const colonnes = [
      { label: 'Frais net',    key: 'fraisNet',          type: 'normal' },
      { label: 'Com. net',     key: 'comNet',             type: 'normal' },
      { label: 'Com. apport.', key: 'comApporteursNet',   type: 'normal' },
      { label: 'Hon. net',     key: 'honReel',            type: 'normal' },
      { label: 'Apporteur',    key: 'apporteurRembourseNet', type: 'neg' },
      { label: nomFranchisee,  key: 'gainAdminReel',      type: 'total'  },
    ]
    const getDossierMontant = (d, key, periodKey) => {
      const agg = agrégerParPaiement([d], periodKey?.includes('-') ? false : true)
        .find(([k]) => k === periodKey)?.[1]
      if (!agg) return 0
      return agg[key] || 0
    }
    return renderTableauPeriode(listeDossiers, rows, colLabel, colonnes, (agg, key) => agg[key] || 0, getDossierMontant)
  }

  // ── GRAPHIQUE CTP ──────────────────────────────────────────────────────────
  function SuiviCTPChart({ labels, produitsData, chargesData, netData, chartId }) {
    useEffect(() => {
      if (typeof window === 'undefined' || typeof Chart === 'undefined') return
      const el = document.getElementById(chartId)
      if (!el) return
      if (el._chartInstance) el._chartInstance.destroy()
      el._chartInstance = new Chart(el, {
        data: {
          labels,
          datasets: [
            { type: 'bar', label: 'Gains', data: produitsData, backgroundColor: '#3B7DD8', borderRadius: 3, order: 2 },
            { type: 'bar', label: 'Charges', data: chargesData, backgroundColor: '#E24B4A', borderRadius: 3, order: 2 },
            { type: 'line', label: 'Résultats', data: netData, borderColor: '#1F5FA6', backgroundColor: 'rgba(31,95,166,0.06)', borderWidth: 2, borderDash: [4, 3], pointRadius: 4, pointBackgroundColor: '#1F5FA6', tension: 0.3, order: 1 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => ctx.dataset.label + ' : ' + Math.abs(ctx.parsed.y).toLocaleString('fr-FR') + ' €' } }
          },
          scales: {
            x: { stacked: false, grid: { display: false }, ticks: { font: { size: 11 }, color: '#888', maxRotation: 30, autoSkip: false } },
            y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 }, color: '#888', callback: v => Math.abs(v).toLocaleString('fr-FR') + ' €' } }
          }
        }
      })
      return () => { if (el._chartInstance) { el._chartInstance.destroy(); el._chartInstance = null } }
    }, [labels, produitsData, chargesData, netData, chartId])

    return (
      <div className="bg-white border  rounded-xl p-5">
        <div className="flex gap-4 mb-4 flex-wrap">
          {[
            { color: '#3B7DD8', label: 'Gains encaissés' },
            { color: '#E24B4A', label: 'Charges' },
            { color: '#1F5FA6', label: 'Résultat', dashed: true },
          ].map(({ color, label, dashed }) => (
            <div key={label} className="flex items-center gap-2">
              <div style={{ width: 10, height: 10, borderRadius: 2, background: dashed ? 'transparent' : color, border: dashed ? `2px dashed ${color}` : 'none' }} />
              <span className="text-xs text-gray-500">{label}</span>
            </div>
          ))}
        </div>
        <div style={{ position: 'relative', width: '100%', height: 220 }}>
          <canvas id={chartId} role="img" aria-label="Graphique produits et charges CTP par période" />
        </div>
      </div>
    )
  }
  
  // ── SUIVI FINANCIER (Agence et CTP) ──────────────────────────────────────

  const renderSuiviFinancier = (mode) => {
    const isCTP = mode === 'ctp'
    const rowsReel = agrégerParPaiement(dossiers, false)
    const objectifMensuel = round2(getObjectif('agence') / 12)
    const getReelNet = (r, redev) => {
      const brut = round2((r.fraisNet||0) + (r.comReelNet||0) + (r.honReel||0) + (r.comApporteursReel||0) + redev)
      if (isCTP) return round2(brut - (r.gainsAgenteReels||0) - (r.apporteurRembourseNet||0))
      return brut
    }
    const crPourCle = (cle) => {
      const mapPrevi = {}
      dossiers.forEach(d => {
        const key = getKeyFromDate(d.date_signature_contrat || d.created_at, false)
        if (!key) return
        if (!mapPrevi[key]) mapPrevi[key] = { frais: 0, com: 0, comApport: 0, hon: 0, partAgentes: 0, apporteur: 0, royalties: 0 }
        const c = calculer(d)
        mapPrevi[key].frais       = round2(mapPrevi[key].frais       + c.fraisNetPrevi)
        mapPrevi[key].com         = round2(mapPrevi[key].com         + c.netComTous)
        mapPrevi[key].comApport   = round2(mapPrevi[key].comApport   + c.comApporteursPrevi)
        mapPrevi[key].hon         = round2(mapPrevi[key].hon         + c.honPreviNet)
        mapPrevi[key].partAgentes = round2(mapPrevi[key].partAgentes + c.gainsAgentePreviTotal)
        mapPrevi[key].apporteur   = round2(mapPrevi[key].apporteur   + c.apporteurTotalHT)
        mapPrevi[key].royalties   = round2(mapPrevi[key].royalties   + c.royaltiesTotal)
      })
      const [annee, mois] = cle.split('-')
      const redevMois = redevances.filter(r => r.statut === 'regle' && r.annee === parseInt(annee) && r.mois === parseInt(mois)).reduce((s, r) => s + (r.montant_ttc || 540), 0)
      const p = mapPrevi[cle] || {}
      const r = rowsReel.find(([k]) => k === cle)?.[1] || {}
      const previProduits = round2((p.frais||0) + (p.com||0) + (p.hon||0) + (p.comApport||0) + (isCTP ? redevMois : 0))
      const previCharges  = isCTP ? round2((p.partAgentes||0) + (p.apporteur||0) + (p.royalties||0)) : 0
      const previNet      = round2(previProduits - previCharges)
      const reelProduits  = round2((r.fraisNet||0) + (r.comReelNet||0) + (r.honReel||0) + (r.comApporteursReel||0) + (isCTP ? redevMois : 0))
      const reelCharges   = isCTP ? round2((r.gainsAgenteReels||0) + round2((r.comReelNet||0) * (0.05 / 0.95)) + (r.apporteurRembourseNet||0)) : 0
      const reelNet       = round2(reelProduits - reelCharges)
      const ecart = (pv, rv) => { const e = round2(rv - pv); return <span className={`text-xs font-medium ${e >= 0 ? 'text-green-600' : 'text-red-500'}`}>{e >= 0 ? '+' : ''}{fmt(e)}</span> }
      const lignesProduits = [
        { label: '(+) Frais consultation', p: p.frais||0, r: r.fraisNet||0 },
        { label: '(+) Commissions',        p: p.com||0,   r: r.comReelNet||0 },
        { label: '(+) Honoraires',         p: p.hon||0,   r: r.honReel||0 },
        { label: '(+) Com. apporteurs',    p: p.comApport||0, r: r.comApporteursReel||0 },
        ...(isCTP ? [{ label: '(+) Redevances agentes', p: redevMois, r: redevMois }] : []),
      ]
      const lignesCharges = isCTP ? [
        { label: '(−) Royalties illiCO',      p: p.royalties||0,   r: round2((r.comReelNet||0) * (0.05 / 0.95)) },
        { label: '(−) Part agentes',          p: p.partAgentes||0, r: r.gainsAgenteReels||0 },
        { label: '(−) Apporteurs remboursés', p: p.apporteur||0,   r: r.apporteurRembourseNet||0 },
      ] : []
      return (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-gray-100">
              <th className="text-left px-2 py-1 text-gray-400 uppercase w-1/2">Ligne</th>
              <th className="text-right px-2 py-1 text-gray-400 uppercase">Prévi</th>
              <th className="text-right px-2 py-1 text-gray-400 uppercase">Réel</th>
              <th className="text-right px-2 py-1 text-gray-400 uppercase">Écart</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              <tr className="bg-gray-50"><td colSpan={4} className="px-2 py-1 text-xs font-medium text-gray-400 uppercase">Gains</td></tr>
              {lignesProduits.map(({ label, p: pv, r: rv }) => (
                <tr key={label}><td className="px-2 py-1.5 text-gray-500">{label}</td><td className="px-2 py-1.5 text-right text-gray-500">{fmt(pv)}</td><td className="px-2 py-1.5 text-right text-green-700 font-medium">{fmt(rv)}</td><td className="px-2 py-1.5 text-right">{ecart(pv, rv)}</td></tr>
              ))}
              <tr className="bg-gray-50 border-t border-gray-200"><td className="px-2 py-1.5 font-medium text-gray-700">= Total gains</td><td className="px-2 py-1.5 text-right font-medium text-gray-700">{fmt(previProduits)}</td><td className="px-2 py-1.5 text-right font-medium text-green-700">{fmt(reelProduits)}</td><td className="px-2 py-1.5 text-right">{ecart(previProduits, reelProduits)}</td></tr>
              {isCTP && <><tr className="bg-gray-50"><td colSpan={4} className="px-2 py-1 text-xs font-medium text-gray-400 uppercase">Charges</td></tr>
              {lignesCharges.map(({ label, p: pv, r: rv }) => (
                <tr key={label}><td className="px-2 py-1.5 text-gray-500">{label}</td><td className="px-2 py-1.5 text-right text-gray-500">{fmt(pv)}</td><td className="px-2 py-1.5 text-right text-red-500 font-medium">{fmt(rv)}</td><td className="px-2 py-1.5 text-right">{ecart(pv, rv)}</td></tr>
              ))}
              <tr className="bg-gray-50 border-t border-gray-200"><td className="px-2 py-1.5 font-medium text-gray-700">= Total charges</td><td className="px-2 py-1.5 text-right font-medium text-gray-700">{fmt(previCharges)}</td><td className="px-2 py-1.5 text-right font-medium text-red-500">{fmt(reelCharges)}</td><td className="px-2 py-1.5 text-right">{ecart(previCharges, reelCharges)}</td></tr></>}
              <tr className="bg-blue-50 border-t-2 border-blue-100"><td className="px-2 py-2 font-bold text-blue-800">= {isCTP ? 'Résultat net CTP' : 'Total encaissé agence'}</td><td className="px-2 py-2 text-right font-bold text-gray-600">{fmt(previNet)}</td><td className={`px-2 py-2 text-right font-bold ${reelNet >= 0 ? 'text-blue-800' : 'text-red-600'}`}>{fmt(reelNet)}</td><td className="px-2 py-2 text-right">{ecart(previNet, reelNet)}</td></tr>
            </tbody>
          </table>
        </div>
      )
    }
    const allKeys = new Set([...rowsReel.map(([k]) => k), ...redevances.filter(r => r.statut === 'regle').map(r => `${r.annee}-${String(r.mois).padStart(2, '0')}`)])
    const cles = Array.from(allKeys).sort((a, b) => b.localeCompare(a))
    const chartLabels = cles.map(cle => { const [a, m] = cle.split('-'); return `${MOIS[parseInt(m)].slice(0,3)}. ${a}` })
    const chartProduits = cles.map(cle => { const [a, m] = cle.split('-'); const r = rowsReel.find(([k]) => k === cle)?.[1] || {}; const redev = redevances.filter(rv => rv.statut === 'regle' && rv.annee === parseInt(a) && rv.mois === parseInt(m)).reduce((s, rv) => s + (rv.montant_ttc||540), 0); return round2((r.fraisNet||0) + (r.comReelNet||0) + (r.honReel||0) + (r.comApporteursReel||0) + (isCTP ? redev : 0)) })
    const chartCharges = cles.map(cle => { const r = rowsReel.find(([k]) => k === cle)?.[1] || {}; return isCTP ? -round2((r.gainsAgenteReels||0) + (r.apporteurRembourseNet||0)) : 0 })
    const chartNet = cles.map((_, i) => round2(chartProduits[i] + chartCharges[i]))
    const sfSousOnglet = sfSousOngletCTP; const setSfSousOnglet = setSfSousOngletCTP

    const renderAnnuel = () => {
      const annees = []; for (let a = new Date().getFullYear(); a >= 2023; a--) annees.push(a)
      const rowsReelAnnee = agrégerParPaiement(dossiers, false)
      const clesMois = Array.from(new Set([...rowsReelAnnee.map(([k]) => k), ...redevances.filter(r => r.statut === 'regle').map(r => `${r.annee}-${String(r.mois).padStart(2, '0')}`)])).filter(k => k.startsWith(String(anneeSelectionnee))).sort()
      const mapPrevi = {}
      dossiers.forEach(d => {
        const key = getKeyFromDate(d.date_signature_contrat || d.created_at, false)
        if (!key || !key.startsWith(String(anneeSelectionnee))) return
        if (!mapPrevi[key]) mapPrevi[key] = { frais: 0, com: 0, comApport: 0, hon: 0, partAgentes: 0, apporteur: 0, royalties: 0 }
        const c = calculer(d)
        mapPrevi[key].frais       = round2(mapPrevi[key].frais       + c.fraisNetPrevi)
        mapPrevi[key].com         = round2(mapPrevi[key].com         + c.netComTous)
        mapPrevi[key].comApport   = round2(mapPrevi[key].comApport   + c.comApporteursPrevi)
        mapPrevi[key].hon         = round2(mapPrevi[key].hon         + c.honPreviNet)
        mapPrevi[key].partAgentes = round2(mapPrevi[key].partAgentes + c.gainsAgentePreviTotal)
        mapPrevi[key].royalties   = round2(mapPrevi[key].royalties   + c.royaltiesTotal)
      })
      const totP = { frais: 0, com: 0, comApport: 0, hon: 0, redev: 0, partAgentes: 0, apporteur: 0, royalties: 0 }
      const totR = { frais: 0, com: 0, comApport: 0, hon: 0, redev: 0, partAgentes: 0, royalties: 0, apporteur: 0 }
      clesMois.forEach(cle => {
        const [, m] = cle.split('-')
        const redev = redevances.filter(r => r.statut === 'regle' && r.annee === anneeSelectionnee && r.mois === parseInt(m)).reduce((s, r) => s + (r.montant_ttc || 540), 0)
        const p = mapPrevi[cle] || {}; const r = rowsReelAnnee.find(([k]) => k === cle)?.[1] || {}
        totP.frais = round2(totP.frais + (p.frais||0)); totP.com = round2(totP.com + (p.com||0)); totP.comApport = round2(totP.comApport + (p.comApport||0)); totP.hon = round2(totP.hon + (p.hon||0)); totP.redev = round2(totP.redev + redev); totP.partAgentes = round2(totP.partAgentes + (p.partAgentes||0)); totP.royalties = round2(totP.royalties + (p.royalties||0))
        totR.frais = round2(totR.frais + (r.fraisNet||0)); totR.com = round2(totR.com + (r.comReelNet||0)); totR.comApport = round2(totR.comApport + (r.comApporteursReel||0)); totR.hon = round2(totR.hon + (r.honReel||0)); totR.redev = round2(totR.redev + redev); totR.partAgentes = round2(totR.partAgentes + (r.gainsAgenteReels||0)); totR.royalties = round2(totR.royalties + round2((r.comReelNet||0) * (0.05 / 0.95)))
        const apporteurReel = dossiers.reduce((s, d) => { const lignes = (d.suivi_financier || []).filter(sf => sf.type_echeance === 'apporteur_agente' && sf.statut_ctp === 'rembourse' && sf.date_paiement && getKeyFromDate(sf.date_paiement, false) === cle); if (!lignes.length) return s; const c2 = calculerReel(d); return s + round2((c2.finance?.apporteur?.lines || []).reduce((sum, ligne) => { const dv = (d.devis_artisans || []).find(dv => dv.id === ligne.devisId); const artId = dv?.artisan_id || dv?.artisan?.id; const sf = (d.suivi_financier || []).find(s2 => s2.type_echeance === 'apporteur_agente' && s2.artisan_id === artId && s2.statut_ctp === 'rembourse' && s2.date_paiement && getKeyFromDate(s2.date_paiement, false) === cle); return sf ? sum + ligne.agente : sum }, 0)) }, 0)
        totR.apporteur = round2(totR.apporteur + apporteurReel)
      })
      const previProduits = round2(totP.frais + totP.com + totP.comApport + totP.hon + (isCTP ? totP.redev : 0))
      const previCharges  = isCTP ? round2(totP.partAgentes + totP.apporteur + totP.royalties) : 0
      const previNet      = round2(previProduits - previCharges)
      const reelProduits  = round2(totR.frais + totR.com + totR.comApport + totR.hon + (isCTP ? totR.redev : 0))
      const reelCharges   = isCTP ? round2(totR.partAgentes + totR.royalties + totR.apporteur) : 0
      const reelNet       = round2(reelProduits - reelCharges)
      const ecart = (p, r) => { const e = round2(r - p); return <span className={`text-xs font-medium ${e >= 0 ? 'text-green-600' : 'text-red-500'}`}>{e >= 0 ? '+' : ''}{fmt(e)}</span> }
      const chartLabelsAnnee = clesMois.map(cle => { const [, m] = cle.split('-'); return MOIS[parseInt(m)].slice(0, 3) })
      const chartProduitsAnnee = clesMois.map(cle => { const [, m] = cle.split('-'); const r = rowsReelAnnee.find(([k]) => k === cle)?.[1] || {}; const redev = redevances.filter(rv => rv.statut === 'regle' && rv.annee === anneeSelectionnee && rv.mois === parseInt(m)).reduce((s, rv) => s + (rv.montant_ttc||540), 0); return round2((r.fraisNet||0) + (r.comReelNet||0) + (r.honReel||0) + (r.comApporteursReel||0) + (isCTP ? redev : 0)) })
      const chartChargesAnnee = clesMois.map(cle => { const r = rowsReelAnnee.find(([k]) => k === cle)?.[1] || {}; return isCTP ? -round2((r.gainsAgenteReels||0) + (r.apporteurRembourseNet||0)) : 0 })
      const chartNetAnnee = clesMois.map((_, i) => round2(chartProduitsAnnee[i] + chartChargesAnnee[i]))
      return (
        <div className="space-y-5">
          <ObjectifBar label={isCTP ? 'Objectif CA CTP (résultat net)' : 'Objectif CA agence (encaissements bruts)'} reel={reelNet} objectifMontant={getObjectif('agence')} cible="agence" canEdit={isMarine} onSave={sauvegarderObjectif} />
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-200">
              <span className="text-sm font-medium text-gray-700">Compte de résultat {isCTP ? 'CTP' : 'Agence'}</span>
              <div className="flex items-center gap-3">
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">réel encaissé</span>
                <select value={anneeSelectionnee} onChange={e => setAnneeSelectionnee(parseInt(e.target.value))} className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-400">
                  {annees.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100">
                <th className="text-left px-5 py-2 text-xs font-medium text-gray-400 uppercase w-1/2">Ligne</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-gray-400 uppercase">Prévisionnel</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-gray-400 uppercase">Réel</th>
                <th className="text-right px-5 py-2 text-xs font-medium text-gray-400 uppercase">Écart</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                <tr className="bg-gray-50"><td colSpan={4} className="px-5 py-1.5 text-xs font-medium text-gray-400 uppercase">Gains</td></tr>
                {[
                  { label: '(+) Frais consultation', p: totP.frais, r: totR.frais },
                  { label: '(+) Commissions', p: totP.com, r: totR.com },
                  { label: '(+) Honoraires', p: totP.hon, r: totR.hon },
                  { label: '(+) Com. apporteurs', p: totP.comApport, r: totR.comApport },
                  ...(isCTP ? [{ label: '(+) Redevances agentes', p: totP.redev, r: totR.redev }] : []),
                ].map(({ label, p, r }) => (<tr key={label} className="hover:bg-gray-50"><td className="px-5 py-2.5 text-gray-500 text-xs">{label}</td><td className="px-4 py-2.5 text-right text-gray-500 text-xs">{fmt(p)}</td><td className="px-4 py-2.5 text-right text-green-700 text-xs font-medium">{fmt(r)}</td><td className="px-5 py-2.5 text-right">{ecart(p, r)}</td></tr>))}
                <tr className="bg-gray-50 border-t border-gray-200"><td className="px-5 py-2.5 font-medium text-gray-700 text-xs">= Total gains</td><td className="px-4 py-2.5 text-right font-medium text-gray-700 text-xs">{fmt(previProduits)}</td><td className="px-4 py-2.5 text-right font-medium text-green-700 text-xs">{fmt(reelProduits)}</td><td className="px-5 py-2.5 text-right">{ecart(previProduits, reelProduits)}</td></tr>
                {isCTP && <><tr className="bg-gray-50"><td colSpan={4} className="px-5 py-1.5 text-xs font-medium text-gray-400 uppercase">Charges</td></tr>
                {[{ label: '(−) Royalties illiCO', p: totP.royalties, r: totR.royalties }, { label: '(−) Part agentes', p: totP.partAgentes, r: totR.partAgentes }, { label: '(−) Apporteurs remboursés', p: totP.apporteur, r: totR.apporteur }].map(({ label, p, r }) => (<tr key={label} className="hover:bg-gray-50"><td className="px-5 py-2.5 text-gray-500 text-xs">{label}</td><td className="px-4 py-2.5 text-right text-gray-500 text-xs">{fmt(p)}</td><td className="px-4 py-2.5 text-right text-red-500 text-xs font-medium">{fmt(r)}</td><td className="px-5 py-2.5 text-right">{ecart(p, r)}</td></tr>))}
                <tr className="bg-gray-50 border-t border-gray-200"><td className="px-5 py-2.5 font-medium text-gray-700 text-xs">= Total charges</td><td className="px-4 py-2.5 text-right font-medium text-gray-700 text-xs">{fmt(previCharges)}</td><td className="px-4 py-2.5 text-right font-medium text-red-500 text-xs">{fmt(reelCharges)}</td><td className="px-5 py-2.5 text-right">{ecart(previCharges, reelCharges)}</td></tr></>}
                <tr className="bg-blue-50 border-t-2 border-blue-100"><td className="px-5 py-3 font-bold text-blue-800 text-sm">= {isCTP ? `Résultat net CTP ${anneeSelectionnee}` : `Encaissements bruts agence ${anneeSelectionnee}`}</td><td className="px-4 py-3 text-right font-bold text-gray-600 text-sm">{fmt(previNet)}</td><td className={`px-4 py-3 text-right font-bold text-sm ${reelNet >= 0 ? 'text-blue-800' : 'text-red-600'}`}>{fmt(reelNet)}</td><td className="px-5 py-3 text-right">{ecart(previNet, reelNet)}</td></tr>
              </tbody>
            </table>
          </div>
          <SuiviCTPChart labels={chartLabelsAnnee} produitsData={chartProduitsAnnee} chargesData={chartChargesAnnee} netData={chartNetAnnee} chartId={`chart_${mode}_annee_${anneeSelectionnee}`} />
        </div>
      )
    }

    return (
      <div className="space-y-5">
        <div className="flex gap-2">
          {[{ key: 'mois', label: 'Par mois' }, { key: 'annee', label: 'Par année' }].map(({ key, label }) => (
            <button key={key} onClick={() => setSfSousOnglet(key)}
              className={`text-sm px-3 py-1.5 rounded-lg border transition-all ${sfSousOnglet === key ? 'bg-blue-800 text-white border-blue-800' : 'bg-white text-gray-600 hover:border-gray-300'}`}>
              {label}
            </button>
          ))}
        </div>
        {sfSousOnglet === 'mois' && (
          <div className="space-y-5">
            <ObjectifBar label={isCTP ? `Objectif mensuel CTP (${fmt(objectifMensuel)}/mois)` : `Objectif mensuel agence (${fmt(objectifMensuel)}/mois)`}
              reel={(() => { const moisCourant = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`; const r = rowsReel.find(([k]) => k === moisCourant)?.[1] || {}; const redev = redevances.filter(rv => rv.statut === 'regle' && rv.annee === new Date().getFullYear() && rv.mois === new Date().getMonth() + 1).reduce((s, rv) => s + (rv.montant_ttc||540), 0); return getReelNet(r, redev) })()}
              objectifMontant={objectifMensuel} cible="agence" canEdit={isMarine} onSave={sauvegarderObjectif} />
            <SuiviCTPChart labels={chartLabels} produitsData={chartProduits} chargesData={chartCharges} netData={chartNet} chartId={`chart_${mode}_mois`} />
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase">Mois</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-gray-400 uppercase">Réel encaissé</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-gray-400 uppercase">Objectif mois</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-gray-400 uppercase">vs Objectif</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cles.map((cle, i) => {
                    const [a, m] = cle.split('-')
                    const label = `${MOIS[parseInt(m)].slice(0, 3)}. ${a}`
                    const r = rowsReel.find(([k]) => k === cle)?.[1] || {}
                    const redev = redevances.filter(rv => rv.statut === 'regle' && rv.annee === parseInt(a) && rv.mois === parseInt(m)).reduce((s, rv) => s + (rv.montant_ttc||540), 0)
                    const reelNet = getReelNet(r, redev)
                    const ecartObj = round2(reelNet - objectifMensuel)
                    const isOpen = moisOuvert === `${mode}_${cle}`
                    const bg = i % 2 === 0 ? '' : 'bg-gray-50'
                    return (
                      <React.Fragment key={cle}>
                        <tr className={`cursor-pointer hover:bg-blue-50 ${bg}`} onClick={() => setMoisOuvert(isOpen ? null : `${mode}_${cle}`)}>
                          <td className="px-4 py-2.5 font-medium text-gray-700 flex items-center gap-2"><span>{label}</span><span className="text-gray-300 text-xs">{isOpen ? '▲' : '▼'}</span></td>
                          <td className={`px-3 py-2.5 text-right font-medium ${reelNet >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmt(reelNet)}</td>
                          <td className="px-3 py-2.5 text-right text-gray-400">{fmt(objectifMensuel)}</td>
                          <td className={`px-4 py-2.5 text-right font-medium ${ecartObj >= 0 ? 'text-green-600' : 'text-red-500'}`}>{ecartObj >= 0 ? '+' : ''}{fmt(ecartObj)}</td>
                        </tr>
                        {isOpen && (<tr className={bg}><td colSpan={4} className="px-4 pb-3">{crPourCle(cle)}</td></tr>)}
                      </React.Fragment>
                    )
                  })}
                  <tr className="bg-gray-50 border-t-2 border-gray-300 font-bold text-xs">
                    <td className="px-4 py-2.5 text-gray-700">Total</td>
                    <td className={`px-3 py-2.5 text-right ${cles.reduce((s,cle)=>{const [a,m]=cle.split('-');const r=rowsReel.find(([k])=>k===cle)?.[1]||{};const redev=redevances.filter(rv=>rv.statut==='regle'&&rv.annee===parseInt(a)&&rv.mois===parseInt(m)).reduce((sv,rv)=>sv+(rv.montant_ttc||540),0);return s+getReelNet(r,redev)},0)>=0?'text-green-700':'text-red-600'}`}>{fmt(cles.reduce((s,cle)=>{const [a,m]=cle.split('-');const r=rowsReel.find(([k])=>k===cle)?.[1]||{};const redev=redevances.filter(rv=>rv.statut==='regle'&&rv.annee===parseInt(a)&&rv.mois===parseInt(m)).reduce((sv,rv)=>sv+(rv.montant_ttc||540),0);return s+getReelNet(r,redev)},0))}</td>
                    <td className="px-3 py-2.5 text-right text-gray-400">{fmt(objectifMensuel * cles.length)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500">—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
        {sfSousOnglet === 'annee' && renderAnnuel()}
      </div>
    )
  }

  const renderFacturationMoisSuivi = () => {
    const rowsReel = agrégerParPaiement(mesDossiers, false)
    if (rowsReel.length === 0) return <p className="text-center text-gray-400 text-sm py-8">Aucune donnée</p>

    const getFactureAgenteMoisType = (mois, annee, type) =>
      facturesAgente.find(f => f.mois === mois && f.annee === annee && f.agente_id === profile?.id && f.type_facture === type)

    const upsertFactureMoisType = async (mois, annee, montant, type, updates) => {
      const existing = getFactureAgenteMoisType(mois, annee, type)
      const agenteId = profile?.id
      if (existing) {
        await supabase.from('factures_agente').update(updates).eq('id', existing.id)
      } else {
        await supabase.from('factures_agente').insert({ agente_id: agenteId, mois, annee, montant, type_facture: type, ...updates })
      }
      if (type === 'ctp_vers_agente') {
        await supabase.from('redevances').upsert({
          agente_id: agenteId, annee, mois, montant_ttc: 540,
          statut: updates.statut === 'paye' ? 'regle' : 'en_attente',
          date_paiement: updates.statut === 'paye' ? new Date().toISOString().split('T')[0] : null,
        }, { onConflict: 'agente_id,annee,mois' })
      }
      const { data } = await supabase.from('factures_agente').select('*')
        .order('annee', { ascending: false }).order('mois', { ascending: false })
      setFacturesAgente(data || [])
      await chargerTout()
    }

    const uploadFacturePdfType = async (mois, annee, montant, type, fichier) => {
      setUploadingFactureAgente(`${annee}-${mois}-${type}`)
      const ext = fichier.name.split('.').pop()
      const chemin = `factures_agente/${profile?.id}/${annee}-${String(mois).padStart(2,'0')}-${type}.${ext}`
      const { error } = await supabase.storage.from('documents').upload(chemin, fichier, { upsert: true })
      if (!error) {
        await upsertFactureMoisType(mois, annee, montant, type, { facture_path: chemin, statut: 'facture' })
        setSucces('Facture uploadée ✓')
      } else { setErreur('Erreur upload : ' + error.message) }
      setUploadingFactureAgente(null)
    }

    // Côté agente : émettrice F1 (select+upload), réceptrice F2 (badge + case cochée payé)
    return (
      <div className="space-y-4">
        {succes && <p className="text-green-600 text-sm bg-green-50 border border-green-200 rounded-lg px-4 py-2">{succes}</p>}
        {erreur && <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-2">{erreur}</p>}
        {rowsReel.map(([key, agg]) => {
          const [anneeStr, moisStr] = key.split('-')
          const annee = parseInt(anneeStr); const mois = parseInt(moisStr)
          const label = `${MOIS[mois]} ${annee}`
          const montantF1 = round2((agg.fraisAgenteNet||0) + (agg.comAgenteNet||0) + (agg.honAgenteNet||0) + (agg.comApporteursAgenteNet||0))
          const debutRedev = profile?.redevance_debut ? new Date(profile.redevance_debut) : null
          const moisConcerne = new Date(annee, mois - 1, 1)
          const redevMois = debutRedev && moisConcerne >= debutRedev ? 540 : 0
          const apporteurMois = round2(agg.apporteurRembourseNet||0)
          const montantF2 = round2(redevMois + apporteurMois)
          const net = round2(montantF1 - montantF2)
          const f1 = getFactureAgenteMoisType(mois, annee, 'agente_vers_ctp')
          const f2 = getFactureAgenteMoisType(mois, annee, 'ctp_vers_agente')
          const uploadKey1 = `${annee}-${mois}-agente_vers_ctp`

          const statutBadge = (f) => {
            const s = f?.statut || 'a_facturer'
            return <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${s === 'paye' ? 'text-green-700 bg-green-50 border-green-300' : s === 'facture' ? 'text-blue-700 bg-blue-50 border-blue-300' : 'text-gray-500 bg-gray-50 border-gray-200'}`}>
              {s === 'paye' ? '✅ Payé' :  '📋 À facturer'}
            </span>
          }

          return (
            <div key={key} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex justify-between items-center px-4 py-3 bg-gray-50 border-b border-gray-100">
                <span className="font-semibold text-gray-800">{label}</span>
                <span className={`font-bold text-sm ${net >= 0 ? 'text-green-700' : 'text-red-600'}`}>Net : {net >= 0 ? '+' : ''}{fmt(net)}</span>
              </div>
              <div className="p-4 space-y-3">
                {/* Facture 1 — émettrice */}
                <div className="border border-gray-100 rounded-lg p-3 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xs font-semibold text-green-800">{nomAgente} doit facturer à {nomFranchisee}</p>                    </div>
                    <span className="text-sm font-bold text-green-700">{fmt(montantF1)}</span>
                  </div>
                  <div className="space-y-1 text-xs text-green-700">
                    {(agg.fraisAgenteNet||0) > 0 && <div className="flex justify-between"><span>Frais consultation</span><span>{fmt(agg.fraisAgenteNet)}</span></div>}
                    {(agg.comAgenteNet||0) > 0 && <div className="flex justify-between"><span>Commissions</span><span>{fmt(agg.comAgenteNet)}</span></div>}
                    {(agg.honAgenteNet||0) > 0 && <div className="flex justify-between"><span>Honoraires</span><span>{fmt(agg.honAgenteNet)}</span></div>}
                    {(agg.comApporteursAgenteNet||0) > 0 && <div className="flex justify-between"><span>Com. apporteurs</span><span>{fmt(agg.comApporteursAgenteNet)}</span></div>}
                  </div>
                  {/* Agente = émettrice : select statut + upload */}
                  <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-green-100">
                    <select value={f1?.statut || 'a_facturer'}
                      onChange={e => upsertFactureMoisType(mois, annee, montantF1, 'agente_vers_ctp', { statut: e.target.value })}
                      className={`border rounded px-2 py-1 text-xs focus:outline-none ${f1?.statut === 'paye' ? 'border-green-300 bg-white text-green-700' : f1?.statut === 'facture' ? 'border-blue-300 bg-white text-blue-700' : 'border-gray-200 text-gray-600 bg-white'}`}>
                      <option value="a_facturer">📋 À facturer</option>
                      
                      <option value="paye">✅ Payé</option>
                    </select>
                    {f1?.facture_path ? (
                      <div className="flex items-center gap-2">
                        <button onClick={async () => { const { data } = await supabase.storage.from('documents').createSignedUrl(f1.facture_path, 3600); if (data?.signedUrl) window.open(data.signedUrl, '_blank') }} className="text-xs text-blue-600 hover:underline">📄 Voir</button>
                        <label className="text-xs text-gray-400 cursor-pointer hover:text-blue-600">Remplacer<input type="file" accept=".pdf" className="hidden" onChange={e => e.target.files[0] && uploadFacturePdfType(mois, annee, montantF1, 'agente_vers_ctp', e.target.files[0])} /></label>
                      </div>
                    ) : (
                      <label className={`text-xs cursor-pointer px-2 py-1 rounded border transition-all ${uploadingFactureAgente === uploadKey1 ? 'text-gray-400 border-gray-200' : 'text-blue-600 border-blue-200 bg-white hover:bg-blue-50'}`}>
                        {uploadingFactureAgente === uploadKey1 ? 'Upload...' : '+ Uploader PDF'}
                        <input type="file" accept=".pdf" className="hidden" disabled={uploadingFactureAgente === uploadKey1} onChange={e => e.target.files[0] && uploadFacturePdfType(mois, annee, montantF1, 'agente_vers_ctp', e.target.files[0])} />
                      </label>
                    )}
                  </div>
                </div>
                {/* Facture 2 — réceptrice */}
                {montantF2 > 0 && (
                  <div className="border border-gray-100 rounded-lg p-3 space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-xs font-semibold text-red-800">{nomFranchisee} doit facturer à {nomAgente}</p>
                      </div>
                      <span className="text-sm font-bold text-red-700">{fmt(montantF2)}</span>
                    </div>
                    <div className="space-y-1 text-xs text-red-700">
                      {redevMois > 0 && <div className="flex justify-between"><span>Redevance mensuelle</span><span>{fmt(redevMois)}</span></div>}
                      {apporteurMois > 0 && <div className="flex justify-between"><span>Apporteur client remboursé</span><span>{fmt(apporteurMois)}</span></div>}
                    </div>
                    {/* Agente = réceptrice : badge statut + case à cocher "J'ai payé" */}
                    <div className="flex items-center gap-3 pt-1 border-t border-red-100 flex-wrap">
                      {statutBadge(f2)}
                      {f2?.facture_path && (
                        <button onClick={async () => { const { data } = await supabase.storage.from('documents').createSignedUrl(f2.facture_path, 3600); if (data?.signedUrl) window.open(data.signedUrl, '_blank') }} className="text-xs text-blue-600 hover:underline">📄 Voir facture</button>
                      )}
                      <label className="flex items-center gap-1.5 cursor-pointer ml-auto">
                        <input type="checkbox" checked={f2?.statut === 'paye'}
                          onChange={e => upsertFactureMoisType(mois, annee, montantF2, 'ctp_vers_agente', { statut: e.target.checked ? 'paye' : 'facture' })}
                          className="w-4 h-4 accent-red-600" />
                        <span className="text-xs text-red-700 font-medium">J'ai payé</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ── FACTURATION ANNEE AGENTE ───────────────────────────────────────────────

  const renderFacturationAnneeAgente = () => {
    const annees = []
    for (let a = new Date().getFullYear(); a >= 2023; a--) annees.push(a)
    const rowsReel = agrégerParPaiement(mesDossiers, false)

    const clesMois = Array.from(new Set(rowsReel.map(([k]) => k)))
      .filter(k => k.startsWith(String(anneeSelectionnee))).sort()

    let totalF1 = 0, totalF2 = 0, totalPayeF1 = 0, totalPayeF2 = 0

    const lignes = clesMois.map(cle => {
      const [, mStr] = cle.split('-')
      const mois = parseInt(mStr)
      const agg = rowsReel.find(([k]) => k === cle)?.[1] || {}
      const montantF1 = round2((agg.fraisAgenteNet||0) + (agg.comAgenteNet||0) + (agg.honAgenteNet||0) + (agg.comApporteursAgenteNet||0))
      const debutRedev = profile?.redevance_debut ? new Date(profile.redevance_debut) : null
      const moisConcerne = new Date(anneeSelectionnee, mois - 1, 1)
      const redev = debutRedev && moisConcerne >= debutRedev ? 540 : 0
      const montantF2 = round2(redev + (agg.apporteurRembourseNet||0))
      const f1 = facturesAgente.find(f => f.mois === mois && f.annee === anneeSelectionnee && f.agente_id === profile?.id && f.type_facture === 'agente_vers_ctp')
      const f2 = facturesAgente.find(f => f.mois === mois && f.annee === anneeSelectionnee && f.agente_id === profile?.id && f.type_facture === 'ctp_vers_agente')
      totalF1 += montantF1; totalF2 += montantF2
      if (f1?.statut === 'paye') totalPayeF1 += montantF1
      if (f2?.statut === 'paye') totalPayeF2 += montantF2
      return { mois, cle, montantF1, montantF2, f1, f2 }
    })

    const statutBadge = (f) => {
      const s = f?.statut || 'a_facturer'
      return <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${s === 'paye' ? 'text-green-700 bg-green-50 border-green-300' : s === 'facture' ? 'text-blue-700 bg-blue-50 border-blue-300' : 'text-gray-500 bg-gray-50 border-gray-200'}`}>
        {s === 'paye' ? '✅ Payé' :  '📋 À facturer'}
      </span>
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="grid grid-cols-2 gap-3 flex-1">
            <div className="bg-green-50 border border-green-200 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1">📤 {nomFranchisee} me doit (F1)</p>
              <p className="text-lg font-bold text-green-700">{fmt(totalF1)}</p>
              <p className="text-xs text-gray-400 mt-0.5">Reçu : {fmt(totalPayeF1)} · En attente : {fmt(round2(totalF1 - totalPayeF1))}</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1">📥 Je dois à {nomFranchisee} (F2)</p>
              <p className="text-lg font-bold text-red-600">{fmt(totalF2)}</p>
              <p className="text-xs text-gray-400 mt-0.5">Payé : {fmt(totalPayeF2)} · Restant : {fmt(round2(totalF2 - totalPayeF2))}</p>
            </div>
            <div className={`border rounded-xl p-3 ${round2(totalF1-totalF2) >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'}`}>
              <p className="text-xs text-gray-500 mb-1">Net indicatif</p>
              <p className={`text-lg font-bold ${round2(totalF1-totalF2) >= 0 ? 'text-blue-700' : 'text-amber-600'}`}>
                  {round2(totalF1-totalF2) >= 0 ? '+' : ''}{fmt(round2(totalF1-totalF2))}
              </p>
            </div>
            <select value={anneeSelectionnee} onChange={e => setAnneeSelectionnee(parseInt(e.target.value))}
              className="ml-4 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-400">
              {annees.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>                   
        </div>
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {thL('Mois')}
                {thR('F1 (je facture)')}
                {thR('Statut F1')}
                {thR('F2 (je reçois)')}
                {thR('Statut F2')}
                {thR('Net')}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lignes.map(({ mois, montantF1, montantF2, f1, f2 }) => {
                const net = round2(montantF1 - montantF2)
                return (
                  <tr key={mois} className="hover:bg-gray-50">
                    <td className="px-3 py-2.5 font-medium text-gray-800">{MOIS[mois]} {anneeSelectionnee}</td>
                    <td className="px-3 py-2.5 text-right text-green-700 font-medium">{fmt(montantF1)}</td>
                    <td className="px-3 py-2.5 text-right">{statutBadge(f1)}</td>
                    <td className="px-3 py-2.5 text-right text-red-600">{montantF2 > 0 ? fmt(montantF2) : '—'}</td>
                    <td className="px-3 py-2.5 text-right">{montantF2 > 0 ? statutBadge(f2) : '—'}</td>
                    <td className={`px-3 py-2.5 text-right font-bold ${net >= 0 ? 'text-blue-700' : 'text-amber-600'}`}>{net >= 0 ? '+' : ''}{fmt(net)}</td>
                  </tr>
                )
              })}
              {lignes.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">Aucune donnée pour {anneeSelectionnee}</td></tr>}
            </tbody>
            {lignes.length > 0 && (
              <tfoot className="bg-gray-50 border-t-2 border-gray-300 font-bold">
                <tr>
                  <td className="px-3 py-2 text-gray-700">Total</td>
                  <td className="px-3 py-2 text-right text-green-700">{fmt(totalF1)}</td>
                  <td className="px-3 py-2 text-right text-xs text-gray-400">{fmt(totalPayeF1)} payé</td>
                  <td className="px-3 py-2 text-right text-red-600">{fmt(totalF2)}</td>
                  <td className="px-3 py-2 text-right text-xs text-gray-400">{fmt(totalPayeF2)} payé</td>
                  <td className={`px-3 py-2 text-right ${round2(totalF1-totalF2) >= 0 ? 'text-blue-700' : 'text-amber-600'}`}>{round2(totalF1-totalF2) >= 0 ? '+' : ''}{fmt(round2(totalF1-totalF2))}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    )
  }

  // ── SUIVI FINANCIER AGENTE ─────────────────────────────────────────────────

  const renderSuiviAgenteFinancier = () => {
    const rowsReel = agrégerParPaiement(mesDossiers, false)
    const objectifMensuel = round2(getObjectif('agente', profile?.id) / 12)
    const objectifAgence  = getObjectif('agence')

    const getReelNetAgente = (agg, redev) =>
      round2((agg.gainsAgenteReels||0) - redev - (agg.apporteurRembourseNet||0))

    const allKeys = new Set([
      ...rowsReel.map(([k]) => k),
      ...mesRedevances.filter(r => r.statut === 'regle').map(r => `${r.annee}-${String(r.mois).padStart(2, '0')}`),
    ])
    const cles = Array.from(allKeys).sort((a, b) => b.localeCompare(a))

    const sfSousOnglet    = sfSousOngletAgente
    const setSfSousOnglet = setSfSousOngletAgente

    const chartLabels = cles.map(cle => { const [a, m] = cle.split('-'); return `${MOIS[parseInt(m)].slice(0,3)}. ${a}` })
    const chartProduits = cles.map(cle => {
      const agg = rowsReel.find(([k]) => k === cle)?.[1] || {}
      return round2((agg.fraisAgenteNet||0) + (agg.comAgenteNet||0) + (agg.honAgenteNet||0) + (agg.comApporteursAgenteNet||0))
    })
    const chartCharges = cles.map(cle => {
      const [a, m] = cle.split('-')
      const redev = mesRedevances.filter(r => r.statut === 'regle' && r.annee === parseInt(a) && r.mois === parseInt(m)).reduce((s, r) => s + (r.montant_ttc||540), 0)
      const agg = rowsReel.find(([k]) => k === cle)?.[1] || {}
      return -round2(redev + (agg.apporteurRembourseNet||0))
    })
    const chartNet = cles.map((_, i) => round2(chartProduits[i] + chartCharges[i]))

    // CR mensuel agente pour accordéon
    const crAgentePourCle = (cle) => {
      const [a, m] = cle.split('-')
      const agg = rowsReel.find(([k]) => k === cle)?.[1] || {}
      const redev = mesRedevances.filter(r => r.statut === 'regle' && r.annee === parseInt(a) && r.mois === parseInt(m)).reduce((s, r) => s + (r.montant_ttc||540), 0)
      const gains = round2((agg.fraisAgenteNet||0) + (agg.comAgenteNet||0) + (agg.honAgenteNet||0) + (agg.comApporteursAgenteNet||0))
      const charges = round2(redev + (agg.apporteurRembourseNet||0))
      const net = round2(gains - charges)
      const mapPrevi = {}
      mesDossiers.forEach(d => {
        const key = getKeyFromDate(d.date_signature_contrat || d.created_at, false)
        if (!key) return
        if (!mapPrevi[key]) mapPrevi[key] = { frais: 0, com: 0, hon: 0, comApport: 0, apporteur: 0 }
        const c = calculer(d)
        mapPrevi[key].frais     = round2(mapPrevi[key].frais     + c.fraisAgentePrevi)
        mapPrevi[key].com       = round2(mapPrevi[key].com       + c.comAgenteTous)
        mapPrevi[key].hon       = round2(mapPrevi[key].hon       + c.honPreviAgente)
        mapPrevi[key].comApport = round2(mapPrevi[key].comApport + c.comApporteursAgentePrevi)
        mapPrevi[key].apporteur = round2(mapPrevi[key].apporteur + c.apporteurAgente)
      })
      const p = mapPrevi[cle] || {}
      const previGains = round2((p.frais||0) + (p.com||0) + (p.hon||0) + (p.comApport||0))
      const previCharges = round2((p.apporteur||0) + redev)
      const previNet = round2(previGains - previCharges)
      const ecart = (pv, rv) => { const e = round2(rv-pv); return <span className={`text-xs font-medium ${e>=0?'text-green-600':'text-red-500'}`}>{e>=0?'+':''}{fmt(e)}</span> }
      return (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-gray-100">
              <th className="text-left px-2 py-1 text-gray-400 uppercase w-1/2">Ligne</th>
              <th className="text-right px-2 py-1 text-gray-400 uppercase">Prévi</th>
              <th className="text-right px-2 py-1 text-gray-400 uppercase">Réel</th>
              <th className="text-right px-2 py-1 text-gray-400 uppercase">Écart</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              <tr className="bg-gray-50"><td colSpan={4} className="px-2 py-1 text-xs font-medium text-gray-400 uppercase">Gains</td></tr>
              {[
                { label: '(+) Frais consultation', p: p.frais||0, r: agg.fraisAgenteNet||0 },
                { label: '(+) Commissions',        p: p.com||0,   r: agg.comAgenteNet||0 },
                { label: '(+) Honoraires',         p: p.hon||0,   r: agg.honAgenteNet||0 },
                { label: '(+) Com. apporteurs',    p: p.comApport||0, r: agg.comApporteursAgenteNet||0 },
              ].map(({ label, p: pv, r: rv }) => (
                <tr key={label}>
                  <td className="px-2 py-1.5 text-gray-500">{label}</td>
                  <td className="px-2 py-1.5 text-right text-gray-500">{fmt(pv)}</td>
                  <td className="px-2 py-1.5 text-right text-green-700 font-medium">{fmt(rv)}</td>
                  <td className="px-2 py-1.5 text-right">{ecart(pv, rv)}</td>
                </tr>
              ))}
              <tr className="bg-gray-50 border-t border-gray-200">
                <td className="px-2 py-1.5 font-medium text-gray-700">= Total gains</td>
                <td className="px-2 py-1.5 text-right font-medium text-gray-700">{fmt(previGains)}</td>
                <td className="px-2 py-1.5 text-right font-medium text-green-700">{fmt(gains)}</td>
                <td className="px-2 py-1.5 text-right">{ecart(previGains, gains)}</td>
              </tr>
              <tr className="bg-gray-50"><td colSpan={4} className="px-2 py-1 text-xs font-medium text-gray-400 uppercase">Charges</td></tr>
              {[
                { label: '(−) Redevance', p: redev, r: redev },
                { label: '(−) Apporteur remboursé', p: p.apporteur||0, r: agg.apporteurRembourseNet||0 },
              ].map(({ label, p: pv, r: rv }) => (
                <tr key={label}>
                  <td className="px-2 py-1.5 text-gray-500">{label}</td>
                  <td className="px-2 py-1.5 text-right text-gray-500">{fmt(pv)}</td>
                  <td className="px-2 py-1.5 text-right text-red-500 font-medium">{fmt(rv)}</td>
                  <td className="px-2 py-1.5 text-right">{ecart(pv, rv)}</td>
                </tr>
              ))}
              <tr className="bg-gray-50 border-t border-gray-200">
                <td className="px-2 py-1.5 font-medium text-gray-700">= Total charges</td>
                <td className="px-2 py-1.5 text-right font-medium text-gray-700">{fmt(previCharges)}</td>
                <td className="px-2 py-1.5 text-right font-medium text-red-500">{fmt(charges)}</td>
                <td className="px-2 py-1.5 text-right">{ecart(previCharges, charges)}</td>
              </tr>
              <tr className="bg-blue-50 border-t-2 border-blue-100">
                <td className="px-2 py-2 font-bold text-blue-800">= Mon net</td>
                <td className="px-2 py-2 text-right font-bold text-gray-600">{fmt(previNet)}</td>
                <td className={`px-2 py-2 text-right font-bold ${net>=0?'text-blue-800':'text-red-600'}`}>{fmt(net)}</td>
                <td className="px-2 py-2 text-right">{ecart(previNet, net)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )
    }

    // CR annuel agente
    const crAgenteAnnuel = () => {
      const annees = []
      for (let a = new Date().getFullYear(); a >= 2023; a--) annees.push(a)
      const rowsReelAnnee = agrégerParPaiement(mesDossiers, false)
      const clesMois = Array.from(new Set([
        ...rowsReelAnnee.map(([k]) => k),
        ...mesRedevances.filter(r => r.statut === 'regle').map(r => `${r.annee}-${String(r.mois).padStart(2,'0')}`),
      ])).filter(k => k.startsWith(String(anneeSelectionnee))).sort()

      const totG = { frais: 0, com: 0, hon: 0, comApport: 0 }
      const totC = { redev: 0, apporteur: 0 }
      const prevG = { frais: 0, com: 0, hon: 0, comApport: 0 }
      const prevC = { redev: 0, apporteur: 0 }

      const mapPrevi = {}
      mesDossiers.forEach(d => {
        const key = getKeyFromDate(d.date_signature_contrat || d.created_at, false)
        if (!key) return
        if (!mapPrevi[key]) mapPrevi[key] = { frais: 0, com: 0, hon: 0, comApport: 0, apporteur: 0 }
        const c = calculer(d)
        mapPrevi[key].frais     = round2(mapPrevi[key].frais     + c.fraisAgentePrevi)
        mapPrevi[key].com       = round2(mapPrevi[key].com       + c.comAgenteTous)
        mapPrevi[key].hon       = round2(mapPrevi[key].hon       + c.honPreviAgente)
        mapPrevi[key].comApport = round2(mapPrevi[key].comApport + c.comApporteursAgentePrevi)
        mapPrevi[key].apporteur = round2(mapPrevi[key].apporteur + c.apporteurAgente)
      })

      clesMois.forEach(cle => {
        const [, m] = cle.split('-')
        const r = rowsReelAnnee.find(([k]) => k === cle)?.[1] || {}
        const p = mapPrevi[cle] || {}
        const redev = mesRedevances.filter(rv => rv.statut === 'regle' && rv.annee === anneeSelectionnee && rv.mois === parseInt(m)).reduce((s, rv) => s + (rv.montant_ttc||540), 0)
        totG.frais = round2(totG.frais + (r.fraisAgenteNet||0))
        totG.com   = round2(totG.com   + (r.comAgenteNet||0))
        totG.hon   = round2(totG.hon   + (r.honAgenteNet||0))
        totG.comApport = round2(totG.comApport + (r.comApporteursAgenteNet||0))
        totC.redev = round2(totC.redev + redev)
        totC.apporteur = round2(totC.apporteur + (r.apporteurRembourseNet||0))
        prevG.frais = round2(prevG.frais + (p.frais||0)); prevG.com = round2(prevG.com + (p.com||0))
        prevG.hon = round2(prevG.hon + (p.hon||0)); prevG.comApport = round2(prevG.comApport + (p.comApport||0))
        prevC.apporteur = round2(prevC.apporteur + (p.apporteur||0)); prevC.redev = round2(prevC.redev + redev)
      })

      const reelGains = round2(totG.frais + totG.com + totG.hon + totG.comApport)
      const reelCharges = round2(totC.redev + totC.apporteur)
      const reelNet = round2(reelGains - reelCharges)
      const previGains = round2(prevG.frais + prevG.com + prevG.hon + prevG.comApport)
      const previCharges = round2(prevC.redev + prevC.apporteur)
      const previNet = round2(previGains - previCharges)
      const ecart = (p, r) => { const e = round2(r-p); return <span className={`text-xs font-medium ${e>=0?'text-green-600':'text-red-500'}`}>{e>=0?'+':''}{fmt(e)}</span> }

      const chartLabelsA = clesMois.map(cle => { const [,m] = cle.split('-'); return MOIS[parseInt(m)].slice(0,3) })
      const chartProduitsA = clesMois.map(cle => { const r = rowsReelAnnee.find(([k])=>k===cle)?.[1]||{}; return round2((r.fraisAgenteNet||0)+(r.comAgenteNet||0)+(r.honAgenteNet||0)+(r.comApporteursAgenteNet||0)) })
      const chartChargesA = clesMois.map(cle => { const [,m]=cle.split('-'); const r=rowsReelAnnee.find(([k])=>k===cle)?.[1]||{}; const redev=mesRedevances.filter(rv=>rv.statut==='regle'&&rv.annee===anneeSelectionnee&&rv.mois===parseInt(m)).reduce((s,rv)=>s+(rv.montant_ttc||540),0); return -round2(redev+(r.apporteurRembourseNet||0)) })
      const chartNetA = clesMois.map((_,i)=>round2(chartProduitsA[i]+chartChargesA[i]))

      return (
        <div className="space-y-5">
          <ObjectifBar label="Mon objectif CA annuel" reel={reelNet}
            objectifMontant={getObjectif('agente', profile?.id)} cible="agente"
            agenteId={profile?.id} canEdit={true} onSave={sauvegarderObjectif} />
          {objectifAgence > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
              Objectif CA agence : <span className="font-bold">{fmt(objectifAgence)}</span>
            </div>
          )}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-200">
              <span className="text-sm font-medium text-gray-700">Mon compte de résultat</span>
              <div className="flex items-center gap-3">
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">réel encaissé</span>
                <select value={anneeSelectionnee} onChange={e => setAnneeSelectionnee(parseInt(e.target.value))}
                  className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-400">
                  {annees.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100">
                <th className="text-left px-5 py-2 text-xs font-medium text-gray-400 uppercase w-1/2">Ligne</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-gray-400 uppercase">Prévisionnel</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-gray-400 uppercase">Réel</th>
                <th className="text-right px-5 py-2 text-xs font-medium text-gray-400 uppercase">Écart</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                <tr className="bg-gray-50"><td colSpan={4} className="px-5 py-1.5 text-xs font-medium text-gray-400 uppercase">Gains</td></tr>
                {[
                  { label: '(+) Frais consultation', p: prevG.frais, r: totG.frais },
                  { label: '(+) Commissions', p: prevG.com, r: totG.com },
                  { label: '(+) Honoraires', p: prevG.hon, r: totG.hon },
                  { label: '(+) Com. apporteurs', p: prevG.comApport, r: totG.comApport },
                ].map(({ label, p, r }) => (
                  <tr key={label} className="hover:bg-gray-50">
                    <td className="px-5 py-2.5 text-gray-500 text-xs">{label}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500 text-xs">{fmt(p)}</td>
                    <td className="px-4 py-2.5 text-right text-green-700 text-xs font-medium">{fmt(r)}</td>
                    <td className="px-5 py-2.5 text-right">{ecart(p, r)}</td>
                  </tr>
                ))}
                <tr className="bg-gray-50 border-t border-gray-200">
                  <td className="px-5 py-2.5 font-medium text-gray-700 text-xs">= Total gains</td>
                  <td className="px-4 py-2.5 text-right font-medium text-gray-700 text-xs">{fmt(previGains)}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-green-700 text-xs">{fmt(reelGains)}</td>
                  <td className="px-5 py-2.5 text-right">{ecart(previGains, reelGains)}</td>
                </tr>
                <tr className="bg-gray-50"><td colSpan={4} className="px-5 py-1.5 text-xs font-medium text-gray-400 uppercase">Charges</td></tr>
                {[
                  { label: '(−) Redevances', p: prevC.redev, r: totC.redev },
                  { label: '(−) Apporteurs remboursés', p: prevC.apporteur, r: totC.apporteur },
                ].map(({ label, p, r }) => (
                  <tr key={label} className="hover:bg-gray-50">
                    <td className="px-5 py-2.5 text-gray-500 text-xs">{label}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500 text-xs">{fmt(p)}</td>
                    <td className="px-4 py-2.5 text-right text-red-500 text-xs font-medium">{fmt(r)}</td>
                    <td className="px-5 py-2.5 text-right">{ecart(p, r)}</td>
                  </tr>
                ))}
                <tr className="bg-gray-50 border-t border-gray-200">
                  <td className="px-5 py-2.5 font-medium text-gray-700 text-xs">= Total charges</td>
                  <td className="px-4 py-2.5 text-right font-medium text-gray-700 text-xs">{fmt(previCharges)}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-red-500 text-xs">{fmt(reelCharges)}</td>
                  <td className="px-5 py-2.5 text-right">{ecart(previCharges, reelCharges)}</td>
                </tr>
                <tr className="bg-blue-50 border-t-2 border-blue-100">
                  <td className="px-5 py-3 font-bold text-blue-800 text-sm">= Mon net {anneeSelectionnee}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-600 text-sm">{fmt(previNet)}</td>
                  <td className={`px-4 py-3 text-right font-bold text-sm ${reelNet>=0?'text-blue-800':'text-red-600'}`}>{fmt(reelNet)}</td>
                  <td className="px-5 py-3 text-right">{ecart(previNet, reelNet)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <SuiviCTPChart labels={chartLabelsA} produitsData={chartProduitsA} chargesData={chartChargesA} netData={chartNetA} chartId={`chart_agente_annee_${anneeSelectionnee}`} />
        </div>
      )
    }

    return (
      <div className="space-y-5">
        <div className="flex gap-2">
          {[{ key: 'mois', label: 'Par mois' }, { key: 'annee', label: 'Par année' }].map(({ key, label }) => (
            <button key={key} onClick={() => setSfSousOnglet(key)}
              className={`text-sm px-3 py-1.5 rounded-lg border transition-all ${sfSousOnglet === key ? 'bg-blue-800 text-white border-blue-800' : 'bg-white text-gray-600 hover:border-gray-300'}`}>
              {label}
            </button>
          ))}
        </div>

        {sfSousOnglet === 'mois' && (
          <div className="space-y-5">
            <ObjectifBar label={`Mon objectif mensuel (${fmt(objectifMensuel)}/mois)`}
              reel={(() => {
                const moisCourant = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
                const agg = rowsReel.find(([k]) => k === moisCourant)?.[1] || {}
                const redev = mesRedevances.filter(rv => rv.statut === 'regle' && rv.annee === new Date().getFullYear() && rv.mois === new Date().getMonth() + 1).reduce((s, rv) => s + (rv.montant_ttc||540), 0)
                return getReelNetAgente(agg, redev)
              })()}
              objectifMontant={objectifMensuel} cible="agente" agenteId={profile?.id} canEdit={true} onSave={sauvegarderObjectif} />
            {objectifAgence > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
                Objectif CA agence : <span className="font-bold">{fmt(objectifAgence)}</span>
              </div>
            )}
            <SuiviCTPChart labels={chartLabels} produitsData={chartProduits} chargesData={chartCharges} netData={chartNet} chartId="chart_agente_mois" />
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase">Mois</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-gray-400 uppercase">Réel net</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-gray-400 uppercase">Objectif mois</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-gray-400 uppercase">vs Objectif</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cles.map((cle, i) => {
                    const [a, m] = cle.split('-')
                    const label = `${MOIS[parseInt(m)].slice(0,3)}. ${a}`
                    const agg = rowsReel.find(([k]) => k === cle)?.[1] || {}
                    const redev = mesRedevances.filter(rv => rv.statut === 'regle' && rv.annee === parseInt(a) && rv.mois === parseInt(m)).reduce((s, rv) => s + (rv.montant_ttc||540), 0)
                    const reelNet = getReelNetAgente(agg, redev)
                    const ecartObj = round2(reelNet - objectifMensuel)
                    const isOpen = moisOuvert === `agente_${cle}`
                    const bg = i % 2 === 0 ? '' : 'bg-gray-50'
                    return (
                      <React.Fragment key={cle}>
                        <tr className={`cursor-pointer hover:bg-blue-50 ${bg}`} onClick={() => setMoisOuvert(isOpen ? null : `agente_${cle}`)}>
                          <td className="px-4 py-2.5 font-medium text-gray-700 flex items-center gap-2">
                            <span>{label}</span>
                            <span className="text-gray-300 text-xs">{isOpen ? '▲' : '▼'}</span>
                          </td>
                          <td className={`px-3 py-2.5 text-right font-medium ${reelNet >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmt(reelNet)}</td>
                          <td className="px-3 py-2.5 text-right text-gray-400">{fmt(objectifMensuel)}</td>
                          <td className={`px-4 py-2.5 text-right font-medium ${ecartObj >= 0 ? 'text-green-600' : 'text-red-500'}`}>{ecartObj >= 0 ? '+' : ''}{fmt(ecartObj)}</td>
                        </tr>
                        {isOpen && (
                          <tr className={bg}>
                            <td colSpan={4} className="px-4 pb-3">{crAgentePourCle(cle)}</td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                  <tr className="bg-gray-50 border-t-2 border-gray-300 font-bold text-xs">
                    <td className="px-4 py-2.5 text-gray-700">Total</td>
                    <td className={`px-3 py-2.5 text-right ${cles.reduce((s,cle)=>{const [a,m]=cle.split('-');const agg=rowsReel.find(([k])=>k===cle)?.[1]||{};const redev=mesRedevances.filter(rv=>rv.statut==='regle'&&rv.annee===parseInt(a)&&rv.mois===parseInt(m)).reduce((sv,rv)=>sv+(rv.montant_ttc||540),0);return s+getReelNetAgente(agg,redev)},0)>=0?'text-green-700':'text-red-600'}`}>
                      {fmt(cles.reduce((s,cle)=>{const [a,m]=cle.split('-');const agg=rowsReel.find(([k])=>k===cle)?.[1]||{};const redev=mesRedevances.filter(rv=>rv.statut==='regle'&&rv.annee===parseInt(a)&&rv.mois===parseInt(m)).reduce((sv,rv)=>sv+(rv.montant_ttc||540),0);return s+getReelNetAgente(agg,redev)},0))}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-400">{fmt(objectifMensuel * cles.length)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500">—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
        {sfSousOnglet === 'annee' && crAgenteAnnuel()}
      </div>
    )
  }

  // ── AGENTE MOIS ADMIN ──────────────────────────────────────────────────────

  const renderAgenteMoisAdmin = () => {
    const isAnnee = sousOnglet === 'annee'
    const rowsReel = agrégerParPaiement(dossiersAgente, isAnnee)

    // Totaux annuels si vue année
    if (isAnnee) {
      const annees = []
      for (let a = new Date().getFullYear(); a >= 2023; a--) annees.push(a)

      const clesMois = Array.from(new Set(rowsReel.map(([k]) => k)))
        .filter(k => k.startsWith(String(anneeSelectionnee))).sort()

      let totalF1 = 0, totalF2 = 0, totalPayeF1 = 0, totalPayeF2 = 0

      const lignes = clesMois.map(cle => {
        const [, mStr] = cle.split('-')
        const mois = parseInt(mStr)
        const agg = rowsReel.find(([k]) => k === cle)?.[1] || {}
        const gains = round2(agg.gainsAgenteReels||0)
        const debutRedev = agenteActuelle?.redevance_debut ? new Date(agenteActuelle.redevance_debut) : null
        const moisConcerne = new Date(anneeSelectionnee, mois - 1, 1)
        const redev = debutRedev && moisConcerne >= debutRedev ? 540 : 0
        const apporteur = round2(agg.apporteurRembourseNet||0)
        const duParAgente = round2(redev + apporteur)
        const f1 = facturesAgente.find(f => f.mois === mois && f.annee === anneeSelectionnee && f.agente_id === agenteSelectionnee && f.type_facture === 'agente_vers_ctp')
        const f2 = facturesAgente.find(f => f.mois === mois && f.annee === anneeSelectionnee && f.agente_id === agenteSelectionnee && f.type_facture === 'ctp_vers_agente')
        totalF1 += gains; totalF2 += duParAgente
        if (f1?.statut === 'paye') totalPayeF1 += gains
        if (f2?.statut === 'paye') totalPayeF2 += duParAgente
        return { mois, gains, duParAgente, f1, f2 }
      })

      const statutBadge = (f) => {
        const s = f?.statut || 'a_facturer'
        return <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${s === 'paye' ? 'text-green-700 bg-green-50 border-green-300' : 'text-gray-500 bg-gray-50 border-gray-200'}`}>
          {s === 'paye' ? '✅ Payé' : '📋 À facturer'}
        </span>
      }

      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="grid grid-cols-2 gap-3 flex-1">
              <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-1">📥 {nomFranchisee} doit verser (F2)</p>
                <p className="text-lg font-bold text-green-700">{fmt(totalF2)}</p>
                <p className="text-xs text-gray-400 mt-0.5">Reçu : {fmt(totalPayeF2)} · En attente : {fmt(round2(totalF2 - totalPayeF2))}</p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-1">📤 {nomAgente} doit verser (F1)</p>
                <p className="text-lg font-bold text-red-600">{fmt(totalF1)}</p>
                <p className="text-xs text-gray-400 mt-0.5">Payé : {fmt(totalPayeF1)} · Restant : {fmt(round2(totalF1 - totalPayeF1))}</p>
              </div>
               <div className={`border rounded-xl p-3 ${round2(totalF2-totalF1) >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'}`}>
                <p className="text-xs text-gray-500 mb-1">Net indicatif</p>
                <p className={`text-lg font-bold ${round2(totalF2-totalF1) >= 0 ? 'text-blue-700' : 'text-amber-600'}`}>
                  {round2(totalF2-totalF1) >= 0 ? '+' : ''}{fmt(round2(totalF2-totalF1))}
                </p>
              </div>
              <select value={anneeSelectionnee} onChange={e => setAnneeSelectionnee(parseInt(e.target.value))}
                className="ml-4 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-400">
                {annees.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {thL('Mois')}
                  {thR('F2 (Marine facture)')}
                  {thR('Statut F2')}
                  {thR('F1 (Agente facture)')}
                  {thR('Statut F1')}
                  {thR('Net')}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lignes.map(({ mois, gains, duParAgente, f1, f2 }) => {
                  const net = round2(duParAgente - gains)
                  return (
                    <tr key={mois} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5 font-medium text-gray-800">{MOIS[mois]} {anneeSelectionnee}</td>
                      <td className="px-3 py-2.5 text-right text-green-700 font-medium">{duParAgente > 0 ? fmt(duParAgente) : '—'}</td>
                      <td className="px-3 py-2.5 text-right">{duParAgente > 0 ? statutBadge(f2) : '—'}</td>
                      <td className="px-3 py-2.5 text-right text-red-600">{gains > 0 ? fmt(gains) : '—'}</td>
                      <td className="px-3 py-2.5 text-right">{gains > 0 ? statutBadge(f1) : '—'}</td>
                      <td className={`px-3 py-2.5 text-right font-bold ${net >= 0 ? 'text-blue-700' : 'text-amber-600'}`}>{net >= 0 ? '+' : ''}{fmt(net)}</td>
                    </tr>
                  )
                })}
                {lignes.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">Aucune donnée pour {anneeSelectionnee}</td></tr>}
              </tbody>
              {lignes.length > 0 && (
                <tfoot className="bg-gray-50 border-t-2 border-gray-300 font-bold">
                  <tr>
                    <td className="px-3 py-2 text-gray-700">Total</td>
                    <td className="px-3 py-2 text-right text-green-700">{fmt(totalF2)}</td>
                    <td className="px-3 py-2 text-right text-xs text-gray-400">{fmt(totalPayeF2)} payé</td>
                    <td className="px-3 py-2 text-right text-red-600">{fmt(totalF1)}</td>
                    <td className="px-3 py-2 text-right text-xs text-gray-400">{fmt(totalPayeF1)} payé</td>
                    <td className={`px-3 py-2 text-right ${round2(totalF2-totalF1) >= 0 ? 'text-blue-700' : 'text-amber-600'}`}>{round2(totalF2-totalF1) >= 0 ? '+' : ''}{fmt(round2(totalF2-totalF1))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )
    }

    // Vue par mois — cartes détaillées
    return (
      <div className="space-y-4">
        {rowsReel.map(([key, agg]) => {
          const [anneeStr, moisStr] = key.split('-')
          const annee = parseInt(anneeStr)
          const mois  = parseInt(moisStr)
          const label = `${MOIS[mois]} ${annee}`
          const gains = round2(agg.gainsAgenteReels||0)
          const debutRedev = agenteActuelle?.redevance_debut ? new Date(agenteActuelle.redevance_debut) : null
          const moisConcerne = new Date(annee, mois - 1, 1)
          const redev = debutRedev && moisConcerne >= debutRedev ? 540 : 0
          const apporteur = round2(agg.apporteurRembourseNet||0)
          const duParAgente = round2(redev + apporteur)
          const net = round2(duParAgente - gains)
          const f1 = facturesAgente.find(f => f.mois === mois && f.annee === annee && f.agente_id === agenteSelectionnee && f.type_facture === 'agente_vers_ctp')
          const f2 = facturesAgente.find(f => f.mois === mois && f.annee === annee && f.agente_id === agenteSelectionnee && f.type_facture === 'ctp_vers_agente')
          const uploadKey2 = `${annee}-${mois}-ctp_vers_agente`

          const uploadF2Pdf = async (fichier) => {
            setUploadingFactureAgente(uploadKey2)
            const ext = fichier.name.split('.').pop()
            const chemin = `factures_agente/${agenteSelectionnee}/${annee}-${String(mois).padStart(2,'0')}-ctp_vers_agente.${ext}`
            const { error } = await supabase.storage.from('documents').upload(chemin, fichier, { upsert: true })
            if (!error) {
              await upsertFactureMoisType(mois, annee, duParAgente, 'ctp_vers_agente', { facture_path: chemin, statut: 'facture' })
              setSucces('Facture F2 uploadée ✓')
            } else { setErreur('Erreur upload : ' + error.message) }
            setUploadingFactureAgente(null)
          }

          const statutBadge = (f) => {
            const s = f?.statut || 'a_facturer'
            return <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${s === 'paye' ? 'text-green-700 bg-green-50 border-green-300' : s === 'facture' ? 'text-blue-700 bg-blue-50 border-blue-300' : 'text-gray-500 bg-gray-50 border-gray-200'}`}>
              {s === 'paye' ? '✅ Payé' :  '📋 À facturer'}
            </span>
          }

          return (
            <div key={key} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex justify-between items-center px-4 py-3 bg-gray-50 border-b border-gray-100">
                <span className="font-semibold text-gray-800">{label}</span>
                <span className={`text-sm font-bold ${net >= 0 ? 'text-blue-700' : 'text-amber-600'}`}>
                  Net : {net >= 0 ? '+' : ''}{fmt(net)}
                </span>
              </div>
              <div className="p-4 space-y-3">
          {/* F2 en premier — Marine émet, vert */}
          {duParAgente > 0 && (
            <div className="border border-gray-100 rounded-lg p-3 space-y-2">
              <div className="flex justify-between items-start">
                <p className="text-xs font-semibold text-green-800">{nomFranchisee} doit facturer à {nomAgente}</p>
                <span className="text-sm font-bold text-green-700">{fmt(duParAgente)}</span>
              </div>
              <div className="text-xs text-green-700 space-y-1">
                {redev > 0 && <div className="flex justify-between"><span>Redevance mensuelle</span><span>{fmt(redev)}</span></div>}
                {apporteur > 0 && <div className="flex justify-between"><span>Apporteur remboursé</span><span>{fmt(apporteur)}</span></div>}
              </div>
              <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-green-100">
                <select value={f2?.statut || 'a_facturer'}
                  onChange={e => upsertFactureMoisType(mois, annee, duParAgente, 'ctp_vers_agente', { statut: e.target.value })}
                  className={`border rounded px-2 py-1 text-xs focus:outline-none ${f2?.statut === 'paye' ? 'border-green-300 bg-white text-green-700' : 'border-gray-200 text-gray-600 bg-white'}`}>
                  <option value="a_facturer">📋 À facturer</option>
                  <option value="paye">✅ Payé</option>
                </select>
                {f2?.facture_path ? (
                  <div className="flex items-center gap-2">
                    <button onClick={async () => { const { data } = await supabase.storage.from('documents').createSignedUrl(f2.facture_path, 3600); if (data?.signedUrl) window.open(data.signedUrl, '_blank') }}
                      className="text-xs text-blue-600 hover:underline">📄 Voir</button>
                    <label className="text-xs text-gray-400 cursor-pointer hover:text-blue-600">
                      Remplacer
                      <input type="file" accept=".pdf" className="hidden" onChange={e => e.target.files[0] && uploadF2Pdf(e.target.files[0])} />
                    </label>
                  </div>
                ) : (
                  <label className={`text-xs cursor-pointer px-2 py-1 rounded border transition-all ${uploadingFactureAgente === uploadKey2 ? 'text-gray-400 border-gray-200' : 'text-blue-600 border-blue-200 bg-white hover:bg-blue-50'}`}>
                    {uploadingFactureAgente === uploadKey2 ? 'Upload...' : '+ Uploader PDF'}
                    <input type="file" accept=".pdf" className="hidden" disabled={uploadingFactureAgente === uploadKey2} onChange={e => e.target.files[0] && uploadF2Pdf(e.target.files[0])} />
                  </label>
                )}
              </div>
            </div>
          )}

          {/* F1 en second — agente émet, rouge */}
          <div className="border border-gray-100 rounded-lg p-3 space-y-2">
            <div className="flex justify-between items-start">
              <p className="text-xs font-semibold text-red-800">{nomAgente} doit facturer à {nomFranchisee}</p>
              <span className="text-sm font-bold text-red-700">{fmt(gains)}</span>
            </div>
            <div className="text-xs text-red-700 space-y-1">
              {(agg.fraisAgenteNet||0) > 0 && <div className="flex justify-between"><span>Frais</span><span>{fmt(agg.fraisAgenteNet)}</span></div>}
              {(agg.comAgenteNet||0) > 0 && <div className="flex justify-between"><span>Commissions</span><span>{fmt(agg.comAgenteNet)}</span></div>}
              {(agg.honAgenteNet||0) > 0 && <div className="flex justify-between"><span>Honoraires</span><span>{fmt(agg.honAgenteNet)}</span></div>}
            </div>
            <div className="flex items-center gap-3 pt-1 border-t border-red-100 flex-wrap">
              {statutBadge(f1)}
              {f1?.facture_path && (
                <button onClick={async () => { const { data } = await supabase.storage.from('documents').createSignedUrl(f1.facture_path, 3600); if (data?.signedUrl) window.open(data.signedUrl, '_blank') }}
                  className="text-xs text-blue-600 hover:underline">📄 Voir facture</button>
              )}
              <label className="flex items-center gap-1.5 cursor-pointer ml-auto">
                <input type="checkbox" checked={f1?.statut === 'paye'}
                  onChange={e => upsertFactureMoisType(mois, annee, gains, 'agente_vers_ctp', { statut: e.target.checked ? 'paye' : 'a_facturer' })}
                  className="w-4 h-4 accent-red-600" />
                <span className="text-xs text-red-700 font-medium">J'ai payé</span>
              </label>
            </div>
          </div>
        </div>
            </div>
          )
        })}
        {rowsReel.length === 0 && <p className="text-center text-gray-400 text-sm py-8">Aucune donnée</p>}
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ONGLETS
  // ─────────────────────────────────────────────────────────────────────────────

  const ongletsAdmin  = [
    { key: 'mes_chantiers',   label: 'Mes chantiers'      },
    { key: 'tous_chantiers',  label: 'Tous les chantiers' },
    { key: 'suivi_financier', label: 'Suivi financier'    },
    { key: 'agentes',         label: 'Agentes'            },
  ]
  const ongletsAgente = [
    { key: 'mes_chantiers', label: 'Mes chantiers'       },
    { key: 'financier',     label: 'Mon suivi financier' },
    { key: 'facturation',   label: 'Facturation'         },
  ]
  const ongletsList = isMarine ? ongletsAdmin : ongletsAgente

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDU PRINCIPAL
  // ─────────────────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Chargement...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/dashboard')} className="text-gray-400 hover:text-gray-600 text-sm">← Retour</button>
        <h1 className="text-lg font-bold text-blue-900">Finances</h1>
        {saving && <span className="text-xs text-gray-400 ml-auto">Enregistrement...</span>}
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-4 sm:space-y-6">

        {/* Cartes résumé */}
        <div className={`grid gap-3 sm:gap-4 grid-cols-2 ${isMarine ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
          {isMarine ? (
            <>
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs text-gray-400 mb-1">Net CTP (prévisionnel)</p>
                <p className="text-xl font-bold text-purple-700">{fmt(totalNetCTP)}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs text-gray-400 mb-1">Gains agentes (réel)</p>
                <p className="text-xl font-bold text-blue-700">{fmt(totalGainsAgentesReels)}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs text-gray-400 mb-1">Redevances reçues</p>
                <p className="text-xl font-bold text-green-700">{fmt(totalRedevancesReglees)}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs text-gray-400 mb-1">Chantiers</p>
                <p className="text-xl font-bold text-gray-800">{chantiersAnneeEnCours}</p>
              </div>
            </>
          ) : (
            <>
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs text-gray-400 mb-1">Gains prévisionnels</p>
                <p className="text-xl font-bold text-gray-500">{fmt(mesDossiersGainsPrevi)}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs text-gray-400 mb-1">Gains réels</p>
                <p className="text-xl font-bold text-blue-700">{fmt(mesDossiersGainsReels)}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs text-gray-400 mb-1">Mon net</p>
                <p className={`text-xl font-bold ${monNet >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmt(monNet)}</p>
              </div>
            </>
          )}
        </div>

        {/* Onglets */}
        <div className="flex gap-1 border-b  overflow-x-auto">
          {ongletsList.map(({ key, label }) => (
            <button key={key} onClick={() => { 
              setOnglet(key)
              setSousOnglet(key === 'suivi_financier' ? 'agence' : key === 'agentes' ? 'mois' : key === 'facturation' ? 'mois' : 'chantier')
            }}
              className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-all ${onglet === key ? 'border-blue-800 text-blue-800' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* ── MES CHANTIERS ── */}
        {onglet === 'mes_chantiers' && (
          <div className="space-y-4">
            {renderSousOnglets()}
            {sousOnglet === 'chantier' && renderAccordeon(mesDossiers, false)}
            {sousOnglet === 'mois'  && renderMesPeriode(mesDossiers, 'Mois', agrégerParPaiement(mesDossiers, false))}
            {sousOnglet === 'annee' && renderMesPeriode(mesDossiers, 'Année', agrégerParPaiement(mesDossiers, true))}
          </div>
        )}

        {/* ── TOUS LES CHANTIERS (admin) ── */}
        {onglet === 'tous_chantiers' && isMarine && (
          <div className="space-y-4">
            {renderSousOnglets()}
            {sousOnglet === 'chantier' && renderAccordeon(dossiers, true)}
            {sousOnglet === 'mois'  && renderTousPeriode(dossiers, agrégerParPaiement(dossiers, false), 'Mois')}
            {sousOnglet === 'annee' && renderTousPeriode(dossiers, agrégerParPaiement(dossiers, true), 'Année')}
          </div>
        )}

        {/* ── SUIVI FINANCIER (admin) ── */}
        {onglet === 'suivi_financier' && isMarine && (
          <div className="space-y-5">
            <div className="flex gap-2">
              {[{ key: 'agence', label: 'Agence' }, { key: 'ctp', label: 'CTP' }].map(({ key, label }) => (
                <button key={key} onClick={() => setSousOnglet(key)}
                  className={`text-sm px-3 py-1.5 rounded-lg border transition-all ${sousOnglet === key ? 'bg-blue-800 text-white border-blue-800' : 'bg-white text-gray-600 hover:border-gray-300'}`}>
                  {label}
                </button>
              ))}
            </div>
            {(sousOnglet === 'agence' || sousOnglet === 'ctp') && renderSuiviFinancier(sousOnglet)}
          </div>
        )}

        {/* ── AGENTES (admin) ── */}
        {onglet === 'agentes' && isMarine && (
          <div className="space-y-4">
            {renderSélecteurAgente()}
            <div className="flex gap-2">
              {[{ key: 'mois', label: 'Par mois' }, { key: 'annee', label: 'Par année' }].map(({ key, label }) => (
                <button key={key} onClick={() => setSousOnglet(key)}
                  className={`text-sm px-3 py-1.5 rounded-lg border transition-all ${sousOnglet === key ? 'bg-blue-800 text-white border-blue-800' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                  {label}
                </button>
              ))}
            </div>
            {(sousOnglet === 'mois' || sousOnglet === 'annee') && renderAgenteMoisAdmin()}
          </div>
        )}

        {/* ── MON SUIVI FINANCIER (agente) ── */}
        {onglet === 'financier' && !isMarine && (
          <div className="space-y-4">
            {renderSuiviAgenteFinancier()}
          </div>
        )}

        {/* ── FACTURATION (agente) ── */}
        {onglet === 'facturation' && !isMarine && (
          <div className="space-y-4">
            <div className="flex gap-2">
              {[{ key: 'mois', label: 'Par mois' }, { key: 'annee', label: 'Par année' }].map(({ key, label }) => (
                <button key={key} onClick={() => setSousOnglet(key)}
                  className={`text-sm px-3 py-1.5 rounded-lg border transition-all ${sousOnglet === key ? 'bg-blue-800 text-white border-blue-800' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                  {label}
                </button>
              ))}
            </div>
            {sousOnglet === 'mois'  && renderFacturationMoisSuivi()}
            {sousOnglet === 'annee' && renderFacturationAnneeAgente()}
          </div>
        )}

      </main>
    </div>
  )
}