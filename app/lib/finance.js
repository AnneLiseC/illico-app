// app/lib/finance.js
// Source de vérité unique pour tous les calculs financiers illiCO travaux

export const TVA_FRAIS = 1.2      // frais de consultation = TVA 20%
export const TVA_TRAVAUX = 1.1    // devis travaux = TVA 10% (fallback TTC si montant_ttc absent)
export const ROYALTIES_RATE = 0.05
export const COURTAGE_STANDARD = 0.06
export const AMO_STANDARD = 0.09

// ─────────────────────────────────────────────────────────────────────────────
// UTILITAIRES
// ─────────────────────────────────────────────────────────────────────────────

function toNumber(value, fallback = 0) {
  const n = typeof value === 'string' ? parseFloat(value.replace(',', '.')) : Number(value)
  return Number.isFinite(n) ? n : fallback
}

function round2(value) {
  return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100
}

function normalizePercent(value, fallback = 0) {
  const n = toNumber(value, fallback)
  if (!Number.isFinite(n)) return fallback
  if (n > 1) return n / 100
  if (n < 0) return 0
  return n
}

function split(amount, partAgente) {
  const agente = round2(amount * partAgente)
  const admin  = round2(amount - agente)
  return { agente, admin }
}

function isTruthyDate(value) {
  return Boolean(value && String(value).trim())
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCESSEURS DOSSIER
// ─────────────────────────────────────────────────────────────────────────────

export function getPartAgente(dossier) {
  const v = dossier?.part_agente
  if (v !== undefined && v !== null) return normalizePercent(v, 0)
  if (dossier?.referente?.role === 'admin') return 0
  return 0.5
}

export function getPartAdmin(dossier) {
  return round2(1 - getPartAgente(dossier))
}

export function getTauxCourtage(dossier) {
  return normalizePercent(dossier?.taux_courtage, COURTAGE_STANDARD)
}

export function getTauxAmo(dossier) {
  return normalizePercent(dossier?.taux_amo ?? dossier?.honoraires_amo_taux, AMO_STANDARD)
}

function getDevisList(dossier) {
  return Array.isArray(dossier?.devis_artisans) ? dossier.devis_artisans : []
}

// Actifs (prévisionnel) = liste BLANCHE explicite : recu, accepte, a_modifier.
// Exclut nativement en_attente (devis pas encore arrivé), refuse, et tout statut
// inconnu/null (plus robuste qu'une liste négative).
export function getActiveDevis(dossier) {
  return getDevisList(dossier).filter(dv =>
    dv?.statut === 'recu' || dv?.statut === 'accepte' || dv?.statut === 'a_modifier'
  )
}

// Signés = accepte (ou date_signature), MAIS jamais a_modifier — même avec une
// date_signature résiduelle (client signe puis demande une modif → repasse
// a_modifier ; il ne doit plus compter comme signé).
export function getSignedDevis(dossier) {
  return getActiveDevis(dossier).filter(dv =>
    dv?.statut !== 'a_modifier' &&
    (dv?.statut === 'accepte' || isTruthyDate(dv?.date_signature))
  )
}

function getSignedTotals(dossier) {
  const signed = getSignedDevis(dossier)
  const totalHT  = round2(signed.reduce((s, dv) => s + toNumber(dv.montant_ht), 0))
  const totalTTC = round2(signed.reduce((s, dv) => {
    if (dv.montant_ttc !== undefined && dv.montant_ttc !== null) return s + toNumber(dv.montant_ttc)
    return s + toNumber(dv.montant_ht) * TVA_TRAVAUX
  }, 0))
  return { signed, totalHT, totalTTC }
}

// ─────────────────────────────────────────────────────────────────────────────
// FRAIS DE CONSULTATION
// ─────────────────────────────────────────────────────────────────────────────

export function calculateFraisFinance(dossier) {
  const fraisPartAgente = dossier?.frais_part_agente != null ? normalizePercent(dossier.frais_part_agente) : dossier?.referente?.frais_part_agente_defaut != null ? normalizePercent(dossier.referente.frais_part_agente_defaut): getPartAgente(dossier)
  const fraisTTC  = round2(toNumber(dossier?.frais_consultation))
  const fraisHT   = round2(fraisTTC / TVA_FRAIS)
  const royalties = round2(fraisHT * ROYALTIES_RATE)
  const net       = round2(fraisHT - royalties)
  const parts     = split(net, fraisPartAgente)

  return {
    fraisTTC,
    fraisHT,
    royalties,
    net,
    parts: { agente: parts.agente, admin: parts.admin },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// COMMISSION PAR DEVIS
// ─────────────────────────────────────────────────────────────────────────────

export function calculateDevisFinance(devis, dossier = {}) {
  const partAgente = getPartAgente(dossier)
  const montantHT  = round2(toNumber(devis?.montant_ht))
  const montantTTC = round2(
    devis?.montant_ttc != null ? toNumber(devis.montant_ttc) : montantHT * TVA_TRAVAUX
  )
  const commissionPct  = normalizePercent(devis?.commission_pourcentage, 0)
  const comHT          = round2(montantHT * commissionPct)
  const royaltiesType2 = round2(comHT * ROYALTIES_RATE)
  const netCom         = round2(comHT - royaltiesType2)
  const parts          = split(netCom, partAgente)
  const signed         = devis?.statut !== 'a_modifier' &&
                         (devis?.statut === 'accepte' || isTruthyDate(devis?.date_signature))
  const refused        = devis?.statut === 'refuse'

  // Acompte artisan (affichage uniquement — n'entre dans aucun calcul de gain).
  // Sentinel géré nativement : -1 = montant fixe, 0 = sans acompte, sinon % du TTC.
  // Robuste par construction : un -1 sans montant fixe → 0 (jamais négatif ni NaN).
  // Pas d'arrondi (cohérent avec les sites d'affichage existants).
  const acomptePct  = toNumber(devis?.acompte_pourcentage ?? 30, 30)
  const acompteMode = acomptePct === -1 ? 'fixe' : acomptePct === 0 ? 'sans' : 'pourcentage'
  const acompte     = acompteMode === 'fixe' ? toNumber(devis?.acompte_montant_fixe)
                    : acompteMode === 'sans' ? 0
                    : montantTTC * (acomptePct / 100)
  const solde       = montantTTC - acompte  // reste à payer après acompte (affichage)

  return {
    id: devis?.id || null,
    statut: devis?.statut || null,
    signed,
    refused,
    isApporteur: Boolean(devis?.artisan?.paiement_direct),
    montantHT,
    montantTTC,
    commissionPct,
    comHT,
    royaltiesType2,
    netCom,
    parts: { agente: parts.agente, admin: parts.admin },
    acompte,
    acompteMode,
    acomptePct,
    solde,
  }
}

export function calculateCommissionsFinance(dossier) {
  const active = getActiveDevis(dossier)
  const devis  = active.map(dv => calculateDevisFinance(dv, dossier))

  const comHT          = round2(devis.reduce((s, d) => s + d.comHT, 0))
  const royaltiesType2 = round2(devis.reduce((s, d) => s + d.royaltiesType2, 0))
  const netCom         = round2(devis.reduce((s, d) => s + d.netCom, 0))
  const partsAgente    = round2(devis.reduce((s, d) => s + d.parts.agente, 0))
  const partsAdmin     = round2(devis.reduce((s, d) => s + d.parts.admin, 0))

  return {
    devis,
    comHT,
    royaltiesType2,
    netCom,
    parts: { agente: partsAgente, admin: partsAdmin },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HONORAIRES
// ─────────────────────────────────────────────────────────────────────────────

// Cœur de calcul des honoraires — arithmétique commune aux 3 entrées (signés /
// actifs / recu+accepte). Prend la base (totaux devis) EN PARAMÈTRE ; ne refiltre
// pas. Déplacement à l'identique de l'arithmétique existante : valeurs inchangées.
function honorairesCore(dossier, { totalHT: baseHT, totalTTC: baseTTC }) {
  const typologie    = dossier?.typologie || ''
  const partAgente   = getPartAgente(dossier)
  const tauxCourtage = getTauxCourtage(dossier)
  const tauxAmo      = getTauxAmo(dossier)

  const isCourtage = typologie === 'courtage'
  const isAmo      = typologie === 'amo'

  // Frais remboursés : on retire le PLEIN montant TTC des frais du courtage CALCULÉ
  // (après application du taux), uniquement si frais_statut === 'rembourse'.
  // La base honoraires n'est PAS amputée ; l'AMO n'est PAS affecté.
  const fraisRembourse    = dossier?.frais_statut === 'rembourse'
  const deductionFraisTTC = fraisRembourse ? round2(toNumber(dossier?.frais_consultation) || 0) : 0
  const deductionFraisHT  = fraisRembourse ? round2((toNumber(dossier?.frais_consultation) || 0) / TVA_FRAIS) : 0

  let courtage = { brut: 0, htBrut: 0, ttc: 0, ht: 0, royalties: 0, net: 0, parts: { agente: 0, admin: 0 } }
  if (isCourtage || isAmo) {
    // brut = base × taux (AVANT déduction frais). net/ttc = brut − frais remboursés.
    // round2(brut − dedFrais) = round2(base×taux − dedFrais) car dedFrais est déjà
    // à 2 décimales → valeur ttc/ht identique à l'existant.
    const brut      = round2(baseTTC * tauxCourtage)
    const htBrut    = round2(baseHT * tauxCourtage)
    const ttc       = round2(brut - deductionFraisTTC)
    const ht        = round2(htBrut - deductionFraisHT)
    const royalties = round2(ht * ROYALTIES_RATE)
    const net       = round2(ht - royalties)
    const parts     = split(net, partAgente)
    courtage = { brut, htBrut, ttc, ht, royalties, net, parts: { agente: parts.agente, admin: parts.admin } }
  }

  let soldeAmo = { ttc: 0, ht: 0, royalties: 0, net: 0, parts: { agente: 0, admin: 0 } }
  if (isAmo) {
    const ttc       = round2(baseTTC * tauxAmo)
    const ht        = round2(baseHT * tauxAmo)
    const royalties = round2(ht * ROYALTIES_RATE)
    const net       = round2(ht - royalties)
    const parts     = split(net, partAgente)
    soldeAmo = { ttc, ht, royalties, net, parts: { agente: parts.agente, admin: parts.admin } }
  }

  const totalTTC      = round2(courtage.ttc + soldeAmo.ttc)
  const totalHT       = round2(courtage.ht + soldeAmo.ht)
  const totalRoyalties = round2(courtage.royalties + soldeAmo.royalties)
  const totalNet      = round2(courtage.net + soldeAmo.net)
  const parts    = {
    agente: round2(courtage.parts.agente + soldeAmo.parts.agente),
    admin:  round2(courtage.parts.admin  + soldeAmo.parts.admin),
  }

  // Tarif STANDARD (barré côté client), TTC. courtageTTCBrut = avant déduction frais ;
  // courtageTTC = net (identique à l'existant). amoTTC = base × 9% (AMO non amputé).
  const standard = {
    courtageTTCBrut: round2(baseTTC * COURTAGE_STANDARD),
    courtageTTC:     round2(baseTTC * COURTAGE_STANDARD - deductionFraisTTC),
    amoTTC:          round2(baseTTC * AMO_STANDARD),
    totalTTC:        0,
  }
  standard.totalTTC = round2(standard.courtageTTC + standard.amoTTC)

  return { courtage, soldeAmo, totalTTC, totalHT, totalRoyalties, totalNet, parts, standard }
}

export function calculateHonorairesFinance(dossier) {
  const { signed, totalHT, totalTTC } = getSignedTotals(dossier)
  const core = honorairesCore(dossier, { totalHT, totalTTC })

  return {
    totalDevisHTSignes:  totalHT,
    totalDevisTTCSignes: totalTTC,
    signedDevisCount: signed.length,
    courtage: core.courtage,
    soldeAmo: core.soldeAmo,
    totalTTC: core.totalTTC,
    totalHT:  core.totalHT,
    totalRoyalties: core.totalRoyalties,
    totalNet: core.totalNet,
    parts: core.parts,
    standard: core.standard,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HONORAIRES PRÉVISIONNELS
// Même logique que calculateHonorairesFinance mais sur TOUS les devis actifs
// (non refusés), conformément aux règles prévisionnel du CDC.
// ─────────────────────────────────────────────────────────────────────────────

function getActiveTotals(dossier) {
  const active   = getActiveDevis(dossier)
  const totalHT  = round2(active.reduce((s, dv) => s + toNumber(dv.montant_ht), 0))
  const totalTTC = round2(active.reduce((s, dv) => {
    if (dv.montant_ttc !== undefined && dv.montant_ttc !== null) return s + toNumber(dv.montant_ttc)
    return s + toNumber(dv.montant_ht) * TVA_TRAVAUX
  }, 0))
  return { totalHT, totalTTC }
}

export function calculateHonorairesPrevi(dossier) {
  const { totalHT, totalTTC } = getActiveTotals(dossier)
  const core = honorairesCore(dossier, { totalHT, totalTTC })

  return {
    courtage: core.courtage,
    soldeAmo: core.soldeAmo,
    totalNet: core.totalNet,
    parts: core.parts,
    totalDevisHTRecus:  totalHT,
    totalDevisTTCRecus: totalTTC,
    totalTTC: core.totalTTC,
    standard: core.standard,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HONORAIRES RECAP PDF — base recu+accepte
// Mêmes honoraires, mais sur la base « devis reçus + signés » (recu+accepte,
// sans a_modifier), conforme au périmètre du Recap client en mode preview.
// ─────────────────────────────────────────────────────────────────────────────

function getRecuAccepteTotals(dossier) {
  const list = getDevisList(dossier).filter(dv => dv?.statut === 'recu' || dv?.statut === 'accepte')
  const totalHT  = round2(list.reduce((s, dv) => s + toNumber(dv.montant_ht), 0))
  const totalTTC = round2(list.reduce((s, dv) => {
    if (dv.montant_ttc !== undefined && dv.montant_ttc !== null) return s + toNumber(dv.montant_ttc)
    return s + toNumber(dv.montant_ht) * TVA_TRAVAUX
  }, 0))
  return { totalHT, totalTTC }
}

export function calculateHonorairesRecuAccepte(dossier) {
  const { totalHT, totalTTC } = getRecuAccepteTotals(dossier)
  const core = honorairesCore(dossier, { totalHT, totalTTC })

  return {
    courtage: core.courtage,
    soldeAmo: core.soldeAmo,
    totalNet: core.totalNet,
    parts: core.parts,
    totalDevisHTRecuAccepte:  totalHT,
    totalDevisTTCRecuAccepte: totalTTC,
    totalTTC: core.totalTTC,
    standard: core.standard,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// APPORTEUR CLIENT
// ─────────────────────────────────────────────────────────────────────────────

export function calculateApporteurFinance(dossier) {
  const tauxApporteur = normalizePercent(
    dossier?.apporteur_pourcentage ?? dossier?.client?.apporteur_pourcentage, 0
  )
  // Mode lu sur le VRAI champ client (`apporteur_base`), valeur cible 'total_chantier_ht'.
  // (Corrige le bug : l'ancien code lisait `apporteur_mode` et comparait à 'total_chantier'
  //  → toujours faux → 'total chantier HT' inatteignable.)
  const mode       = dossier?.client?.apporteur_base === 'total_chantier'
    ? 'total_chantier_ht' : 'par_devis'
  const partAgente = getPartAgente(dossier)
  const actif      = dossier?.apporteur_actif === true
  const tauxDefini = tauxApporteur > 0
  const signed     = getSignedDevis(dossier)
    .filter(dv => toNumber(dv.commission_pourcentage) > 0)

  // Le coût ne se déclenche QUE si l'apporteur est activé sur CE chantier ET taux défini.
  // Taux null/0 = « taux à définir », coût 0, jamais de NaN.
  if (!actif || !tauxDefini) {
    return {
      enabled: false, actif, tauxDefini, mode, tauxApporteur,
      totalHT: 0, parts: { agente: 0, admin: 0 },
      totalHTReel: 0, partsReel: { agente: 0, admin: 0 },
      lines: [],
    }
  }

  // Réel = devis dont l'acompte est débloqué côté illiCO (statut_illico === 'recu').
  const suivi = Array.isArray(dossier?.suivi_financier) ? dossier.suivi_financier : []
  const estDebloque = (artisanId) => suivi.some(s =>
    s.type_echeance === 'acompte_artisan' && s.artisan_id === artisanId && s.statut_illico === 'recu'
  )

  let lines = []
  if (mode === 'total_chantier_ht') {
    const baseHT      = round2(signed.reduce((s, dv) => s + toNumber(dv.montant_ht), 0))
    const totalHT     = round2(baseHT * tauxApporteur)
    const parts       = split(totalHT, partAgente)
    const baseHTReel  = round2(signed
      .filter(dv => estDebloque(dv.artisan_id ?? dv.artisan?.id))
      .reduce((s, dv) => s + toNumber(dv.montant_ht), 0))
    const totalHTReel = round2(baseHTReel * tauxApporteur)
    const partsReel   = split(totalHTReel, partAgente)
    lines = [{
      type: 'total_chantier_ht', baseHT, tauxApporteur, totalHT,
      agente: parts.agente, admin: parts.admin,
      debloque: baseHTReel > 0, totalHTReel,
      agenteReel: partsReel.agente, adminReel: partsReel.admin,
    }]
  } else {
    lines = signed.map(dv => {
      const artisanId = dv.artisan_id ?? dv.artisan?.id
      const baseHT    = round2(toNumber(dv.montant_ht))
      const totalHT   = round2(baseHT * tauxApporteur)
      const parts     = split(totalHT, partAgente)
      const debloque  = estDebloque(artisanId)
      return {
        type: 'par_devis',
        devisId: dv.id || null,
        artisanId,
        label: dv?.artisan?.entreprise || 'Devis',
        baseHT, tauxApporteur, totalHT,
        agente: parts.agente, admin: parts.admin,
        debloque,
        totalHTReel: debloque ? totalHT : 0,
        agenteReel:  debloque ? parts.agente : 0,
        adminReel:   debloque ? parts.admin : 0,
      }
    })
  }

  const totalHT     = round2(lines.reduce((s, l) => s + l.totalHT, 0))
  const agente      = round2(lines.reduce((s, l) => s + l.agente, 0))
  const admin       = round2(lines.reduce((s, l) => s + l.admin, 0))
  const totalHTReel = round2(lines.reduce((s, l) => s + (l.totalHTReel || 0), 0))
  const agenteReel  = round2(lines.reduce((s, l) => s + (l.agenteReel || 0), 0))
  const adminReel   = round2(lines.reduce((s, l) => s + (l.adminReel || 0), 0))

  return {
    enabled: true, actif, tauxDefini, mode, tauxApporteur,
    totalHT,
    parts: { agente, admin },
    totalHTReel,
    partsReel: { agente: agenteReel, admin: adminReel },
    lines,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CALCUL COMPLET D'UN DOSSIER
// ─────────────────────────────────────────────────────────────────────────────

export function calculateDossierFinance(dossier) {
  const partAgente = getPartAgente(dossier)
  const partAdmin  = getPartAdmin(dossier)

  const frais           = calculateFraisFinance(dossier)
  const commissions     = calculateCommissionsFinance(dossier)
  const honoraires      = calculateHonorairesFinance(dossier)
  const honorairesPrevi = calculateHonorairesPrevi(dossier)
  const apporteur       = calculateApporteurFinance(dossier)

  const royaltiesCommissions = round2(commissions.royaltiesType2)
  const royaltiesFrais       = round2(frais.royalties)
  const royaltiesHonoraires  = round2(honoraires.totalRoyalties)
  const royaltiesTotal       = round2(royaltiesCommissions + royaltiesFrais + royaltiesHonoraires)

  const gainsBruts = {
    agente: round2(frais.parts.agente + commissions.parts.agente + honoraires.parts.agente),
    admin:  round2(frais.parts.admin  + commissions.parts.admin  + honoraires.parts.admin),
  }
  const gainsNets = {
    agente: round2(gainsBruts.agente - apporteur.partsReel.agente),
    admin:  round2(gainsBruts.admin  - apporteur.partsReel.admin),
  }

  const gainsBrutsPrevi = {
    agente: round2(frais.parts.agente + commissions.parts.agente + honorairesPrevi.parts.agente),
    admin:  round2(frais.parts.admin  + commissions.parts.admin  + honorairesPrevi.parts.admin),
  }
  const gainsNetsPrevi = {
    agente: round2(gainsBrutsPrevi.agente - apporteur.parts.agente),
    admin:  round2(gainsBrutsPrevi.admin  - apporteur.parts.admin),
  }

  // Total des acomptes artisans (affichage uniquement). Deux ensembles en miroir
  // des honoraires : SIGNÉS (getSignedDevis) et ACTIFS (getActiveDevis = même base
  // que les honoraires prévi). Dérivés de commissions.devis (déjà = getActiveDevis
  // mappé), chacun portant son champ .acompte et .signed. Pas d'arrondi (cohérent
  // avec les sites d'affichage existants).
  const acomptes = {
    totalSignes: commissions.devis.filter(d => d.signed).reduce((s, d) => s + d.acompte, 0),
    totalActifs: commissions.devis.reduce((s, d) => s + d.acompte, 0),
  }

  return {
    settings: {
      partAgente,
      partAdmin,
    },
    frais,
    commissions,
    honoraires,
    honorairesPrevi,
    apporteur,
    royalties: {
      commissions: royaltiesCommissions,
      frais:       royaltiesFrais,
      honoraires:  royaltiesHonoraires,
      total:       royaltiesTotal,
    },
    gains: {
      bruts:      gainsBruts,
      nets:       gainsNets,
      brutsPrevi: gainsBrutsPrevi,
      netsPrevi:  gainsNetsPrevi,
    },
    acomptes,
  }
}