// app/lib/export-societe.js
// Export complet des données d'une société, en UN classeur Excel.
//
// R9 — POURQUOI CE FICHIER EXISTE
//
// Jusqu'ici, un franchisé qui quittait BATILIS ne pouvait rien emporter : ni ses clients,
// ni ses dossiers, ni son suivi financier. C'est la RÉVERSIBILITÉ — la possibilité de
// partir avec ce qui lui appartient. Elle se promet dans un contrat, et un client qui
// paie a le droit de la vérifier AVANT de signer, pas le jour où il s'en va.
//
// POURQUOI UN CLASSEUR ET NON DES CSV (correction du 03/09) : trente-cinq fichiers CSV
// dans une archive, c'est un vidage de base de données. Ça se donne entre développeurs,
// pas à un franchisé. Un classeur unique, un onglet par sujet, des en-têtes en français,
// des dates qui s'affichent comme des dates et des montants qui s'additionnent : c'est
// le même contenu, mais c'est un document.
//
// CE QU'IL CONTIENT — tout ce qui appartient à la société, en trois niveaux :
//   1. les tables portant directement `societe_id` ;
//   2. les tables filles d'un dossier de la société ;
//   3. les tables petites-filles (versions de devis, lignes de comparateur, présences…).
//
// CE QU'IL NE CONTIENT PAS, ET POURQUOI :
//   · `comptes_oauth`, `email_sender_oauth` — des jetons d'accès chiffrés. Les exporter
//     reviendrait à livrer les clés des boîtes mail et des Drive dans un fichier qui
//     circule par courriel.
//   · `documents_cache`, `cible_sync_state`, `drive_inbox` — de la mécanique interne,
//     reconstruite toute seule ; aucune valeur pour celui qui part.
//   · `notifications`, `admin_invitations`, `reset_cooldown` — du bruit et de la
//     sécurité de compte.
//   · `specialites` — un référentiel commun à toutes les sociétés.
//   · les FICHIERS eux-mêmes (photos, PDF, devis signés) : ils vivent dans le Storage et,
//     pour qui a connecté son Drive, ils y sont déjà. Le classeur en donne les chemins.

import { construireClasseur } from './xlsx-simple.js'

export const PLAFOND_LIGNES = 50000

// ─── Niveau 1 : tables portant directement `societe_id` ────────────────────
export const TABLES_SOCIETE = [
  'agences', 'artisans', 'clients', 'dossiers', 'objectifs_ca',
  'redevances', 'cibles_calendrier', 'rendez_vous', 'interventions_artisans',
]

// ─── Niveau 2 : tables filles d'un dossier ─────────────────────────────────
export const TABLES_DOSSIER = [
  'actions', 'chantier_documents', 'chantier_fiches_techniques',
  'comparateur_simulations', 'comptes_rendus', 'devis_artisans',
  'factures_agente', 'factures_artisans', 'honoraires_factures',
  'lots', 'messages', 'photos', 'suivi_financier', 'doc_index',
]

// ─── Niveau 3 : rattachées à une table de niveau 2, ou à un artisan ────────
export const TABLES_PETITES_FILLES = [
  ['comparateur_lignes', 'simulation_id', 'comparateur_simulations'],
  ['devis_versions', 'devis_artisan_id', 'devis_artisans'],
  ['cr_actions', 'cr_id', 'comptes_rendus'],
  ['cr_presences', 'cr_id', 'comptes_rendus'],
  ['action_checklist', 'action_id', 'actions'],
  ['action_cibles', 'action_id', 'actions'],
  ['action_photos', 'action_id', 'actions'],
  ['lot_dependances', 'lot_id', 'lots'],
  ['factures_agente_paiements', 'facture_agente_id', 'factures_agente'],
  ['artisan_documents', 'artisan_id', 'artisans'],
  ['artisans_specialites', 'artisan_id', 'artisans'],
  ['fiches_techniques', 'artisan_id', 'artisans'],
]

