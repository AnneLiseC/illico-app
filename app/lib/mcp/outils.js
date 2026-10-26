// app/lib/mcp/outils.js
// Les outils du connecteur MCP « BATILIS » — LECTURE SEULE.
//
// Chaque fonction reçoit le client Supabase créé avec le jeton de l'utilisateur (clé
// publique, cf. ./auth.js) : la RLS décide de ce qui est visible. Aucune écriture, aucun
// accès Storage, aucun chemin de fichier renvoyé.
//
// Rien n'est recalculé ici : statut du dossier = calcStatut (dossiers.js), montants =
// finance.js, nom du client = formatNomClient (clients.js), libellé d'action =
// libelleStatut (statutLibelle.js). Ce module met en forme, il ne calcule pas.
//
// Exclusions volontaires (validées) : coordonnées client par défaut, parts agente/admin,
// royalties, commission artisan, apporteur, identifiants Google, chemins de fichiers,
// notes brutes et texte IA des rapports de visite.

import { DateTime } from 'luxon'
import { calcStatut, STATUT_CONFIG } from '../dossiers'
import { formatNomClient } from '../clients'
import { libelleStatut } from '../statutLibelle'
import { TYPES_VISITE } from '../crRegles'
import { calculateDossierFinance, calculateDevisFinance, getTauxCourtage, getTauxAmo } from '../finance'

export class ErreurOutil extends Error {}

// Même message que le dossier n'existe pas OU qu'il n'est pas dans le périmètre : on ne
// révèle jamais l'existence d'un dossier d'un autre tenant.
export const DOSSIER_INTROUVABLE = 'Dossier introuvable.'

export const FUSEAU = 'Europe/Paris'
const LIMITE_LISTE = 200
const PLAGE_RDV_MAX_JOURS = 92
// Seuil « expire bientôt » des attestations : le même que la page Artisans
// (app/artisans/page.js:169, « expire(nt) dans moins de 30 j »).
const ALERTE_EXPIRATION_JOURS = 30
// Statuts d'action FERMÉS : liste identique à CRVisitesPanel.jsx (FERMES, l.287), qui ne
// reporte pas ces actions au rapport suivant. Dupliquée ici car le panneau est un
// composant client React, non importable côté serveur.
export const STATUTS_ACTION_FERMES = ['cloture', 'quitus_transmis', 'acte']

const CLIENT_COLS = 'civilite, nom, prenom, prenom2, nom2, type_client, raison_sociale, forme_juridique, representant_nom, representant_prenom'

async function lire(requete) {
  const { data, error } = await requete
  if (error) {
    // Détail technique au journal serveur uniquement : il porte des noms de tables.
    console.error('[mcp] lecture', error.code, error.message)
    throw new ErreurOutil('Lecture impossible pour le moment. Réessayez dans un instant.')
  }
  return data
}

function statutDossier(d) {
  const code = calcStatut(d)
  return { code, libelle: STATUT_CONFIG[code]?.label || code }
}

function maintenantParis(maintenant) {
  return (maintenant ? DateTime.fromJSDate(maintenant) : DateTime.now()).setZone(FUSEAU)
}

/**
 * Retrouve UN dossier visible par sa référence. Les références ne sont uniques que par
 * agence (contrainte dossiers_agence_reference_key) : si plusieurs dossiers VISIBLES la
 * portent, on demande le code agence plutôt que d'en choisir un.
 */
export async function chercherDossier(supabase, { reference, agence }, select, affiner = q => q) {
  const ref = String(reference || '').trim().toUpperCase()
  if (!ref) throw new ErreurOutil(DOSSIER_INTROUVABLE)
  let lignes = await lire(affiner(
    supabase.from('dossiers')
      .select(`${select}, agence:agences!dossiers_agence_id_fkey(code, nom)`)
      .eq('reference', ref)
  )) || []
  if (agence) {
    const code = String(agence).trim().toUpperCase()
    lignes = lignes.filter(d => String(d.agence?.code || '').toUpperCase() === code)
  }
  if (lignes.length === 0) throw new ErreurOutil(DOSSIER_INTROUVABLE)
  if (lignes.length > 1) {
    const codes = lignes.map(d => d.agence?.code || '?').join(', ')
    throw new ErreurOutil(`Plusieurs dossiers portent la référence ${ref} (agences : ${codes}). Précisez le paramètre « agence ».`)
  }
  return lignes[0]
}

