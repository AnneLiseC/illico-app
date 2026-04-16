// app/finances/page.js
'use client'
import React from 'react'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import {
  calculateDossierFinance,
  getPartAgente,
  getActiveDevis,
  getSignedDevis,
} from '../lib/finance'

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────────────────────

const MOIS = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
const MOIS_LABELS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

// ─────────────────────────────────────────────────────────────────────────────
// UTILITAIRES PURS
// ─────────────────────────────────────────────────────────────────────────────

const round2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100
const fmt    = (n) => (Number(n) || 0).toFixed(2) + ' €'
const fmtPct = (n) => (Number(n) || 0).toFixed(1) + ' %'

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
const tdR = (val, cls = 'text-gray-700') => <td className={`px-3 py-2 text-right text-sm ${cls}`}>{val}</td>
const tdTotal = (val) => (
  <td className={`px-3 py-2 text-right text-sm font-bold ${(val || 0) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
    {fmt(val)}
  </td>
)

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
  const [redevModal, setRedevModal]   = useState(false)
  const [savingRedev, setSavingRedev] = useState(false)
  const [redevForm, setRedevForm]     = useState({
    agente_id: '', annee: new Date().getFullYear(), mois: new Date().getMonth() + 1,
    montant_ttc: 540, statut: 'en_attente', date_paiement: '', note: '',
  })

  const router = useRouter()

    // ── CHARGEMENT ─────────────────────────────────────────────────────────────

  const chargerTout = async () => {
    console.log('chargerTout start')
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
    console.log('dossiers:', dossiersData?.length, 'error:', dossiersError)
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

  // ── CALCUL FINANCIER ───────────────────────────────────────────────────────
  // calculer() : extrait les valeurs depuis lib/finance.js — zéro calcul inline
  // calculerReel() : applique les déclencheurs suivi_financier — une seule source de vérité

  const calculer = (d) => {
    const normalized = normalizeDossier(d)
    const f= calculateDossierFinance(normalized)
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
      gainsAgentePrevi: round2(f.gains.nets.agente),
      gainsAdminPrevi:  round2(f.gains.nets.admin),
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
      const gainAdminReel = round2(fraisReel + honReel + comReelNet + comApporteursReel)
      return { ...c, fraisReel, honReel, comReelNet, comApporteursReel, royaltiesReelTotal: 0, apporteurRembourse: 0, gainAgenteReel: 0, gainAdminReel, gainsAgenteReels: 0 }
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
      comReelNet,
      comApporteursReel,
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
    if (type === 'facture_finale' && champ === 'statut_client' && artisanId) {
      const statutFacture = valeur === 'regle' ? 'paye' : 'en_attente'
      await supabase.from('factures_artisans').update({ statut: statutFacture })
        .eq('dossier_id', dossierId).eq('artisan_id', artisanId)
    }
    await chargerTout()
    setSaving(false)
  }

  const toggleSuivi = async (d, type, artisanId, checked, dateChamp = 'date_paiement', statutChamp = 'statut_client', statutVal = 'regle') => {
    const valeur = checked ? statutVal : 'en_attente'
    await majSuivi(d.id, type, artisanId, statutChamp, valeur)
  }

  const setDateSuivi = async (d, type, artisanId, date, dateChamp = 'date_paiement') => {
    await majSuivi(d.id, type, artisanId, dateChamp, date)
  }

  // ── ALERTES ────────────────────────────────────────────────────────────────

  const alerte48h = (date) => date && new Date() > new Date(new Date(date).getTime() + 48 * 3600000)
  const alerte7j  = (date) => date && new Date() > new Date(new Date(date).getTime() + 7 * 24 * 3600000)

  // ── FACTURES AGENTE ────────────────────────────────────────────────────────

  const getFactureAgenteMois = (mois, annee) =>
    facturesAgente.find(f => f.mois === mois && f.annee === annee && f.agente_id === profile?.id)

  const upsertFactureAgenteMois = async (mois, annee, montant, updates) => {
    const existing = getFactureAgenteMois(mois, annee)
    if (existing) {
      await supabase.from('factures_agente').update(updates).eq('id', existing.id)
    } else {
      await supabase.from('factures_agente').insert({ agente_id: profile?.id, mois, annee, montant, ...updates })
    }
    const { data } = await supabase.from('factures_agente').select('*')
      .order('annee', { ascending: false }).order('mois', { ascending: false })
    setFacturesAgente(data || [])
  }

  const uploadFactureAgentePdf = async (mois, annee, montant, fichier) => {
    setUploadingFactureAgente(`${annee}-${mois}`)
    const ext    = fichier.name.split('.').pop()
    const chemin = `factures_agente/${profile?.id}/${annee}-${String(mois).padStart(2, '0')}.${ext}`
    const { error } = await supabase.storage.from('documents').upload(chemin, fichier, { upsert: true })
    if (!error) {
      await upsertFactureAgenteMois(mois, annee, montant, { facture_path: chemin, statut: 'facture' })
      setSucces('Facture uploadée ✓')
    } else {
      setErreur('Erreur upload : ' + error.message)
    }
    setUploadingFactureAgente(null)
  }

  // ── REDEVANCES ─────────────────────────────────────────────────────────────

  const sauvegarderRedevance = async () => {
    setSavingRedev(true)
    const payload = {
      agente_id:     redevForm.agente_id || profile?.id,
      annee:         parseInt(redevForm.annee),
      mois:          parseInt(redevForm.mois),
      montant_ttc:   parseFloat(redevForm.montant_ttc) || 540,
      statut:        redevForm.statut,
      date_paiement: redevForm.statut === 'regle'
        ? (redevForm.date_paiement || new Date().toISOString().split('T')[0]) : null,
      note: redevForm.note || null,
    }
    await supabase.from('redevances').upsert(payload, { onConflict: 'agente_id,annee,mois', ignoreDuplicates: false })
    const { data } = await supabase.from('redevances').select('*')
      .order('annee', { ascending: false }).order('mois', { ascending: false })
    setRedevances(data || [])
    setRedevModal(false)
    setRedevForm({ agente_id: '', annee: new Date().getFullYear(), mois: new Date().getMonth() + 1, montant_ttc: 540, statut: 'en_attente', date_paiement: '', note: '' })
    setSavingRedev(false)
  }

  const toggleRedevStatut = async (id, currentStatut) => {
    const newStatut = currentStatut === 'regle' ? 'en_attente' : 'regle'
    const updates   = { statut: newStatut, date_paiement: newStatut === 'regle' ? new Date().toISOString().split('T')[0] : null }
    await supabase.from('redevances').update(updates).eq('id', id)
    setRedevances(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r))
  }

  const supprimerRedevance = async (id) => {
    if (!confirm('Supprimer cette redevance ?')) return
    await supabase.from('redevances').delete().eq('id', id)
    setRedevances(prev => prev.filter(r => r.id !== id))
  }

  const genererMoisAttendus = (agenteId, annee) => {
    const now     = new Date()
    const moisMax = annee < now.getFullYear() ? 12 : now.getMonth() + 1
    return Array.from({ length: moisMax }, (_, i) => {
      const m     = i + 1
      const redev = redevances.find(r => r.agente_id === agenteId && r.annee === annee && r.mois === m)
      const enRetard = (!redev || redev.statut !== 'regle') && new Date(annee, m, 0) < now
      return { mois: m, redev, enRetard }
    })
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

  // ── TOTAUX GLOBAUX ─────────────────────────────────────────────────────────

  const totalRedevancesReglees = redevances.filter(r => r.statut === 'regle').reduce((s, r) => s + (r.montant_ttc || 540), 0)
  const totalGainsAgentesReels = dossiersAgentes.reduce((s, d) => s + calculerReel(d).gainsAgenteReels, 0)
  const totalApporteurAgenteDu = dossiersAgentes.reduce((s, d) => s + calculer(d).apporteurAgente, 0)
  const mesDossiersGainsPrevi  = mesDossiers.reduce((s, d) => s + calculer(d).gainsAgentePrevi, 0)
  const mesDossiersGainsReels  = mesDossiers.reduce((s, d) => s + calculerReel(d).gainsAgenteReels, 0)
  const mesApporteurDu         = mesDossiers.reduce((s, d) => s + calculer(d).apporteurAgente, 0)
  const mesRedevancesReglees   = mesRedevances.filter(r => r.statut === 'regle').reduce((s, r) => s + (r.montant_ttc || 540), 0)
  const monNet                 = mesDossiersGainsReels - mesRedevancesReglees - mesApporteurDu

  const totalNetCTP = dossiers.reduce((s, d) => {
    const c = calculer(d)
    return s + c.gainsAdminPrevi
  }, 0)

  // ── AGRÉGATION PAR PÉRIODE ─────────────────────────────────────────────────

  const getKeyMois = (d) => {
    if (!d.date_signature_contrat) return null
    const dt = new Date(d.date_signature_contrat)
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
  }

  const emptyAgg = () => ({
    fraisNet: 0, fraisTTC: 0, fraisAgente: 0,
    comHTSigne: 0, comTTCSigne: 0, royaltiesComSigne: 0, netComSigne: 0, comAgenteSigne: 0,
    courtHT: 0, courtNet: 0, courtAgente: 0,
    amoHT: 0, amoNet: 0, amoAgente: 0,
    honTotalTTC: 0, honTotalNet: 0, honAgente: 0,
    apporteurTotalHT: 0, apporteurAgente: 0,
    royaltiesTotal: 0, sommeRoyalties: 0,
    gainsAgentePrevi: 0, gainsAdminPrevi: 0,
    gainsAgenteReels: 0, gainAdminReel: 0,
    fraisReel: 0, honReel: 0, comReelNet: 0, comApporteursReel: 0,
    royaltiesReelTotal: 0, apporteurRembourse: 0,
  })

  const agrégerMois = (listeDossiers, useReel = false) => {
    const map = {}
    listeDossiers.forEach(d => {
      const key = getKeyMois(d)
      if (!key) return
      if (!map[key]) map[key] = emptyAgg()
      const c = useReel ? calculerReel(d) : calculer(d)
      Object.keys(map[key]).forEach(k => { if (c[k] !== undefined) map[key][k] += c[k] })
    })
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]))
  }

  const agrégerAnnee = (listeDossiers, useReel = false) => {
    const map = {}
    listeDossiers.forEach(d => {
      if (!d.date_signature_contrat) return
      const annee = new Date(d.date_signature_contrat).getFullYear()
      if (!map[annee]) map[annee] = emptyAgg()
      const c = useReel ? calculerReel(d) : calculer(d)
      Object.keys(map[annee]).forEach(k => { if (c[k] !== undefined) map[annee][k] += c[k] })
    })
    return Object.entries(map).sort((a, b) => b[0] - a[0])
  }

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
                      {c.royaltiesTotal > 0 && <div className="flex justify-between"><span className="text-red-400">Royalties</span><span className="text-red-400">— {fmt(c.royaltiesTotal)}</span></div>}
                      {c.apporteurTotalHT > 0 && !c.estChantierMarine && <div className="flex justify-between"><span className="text-orange-500">Apporteur (agente)</span><span className="text-orange-500">— {fmt(c.apporteurAgente)}</span></div>}
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
                      {r.royaltiesReelTotal > 0 && <div className="flex justify-between"><span className="text-red-400">Royalties</span><span className="text-red-400">— {fmt(r.royaltiesReelTotal)}</span></div>}
                      {r.apporteurRembourse > 0 && <div className="flex justify-between"><span className="text-orange-500">Apporteur remboursé</span><span className="text-orange-500">— {fmt(r.apporteurRembourse)}</span></div>}
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

  const renderTableauPeriode = (rows, colLabel, colonnes, getMontant) => (
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
            return (
              <tr key={key} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-medium text-gray-800">{label}</td>
                {colonnes.map(col => {
                  const val = getMontant(agg, col.key)
                  if (col.type === 'neg') return <td key={col.key} className="px-3 py-2 text-right text-red-400 text-sm">{val > 0 ? `— ${fmt(val)}` : '—'}</td>
                  if (col.type === 'total') return <td key={col.key} className={`px-3 py-2 text-right text-sm font-bold ${(val || 0) >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmt(val)}</td>
                  return <td key={col.key} className="px-3 py-2 text-right text-sm text-gray-700">{fmt(val)}</td>
                })}
              </tr>
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
    const colonnesMarine  = [
      { label: 'Frais TTC',     key: 'fraisTTC',         type: 'normal' },
      { label: 'Com. TTC',      key: 'comHTSigne',        type: 'normal' },
      { label: 'Hon. TTC',      key: 'honTotalTTC',       type: 'normal' },
      { label: 'Royalties',     key: 'royaltiesTotal',    type: 'neg'    },
      { label: 'Apporteur',     key: 'apporteurTotalHT',  type: 'neg'    },
      { label: nomFranchisee,   key: 'gainsAdminPrevi',   type: 'total'  },
    ]
    const colonnesAgente  = [
      { label: 'Frais',         key: 'fraisNet',          type: 'normal' },
      { label: 'Com. net',      key: 'comReelNet',        type: 'normal' },
      { label: 'Hon. net',      key: 'honReel',           type: 'normal' },
      { label: 'Royalties',     key: 'royaltiesReelTotal',type: 'neg'    },
      { label: 'Apporteur',     key: 'apporteurRembourse',type: 'neg'    },
      { label: 'Mes gains',     key: 'gainsAgenteReels',  type: 'total'  },
    ]
    return renderTableauPeriode(rows, colLabel, isMarine ? colonnesMarine : colonnesAgente, (agg, key) => agg[key] || 0)
  }

  // ── TOUS LES CHANTIERS par période (admin) ─────────────────────────────────

  const renderTousPeriode = (rows, colLabel) => {
    const colonnes = [
      { label: 'Frais TTC',   key: 'fraisTTC',       type: 'normal' },
      { label: 'Com. TTC',    key: 'comHTSigne',      type: 'normal' },
      { label: 'Hon. TTC',    key: 'honTotalTTC',     type: 'normal' },
      { label: 'Royalties',   key: 'royaltiesTotal',  type: 'neg'    },
      { label: 'Apporteur',   key: 'apporteurTotalHT',type: 'neg'    },
      { label: 'Part agentes',key: 'gainsAgentePrevi',type: 'normal' },
      { label: nomFranchisee, key: 'gainsAdminPrevi', type: 'total'  },
    ]
    return renderTableauPeriode(rows, colLabel, colonnes, (agg, key) => agg[key] || 0)
  }

  // ── SUIVI CTP par période ──────────────────────────────────────────────────

  const renderCTPPeriode = (rows, colLabel, isAnnee = false) => {
    const redevKey = (key) => {
      if (isAnnee) return redevances.filter(r => r.statut === 'regle' && String(r.annee) === String(key)).reduce((s, r) => s + (r.montant_ttc || 540), 0)
      const [annee, mois] = key.split('-')
      return redevances.filter(r => r.statut === 'regle' && r.annee === parseInt(annee) && r.mois === parseInt(mois)).reduce((s, r) => s + (r.montant_ttc || 540), 0)
    }
    const allKeys = new Set([
      ...rows.map(([k]) => k),
      ...redevances.filter(r => r.statut === 'regle').map(r =>
        isAnnee ? String(r.annee) : `${r.annee}-${String(r.mois).padStart(2, '0')}`
      ),
    ])
    const cles = Array.from(allKeys).sort((a, b) => b.localeCompare(a))

    return (
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>{thL(colLabel)}{thR('Frais')}{thR('Com.')}{thR('Hon.')}{thR('Redevance')}{thR('Royalties')}{thR('Apporteur')}{thR('Total CTP')}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {cles.map(key => {
              const agg   = rows.find(([k]) => k === key)?.[1] || {}
              const redev = redevKey(key)
              const label = isAnnee ? key : (() => { const [a, m] = key.split('-'); return `${MOIS[parseInt(m)]} ${a}` })()
              const total = (agg.fraisNet || 0) + (agg.honTotalNet || 0) + (agg.netComSigne || 0) + redev - (agg.royaltiesTotal || 0) - (agg.gainsAgenteReels || 0) - (agg.apporteurTotalHT || 0)
              return (
                <tr key={key} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium">{label}</td>
                  {tdR(fmt(agg.fraisNet))}
                  {tdR(fmt(agg.netComSigne))}
                  {tdR(fmt(agg.honTotalNet))}
                  <td className="px-3 py-2 text-right text-green-600">{redev > 0 ? `+ ${fmt(redev)}` : '—'}</td>
                  <td className="px-3 py-2 text-right text-red-400">— {fmt(agg.royaltiesTotal)}</td>
                  <td className="px-3 py-2 text-right text-orange-500">{(agg.apporteurTotalHT || 0) > 0 ? `— ${fmt(agg.apporteurTotalHT)}` : '—'}</td>
                  {tdTotal(total)}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  // ── RÉCAP CTP ──────────────────────────────────────────────────────────────

  const renderRecapCTP = () => {
    const totalComNet  = dossiers.reduce((s, d) => s + calculer(d).netComSigne, 0)
    const totalHonNet  = dossiers.reduce((s, d) => s + calculer(d).honTotalNet, 0)
    const totalFraisNet = dossiers.filter(d => d.frais_statut === 'regle').reduce((s, d) => s + calculer(d).fraisNet, 0)
    const totalApporteur = dossiers.reduce((s, d) => s + calculer(d).apporteurTotalHT, 0)
    const encCTP = totalComNet + totalHonNet + totalFraisNet + totalRedevancesReglees
    const decCTP = totalGainsAgentesReels + totalApporteur
    const netCTP = encCTP - decCTP

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
            <p className="font-medium text-green-800 mb-2">📥 Encaissements CTP</p>
            <div className="flex justify-between text-sm"><span className="text-gray-600">Commissions net HT</span><span className="text-green-700">+ {fmt(totalComNet)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-600">Honoraires net HT</span><span className="text-green-700">+ {fmt(totalHonNet)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-600">Frais consultation net HT</span><span className="text-green-700">+ {fmt(totalFraisNet)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-600">Redevances agentes</span><span className="text-green-700">+ {fmt(totalRedevancesReglees)}</span></div>
            <div className="flex justify-between text-sm border-t border-green-200 pt-2 font-bold"><span>Total</span><span className="text-green-700">+ {fmt(encCTP)}</span></div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
            <p className="font-medium text-red-800 mb-2">📤 Décaissements CTP</p>
            <div className="flex justify-between text-sm"><span className="text-gray-600">Part agentes</span><span className="text-red-500">— {fmt(totalGainsAgentesReels)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-600">Apporteur client</span><span className="text-red-500">— {fmt(totalApporteur)}</span></div>
            <div className="flex justify-between text-sm border-t border-red-200 pt-2 font-bold"><span>Total</span><span className="text-red-500">— {fmt(decCTP)}</span></div>
          </div>
        </div>
        <div className={`border rounded-xl p-4 ${netCTP >= 0 ? 'bg-purple-50 border-purple-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex justify-between items-center">
            <span className="font-bold text-purple-900">Net CTP</span>
            <span className={`font-bold text-2xl ${netCTP >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmt(netCTP)}</span>
          </div>
        </div>
      </div>
    )
  }

  // ── RÉCAP AGENTE (vue admin) ────────────────────────────────────────────────

  const renderRecapAgente = (listeDossiers, listeRedevances, agente) => {
    const nom          = agente ? `${agente.prenom} ${agente.nom}` : 'Agente'
    const gainsReels   = listeDossiers.reduce((s, d) => s + calculerReel(d).gainsAgenteReels, 0)
    const gainsPrevi   = listeDossiers.reduce((s, d) => s + calculer(d).gainsAgentePrevi, 0)
    const apporteurDu  = listeDossiers.reduce((s, d) => s + calculer(d).apporteurAgente, 0)
    const redevReglees = listeRedevances.filter(r => r.statut === 'regle').reduce((s, r) => s + (r.montant_ttc || 540), 0)
    const net          = gainsReels - redevReglees - apporteurDu

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
            <p className="font-medium text-green-800 mb-2">📥 Gains {nom}</p>
            <div className="flex justify-between text-sm"><span className="text-gray-600">Gains réels</span><span className="text-green-700">+ {fmt(gainsReels)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-600">Gains prévisionnels</span><span className="text-gray-400">({fmt(gainsPrevi)})</span></div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
            <p className="font-medium text-red-800 mb-2">📤 Décaissements {nom}</p>
            <div className="flex justify-between text-sm"><span className="text-gray-600">Redevances CTP</span><span className="text-red-500">— {fmt(redevReglees)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-600">Apporteur à rembourser</span><span className="text-red-500">— {fmt(apporteurDu)}</span></div>
            <div className="flex justify-between text-sm border-t border-red-200 pt-2 font-bold"><span>Total</span><span className="text-red-500">— {fmt(redevReglees + apporteurDu)}</span></div>
          </div>
        </div>
        <div className={`border rounded-xl p-4 ${net >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex justify-between items-center">
            <span className="font-bold text-blue-900">Net {nom}</span>
            <span className={`font-bold text-2xl ${net >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmt(net)}</span>
          </div>
        </div>
        {/* Ce que CTP doit à l'agente */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
          <p className="font-semibold text-blue-800">💸 {nomFranchisee} doit verser à {nom}</p>
          {listeDossiers.map(d => {
            const reel = calculerReel(d).gainsAgenteReels
            if (reel === 0) return null
            return (
              <div key={d.id} className="flex justify-between text-sm border-b border-blue-100 pb-1 last:border-0">
                <span className="text-blue-900">{d.reference} — {d.client?.prenom} {d.client?.nom}</span>
                <span className="text-blue-700 font-medium">+ {fmt(reel)}</span>
              </div>
            )
          })}
          <div className="flex justify-between font-bold border-t border-blue-200 pt-2">
            <span className="text-blue-800">Total</span>
            <span className="text-blue-700">{fmt(gainsReels)}</span>
          </div>
        </div>
      </div>
    )
  }

  // ── RÉCAP MOI (vue agente) ─────────────────────────────────────────────────

  const renderRecapMoi = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
          <p className="font-medium text-green-800 mb-2">📥 Mes gains prévisionnels</p>
          <div className="flex justify-between text-sm"><span className="text-gray-600">Frais consultation</span><span className="text-green-700">+ {fmt(mesDossiers.reduce((s, d) => s + calculer(d).fraisAgente, 0))}</span></div>
          <div className="flex justify-between text-sm"><span className="text-gray-600">Commissions</span><span className="text-green-700">+ {fmt(mesDossiers.reduce((s, d) => s + calculer(d).comAgenteSigne, 0))}</span></div>
          <div className="flex justify-between text-sm"><span className="text-gray-600">Honoraires</span><span className="text-green-700">+ {fmt(mesDossiers.reduce((s, d) => s + calculer(d).honAgente, 0))}</span></div>
          <div className="flex justify-between text-sm border-t border-green-200 pt-2 font-bold"><span>Total brut</span><span className="text-green-700">+ {fmt(mesDossiersGainsPrevi + mesApporteurDu)}</span></div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
          <p className="font-medium text-red-800 mb-2">📤 Mes décaissements</p>
          <div className="flex justify-between text-sm"><span className="text-gray-600">Apporteur à rembourser</span><span className="text-red-500">— {fmt(mesApporteurDu)}</span></div>
        </div>
      </div>
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex justify-between items-center">
          <span className="font-bold text-blue-900">Gains nets prévisionnels</span>
          <span className="font-bold text-2xl text-green-700">{fmt(mesDossiersGainsPrevi)}</span>
        </div>
        <p className="text-xs text-gray-400 mt-1">Hors redevances — voir onglets "Par mois" et "Par année"</p>
      </div>
    </div>
  )

  // ── FACTURATION MOI ────────────────────────────────────────────────────────

  const renderFacturationMoi = () => (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-sm font-medium text-blue-800">📋 Ce que tu dois facturer à {nomFranchisee}</p>
        <p className="text-xs text-gray-500 mt-1">Frais réglés + commissions signées + honoraires réglés</p>
      </div>
      {mesDossiers.map(d => {
        const c = calculer(d)
        const items = []
        if (d.frais_statut === 'regle' && c.fraisAgente > 0)
          items.push({ label: 'Frais de consultation', montant: c.fraisAgente, color: 'text-purple-700' })
        c.finance.commissions.devis.filter(dv => dv.signed && dv.parts.agente > 0).forEach(dv => {
          const original = (d.devis_artisans || []).find(x => x.id === dv.id)
          const apporteurLigne = c.apporteurMap.get(dv.id)
          const netAgente = round2(dv.parts.agente - (apporteurLigne?.agente || 0))
          if (netAgente > 0) items.push({
            label: `Commission ${original?.artisan?.entreprise || 'Artisan'} (${Math.round(dv.commissionPct * 100)}%)`,
            montant: netAgente, color: 'text-blue-700',
            date: original?.date_signature,
          })
        })
        if (getSuivi(d, 'honoraires_courtage')?.statut_client === 'regle' && c.courtAgente > 0)
          items.push({ label: `Honoraires courtage (${c.tauxCourtagePct}%)`, montant: c.courtAgente, color: 'text-green-700' })
        if (d.typologie === 'amo' && getSuivi(d, 'solde_amo')?.statut_client === 'regle' && c.amoAgente > 0)
          items.push({ label: `Honoraires AMO solde (${c.tauxAmoPct}%)`, montant: c.amoAgente, color: 'text-green-700' })
        if (items.length === 0) return null
        return (
          <div key={d.id} className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
            <div className="flex gap-2 items-center">
              <p className="font-medium text-blue-900">{d.reference}</p>
              <p className="text-sm text-gray-500">{d.client?.prenom} {d.client?.nom}</p>
            </div>
            {items.map((item, i) => (
              <div key={i} className="flex justify-between text-sm border-b border-gray-100 pb-1 last:border-0">
                <div>
                  <p className="text-gray-700">{item.label}</p>
                  {item.date && <p className="text-xs text-gray-400">Signé le {new Date(item.date).toLocaleDateString('fr-FR')}</p>}
                </div>
                <span className={`font-medium ${item.color}`}>{fmt(item.montant)}</span>
              </div>
            ))}
            <div className="flex justify-between font-bold border-t border-gray-200 pt-2 text-sm">
              <span>Total</span>
              <span className="text-blue-700">{fmt(items.reduce((s, i) => s + i.montant, 0))}</span>
            </div>
          </div>
        )
      })}
    </div>
  )

  const renderFacturationMoisSuivi = () => {
    const rows = agrégerMois(mesDossiers)
    if (rows.length === 0) return <p className="text-center text-gray-400 text-sm py-8">Aucune donnée</p>
    return (
      <div className="space-y-4">
        {succes && <p className="text-green-600 text-sm bg-green-50 border border-green-200 rounded-lg px-4 py-2">{succes}</p>}
        {erreur && <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-2">{erreur}</p>}
        {rows.map(([key, agg]) => {
          const [anneeStr, moisStr] = key.split('-')
          const annee   = parseInt(anneeStr)
          const mois    = parseInt(moisStr)
          const label   = `${MOIS[mois]} ${annee}`
          const total   = round2(agg.fraisAgente + agg.comAgenteSigne + agg.honAgente - agg.apporteurAgente)
          const facture = getFactureAgenteMois(mois, annee)
          const statut  = facture?.statut || 'a_facturer'
          return (
            <div key={key} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                <span className="font-semibold text-gray-800">{label}</span>
                <span className="font-bold text-blue-700">{fmt(total)}</span>
              </div>
              <div className="p-4 space-y-3">
                <div className="space-y-1 text-sm">
                  {agg.fraisAgente > 0 && <div className="flex justify-between"><span className="text-gray-600">Frais consultation</span><span className="text-purple-700">{fmt(agg.fraisAgente)}</span></div>}
                  {(agg.comAgenteSigne - agg.apporteurAgente) > 0 && <div className="flex justify-between"><span className="text-gray-600">Commissions</span><span className="text-blue-700">{fmt(agg.comAgenteSigne - agg.apporteurAgente)}</span></div>}
                  {agg.honAgente > 0 && <div className="flex justify-between"><span className="text-gray-600">Honoraires</span><span className="text-green-700">{fmt(agg.honAgente)}</span></div>}
                </div>
                <div className="flex items-center gap-3 pt-2 border-t border-gray-100 flex-wrap">
                  <select value={statut}
                    onChange={e => upsertFactureAgenteMois(mois, annee, total, { statut: e.target.value })}
                    className={`border rounded px-2 py-1 text-xs focus:outline-none ${statut === 'paye' ? 'border-green-300 bg-green-50 text-green-700' : statut === 'facture' ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}>
                    <option value="a_facturer">📋 À facturer</option>
                    <option value="facture">📤 Facturé</option>
                    <option value="paye">✅ Payé</option>
                  </select>
                  {facture?.facture_path ? (
                    <div className="flex items-center gap-2">
                      <button onClick={async () => {
                        const { data } = await supabase.storage.from('documents').createSignedUrl(facture.facture_path, 3600)
                        if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                      }} className="text-xs text-blue-600 hover:underline">📄 Voir facture</button>
                      <label className="text-xs text-gray-400 cursor-pointer hover:text-blue-600">
                        Remplacer
                        <input type="file" accept=".pdf" className="hidden" onChange={e => e.target.files[0] && uploadFactureAgentePdf(mois, annee, total, e.target.files[0])} />
                      </label>
                    </div>
                  ) : (
                    <label className={`text-xs cursor-pointer px-2 py-1 rounded border transition-all ${uploadingFactureAgente === `${annee}-${mois}` ? 'text-gray-400 border-gray-200' : 'text-blue-600 border-blue-200 hover:bg-blue-50'}`}>
                      {uploadingFactureAgente === `${annee}-${mois}` ? 'Upload...' : '+ Uploader ma facture'}
                      <input type="file" accept=".pdf" className="hidden" disabled={uploadingFactureAgente === `${annee}-${mois}`} onChange={e => e.target.files[0] && uploadFactureAgentePdf(mois, annee, total, e.target.files[0])} />
                    </label>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ── AGENTE PAR PÉRIODE ─────────────────────────────────────────────────────

  const renderAgentePeriode = (rows, colLabel, listeRedevances, isAnnee = false) => {
    const redevKey = (key) => {
      if (isAnnee) return listeRedevances.filter(r => r.statut === 'regle' && String(r.annee) === String(key)).reduce((s, r) => s + (r.montant_ttc || 540), 0)
      const [annee, mois] = key.split('-')
      return listeRedevances.filter(r => r.statut === 'regle' && r.annee === parseInt(annee) && r.mois === parseInt(mois)).reduce((s, r) => s + (r.montant_ttc || 540), 0)
    }
    const allKeys = new Set([
      ...rows.map(([k]) => k),
      ...listeRedevances.filter(r => r.statut === 'regle').map(r =>
        isAnnee ? String(r.annee) : `${r.annee}-${String(r.mois).padStart(2, '0')}`
      ),
    ])
    const cles = Array.from(allKeys).sort((a, b) => b.localeCompare(a))
    return (
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>{thL(colLabel)}{thR('Gains')}{thR('Redevance CTP')}{thR('Apporteur')}{thR('Total')}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {cles.map(key => {
              const agg   = rows.find(([k]) => k === key)?.[1] || {}
              const redev = redevKey(key)
              const label = isAnnee ? key : (() => { const [a, m] = key.split('-'); return `${MOIS[parseInt(m)]} ${a}` })()
              const total = (agg.gainsAgenteReels || 0) - redev - (agg.apporteurAgente || 0)
              return (
                <tr key={key} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium">{label}</td>
                  <td className="px-3 py-2 text-right text-green-600">+ {fmt(agg.gainsAgenteReels)}</td>
                  <td className="px-3 py-2 text-right text-red-400">{redev > 0 ? `— ${fmt(redev)}` : '—'}</td>
                  <td className="px-3 py-2 text-right text-orange-500">{(agg.apporteurAgente || 0) > 0 ? `— ${fmt(agg.apporteurAgente)}` : '—'}</td>
                  {tdTotal(total)}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  // ── REDEVANCES ─────────────────────────────────────────────────────────────

  const renderRedevances = () => {
    const anneeFiltre    = new Date().getFullYear()
    const agentesAff     = isMarine ? agentes : agentes.filter(a => a.id === profile?.id)
    const redevAnnee     = redevances.filter(r => r.annee === anneeFiltre)
    const totalAttendu   = agentesAff.length * (new Date().getMonth() + 1) * 540
    const totalRegle     = redevAnnee.filter(r => r.statut === 'regle').reduce((s, r) => s + (r.montant_ttc || 540), 0)
    const totalEnAttente = totalAttendu - totalRegle
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-4">
          {[{ label: 'Total attendu', val: totalAttendu, color: 'text-gray-700' }, { label: 'Total réglé', val: totalRegle, color: 'text-green-700' }, { label: 'Reste à payer', val: totalEnAttente, color: totalEnAttente > 0 ? 'text-amber-600' : 'text-green-600' }].map(({ label, val, color }) => (
            <div key={label} className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">{label} {anneeFiltre}</p>
              <p className={`text-xl font-bold ${color}`}>{fmt(val)}</p>
            </div>
          ))}
        </div>
        {isMarine && (
          <div className="flex justify-end">
            <button onClick={() => setRedevModal(true)} className="bg-blue-800 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-900">+ Ajouter</button>
          </div>
        )}
        {agentesAff.map(agente => {
          const moisAttendus = genererMoisAttendus(agente.id, anneeFiltre)
          const regle    = moisAttendus.filter(m => m.redev?.statut === 'regle').length
          const enRetard = moisAttendus.filter(m => m.enRetard).length
          const totalAnnuel = redevances.filter(r => r.agente_id === agente.id && r.statut === 'regle').reduce((s, r) => s + (r.montant_ttc || 540), 0)
          return (
            <div key={agente.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50">
                <div>
                  <p className="font-semibold text-gray-800">{agente.prenom} {agente.nom}</p>
                  <p className="text-xs text-gray-400">{regle}/{moisAttendus.length} mois réglés · Total annuel : {fmt(totalAnnuel)}</p>
                </div>
                {enRetard > 0 && <span className="bg-red-100 text-red-700 text-xs px-2.5 py-1 rounded-full font-medium">⚠️ {enRetard} retard{enRetard > 1 ? 's' : ''}</span>}
              </div>
              <div className="divide-y divide-gray-50">
                {moisAttendus.map(({ mois, redev, enRetard: retard }) => (
                  <div key={mois} className={`flex items-center justify-between px-5 py-3 ${retard ? 'bg-red-50' : ''}`}>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-700 w-24">{MOIS_LABELS[mois - 1]}</span>
                      {retard && <span className="text-xs text-red-600 font-medium">⚠️ En retard</span>}
                      {redev?.note && <span className="text-xs text-gray-400 italic">{redev.note}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      {redev ? (
                        <>
                          <span className="text-sm text-gray-600">{fmt(redev.montant_ttc || 540)}</span>
                          {redev.date_paiement && <span className="text-xs text-gray-400">{new Date(redev.date_paiement).toLocaleDateString('fr-FR')}</span>}
                          <button onClick={() => toggleRedevStatut(redev.id, redev.statut)}
                            className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all ${redev.statut === 'regle' ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}>
                            {redev.statut === 'regle' ? '✅ Réglé' : '⏳ En attente'}
                          </button>
                          {isMarine && <button onClick={() => supprimerRedevance(redev.id)} className="text-gray-300 hover:text-red-400 text-xs">✕</button>}
                        </>
                      ) : (
                        <span className="text-xs text-gray-300 italic">Non saisie</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
        {redevModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
              <h2 className="font-semibold text-gray-800">Ajouter un paiement de redevance</h2>
              {isMarine && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Agente</label>
                  <select value={redevForm.agente_id} onChange={e => setRedevForm(f => ({ ...f, agente_id: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">— Choisir —</option>
                    {agentes.map(a => <option key={a.id} value={a.id}>{a.prenom} {a.nom}</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mois</label>
                  <select value={redevForm.mois} onChange={e => setRedevForm(f => ({ ...f, mois: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {MOIS_LABELS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Année</label>
                  <input type="number" value={redevForm.annee} onChange={e => setRedevForm(f => ({ ...f, annee: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Montant TTC (€)</label>
                  <input type="number" step="0.01" value={redevForm.montant_ttc} onChange={e => setRedevForm(f => ({ ...f, montant_ttc: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
                  <select value={redevForm.statut} onChange={e => setRedevForm(f => ({ ...f, statut: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="en_attente">⏳ En attente</option>
                    <option value="regle">✅ Réglé</option>
                  </select>
                </div>
              </div>
              {redevForm.statut === 'regle' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date de paiement</label>
                  <input type="date" value={redevForm.date_paiement} onChange={e => setRedevForm(f => ({ ...f, date_paiement: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note (optionnel)</label>
                <input type="text" value={redevForm.note} onChange={e => setRedevForm(f => ({ ...f, note: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setRedevModal(false)} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50">Annuler</button>
                <button onClick={sauvegarderRedevance} disabled={savingRedev}
                  className="flex-1 bg-blue-800 text-white py-2 rounded-lg text-sm hover:bg-blue-900 disabled:opacity-50">
                  {savingRedev ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ONGLETS
  // ─────────────────────────────────────────────────────────────────────────────

  const ongletsAdmin  = [
    { key: 'mes_chantiers',  label: 'Mes chantiers'      },
    { key: 'tous_chantiers', label: 'Tous les chantiers'  },
    { key: 'ctp',            label: 'Suivi financier CTP' },
    { key: 'agentes',        label: 'Agentes'             },
    { key: 'redevances',     label: '💳 Redevances'       },
  ]
  const ongletsAgente = [
    { key: 'mes_chantiers', label: 'Mes chantiers'       },
    { key: 'financier',     label: 'Mon suivi financier' },
    { key: 'facturation',   label: 'Facturation'         },
    { key: 'redevances',    label: '💳 Redevances'       },
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
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/dashboard')} className="text-gray-400 hover:text-gray-600 text-sm">← Retour</button>
        <h1 className="text-lg font-bold text-blue-900">Finances</h1>
        {saving && <span className="text-xs text-gray-400 ml-auto">Enregistrement...</span>}
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {/* Cartes résumé */}
        <div className={`grid gap-4 ${isMarine ? 'grid-cols-4' : 'grid-cols-3'}`}>
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
                <p className="text-xl font-bold text-gray-800">{dossiers.length}</p>
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
        <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
          {ongletsList.map(({ key, label }) => (
            <button key={key} onClick={() => { setOnglet(key); setSousOnglet('chantier') }}
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
            {sousOnglet === 'mois'     && renderMesPeriode(mesDossiers, 'Mois / Chantier', agrégerMois(mesDossiers, true))}
            {sousOnglet === 'annee'    && renderMesPeriode(mesDossiers, 'Année / Chantier', agrégerAnnee(mesDossiers, true))}
          </div>
        )}

        {/* ── TOUS LES CHANTIERS (admin) ── */}
        {onglet === 'tous_chantiers' && isMarine && (
          <div className="space-y-4">
            {renderSousOnglets()}
            {sousOnglet === 'chantier' && renderAccordeon(dossiers, true)}
            {sousOnglet === 'mois'     && renderTousPeriode(agrégerMois(dossiers), 'Mois')}
            {sousOnglet === 'annee'    && renderTousPeriode(agrégerAnnee(dossiers), 'Année')}
          </div>
        )}

        {/* ── SUIVI FINANCIER CTP (admin) ── */}
        {onglet === 'ctp' && isMarine && (
          <div className="space-y-4">
            {renderSousOnglets()}
            {sousOnglet === 'chantier' && renderRecapCTP()}
            {sousOnglet === 'mois'     && renderCTPPeriode(agrégerMois(dossiers, true), 'Mois', false)}
            {sousOnglet === 'annee'    && renderCTPPeriode(agrégerAnnee(dossiers, true), 'Année', true)}
          </div>
        )}

        {/* ── AGENTES (admin) ── */}
        {onglet === 'agentes' && isMarine && (
          <div className="space-y-4">
            {renderSélecteurAgente()}
            {renderSousOnglets()}
            {sousOnglet === 'chantier' && renderRecapAgente(dossiersAgente, redevancesAgente, agenteActuelle)}
            {sousOnglet === 'mois'     && renderAgentePeriode(agrégerMois(dossiersAgente, true), 'Mois', redevancesAgente, false)}
            {sousOnglet === 'annee'    && renderAgentePeriode(agrégerAnnee(dossiersAgente, true), 'Année', redevancesAgente, true)}
          </div>
        )}

        {/* ── MON SUIVI FINANCIER (agente) ── */}
        {onglet === 'financier' && !isMarine && (
          <div className="space-y-4">
            {renderSousOnglets()}
            {sousOnglet === 'chantier' && renderRecapMoi()}
            {sousOnglet === 'mois'     && renderAgentePeriode(agrégerMois(mesDossiers, true), 'Mois', mesRedevances, false)}
            {sousOnglet === 'annee'    && renderAgentePeriode(agrégerAnnee(mesDossiers, true), 'Année', mesRedevances, true)}
          </div>
        )}

        {/* ── FACTURATION (agente) ── */}
        {onglet === 'facturation' && !isMarine && (
          <div className="space-y-4">
            {renderSousOnglets()}
            {sousOnglet === 'chantier' && renderFacturationMoi()}
            {sousOnglet === 'mois'     && renderFacturationMoisSuivi()}
            {sousOnglet === 'annee'    && renderMesPeriode(mesDossiers, 'Année', agrégerAnnee(mesDossiers))}
          </div>
        )}

        {/* ── REDEVANCES ── */}
        {onglet === 'redevances' && renderRedevances()}

      </main>
    </div>
  )
}