// Ordre de lecture des onglets : le métier d'abord, la mécanique ensuite. Quelqu'un qui
// ouvre ce classeur cherche ses clients et ses chiffres, pas les dépendances de lots.
export const ONGLETS = [
  ['clients', 'Clients'],
  ['dossiers', 'Chantiers'],
  ['devis_artisans', 'Devis artisans'],
  ['suivi_financier', 'Suivi financier'],
  ['factures_artisans', 'Factures artisans'],
  ['honoraires_factures', 'Factures honoraires'],
  ['factures_agente', 'Factures agente'],
  ['factures_agente_paiements', 'Paiements agente'],
  ['artisans', 'Artisans'],
  ['artisan_documents', 'Documents artisans'],
  ['artisans_specialites', 'Spécialités artisans'],
  ['fiches_techniques', 'Fiches techniques'],
  ['rendez_vous', 'Rendez-vous'],
  ['interventions_artisans', 'Interventions'],
  ['comptes_rendus', 'Comptes rendus'],
  ['cr_actions', 'CR — actions'],
  ['cr_presences', 'CR — présences'],
  ['messages', 'Messages'],
  ['lots', 'Lots'],
  ['lot_dependances', 'Lots — dépendances'],
  ['actions', 'Actions'],
  ['action_checklist', 'Actions — checklist'],
  ['action_cibles', 'Actions — destinataires'],
  ['action_photos', 'Actions — photos'],
  ['photos', 'Photos'],
  ['chantier_documents', 'Documents chantier'],
  ['chantier_fiches_techniques', 'Chantiers — fiches tech.'],
  ['doc_index', 'Index documentaire'],
  ['comparateur_simulations', 'Comparateur'],
  ['comparateur_lignes', 'Comparateur — lignes'],
  ['devis_versions', 'Devis — versions'],
  ['agences', 'Agences'],
  ['utilisateurs', 'Utilisateurs'],
  ['objectifs_ca', 'Objectifs de CA'],
  ['redevances', 'Redevances'],
  ['cibles_calendrier', 'Calendriers'],
  ['societe', 'Société'],
]

const PROFILES_COLONNES_EXCLUES = new Set(['notif_prefs'])

