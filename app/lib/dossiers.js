// app/lib/dossiers.js

export const STATUT_CONFIG = {
  a_contacter:          { label: 'À contacter',          color: 'bg-blue-100 text-blue-700' },
  a_relancer:           { label: 'À relancer',            color: 'bg-orange-100 text-orange-700' },
  en_etude:             { label: 'En étude',              color: 'bg-slate-100 text-slate-700' },
  devis_en_attente:     { label: 'Devis en attente',      color: 'bg-yellow-100 text-yellow-700' },
  devis_prets:          { label: 'Devis prêts',           color: 'bg-teal-100 text-teal-700' },
  en_attente_signature: { label: 'En attente signature',  color: 'bg-amber-100 text-amber-700' },
  devis_a_modifier:     { label: 'Devis à modifier',      color: 'bg-red-100 text-red-600' },
  chantier_a_venir:     { label: 'Chantier à venir',      color: 'bg-indigo-100 text-indigo-700' },
  en_cours_chantier:    { label: 'En cours de chantier',  color: 'bg-green-100 text-green-700' },
  termine:              { label: 'Terminé',               color: 'bg-gray-100 text-gray-600' },
  annule:               { label: 'Annulé',                color: 'bg-red-100 text-red-600' },
}

// Calcul du statut dossier — SOURCE DE VÉRITÉ UNIQUE (cascade v2, cf.
// docs/SPEC_redesign_statut.md). Premier match gagne, ordre STRICT.
// dossier.statut ne porte que les overrides MANUELS (NULL/annule/termine) ;
// tout le reste est calculé à la volée. Lit devis_artisans + rendez_vous
// (R3 'presentation_devis', R2 'visite_technique_artisan', 'etude').
// Tolérant : devis_artisans / rendez_vous absents → traités comme [].
export function calcStatut(dossier) {
  if (!dossier) return 'a_contacter' // garde-fou : dossier null (chargement) → défaut inoffensif
  // 1-2 — Overrides manuels (non dérivables). statut peut être NULL.
  if (dossier.statut === 'annule') return 'annule'
  if (dossier.statut === 'termine') return 'termine'

  const devis = dossier.devis_artisans || []
  const rdvs  = dossier.rendez_vous || []

  // Comparaisons sur la DATE seule (ignore l'heure).
  const aujourdhui = new Date(); aujourdhui.setHours(0, 0, 0, 0)
  const dateOnly = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
  const rdvPasse = (type) => rdvs.some(r => r.type_rdv === type && r.date_heure && dateOnly(r.date_heure) <  aujourdhui)
  const rdvFutur = (type) => rdvs.some(r => r.type_rdv === type && r.date_heure && dateOnly(r.date_heure) >= aujourdhui)

  // 3 — Chantier démarré (date renseignée et passée/aujourd'hui).
  if (dossier.date_demarrage_chantier && dateOnly(dossier.date_demarrage_chantier) <= aujourdhui) {
    return 'en_cours_chantier'
  }

  const nbAccepte = devis.filter(d => d.statut === 'accepte').length
  const nbRecu    = devis.filter(d => d.statut === 'recu').length

  // 4 — À retravailler : ≥1 devis « à modifier », OU tous refusés.
  //     AVANT chantier_a_venir : tant qu'un devis est à reprendre, le dossier
  //     n'est pas prêt pour le chantier (ex. 1 accepte + 1 a_modifier).
  const hasAModifier = devis.some(d => d.statut === 'a_modifier')
  const tousRefuses  = devis.length > 0 && devis.every(d => d.statut === 'refuse')
  if (hasAModifier || tousRefuses) return 'devis_a_modifier'

  // 5 — Devis signé(s) et plus rien en attente → chantier à venir.
  if (nbAccepte > 0 && nbRecu === 0) return 'chantier_a_venir'

  // 6 — R3 (présentation devis) passé + il reste ≥1 devis reçu à trancher.
  if (rdvPasse('presentation_devis') && nbRecu > 0) return 'en_attente_signature'

  // 7 — R3 à venir → devis prêts à présenter.
  if (rdvFutur('presentation_devis')) return 'devis_prets'

  // 8 — R2 (visite artisan) passé → devis en cours de collecte.
  if (rdvPasse('visite_technique_artisan')) return 'devis_en_attente'

  // 9 — Phase étude (précoce).
  if (rdvs.some(r => r.type_rdv === 'etude')) return 'en_etude'

  // 10 — À relancer : frais définis non réglés (offerts exclu), pas de mandat, 0 devis.
  const fraisDefinis  = (dossier.frais_consultation ?? 0) > 0
  const fraisNonRegle = dossier.frais_statut !== 'regle' && dossier.frais_statut !== 'offerts'
  if (!dossier.contrat_signe && fraisDefinis && fraisNonRegle && devis.length === 0) return 'a_relancer'

  // 11 — Défaut.
  return 'a_contacter'
}

