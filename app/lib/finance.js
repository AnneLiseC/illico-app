// app/lib/finance.js
// Source de vérité unique pour tous les calculs financiers illiCO travaux

export const TVA_FRAIS = 1.2      // frais de consultation = TVA 20%
export const TVA_TRAVAUX = 1.1    // devis travaux = TVA 10% (fallback TTC si montant_ttc absent)
export const ROYALTIES_RATE = 0.05
export const COURTAGE_STANDARD = 0.06
export const AMO_STANDARD = 0.09
export const DEFAULT_PART_AGENTE = 0.5   // part agente par défaut (référent non-admin)

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
  return DEFAULT_PART_AGENTE
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
  return { totalHT, totalTTC }
}

// ─────────────────────────────────────────────────────────────────────────────
// TS-1 — Travaux Supplémentaires (re-ventilation courtage → AMO, cas AMO)
// ─────────────────────────────────────────────────────────────────────────────
// Un devis signé APRÈS le paiement du courtage (« pivot ») voit sa part courtage
// basculer en AMO : la ligne courtage est close, seul l'AMO continue de grossir.
// Re-ventilation PURE : total honoraires / royalties / partage INCHANGÉS, seule
// la répartition courtage↔AMO se déplace. Cas AMO uniquement (courtage-only = TS-2).

// Pivot = date_paiement de la ligne de suivi honoraires_courtage RÉGLÉE.
// Absent / non réglé / date invalide → null (fallback sûr : calcul actuel intact).
// Exporté pour TS-2 (courtage-only) — corps INCHANGÉ (déjà écrit pour TS-1).
export function getPivotCourtage(dossier) {
  const suivi = Array.isArray(dossier?.suivi_financier) ? dossier.suivi_financier : []
  const ligne = suivi.find(s =>
    s?.type_echeance === 'honoraires_courtage' &&
    s?.statut_client === 'regle' &&
    isTruthyDate(s?.date_paiement)
  )
  if (!ligne) return null
  const d = new Date(ligne.date_paiement)
  return Number.isNaN(d.getTime()) ? null : d
}

// Sous-total (HT/TTC) des devis dont date_signature > pivot (comparaison STRICTE :
// même jour que le pivot = NON-TS). Devis sans date_signature EXCLUS (comptés
// ≤ pivot, donc non-TS). pivot null → { htApres: 0, ttcApres: 0 }.
// Exporté pour TS-2 (courtage-only) — corps INCHANGÉ (déjà écrit pour TS-1).
export function sousTotalApresPivot(devisList, pivot) {
  if (!pivot) return { htApres: 0, ttcApres: 0 }
  const pivotTime = pivot.getTime()
  const apres = (Array.isArray(devisList) ? devisList : []).filter(dv => {
    if (!isTruthyDate(dv?.date_signature)) return false
    const d = new Date(dv.date_signature)
    return !Number.isNaN(d.getTime()) && d.getTime() > pivotTime
  })
  const htApres  = round2(apres.reduce((s, dv) => s + toNumber(dv.montant_ht), 0))
  const ttcApres = round2(apres.reduce((s, dv) => {
    if (dv.montant_ttc !== undefined && dv.montant_ttc !== null) return s + toNumber(dv.montant_ttc)
    return s + toNumber(dv.montant_ht) * TVA_TRAVAUX
  }, 0))
  return { htApres, ttcApres }
}