// ── mes_dossiers ──────────────────────────────────────────────────────────────
export async function mesDossiers(supabase, { statut, typologie, inclure_archives = false, recherche } = {}) {
  let q = supabase.from('dossiers')
    .select(`id, reference, typologie, statut, archive, adresse_chantier, frais_consultation, frais_statut,
      contrat_signe, date_premier_rdv, date_signature_contrat, date_demarrage_chantier, date_fin_chantier, date_cloture,
      agence:agences!dossiers_agence_id_fkey(code),
      client:clients!dossiers_client_id_fkey(${CLIENT_COLS}),
      devis_artisans!devis_artisans_dossier_id_fkey(statut),
      rendez_vous!rendez_vous_dossier_id_fkey(type_rdv, date_heure)`)
    .order('created_at', { ascending: false })
  if (!inclure_archives) q = q.eq('archive', false)
  if (typologie) q = q.eq('typologie', typologie)

  const filtre = String(recherche || '').trim().toLowerCase()
  const dossiers = (await lire(q) || [])
    .map(d => ({ d, s: statutDossier(d), client: formatNomClient(d.client) }))
    .filter(({ s }) => !statut || s.code === statut)
    .filter(({ d, client }) => !filtre ||
      [d.reference, client, d.adresse_chantier].some(v => String(v || '').toLowerCase().includes(filtre)))

  return {
    nombre: dossiers.length,
    tronque: dossiers.length > LIMITE_LISTE,
    dossiers: dossiers.slice(0, LIMITE_LISTE).map(({ d, s, client }) => ({
      reference: d.reference,
      agence: d.agence?.code || null,
      client,
      typologie: d.typologie,
      statut: s,
      archive: d.archive,
      adresse_chantier: d.adresse_chantier,
      dates: {
        premier_rdv: d.date_premier_rdv,
        signature_contrat: d.date_signature_contrat,
        demarrage_chantier: d.date_demarrage_chantier,
        fin_chantier: d.date_fin_chantier,
        cloture: d.date_cloture,
      },
    })),
  }
}

// ── lire_dossier ──────────────────────────────────────────────────────────────
export async function lireDossier(supabase, { reference, agence, avec_coordonnees = false }) {
  const coords = avec_coordonnees ? ', email, telephone, email2, telephone2' : ''
  const d = await chercherDossier(supabase, { reference, agence },
    `id, reference, typologie, statut, archive, description, adresse_chantier, frais_consultation, frais_statut,
     contrat_signe, date_signature_contrat, date_premier_rdv, date_limite_devis, date_demarrage_chantier,
     date_fin_chantier, date_cloture, acces_expire_le, taux_courtage, honoraires_amo_taux,
     referente:profiles!dossiers_referente_id_fkey(prenom, nom),
     client:clients!dossiers_client_id_fkey(${CLIENT_COLS}, adresse${coords}),
     devis_artisans!devis_artisans_dossier_id_fkey(statut),
     rendez_vous!rendez_vous_dossier_id_fkey(type_rdv, date_heure)`)
  const c = d.client
  return {
    reference: d.reference,
    agence: d.agence ? { code: d.agence.code, nom: d.agence.nom } : null,
    typologie: d.typologie,
    statut: statutDossier(d),
    archive: d.archive,
    description: d.description,
    adresse_chantier: d.adresse_chantier,
    referente: d.referente ? `${d.referente.prenom || ''} ${d.referente.nom || ''}`.trim() : null,
    client: c ? {
      nom: formatNomClient(c, { civilite: true, withRepresentant: true }),
      type: c.type_client,
      adresse: c.adresse,
      ...(avec_coordonnees ? { email: c.email, telephone: c.telephone, email2: c.email2, telephone2: c.telephone2 } : {}),
    } : null,
    contrat: { signe: d.contrat_signe, date_signature: d.date_signature_contrat },
    frais_consultation: { ttc: d.frais_consultation, statut: d.frais_statut },
    taux: {
      unite: 'fraction (0.06 = 6 %)',
      courtage: getTauxCourtage(d),
      amo: d.typologie === 'amo' ? getTauxAmo(d) : null,
    },
    dates: {
      premier_rdv: d.date_premier_rdv,
      limite_devis: d.date_limite_devis,
      demarrage_chantier: d.date_demarrage_chantier,
      fin_chantier: d.date_fin_chantier,
      cloture: d.date_cloture,
      acces_client_expire_le: d.acces_expire_le,
    },
  }
}

