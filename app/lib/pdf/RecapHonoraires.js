// app/lib/pdf/RecapHonoraires.js
// Bloc « Récapitulatif honoraires » PARTAGÉ entre les PDF Recap (route.js) et
// DossierSuivi/R3 (restitution.js). Source unique, branché finance.js.
// Props : { dossier, devis, preview }. Autonome (styles + fmt + pct internes).
// Écrit en React.createElement (pas de JSX) pour être rendu/testé directement en node.
import React from 'react'
import { Text, View, StyleSheet } from '@react-pdf/renderer'
import './fonts.js'
import {
  calculateHonorairesFinance,
  calculateHonorairesRecuAccepte,
  COURTAGE_STANDARD,
  AMO_STANDARD,
} from '../finance.js'

const h = React.createElement

const BLEU = '#00578e'
const BLEU_CLAIR = '#2f8dcb'
const ORANGE = '#f97316'
const ORANGE_FONCE = '#c2410c'
const VIOLET = '#7c3aed'
const GRIS = '#94a3b8'

const S = StyleSheet.create({
  section:      { marginTop: 10 },
  sectionTitle: { fontSize: 10, fontFamily: 'Roboto-Bold', color: BLEU, marginBottom: 5, paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: BLEU_CLAIR },
  blocC:        { borderLeftWidth: 3, borderLeftColor: BLEU_CLAIR, paddingLeft: 8, marginBottom: 8 },
  blocA:        { borderLeftWidth: 3, borderLeftColor: ORANGE, paddingLeft: 8, marginBottom: 8 },
  blocTitleC:   { fontSize: 8.5, fontFamily: 'Roboto-Bold', color: BLEU, marginBottom: 4 },
  blocTitleA:   { fontSize: 8.5, fontFamily: 'Roboto-Bold', color: ORANGE_FONCE, marginBottom: 4 },
  niveau:       { fontSize: 7.5, color: '#64748b', fontStyle: 'italic', marginTop: 4, marginBottom: 1 },
  row:          { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  label:        { fontSize: 8.5, color: '#333333', flex: 1, paddingRight: 12 },
  value:        { fontSize: 8.5, fontFamily: 'Roboto-Bold' },
  remiseRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2, marginTop: 2 },
  remiseLabel:  { fontSize: 7.5, fontStyle: 'italic', flex: 1, paddingRight: 12 },
  remiseValue:  { fontSize: 7.5, fontFamily: 'Roboto-Bold' },
  statutCol:    { fontSize: 7.5, color: GRIS, fontStyle: 'italic', marginRight: 8 },
  totalHonRow:  { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2, borderTopWidth: 1, borderTopColor: '#e5e7eb', marginTop: 2 },
  totalHonLbl:  { fontSize: 8, fontFamily: 'Roboto-Bold', flex: 1 },
  totalHonVal:  { fontSize: 8, fontFamily: 'Roboto-Bold' },
  tc:           { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, paddingHorizontal: 6, borderRadius: 4, marginTop: 4 },
  tcStd:        { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, paddingHorizontal: 6, borderRadius: 4, marginTop: 4, backgroundColor: GRIS },
  tcLabel:      { color: 'white', fontSize: 9, fontFamily: 'Roboto-Bold' },
  tcValue:      { color: 'white', fontSize: 9, fontFamily: 'Roboto-Bold' },
})

const fmt = (n) => {
  const v = (Number(n) || 0).toFixed(2)
  const [int, dec] = v.split('.')
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + dec + ' €'
}
// Pourcentage à la française : 1 décimale, virgule (ex. « 6,0% », « 14,4% »).
const pct = (taux) => (taux * 100).toFixed(1).replace('.', ',') + '%'
const toNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const round2 = (n) => Math.round((toNum(n) + Number.EPSILON) * 100) / 100

const ligneHon = (label, value, key) =>
  h(View, { key, style: S.row }, h(Text, { style: S.label }, label), h(Text, { style: S.value }, fmt(value)))
