// app/lib/finance.js
// Source de vérité unique pour tous les calculs financiers illiCO travaux

const TVA = 1.2
const ROYALTIES_RATE = 0.05

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
  return normalizePercent(dossier?.taux_courtage, 0.06)
}

export function getTauxAmo(dossier) {
  return normalizePercent(dossier?.taux_amo ?? dossier?.honoraires_amo_taux, 0.09)
}

function getDevisList(dossier) {
  return Array.isArray(dossier?.devis_artisans) ? dossier.devis_artisans : []
}

export function getActiveDevis(dossier) {
  return getDevisList(dossier).filter(dv => dv?.statut !== 'refuse')
}

export function getSignedDevis(dossier) {
  return getActiveDevis(dossier).filter(dv =>
    dv?.statut === 'accepte' || isTruthyDate(dv?.date_signature)
  )
}

function getActiveTotals(dossier) {
  const active = getActiveDevis(dossier)
  const totalHT  = round2(active.reduce((s, dv) => s + toNumber(dv.montant_ht), 0))
  const totalTTC = round2(active.reduce((s, dv) => {
    if (dv.montant_ttc !== undefined && dv.montant_ttc !== null) return s + toNumber(dv.montant_ttc)
    return s + toNumber(dv.montant_ht) * TVA
  }, 0))
  return { active, totalHT, totalTTC }
}

function getSignedTotals(dossier) {
  const signed = getSignedDevis(dossier)
  const totalHT  = round2(signed.reduce((s, dv) => s + toNumber(dv.montant_ht), 0))
  const totalTTC = round2(signed.reduce((s, dv) => {
    if (dv.montant_ttc !== undefined && dv.montant_ttc !== null) return s + toNumber(dv.montant_ttc)
    return s + toNumber(dv.montant_ht) * TVA
  }, 0))
  return { signed, totalHT, totalTTC }
}

// ─────────────────────────────────────────────────────────────────────────────
// FRAIS DE CONSULTATION
// Royalties = fraisHT × 5%
// netFrais = fraisHT - royalties
// Part agente/admin selon répartition commission du dossier
// (pour Anne-Lise : part_agente = 1.0 donc 1ion du dossier
// (pour Anne-Lise : part_agente = 1.0 donc 100% pour elle)
// ─────────────────────────────────────────────────────────────────────────────