// ── devis_du_dossier ──────────────────────────────────────────────────────────
export async function devisDuDossier(supabase, { reference, agence }) {
  const d = await chercherDossier(supabase, { reference, agence },
    `id, reference, devis_artisans!devis_artisans_dossier_id_fkey(id, numero_devis, statut, montant_ht, montant_ttc,
      ttc_manuel, date_reception, date_limite, date_signature, acompte_pourcentage, acompte_montant_fixe,
      hors_honoraires, notes, ordre, created_at,
      artisan:artisans!devis_artisans_artisan_id_fkey(entreprise, metier))`,
    q => q.order('ordre', { referencedTable: 'devis_artisans' }).order('created_at', { referencedTable: 'devis_artisans' }))
  return {
    reference: d.reference,
    devis: (d.devis_artisans || []).map(dv => {
      const f = calculateDevisFinance(dv, d)
      return {
        entreprise: dv.artisan?.entreprise || null,
        metier: dv.artisan?.metier || null,
        numero: dv.numero_devis,
        statut: dv.statut,
        signe: f.signed,
        montant: { ht: dv.montant_ht, ttc: dv.montant_ttc, ttc_saisi_manuellement: dv.ttc_manuel },
        acompte: {
          mode: f.acompteMode,
          pourcentage: f.acompteMode === 'pourcentage' ? f.acomptePct : null,
          montant_ttc: f.acompte,
        },
        solde_apres_acompte_ttc: f.solde,
        hors_honoraires: dv.hors_honoraires === true,
        dates: { reception: dv.date_reception, limite: dv.date_limite, signature: dv.date_signature },
        notes: dv.notes,
      }
    }),
  }
}

