// app/lib/finance.js

const TVA = 1.2
const ROYALTIES_RATE = 0.05

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

function isTruthyDate(value) {
  return Boolean(value && String(value).trim())
}

function isDevisRefused(devis) {
  return devis?.statut === 'refuse'
}

function isDevisSigned(devis) {
  return devis?.statut === 'accepte' || isTruthyDate(devis?.date_signature)
}

function getDevisList(dossier) {
  return Array.isArray(dossier?.devis_artisans) ? dossier.devis_artisans : []
}

export function getActiveDevis(dossier) {
  return getDevisList(dossier).filter((devis) => !isDevisRefused(devis))
}

export function getSignedDevis(dossier) {
  return getDevisList(dossier).filter((devis) => !isDevisRefused(devis) && isDevisSigned(devis))
}

export function getPartAgente(dossier) {
  if (dossier?.part_agente !== undefined && dossier?.part_agente !== null) {
    return normalizePercent(dossier.part_agente, 0)
  }

  // Fallback raisonnable si le champ n'est pas encore renseigné partout
  if (dossier?.referente?.role === 'admin') return 0

  return 1
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

export function getApporteurMode(dossier) {
  return dossier?.apporteur_mode || dossier?.client?.apporteur_mode || 'par_devis'
}

export function getApporteurTaux(dossier) {
  return normalizePercent(
    dossier?.apporteur_pourcentage ?? dossier?.client?.apporteur_pourcentage,
    0
  )
}

export function formatEuro(value) {
  return `${round2(value).toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`
}

function splitAmount(amount, partAgente) {
  const agente = round2(amount * partAgente)
  const admin = round2(amount - agente)

  return { agente, admin }
}

function getSignedTotals(dossier) {
  const signedDevis = getSignedDevis(dossier)

  const totalHT = round2(
    signedDevis.reduce((sum, devis) => sum + toNumber(devis.montant_ht), 0)
  )

  const totalTTC = round2(
    signedDevis.reduce((sum, devis) => {
      if (devis.montant_ttc !== undefined && devis.montant_ttc !== null) {
        return sum + toNumber(devis.montant_ttc)
      }

      return sum + toNumber(devis.montant_ht) * TVA
    }, 0)
  )

  return {
    signedDevis,
    totalHT,
    totalTTC,
  }
}

export function calculateDevisFinance(devis, dossier = {}) {
  const partAgente = getPartAgente(dossier)
  const partAdmin = getPartAdmin(dossier)

  const montantHT = round2(toNumber(devis?.montant_ht))
  const montantTTC = round2(
    devis?.montant_ttc !== undefined && devis?.montant_ttc !== null
      ? toNumber(devis.montant_ttc)
      : montantHT * TVA
  )

  const commissionPct = normalizePercent(devis?.commission_pourcentage, 0)
  const comHT = round2(montantHT * commissionPct)
  const comTTC = round2(comHT * TVA)
  const royaltiesType1 = devis?.artisan?.sans_royalties ? 0 : round2(montantHT * ROYALTIES_RATE * TVA)
  const royaltiesType2 = round2(comHT * ROYALTIES_RATE * TVA)
  const royaltiesCom = round2(royaltiesType1 + royaltiesType2)
  const netCom = round2(comHT - royaltiesType2)
  const gainsBruts = splitAmount(netCom, partAgente)

  return {
    id: devis?.id || null,
    statut: devis?.statut || null,
    signed: isDevisSigned(devis),
    refused: isDevisRefused(devis),
    montantHT,
    montantTTC,
    commissionPct,
    partAgente,
    partAdmin,
    comHT,
    comTTC,
    royaltiesCom,
    netCom,
    gainsBruts: {
      agente: gainsBruts.agente,
      admin: gainsBruts.admin,
    },
  }
}

export function calculateCommissionsFinance(dossier) {
  const activeDevis = getActiveDevis(dossier)
  const devis = activeDevis.map((item) => calculateDevisFinance(item, dossier))

  const totalMontantHT = round2(devis.reduce((sum, d) => sum + d.montantHT, 0))
  const totalMontantTTC = round2(devis.reduce((sum, d) => sum + d.montantTTC, 0))
  const comHT = round2(devis.reduce((sum, d) => sum + d.comHT, 0))
  const comTTC = round2(devis.reduce((sum, d) => sum + d.comTTC, 0))
  const royaltiesCom = round2(devis.reduce((sum, d) => sum + d.royaltiesCom, 0))
  const netCom = round2(devis.reduce((sum, d) => sum + d.netCom, 0))
  const gainsBrutsAgente = round2(devis.reduce((sum, d) => sum + d.gainsBruts.agente, 0))
  const gainsBrutsAdmin = round2(devis.reduce((sum, d) => sum + d.gainsBruts.admin, 0))

  return {
    countActiveDevis: devis.length,
    countSignedDevis: devis.filter((d) => d.signed).length,
    devis,
    totalMontantHT,
    totalMontantTTC,
    comHT,
    comTTC,
    royaltiesCom,
    netCom,
    gainsBruts: {
      agente: gainsBrutsAgente,
      admin: gainsBrutsAdmin,
    },
  }
}

export function calculateHonorairesFinance(dossier) {
  const typologie = dossier?.typologie || ''
  const partAgente = getPartAgente(dossier)
  const partAdmin = getPartAdmin(dossier)
  const tauxCourtage = getTauxCourtage(dossier)
  const tauxAmo = getTauxAmo(dossier)

  const { totalHT: totalDevisHTSignes, totalTTC: totalDevisTTCSignes, signedDevis } =
    getSignedTotals(dossier)

  const isCourtage = typologie === 'courtage'
  const isAmo = typologie === 'amo'

  let courtageTTC = 0
  let royaltiesCourtage = 0
  let netCourtage = 0

  let acompteAmoTTC = 0
  let royaltiesAcompteAmo = 0

  let soldeAmoTTC = 0
  let royaltiesSoldeAmo = 0

  let totalTTC = 0
  let royaltiesTotal = 0
  let netTotal = 0

  if (isCourtage) {
    courtageTTC = round2(totalDevisTTCSignes * tauxCourtage)
    royaltiesCourtage = round2(courtageTTC * ROYALTIES_RATE * TVA)
    netCourtage = round2(courtageTTC - royaltiesCourtage)

    totalTTC = courtageTTC
    royaltiesTotal = royaltiesCourtage
    netTotal = netCourtage
  }

  if (isAmo) {
    acompteAmoTTC = round2(totalDevisTTCSignes * tauxCourtage)
    royaltiesAcompteAmo = round2(acompteAmoTTC * ROYALTIES_RATE * TVA)

    soldeAmoTTC = round2(totalDevisTTCSignes * tauxAmo)
    royaltiesSoldeAmo = round2(soldeAmoTTC * ROYALTIES_RATE * TVA)

    totalTTC = round2(acompteAmoTTC + soldeAmoTTC)
    royaltiesTotal = round2(royaltiesAcompteAmo + royaltiesSoldeAmo)
    netTotal = round2(totalTTC - royaltiesTotal)

    courtageTTC = acompteAmoTTC
    royaltiesCourtage = royaltiesAcompteAmo
    netCourtage = round2(acompteAmoTTC - royaltiesAcompteAmo)
  }

  const gainsBruts = splitAmount(netTotal, partAgente)

  return {
    typologie,
    signedDevisCount: signedDevis.length,
    totalDevisHTSignes,
    totalDevisTTCSignes,
    tauxCourtage,
    tauxAmo,
    partAgente,
    partAdmin,

    courtage: {
      ttc: round2(courtageTTC),
      royalties: round2(royaltiesCourtage),
      net: round2(netCourtage),
    },

    amo: {
      acompteTTC: round2(acompteAmoTTC),
      royaltiesAcompte: round2(royaltiesAcompteAmo),
      soldeTTC: round2(soldeAmoTTC),
      royaltiesSolde: round2(royaltiesSoldeAmo),
      totalTTC: round2(acompteAmoTTC + soldeAmoTTC),
      royaltiesTotal: round2(royaltiesAcompteAmo + royaltiesSoldeAmo),
      net: round2((acompteAmoTTC + soldeAmoTTC) - (royaltiesAcompteAmo + royaltiesSoldeAmo)),
    },

    totalTTC: round2(totalTTC),
    royaltiesTotal: round2(royaltiesTotal),
    netTotal: round2(netTotal),

    gainsBruts: {
      agente: gainsBruts.agente,
      admin: gainsBruts.admin,
    },
  }
}

export function calculateFraisFinance(dossier) {
  const fraisTTC = round2(toNumber(dossier?.frais_consultation))
  const fraisHT = round2(fraisTTC / TVA)
  const royaltiesFrais = round2(fraisHT * ROYALTIES_RATE * TVA)
  const fraisDeduits = dossier?.frais_deduits || false
  const netFrais = fraisDeduits ? 0 : round2(fraisTTC - royaltiesFrais)

  const referenteRole =
    dossier?.referente?.role ||
    dossier?.referente_role ||
    null

  const referentIsAdmin = referenteRole === 'admin'

  return {
    fraisTTC,
    fraisHT,
    royaltiesFrais,
    netFrais,
    gainsBruts: {
      agente: fraisDeduits ? 0 : (referentIsAdmin ? 0 : netFrais),
      admin: fraisDeduits ? 0 : (referentIsAdmin ? netFrais : 0),
    },
  }
}

export function calculateApporteurFinance(dossier) {
  const tauxApporteur = getApporteurTaux(dossier)
  const mode = getApporteurMode(dossier)
  const partAgente = getPartAgente(dossier)
  const partAdmin = getPartAdmin(dossier)

  const signedDevis = getSignedDevis(dossier)

  let baseHT = 0
  let lines = []

  if (mode === 'total_chantier_ht') {
    baseHT = round2(
      signedDevis.reduce((sum, devis) => sum + toNumber(devis.montant_ht), 0)
    )

    const totalTTC = round2(baseHT * tauxApporteur * TVA)
    const split = splitAmount(totalTTC, partAgente)

    lines = [
      {
        type: 'total_chantier_ht',
        label: 'Apporteur sur total chantier HT signé',
        baseHT,
        tauxApporteur,
        totalTTC,
        agente: split.agente,
        admin: split.admin,
      },
    ]
  } else {
    lines = signedDevis.map((devis) => {
      const devisHT = round2(toNumber(devis.montant_ht))
      const totalTTC = round2(devisHT * tauxApporteur * TVA)
      const split = splitAmount(totalTTC, partAgente)

      return {
        type: 'par_devis',
        devisId: devis.id || null,
        label: devis?.artisan?.entreprise || devis?.reference || 'Devis',
        baseHT: devisHT,
        tauxApporteur,
        totalTTC,
        agente: split.agente,
        admin: split.admin,
      }
    })

    baseHT = round2(lines.reduce((sum, line) => sum + line.baseHT, 0))
  }

  const totalTTC = round2(lines.reduce((sum, line) => sum + line.totalTTC, 0))
  const agente = round2(lines.reduce((sum, line) => sum + line.agente, 0))
  const admin = round2(lines.reduce((sum, line) => sum + line.admin, 0))

  return {
    enabled: tauxApporteur > 0,
    mode,
    tauxApporteur,
    baseHT,
    totalTTC,
    parts: {
      agente,
      admin,
    },
    lines,
  }
}

export function calculateDossierFinance(dossier) {
  const partAgente = getPartAgente(dossier)
  const partAdmin = getPartAdmin(dossier)

  const { totalHT: totalDevisHTSignes, totalTTC: totalDevisTTCSignes } = getSignedTotals(dossier)
  const commissions = calculateCommissionsFinance(dossier)
  const honoraires = calculateHonorairesFinance(dossier)
  const frais = calculateFraisFinance(dossier)
  const apporteur = calculateApporteurFinance(dossier)

  const royalties = {
    com: round2(commissions.royaltiesCom), // informatif uniquement, pas dans le net CTP
    frais: round2(frais.royaltiesFrais),
    courtage: round2(honoraires.courtage.royalties),
    amo: round2(honoraires.amo.royaltiesTotal),
  }

  // Royalties réellement supportées dans le flux CTP
  const royaltiesTotal = round2(
    royalties.frais +
      royalties.courtage +
      royalties.amo
  )

  const encaissements = {
    commissionsTTC: round2(commissions.comTTC),
    honorairesTTC: round2(honoraires.totalTTC),
    fraisTTC: round2(frais.fraisTTC),
    brutCTP: round2(commissions.comTTC + honoraires.totalTTC + frais.fraisTTC),
  }

  const gainsBruts = {
    agente: round2(
      commissions.gainsBruts.agente +
        honoraires.gainsBruts.agente +
        frais.gainsBruts.agente
    ),
    admin: round2(
      commissions.gainsBruts.admin +
        honoraires.gainsBruts.admin +
        frais.gainsBruts.admin
    ),
  }

  const gainsNets = {
    agente: round2(gainsBruts.agente - apporteur.parts.agente),
    admin: round2(gainsBruts.admin - apporteur.parts.admin),
  }

  const netAgenceAvantApporteur = round2(encaissements.brutCTP - royaltiesTotal)
  const netAgence = round2(netAgenceAvantApporteur - apporteur.totalTTC)

  return {
    dossierId: dossier?.id || null,
    reference: dossier?.reference || null,
    typologie: dossier?.typologie || null,

    settings: {
      partAgente,
      partAdmin,
      tauxCourtage: getTauxCourtage(dossier),
      tauxAmo: getTauxAmo(dossier),
      apporteurMode: getApporteurMode(dossier),
      apporteurTaux: getApporteurTaux(dossier),
    },

    totals: {
      totalDevisHTSignes,
      totalDevisTTCSignes,
      totalDevisHTActifs: round2(commissions.totalMontantHT),
      totalDevisTTCActifs: round2(commissions.totalMontantTTC),
    },

    commissions,
    honoraires,
    frais,
    apporteur,

    royalties: {
      ...royalties,
      total: royaltiesTotal,
    },

    encaissements,

    gains: {
      bruts: gainsBruts,
      nets: gainsNets,
      totalNetAvantApporteur: round2(gainsBruts.agente + gainsBruts.admin),
      totalNet: round2(gainsNets.agente + gainsNets.admin),
    },

    agence: {
      netAvantApporteur: netAgenceAvantApporteur,
      net: netAgence,
    },
  }
}

export function calculateFinancesForDossiers(dossiers) {
  const list = Array.isArray(dossiers) ? dossiers : []
  const results = list.map((dossier) => calculateDossierFinance(dossier))

  const summary = results.reduce(
    (acc, item) => {
      acc.totalDevisHTSignes += item.totals.totalDevisHTSignes
      acc.totalDevisTTCSignes += item.totals.totalDevisTTCSignes

      acc.commissionsHT += item.commissions.comHT
      acc.commissionsTTC += item.commissions.comTTC

      acc.honorairesTTC += item.honoraires.totalTTC
      acc.fraisTTC += item.frais.fraisTTC
      acc.apporteurTTC += item.apporteur.totalTTC

      acc.royaltiesCom += item.royalties.com
      acc.royaltiesFrais += item.royalties.frais
      acc.royaltiesCourtage += item.royalties.courtage
      acc.royaltiesAmo += item.royalties.amo
      acc.royaltiesTotal += item.royalties.total

      acc.encaissementsBruts += item.encaissements.brutCTP

      acc.gainsAgente += item.gains.nets.agente
      acc.gainsAdmin += item.gains.nets.admin
      acc.gainsTotal += item.gains.totalNet

      acc.netAgence += item.agence.net

      return acc
    },
    {
      totalDevisHTSignes: 0,
      totalDevisTTCSignes: 0,

      commissionsHT: 0,
      commissionsTTC: 0,

      honorairesTTC: 0,
      fraisTTC: 0,
      apporteurTTC: 0,

      royaltiesCom: 0,
      royaltiesFrais: 0,
      royaltiesCourtage: 0,
      royaltiesAmo: 0,
      royaltiesTotal: 0,

      encaissementsBruts: 0,

      gainsAgente: 0,
      gainsAdmin: 0,
      gainsTotal: 0,

      netAgence: 0,
    }
  )

  return {
    dossiers: results,
    summary: Object.fromEntries(
      Object.entries(summary).map(([key, value]) => [key, round2(value)])
    ),
  }
}