// Libellés français des colonnes. La liste couvre les 226 colonnes réellement présentes
// dans les tables exportées — relevée dans le schéma, pas devinée.
//
// POURQUOI L'ÉCRIRE À LA MAIN plutôt que de transformer `prenom` en « Prenom » : parce
// que « Prenom », « Telephone » et « Civilite » sans accents, c'est précisément ce qui
// fait qu'un export a l'air d'un vidage de base. Les colonnes de la base sont sans
// accents pour des raisons techniques ; le document remis à un client ne doit pas en
// hériter.
const LIBELLES = {
  // Identité et contact
  id: 'Identifiant', nom: 'Nom', prenom: 'Prénom', nom2: 'Nom (2ᵉ personne)',
  prenom2: 'Prénom (2ᵉ personne)', civilite: 'Civilité', email: 'E-mail',
  email2: 'E-mail secondaire', telephone: 'Téléphone', telephone2: 'Téléphone secondaire',
  adresse: 'Adresse', adresse_chantier: 'Adresse du chantier', ville: 'Ville',
  code_postal: 'Code postal', lieu: 'Lieu', entreprise: 'Entreprise', metier: 'Métier',
  raison_sociale: 'Raison sociale', nom_societe: 'Société', forme_juridique: 'Forme juridique',
  siret: 'SIRET', rcs: 'RCS', representant_nom: 'Représentant — nom',
  representant_prenom: 'Représentant — prénom', responsable_nom: 'Responsable',
  role: 'Rôle', role_libelle: 'Rôle (libellé)', type_client: 'Type de client',
  partenaire: 'Artisan partenaire', actif: 'Actif', archive: 'Archivé',

  // Rattachements
  dossier_id: 'Chantier (id)', client_id: 'Client (id)', artisan_id: 'Artisan (id)',
  societe_id: 'Société (id)', agence_id: 'Agence (id)', agente_id: 'Agente (id)',
  referente: 'Référente (id)', referente_id: 'Référente (id)', user_id: 'Utilisateur (id)',
  owner_id: 'Propriétaire (id)', auteur_id: 'Auteur (id)', auteur_role: 'Rôle de l\'auteur',
  created_by: 'Créé par (id)', uploaded_by: 'Déposé par (id)', intervenant_id: 'Intervenant (id)',
  action_id: 'Action (id)', cr_id: 'Compte rendu (id)', devis_id: 'Devis (id)',
  devis_artisan_id: 'Devis (id)', devis_version_id: 'Version de devis (id)',
  lot_id: 'Lot (id)', parent_lot_id: 'Lot parent (id)', depend_de_lot_id: 'Dépend du lot (id)',
  simulation_id: 'Simulation (id)', facture_id: 'Facture (id)', facture_agente_id: 'Facture agente (id)',
  honoraire_facture_id: 'Facture honoraires (id)', document_id: 'Document (id)',
  fiche_id: 'Fiche (id)', fiche_technique_id: 'Fiche technique (id)', photo_id: 'Photo (id)',
  specialite_id: 'Spécialité (id)', intervention_id: 'Intervention (id)', item_id: 'Élément (id)',
  cible_id: 'Calendrier (id)', cible_calendrier_defaut_id: 'Calendrier par défaut (id)',
  compte_oauth_id: 'Compte connecté (id)', contrat_dossier_id: 'Chantier du contrat (id)',
  parent_cr_id: 'Compte rendu parent (id)', cr_origine_id: 'Compte rendu d\'origine (id)',
  cr_cloture_id: 'Compte rendu de clôture (id)', pv_devis_id: 'Devis du PV (id)',
  visite_rdv_id: 'Rendez-vous de visite (id)',

  // Chantier
  reference: 'Référence', typologie: 'Typologie', statut: 'Statut',
  description: 'Description', titre: 'Titre', libelle: 'Libellé', label: 'Libellé',
  note: 'Note', notes: 'Notes', notes_brutes: 'Notes brutes', texte: 'Texte',
  texte_au_cr: 'Texte au compte rendu', statut_au_cr: 'Statut au compte rendu',
  commentaire: 'Commentaire', annotations: 'Annotations', legende: 'Légende',
  contenu: 'Contenu', contenu_final: 'Contenu', contenu_ia: 'Contenu rédigé par l\'IA',
  avancement: 'Avancement (%)', ordre: 'Ordre', numero: 'Numéro', numero_visite: 'N° de visite',
  cloture: 'Clôturé', date_cloture: 'Clôturé le', valide: 'Validé', version: 'Version',
  version_num: 'N° de version', est_courante: 'Version courante',
  est_base_courante: 'Base courante', inclus: 'Inclus', portee: 'Portée',
  categorie: 'Catégorie', type: 'Type', origine: 'Origine', couleur: 'Couleur',
  presence: 'Présence', convoque_prochaine: 'Convoqué à la prochaine',
  heure_convocation: 'Heure de convocation', prochaine_reunion_at: 'Prochaine réunion le',
  checked: 'Coché', checked_at: 'Coché le', lu: 'Lu', lu_agence: 'Lu par l\'agence',
  journal: 'Journal', cible: 'Cible', cle: 'Clé', taille: 'Taille (octets)',

  // Argent
  montant: 'Montant', montant_ht: 'Montant HT', montant_ttc: 'Montant TTC',
  montant_ttc_override: 'Montant TTC forcé', ttc_manuel: 'TTC saisi à la main',
  taux_courtage: 'Taux de courtage (fraction)', taux_amo: 'Taux AMO (points)',
  honoraires_amo_taux: 'Taux AMO (points)', commission_pourcentage: 'Commission (fraction)',
  part_agente: 'Part agente (fraction)', part_agente_defaut: 'Part agente par défaut (fraction)',
  parts_agente_disponibles: 'Parts agente proposées', frais_part_agente: 'Part agente sur frais (fraction)',
  frais_part_agente_defaut: 'Part agente sur frais par défaut (fraction)',
  frais_consultation: 'Frais de consultation TTC', frais_statut: 'Statut des frais',
  frais_origine_estimo: 'Frais issus d\'un ESTIMO', hors_honoraires: 'Sans honoraires',
  acompte_pourcentage: 'Acompte (%)', acompte_montant_fixe: 'Acompte (montant fixe)',
  paiement_direct: 'Paiement direct', mode_reglement: 'Mode de règlement',
  type_facture: 'Type de facture', redevance_mensuelle_ht: 'Redevance mensuelle HT',
  redevance_debut: 'Redevance — début', apporteur_actif: 'Apporteur actif',
  apporteur_affaires: 'Apporteur d\'affaires', apporteur_nom: 'Apporteur — nom',
  apporteur_base: 'Apporteur — assiette', apporteur_pourcentage: 'Apporteur (points)',
  statut_illico: 'Statut illiCO', statut_client: 'Statut client', statut_ctp: 'Statut CTP',
  statut_date: 'Statut — date', annee: 'Année', mois: 'Mois',

  // Dates
  created_at: 'Créé le', updated_at: 'Modifié le', edited_at: 'Modifié le',
  uploaded_at: 'Déposé le', supprime_at: 'Supprimé le',
  date_heure: 'Date et heure', date_debut: 'Début', date_fin: 'Fin',
  heure_debut: 'Heure de début', duree_minutes: 'Durée (minutes)',
  date_reception: 'Reçu le', date_limite: 'Date limite', date_limite_devis: 'Date limite des devis',
  date_signature: 'Signé le', date_signature_contrat: 'Contrat signé le',
  date_paiement: 'Payé le', date_reglement: 'Réglé le', date_deblocage: 'Débloqué le',
  date_echeance: 'Échéance', date_expiration: 'Expire le', date_visite: 'Date de visite',
  date_premier_rdv: 'Premier rendez-vous', date_demarrage_chantier: 'Démarrage du chantier',
  date_demarrage_chantier_manuel: 'Démarrage saisi à la main',
  date_fin_chantier: 'Fin de chantier', jours_specifiques: 'Jours spécifiques',
  jours_travailles: 'Jours travaillés', acces_expire_le: 'Accès expire le',
  acces_actif: 'Accès actif', decennale_expiration: 'Décennale — expiration',
  qualification_expiration: 'Qualification — expiration',

  // Types
  type_rdv: 'Type de rendez-vous', type_visite: 'Type de visite',
  type_intervention: 'Type d\'intervention', type_echeance: 'Type d\'échéance',
  type_media: 'Type de média', type_mime: 'Type de fichier',
  artisan_doc_type: 'Type de document',

  // Fichiers
  url: 'Fichier', path: 'Fichier', pdf_path: 'Facture (fichier)',
  facture_path: 'Facture (fichier)', devis_pdf_path: 'Devis (fichier)',
  devis_signe_path: 'Devis signé (fichier)', pv_path: 'PV de réception (fichier)',
  contrat_url: 'Contrat (fichier)', kbis_url: 'Kbis (fichier)', rib_url: 'RIB (fichier)',
  decennale_url: 'Décennale (fichier)', qualification_url: 'Qualification (fichier)',
  fiche_technique_url: 'Fiche technique (fichier)', logo_path: 'Logo (fichier)',
  nom_fichier: 'Nom du fichier', photos_jointes: 'Photos jointes',
  photos_paths: 'Photos (chemins)', dans_restitution: 'Dans le dossier de restitution',
  drive_id: 'Drive (identifiant)',

  // Technique
  code: 'Code', fournisseur: 'Fournisseur', calendar_id: 'Agenda (identifiant)',
  agenda_nom: 'Nom de l\'agenda', google_event_id: 'Google — événement',
  google_start_event_id: 'Google — événement de début',
  google_end_event_id: 'Google — événement de fin', google_etag: 'Google — version',
  lots_ia_cache: 'Lots proposés par l\'IA (cache)',
  notif_canal_email: 'Notifications par e-mail', notif_canal_inapp: 'Notifications dans l\'application',
  notif_canal_sms: 'Notifications par SMS',
}