// ── finances_du_dossier ───────────────────────────────────────────────────────
// Même sélection et même appel que l'écran du dossier (chantiers/[id]/page.js :
// chargement l.893-902, calcul l.2973) → mêmes chiffres au centime.
export async function financesDuDossier(supabase, { reference, agence }) {
  const d = await chercherDossier(supabase, { reference, agence },
    `*,
     referente:profiles!dossiers_referente_id_fkey(id, prenom, nom, role),
     client:clients!dossiers_client_id_fkey(*),
     devis_artisans!devis_artisans_dossier_id_fkey(*, artisan:artisans!devis_artisans_artisan_id_fkey(id, entreprise, metier, partenaire, paiement_direct)),
     suivi_financier!suivi_financier_dossier_id_fkey(*)`,
    q => q.order('ordre', { referencedTable: 'devis_artisans' }).order('created_at', { referencedTable: 'devis_artisans' }))

  const devis = d.devis_artisans || []
  const suivi = d.suivi_financier || []
  const fin = calculateDossierFinance({ ...d, devis_artisans: devis, suivi_financier: suivi })
  const entreprise = Object.fromEntries(devis.filter(dv => dv.artisan).map(dv => [dv.artisan_id, dv.artisan.entreprise]))
  const h = fin.honoraires
  const p = fin.honorairesPrevi

  return {
    reference: d.reference,
    typologie: d.typologie,
    lecture: 'Honoraires « courtage » et « solde_amo » sont deux composantes : '
      + 'à l\'écran, honoraires AMO = courtage.ttc + solde_amo.ttc ; honoraires courtage = courtage.ttc.',
    synthese: {
      source: 'app/lib/finance.js (calculateDossierFinance)',
      travaux_signes_ttc: h.totalDevisTTCSignes,
      honoraires_signes: {
        courtage: { ht: h.courtage.ht, ttc: h.courtage.ttc },
        solde_amo: { ht: h.soldeAmo.ht, ttc: h.soldeAmo.ttc },
        tarif_standard_ttc: { courtage: h.standard.courtageTTC, amo: h.standard.amoTTC },
        devis_hors_honoraires: { ht: h.exclu.ht, ttc: h.exclu.ttc },
      },
      honoraires_previsionnels: {
        travaux_actifs_ttc: p.totalDevisTTCRecus,
        courtage: { ht: p.courtage.ht, ttc: p.courtage.ttc },
        solde_amo: { ht: p.soldeAmo.ht, ttc: p.soldeAmo.ttc },
      },
      frais_consultation: { ht: fin.frais.fraisHT, ttc: d.frais_consultation, statut: d.frais_statut },
    },
    echeances: suivi
      .filter(s => s.type_echeance !== 'apporteur_agente')
      .map(s => ({
        type: s.type_echeance,
        artisan: s.artisan_id ? (entreprise[s.artisan_id] || null) : null,
        montant: { ht: s.montant_ht, ttc: s.montant_ttc },
        statut_client: s.statut_client,
        statut_illico: s.statut_illico,
        date_echeance: s.date_echeance,
        date_paiement: s.date_paiement,
        date_reglement: s.date_reglement,
        date_deblocage: s.date_deblocage,
        mode_reglement: s.mode_reglement,
        notes: s.notes,
      })),
  }
}

// ── rendez_vous ───────────────────────────────────────────────────────────────
export async function rendezVous(supabase, { reference, agence, du, au } = {}, { maintenant } = {}) {
  const debut = (du ? DateTime.fromISO(du, { zone: FUSEAU }) : maintenantParis(maintenant)).startOf('day')
  const fin = (au ? DateTime.fromISO(au, { zone: FUSEAU }) : debut.plus({ days: 30 })).endOf('day')
  if (!debut.isValid || !fin.isValid) throw new ErreurOutil('Dates invalides : format attendu AAAA-MM-JJ.')
  if (fin < debut) throw new ErreurOutil('La date « au » doit être postérieure à la date « du ».')
  if (fin.diff(debut, 'days').days > PLAGE_RDV_MAX_JOURS) {
    throw new ErreurOutil(`Plage trop longue : ${PLAGE_RDV_MAX_JOURS} jours maximum.`)
  }

  let q = supabase.from('rendez_vous')
    .select(`id, titre, type_rdv, date_heure, duree_minutes, lieu, adresse, notes,
      dossier:dossiers!rendez_vous_dossier_id_fkey(reference, adresse_chantier, client:clients!dossiers_client_id_fkey(${CLIENT_COLS})),
      artisan:artisans!rendez_vous_artisan_id_fkey(entreprise),
      rendez_vous_artisans!rendez_vous_artisans_rendez_vous_id_fkey(artisan:artisans!rendez_vous_artisans_artisan_id_fkey(entreprise))`)
    .gte('date_heure', debut.toUTC().toISO())
    .lte('date_heure', fin.toUTC().toISO())
    .order('date_heure')
  if (reference) {
    const d = await chercherDossier(supabase, { reference, agence }, 'id')
    q = q.eq('dossier_id', d.id)
  }

  const rdvs = await lire(q) || []
  return {
    du: debut.toISODate(),
    au: fin.toISODate(),
    fuseau: FUSEAU,
    nombre: rdvs.length,
    rendez_vous: rdvs.map(r => ({
      titre: r.titre,
      type: r.type_rdv,
      debut: DateTime.fromISO(r.date_heure).setZone(FUSEAU).toFormat("yyyy-MM-dd'T'HH:mm"),
      duree_minutes: r.duree_minutes,
      adresse: r.adresse || r.lieu || r.dossier?.adresse_chantier || null,
      dossier: r.dossier?.reference || null,
      client: r.dossier?.client ? formatNomClient(r.dossier.client) : null,
      artisans_convies: [...new Set([
        r.artisan?.entreprise,
        ...(r.rendez_vous_artisans || []).map(x => x.artisan?.entreprise),
      ].filter(Boolean))],
      notes: r.notes,
    })),
  }
}

