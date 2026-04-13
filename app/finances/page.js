// /finances/page.js
'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { calculateDossierFinance } from '../lib/finance'

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────────────────────

const MOIS = [
  '', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

const MOIS_LABELS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

// ─────────────────────────────────────────────────────────────────────────────
// UTILITAIRES PURS
// ─────────────────────────────────────────────────────────────────────────────

const round2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100

const splitAmount = (amount, partAgente) => {
  const agente = round2((amount || 0) * (partAgente || 0))
  const admin  = round2((amount || 0) - agente)
  return { agente, admin }
}

const normalizeApporteurMode = (mode) => {
  if (mode === 'total_chantier') return 'total_chantier_ht'
  return mode || 'par_devis'
}

const normalizeDossierForFinance = (d) => {
  // Dériver part_agente depuis le premier devis actif (même split pour tout le dossier)
  const devisActifs = (d.devis_artisans || []).filter(dv => dv.statut !== 'refuse')
  const partAgente  = devisActifs[0]?.part_agente ?? (d.referente?.role === 'admin' ? 0 : 0.5)

  return {
    ...d,
    part_agente: partAgente,
    taux_amo: d?.taux_amo ?? d?.honoraires_amo_taux,
    client: d?.client
      ? {
          ...d.client,
          apporteur_mode: normalizeApporteurMode(
            d.client?.apporteur_mode || d.client?.apporteur_base
          ),
        }
      : null,
  }
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

  const [redevModal, setRedevModal]   = useState(false)
  const [savingRedev, setSavingRedev] = useState(false)
  const [redevForm, setRedevForm]     = useState({
    agente_id: '',
    annee: new Date().getFullYear(),
    mois: new Date().getMonth() + 1,
    montant_ttc: 540,
    statut: 'en_attente',
    date_paiement: '',
    note: '',
  })

  const router = useRouter()

  // ── INIT ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      setProfile(profData)
      await chargerTout()
      setLoading(false)
    }
    init()
  }, [router])

  // ── CHARGEMENT DES DONNÉES ─────────────────────────────────────────────────

  const chargerTout = async () => {
    const { data: dossiersData } = await supabase
      .from('dossiers')
      .select(`
        *,
        referente:profiles!dossiers_referente_id_fkey(id, prenom, nom, role),
        client:clients(civilite, prenom, nom, apporteur_affaires, apporteur_nom, apporteur_pourcentage, apporteur_base),
        devis_artisans(*, artisan:artisans(id, entreprise, sans_royalties)),
        suivi_financier(*)
      `)
      .order('created_at', { ascending: false })
    setDossiers(dossiersData || [])

    const { data: redevancesData } = await supabase
      .from('redevances')
      .select('*')
      .order('annee', { ascending: false })
      .order('mois',  { ascending: false })
    setRedevances(redevancesData || [])

    const { data: facturesAgenteData } = await supabase
      .from('factures_agente')
      .select('*')
      .order('annee', { ascending: false })
      .order('mois',  { ascending: false })
    setFacturesAgente(facturesAgenteData || [])

    const { data: agentesData } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'agente')
      .order('prenom')
    setAgentes(agentesData || [])
    setAgenteSelectionnee(prev => prev || agentesData?.[0]?.id || null)

    // Charger le nom de la franchisée (admin) pour les labels dynamiques
    const { data: adminData } = await supabase
      .from('profiles')
      .select('prenom, nom')
      .eq('role', 'admin')
      .single()
    if (adminData) setNomFranchisee(`${adminData.prenom} ${adminData.nom}`)
  }

  // ── HELPERS PROFIL ─────────────────────────────────────────────────────────

  const isMarine     = profile?.role === 'admin'
  const nomReferente = (d) => d.referente ? `${d.referente.prenom} ${d.referente.nom}` : 'Agente'

  // ── CALCUL FINANCIER ───────────────────────────────────────────────────────

  const calculer = (d) => {
    const normalized = normalizeDossierForFinance(d)
    const finance    = calculateDossierFinance(normalized)

    const estChantierMarine = d.referente?.role === 'admin'
    const devisActifs       = (d.devis_artisans || []).filter(dv => dv.statut !== 'refuse')
    const devisAcceptes     = devisActifs.filter(dv => dv.statut === 'accepte')
    const devisParId        = new Map((d.devis_artisans || []).map(dv => [dv.id, dv]))
    const apporteurParDevis = new Map((finance.apporteur?.lines || []).map(line => [line.devisId, line]))
    const partAgenteRate    = finance.settings.partAgente

    // Commissions
    const comHT    = round2(finance.commissions.comHT)
    const comTTC   = round2(finance.commissions.comTTC)
    const net      = round2(finance.commissions.netCom)
    const partAgente = round2(finance.commissions.gainsBruts.agente)
    const partAdmin  = round2(finance.commissions.gainsBruts.admin)

    // Frais
    const fraisHT        = round2(finance.frais.fraisHT)
    const fraisTTC       = round2(finance.frais.fraisTTC)
    const fraisRoyalties = round2(finance.frais.royaltiesFrais)
    const fraisNet       = round2(finance.frais.netFrais)
    const fraisPartAgente = round2(finance.frais.gainsBruts.agente)
    const fraisPartAdmin  = round2(finance.frais.gainsBruts.admin)

    // Honoraires
    const honorairesCourtage   = round2(finance.honoraires.courtage.ttc)
    const honorairesAMOSolde   = round2(finance.honoraires.amo.soldeTTC)
    const honorairesTotalTTC   = round2(finance.honoraires.totalTTC)
    const royaltiesCourtage    = round2(finance.honoraires.courtage.royalties)
    const royaltiesAMO         = round2(finance.honoraires.amo.royaltiesSolde)
    const honorairesCourtageNet = round2(finance.honoraires.courtage.net)
    const honorairesAMONet      = round2(finance.honoraires.amo.soldeTTC - finance.honoraires.amo.royaltiesSolde)
    const honorairesTotalNet    = round2(honorairesCourtageNet + honorairesAMONet)
    const partAgenteHonoraires  = round2(finance.honoraires.gainsBruts.agente)
    const partAdminHonoraires   = round2(finance.honoraires.gainsBruts.admin)
    const partAgenteCourtage    = round2(splitAmount(honorairesCourtageNet, partAgenteRate).agente)
    const partAgenteAMO         = round2(splitAmount(honorairesAMONet, partAgenteRate).agente)

    // Royalties globales
    // IMPORTANT : royaltiesCom n'entre pas dans la somme des royalties CTP
    const royaltiesType2Previ = round2(
      finance.commissions.devis.reduce((s, d) => s + (d.comHT - d.netCom), 0)
    )
    const sommeRoyalties = round2(fraisRoyalties + royaltiesCourtage + royaltiesAMO + royaltiesType2Previ)

    // Apporteur
    const apporteurTTC        = round2(finance.apporteur.totalTTC)
    const apporteurPartAgente = round2(finance.apporteur.parts.agente)
    const apporteurPartAdmin  = round2(finance.apporteur.parts.admin)

    // Encaissement réel CTP
    const totalEncaissement = finance.agence.netAvantApporteur

    // Commissions signées
    const commissionsSignees = finance.commissions.devis
      .filter(item => item.signed)
      .map(item => {
        const original      = devisParId.get(item.id)
        const apporteurLine = finance.apporteur.mode === 'par_devis'
          ? apporteurParDevis.get(item.id)
          : null
        const apporteurAgente = round2(apporteurLine?.agente || 0)
        return {
          ...item,
          artisan_id:     original?.artisan_id,
          artisan:        original?.artisan,
          date_signature: original?.date_signature,
          apporteurAgente,
          netAgente: round2(item.gainsBruts.agente - apporteurAgente),
        }
      })

    // Gains agente réels
    let gainsAgenteReels = 0
    if (!estChantierMarine) {
      gainsAgenteReels += commissionsSignees.reduce((s, item) => s + item.netAgente, 0)

      if (finance.apporteur.mode === 'total_chantier_ht' && apporteurPartAgente > 0) {
        gainsAgenteReels -= apporteurPartAgente
      }
      if (d.frais_statut === 'regle') {
        gainsAgenteReels += fraisPartAgente
      }
      if (getSuivi(d, 'honoraires_courtage')?.statut_client === 'regle') {
        gainsAgenteReels += partAgenteCourtage
      }
      if (d.typologie === 'amo' && getSuivi(d, 'solde_amo')?.statut_client === 'regle') {
        gainsAgenteReels += partAgenteAMO
      }
    }

    const royaltiesCom = round2(commissionsSignees.reduce((s, item) => s + item.royaltiesCom, 0))
    gainsAgenteReels   = round2(gainsAgenteReels)

    // Totaux réels (devis signés uniquement)
    const devisSignesList = finance.commissions.devis.filter(item => item.signed)
    const comHTReel       = round2(devisSignesList.reduce((s, d) => s + d.comHT, 0))
    const comTTCReel      = round2(devisSignesList.reduce((s, d) => s + d.comTTC, 0))
    const royaltiesReel   = round2(devisSignesList.reduce((s, d) => s + d.royaltiesCom, 0))
    const netReel         = round2(devisSignesList.reduce((s, d) => s + d.netCom, 0))
    const partAgenteReel  = round2(devisSignesList.reduce((s, d) => s + d.gainsBruts.agente, 0))
    const partAdminReel   = round2(devisSignesList.reduce((s, d) => s + d.gainsBruts.admin, 0))

    return {
      finance,
      estChantierMarine,
      devisActifs,
      devisAcceptes,
      commissionsSignees,
      devisSignesList,
      tauxCourtagePct: round2(finance.settings.tauxCourtage * 100),
      tauxAmoPct:      round2(finance.settings.tauxAmo * 100),
      // Commissions
      comHT, comTTC, royalties: royaltiesCom, net, partAgente, partAdmin,
      comHTReel, comTTCReel, royaltiesReel, netReel, partAgenteReel, partAdminReel,
      // Frais
      fraisHT, fraisTTC, fraisRoyalties, fraisNet, fraisPartAgente, fraisPartAdmin,
      // Honoraires
      honorairesCourtage, honorairesAMOSolde, honorairesTotalTTC,
      royaltiesCourtage, royaltiesAMO, sommeRoyalties, royaltiesType2Previ,
      honorairesCourtageNet, honorairesAMONet, honorairesTotalNet,
      partAgenteHonoraires, partAdminHonoraires, partAgenteCourtage, partAgenteAMO,
      // Apporteur
      apporteurTTC, apporteurPartAgente, apporteurPartAdmin,
      // Totaux
      totalEncaissement,
      gainsAgentePrevi: round2(finance.gains.nets.agente),
      netAdminPrevi:    round2(finance.gains.nets.admin),
      gainsAgenteReels,
    }
  }

  // ── SUIVI FINANCIER ────────────────────────────────────────────────────────

  const getSuivi = (d, type, artisanId = null) =>
    (d.suivi_financier || []).find(
      s => s.type_echeance === type && (!artisanId || s.artisan_id === artisanId)
    )

  const majSuivi = async (dossierId, type, artisanId, champ, valeur) => {
    setSaving(true)
    const dossier  = dossiers.find(d => d.id === dossierId)
    const existing = getSuivi(dossier, type, artisanId)

    if (existing) {
      await supabase
        .from('suivi_financier')
        .update({ [champ]: valeur })
        .eq('id', existing.id)
    } else {
      await supabase
        .from('suivi_financier')
        .insert({ dossier_id: dossierId, type_echeance: type, artisan_id: artisanId || null, [champ]: valeur })
    }

    await chargerTout()
    setSaving(false)
  }

  // ── ALERTES ────────────────────────────────────────────────────────────────

  const alertes48h = (date) => date && new Date() > new Date(new Date(date).getTime() + 48 * 3600000)
  const alertes7j  = (date) => date && new Date() > new Date(new Date(date).getTime() + 7 * 24 * 3600000)

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

    const { data } = await supabase
      .from('factures_agente')
      .select('*')
      .order('annee', { ascending: false })
      .order('mois',  { ascending: false })
    setFacturesAgente(data || [])
  }

  const uploadFactureAgentePdf = async (mois, annee, montant, fichier) => {
    setUploadingFactureAgente(`${annee}-${mois}`)
    const ext   = fichier.name.split('.').pop()
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

  // ── REDEVANCES CRUD ────────────────────────────────────────────────────────

  const sauvegarderRedevance = async () => {
    setSavingRedev(true)
    const payload = {
      agente_id:     redevForm.agente_id || profile?.id,
      annee:         parseInt(redevForm.annee),
      mois:          parseInt(redevForm.mois),
      montant_ttc:   parseFloat(redevForm.montant_ttc) || 540,
      statut:        redevForm.statut,
      date_paiement: redevForm.statut === 'regle'
        ? (redevForm.date_paiement || new Date().toISOString().split('T')[0])
        : null,
      note: redevForm.note || null,
    }

    await supabase.from('redevances').upsert(payload, {
      onConflict: 'agente_id,annee,mois',
      ignoreDuplicates: false,
    })

    const { data } = await supabase
      .from('redevances')
      .select('*')
      .order('annee', { ascending: false })
      .order('mois',  { ascending: false })
    setRedevances(data || [])

    setRedevModal(false)
    setRedevForm({
      agente_id: '', annee: new Date().getFullYear(), mois: new Date().getMonth() + 1,
      montant_ttc: 540, statut: 'en_attente', date_paiement: '', note: '',
    })
    setSavingRedev(false)
  }

  const toggleRedevStatut = async (id, currentStatut) => {
    const newStatut = currentStatut === 'regle' ? 'en_attente' : 'regle'
    const updates   = { statut: newStatut }
    if (newStatut === 'regle') updates.date_paiement = new Date().toISOString().split('T')[0]
    else updates.date_paiement = null

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
    const moisAttendus = []

    for (let m = 1; m <= moisMax; m++) {
      const existante = redevances.find(r =>
        (r.agente_id === agenteId || (!r.agente_id && !agenteId)) &&
        r.annee === annee && r.mois === m
      )
      const lastDay = new Date(annee, m, 0)
      lastDay.setDate(lastDay.getDate() - 1)
      const enRetard = (!existante || existante.statut !== 'regle') &&
        new Date(annee, m - 1, lastDay.getDate()) < now

      moisAttendus.push({ mois: m, redev: existante, enRetard, lastDay })
    }
    return moisAttendus
  }

  // ── DÉRIVATIONS DE LISTES ──────────────────────────────────────────────────

  const dossiersAgentes = dossiers.filter(d => d.referente?.role === 'agente')
  const dossiersMarine  = dossiers.filter(d => d.referente?.role === 'admin')

  // Mes dossiers : admin = franchisée, agente = ses propres dossiers
  const mesDossiers = isMarine
    ? dossiersMarine
    : dossiers.filter(d => d.referente?.id === profile?.id)

  // Dossiers de l'agente sélectionnée (onglet admin "agentes")
  const dossiersAgente = agenteSelectionnee
    ? dossiers.filter(d => d.referente?.id === agenteSelectionnee)
    : dossiersAgentes

  const agenteActuelle = agentes.find(a => a.id === agenteSelectionnee)
  const nomAgente      = agenteActuelle ? `${agenteActuelle.prenom} ${agenteActuelle.nom}` : 'Agente'

  // Redevances filtrées par agente
  const redevancesAgente = agenteSelectionnee
    ? redevances.filter(r => r.agente_id === agenteSelectionnee || !r.agente_id)
    : redevances
  const mesRedevances = profile?.id
    ? redevances.filter(r => r.agente_id === profile.id || !r.agente_id)
    : redevances

  // ── TOTAUX GLOBAUX CTP ─────────────────────────────────────────────────────

  const totalRedevancesReglees  = redevances.filter(r => r.statut === 'regle').reduce((s, r) => s + (r.montant_ttc || 540), 0)
  const totalGainsAgentesReels  = dossiersAgentes.reduce((s, d) => s + calculer(d).gainsAgenteReels, 0)
  const totalGainsAgentesPrevi  = dossiersAgentes.reduce((s, d) => s + calculer(d).gainsAgentePrevi, 0)
  const totalApporteurAgenteDu  = dossiersAgentes.reduce((s, d) => s + calculer(d).apporteurPartAgente, 0)

  const totalCommissionsCTP = dossiers.reduce((s, d) => { const c = calculer(d); return s + c.comTTC - c.royalties }, 0)
  const totalHonorairesCTP  = dossiers.reduce((s, d) => s + calculer(d).honorairesTotalTTC, 0)
  const totalFraisCTP       = dossiers.filter(d => d.frais_statut === 'regle').reduce((s, d) => s + calculer(d).fraisNet, 0)
  const totalApporteurTTC   = dossiers.reduce((s, d) => s + calculer(d).apporteurTTC, 0)

  const encCTP = totalCommissionsCTP + totalHonorairesCTP + totalFraisCTP + totalRedevancesReglees
  const decCTP = totalGainsAgentesReels + totalApporteurTTC
  const netCTP = encCTP - decCTP

  const totalAdminDoitAgentes   = totalGainsAgentesReels
  const totalAgentesDoiventAdmin = totalRedevancesReglees + totalApporteurAgenteDu

  // ── TOTAUX AGENTE SÉLECTIONNÉE ─────────────────────────────────────────────

  const gainsAgenteReels       = dossiersAgente.reduce((s, d) => s + calculer(d).gainsAgenteReels, 0)
  const gainsAgentePrevi       = dossiersAgente.reduce((s, d) => s + calculer(d).gainsAgentePrevi, 0)
  const apporteurAgenteDu      = dossiersAgente.reduce((s, d) => s + calculer(d).apporteurPartAgente, 0)
  const redevancesAgenteReglees = redevancesAgente.filter(r => r.statut === 'regle').reduce((s, r) => s + (r.montant_ttc || 540), 0)
  const netAgenteSelectionnee   = gainsAgenteReels - redevancesAgenteReglees - apporteurAgenteDu

  // ── TOTAUX AGENTE CONNECTÉE ────────────────────────────────────────────────

  const mesDossiersGainsBruts = mesDossiers.reduce((s, d) => {
    const c = calculer(d)
    return s + c.partAgente + c.partAgenteHonoraires + c.fraisPartAgente
  }, 0)
  const mesDossiersGainsReels = mesDossiers.reduce((s, d) => s + calculer(d).gainsAgenteReels, 0)
  const mesDossiersGainsPrevi = mesDossiers.reduce((s, d) => s + calculer(d).gainsAgentePrevi, 0)
  const mesApporteurDu        = mesDossiers.reduce((s, d) => s + calculer(d).apporteurPartAgente, 0)
  const mesRedevancesReglees  = mesRedevances.filter(r => r.statut === 'regle').reduce((s, r) => s + (r.montant_ttc || 540), 0)
  const monNet                = mesDossiersGainsReels - mesRedevancesReglees - mesApporteurDu

  // ── AGRÉGATION PAR PÉRIODE ─────────────────────────────────────────────────

  const getKeyMois = (d) => {
    if (!d.date_signature_contrat) return null
    const dt = new Date(d.date_signature_contrat)
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '00')}`
  }

  const emptyAgg = () => ({
    comHT: 0, comTTC: 0, royalties: 0, net: 0, partAgente: 0, partAdmin: 0,
    apporteurTTC: 0, apporteurPartAgente: 0, apporteurPartAdmin: 0,
    fraisNet: 0, fraisTTC: 0, fraisPartAgente: 0, fraisPartAdmin: 0, fraisRoyalties: 0,
    gainsAgenteReels: 0, gainsAgentePrevi: 0, netAdminPrevi: 0,
    honorairesTotalTTC: 0, honorairesTotalNet: 0,
    royaltiesCourtage: 0, royaltiesAMO: 0, sommeRoyalties: 0,
    partAgenteHonoraires: 0, partAdminHonoraires: 0, totalEncaissement: 0,
  })

  const agrégerMois = (listeDossiers) => {
    const map = {}
    listeDossiers.forEach(d => {
      const key = getKeyMois(d)
      if (!key) return
      if (!map[key]) map[key] = emptyAgg()
      const c = calculer(d)
      Object.keys(map[key]).forEach(k => { if (c[k] !== undefined) map[key][k] += c[k] })
    })
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]))
  }

  const agrégerAnnee = (listeDossiers) => {
    const map = {}
    listeDossiers.forEach(d => {
      if (!d.date_signature_contrat) return
      const annee = new Date(d.date_signature_contrat).getFullYear()
      if (!map[annee]) map[annee] = emptyAgg()
      const c = calculer(d)
      Object.keys(map[annee]).forEach(k => { if (c[k] !== undefined) map[annee][k] += c[k] })
    })
    return Object.entries(map).sort((a, b) => b[0] - a[0])
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPERS DE RENDU (cellules & formatage)
  // ─────────────────────────────────────────────────────────────────────────────

  const fmt   = (n) => (n || 0).toFixed(2) + ' €'
  const thR   = (label) => <th className="text-right px-3 py-3 text-xs font-medium text-gray-500 uppercase">{label}</th>
  const thL   = (label) => <th className="text-left px-3 py-3 text-xs font-medium text-gray-500 uppercase">{label}</th>
  const tdR   = (val, color = 'text-gray-600') => <td className={`px-3 py-3 text-right ${color}`}>{val}</td>
  const tdTotal = (val) => (
    <td className={`px-3 py-3 text-right font-bold ${(val || 0) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
      {(val || 0).toFixed(2)} €
    </td>
  )

  // ─────────────────────────────────────────────────────────────────────────────
  // SOUS-ONGLETS & SÉLECTEUR AGENTE
  // ─────────────────────────────────────────────────────────────────────────────

  const renderSousOnglets = () => (
    <div className="flex gap-2">
      {[
        { key: 'chantier', label: 'Par chantier' },
        { key: 'mois',     label: 'Par mois'     },
        { key: 'annee',    label: 'Par année'     },
      ].map(({ key, label }) => (
        <button
          key={key}
          onClick={() => setSousOnglet(key)}
          className={`text-sm px-3 py-1.5 rounded-lg border transition-all ${
            sousOnglet === key
              ? 'bg-blue-800 text-white border-blue-800'
              : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
          }`}
        >
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
          <button
            key={a.id}
            onClick={() => setAgenteSelectionnee(a.id)}
            className={`text-sm px-3 py-1.5 rounded-lg border transition-all ${
              agenteSelectionnee === a.id
                ? 'bg-blue-800 text-white border-blue-800'
                : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            {a.prenom} {a.nom}
          </button>
        ))}
      </div>
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────────
  // ACCORDÉON (vue par chantier)
  // ─────────────────────────────────────────────────────────────────────────────

  const renderAccordeon = (listeDossiers, showBadge = false) => {
    const showParts = showBadge || !isMarine

    return (
      <div className="space-y-2">
        {listeDossiers.map(d => {
          const c      = calculer(d)
          const tousSignes = c.devisActifs.length > 0 && c.devisActifs.every(dv => dv.statut === 'accepte')
          const isOpen = dossierOuvert === d.id

          const nbAlertes = [
            d.contrat_signe && d.date_signature_contrat && d.frais_statut !== 'regle' && alertes48h(d.date_signature_contrat),
            ...c.devisAcceptes.map(dv =>
              dv.date_signature && alertes7j(dv.date_signature) &&
              getSuivi(d, 'acompte_artisan', dv.artisan_id)?.statut_client !== 'regle'
            ),
            d.date_fin_chantier && d.typologie === 'amo' &&
              alertes48h(d.date_fin_chantier) &&
              getSuivi(d, 'solde_amo')?.statut_client !== 'regle',
          ].filter(Boolean).length

          const headerRight = showBadge
            ? null
            : (isMarine ? c.totalEncaissement : c.gainsAgentePrevi)

          return (
            <div key={d.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {/* En-tête accordéon */}
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                onClick={() => setDossierOuvert(isOpen ? null : d.id)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-blue-900">{d.reference}</span>
                  <span className="text-sm text-gray-500">{d.client?.prenom} {d.client?.nom}</span>
                  <span className="text-xs text-gray-400">{d.typologie}</span>
                  {showBadge && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      c.estChantierMarine ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {c.estChantierMarine ? nomFranchisee : nomReferente(d)}
                    </span>
                  )}
                  {nbAlertes > 0 && (
                    <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">
                      ⚠️ {nbAlertes}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  {showBadge ? (
                    <>
                      {!c.estChantierMarine && (
                        <span className="text-sm text-blue-700 font-medium">
                          {nomReferente(d)} : {c.gainsAgenteReels.toFixed(2)} €
                        </span>
                      )}
                      <span className="text-sm text-purple-700 font-medium">
                        CTP : {c.netAdminPrevi.toFixed(2)} €
                      </span>
                    </>
                  ) : (
                    headerRight !== null && (
                      <span className="text-sm text-gray-700 font-medium">
                        {isMarine ? 'Encaissement : ' : 'Net : '}{headerRight.toFixed(2)} €
                      </span>
                    )
                  )}
                  <span className="text-gray-400">{isOpen ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* Contenu accordéon */}
              {isOpen && (
                <div className="border-t border-gray-100 p-4 space-y-4">
                  {/* Statut contrat & dates */}
                  <div className="flex items-center gap-3 text-sm flex-wrap">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      d.contrat_signe ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                    }`}>
                      Contrat {d.contrat_signe
                        ? `✅ ${d.date_signature_contrat ? new Date(d.date_signature_contrat).toLocaleDateString('fr-FR') : ''}`
                        : '❌ non signé'
                      }
                    </span>
                    {d.date_demarrage_chantier && (
                      <span className="text-xs text-gray-400">
                        Démarrage : {new Date(d.date_demarrage_chantier).toLocaleDateString('fr-FR')}
                      </span>
                    )}
                    {d.date_fin_chantier && (
                      <span className="text-xs text-gray-400">
                        Fin : {new Date(d.date_fin_chantier).toLocaleDateString('fr-FR')}
                      </span>
                    )}
                  </div>

                  {/* Frais de consultation */}
                  {d.frais_consultation > 0 && (
                    <div className="border border-gray-100 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-medium text-gray-600 uppercase">Frais de consultation</p>
                        {alertes48h(d.date_signature_contrat) && d.frais_statut !== 'regle' && (
                          <span className="text-xs text-red-500">⚠️ Retard 48h</span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50 rounded p-2 mb-2">
                        <div className="flex justify-between"><span className="text-gray-400">TTC</span><span>{c.fraisTTC.toFixed(2)} €</span></div>
                        <div className="flex justify-between"><span className="text-gray-400">HT</span><span>{c.fraisHT.toFixed(2)} €</span></div>
                        <div className="flex justify-between"><span className="text-gray-400">Royalties</span><span className="text-red-400">- {c.fraisRoyalties.toFixed(2)} €</span></div>
                        <div className="flex justify-between"><span className="text-gray-400">Net</span><span className="font-medium">{c.fraisNet.toFixed(2)} €</span></div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            d.frais_statut === 'regle'    ? 'bg-green-100 text-green-700' :
                            d.frais_statut === 'factures' ? 'bg-amber-100 text-amber-700' :
                            'bg-gray-100 text-gray-500'
                          }`}>
                            {d.frais_statut === 'regle'
                              ? (d.frais_deduits ? '🔄 Déduit du total client' : '✅ Réglé')
                              : d.frais_statut === 'factures' ? '⏳ Facturé' : 'Offerts'
                            }
                          </span>
                          {d.frais_statut === 'regle' && (
                            <input
                              type="date"
                              value={getSuivi(d, 'frais_consultation')?.date_paiement || ''}
                              onChange={e => majSuivi(d.id, 'frais_consultation', null, 'date_paiement', e.target.value)}
                              className="border border-gray-200 rounded px-2 py-0.5 text-xs focus:outline-none"
                              placeholder="Date de règlement"
                            />
                          )}
                        </div>
                    </div>
                  )}

                  {/* Acomptes & Factures par artisan */}
                  {c.devisActifs.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-gray-500 uppercase">Acomptes & Factures par artisan</p>
                      {c.devisActifs.map(dv => {
                        const suiviAcompte = getSuivi(d, 'acompte_artisan', dv.artisan_id)
                        const estSigne = dv.statut === 'accepte'
                        const montantAcompteCalc = dv.acompte_pourcentage === -1
                          ? (dv.acompte_montant_fixe || 0)
                          : (dv.montant_ttc || 0) * ((dv.acompte_pourcentage || 30) / 100)
                        const montantSolde = (dv.montant_ttc || 0) - montantAcompteCalc

                        return (
                          <div key={dv.id} className="border border-gray-100 rounded-lg p-3 space-y-2">
                            {/* En-tête artisan */}
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-gray-800">🔨 {dv.artisan?.entreprise}</p>
                              <span className="text-xs text-gray-400">
                                {dv.montant_ht?.toFixed(2)} € HT / {dv.montant_ttc?.toFixed(2)} € TTC
                              </span>
                              {estSigne && dv.date_signature && (
                                <span className="text-xs text-green-600">
                                  Signé le {new Date(dv.date_signature).toLocaleDateString('fr-FR')}
                                </span>
                              )}
                              {!estSigne && (
                                <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Non signé</span>
                              )}
                            </div>

                            {/* Grille prévi / réel */}
                            <div className={`grid gap-2 text-xs ${tousSignes ? 'grid-cols-1' : 'grid-cols-2'}`}>

                              {/* Prévisionnel */}
                              {!tousSignes && (
                                <div className="bg-gray-50 rounded p-2 space-y-1">
                                  <p className="font-medium text-gray-500 mb-1">Prévisionnel</p>
                                  <div className="flex justify-between">
                                    <span className="text-gray-400">Acompte</span>
                                    <span className="font-medium">
                                      {dv.acompte_pourcentage === -1
                                        ? `${(dv.acompte_montant_fixe || 0).toFixed(2)} € TTC`
                                        : `${montantAcompteCalc.toFixed(2)} € TTC (${dv.acompte_pourcentage || 30}%)`}
                                    </span>
                                  </div>
                                  {d.typologie === 'amo' && (
                                    <div className="flex justify-between">
                                      <span className="text-gray-400">Facture finale</span>
                                      <span className="font-medium">{montantSolde.toFixed(2)} € TTC</span>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Réel — contrôles uniquement si signé */}
                              <div className={`rounded p-2 space-y-2 ${estSigne ? 'bg-green-50' : 'bg-gray-100'}`}>
                                <p className="font-medium text-green-700 mb-1">{tousSignes ? 'Suivi' : 'Réel (signé)'}</p>
                                {!estSigne ? (
                                  <p className="text-gray-400 italic">Devis non signé</p>
                                ) : (
                                  <>
                                    {/* Acompte */}
                                    <div className="space-y-1">
                                      <div className="flex justify-between">
                                        <span className="text-gray-500 font-medium">Acompte</span>
                                        <span className="font-bold text-gray-800">
                                          {dv.acompte_pourcentage === -1
                                            ? `${(dv.acompte_montant_fixe || 0).toFixed(2)} € TTC`
                                            : `${montantAcompteCalc.toFixed(2)} € TTC (${dv.acompte_pourcentage || 30}%)`}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        {dv.date_signature && alertes7j(dv.date_signature) && suiviAcompte?.statut_client !== 'regle' && (
                                          <span className="text-red-500">⚠️ Retard</span>
                                        )}
                                        <select
                                          value={suiviAcompte?.statut_client || 'en_attente'}
                                          onChange={e => majSuivi(d.id, 'acompte_artisan', dv.artisan_id, 'statut_client', e.target.value)}
                                          className="border border-gray-200 rounded px-2 py-0.5 text-xs focus:outline-none bg-white"
                                        >
                                          <option value="en_attente">Client : En attente</option>
                                          <option value="envoye">Client : Demande envoyé</option>
                                          <option value="regle">Client : ✅ Payé</option>
                                        </select>
                                        {suiviAcompte?.statut_client === 'regle' && (
                                          <input type="date"
                                            value={suiviAcompte?.date_paiement || ''}
                                            onChange={e => majSuivi(d.id, 'acompte_artisan', dv.artisan_id, 'date_paiement', e.target.value)}
                                            className="border border-gray-200 rounded px-2 py-0.5 text-xs focus:outline-none bg-white" />
                                        )}
                                        {!dv.artisan?.sans_royalties && (
                                          <select
                                            value={suiviAcompte?.statut_illico || 'en_attente'}
                                            onChange={e => majSuivi(d.id, 'acompte_artisan', dv.artisan_id, 'statut_illico', e.target.value)}
                                            className="border border-gray-200 rounded px-2 py-0.5 text-xs focus:outline-none bg-white"
                                          >
                                            <option value="en_attente">illiCO France : En attente</option>
                                            <option value="recu">illiCO France : ✅ Acompte débloqué</option>
                                          </select>
                                        )}
                                        {isMarine && (
                                          <select
                                            value={suiviAcompte?.statut_ctp || 'en_attente'}
                                            onChange={e => majSuivi(d.id, 'acompte_artisan', dv.artisan_id, 'statut_ctp', e.target.value)}
                                            className="border border-gray-200 rounded px-2 py-0.5 text-xs focus:outline-none bg-white"
                                          >
                                            <option value="en_attente">CTP : En attente commission</option>
                                            <option value="recu">CTP : ✅ Commission reçue</option>
                                          </select>
                                        )}
                                      </div>
                                    </div>

                                    {/* Facture finale AMO */}
                                    {d.typologie === 'amo' && (() => {
                                      const suiviFact = getSuivi(d, 'facture_finale', dv.artisan_id)
                                      return (
                                        <div className="space-y-1 border-t border-green-200 pt-1">
                                          <div className="flex justify-between">
                                            <span className="text-gray-500 font-medium">Facture finale</span>
                                            <span className="font-bold text-gray-800">{montantSolde.toFixed(2)} € TTC</span>
                                          </div>
                                          <div className="flex items-center gap-2 flex-wrap">
                                            {d.date_fin_chantier && alertes48h(d.date_fin_chantier) && suiviFact?.statut_client !== 'regle' && (
                                              <span className="text-red-500">⚠️ Retard</span>
                                            )}
                                            <select
                                              value={suiviFact?.statut_client || 'en_attente'}
                                              onChange={e => majSuivi(d.id, 'facture_finale', dv.artisan_id, 'statut_client', e.target.value)}
                                              className="border border-gray-200 rounded px-2 py-0.5 text-xs focus:outline-none bg-white"
                                            >
                                              <option value="en_attente">Client : En attente</option>
                                              <option value="envoye">Client : Facture reçue</option>
                                              <option value="regle">Client : ✅ Payé </option>
                                            </select>
                                            {suiviFact?.statut_client === 'regle' && (
                                              <input type="date"
                                                value={suiviFact?.date_paiement || ''}
                                                onChange={e => majSuivi(d.id, 'facture_finale', dv.artisan_id, 'date_paiement', e.target.value)}
                                                className="border border-gray-200 rounded px-2 py-0.5 text-xs focus:outline-none bg-white" />
                                            )}
                                          </div>
                                        </div>
                                      )
                                    })()}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Honoraires client */}
                  {['courtage', 'amo'].includes(d.typologie) && c.honorairesTotalTTC > 0 && (
                    <div className="border border-gray-100 rounded-lg p-3 space-y-2">
                      <p className="text-xs font-medium text-gray-600 uppercase mb-1">Honoraires client</p>
                      <div className={`grid gap-3 text-xs ${tousSignes ? 'grid-cols-1' : 'grid-cols-2'}`}>
                        {!tousSignes && (
                          <div className="space-y-2">
                            <p className="font-medium text-gray-500 text-xs mb-1">Prévisionnel</p>
                            <div className="bg-gray-50 rounded p-2 space-y-1">
                              <div className="flex justify-between"><span className="font-medium text-gray-600">Courtage ({c.tauxCourtagePct}%)</span><span>{c.honorairesCourtage.toFixed(2)} €</span></div>
                              <div className="flex justify-between"><span className="text-red-400">Royalties (5%)</span><span className="text-red-400">- {c.royaltiesCourtage.toFixed(2)} €</span></div>
                              <div className="flex justify-between border-t border-gray-200 pt-1"><span className="text-gray-400">Net</span><span className="font-medium">{c.honorairesCourtageNet.toFixed(2)} €</span></div>
                            </div>
                            {d.typologie === 'amo' && (
                              <div className="bg-blue-50 rounded p-2 space-y-1">
                                <div className="flex justify-between"><span className="font-medium text-blue-700">AMO ({c.tauxAmoPct}%)</span><span>{c.honorairesAMOSolde.toFixed(2)} €</span></div>
                                <div className="flex justify-between"><span className="text-red-400">Royalties (5%)</span><span className="text-red-400">- {c.royaltiesAMO.toFixed(2)} €</span></div>
                                <div className="flex justify-between border-t border-blue-200 pt-1"><span className="text-blue-500">Net</span><span className="font-medium text-blue-700">{c.honorairesAMONet.toFixed(2)} €</span></div>
                              </div>
                            )}
                          </div>
                        )}
                        <div className="space-y-2">
                          <p className="font-medium text-green-700 text-xs mb-1">{tousSignes ? 'Réel' : 'Réel (encaissé)'}</p>
                          {(() => {
                            const courtageRegle = getSuivi(d, 'honoraires_courtage')?.statut_client === 'regle'
                            const amoRegle = d.typologie === 'amo' && getSuivi(d, 'solde_amo')?.statut_client === 'regle'
                            return (
                              <>
                                <div className={`rounded p-2 space-y-1 ${courtageRegle ? 'bg-green-50' : 'bg-gray-50'}`}>
                                  <div className="flex justify-between"><span className="font-medium text-gray-600">Courtage ({c.tauxCourtagePct}%)</span><span>{c.honorairesCourtage.toFixed(2)} €</span></div>
                                  <div className="flex justify-between"><span className="text-red-400">Royalties (5%)</span><span className="text-red-400">- {c.royaltiesCourtage.toFixed(2)} €</span></div>
                                  <div className="flex justify-between border-t border-gray-200 pt-1"><span className="text-gray-400">Net</span><span className="font-medium">{c.honorairesCourtageNet.toFixed(2)} €</span></div>
                                  <select value={getSuivi(d, 'honoraires_courtage')?.statut_client || 'en_attente'}
                                    onChange={e => majSuivi(d.id, 'honoraires_courtage', null, 'statut_client', e.target.value)}
                                    className="border border-gray-200 rounded px-2 py-0.5 text-xs focus:outline-none w-full bg-white">
                                    <option value="en_attente">Client : En attente</option>
                                    <option value="envoye">Client : Facturé</option>
                                    <option value="regle">Client : ✅ Réglé</option>
                                  </select>
                                  {getSuivi(d, 'honoraires_courtage')?.statut_client === 'regle' && (
                                    <input type="date" value={getSuivi(d, 'honoraires_courtage')?.date_paiement || ''}
                                      onChange={e => majSuivi(d.id, 'honoraires_courtage', null, 'date_paiement', e.target.value)}
                                      className="border border-gray-200 rounded px-2 py-0.5 text-xs focus:outline-none w-full" />
                                  )}
                                </div>
                                {d.typologie === 'amo' && (
                                  <div className={`rounded p-2 space-y-1 ${amoRegle ? 'bg-green-50' : 'bg-blue-50'}`}>
                                    <div className="flex justify-between"><span className="font-medium text-blue-700">AMO ({c.tauxAmoPct}%)</span><span>{c.honorairesAMOSolde.toFixed(2)} €</span></div>
                                    <div className="flex justify-between"><span className="text-red-400">Royalties (5%)</span><span className="text-red-400">- {c.royaltiesAMO.toFixed(2)} €</span></div>
                                    <div className="flex justify-between border-t border-blue-200 pt-1"><span className="text-blue-500">Net</span><span className="font-medium text-blue-700">{c.honorairesAMONet.toFixed(2)} €</span></div>
                                    <select value={getSuivi(d, 'solde_amo')?.statut_client || 'en_attente'}
                                      onChange={e => majSuivi(d.id, 'solde_amo', null, 'statut_client', e.target.value)}
                                      className="border border-blue-200 rounded px-2 py-0.5 text-xs focus:outline-none w-full bg-white">
                                      <option value="en_attente">Client : En attente</option>
                                      <option value="envoye">Client : Facturé</option>
                                      <option value="regle">Client : ✅ Réglé</option>
                                    </select>
                                    {getSuivi(d, 'solde_amo')?.statut_client === 'regle' && (
                                      <input type="date" value={getSuivi(d, 'solde_amo')?.date_paiement || ''}
                                        onChange={e => majSuivi(d.id, 'solde_amo', null, 'date_paiement', e.target.value)}
                                        className="border border-blue-200 rounded px-2 py-0.5 text-xs focus:outline-none w-full" />
                                    )}
                                  </div>
                                )}
                              </>
                            )
                          })()}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Apporteur */}
                  {d.client?.apporteur_affaires && c.apporteurTTC > 0 && (
                    <div className="border border-orange-100 rounded-lg p-3 bg-orange-50">
                      <p className="text-xs font-medium text-orange-700 uppercase mb-2">
                        Apporteur — {d.client.apporteur_nom} ({d.client.apporteur_pourcentage}%)
                      </p>
                      <div className="flex items-center gap-4 text-xs flex-wrap">
                        <span className="text-orange-600">Total : {c.apporteurTTC.toFixed(2)} € TTC</span>
                        {!c.estChantierMarine && (
                          <span className="text-blue-600">Part agente : {c.apporteurPartAgente.toFixed(2)} €</span>
                        )}
                        {!c.estChantierMarine && (
                          <select
                            value={getSuivi(d, 'apporteur_agente')?.statut_ctp || 'en_attente'}
                            onChange={e => majSuivi(d.id, 'apporteur_agente', null, 'statut_ctp', e.target.value)}
                            className="border border-orange-200 rounded px-2 py-0.5 text-xs focus:outline-none bg-white"
                          >
                            <option value="en_attente">Agente → CTP : En attente</option>
                            <option value="rembourse">Agente → CTP : ✅ Remboursé</option>
                          </select>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Total commissions artisans */}
                  {c.devisAcceptes.length > 0 && (
                    <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                      <p className="text-xs font-medium text-gray-600 uppercase mb-2">Commissions artisans</p>
                      <div className={`grid gap-3 text-xs ${tousSignes ? 'grid-cols-1' : 'grid-cols-2'}`}>
                        {!tousSignes && (
                          <div className="bg-white rounded p-2 space-y-1">
                            <p className="font-medium text-gray-500 mb-1">Prévisionnel</p>
                            <div className="flex justify-between"><span className="text-gray-400">COM HT</span><span>{c.comHT.toFixed(2)} €</span></div>
                            <div className="flex justify-between"><span className="text-gray-400">COM TTC</span><span>{c.comTTC.toFixed(2)} €</span></div>
                            <div className="flex justify-between"><span className="text-red-400">Royalties</span><span className="text-red-400">- {c.royalties.toFixed(2)} €</span></div>
                            <div className="flex justify-between border-t border-gray-100 pt-1"><span className="text-gray-400">Net</span><span className="font-medium">{c.net.toFixed(2)} €</span></div>
                            {!c.estChantierMarine && <div className="flex justify-between"><span className="text-blue-500">Part {nomReferente(d)}</span><span className="text-blue-700">{c.partAgente.toFixed(2)} €</span></div>}
                          </div>
                        )}
                        <div className="bg-green-50 rounded p-2 space-y-1">
                          <p className="font-medium text-green-700 mb-1">{tousSignes ? 'Réel (tous signés)' : 'Réel (signés)'}</p>
                          <div className="flex justify-between"><span className="text-gray-400">COM HT</span><span>{c.comHTReel.toFixed(2)} €</span></div>
                          <div className="flex justify-between"><span className="text-gray-400">COM TTC</span><span>{c.comTTCReel.toFixed(2)} €</span></div>
                          <div className="flex justify-between"><span className="text-red-400">Royalties</span><span className="text-red-400">- {c.royaltiesReel.toFixed(2)} €</span></div>
                          <div className="flex justify-between border-t border-gray-100 pt-1"><span className="text-gray-400">Net</span><span className="font-medium">{c.netReel.toFixed(2)} €</span></div>
                          {!c.estChantierMarine && <div className="flex justify-between"><span className="text-blue-500">Part {nomReferente(d)}</span><span className="text-blue-700">{c.partAgenteReel.toFixed(2)} €</span></div>}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Total gain chantier */}
                  <div className="border-2 border-gray-300 rounded-lg p-3 bg-white">
                    <p className="text-xs font-bold text-gray-700 uppercase mb-2">Total gain chantier</p>
                    <div className={`grid gap-3 text-xs ${tousSignes ? 'grid-cols-1' : 'grid-cols-2'}`}>

                      {/* Prévisionnel */}
                      {!tousSignes && (
                        <div className="bg-gray-50 rounded p-2 space-y-1">
                          <p className="font-medium text-gray-500 mb-1">Prévisionnel</p>
                          {c.fraisTTC > 0 && <div className="flex justify-between"><span className="text-gray-400">Frais consul. TTC</span><span>+ {c.fraisTTC.toFixed(2)} €</span></div>}
                          {c.honorairesTotalTTC > 0 && <div className="flex justify-between"><span className="text-gray-400">Honoraires TTC</span><span>+ {c.honorairesTotalTTC.toFixed(2)} €</span></div>}
                          <div className="flex justify-between"><span className="text-gray-400">Commissions nettes</span><span>+ {c.net.toFixed(2)} €</span></div>
                          <div className="flex justify-between"><span className="text-red-400">Somme royalties</span><span className="text-red-400">— {c.sommeRoyalties.toFixed(2)} €</span></div>
                          {c.apporteurTTC > 0 && <div className="flex justify-between"><span className="text-orange-500">Apporteur</span><span className="text-orange-500">— {c.apporteurTTC.toFixed(2)} €</span></div>}
                          <div className="border-t border-gray-200 pt-1 space-y-0.5">
                            {showParts && !c.estChantierMarine && (
                              <div className="flex justify-between font-bold">
                                <span className="text-blue-600">{nomReferente(d)}</span>
                                <span className="text-blue-700">{c.gainsAgentePrevi.toFixed(2)} €</span>
                              </div>
                            )}
                            {(showParts || isMarine) && (
                              <div className="flex justify-between font-bold">
                                <span className={c.estChantierMarine ? 'text-gray-700' : 'text-purple-600'}>
                                  {c.estChantierMarine ? 'Net' : nomFranchisee}
                                </span>
                                <span className={c.estChantierMarine ? 'text-gray-700' : 'text-purple-700'}>
                                  {c.netAdminPrevi.toFixed(2)} €
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Réel (encaissé) */}
                      <div className="bg-green-50 rounded p-2 space-y-1">
                        <p className="font-medium text-green-700 mb-1">Réel (encaissé)</p>
                        {(() => {
                          const fraisReel       = d.frais_statut === 'regle' ? c.fraisTTC : 0
                          const honCourtageReel = getSuivi(d, 'honoraires_courtage')?.statut_client === 'regle' ? c.honorairesCourtage : 0
                          const honAMOReel      = d.typologie === 'amo' && getSuivi(d, 'solde_amo')?.statut_client === 'regle' ? c.honorairesAMOSolde : 0
                          const honReel         = honCourtageReel + honAMOReel
                          const royaltiesReelTotal = round2(
                            (d.frais_statut === 'regle' ? c.fraisRoyalties : 0) +
                            (getSuivi(d, 'honoraires_courtage')?.statut_client === 'regle' ? c.royaltiesCourtage : 0) +
                            (d.typologie === 'amo' && getSuivi(d, 'solde_amo')?.statut_client === 'regle' ? c.royaltiesAMO : 0) +
                            c.royaltiesReel
                          )
                          return (<>
                            {fraisReel > 0 && <div className="flex justify-between"><span className="text-gray-400">Frais consul. TTC</span><span>+ {fraisReel.toFixed(2)} €</span></div>}
                            {honReel > 0 && <div className="flex justify-between"><span className="text-gray-400">Honoraires TTC</span><span>+ {honReel.toFixed(2)} €</span></div>}
                            <div className="flex justify-between"><span className="text-gray-400">Commissions nettes</span><span>+ {c.netReel.toFixed(2)} €</span></div>
                            <div className="flex justify-between"><span className="text-red-400">Somme royalties</span><span className="text-red-400">— {royaltiesReelTotal.toFixed(2)} €</span></div>
                            {c.apporteurTTC > 0 && <div className="flex justify-between"><span className="text-orange-500">Apporteur</span><span className="text-orange-500">— {c.apporteurTTC.toFixed(2)} €</span></div>}
                            <div className="border-t border-green-200 pt-1">
                              {showParts && !c.estChantierMarine && (
                                <div className="flex justify-between font-bold">
                                  <span className="text-blue-600">{nomReferente(d)}</span>
                                  <span className="text-blue-700">{c.gainsAgenteReels.toFixed(2)} €</span>
                                </div>
                              )}
                              {(showParts || isMarine) && (
                                <div className="flex justify-between font-bold">
                                  <span className={c.estChantierMarine ? 'text-gray-700' : 'text-purple-600'}>
                                    {c.estChantierMarine ? 'Net' : nomFranchisee}
                                  </span>
                                  <span className={c.estChantierMarine ? 'text-gray-700' : 'text-purple-700'}>
                                    {(fraisReel + honCourtageReel + honAMOReel + c.netReel - royaltiesReelTotal - c.apporteurTTC - c.gainsAgenteReels).toFixed(2)} €
                                  </span>
                                </div>
                              )}
                            </div>
                          </>)
                        })()}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => router.push(`/chantiers/${d.id}`)}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    → Voir la fiche chantier
                  </button>
                </div>
              )}
            </div>
          )
        })}
        {listeDossiers.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-8">Aucun chantier</p>
        )}
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TABLEAUX MES CHANTIERS (par mois / par année)
  // ─────────────────────────────────────────────────────────────────────────────

  const getMesVals = (c) => isMarine
    ? { frais: c.fraisTTC, commission: c.comTTC, honoraire: c.honorairesTotalTTC, royalties: c.sommeRoyalties, apporteur: c.apporteurTTC, total: c.netAdminPrevi }
    : { frais: c.fraisTTC, commission: c.comTTC, honoraire: c.honorairesTotalTTC, royalties: c.sommeRoyalties, apporteur: c.apporteurPartAgente, total: c.gainsAgentePrevi }

  const renderMesChantiersMois = (listeDossiers) => {
    const rows = agrégerMois(listeDossiers)
    return (
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {thL('Mois / Chantier')}
              {thR('Frais consul. TTC')}
              {thR('Commission TTC')}
              {thR('Honoraire TTC')}
              {thR('Somme royalties')}
              {thR('Apporteur')}
              {thR('Total')}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(([key, c]) => {
              const [annee, mois]    = key.split('-')
              const v                = getMesVals(c)
              const dossiersduMois   = listeDossiers.filter(d => getKeyMois(d) === key)
              return (
                <>
                  {/* Ligne mois */}
                  <tr key={key} className="bg-blue-50">
                    <td className="px-3 py-2 font-bold text-blue-900">{MOIS[parseInt(mois)]} {annee}</td>
                    {tdR(fmt(v.frais))}
                    {tdR(fmt(v.commission))}
                    {tdR(fmt(v.honoraire))}
                    <td className="px-3 py-2 text-right text-red-400">- {(v.royalties || 0).toFixed(2)} €</td>
                    <td className="px-3 py-2 text-right text-orange-500">{v.apporteur > 0 ? `- ${v.apporteur.toFixed(2)} €` : '—'}</td>
                    {tdTotal(v.total)}
                  </tr>
                  {/* Lignes chantiers */}
                  {dossiersduMois.map(d => {
                    const c2 = calculer(d)
                    const v2 = getMesVals(c2)
                    return (
                      <tr key={d.id} className="hover:bg-gray-50 border-t border-gray-100">
                        <td className="px-3 py-2 pl-8">
                          <span className="text-xs text-gray-400 mr-2">↳</span>
                          <span className="font-medium text-blue-800 text-xs">{d.reference}</span>
                          <span className="text-xs text-gray-400 ml-2">{d.client?.prenom} {d.client?.nom}</span>
                        </td>
                        {tdR(<span className="text-xs">{fmt(v2.frais)}</span>)}
                        {tdR(<span className="text-xs">{fmt(v2.commission)}</span>)}
                        {tdR(<span className="text-xs">{fmt(v2.honoraire)}</span>)}
                        <td className="px-3 py-2 text-right text-red-400 text-xs">{v2.royalties > 0 ? `- ${v2.royalties.toFixed(2)} €` : '—'}</td>
                        <td className="px-3 py-2 text-right text-orange-500 text-xs">{v2.apporteur > 0 ? `- ${v2.apporteur.toFixed(2)} €` : '—'}</td>
                        <td className={`px-3 py-2 text-right text-xs font-medium ${v2.total >= 0 ? 'text-green-700' : 'text-red-600'}`}>{v2.total.toFixed(2)} €</td>
                      </tr>
                    )
                  })}
                </>
              )
            })}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400 text-sm">Aucune donnée</td></tr>
            )}
          </tbody>
          <tfoot className="bg-gray-50 border-t-2 border-gray-300 font-bold">
            <tr>
              <td className="px-3 py-3">Total</td>
              {tdR(fmt(rows.reduce((s, [, c]) => s + c.fraisTTC, 0)))}
              {tdR(fmt(rows.reduce((s, [, c]) => s + c.comTTC, 0)))}
              {tdR(fmt(rows.reduce((s, [, c]) => s + c.honorairesTotalTTC, 0)))}
              <td className="px-3 py-3 text-right text-red-400">- {rows.reduce((s, [, c]) => s + c.sommeRoyalties, 0).toFixed(2)} €</td>
              <td className="px-3 py-3 text-right text-orange-500">- {rows.reduce((s, [, c]) => s + (isMarine ? c.apporteurTTC : c.apporteurPartAgente), 0).toFixed(2)} €</td>
              {tdTotal(rows.reduce((s, [, c]) => s + (isMarine ? c.netAdminPrevi : c.gainsAgentePrevi), 0))}
            </tr>
          </tfoot>
        </table>
      </div>
    )
  }

  const renderMesChantiersAnnee = (listeDossiers) => {
    const rows = agrégerAnnee(listeDossiers)
    return (
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {thL('Année / Chantier')}
              {thR('Frais consul. TTC')}
              {thR('Commission TTC')}
              {thR('Honoraire TTC')}
              {thR('Somme royalties')}
              {thR('Apporteur')}
              {thR('Total')}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(([annee, c]) => {
              const v = getMesVals(c)
              const dossiersAnnee = listeDossiers.filter(d => {
                if (!d.date_signature_contrat) return false
                return String(new Date(d.date_signature_contrat).getFullYear()) === String(annee)
              })
              return (
                <>
                  {/* Ligne année */}
                  <tr key={annee} className="bg-blue-50">
                    <td className="px-3 py-2 font-bold text-blue-900">{annee}</td>
                    {tdR(fmt(v.frais))}
                    {tdR(fmt(v.commission))}
                    {tdR(fmt(v.honoraire))}
                    <td className="px-3 py-2 text-right text-red-400">- {(v.royalties || 0).toFixed(2)} €</td>
                    <td className="px-3 py-2 text-right text-orange-500">{v.apporteur > 0 ? `- ${v.apporteur.toFixed(2)} €` : '—'}</td>
                    {tdTotal(v.total)}
                  </tr>
                  {/* Lignes chantiers */}
                  {dossiersAnnee.map(d => {
                    const c2 = calculer(d)
                    const v2 = getMesVals(c2)
                    return (
                      <tr key={d.id} className="hover:bg-gray-50 border-t border-gray-100">
                        <td className="px-3 py-2 pl-8">
                          <span className="text-xs text-gray-400 mr-2">↳</span>
                          <span className="font-medium text-blue-800 text-xs">{d.reference}</span>
                          <span className="text-xs text-gray-400 ml-2">{d.client?.prenom} {d.client?.nom}</span>
                        </td>
                        {tdR(<span className="text-xs">{fmt(v2.frais)}</span>)}
                        {tdR(<span className="text-xs">{fmt(v2.commission)}</span>)}
                        {tdR(<span className="text-xs">{fmt(v2.honoraire)}</span>)}
                        <td className="px-3 py-2 text-right text-red-400 text-xs">{v2.royalties > 0 ? `- ${v2.royalties.toFixed(2)} €` : '—'}</td>
                        <td className="px-3 py-2 text-right text-orange-500 text-xs">{v2.apporteur > 0 ? `- ${v2.apporteur.toFixed(2)} €` : '—'}</td>
                        <td className={`px-3 py-2 text-right text-xs font-medium ${v2.total >= 0 ? 'text-green-700' : 'text-red-600'}`}>{v2.total.toFixed(2)} €</td>
                      </tr>
                    )
                  })}
                </>
              )
            })}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400 text-sm">Aucune donnée</td></tr>
            )}
          </tbody>
          <tfoot className="bg-gray-50 border-t-2 border-gray-300 font-bold">
            <tr>
              <td className="px-3 py-3">Total</td>
              {tdR(fmt(rows.reduce((s, [, c]) => s + c.fraisTTC, 0)))}
              {tdR(fmt(rows.reduce((s, [, c]) => s + c.comTTC, 0)))}
              {tdR(fmt(rows.reduce((s, [, c]) => s + c.honorairesTotalTTC, 0)))}
              <td className="px-3 py-3 text-right text-red-400">- {rows.reduce((s, [, c]) => s + c.sommeRoyalties, 0).toFixed(2)} €</td>
              <td className="px-3 py-3 text-right text-orange-500">- {rows.reduce((s, [, c]) => s + (isMarine ? c.apporteurTTC : c.apporteurPartAgente), 0).toFixed(2)} €</td>
              {tdTotal(rows.reduce((s, [, c]) => s + (isMarine ? c.netAdminPrevi : c.gainsAgentePrevi), 0))}
            </tr>
          </tfoot>
        </table>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TABLEAUX TOUS LES CHANTIERS (admin)
  // ─────────────────────────────────────────────────────────────────────────────

  const renderTousMois = () => {
    const rows = agrégerMois(dossiers)
    return (
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {thL('Mois')}
              {thR('Frais consul. TTC')}
              {thR('Commission TTC')}
              {thR('Honoraire TTC')}
              {thR('Somme royalties')}
              {thR('Apporteur')}
              {thR('Part agentes')}
              {thR(nomFranchisee)}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(([key, c]) => {
              const [annee, mois] = key.split('-')
              return (
                <tr key={key} className="hover:bg-gray-50">
                  <td className="px-3 py-3 font-medium">{MOIS[parseInt(mois)]} {annee}</td>
                  {tdR(fmt(c.fraisTTC))}
                  {tdR(fmt(c.comTTC))}
                  {tdR(fmt(c.honorairesTotalTTC))}
                  <td className="px-3 py-3 text-right text-red-400">- {c.sommeRoyalties.toFixed(2)} €</td>
                  <td className="px-3 py-3 text-right text-orange-500">{c.apporteurTTC > 0 ? `- ${c.apporteurTTC.toFixed(2)} €` : '—'}</td>
                  <td className="px-3 py-3 text-right text-blue-600">{fmt(c.gainsAgentePrevi)}</td>
                  <td className="px-3 py-3 text-right text-purple-600">{fmt(c.netAdminPrevi)}</td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400 text-sm">Aucune donnée</td></tr>
            )}
          </tbody>
          <tfoot className="bg-gray-50 border-t-2 border-gray-300 font-bold">
            <tr>
              <td className="px-3 py-3">Total</td>
              {tdR(fmt(rows.reduce((s, [, c]) => s + c.fraisTTC, 0)))}
              {tdR(fmt(rows.reduce((s, [, c]) => s + c.comTTC, 0)))}
              {tdR(fmt(rows.reduce((s, [, c]) => s + c.honorairesTotalTTC, 0)))}
              <td className="px-3 py-3 text-right text-red-400">- {rows.reduce((s, [, c]) => s + c.sommeRoyalties, 0).toFixed(2)} €</td>
              <td className="px-3 py-3 text-right text-orange-500">- {rows.reduce((s, [, c]) => s + c.apporteurTTC, 0).toFixed(2)} €</td>
              <td className="px-3 py-3 text-right text-blue-600">{fmt(rows.reduce((s, [, c]) => s + c.gainsAgentePrevi, 0))}</td>
              <td className="px-3 py-3 text-right text-purple-600">{fmt(rows.reduce((s, [, c]) => s + c.netAdminPrevi, 0))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    )
  }

  const renderTousAnnee = () => {
    const rows = agrégerAnnee(dossiers)
    return (
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {thL('Année')}
              {thR('Frais consul. TTC')}
              {thR('Commission TTC')}
              {thR('Honoraire TTC')}
              {thR('Somme royalties')}
              {thR('Apporteur')}
              {thR('Part agentes')}
              {thR(nomFranchisee)}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(([annee, c]) => (
              <tr key={annee} className="hover:bg-gray-50">
                <td className="px-3 py-3 font-bold text-gray-800">{annee}</td>
                {tdR(fmt(c.fraisTTC))}
                {tdR(fmt(c.comTTC))}
                {tdR(fmt(c.honorairesTotalTTC))}
                <td className="px-3 py-3 text-right text-red-400">- {c.sommeRoyalties.toFixed(2)} €</td>
                <td className="px-3 py-3 text-right text-orange-500">{c.apporteurTTC > 0 ? `- ${c.apporteurTTC.toFixed(2)} €` : '—'}</td>
                <td className="px-3 py-3 text-right text-blue-600">{fmt(c.gainsAgentePrevi)}</td>
                <td className="px-3 py-3 text-right text-purple-600">{fmt(c.netAdminPrevi)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400 text-sm">Aucune donnée</td></tr>
            )}
          </tbody>
        </table>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RÉCAP & DÉTAIL CTP (admin)
  // ─────────────────────────────────────────────────────────────────────────────

  const renderRecapCTP = () => (
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
        <p className="font-medium text-green-800 mb-3">📥 Encaissements CTP</p>
        <div className="flex justify-between text-sm"><span className="text-gray-600">Commissions artisans (net)</span><span className="font-medium text-green-700">+ {totalCommissionsCTP.toFixed(2)} €</span></div>
        <div className="flex justify-between text-sm"><span className="text-gray-600">Honoraires client</span><span className="font-medium text-green-700">+ {totalHonorairesCTP.toFixed(2)} €</span></div>
        <div className="flex justify-between text-sm"><span className="text-gray-600">Frais de consultation</span><span className="font-medium text-green-700">+ {totalFraisCTP.toFixed(2)} €</span></div>
        <div className="flex justify-between text-sm"><span className="text-gray-600">Redevances agentes reçues</span><span className="font-medium text-green-700">+ {totalRedevancesReglees.toFixed(2)} €</span></div>
        <div className="flex justify-between text-sm border-t border-green-200 pt-2 font-bold">
          <span>Total</span>
          <span className="text-green-700">+ {encCTP.toFixed(2)} €</span>
        </div>
      </div>

      <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
        <p className="font-medium text-red-800 mb-3">📤 Décaissements CTP</p>
        <div className="flex justify-between text-sm"><span className="text-gray-600">Part agentes (à verser)</span><span className="font-medium text-red-500">- {totalGainsAgentesReels.toFixed(2)} €</span></div>
        <div className="flex justify-between text-sm"><span className="text-gray-600">Apporteur d'affaires</span><span className="font-medium text-red-500">- {totalApporteurTTC.toFixed(2)} €</span></div>
        <div className="flex justify-between text-sm border-t border-red-200 pt-2 font-bold">
          <span>Total</span>
          <span className="text-red-500">- {decCTP.toFixed(2)} €</span>
        </div>
      </div>

      <div className={`col-span-2 border rounded-xl p-4 ${netCTP >= 0 ? 'bg-purple-50 border-purple-200' : 'bg-red-50 border-red-200'}`}>
        <div className="flex justify-between items-center">
          <span className="font-bold text-purple-900">Net CTP</span>
          <span className={`font-bold text-2xl ${netCTP >= 0 ? 'text-green-700' : 'text-red-600'}`}>
            {netCTP.toFixed(2)} €
          </span>
        </div>
      </div>
    </div>
  )

  const renderDetailCTP = () => (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="p-4 border-b border-gray-100">
        <p className="font-medium text-gray-800">Détail par chantier</p>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            {thL('Chantier')}
            {thL('Référente')}
            {thR('Frais consul. TTC')}
            {thR('Commission TTC')}
            {thR('Honoraire TTC')}
            {thR('Somme royalties')}
            {thR('Apporteur')}
            {thR('Part agente')}
            {thR(nomFranchisee)}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {dossiers.map(d => {
            const c = calculer(d)
            if (c.comTTC === 0 && c.fraisTTC === 0 && c.honorairesTotalTTC === 0) return null
            return (
              <tr key={d.id} className="hover:bg-gray-50">
                <td className="px-3 py-3">
                  <p className="font-medium text-blue-900">{d.reference}</p>
                  <p className="text-xs text-gray-400">{d.client?.prenom} {d.client?.nom}</p>
                </td>
                <td className="px-3 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    c.estChantierMarine ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {c.estChantierMarine ? nomFranchisee : nomReferente(d)}
                  </span>
                </td>
                {tdR(fmt(c.fraisTTC))}
                {tdR(fmt(c.comTTC))}
                {tdR(fmt(c.honorairesTotalTTC))}
                <td className="px-3 py-3 text-right text-red-400">- {c.sommeRoyalties.toFixed(2)} €</td>
                <td className="px-3 py-3 text-right text-orange-500">{c.apporteurTTC > 0 ? `- ${c.apporteurTTC.toFixed(2)} €` : '—'}</td>
                <td className="px-3 py-3 text-right text-blue-500">{c.gainsAgentePrevi > 0 ? fmt(c.gainsAgentePrevi) : '—'}</td>
                {tdTotal(c.netAdminPrevi)}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  const renderCTPMois = () => {
    const rowsDossiers = agrégerMois(dossiers)
    const toutes_cles  = new Set([
      ...rowsDossiers.map(([k]) => k),
      ...redevances.filter(r => r.statut === 'regle').map(r => `${r.annee}-${String(r.mois).padStart(2, '0')}`),
    ])
    const cles = Array.from(toutes_cles).sort((a, b) => b.localeCompare(a))

    return (
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {thL('Mois')}
              {thR('Frais consul. TTC')}
              {thR('Commission TTC')}
              {thR('Honoraire TTC')}
              {thR('Redevance')}
              {thR('Somme royalties')}
              {thR('Apporteur')}
              {thR('Total')}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {cles.map(key => {
              const [annee, mois] = key.split('-')
              const c = rowsDossiers.find(([k]) => k === key)?.[1] || {}
              const redevMontant = redevances
                .filter(r => r.statut === 'regle' && r.annee === parseInt(annee) && r.mois === parseInt(mois))
                .reduce((s, r) => s + (r.montant_ttc || 540), 0)
              const total = (c.fraisTTC || 0) + (c.comTTC || 0) + (c.honorairesTotalTTC || 0) + redevMontant
                - (c.sommeRoyalties || 0) - (c.gainsAgenteReels || 0) - (c.apporteurTTC || 0)
              return (
                <tr key={key} className="hover:bg-gray-50">
                  <td className="px-3 py-3 font-medium">{MOIS[parseInt(mois)]} {annee}</td>
                  {tdR(fmt(c.fraisTTC))}
                  {tdR(fmt(c.comTTC))}
                  {tdR(fmt(c.honorairesTotalTTC))}
                  <td className="px-3 py-3 text-right text-green-600">{redevMontant > 0 ? `+ ${redevMontant.toFixed(2)} €` : '—'}</td>
                  <td className="px-3 py-3 text-right text-red-400">- {(c.sommeRoyalties || 0).toFixed(2)} €</td>
                  <td className="px-3 py-3 text-right text-orange-500">{(c.apporteurTTC || 0) > 0 ? `- ${c.apporteurTTC.toFixed(2)} €` : '—'}</td>
                  {tdTotal(total)}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  const renderCTPAnnee = () => {
    const rowsDossiers  = agrégerAnnee(dossiers)
    const toutes_annees = new Set([
      ...rowsDossiers.map(([k]) => k),
      ...redevances.filter(r => r.statut === 'regle').map(r => String(r.annee)),
    ])
    const annees = Array.from(toutes_annees).sort((a, b) => b - a)

    return (
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {thL('Année')}
              {thR('Frais consul. TTC')}
              {thR('Commission TTC')}
              {thR('Honoraire TTC')}
              {thR('Redevance')}
              {thR('Somme royalties')}
              {thR('Apporteur')}
              {thR('Total')}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {annees.map(annee => {
              const c = rowsDossiers.find(([k]) => k === annee)?.[1] || {}
              const redevAnnee = redevances
                .filter(r => r.statut === 'regle' && r.annee === parseInt(annee))
                .reduce((s, r) => s + (r.montant_ttc || 540), 0)
              const total = (c.fraisTTC || 0) + (c.comTTC || 0) + (c.honorairesTotalTTC || 0) + redevAnnee
                - (c.sommeRoyalties || 0) - (c.gainsAgenteReels || 0) - (c.apporteurTTC || 0)
              return (
                <tr key={annee} className="hover:bg-gray-50">
                  <td className="px-3 py-3 font-bold text-gray-800">{annee}</td>
                  {tdR(fmt(c.fraisTTC))}
                  {tdR(fmt(c.comTTC))}
                  {tdR(fmt(c.honorairesTotalTTC))}
                  <td className="px-3 py-3 text-right text-green-600">{redevAnnee > 0 ? `+ ${redevAnnee.toFixed(2)} €` : '—'}</td>
                  <td className="px-3 py-3 text-right text-red-400">- {(c.sommeRoyalties || 0).toFixed(2)} €</td>
                  <td className="px-3 py-3 text-right text-orange-500">{(c.apporteurTTC || 0) > 0 ? `- ${c.apporteurTTC.toFixed(2)} €` : '—'}</td>
                  {tdTotal(total)}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ONGLET AGENTES (vue franchisée)
  // ─────────────────────────────────────────────────────────────────────────────

  const renderRecapAgente = (listeDossiers, listeRedevances, agente) => {
    const nom         = agente ? `${agente.prenom} ${agente.nom}` : 'Agente'
    const gainsReels  = listeDossiers.reduce((s, d) => s + calculer(d).gainsAgenteReels, 0)
    const gainsPrevi  = listeDossiers.reduce((s, d) => s + calculer(d).gainsAgentePrevi, 0)
    const apporteurDu = listeDossiers.reduce((s, d) => s + calculer(d).apporteurPartAgente, 0)
    const redevReglees = listeRedevances.filter(r => r.statut === 'regle').reduce((s, r) => s + (r.montant_ttc || 540), 0)
    const net = gainsReels - redevReglees - apporteurDu

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
            <p className="font-medium text-green-800 mb-3">📥 Gains {nom}</p>
            <div className="flex justify-between text-sm"><span className="text-gray-600">Gains réels</span><span className="font-medium text-green-700">+ {gainsReels.toFixed(2)} €</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-600">Gains prévisionnels</span><span className="font-medium text-gray-500">({gainsPrevi.toFixed(2)} €)</span></div>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
            <p className="font-medium text-red-800 mb-3">📤 Décaissements {nom}</p>
            <div className="flex justify-between text-sm"><span className="text-gray-600">Redevances CTP</span><span className="font-medium text-red-500">- {redevReglees.toFixed(2)} €</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-600">Part apporteur à rembourser</span><span className="font-medium text-red-500">- {apporteurDu.toFixed(2)} €</span></div>
            <div className="flex justify-between text-sm border-t border-red-200 pt-2 font-bold">
              <span>Total</span>
              <span className="text-red-500">- {(redevReglees + apporteurDu).toFixed(2)} €</span>
            </div>
          </div>

          <div className={`col-span-2 border rounded-xl p-4 ${net >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200'}`}>
            <div className="flex justify-between items-center">
              <span className="font-bold text-blue-900">Net {nom}</span>
              <span className={`font-bold text-2xl ${net >= 0 ? 'text-green-700' : 'text-red-600'}`}>{net.toFixed(2)} €</span>
            </div>
          </div>
        </div>

        {/* Ce que la franchisée doit verser */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <p className="font-semibold text-blue-800">💸 Ce que {nomFranchisee} (CTP) doit verser à {nom}</p>
          <p className="text-xs text-gray-500">Part agente sur les commissions et frais de ses chantiers</p>
          {listeDossiers.map(d => {
            const c = calculer(d)
            if (c.gainsAgenteReels === 0) return null
            return (
              <div key={d.id} className="flex items-center justify-between py-1 border-b border-blue-100 last:border-0">
                <div>
                  <p className="text-sm font-medium text-blue-900">{d.reference}</p>
                  <p className="text-xs text-gray-400">{d.client?.prenom} {d.client?.nom}</p>
                </div>
                <span className="text-sm font-medium text-blue-700">+ {c.gainsAgenteReels.toFixed(2)} €</span>
              </div>
            )
          })}
          <div className="flex justify-between font-bold border-t border-blue-200 pt-2">
            <span className="text-blue-800">Total à verser à {nom}</span>
            <span className="text-blue-700 text-lg">{gainsReels.toFixed(2)} €</span>
          </div>
        </div>

        {/* Ce que l'agente doit verser */}
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-3">
          <p className="font-semibold text-purple-800">💸 Ce que {nom} doit verser à {nomFranchisee} (CTP)</p>
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-600">Redevances mensuelles</p>
            {(() => {
              const now      = new Date()
              const moisDu   = now.getMonth() === 0 ? 12 : now.getMonth()
              const anneeDu  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
              const redevDuMois = listeRedevances.find(r => r.mois === moisDu && r.annee === anneeDu)

              if (!redevDuMois || redevDuMois.statut === 'regle') {
                return <p className="text-xs text-green-600">✅ Redevance du mois réglée</p>
              }
              return [(
                <div key={redevDuMois.id} className="flex items-center justify-between py-1 border-b border-purple-100">
                  <p className="text-sm text-gray-700">{MOIS[redevDuMois.mois]} {redevDuMois.annee}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{(redevDuMois.montant_ttc || 540).toFixed(2)} €</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">⏳ À payer</span>
                  </div>
                </div>
              )]
            })()}

            {listeDossiers.filter(d => calculer(d).apporteurPartAgente > 0).length > 0 && (
              <>
                <p className="text-xs font-medium text-gray-600 pt-2">Remboursements apporteur</p>
                {listeDossiers.filter(d => calculer(d).apporteurPartAgente > 0).map(d => {
                  const c      = calculer(d)
                  const suivi  = getSuivi(d, 'apporteur_agente')
                  return (
                    <div key={d.id} className="flex items-center justify-between py-1 border-b border-purple-100">
                      <p className="text-sm text-gray-700">{d.reference} — {d.client?.apporteur_nom}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-orange-600">{c.apporteurPartAgente.toFixed(2)} €</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          suivi?.statut_ctp === 'rembourse' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {suivi?.statut_ctp === 'rembourse' ? '✅ Remboursé' : '⏳ À rembourser'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </div>
          <div className="flex justify-between font-bold border-t border-purple-200 pt-2">
            <span className="text-purple-800">Total {nom} doit à {nomFranchisee}</span>
            <span className="text-purple-700 text-lg">{(redevReglees + apporteurDu).toFixed(2)} €</span>
          </div>
        </div>
      </div>
    )
  }

  const renderDetailAgenteAdmin = (listeDossiers, nom) => {
    const gainsReels  = listeDossiers.reduce((s, d) => s + calculer(d).gainsAgenteReels, 0)
    const apporteurDu = listeDossiers.reduce((s, d) => s + calculer(d).apporteurPartAgente, 0)
    return (
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <p className="font-medium text-gray-800">Détail par chantier — {nom}</p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {thL('Chantier')}
              {thR('Gain')}
              {thR('Apporteur')}
              {thR('Réel')}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {listeDossiers.map(d => {
              const c = calculer(d)
              if (c.gainsAgentePrevi === 0 && c.gainsAgenteReels === 0) return null
              return (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-3 py-3">
                    <p className="font-medium text-blue-900">{d.reference}</p>
                    <p className="text-xs text-gray-400">{d.client?.prenom} {d.client?.nom}</p>
                  </td>
                  <td className="px-3 py-3 text-right text-green-600">+ {c.gainsAgenteReels.toFixed(2)} €</td>
                  <td className="px-3 py-3 text-right text-orange-500">{c.apporteurPartAgente > 0 ? `- ${c.apporteurPartAgente.toFixed(2)} €` : '—'}</td>
                  {tdTotal(c.gainsAgenteReels - c.apporteurPartAgente)}
                </tr>
              )
            })}
          </tbody>
          <tfoot className="bg-gray-50 border-t border-gray-200">
            <tr>
              <td className="px-3 py-3 font-medium">Total</td>
              <td className="px-3 py-3 text-right text-green-600">+ {fmt(gainsReels)}</td>
              <td className="px-3 py-3 text-right text-orange-500">- {fmt(apporteurDu)}</td>
              <td className="px-3 py-3 text-right font-bold text-blue-700">{fmt(gainsReels - apporteurDu)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    )
  }

  const renderAgenteMois = (listeDossiers, listeRedevances) => {
    const rowsDossiers = agrégerMois(listeDossiers)
    const toutes_cles  = new Set([
      ...rowsDossiers.map(([k]) => k),
      ...listeRedevances.filter(r => r.statut === 'regle').map(r => `${r.annee}-${String(r.mois).padStart(2, '0')}`),
    ])
    const cles = Array.from(toutes_cles).sort((a, b) => b.localeCompare(a))

    return (
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {thL('Mois')}
              {thR('Gain')}
              {thR('Redevance CTP')}
              {thR('Apporteur')}
              {thR('Total')}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {cles.map(key => {
              const [annee, mois] = key.split('-')
              const c = rowsDossiers.find(([k]) => k === key)?.[1] || { gainsAgenteReels: 0, apporteurPartAgente: 0 }
              const redevMontant = listeRedevances
                .filter(r => r.statut === 'regle' && r.annee === parseInt(annee) && r.mois === parseInt(mois))
                .reduce((s, r) => s + (r.montant_ttc || 540), 0)
              const reel = (c.gainsAgenteReels || 0) - redevMontant - (c.apporteurPartAgente || 0)
              return (
                <tr key={key} className="hover:bg-gray-50">
                  <td className="px-3 py-3 font-medium">{MOIS[parseInt(mois)]} {annee}</td>
                  <td className="px-3 py-3 text-right text-green-600">+ {(c.gainsAgenteReels || 0).toFixed(2)} €</td>
                  <td className="px-3 py-3 text-right text-red-400">{redevMontant > 0 ? `- ${redevMontant.toFixed(2)} €` : '—'}</td>
                  <td className="px-3 py-3 text-right text-orange-500">{(c.apporteurPartAgente || 0) > 0 ? `- ${c.apporteurPartAgente.toFixed(2)} €` : '—'}</td>
                  {tdTotal(reel)}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  const renderAgenteAnnee = (listeDossiers, listeRedevances) => {
    const rowsDossiers  = agrégerAnnee(listeDossiers)
    const toutes_annees = new Set([
      ...rowsDossiers.map(([k]) => k),
      ...listeRedevances.filter(r => r.statut === 'regle').map(r => String(r.annee)),
    ])
    const annees = Array.from(toutes_annees).sort((a, b) => b - a)

    return (
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {thL('Année')}
              {thR('Gain')}
              {thR('Redevances CTP')}
              {thR('Apporteur')}
              {thR('Total')}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {annees.map(annee => {
              const c = rowsDossiers.find(([k]) => k === annee)?.[1] || { gainsAgenteReels: 0, apporteurPartAgente: 0 }
              const redevAnnee = listeRedevances
                .filter(r => r.statut === 'regle' && r.annee === parseInt(annee))
                .reduce((s, r) => s + (r.montant_ttc || 540), 0)
              const reel = (c.gainsAgenteReels || 0) - redevAnnee - (c.apporteurPartAgente || 0)
              return (
                <tr key={annee} className="hover:bg-gray-50">
                  <td className="px-3 py-3 font-bold text-gray-800">{annee}</td>
                  <td className="px-3 py-3 text-right text-green-600">+ {(c.gainsAgenteReels || 0).toFixed(2)} €</td>
                  <td className="px-3 py-3 text-right text-red-400">- {redevAnnee.toFixed(2)} €</td>
                  <td className="px-3 py-3 text-right text-orange-500">{(c.apporteurPartAgente || 0) > 0 ? `- ${c.apporteurPartAgente.toFixed(2)} €` : '—'}</td>
                  {tdTotal(reel)}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // VUE AGENTE (ses propres données)
  // ─────────────────────────────────────────────────────────────────────────────

  const renderRecapMoi = () => (
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
        <p className="font-medium text-green-800 mb-3">📥 Mes encaissements</p>
        <div className="flex justify-between text-sm"><span className="text-gray-600">Part honoraires (courtage/AMO)</span><span className="font-medium text-green-700">+ {mesDossiers.reduce((s, d) => s + calculer(d).partAgenteHonoraires, 0).toFixed(2)} €</span></div>
        <div className="flex justify-between text-sm"><span className="text-gray-600">Part commissions artisans</span><span className="font-medium text-green-700">+ {mesDossiers.reduce((s, d) => s + calculer(d).partAgente, 0).toFixed(2)} €</span></div>
        <div className="flex justify-between text-sm"><span className="text-gray-600">Part frais de consultation</span><span className="font-medium text-green-700">+ {mesDossiers.reduce((s, d) => s + calculer(d).fraisPartAgente, 0).toFixed(2)} €</span></div>
        <div className="flex justify-between text-sm border-t border-green-200 pt-2 font-bold">
          <span>Total brut prévisionnel</span>
          <span className="text-green-700">+ {mesDossiersGainsBruts.toFixed(2)} €</span>
        </div>
      </div>

      <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
        <p className="font-medium text-red-800 mb-3">📤 Mes décaissements</p>
        <div className="flex justify-between text-sm"><span className="text-gray-600">Part apporteur à rembourser</span><span className="font-medium text-red-500">- {mesApporteurDu.toFixed(2)} €</span></div>
        <div className="flex justify-between text-sm border-t border-red-200 pt-2 font-bold">
          <span>Total</span>
          <span className="text-red-500">- {mesApporteurDu.toFixed(2)} €</span>
        </div>
      </div>

      <div className="col-span-2 bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex justify-between items-center">
          <span className="font-bold text-blue-900">Gains nets prévisionnels (hors redevances)</span>
          <span className="font-bold text-2xl text-green-700">{(mesDossiersGainsPrevi - mesApporteurDu).toFixed(2)} €</span>
        </div>
        <p className="text-xs text-gray-400 mt-1">Les redevances sont visibles dans les onglets "Par mois" et "Par année"</p>
      </div>
    </div>
  )

  const renderDetailFinancierMoi = () => (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="p-4 border-b border-gray-100">
        <p className="font-medium text-gray-800">Détail par chantier — Ma part</p>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            {thL('Chantier')}
            {thR('Frais consul.')}
            {thR('Commissions')}
            {thR('Honoraires')}
            {thR('Apporteur')}
            {thR('Ma part')}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {mesDossiers.map(d => {
            const c = calculer(d)
            if (c.gainsAgentePrevi === 0 && c.gainsAgenteReels === 0) return null
            return (
              <tr key={d.id} className="hover:bg-gray-50">
                <td className="px-3 py-3">
                  <p className="font-medium text-blue-900">{d.reference}</p>
                  <p className="text-xs text-gray-400">{d.client?.prenom} {d.client?.nom}</p>
                </td>
                {tdR(fmt(c.fraisPartAgente))}
                {tdR(fmt(c.partAgente))}
                {tdR(fmt(c.partAgenteHonoraires))}
                <td className="px-3 py-3 text-right text-orange-500">{c.apporteurPartAgente > 0 ? `- ${c.apporteurPartAgente.toFixed(2)} €` : '—'}</td>
                {tdTotal(c.gainsAgentePrevi)}
              </tr>
            )
          })}
        </tbody>
        <tfoot className="bg-gray-50 border-t border-gray-200">
          <tr>
            <td className="px-3 py-3 font-medium">Total</td>
            {tdR(fmt(mesDossiers.reduce((s, d) => s + calculer(d).fraisPartAgente, 0)))}
            {tdR(fmt(mesDossiers.reduce((s, d) => s + calculer(d).partAgente, 0)))}
            {tdR(fmt(mesDossiers.reduce((s, d) => s + calculer(d).partAgenteHonoraires, 0)))}
            <td className="px-3 py-3 text-right text-orange-500">- {fmt(mesApporteurDu)}</td>
            {tdTotal(mesDossiersGainsPrevi)}
          </tr>
        </tfoot>
      </table>
    </div>
  )

  const renderSuiviFinancierMoiMois = () => {
    const rows = agrégerMois(mesDossiers)
    const toutes_cles = new Set([
      ...rows.map(([k]) => k),
      ...mesRedevances.filter(r => r.statut === 'regle').map(r => `${r.annee}-${String(r.mois).padStart(2, '0')}`),
    ])
    const cles = Array.from(toutes_cles).sort((a, b) => b.localeCompare(a))

    return (
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {thL('Mois')}
              {thR('Frais consul.')}
              {thR('Commissions')}
              {thR('Honoraires')}
              {thR('Apporteur')}
              {thR('Redevance CTP')}
              {thR('Total')}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {cles.map(key => {
              const [annee, mois] = key.split('-')
              const c = rows.find(([k]) => k === key)?.[1] || {}
              const redevMontant = mesRedevances
                .filter(r => r.statut === 'regle' && r.annee === parseInt(annee) && r.mois === parseInt(mois))
                .reduce((s, r) => s + (r.montant_ttc || 540), 0)
              const total = (c.gainsAgentePrevi || 0) - redevMontant
              return (
                <tr key={key} className="hover:bg-gray-50">
                  <td className="px-3 py-3 font-medium">{MOIS[parseInt(mois)]} {annee}</td>
                  {tdR(fmt(c.fraisPartAgente))}
                  {tdR(fmt(c.partAgente))}
                  {tdR(fmt(c.partAgenteHonoraires))}
                  <td className="px-3 py-3 text-right text-orange-500">{(c.apporteurPartAgente || 0) > 0 ? `- ${c.apporteurPartAgente.toFixed(2)} €` : '—'}</td>
                  <td className="px-3 py-3 text-right text-red-400">{redevMontant > 0 ? `- ${redevMontant.toFixed(2)} €` : '—'}</td>
                  {tdTotal(total)}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  const renderSuiviFinancierMoiAnnee = () => {
    const rows = agrégerAnnee(mesDossiers)
    const toutes_annees = new Set([
      ...rows.map(([k]) => k),
      ...mesRedevances.filter(r => r.statut === 'regle').map(r => String(r.annee)),
    ])
    const annees = Array.from(toutes_annees).sort((a, b) => b - a)

    return (
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {thL('Année')}
              {thR('Frais consul.')}
              {thR('Commissions')}
              {thR('Honoraires')}
              {thR('Apporteur')}
              {thR('Redevance CTP')}
              {thR('Total')}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {annees.map(annee => {
              const c = rows.find(([k]) => k === annee)?.[1] || {}
              const redevAnnee = mesRedevances
                .filter(r => r.statut === 'regle' && r.annee === parseInt(annee))
                .reduce((s, r) => s + (r.montant_ttc || 540), 0)
              const total = (c.gainsAgentePrevi || 0) - redevAnnee
              return (
                <tr key={annee} className="hover:bg-gray-50">
                  <td className="px-3 py-3 font-bold text-gray-800">{annee}</td>
                  {tdR(fmt(c.fraisPartAgente))}
                  {tdR(fmt(c.partAgente))}
                  {tdR(fmt(c.partAgenteHonoraires))}
                  <td className="px-3 py-3 text-right text-orange-500">{(c.apporteurPartAgente || 0) > 0 ? `- ${c.apporteurPartAgente.toFixed(2)} €` : '—'}</td>
                  <td className="px-3 py-3 text-right text-red-400">- {redevAnnee.toFixed(2)} €</td>
                  {tdTotal(total)}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // FACTURATION (vue agente)
  // ─────────────────────────────────────────────────────────────────────────────

  const renderFacturationMoi = () => (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-sm font-medium text-blue-800 mb-1">📋 Ce que tu dois facturer à {nomFranchisee} (CTP)</p>
        <p className="text-xs text-gray-500">Frais de consultation réglés + commissions sur devis signés + honoraires réglés</p>
      </div>

      {mesDossiers.map(d => {
        const c     = calculer(d)
        const items = []

        if (d.frais_statut === 'regle' && c.fraisPartAgente > 0) {
          items.push({ label: 'Frais de consultation', montant: c.fraisPartAgente, type: 'frais' })
        }
        c.commissionsSignees.forEach(item => {
          if (item.netAgente > 0) {
            items.push({
              label:  `Commission ${item.artisan?.entreprise || 'Artisan'}`,
              montant: item.netAgente,
              type:   'commission',
              date:    item.date_signature,
            })
          }
        })
        if (getSuivi(d, 'honoraires_courtage')?.statut_client === 'regle' && c.partAgenteCourtage > 0) {
          items.push({ label: 'Honoraires courtage', montant: c.partAgenteCourtage, type: 'honoraire' })
        }
        if (d.typologie === 'amo' && getSuivi(d, 'solde_amo')?.statut_client === 'regle' && c.partAgenteAMO > 0) {
          items.push({ label: 'Honoraires AMO solde', montant: c.partAgenteAMO, type: 'honoraire' })
        }
        if (items.length === 0) return null

        return (
          <div key={d.id} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <p className="font-medium text-blue-900">{d.reference}</p>
              <p className="text-sm text-gray-500">{d.client?.prenom} {d.client?.nom}</p>
            </div>
            <div className="space-y-1">
              {items.map((item, i) => (
                <div key={i} className="flex items-center justify-between py-1 border-b border-gray-100 last:border-0">
                  <div>
                    <p className="text-sm text-gray-700">{item.label}</p>
                    {item.date && <p className="text-xs text-gray-400">Signé le {new Date(item.date).toLocaleDateString('fr-FR')}</p>}
                  </div>
                  <span className={`text-sm font-medium ${
                    item.type === 'frais'     ? 'text-purple-700' :
                    item.type === 'honoraire' ? 'text-green-700'  :
                    'text-blue-700'
                  }`}>
                    {item.montant.toFixed(2)} €
                  </span>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-sm font-bold border-t border-gray-200 pt-2">
              <span>Total à facturer</span>
              <span className="text-blue-700">{items.reduce((s, i) => s + i.montant, 0).toFixed(2)} €</span>
            </div>
          </div>
        )
      })}

      {(() => {
        const now      = new Date()
        const moisDu   = now.getMonth() === 0 ? 12 : now.getMonth()
        const anneeDu  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
        const redevDuMois = mesRedevances.find(r => r.mois === moisDu && r.annee === anneeDu)

        if (!redevDuMois || redevDuMois.statut === 'regle') {
          return (
            <div className="flex justify-between text-sm text-green-600">
              <span>Redevance {MOIS[moisDu]} {anneeDu}</span>
              <span className="font-medium">✅ Réglée</span>
            </div>
          )
        }
        return (
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Redevance {MOIS[moisDu]} {anneeDu} — à payer</span>
            <span className="font-medium text-amber-600">{(redevDuMois.montant_ttc || 540).toFixed(2)} €</span>
          </div>
        )
      })()}
    </div>
  )

  const renderFacturationMoisSuivi = () => {
    const rows = agrégerMois(mesDossiers)
    if (rows.length === 0) return <p className="text-center text-gray-400 text-sm py-8">Aucune donnée</p>

    return (
      <div className="space-y-4">
        {succes && <p className="text-green-600 text-sm bg-green-50 border border-green-200 rounded-lg px-4 py-2">{succes}</p>}
        {erreur && <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-2">{erreur}</p>}

        {rows.map(([key, c]) => {
          const [anneeStr, moisStr] = key.split('-')
          const annee          = parseInt(anneeStr)
          const mois           = parseInt(moisStr)
          const label          = `${MOIS[mois]} ${annee}`
          const totalAFacturer = round2(c.fraisPartAgente + (c.partAgente - c.apporteurPartAgente) + c.partAgenteHonoraires)
          const facture        = getFactureAgenteMois(mois, annee)
          const statut         = facture?.statut || 'a_facturer'
          const cleUpload      = `${annee}-${mois}`

          const items = []
          if (c.fraisPartAgente > 0)                         items.push({ label: 'Frais de consultation', montant: c.fraisPartAgente, color: 'text-purple-700' })
          if ((c.partAgente - c.apporteurPartAgente) > 0)    items.push({ label: 'Commissions artisans',  montant: c.partAgente - c.apporteurPartAgente, color: 'text-blue-700' })
          if (c.partAgenteHonoraires > 0)                    items.push({ label: 'Honoraires',             montant: c.partAgenteHonoraires, color: 'text-green-700' })

          return (
            <div key={key} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                <span className="font-semibold text-gray-800">{label}</span>
                <span className="font-bold text-blue-700">{totalAFacturer.toFixed(2)} €</span>
              </div>
              <div className="p-4 space-y-3">
                <div className="space-y-1">
                  {items.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-gray-600">{item.label}</span>
                      <span className={`font-medium ${item.color}`}>{item.montant.toFixed(2)} €</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3 pt-2 border-t border-gray-100 flex-wrap">
                  <select
                    value={statut}
                    onChange={e => upsertFactureAgenteMois(mois, annee, totalAFacturer, { statut: e.target.value })}
                    className={`border rounded px-2 py-1 text-xs focus:outline-none ${
                      statut === 'paye'    ? 'border-green-300 bg-green-50 text-green-700' :
                      statut === 'facture' ? 'border-blue-300  bg-blue-50  text-blue-700'  :
                      'border-gray-200 text-gray-600'
                    }`}
                  >
                    <option value="a_facturer">📋 À facturer</option>
                    <option value="facture">📤 Facturé</option>
                    <option value="paye">✅ Payé</option>
                  </select>

                  {facture?.facture_path ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          const { data } = await supabase.storage.from('documents').createSignedUrl(facture.facture_path, 3600)
                          if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                        }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        📄 Voir facture
                      </button>
                      <label className="text-xs text-gray-400 cursor-pointer hover:text-blue-600">
                        Remplacer
                        <input
                          type="file" accept=".pdf" className="hidden"
                          onChange={e => e.target.files[0] && uploadFactureAgentePdf(mois, annee, totalAFacturer, e.target.files[0])}
                        />
                      </label>
                    </div>
                  ) : (
                    <label className={`text-xs cursor-pointer px-2 py-1 rounded border transition-all ${
                      uploadingFactureAgente === cleUpload
                        ? 'text-gray-400 border-gray-200'
                        : 'text-blue-600 border-blue-200 hover:bg-blue-50'
                    }`}>
                      {uploadingFactureAgente === cleUpload ? 'Upload...' : '+ Uploader ma facture'}
                      <input
                        type="file" accept=".pdf" className="hidden"
                        disabled={uploadingFactureAgente === cleUpload}
                        onChange={e => e.target.files[0] && uploadFactureAgentePdf(mois, annee, totalAFacturer, e.target.files[0])}
                      />
                    </label>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Total à facturer</span>
            <span className="font-medium">
              {rows.reduce((s, [, c]) => s + c.fraisPartAgente + (c.partAgente - c.apporteurPartAgente) + c.partAgenteHonoraires, 0).toFixed(2)} €
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-green-600">Dont payé</span>
            <span className="font-medium text-green-700">
              {rows
                .filter(([key]) => {
                  const [a, m] = key.split('-').map(Number)
                  return getFactureAgenteMois(m, a)?.statut === 'paye'
                })
                .reduce((s, [, c]) => s + c.fraisPartAgente + (c.partAgente - c.apporteurPartAgente) + c.partAgenteHonoraires, 0)
                .toFixed(2)} €
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-amber-600">Dont facturé (en attente paiement)</span>
            <span className="font-medium text-amber-700">
              {rows
                .filter(([key]) => {
                  const [a, m] = key.split('-').map(Number)
                  return getFactureAgenteMois(m, a)?.statut === 'facture'
                })
                .reduce((s, [, c]) => s + c.fraisPartAgente + (c.partAgente - c.apporteurPartAgente) + c.partAgenteHonoraires, 0)
                .toFixed(2)} €
            </span>
          </div>
        </div>
      </div>
    )
  }

  const renderFacturationMoiTableau = (rows, colLabel) => (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="p-3 border-b border-gray-100">
          <p className="text-xs font-medium text-gray-600 uppercase">À facturer à {nomFranchisee}</p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {thL(colLabel)}
              {thR('Frais consul.')}
              {thR('Commissions')}
              {thR('Honoraires')}
              {thR('Total à facturer')}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(([key, c]) => {
              const isAnnee = !key.includes('-')
              const label   = isAnnee ? key : (() => { const [a, m] = key.split('-'); return `${MOIS[parseInt(m)]} ${a}` })()
              const total   = c.fraisPartAgente + (c.partAgente - c.apporteurPartAgente) + c.partAgenteHonoraires
              return (
                <tr key={key} className="hover:bg-gray-50">
                  <td className={`px-3 py-3 ${isAnnee ? 'font-bold' : 'font-medium'}`}>{label}</td>
                  {tdR(fmt(c.fraisPartAgente))}
                  {tdR(fmt(c.partAgente - c.apporteurPartAgente))}
                  {tdR(fmt(c.partAgenteHonoraires))}
                  {tdTotal(total)}
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-400 text-sm">Aucune donnée</td></tr>
            )}
          </tbody>
          <tfoot className="bg-gray-50 border-t-2 border-gray-300 font-bold">
            <tr>
              <td className="px-3 py-3">Total</td>
              {tdR(fmt(rows.reduce((s, [, c]) => s + c.fraisPartAgente, 0)))}
              {tdR(fmt(rows.reduce((s, [, c]) => s + c.partAgente - c.apporteurPartAgente, 0)))}
              {tdR(fmt(rows.reduce((s, [, c]) => s + c.partAgenteHonoraires, 0)))}
              {tdTotal(rows.reduce((s, [, c]) => s + c.fraisPartAgente + (c.partAgente - c.apporteurPartAgente) + c.partAgenteHonoraires, 0))}
            </tr>
          </tfoot>
        </table>
      </div>

      {(() => {
        const now      = new Date()
        const moisDu   = now.getMonth() === 0 ? 12 : now.getMonth()
        const anneeDu  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
        const redevDuMois = mesRedevances.find(r => r.mois === moisDu && r.annee === anneeDu)
        const redevMontant = (!redevDuMois || redevDuMois.statut !== 'regle') ? 540 : 0
        return (
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-sm">
            <p className="font-medium text-purple-800 mb-2">💳 À payer à {nomFranchisee}</p>
            <div className="flex justify-between">
              <span className="text-gray-600">Redevance {MOIS[moisDu]} {anneeDu}</span>
              <span className={`font-medium ${redevMontant > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                {redevMontant > 0 ? `${redevMontant.toFixed(2)} €` : '✅ Réglée'}
              </span>
            </div>
            {mesApporteurDu > 0 && (
              <div className="flex justify-between mt-1">
                <span className="text-gray-600">Apporteur</span>
                <span className="font-medium text-orange-600">- {mesApporteurDu.toFixed(2)} €</span>
              </div>
            )}
            <div className="flex justify-between font-bold border-t border-purple-200 pt-2 mt-2">
              <span className="text-purple-800">Total</span>
              <span className="text-purple-700">{(redevMontant + mesApporteurDu).toFixed(2)} €</span>
            </div>
          </div>
        )
      })()}
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────────
  // REDEVANCES
  // ─────────────────────────────────────────────────────────────────────────────

  const renderRedevances = () => {
    const anneeFiltre      = new Date().getFullYear()
    const agentesAffichees = isMarine ? agentes : agentes.filter(a => a.id === profile?.id)
    const redevAnnee       = redevances.filter(r => r.annee === anneeFiltre)
    const totalAttendu     = agentesAffichees.length * (new Date().getMonth() + 1) * 540
    const totalRegle       = redevAnnee.filter(r => r.statut === 'regle').reduce((s, r) => s + (r.montant_ttc || 540), 0)
    const totalEnAttente   = totalAttendu - totalRegle

    return (
      <div className="space-y-5">
        {/* Résumé */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total attendu',  val: totalAttendu,   color: 'text-gray-700' },
            { label: 'Total réglé',    val: totalRegle,     color: 'text-green-700' },
            { label: 'Reste à payer',  val: totalEnAttente, color: totalEnAttente > 0 ? 'text-amber-600' : 'text-green-600' },
          ].map(({ label, val, color }) => (
            <div key={label} className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">{label} {anneeFiltre}</p>
              <p className={`text-xl font-bold ${color}`}>{val.toFixed(2)} €</p>
            </div>
          ))}
        </div>

        {/* Bouton ajouter */}
        <div className="flex justify-end">
          <button
            onClick={() => setRedevModal(true)}
            className="bg-blue-800 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-900"
          >
            + Ajouter un paiement
          </button>
        </div>

        {/* Tableau par agente */}
        {agentesAffichees.map(agente => {
          const moisAttendus = genererMoisAttendus(agente.id, anneeFiltre)
          const regle        = moisAttendus.filter(m => m.redev?.statut === 'regle').length
          const enRetard     = moisAttendus.filter(m => m.enRetard).length
          const totalAnnuel  = redevances
            .filter(r => r.agente_id === agente.id && r.statut === 'regle')
            .reduce((s, r) => s + (r.montant_ttc || 540), 0)

          return (
            <div key={agente.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50">
                <div>
                  <p className="font-semibold text-gray-800">{agente.prenom} {agente.nom}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {regle}/{moisAttendus.length} mois réglés · Total annuel réglé : {totalAnnuel.toFixed(2)} €
                  </p>
                </div>
                {enRetard > 0 && (
                  <span className="bg-red-100 text-red-700 text-xs px-2.5 py-1 rounded-full font-medium">
                    ⚠️ {enRetard} retard{enRetard > 1 ? 's' : ''}
                  </span>
                )}
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
                          <span className="text-sm text-gray-600">{(redev.montant_ttc || 540).toFixed(2)} € TTC</span>
                          {redev.date_paiement && (
                            <span className="text-xs text-gray-400">{new Date(redev.date_paiement).toLocaleDateString('fr-FR')}</span>
                          )}
                          <button
                            onClick={() => toggleRedevStatut(redev.id, redev.statut)}
                            className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all ${
                              redev.statut === 'regle'
                                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                            }`}
                          >
                            {redev.statut === 'regle' ? '✅ Réglé' : '⏳ En attente'}
                          </button>
                          {isMarine && (
                            <button onClick={() => supprimerRedevance(redev.id)} className="text-gray-300 hover:text-red-400 text-xs">✕</button>
                          )}
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

        {/* Modal ajout redevance */}
        {redevModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
              <h2 className="font-semibold text-gray-800">Ajouter un paiement de redevance</h2>

              {isMarine && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Agente</label>
                  <select
                    value={redevForm.agente_id}
                    onChange={e => setRedevForm(f => ({ ...f, agente_id: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— Choisir —</option>
                    {agentes.map(a => <option key={a.id} value={a.id}>{a.prenom} {a.nom}</option>)}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mois</label>
                  <select
                    value={redevForm.mois}
                    onChange={e => setRedevForm(f => ({ ...f, mois: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {MOIS_LABELS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Année</label>
                  <input
                    type="number" value={redevForm.annee}
                    onChange={e => setRedevForm(f => ({ ...f, annee: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Montant TTC (€)</label>
                  <input
                    type="number" step="0.01" value={redevForm.montant_ttc}
                    onChange={e => setRedevForm(f => ({ ...f, montant_ttc: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
                  <select
                    value={redevForm.statut}
                    onChange={e => setRedevForm(f => ({ ...f, statut: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="en_attente">⏳ En attente</option>
                    <option value="regle">✅ Réglé</option>
                  </select>
                </div>
              </div>

              {redevForm.statut === 'regle' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date de paiement</label>
                  <input
                    type="date" value={redevForm.date_paiement}
                    onChange={e => setRedevForm(f => ({ ...f, date_paiement: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note (optionnel)</label>
                <input
                  type="text" value={redevForm.note} placeholder="ex: virement reçu le..."
                  onChange={e => setRedevForm(f => ({ ...f, note: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setRedevModal(false)}
                  className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  onClick={sauvegarderRedevance}
                  disabled={savingRedev}
                  className="flex-1 bg-blue-800 text-white py-2 rounded-lg text-sm hover:bg-blue-900 disabled:opacity-50"
                >
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
  // CONFIGURATION DES ONGLETS
  // ─────────────────────────────────────────────────────────────────────────────

  const ongletsAdmin = [
    { key: 'mes_chantiers',  label: 'Mes chantiers'     },
    { key: 'tous_chantiers', label: 'Tous les chantiers' },
    { key: 'ctp',            label: 'Suivi financier'    },
    { key: 'agentes',        label: 'Agentes'            },
    { key: 'redevances',     label: '💳 Redevances'      },
  ]

  const ongletsAgente = [
    { key: 'mes_chantiers', label: 'Mes chantiers'        },
    { key: 'financier',     label: 'Mon suivi financier'  },
    { key: 'facturation',   label: 'Facturation'          },
    { key: 'redevances',    label: '💳 Redevances'        },
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
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')} className="text-gray-400 hover:text-gray-600 text-sm">← Retour</button>
          <h1 className="text-lg font-bold text-blue-900">Finances</h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {/* Cartes résumé */}
        <div className={`grid gap-4 ${isMarine ? 'grid-cols-4' : 'grid-cols-3'}`}>
          {isMarine ? (
            <>
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs text-gray-400 mb-1">Net CTP</p>
                <p className={`text-xl font-bold ${netCTP >= 0 ? 'text-green-700' : 'text-red-600'}`}>{netCTP.toFixed(2)} €</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs text-gray-400 mb-1">Net agentes</p>
                <p className={`text-xl font-bold ${(totalGainsAgentesReels - totalRedevancesReglees - totalApporteurAgenteDu) >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                  {(totalGainsAgentesReels - totalRedevancesReglees - totalApporteurAgenteDu).toFixed(2)} €
                </p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs text-gray-400 mb-1">Redevances reçues</p>
                <p className="text-xl font-bold text-purple-700">{totalRedevancesReglees.toFixed(2)} €</p>
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
                <p className="text-xl font-bold text-gray-600">{mesDossiersGainsPrevi.toFixed(2)} €</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs text-gray-400 mb-1">Gains réels</p>
                <p className="text-xl font-bold text-blue-700">{mesDossiersGainsReels.toFixed(2)} €</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs text-gray-400 mb-1">Mon net</p>
                <p className={`text-xl font-bold ${monNet >= 0 ? 'text-green-700' : 'text-red-600'}`}>{monNet.toFixed(2)} €</p>
              </div>
            </>
          )}
        </div>

        {/* Onglets */}
        <div className="flex gap-2 border-b border-gray-200">
          {ongletsList.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setOnglet(key); setSousOnglet('chantier') }}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-all ${
                onglet === key
                  ? 'border-blue-800 text-blue-800'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── MES CHANTIERS ── */}
        {onglet === 'mes_chantiers' && (
          <div className="space-y-4">
            {renderSousOnglets()}
            {sousOnglet === 'chantier' && renderAccordeon(mesDossiers, false)}
            {sousOnglet === 'mois'     && renderMesChantiersMois(mesDossiers)}
            {sousOnglet === 'annee'    && renderMesChantiersAnnee(mesDossiers)}
          </div>
        )}

        {/* ── TOUS LES CHANTIERS (admin) ── */}
        {onglet === 'tous_chantiers' && isMarine && (
          <div className="space-y-4">
            {renderSousOnglets()}
            {sousOnglet === 'chantier' && renderAccordeon(dossiers, true)}
            {sousOnglet === 'mois'     && renderTousMois()}
            {sousOnglet === 'annee'    && renderTousAnnee()}
          </div>
        )}

        {/* ── SUIVI FINANCIER CTP (admin) ── */}
        {onglet === 'ctp' && isMarine && (
          <div className="space-y-4">
            {renderSousOnglets()}
            {sousOnglet === 'chantier' && <div className="space-y-4">{renderRecapCTP()}{renderDetailCTP()}</div>}
            {sousOnglet === 'mois'     && renderCTPMois()}
            {sousOnglet === 'annee'    && renderCTPAnnee()}
          </div>
        )}

        {/* ── AGENTES (admin) ── */}
        {onglet === 'agentes' && isMarine && (
          <div className="space-y-4">
            {renderSélecteurAgente()}
            {renderSousOnglets()}
            {sousOnglet === 'chantier' && (
              <div className="space-y-4">
                {renderRecapAgente(dossiersAgente, redevancesAgente, agenteActuelle)}
                {renderDetailAgenteAdmin(dossiersAgente, nomAgente)}
              </div>
            )}
            {sousOnglet === 'mois'  && renderAgenteMois(dossiersAgente, redevancesAgente)}
            {sousOnglet === 'annee' && renderAgenteAnnee(dossiersAgente, redevancesAgente)}
          </div>
        )}

        {/* ── MON SUIVI FINANCIER (agente) ── */}
        {onglet === 'financier' && !isMarine && (
          <div className="space-y-4">
            {renderSousOnglets()}
            {sousOnglet === 'chantier' && <div className="space-y-4">{renderRecapMoi()}{renderDetailFinancierMoi()}</div>}
            {sousOnglet === 'mois'     && renderSuiviFinancierMoiMois()}
            {sousOnglet === 'annee'    && renderSuiviFinancierMoiAnnee()}
          </div>
        )}

        {/* ── FACTURATION (agente) ── */}
        {onglet === 'facturation' && !isMarine && (
          <div className="space-y-4">
            {renderSousOnglets()}
            {sousOnglet === 'chantier' && renderFacturationMoi()}
            {sousOnglet === 'mois'     && renderFacturationMoisSuivi()}
            {sousOnglet === 'annee'    && renderFacturationMoiTableau(agrégerAnnee(mesDossiers), 'Année')}
          </div>
        )}

        {/* ── REDEVANCES ── */}
        {onglet === 'redevances' && renderRedevances()}

      </main>
    </div>
  )
}