// 🔹 Filtrage par rôle + onglet
export function getDossiersByScope(dossiers, profile, onglet, agentes) {
  const isAdmin = profile?.role === 'admin'
  if (!isAdmin) return dossiers
  if (onglet === 'tous') return dossiers
  if (onglet === 'moi') return dossiers.filter(d => d.referente?.role === 'admin')
  return dossiers.filter(d => d.referente?.id === onglet)
}

// 🔹 Filtrage global (recherche + statut + typologie)
export function getFilteredDossiers(dossiers, recherche, filtreStatut, filtreTypo, nomClientFn) {
  return dossiers.filter(d => {
    const matchRecherche = `${d.reference} ${nomClientFn(d.client)} ${d.client?.adresse || ''}`
      .toLowerCase()
      .includes(recherche.toLowerCase())

    const matchStatut = filtreStatut === 'tous' || calcStatut(d) === filtreStatut
    const matchTypo = filtreTypo === 'tous' || d.typologie === filtreTypo

    return matchRecherche && matchStatut && matchTypo
  })
}

// 🔹 Alertes devis
export function getAlertesDevis(dossiers, today = new Date()) {
  return dossiers.filter(d => {
    if (!d.date_limite_devis) return false
    if (calcStatut(d) === 'termine' || calcStatut(d) === 'annule') return false
    const limite = new Date(d.date_limite_devis)
    const diff = (limite - today) / (1000 * 60 * 60 * 24)
    return diff <= 7 && diff >= 0
  })
}

// 🔹 Avancement chantier — basé sur 5 JALONS MÉTIER (et non sur l'argent
// encaissé, qui n'est pas l'avancement réel du chantier). Source UNIQUE partagée
// par la barre d'avancement et les pastilles d'étapes de la fiche chantier.
export const ETAPES_LABELS = ['Contact', 'Devis', 'Signature', 'Chantier', 'Livraison']

// Renvoie 5 booléens (jalons franchis), MONOTONES : un jalon franchi implique
// tous les précédents. `devis`/`statut` optionnels : sinon lus/déduits du dossier.
export function calculerEtapes(dossier, devis, statut) {
  if (!dossier) return [false, false, false, false, false] // dossier en cours de chargement
  const dv = devis || dossier?.devis_artisans || []
  const st = statut || calcStatut(dossier)
  const step1 = !!dossier?.contrat_signe                                  // Mandat / contrat signé
  const step2 = dv.length > 0                                             // ≥1 devis
  const step3 = dv.length > 0 && dv.every(d => d.statut !== 'recu')       // devis tous tranchés
  const step4 = !!dossier?.date_demarrage_chantier || st === 'en_cours_chantier' || st === 'termine' // chantier démarré
  const step5 = st === 'termine'                                          // chantier livré
  return [
    step1 || step2 || step3 || step4 || step5,
    step2 || step3 || step4 || step5,
    step3 || step4 || step5,
    step4 || step5,
    step5,
  ]
}

// Avancement 0-100 = part des 5 jalons franchis (0 / 20 / 40 / 60 / 80 / 100).
export function calculerAvancement(dossier, devis, statut) {
  const done = calculerEtapes(dossier, devis, statut).filter(Boolean).length
  return Math.round((done / 5) * 100)
}