// ── comptes_rendus (rapports de visite narratifs validés) ─────────────────────
export async function comptesRendus(supabase, { reference, agence, nombre = 1 }) {
  const d = await chercherDossier(supabase, { reference, agence }, 'id, reference')
  const crs = await lire(supabase.from('comptes_rendus')
    .select('id, type_visite, numero_visite, date_visite, version, parent_cr_id, contenu_final, created_at')
    .eq('dossier_id', d.id)
    .eq('valide', true)
    .order('date_visite', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })) || []
  // Versionnage (parent_cr_id) : une version remplacée par une plus récente n'est pas renvoyée.
  const remplaces = new Set(crs.map(c => c.parent_cr_id).filter(Boolean))
  return {
    reference: d.reference,
    comptes_rendus: crs.filter(c => !remplaces.has(c.id)).slice(0, nombre).map(c => ({
      type: c.type_visite,
      type_libelle: TYPES_VISITE[c.type_visite] || c.type_visite,
      numero_visite: c.numero_visite,
      date_visite: c.date_visite,
      version: c.version,
      contenu: c.contenu_final,
    })),
  }
}

// ── interventions (planning artisans + lots) ──────────────────────────────────
export async function interventions(supabase, { reference, agence }) {
  const d = await chercherDossier(supabase, { reference, agence },
    `id, reference,
     interventions_artisans!interventions_artisans_dossier_id_fkey(type_intervention, date_debut, date_fin, jours_specifiques,
       heure_debut, duree_minutes, lieu, notes, artisan:artisans!interventions_artisans_artisan_id_fkey(entreprise, metier)),
     lots!lots_dossier_id_fkey(nom, date_debut, date_fin, avancement, ordre, artisan:artisans!lots_artisan_id_fkey(entreprise))`,
    q => q.order('date_debut', { referencedTable: 'interventions_artisans' }).order('ordre', { referencedTable: 'lots' }))
  return {
    reference: d.reference,
    interventions: (d.interventions_artisans || []).map(i => ({
      artisan: i.artisan?.entreprise || null,
      metier: i.artisan?.metier || null,
      type: i.type_intervention,
      date_debut: i.date_debut,
      date_fin: i.date_fin,
      jours_specifiques: i.jours_specifiques,
      heure_debut: i.heure_debut,
      duree_minutes: i.duree_minutes,
      lieu: i.lieu,
      notes: i.notes,
    })),
    lots: (d.lots || []).map(l => ({
      nom: l.nom,
      artisan: l.artisan?.entreprise || null,
      date_debut: l.date_debut,
      date_fin: l.date_fin,
      avancement_pct: l.avancement,
    })),
  }
}

