// ─────────────────────────────────────────────────────────────────────────────
// CA réel encaissé — SOURCE UNIQUE partagée (dashboard + statistiques).
//
// Critères de reconnaissance IDENTIQUES à la page Finances (la vérité, = ce qui
// est arrivé sur les comptes) :
//   • frais       → dossier.frais_statut === 'regle'
//   • courtage    → suivi honoraires_courtage.statut_client === 'regle'
//   • solde AMO   → tranches encaissées, sinon solde_amo.statut_client === 'regle'
//   • commissions → suivi acompte_artisan.statut_illico === 'recu'
//
// « CA généré » = produits nets encaissés (frais + commissions + honoraires),
// exactement comme le KPI « CA généré » de Finances (qui ne déduit pas non plus
// l'apporteur en pratique : apporteur_actif n'est chargé nulle part). À périmètre
// égal, les 3 pages (dashboard, stats, finances) affichent le même montant.
// ─────────────────────────────────────────────────────────────────────────────
import { calculateDossierFinance, calculateDevisFinance, getSignedDevis, calculateSoldeAmoReel } from './finance'

export const normDossier = (d) => ({
  ...d,
  part_agente:       d.part_agente ?? (d.referente?.role === 'admin' ? 0 : 0.5),
  frais_part_agente: d.frais_part_agente ?? null,
  taux_amo:          d?.honoraires_amo_taux,
  client: d?.client ? {
    ...d.client,
    apporteur_mode: d.client?.apporteur_base === 'total_chantier' ? 'total_chantier_ht' : 'par_devis',
  } : null,
})

// mode 'agence' = net (parts agentes incluses) ; 'societe' = net − parts agentes.
export function computeCAMensuel(dossiers, annee, mode = 'agence') {
  const soc = mode === 'societe'
  const monthly = {}
  const add = (dateStr, net, agente) => {
    const amount = soc ? (net - (agente || 0)) : net
    if (!dateStr || !amount) return
    const d = new Date(dateStr)
    if (d.getFullYear() !== annee) return
    monthly[d.getMonth() + 1] = (monthly[d.getMonth() + 1] || 0) + amount
  }
  for (const d of dossiers) {
    const nd = normDossier(d)
    const fin = calculateDossierFinance(nd)
    const suivi = d.suivi_financier || []
    if (nd.frais_statut === 'regle') {
      const sf = suivi.find(s => s.type_echeance === 'frais_consultation')
      add(sf?.date_paiement || nd.date_signature_contrat, fin.frais.net, fin.frais.parts.agente)
    }
    const sfC = suivi.find(s => s.type_echeance === 'honoraires_courtage')
    if (sfC?.statut_client === 'regle') add(sfC.date_paiement || nd.date_signature_contrat, fin.honoraires.courtage.net, fin.honoraires.courtage.parts.agente)
    const soldeAmoR = calculateSoldeAmoReel({ ...nd, suivi_financier: suivi })
    if (soldeAmoR.hasTranches) {
      for (const t of soldeAmoR.tranches) add(t.date_paiement || nd.date_fin_chantier, t.net, t.parts?.agente)
    } else {
      const sfA = suivi.find(s => s.type_echeance === 'solde_amo')
      if (nd.typologie === 'amo' && sfA?.statut_client === 'regle') add(sfA.date_paiement || nd.date_fin_chantier, fin.honoraires.soldeAmo.net, fin.honoraires.soldeAmo.parts.agente)
    }
    for (const dv of getSignedDevis(d)) {
      const sfAc = suivi.find(s => s.type_echeance === 'acompte_artisan' && s.devis_id === dv.id && s.statut_illico === 'recu')
      if (!sfAc) continue
      const dvFin = calculateDevisFinance(dv, nd)
      add(sfAc.date_deblocage || sfAc.date_paiement, dvFin.netCom, dvFin.parts.agente)
    }
  }
  return monthly
}

// Royalties RÉELLES (redevance franchiseur) — mêmes critères, sommées par poste.
export function computeRoyalties(dossiers, annee) {
  const parMois = {}
  const parPoste = { frais: 0, commissions: 0, honoraires: 0 }
  const add = (dateStr, amount, poste) => {
    if (!dateStr || !amount) return
    const d = new Date(dateStr)
    if (d.getFullYear() !== annee) return
    parMois[d.getMonth() + 1] = (parMois[d.getMonth() + 1] || 0) + amount
    parPoste[poste] += amount
  }
  for (const d of dossiers) {
    const nd = normDossier(d)
    const fin = calculateDossierFinance(nd)
    const suivi = d.suivi_financier || []
    if (nd.frais_statut === 'regle') {
      const sf = suivi.find(s => s.type_echeance === 'frais_consultation')
      add(sf?.date_paiement || nd.date_signature_contrat, fin.frais.royalties, 'frais')
    }
    const sfC = suivi.find(s => s.type_echeance === 'honoraires_courtage')
    if (sfC?.statut_client === 'regle') add(sfC.date_paiement || nd.date_signature_contrat, fin.honoraires.courtage.royalties, 'honoraires')
    const soldeAmoR = calculateSoldeAmoReel({ ...nd, suivi_financier: suivi })
    if (soldeAmoR.hasTranches) {
      for (const t of soldeAmoR.tranches) add(t.date_paiement || nd.date_fin_chantier, t.royalties, 'honoraires')
    } else {
      const sfA = suivi.find(s => s.type_echeance === 'solde_amo')
      if (nd.typologie === 'amo' && sfA?.statut_client === 'regle') add(sfA.date_paiement || nd.date_fin_chantier, fin.honoraires.soldeAmo.royalties, 'honoraires')
    }
    for (const dv of getSignedDevis(d)) {
      const sfAc = suivi.find(s => s.type_echeance === 'acompte_artisan' && s.devis_id === dv.id && s.statut_illico === 'recu')
      if (!sfAc) continue
      const dvFin = calculateDevisFinance(dv, nd)
      add(sfAc.date_deblocage || sfAc.date_paiement, dvFin.royaltiesType2, 'commissions')
    }
  }
  const total = Math.round((parPoste.frais + parPoste.commissions + parPoste.honoraires) * 100) / 100
  return { parMois, parPoste, total }
}