// ─────────────────────────────────────────────────────────────────────────────
// TS-2 — Travaux Supplémentaires (cas COURTAGE-ONLY : encaissement supplémentaire)
// ─────────────────────────────────────────────────────────────────────────────
// Un devis signé APRÈS le pivot (paiement du courtage initial) sur un dossier
// COURTAGE génère un supplément de courtage à encaisser (montant_TS × taux). C'est
// un SUPPLÉMENT (nouvelle ligne honoraires_courtage_ts), PAS une re-ventilation :
// le total courtage dû (base complète × taux) est INCHANGÉ, seulement ventilé en
// « initial » (base hors TS) + « TS » (base post-pivot).
//
// AUCUN impact sur honorairesCore ni les 3 wrappers : fonction PURE, indépendante,
// lue seulement par le front (déclenchement + affichage). AMO → montantTSttc = 0
// (getPivotCourtage lu ici, mais on gate sur typologie='courtage' ; le cas AMO reste
// géré par la re-ventilation TS-1).
export function calculateCourtageTS(dossier) {
  const zero = { montantTSttc: 0, courtageInitialTtc: 0, courtageTotalTtc: 0 }
  if (dossier?.typologie !== 'courtage') return zero

  const taux = getTauxCourtage(dossier)
  const { totalTTC } = getSignedTotals(dossier)          // base complète signés (TTC)
  const courtageTotalTtc = round2(totalTTC * taux)       // total courtage dû (INCHANGÉ)

  const pivot = getPivotCourtage(dossier)
  if (!pivot) return { ...zero, courtageTotalTtc, courtageInitialTtc: courtageTotalTtc }

  const { ttcApres } = sousTotalApresPivot(getSignedDevis(dossier), pivot)
  const montantTSttc = round2(ttcApres * taux)           // courtage dû sur les TS
  const courtageInitialTtc = round2(courtageTotalTtc - montantTSttc) // base hors TS × taux
  return { montantTSttc, courtageInitialTtc, courtageTotalTtc }
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
    signed,
    refused,
    isApporteur: Boolean(devis?.artisan?.paiement_direct),
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
function honorairesCore(dossier, { totalHT: baseHT, totalTTC: baseTTC, totalHTApres: htApres = 0, totalTTCApres: ttcApres = 0 }) {
  const typologie    = dossier?.typologie || ''
  const partAgente   = getPartAgente(dossier)
  const tauxCourtage = getTauxCourtage(dossier)
  const tauxAmo      = getTauxAmo(dossier)

  const isCourtage = typologie === 'courtage'
  const isAmo      = typologie === 'amo'

  // TS-1 : re-ventilation courtage→AMO. `apres` = sous-total des devis signés
  // après le pivot (posé par les wrappers, AMO + pivot uniquement). Défaut 0 →
  // base courtage pleine → calcul ACTUEL strict (courtage-only : apres toujours 0).
  const reventile    = isAmo && ttcApres > 0
  const baseTTCCourt = reventile ? round2(baseTTC - ttcApres) : baseTTC
  const baseHTCourt  = reventile ? round2(baseHT - htApres) : baseHT

  // Frais remboursés : on retire le PLEIN montant TTC des frais du courtage CALCULÉ
  // (après application du taux), uniquement si frais_statut === 'rembourse'.
  // La base honoraires n'est PAS amputée ; l'AMO n'est PAS affecté.
  const fraisRembourse    = dossier?.frais_statut === 'rembourse'
  const deductionFraisTTC = fraisRembourse ? round2(toNumber(dossier?.frais_consultation) || 0) : 0
  const deductionFraisHT  = fraisRembourse ? round2((toNumber(dossier?.frais_consultation) || 0) / TVA_FRAIS) : 0

  let courtage = { brut: 0, ttc: 0, ht: 0, royalties: 0, net: 0, parts: { agente: 0, admin: 0 } }
  if (isCourtage || isAmo) {
    // brut = base × taux (AVANT déduction frais). net/ttc = brut − frais remboursés.
    // round2(brut − dedFrais) = round2(base×taux − dedFrais) car dedFrais est déjà
    // à 2 décimales → valeur ttc/ht identique à l'existant.
    // TS-1 : base courtage amputée des devis après pivot (baseTTCCourt = baseTTC
    // hors TS ; = baseTTC quand apres=0 → identique à l'existant).
    const brut      = round2(baseTTCCourt * tauxCourtage)
    const htBrut    = round2(baseHTCourt * tauxCourtage)
    const ttc       = round2(brut - deductionFraisTTC)
    const ht        = round2(htBrut - deductionFraisHT)
    const royalties = round2(ht * ROYALTIES_RATE)
    const net       = round2(ht - royalties)
    const parts     = split(net, partAgente)
    courtage = { brut, ttc, ht, royalties, net, parts: { agente: parts.agente, admin: parts.admin } }
  }

  let soldeAmo = { ttc: 0, ht: 0, royalties: 0, net: 0, parts: { agente: 0, admin: 0 } }
  if (isAmo) {
    // AMO = part AMO de toute la base + part courtage BASCULÉE des devis après
    // pivot (taux_courtage + taux_amo sur ttcApres). apres=0 → base × tauxAmo →
    // identique à l'existant.
    const ttc       = reventile
      ? round2((baseTTC - ttcApres) * tauxAmo + ttcApres * (tauxCourtage + tauxAmo))
      : round2(baseTTC * tauxAmo)
    const ht        = reventile
      ? round2((baseHT - htApres) * tauxAmo + htApres * (tauxCourtage + tauxAmo))
      : round2(baseHT * tauxAmo)
    const royalties = round2(ht * ROYALTIES_RATE)
    const net       = round2(ht - royalties)
    const parts     = split(net, partAgente)
    soldeAmo = { ttc, ht, royalties, net, parts: { agente: parts.agente, admin: parts.admin } }
  }

  const totalTTC      = round2(courtage.ttc + soldeAmo.ttc)
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

  return { courtage, soldeAmo, totalTTC, totalRoyalties, totalNet, parts, standard }
}

export function calculateHonorairesFinance(dossier) {
  const { totalHT, totalTTC } = getSignedTotals(dossier)
  // TS-1 (AMO + pivot) : part courtage des devis signés après le pivot basculée en AMO.
  const pivot = dossier?.typologie === 'amo' ? getPivotCourtage(dossier) : null
  const { htApres, ttcApres } = sousTotalApresPivot(getSignedDevis(dossier), pivot)
  const core = honorairesCore(dossier, { totalHT, totalTTC, totalHTApres: htApres, totalTTCApres: ttcApres })

  return {
    totalDevisTTCSignes: totalTTC,
    courtage: core.courtage,
    soldeAmo: core.soldeAmo,
    totalRoyalties: core.totalRoyalties,
    totalNet: core.totalNet,
    standard: core.standard,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SOLDE AMO RÉEL ÉCHELONNÉ — reconnaissance à l'encaissement, tranche par tranche.
// Cohabitation (lot « solde AMO en plusieurs paiements ») :
//   • dossier SANS ligne 'solde_amo_paiement' → renvoie { hasTranches: false } ;
//     les consommateurs gardent alors leur gate tout-ou-rien actuel (INCHANGÉ).
//   • dossier AVEC ≥1 ligne 'solde_amo_paiement' → le réel du solde AMO = Σ des
//     tranches encaissées, chacune reconnue à SA date_paiement (buckets mensuels).
// Dérivation TTC→HT au ratio du composant solde AMO calculé aujourd'hui
// (soldeAmo.ht / soldeAmo.ttc), donc parfaitement cohérent avec l'existant.
// Le PRÉVISIONNEL n'appelle JAMAIS cette fonction (calculateHonorairesPrevi inchangé).
// ─────────────────────────────────────────────────────────────────────────────
export function calculateSoldeAmoReel(dossier) {
  const suivi  = Array.isArray(dossier?.suivi_financier) ? dossier.suivi_financier : []
  const lignes = suivi.filter(s => s?.type_echeance === 'solde_amo_paiement')
  if (lignes.length === 0) return { hasTranches: false }

  // Ratio HT/TTC du composant solde AMO (base × taux). ttc=0 (pas d'AMO) → ratio 0.
  const { soldeAmo } = calculateHonorairesFinance(dossier)
  const ratio      = soldeAmo.ttc > 0 ? soldeAmo.ht / soldeAmo.ttc : 0
  const partAgente = getPartAgente(dossier)

  const tranches = lignes.map(l => {
    const ht        = round2(toNumber(l.montant_ttc) * ratio)
    const royalties = round2(ht * ROYALTIES_RATE)
    const net       = round2(ht - royalties)
    const parts     = split(net, partAgente)
    return {
      date_paiement: l.date_paiement || null,
      ht, net, royalties,
      parts: { agente: parts.agente, admin: parts.admin },
    }
  })

  const recognizedHt        = round2(tranches.reduce((s, t) => s + t.ht, 0))
  const recognizedRoyalties = round2(tranches.reduce((s, t) => s + t.royalties, 0))
  const recognizedNet       = round2(tranches.reduce((s, t) => s + t.net, 0))
  const parts = {
    agente: round2(tranches.reduce((s, t) => s + t.parts.agente, 0)),
    admin:  round2(tranches.reduce((s, t) => s + t.parts.admin, 0)),
  }

  return { hasTranches: true, recognizedHt, recognizedNet, recognizedRoyalties, parts, tranches }
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
  // TS-1 : re-ventilation sur les devis actifs signés après le pivot → la ligne
  // solde_amo à encaisser reflète le courtage tardif basculé.
  const pivot = dossier?.typologie === 'amo' ? getPivotCourtage(dossier) : null
  const { htApres, ttcApres } = sousTotalApresPivot(getActiveDevis(dossier), pivot)
  const core = honorairesCore(dossier, { totalHT, totalTTC, totalHTApres: htApres, totalTTCApres: ttcApres })

  return {
    courtage: core.courtage,
    soldeAmo: core.soldeAmo,
    totalNet: core.totalNet,
    // Asymétrie VOULUE : le prévi expose `parts` (lu par gains.netsPrevi), pas le
    // réel — `honoraires.parts` (réel) a été retiré au nettoyage code mort (aucun
    // lecteur). Ne pas re-ajouter `parts` côté réel « par symétrie ».
    parts: core.parts,
    totalDevisTTCRecus: totalTTC,
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
  // TS-1 (décision actée : le PDF client montre le split courtage/AMO → cohérence).
  const pivot = dossier?.typologie === 'amo' ? getPivotCourtage(dossier) : null
  const recuAccepte = getDevisList(dossier).filter(dv => dv?.statut === 'recu' || dv?.statut === 'accepte')
  const { htApres, ttcApres } = sousTotalApresPivot(recuAccepte, pivot)
  const core = honorairesCore(dossier, { totalHT, totalTTC, totalHTApres: htApres, totalTTCApres: ttcApres })

  return {
    courtage: core.courtage,
    soldeAmo: core.soldeAmo,
    totalNet: core.totalNet,
    parts: core.parts,
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
      enabled: false, actif, mode, tauxApporteur,
      totalHT: 0, parts: { agente: 0, admin: 0 },
      partsReel: { agente: 0, admin: 0 },
      lines: [],
    }
  }

  // Réel = devis dont l'acompte est débloqué côté illiCO (statut_illico === 'recu').
  const suivi = Array.isArray(dossier?.suivi_financier) ? dossier.suivi_financier : []
  const estDebloque = (devisId) => suivi.some(s =>
    s.type_echeance === 'acompte_artisan' && s.devis_id === devisId && s.statut_illico === 'recu'
  )

  let lines = []
  if (mode === 'total_chantier_ht') {
    const baseHT      = round2(signed.reduce((s, dv) => s + toNumber(dv.montant_ht), 0))
    const totalHT     = round2(baseHT * tauxApporteur)
    const parts       = split(totalHT, partAgente)
    const baseHTReel  = round2(signed
      .filter(dv => estDebloque(dv.id))
      .reduce((s, dv) => s + toNumber(dv.montant_ht), 0))
    const totalHTReel = round2(baseHTReel * tauxApporteur)
    const partsReel   = split(totalHTReel, partAgente)
    lines = [{
      type: 'total_chantier_ht', baseHT, totalHT,
      agente: parts.agente, admin: parts.admin,
      agenteReel: partsReel.agente, adminReel: partsReel.admin,
    }]
  } else {
    lines = signed.map(dv => {
      const baseHT    = round2(toNumber(dv.montant_ht))
      const totalHT   = round2(baseHT * tauxApporteur)
      const parts     = split(totalHT, partAgente)
      const debloque  = estDebloque(dv.id)
      return {
        type: 'par_devis',
        devisId: dv.id || null,
        label: dv?.artisan?.entreprise || 'Devis',
        baseHT, totalHT,
        agente: parts.agente, admin: parts.admin,
        agenteReel:  debloque ? parts.agente : 0,
        adminReel:   debloque ? parts.admin : 0,
      }
    })
  }

  const totalHT     = round2(lines.reduce((s, l) => s + l.totalHT, 0))
  const agente      = round2(lines.reduce((s, l) => s + l.agente, 0))
  const admin       = round2(lines.reduce((s, l) => s + l.admin, 0))
  const agenteReel  = round2(lines.reduce((s, l) => s + (l.agenteReel || 0), 0))
  const adminReel   = round2(lines.reduce((s, l) => s + (l.adminReel || 0), 0))

  return {
    enabled: true, actif, mode, tauxApporteur,
    totalHT,
    parts: { agente, admin },
    partsReel: { agente: agenteReel, admin: adminReel },
    lines,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CALCUL COMPLET D'UN DOSSIER
// ─────────────────────────────────────────────────────────────────────────────

export function calculateDossierFinance(dossier) {
  const partAgente = getPartAgente(dossier)

  const frais           = calculateFraisFinance(dossier)
  const commissions     = calculateCommissionsFinance(dossier)
  const honoraires      = calculateHonorairesFinance(dossier)
  const honorairesPrevi = calculateHonorairesPrevi(dossier)
  const apporteur       = calculateApporteurFinance(dossier)

  const royaltiesCommissions = round2(commissions.royaltiesType2)
  const royaltiesFrais       = round2(frais.royalties)
  const royaltiesHonoraires  = round2(honoraires.totalRoyalties)
  const royaltiesTotal       = round2(royaltiesCommissions + royaltiesFrais + royaltiesHonoraires)

  const gainsBrutsPrevi = {
    agente: round2(frais.parts.agente + commissions.parts.agente + honorairesPrevi.parts.agente),
    admin:  round2(frais.parts.admin  + commissions.parts.admin  + honorairesPrevi.parts.admin),
  }
  const gainsNetsPrevi = {
    agente: round2(gainsBrutsPrevi.agente - apporteur.parts.agente),
    admin:  round2(gainsBrutsPrevi.admin  - apporteur.parts.admin),
  }

  return {
    settings: {
      partAgente,
    },
    frais,
    commissions,
    honoraires,
    honorairesPrevi,
    apporteur,
    royalties: {
      total: royaltiesTotal,
    },
    gains: {
      netsPrevi: gainsNetsPrevi,
    },
  }
}