// ── actions_ouvertes ──────────────────────────────────────────────────────────
export async function actionsOuvertes(supabase, { reference, agence } = {}) {
  let q = supabase.from('actions')
    .select(`numero, portee, titre, texte, statut, statut_date, created_at,
      dossier:dossiers!actions_dossier_id_fkey(reference),
      action_cibles!action_cibles_action_id_fkey(lot:lots!action_cibles_lot_id_fkey(nom), intervenant:artisans!action_cibles_intervenant_id_fkey(entreprise))`)
    .is('supprime_at', null)
    .not('statut', 'in', `(${STATUTS_ACTION_FERMES.join(',')})`)
    .order('created_at')
  if (reference) {
    const d = await chercherDossier(supabase, { reference, agence }, 'id')
    q = q.eq('dossier_id', d.id)
  }
  const actions = await lire(q) || []
  return {
    nombre: actions.length,
    actions: actions.map(a => ({
      dossier: a.dossier?.reference || null,
      numero: a.numero,
      portee: a.portee,
      titre: a.titre,
      texte: a.texte,
      statut: a.statut,
      statut_libelle: libelleStatut(a.statut, a.statut_date),
      statut_date: a.statut_date,
      lots: [...new Set((a.action_cibles || []).map(c => c.lot?.nom).filter(Boolean))],
      intervenants: [...new Set((a.action_cibles || []).map(c => c.intervenant?.entreprise).filter(Boolean))],
    })),
  }
}

// ── attestations_artisans ─────────────────────────────────────────────────────
function alerteAttestation(dateExpiration, documentPresent, aujourdhui) {
  if (!dateExpiration) return documentPresent ? 'date d\'expiration non renseignée' : 'absente'
  const jours = DateTime.fromISO(dateExpiration, { zone: FUSEAU }).startOf('day').diff(aujourdhui, 'days').days
  if (jours < 0) return 'expirée'
  if (jours <= ALERTE_EXPIRATION_JOURS) return `expire sous ${ALERTE_EXPIRATION_JOURS} jours`
  return 'valide'
}

function dernierDocument(docs, type) {
  const d = (docs || []).filter(x => x.type === type)
    .sort((a, b) => String(b.uploaded_at || '').localeCompare(String(a.uploaded_at || '')))[0]
  return d ? { date_expiration: d.date_expiration, depose_le: String(d.uploaded_at || '').slice(0, 10) || null } : null
}

export async function attestationsArtisans(supabase, { reference, agence }, { maintenant } = {}) {
  const d = await chercherDossier(supabase, { reference, agence },
    `id, reference,
     devis_artisans!devis_artisans_dossier_id_fkey(statut, artisan_id),
     interventions_artisans!interventions_artisans_dossier_id_fkey(artisan_id),
     lots!lots_dossier_id_fkey(artisan_id)`)
  const ids = [...new Set([
    ...(d.devis_artisans || []).filter(x => x.statut !== 'refuse').map(x => x.artisan_id),
    ...(d.interventions_artisans || []).map(x => x.artisan_id),
    ...(d.lots || []).map(x => x.artisan_id),
  ].filter(Boolean))]
  if (ids.length === 0) return { reference: d.reference, artisans: [] }

  const artisans = await lire(supabase.from('artisans')
    .select(`id, entreprise, metier, decennale_url, decennale_expiration, qualification_url, qualification_expiration,
      artisan_documents!artisan_documents_artisan_id_fkey(type, date_expiration, uploaded_at)`)
    .in('id', ids)
    .order('entreprise')) || []
  const aujourdhui = maintenantParis(maintenant).startOf('day')

  return {
    reference: d.reference,
    seuil_alerte_jours: ALERTE_EXPIRATION_JOURS,
    artisans: artisans.map(a => ({
      entreprise: a.entreprise,
      metier: a.metier,
      decennale: {
        expiration: a.decennale_expiration,
        alerte: alerteAttestation(a.decennale_expiration, !!a.decennale_url, aujourdhui),
        dernier_document: dernierDocument(a.artisan_documents, 'decennale'),
      },
      qualification: {
        expiration: a.qualification_expiration,
        alerte: alerteAttestation(a.qualification_expiration, !!a.qualification_url, aujourdhui),
        dernier_document: dernierDocument(a.artisan_documents, 'qualification'),
      },
    })),
  }
}