// Colonnes montrées en premier quand elles existent : ce qu'on cherche en ouvrant.
const ORDRE_PREFERE = [
  'reference', 'nom_societe', 'nom', 'prenom', 'civilite', 'entreprise', 'libelle', 'titre',
  'email', 'telephone', 'adresse', 'ville', 'cp', 'metier', 'role',
  'typologie', 'type_rdv', 'type_echeance', 'type_visite', 'statut', 'statut_illico', 'statut_client',
  'montant_ht', 'montant_ttc', 'montant', 'date_heure', 'date_debut', 'date_fin',
  'date_reception', 'date_limite', 'date_signature', 'date_paiement', 'created_at',
]

export function humaniserColonne(cle) {
  if (LIBELLES[cle]) return LIBELLES[cle]
  const mots = String(cle).replace(/_/g, ' ').trim()
  const texte = mots.charAt(0).toUpperCase() + mots.slice(1)
  return texte
    .replace(/\bht\b/gi, 'HT').replace(/\bttc\b/gi, 'TTC')
    .replace(/\btva\b/gi, 'TVA').replace(/\bamo\b/gi, 'AMO')
    .replace(/\bca\b/gi, 'CA').replace(/\bpdf\b/gi, 'PDF')
    .replace(/\burl\b/gi, 'fichier').replace(/\bid\b/g, '(id)')
}