// TS-2 : ligne de ventilation courtage (initial / travaux supplémentaires). Statut
// optionnel (affiché dans le Suivi_Financier, omis dans le Recap_Financier preview).
const ligneVentil = (label, value, statut, key) =>
  h(View, { key, style: S.row },
    h(Text, { style: S.label }, label),
    statut ? h(Text, { style: S.statutCol }, statut) : null,
    h(Text, { style: S.value }, fmt(value)))
const ligneRemise = (label, value, color, key) =>
  h(View, { key, style: S.remiseRow }, h(Text, { style: [S.remiseLabel, { color }] }, label), h(Text, { style: [S.remiseValue, { color }] }, '— ' + fmt(value)))
const totalHon = (tauxLabel, value, key) =>
  h(View, { key, style: S.totalHonRow }, h(Text, { style: S.totalHonLbl }, `Total honoraire (${tauxLabel})`), h(Text, { style: S.totalHonVal }, fmt(value)))
const totalChantier = (label, value, { std, bg } = {}, key) =>
  h(View, { key, style: std ? S.tcStd : [S.tc, { backgroundColor: bg }] }, h(Text, { style: S.tcLabel }, label), h(Text, { style: S.tcValue }, fmt(value)))

export default function RecapHonoraires({ dossier, devis, suiviFinancier, preview = false }) {
  const typologie = dossier?.typologie || ''
  if (!['courtage', 'amo'].includes(typologie)) return null

  // suivi_financier fusionné dans le dossier → getPivotCourtage lit le pivot (TS-1).
  // Preview : suiviFinancier volontairement vide côté appelant → pivot null → pas de TS.
  const dossierCalc = { ...dossier, devis_artisans: devis, suivi_financier: suiviFinancier || [] }
  const f = preview
    ? calculateHonorairesRecuAccepte(dossierCalc)
    : calculateHonorairesFinance(dossierCalc)

  const baseTTC = preview ? f.totalDevisTTCRecuAccepte : f.totalDevisTTCSignes
  if (!(baseTTC > 0)) return null

  const tauxCourtage = toNum(dossier.taux_courtage ?? 0.06)
  const tauxAmo      = toNum(dossier.honoraires_amo_taux ?? 9) / 100

  const courtageReel = f.courtage.brut            // base × taux courtage (BRUT, avant frais)
  const courtageStd  = f.standard.courtageTTCBrut // base × 6%
  const soldeAmoReel = f.soldeAmo.ttc             // base × taux AMO (0 si typologie courtage)
  const amoStd       = f.standard.amoTTC          // base × 9%

  const fraisTTC       = toNum(dossier.frais_consultation)
  const fraisStatut    = dossier.frais_statut
  const fraisInTable   = fraisTTC > 0 && fraisStatut !== 'offerts' && fraisStatut !== 'rembourse'
  const fraisRembourse = fraisStatut === 'rembourse' && fraisTTC > 0
  const totalFraisTable = fraisInTable ? fraisTTC : 0
  const fraisComp      = totalFraisTable - (fraisRembourse ? fraisTTC : 0) // composante frais du total chantier

  const isAMO   = typologie === 'amo'
  const hasNego = (devis || []).some(d => ['recu', 'a_modifier', 'en_attente'].includes(d?.statut))
  const showAMO = isAMO || hasNego // courtage : scénario AMO simulé si ≥1 devis en négociation

  const courtageRemise = tauxCourtage < COURTAGE_STANDARD

  // ── TS-2 : ventilation courtage initial / travaux supplémentaires (courtage-only) ──
  // On REMPLACE la ligne courtage unique par : initial + une ligne par honoraires_courtage_ts.
  // Total INCHANGÉ (= courtageReel) : initial = courtageReel − Σ(lignes TS persistées), donc
  // initial + Σ TS = courtageReel exactement (valable preview ET réel, pas de double comptage).
  // On lit les montant_ttc PERSISTÉS des lignes (source de vérité de l'encaissement), pas un
  // recalcul — d'où l'indépendance à l'écart de base preview/signés. AMO / sans TS → non touché.
  const tsLines = typologie === 'courtage'
    ? (suiviFinancier || [])
        .filter(s => s?.type_echeance === 'honoraires_courtage_ts')
        .sort((a, b) => new Date(a?.created_at || 0) - new Date(b?.created_at || 0))
    : []
  const sumTs = round2(tsLines.reduce((s, l) => s + toNum(l?.montant_ttc), 0))
  const hasTS = tsLines.length > 0 && sumTs > 0
  // Statut : Suivi_Financier (réel) l'affiche ; Recap_Financier (preview) l'omet.
  const statutTxt = (ligne) => {
    if (ligne?.statut_client === 'regle') {
      const d = ligne.date_paiement ? new Date(ligne.date_paiement).toLocaleDateString('fr-FR') : null
      return d ? `réglé le ${d}` : 'réglé'
    }
    return 'en attente'
  }
  // Lignes de la partie « votre tarif » courtage : ventilées si TS, sinon la ligne unique actuelle.
  const courtageReelLignes = (kp) => {
    if (!hasTS) return [ligneHon('Honoraires courtage — à la signature des devis', courtageReel, kp + '-hr')]
    const suiviCourtage = (suiviFinancier || []).find(s => s?.type_echeance === 'honoraires_courtage')
    const out = [
      ligneVentil('Honoraires courtage — initial', round2(courtageReel - sumTs), preview ? null : statutTxt(suiviCourtage), kp + '-init'),
    ]
    tsLines.forEach((l, i) => {
      const lbl = `Courtage — travaux supplémentaires${tsLines.length > 1 ? ` (TS ${i + 1})` : ''}`
      out.push(ligneVentil(lbl, toNum(l?.montant_ttc), preview ? null : statutTxt(l), `${kp}-ts${i}`))
    })
    return out
  }

  // ── Scénario COURTAGE ──
  const totalChCourtageStd  = baseTTC + courtageStd + fraisComp
  const totalChCourtageReel = baseTTC + courtageReel + fraisComp
  const courtageChildren = [
    h(Text, { key: 't', style: S.blocTitleC }, `Honoraires illiCO travaux COURTAGE (${pct(COURTAGE_STANDARD)})`),
  ]
  if (courtageRemise) {
    courtageChildren.push(
      h(Text, { key: 'ns', style: S.niveau }, 'Tarif standard'),
      ligneHon('Honoraires courtage — à la signature des devis', courtageStd, 'hs'),
      totalHon(pct(COURTAGE_STANDARD), courtageStd, 'ths'),
      totalChantier('TOTAL CHANTIER si COURTAGE (tarif standard)', totalChCourtageStd, { std: true }, 'tcs'),
      ligneRemise(`Remise commerciale sur honoraire courtage (${pct(COURTAGE_STANDARD - tauxCourtage)})`, courtageStd - courtageReel, BLEU, 'rem'),
      h(Text, { key: 'nr', style: S.niveau }, 'Votre tarif'),
      ...courtageReelLignes('cr'),
      totalHon(pct(tauxCourtage), courtageReel, 'thr'),
      totalChantier('TOTAL CHANTIER si COURTAGE', totalChCourtageReel, { bg: BLEU }, 'tcr'),
    )
  } else {
    courtageChildren.push(
      ...courtageReelLignes('cn'),
      totalHon(pct(tauxCourtage), courtageReel, 'thr'),
      totalChantier('TOTAL CHANTIER si COURTAGE', totalChCourtageReel, { bg: BLEU }, 'tcr'),
    )
  }
  const blocCourtage = h(View, { key: 'courtage', style: S.blocC }, ...courtageChildren)

  // ── Scénario AMO (réel si typologie amo, sinon simulé : courtage réel + AMO 9% non remisé) ──
  let blocAMO = null
  if (showAMO) {
    const simule        = !isAMO
    const soldeReel     = simule ? amoStd : soldeAmoReel
    const tauxAmoReel   = simule ? AMO_STANDARD : tauxAmo
    const amoRemise     = isAMO && tauxAmo < AMO_STANDARD
    const remise        = courtageRemise || amoRemise
    const honStd        = courtageStd + amoStd
    const honReel       = courtageReel + soldeReel
    const totalChAmoStd  = baseTTC + honStd + fraisComp
    const totalChAmoReel = baseTTC + honReel + fraisComp
    const tauxCombineStd  = COURTAGE_STANDARD + AMO_STANDARD
    const tauxCombineReel = tauxCourtage + tauxAmoReel
    const amoChildren = [
      h(Text, { key: 't', style: S.blocTitleA }, `Honoraires illiCO travaux AMO (${pct(tauxCombineStd)})`),
    ]
    if (remise) {
      amoChildren.push(
        h(Text, { key: 'ns', style: S.niveau }, 'Tarif standard'),
        ligneHon(`Acompte AMO (${pct(COURTAGE_STANDARD)}) — à la signature des devis`, courtageStd, 'as'),
        ligneHon(`Solde AMO (${pct(AMO_STANDARD)}) — à l'avancement du chantier`, amoStd, 'ss'),
        totalHon(pct(tauxCombineStd), honStd, 'ths'),
        totalChantier('TOTAL CHANTIER si AMO (tarif standard)', totalChAmoStd, { std: true }, 'tcs'),
      )
      if (courtageRemise) amoChildren.push(ligneRemise(`Remise commerciale sur honoraire courtage (${pct(COURTAGE_STANDARD - tauxCourtage)})`, courtageStd - courtageReel, BLEU, 'remc'))
      if (amoRemise)      amoChildren.push(ligneRemise(`Remise commerciale sur honoraire AMO (${pct(AMO_STANDARD - tauxAmo)})`, amoStd - soldeAmoReel, ORANGE, 'rema'))
      amoChildren.push(
        h(Text, { key: 'nr', style: S.niveau }, 'Votre tarif'),
        ligneHon(`Acompte AMO (${pct(tauxCourtage)}) — à la signature des devis`, courtageReel, 'ar'),
        ligneHon(`Solde AMO (${pct(tauxAmoReel)}) — à l'avancement du chantier`, soldeReel, 'sr'),
        totalHon(pct(tauxCombineReel), honReel, 'thr'),
        totalChantier('TOTAL CHANTIER si AMO', totalChAmoReel, { bg: ORANGE_FONCE }, 'tcr'),
      )
    } else {
      amoChildren.push(
        ligneHon(`Acompte AMO (${pct(tauxCourtage)}) — à la signature des devis`, courtageReel, 'ar'),
        ligneHon(`Solde AMO (${pct(tauxAmoReel)}) — à l'avancement du chantier`, soldeReel, 'sr'),
        totalHon(pct(tauxCombineReel), honReel, 'thr'),
        totalChantier('TOTAL CHANTIER si AMO', totalChAmoReel, { bg: ORANGE_FONCE }, 'tcr'),
      )
    }
    blocAMO = h(View, { key: 'amo', style: S.blocA }, ...amoChildren)
  }

  const fraisRemiseLine = fraisRembourse
    ? h(View, { key: 'fr', style: [S.remiseRow, { marginBottom: 6 }] },
        h(Text, { style: [S.remiseLabel, { color: VIOLET }] }, 'Remise commerciale sur frais de consultation'),
        h(Text, { style: [S.remiseValue, { color: VIOLET }] }, '— ' + fmt(fraisTTC)))
    : null

  return h(View, { style: S.section },
    h(Text, { key: 'title', style: S.sectionTitle }, 'Honoraires illiCO travaux'),
    fraisRemiseLine,
    blocCourtage,
    blocAMO,
  )
}
