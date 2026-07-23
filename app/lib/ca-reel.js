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
// « CA généré » = produits nets encaissés (frais + commissions + honoraires)
// − coût apporteur client remboursé, EXACTEMENT comme le KPI « CA généré » de
// Finances. Nécessite que la requête charge dossier.apporteur_actif (+ pourcentage)
// pour que la déduction apporteur s'applique. À périmètre égal, les 3 pages
// (dashboard, stats, finances) affichent le même montant.
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
    // Apporteur client remboursé — COÛT déduit du CA (comme le KPI CA généré de
    // Finances : produits − apporteur), en entier dans les deux modes. Nécessite que
    // le champ dossier.apporteur_actif soit chargé (sinon fin.apporteur.lines est vide).
    const apporteurLines = fin.apporteur?.lines || []
    for (const sf of suivi.filter(s => s.type_echeance === 'apporteur_agente' && s.statut_ctp === 'rembourse' && s.date_paiement)) {
      const dt = new Date(sf.date_paiement)
      if (dt.getFullYear() !== annee) continue
      const ligne = sf.artisan_id == null
        ? apporteurLines.find(l => l.type === 'total_chantier_ht')
        : apporteurLines.find(l => {
            const dv = (d.devis_artisans || []).find(x => x.id === l.devisId)
            return (dv?.artisan_id || dv?.artisan?.id) === sf.artisan_id
          })
      if (ligne?.totalHT) monthly[dt.getMonth() + 1] = (monthly[dt.getMonth() + 1] || 0) - ligne.totalHT
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

// Ventilation du CA réel de l'année par poste (net encaissé) + coût apporteur.
// Mêmes critères que computeCAMensuel. total = frais + commissions + honoraires − apporteur.
export function computeCABreakdown(dossiers, annee) {
  const r2 = (n) => Math.round(((n || 0) + Number.EPSILON) * 100) / 100
  const b = { frais: 0, commissions: 0, honoraires: 0, apporteur: 0 }
  const inYear = (dateStr) => !!dateStr && new Date(dateStr).getFullYear() === annee
  for (const d of dossiers) {
    const nd = normDossier(d)
    const fin = calculateDossierFinance(nd)
    const suivi = d.suivi_financier || []
    if (nd.frais_statut === 'regle') {
      const sf = suivi.find(s => s.type_echeance === 'frais_consultation')
      if (inYear(sf?.date_paiement || nd.date_signature_contrat)) b.frais += fin.frais.net
    }
    const sfC = suivi.find(s => s.type_echeance === 'honoraires_courtage')
    if (sfC?.statut_client === 'regle' && inYear(sfC.date_paiement || nd.date_signature_contrat)) b.honoraires += fin.honoraires.courtage.net
    const soldeAmoR = calculateSoldeAmoReel({ ...nd, suivi_financier: suivi })
    if (soldeAmoR.hasTranches) {
      for (const t of soldeAmoR.tranches) if (inYear(t.date_paiement || nd.date_fin_chantier)) b.honoraires += t.net
    } else {
      const sfA = suivi.find(s => s.type_echeance === 'solde_amo')
      if (nd.typologie === 'amo' && sfA?.statut_client === 'regle' && inYear(sfA.date_paiement || nd.date_fin_chantier)) b.honoraires += fin.honoraires.soldeAmo.net
    }
    for (const dv of getSignedDevis(d)) {
      const sfAc = suivi.find(s => s.type_echeance === 'acompte_artisan' && s.devis_id === dv.id && s.statut_illico === 'recu')
      if (!sfAc || !inYear(sfAc.date_deblocage || sfAc.date_paiement)) continue
      b.commissions += calculateDevisFinance(dv, nd).netCom
    }
    const apporteurLines = fin.apporteur?.lines || []
    for (const sf of suivi.filter(s => s.type_echeance === 'apporteur_agente' && s.statut_ctp === 'rembourse' && s.date_paiement)) {
      if (!inYear(sf.date_paiement)) continue
      const ligne = sf.artisan_id == null
        ? apporteurLines.find(l => l.type === 'total_chantier_ht')
        : apporteurLines.find(l => { const dv = (d.devis_artisans || []).find(x => x.id === l.devisId); return (dv?.artisan_id || dv?.artisan?.id) === sf.artisan_id })
      if (ligne?.totalHT) b.apporteur += ligne.totalHT
    }
  }
  return { frais: r2(b.frais), commissions: r2(b.commissions), honoraires: r2(b.honoraires), apporteur: r2(b.apporteur), total: r2(b.frais + b.commissions + b.honoraires - b.apporteur) }
}

// « Ce qu'on facture au client » (HT) — SEULEMENT ce qu'illiCO facture EN PROPRE :
// frais de consultation + honoraires (courtage + AMO). Les commissions viennent des
// artisans (pas du client) et les devis vont aux artisans → exclus.
//
// Base = FACTURÉ (tous dossiers signés de l'année, par date de signature du contrat),
// qu'ils soient encaissés ou non — c'est différent du « réel encaissé » du reste de la
// page. Montants BRUTS facturés au client (avant parts agente / royalties, qui sont des
// répartitions internes ; le client est facturé le montant plein).
//
// Frais 'offerts' = non facturés (0). courtage.ht / soldeAmo.ht reflètent déjà la
// déduction des frais 'à rembourser' → la somme frais + honoraires ne double-compte
// pas (rembourse : fraisHT + (htBrut − fraisHT) = htBrut).
export function computeFactureClient(dossiers, annee) {
  const r2 = (n) => Math.round(((n || 0) + Number.EPSILON) * 100) / 100
  const b = { frais: 0, honoraires: 0 }
  const parMois = {}
  for (const d of dossiers) {
    const ds = d.date_signature_contrat
    if (!ds || new Date(ds).getFullYear() !== annee) continue
    const nd = normDossier(d)
    const fin = calculateDossierFinance(nd)
    const fraisHT = nd.frais_statut === 'offerts' ? 0 : (fin.frais.fraisHT || 0)
    const honoHT = (fin.honoraires.courtage.ht || 0) + (fin.honoraires.soldeAmo.ht || 0)
    b.frais += fraisHT
    b.honoraires += honoHT
    const m = new Date(ds).getMonth() + 1
    parMois[m] = (parMois[m] || 0) + fraisHT + honoHT
  }
  return { frais: r2(b.frais), honoraires: r2(b.honoraires), total: r2(b.frais + b.honoraires), parMois }
}