export function ordonnerColonnes(cles) {
  const reste = [...cles]
  const sortie = []
  for (const pref of ORDRE_PREFERE) {
    const i = reste.indexOf(pref)
    if (i !== -1) sortie.push(reste.splice(i, 1)[0])
  }
  // Les identifiants techniques ferment la marche : ils servent à recoller les onglets
  // entre eux, ils n'ont pas à occuper les premières colonnes.
  const techniques = reste.filter(c => c === 'id' || c.endsWith('_id')).sort()
  const autres = reste.filter(c => !(c === 'id' || c.endsWith('_id'))).sort()
  return [...sortie, ...autres, ...techniques]
}

const LARGE = new Set(['notes', 'contenu', 'contenu_final', 'description', 'message', 'adresse', 'commentaire'])

export function colonnesDepuisLignes(lignes) {
  const cles = new Set()
  for (const l of lignes || []) for (const k of Object.keys(l || {})) cles.add(k)
  return ordonnerColonnes([...cles]).map(cle => ({
    cle,
    libelle: humaniserColonne(cle),
    largeur: LARGE.has(cle) ? 50 : (cle === 'id' || cle.endsWith('_id')) ? 14 : /date|_at$/.test(cle) ? 17 : 20,
    montant: /montant|frais_consultation|cible$/.test(cle),
  }))
}

export function nomFichier(nomSociete, maintenant = new Date()) {
  const base = String(nomSociete || 'societe')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'societe'
  return `Export_BATILIS_${base}_${maintenant.toISOString().slice(0, 10)}.xlsx`
}

/**
 * Lit toutes les données d'une société. À exécuter en service_role côté serveur.
 */
export async function collecterExport(db, societeId) {
  const parTable = {}
  const resume = []

  const lire = async (table, colonne, valeurs) => {
    if (!valeurs || valeurs.length === 0) return []
    const out = []
    for (let i = 0; i < valeurs.length; i += 200) {
      const { data, error } = await db.from(table).select('*')
        .in(colonne, valeurs.slice(i, i + 200)).limit(PLAFOND_LIGNES)
      if (error) throw new Error(`${table} : ${error.message}`)
      out.push(...(data || []))
      if (out.length >= PLAFOND_LIGNES) break
    }
    return out.slice(0, PLAFOND_LIGNES)
  }

  const { data: societe, error: errSoc } = await db.from('societes').select('*').eq('id', societeId).maybeSingle()
  if (errSoc) throw new Error(`societes : ${errSoc.message}`)
  if (!societe) throw new Error('Société introuvable')
  parTable.societe = [societe]

  const { data: profils, error: errProf } = await db.from('profiles').select('*').eq('societe_id', societeId)
  if (errProf) throw new Error(`profiles : ${errProf.message}`)
  parTable.utilisateurs = (profils || []).map(p => {
    const copie = { ...p }
    for (const c of PROFILES_COLONNES_EXCLUES) delete copie[c]
    return copie
  })

  for (const table of TABLES_SOCIETE) {
    const { data, error } = await db.from(table).select('*').eq('societe_id', societeId).limit(PLAFOND_LIGNES)
    if (error) throw new Error(`${table} : ${error.message}`)
    parTable[table] = data || []
  }

  const dossierIds = (parTable.dossiers || []).map(d => d.id)
  for (const table of TABLES_DOSSIER) {
    parTable[table] = await lire(table, 'dossier_id', dossierIds)
  }

  for (const [table, colonne, parente] of TABLES_PETITES_FILLES) {
    const ids = (parTable[parente] || []).map(p => p.id).filter(Boolean)
    parTable[table] = await lire(table, colonne, ids)
  }

  for (const [table] of ONGLETS) {
    const lignes = parTable[table] || []
    resume.push({ table, lignes: lignes.length, tronque: lignes.length >= PLAFOND_LIGNES })
  }

  return { parTable, resume, societe }
}