// La deadline du DEVIS (date_limite_devis) ne veut plus rien dire une fois le
// dossier signé / en chantier / clos → ne pas afficher de « retard » dessus
// (sinon on obtient des « retard 187j » sur un chantier en cours).
const STATUTS_APRES_DEVIS = ['chantier_a_venir', 'en_cours_chantier', 'termine', 'annule']
export function deadlineDevisPertinente(statut) {
  return !STATUTS_APRES_DEVIS.includes(statut)
}

// Écart en JOURS PLEINS entre une date cible et une référence (défaut : maintenant).
// Robuste au fuseau : compare des dates CIVILES locales (composantes y-m-d), pas des
// instants — un 'YYYY-MM-DD' (minuit UTC) ne décale donc jamais d'un jour.
// >0 = à venir, 0 = aujourd'hui, <0 = passé.
export function diffJours(cible, ref = new Date()) {
  const civ = (v) => {
    if (typeof v === 'string') {
      const [y, m, d] = v.slice(0, 10).split('-').map(Number)
      return new Date(y, (m || 1) - 1, d || 1).getTime()
    }
    const x = new Date(v)
    return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  }
  return Math.round((civ(cible) - civ(ref)) / 86400000)
}

// Jours avant la deadline DEVIS d'un dossier — null si pas de deadline OU hors phase
// devis (dès qu'un dossier est signé/en chantier/clos, cette deadline n'a plus de sens
// → fini les « retard 187j »).
export function joursAvantDeadlineDevis(dossier, ref = new Date()) {
  if (!dossier?.date_limite_devis || !deadlineDevisPertinente(calcStatut(dossier))) return null
  return diffJours(dossier.date_limite_devis, ref)
}

// Badge d'échéance devis — CONVENTION UNIQUE partagée liste + dashboard :
//   <0 → « Retard Nj » (rouge) · 0 → « Aujourd'hui » (ambre) · 1-7 → « J-N » (ambre)
//   >7 → texte null (le composant affiche la date). « J-N » ne désigne JAMAIS un
//   retard (c'était l'incohérence : J-2 = « dans 2 j » ici mais « 2 j de retard » là).
export function badgeDeadlineDevis(dossier, ref = new Date()) {
  const jours = joursAvantDeadlineDevis(dossier, ref)
  if (jours == null) return null
  if (jours < 0)   return { jours, texte: `Retard ${Math.abs(jours)}j`, ton: 'retard' }
  if (jours === 0) return { jours, texte: "Aujourd'hui",                ton: 'urgent' }
  if (jours <= 7)  return { jours, texte: `J-${jours}`,                 ton: 'urgent' }
  return { jours, texte: null, ton: 'normal' }
}

// 🔹 Détection de catégorie d'un document depuis son nom de fichier (upload).
// Anti-faux-positifs CR : on normalise (sans accents, minuscules, sans extension)
// puis on exige soit « compte[-_ ]rendu », soit « CR/C.R. » comme JETON délimité
// (précédé d'un début/non-lettre et non suivi d'une lettre) → « DECRET », « MACRON »,
// « CROQUIS » ne matchent pas. Facture honoraires : « facture » + « honorai(re) ».
// Priorité au CR. Retourne 'compte_rendu' | 'facture_honoraire' | null.
export function detecterCategorie(nom) {
  const base = (nom || '').normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().replace(/\.[^.]+$/, '')
  const estCR =
    /compte[\s_-]?rendus?/.test(base) ||
    /(^|[^a-z])c\.?r(?![a-z])/.test(base)
  const estFactureHonoraire = /facture/.test(base) && /honorai/.test(base)
  return estCR ? 'compte_rendu' : estFactureHonoraire ? 'facture_honoraire' : null
}

// 🔹 Compteurs
export function getCompteurs(dossiers) {
  return {
    aTraiter:   dossiers.filter(d => ['a_contacter', 'a_relancer'].includes(calcStatut(d))).length,
    enDevis:    dossiers.filter(d => ['devis_en_attente', 'devis_a_modifier'].includes(calcStatut(d))).length,
    enChantier: dossiers.filter(d => calcStatut(d) === 'en_cours_chantier').length,
    termines:   dossiers.filter(d => calcStatut(d) === 'termine').length,
    total:      dossiers.length,
  }
}