export function calculateFraisFinance(dossier) {
  const fraisPartAgente = dossier?.frais_part_agente != null ? normalizePercent(dossier.frais_part_agente) : dossier?.referente?.frais_part_agente_defaut != null ? normalizePercent(dossier.referente.frais_part_agente_defaut): getPartAgente(dossier)
  const fraisTTC  = round2(toNumber(dossier?.frais_consultation))
  const fraisHT   = round2(fraisTTC / TVA)
  const royalties = round2(fraisHT * ROYALTIES_RATE)
  const net       = dossier?.frais_deduits ? 0 : round2(fraisHT - royalties)
  const parts     = split(net, fraisPartAgente)
  const netPrevi = dossier?.frais_statut === 'offerts' ? 0 : round2(fraisHT - royalties)
  const agentePrevi = dossier?.frais_statut === 'offerts' ? 0 : split(round2(fraisHT - royalties), fraisPartAgente).agente

  return {
    fraisTTC,
    fraisHT,
    royalties,
    net,
    netPrevi,
    agentePrevi,
    parts: { agente: parts.agente, admin: parts.admin },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// COMMISSION PAR DEVIS
// comHT = montantHT × commission%
// royaltiesType2 = comHT × 5% (HT)
// netCom = comHT - royaltiesType2
// Artisans apporteurs (sans_royalties = true) : même calcul, pas de royaltiesType1
// ─────────────────────────────────────────────────────────────────────────────

export function calculateDevisFinance(devis, dossier = {}) {
  const partAgente = getPartAgente(dossier)
  const montantHT  = round2(toNumber(devis?.montant_ht))
  const montantTTC = round2(
    devis?.montant_ttc != null ? toNumber(devis.montant_ttc) : montantHT * TVA
  )
  const commissionPct  = normalizePercent(devis?.commission_pourcentage, 0)
  const comHT          = round2(montantHT * commissionPct)
  const comTTC         = round2(comHT * TVA)
  const royaltiesType2 = round2(comHT * ROYALTIES_RATE)
  const netCom         = round2(comHT - royaltiesType2)
  const parts          = split(netCom, partAgente)
  const signed         = devis?.statut === 'accepte' || isTruthyDate(devis?.date_signature)
  const refused        = devis?.statut === 'refuse'

  return {
    id: devis?.id || null,
    statut: devis?.statut || null,
    signed,
    refused,
    isApporteur: Boolean(devis?.artisan?.sans_royalties),
    montantHT,
    montantTTC,
    commissionPct,
    comHT,
    comTTC,
    royaltiesType2,
    netCom,
    parts: { agente: parts.agente, admin: parts.admin },
  }
}

export function calculateCommissionsFinance(dossier) {
  const active = getActiveDevis(dossier)
  const devis  = active.map(dv => calculateDevisFinance(dv, dossier))

  // Tous les devis actifs
  const comHTTous      = round2(devis.reduce((s, d) => s + d.comHT, 0))
  const comTTCTous     = round2(devis.reduce((s, d) => s + d.comTTC, 0))
  const royaltiesType2 = round2(devis.reduce((s, d) => s + d.royaltiesType2, 0))
  const netComTous     = round2(devis.reduce((s, d) => s + d.netCom, 0))
  const comAgenteTous  = round2(devis.reduce((s, d) => s + d.parts.agente, 0))
  const comAdminTous   = round2(devis.reduce((s, d) => s + d.parts.admin, 0))

  // Devis signés uniquement
  const signés = devis.filter(d => d.signed)
  const comHTSigne      = round2(signés.reduce((s, d) => s + d.comHT, 0))
  const netComSigne     = round2(signés.reduce((s, d) => s + d.netCom, 0))
  const comAgenteSigne  = round2(signés.reduce((s, d) => s + d.parts.agente, 0))
  const comAdminSigne   = round2(signés.reduce((s, d) => s + d.parts.admin, 0))

  return {
    devis,
    // Tous actifs
    comHT: comHTTous,
    comTTC: comTTCTous,
    royaltiesType2,
    netCom: netComTous,
    comHTTous,
    netComTous,
    comAgenteTous,
    comAdminTous,
    parts: { agente: comAgenteTous, admin: comAdminTous },
    // Signés uniquement
    comHTSigne,
    netComSigne,
    comAgenteSigne,
    comAdminSigne,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HONORAIRES
// courtageHT = totalDevisHTSignes × tauxCourtage  (base HT, pas TTC/1.2)
// soldeAmoHT = totalDevisHTSignes × tauxAmo
// royalties  = HT × 5%
// net        = HT - royalties
// Part agente/admin sur net selon répartition commission du dossier
// ─────────────────────────────────────────────────────────────────────────────

export function calculateHonorairesFinance(dossier) {
  const typologie  = dossier?.typologie || ''
  const partAgente = getPartAgente(dossier)
  const tauxCourtage = getTauxCourtage(dossier)
  const tauxAmo    = getTauxAmo(dossier)
  const { totalHT: totalDevisHTSignes, totalTTC: totalDevisTTCSignes, signed: signedDevis } =
    getSignedTotals(dossier)

  const isCourtage = typologie === 'courtage'
  const isAmo      = typologie === 'amo'

  // ── Courtage ──────────────────────────────────────────────────────────────
  let courtage = { ttc: 0, ht: 0, royalties: 0, net: 0, parts: { agente: 0, admin: 0 } }
  if (isCourtage || isAmo) {
    // Si frais remboursés et déduits, on les soustrait de la base HT
    const fraisHT = (dossier?.frais_statut === 'rembourse' && dossier?.frais_deduits)
      ? round2((toNumber(dossier?.frais_consultation) || 0) / TVA)
      : 0
    const baseHT  = round2(totalDevisHTSignes - fraisHT)
    const baseTTC = round2(totalDevisTTCSignes - (fraisHT * TVA))
    const ttc      = round2(baseTTC * tauxCourtage)
    const ht       = round2(baseHT * tauxCourtage)
    const royalties = round2(ht * ROYALTIES_RATE)
    const net      = round2(ht - royalties)
    const parts    = split(net, partAgente)
    courtage = { ttc, ht, royalties, net, parts: { agente: parts.agente, admin: parts.admin } }
  }

  // ── Solde AMO ─────────────────────────────────────────────────────────────
  let soldeAmo = { ttc: 0, ht: 0, royalties: 0, net: 0, parts: { agente: 0, admin: 0 } }
  if (isAmo) {
    const ttc      = round2(totalDevisTTCSignes * tauxAmo)
    const ht       = round2(totalDevisHTSignes * tauxAmo)
    const royalties = round2(ht * ROYALTIES_RATE)
    const net      = round2(ht - royalties)
    const parts    = split(net, partAgente)
    soldeAmo = { ttc, ht, royalties, net, parts: { agente: parts.agente, admin: parts.admin } }
  }

  // ── Totaux ────────────────────────────────────────────────────────────────
  const totalTTC      = round2(courtage.ttc + soldeAmo.ttc)
  const totalHT       = round2(courtage.ht + soldeAmo.ht)
  const totalRoyalties = round2(courtage.royalties + soldeAmo.royalties)
  const totalNet      = round2(courtage.net + soldeAmo.net)
  const totalParts    = {
    agente: round2(courtage.parts.agente + soldeAmo.parts.agente),
    admin:  round2(courtage.parts.admin  + soldeAmo.parts.admin),
  }

  console.log('honoraires debug', {
    totalDevisHTSignes,
    totalDevisTTCSignes,
    tauxCourtage,
    tauxAmo,
    courtHT: courtage.ht,
    courtNet: courtage.net,
    amoHT: soldeAmo.ht,
    amoNet: soldeAmo.net,
    totalNet,
  })


  return {
    typologie,
    tauxCourtage,
    tauxAmo,
    totalDevisHTSignes,
    totalDevisTTCSignes,
    signedDevisCount: signedDevis.length,
    courtage,
    soldeAmo,
    totalTTC,
    totalHT,
    totalRoyalties,
    totalNet,
    parts: totalParts,
  }
}

export function calculateHonorairesPrevi(dossier) {
  const typologie  = dossier?.typologie || ''
  const partAgente = getPartAgente(dossier)
  const tauxCourtage = getTauxCourtage(dossier)
  const tauxAmo    = getTauxAmo(dossier)
  const { totalHT, totalTTC } = getActiveTotals(dossier)
  const isCourtage = typologie === 'courtage'
  const isAmo      = typologie === 'amo'

  let courtage = { ttc: 0, ht: 0, royalties: 0, net: 0, parts: { agente: 0, admin: 0 } }
  if (isCourtage || isAmo) {
    const fraisHT = (dossier?.frais_statut === 'rembourse' && dossier?.frais_deduits)
      ? round2(toNumber(dossier?.frais_consultation) / TVA) : 0
    const baseHT  = round2(totalHT - fraisHT)
    const baseTTC = round2(totalTTC - (fraisHT * TVA))
    const ht       = round2(baseHT * tauxCourtage)
    const ttc      = round2(baseTTC * tauxCourtage)
    const royalties = round2(ht * ROYALTIES_RATE)
    const net      = round2(ht - royalties)
    const parts    = split(net, partAgente)
    courtage = { ttc, ht, royalties, net, parts: { agente: parts.agente, admin: parts.admin } }
  }

  let soldeAmo = { ttc: 0, ht: 0, royalties: 0, net: 0, parts: { agente: 0, admin: 0 } }
  if (isAmo) {
    const ht       = round2(totalHT * tauxAmo)
    const ttc      = round2(totalTTC * tauxAmo)
    const royalties = round2(ht * ROYALTIES_RATE)
    const net      = round2(ht - royalties)
    const parts    = split(net, partAgente)
    soldeAmo = { ttc, ht, royalties, net, parts: { agente: parts.agente, admin: parts.admin } }
  }

  const totalNet  = round2(courtage.net + soldeAmo.net)
  const totalParts = {
    agente: round2(courtage.parts.agente + soldeAmo.parts.agente),
    admin:  round2(courtage.parts.admin  + soldeAmo.parts.admin),
  }

  return { courtage, soldeAmo, totalHT: totalHT, totalNet, parts: totalParts }
}

// ─────────────────────────────────────────────────────────────────────────────
// APPORTEUR CLIENT (sur fiche client)
// montantHT × tauxApporteur par devis signé avec commission > 0
// Pas de royalties
// Part agente/admin selon répartition commission du dossier
// ─────────────────────────────────────────────────────────────────────────────

export function calculateApporteurFinance(dossier) {
  const tauxApporteur = normalizePercent(
    dossier?.apporteur_pourcentage ?? dossier?.client?.apporteur_pourcentage, 0
  )
  const mode       = dossier?.client?.apporteur_mode === 'total_chantier'
    ? 'total_chantier_ht' : 'par_devis'
  const partAgente = getPartAgente(dossier)
  const signed     = getSignedDevis(dossier)
    .filter(dv => toNumber(dv.commission_pourcentage) > 0)

  if (tauxApporteur === 0) {
    return { enabled: false, mode, tauxApporteur, totalHT: 0, parts: { agente: 0, admin: 0 }, lines: [] }
  }

  let lines = []

  if (mode === 'total_chantier_ht') {
    const baseHT  = round2(signed.reduce((s, dv) => s + toNumber(dv.montant_ht), 0))
    const totalHT = round2(baseHT * tauxApporteur)
    const parts   = split(totalHT, partAgente)
    lines = [{ type: 'total_chantier_ht', baseHT, tauxApporteur, totalHT, ...parts }]
  } else {
    lines = signed.map(dv => {
      const baseHT  = round2(toNumber(dv.montant_ht))
      const totalHT = round2(baseHT * tauxApporteur)
      const parts   = split(totalHT, partAgente)
      return {
        type: 'par_devis',
        devisId: dv.id || null,
        label: dv?.artisan?.entreprise || 'Devis',
        baseHT,
        tauxApporteur,
        totalHT,
        agente: parts.agente,
        admin: parts.admin,
      }
    })
  }

  const totalHT = round2(lines.reduce((s, l) => s + l.totalHT, 0))
  const agente  = round2(lines.reduce((s, l) => s + l.agente, 0))
  const admin   = round2(lines.reduce((s, l) => s + l.admin, 0))

  return {
    enabled: true,
    mode,
    tauxApporteur,
    totalHT,
    parts: { agente, admin },
    lines,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CALCUL COMPLET D'UN DOSSIER
// ─────────────────────────────────────────────────────────────────────────────

export function calculateDossierFinance(dossier) {
  const partAgente = getPartAgente(dossier)
  const partAdmin  = getPartAdmin(dossier)

  const frais       = calculateFraisFinance(dossier)
  const commissions = calculateCommissionsFinance(dossier)
  const honoraires  = calculateHonorairesFinance(dossier)
  const honorairesPrevi = calculateHonorairesPrevi(dossier)
  const apporteur   = calculateApporteurFinance(dossier)

  // ── Royalties supportées par CTP ──────────────────────────────────────────
  // royaltiesType2 sur commissions : dans le flux CTP
  // royalties frais + honoraires : dans le flux CTP
  // royaltiesType1 (montantHT × 5% × 1.2) : prélevé par illiCO directement, hors CTP
  const royaltiesCommissions = round2(commissions.royaltiesType2)
  const royaltiesFrais       = round2(frais.royalties)
  const royaltiesHonoraires  = round2(honoraires.totalRoyalties)
  const royaltiesTotal       = round2(royaltiesCommissions + royaltiesFrais + royaltiesHonoraires)

  // ── Gains bruts (avant déduction apporteur client) ────────────────────────
  const gainsBruts = {
    agente: round2(frais.parts.agente + commissions.parts.agente + honoraires.parts.agente),
    admin:  round2(frais.parts.admin  + commissions.parts.admin  + honoraires.parts.admin),
  }

  // ── Gains nets (après déduction apporteur client) ─────────────────────────
  const gainsNets = {
    agente: round2(gainsBruts.agente - apporteur.parts.agente),
    admin:  round2(gainsBruts.admin  - apporteur.parts.admin),
  }

  return {
    // Paramètres
    settings: {
      partAgente,
      partAdmin,
      tauxCourtage: getTauxCourtage(dossier),
      tauxAmo:      getTauxAmo(dossier),
    },

    // Détails
    frais,
    commissions,
    honoraires,
    honorairesPrevi,
    apporteur,

    // Royalties
    royalties: {
      commissions: royaltiesCommissions,
      frais:       royaltiesFrais,
      honoraires:  royaltiesHonoraires,
      total:       royaltiesTotal,
    },

    // Gains
    gains: {
      bruts: gainsBruts,
      nets:  gainsNets,
    },
  }
}