/**
 * L'onglet d'accueil. Un export sans mode d'emploi finit dans un dossier « à trier » :
 * il faut qu'on sache, en l'ouvrant six mois plus tard, ce qu'il contient, ce qu'il ne
 * contient pas, et pourquoi.
 */
export function ongletAccueil({ societe, resume, maintenant = new Date() }) {
  const total = resume.reduce((s, r) => s + r.lignes, 0)
  const tronquees = resume.filter(r => r.tronque)
  const lignes = [
    { info: 'Société', valeur: societe?.nom_societe || '—' },
    { info: 'Export généré le', valeur: maintenant.toLocaleString('fr-FR') },
    { info: 'Onglets', valeur: String(resume.length) },
    { info: 'Lignes au total', valeur: String(total) },
    { info: '', valeur: '' },
    { info: 'CE QUE CONTIENT CE CLASSEUR', valeur: '' },
    { info: 'Données métier', valeur: 'Clients, chantiers, devis, artisans, rendez-vous, interventions, suivi financier, factures, comptes rendus, lots, actions, messages.' },
    { info: 'Un onglet par sujet', valeur: "Les colonnes « (id) » servent à recoller les onglets entre eux : l'identifiant d'un chantier se retrouve dans les devis, le suivi financier, les rendez-vous." },
    { info: '', valeur: '' },
    { info: "CE QU'IL NE CONTIENT PAS", valeur: '' },
    { info: 'Les fichiers', valeur: 'Photos, PDF et devis signés restent dans le stockage — et dans votre Drive si vous l\'avez connecté. Les onglets en donnent les chemins.' },
    { info: 'Les accès', valeur: "Les jetons de connexion aux boîtes mail et aux Drive ne sortent jamais : ce sont des clés, elles ne circulent pas dans un fichier." },
    { info: 'La mécanique interne', valeur: "Caches et index de synchronisation : ils se reconstruisent seuls et ne valent rien hors de leur contexte." },
    { info: '', valeur: '' },
    { info: 'CONFIDENTIALITÉ', valeur: "Ce classeur contient des données personnelles de clients et d'artisans. Conservez-le en lieu sûr et ne le transmettez qu'aux personnes habilitées." },
    { info: '', valeur: '' },
    { info: 'DÉTAIL PAR ONGLET', valeur: '' },
    ...resume.map(r => ({
      info: (ONGLETS.find(o => o[0] === r.table) || [, r.table])[1],
      valeur: `${r.lignes} ligne${r.lignes > 1 ? 's' : ''}${r.tronque ? '   ⚠ TRONQUÉ — export incomplet, signalez-le' : ''}`,
    })),
  ]
  if (tronquees.length > 0) {
    lignes.push(
      { info: '', valeur: '' },
      { info: '⚠ ATTENTION', valeur: `${tronquees.map(t => t.table).join(', ')} ont atteint le plafond de ${PLAFOND_LIGNES} lignes. L'export est INCOMPLET pour ces onglets.` },
    )
  }
  return {
    nom: 'À lire d\'abord',
    colonnes: [
      { cle: 'info', libelle: 'Information', largeur: 30 },
      { cle: 'valeur', libelle: '', largeur: 110 },
    ],
    lignes,
  }
}

/**
 * Assemble le classeur complet.
 * @returns {Promise<Buffer>}
 */
export async function construireExport({ parTable, resume, societe, maintenant = new Date() }) {
  const onglets = [ongletAccueil({ societe, resume, maintenant })]
  for (const [table, titre] of ONGLETS) {
    const lignes = parTable[table] || []
    // Un onglet vide est CONSERVÉ : son absence laisserait croire à un oubli de l'export.
    const colonnes = lignes.length > 0
      ? colonnesDepuisLignes(lignes)
      : [{ cle: 'vide', libelle: 'Aucune donnée', largeur: 30 }]
    onglets.push({ nom: titre, colonnes, lignes })
  }
  return construireClasseur(onglets)
}
