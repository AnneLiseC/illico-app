// app/lib/relances-texte.js
// Les formulations des mails de relance — la partie que le client LIT — et la règle qui
// décide À QUI un rappel de rendez-vous est envoyé.
//
// Extrait de app/api/cron/relances/route.js le 09/09. Défauts constatés sur des mails
// réellement produits (mode ESSAI, dossiers 2026-AM-043 et 2026-AM-001) :
//
//   1. « Bonjour M. et Mme Brunet, Brunet, » — le patronyme sortait deux fois quand les
//      deux conjoints portent le même nom. La civilité couvre déjà les deux personnes.
//
//   2. « Nous vous rappelons votre rendez-vous visite_technique_artisan prévu » — la
//      valeur brute de la colonne, soulignés compris, dans un mail client. Le cas le
//      plus fréquent est le pire : `autres` couvre 92 % des rendez-vous (ceux que la
//      synchronisation d'agenda ne sait pas classer).
//
// Le remède au 2 n'est pas un dictionnaire de plus dans la phrase : c'est de SORTIR le
// libellé de la phrase. Un intitulé sur sa propre ligne évite au passage tout accord de
// genre (« visite prévue » / « rendez-vous prévu ») — une erreur qui reviendrait au
// premier type ajouté.

// Intitulés côté CLIENT. Volontairement sans le jargon interne « R1 / R2 » de l'app :
// il ne veut rien dire pour la personne qui reçoit le mail.
const LIBELLES_CLIENT = {
  visite_technique_client:  'Visite technique',
  visite_technique_artisan: 'Visite technique avec l\'artisan',
  presentation_devis:       'Présentation des devis',
  etude:                    'Rendez-vous d\'étude',
  suivi:                    'Point de suivi de chantier',
  reception:                'Réception des travaux',
}

// Côté ARTISAN, le même rendez-vous ne se nomme pas pareil : « visite technique avec
// l'artisan » n'a aucun sens quand on EST l'artisan.
const LIBELLES_ARTISAN = {
  visite_technique_client:  'Visite technique',
  visite_technique_artisan: 'Visite technique',
  presentation_devis:       'Présentation des devis',
  etude:                    'Rendez-vous d\'étude',
  suivi:                    'Point de suivi de chantier',
  reception:                'Réception des travaux',
}

// ─────────────────────────────────────────────────────────────────────────────
// QUI reçoit un rappel — règle posée par Anne-Lise le 09/09
//
// Le client n'est prévenu que des rendez-vous où SA présence est attendue. Sur une
// visite technique d'artisan ou un point de suivi, il est souvent absent et déjà au
// courant qu'on passe : le rappel devient du bruit. Sur ces rendez-vous-là, c'est
// l'artisan qu'il faut prévenir — c'est lui qui doit se déplacer.
//
// `autres` ne déclenche AUCUN mail client : c'est le type fourre-tout de la
// synchronisation d'agenda (1 837 des 1 842 `autres` en base viennent de là), et un
// créneau posé dans un agenda personnel n'a rien à faire dans la boîte d'un client.
// L'artisan, lui, garde son rappel : une réunion de chantier entre artisans, sans
// client, est justement un `autres`.
//
// ⚠️ LIMITE CONNUE — `rendez_vous.artisan_id` ne désigne QU'UN artisan, et il est vide
// sur les rendez-vous importés de l'agenda. Une réunion de chantier avec plusieurs
// artisans n'en préviendra donc aucun tant que la colonne n'est pas renseignée. Ce
// n'est pas un défaut de cette règle-ci : c'est le modèle de données qui ne sait pas
// représenter « plusieurs artisans sur un rendez-vous ».
// ─────────────────────────────────────────────────────────────────────────────
const AVEC_RAPPEL_CLIENT = new Set([
  'visite_technique_client',
  'presentation_devis',
  'etude',
  'reception',
])

/**
 * Qui reçoit le rappel J-1, et ce que le rendez-vous attend de lui.
 *
 * CE QUE LA CASE VEUT DIRE (arbitrage du 11/09) : `prevenir_client` répond à « le client
 * VIENT au rendez-vous », pas à « faut-il lui écrire ». La différence n'est pas de
 * vocabulaire :
 *
 *   · case cochée   → « Nous vous rappelons ce rendez-vous » — il est attendu sur place ;
 *   · case décochée → « Nous serons présents avec l'entreprise » — il est informé qu'on
 *                     intervient chez lui, sans avoir à s'organiser pour être là.
 *
 * Le client est donc destinataire DANS LES DEUX CAS. C'est un élargissement volontaire :
 * avant le 11/09, un rendez-vous « non coché » ne lui disait rien du tout, et il
 * découvrait des intervenants chez lui sans prévenir. Un rendez-vous rattaché à son
 * dossier se passe sur SON chantier ; le lui taire n'a jamais été un service.
 *
 * Le TYPE ne sert plus que de défaut pour PRÉ-COCHER la case à la saisie
 * (prevenirClientParDefaut), plus à décider qui reçoit quoi.
 *
 * @param {{type_rdv?: string, prevenir_client?: boolean|null}} rdv
 * @returns {{client: boolean, clientPresent: boolean, artisan: boolean}}
 */
export function destinatairesRappel(rdv) {
  const type = typeof rdv === 'string' ? rdv : rdv?.type_rdv
  const choix = typeof rdv === 'string' ? null : rdv?.prevenir_client
  return {
    // Toujours informé — le texte, lui, dépend de sa présence.
    client: true,
    clientPresent: typeof choix === 'boolean' ? choix : AVEC_RAPPEL_CLIENT.has(type),
    // L'artisan est prévenu de tout rendez-vous auquel il est convié, `autres`
    // compris : c'est lui qui se déplace.
    artisan: true,
  }
}

/** Le défaut proposé par le type, pour pré-cocher la case du formulaire. */
export function prevenirClientParDefaut(typeRdv) {
  return AVEC_RAPPEL_CLIENT.has(typeRdv)
}

/**
 * Intitulé lisible d'un rendez-vous.
 *
 * `autres` n'a pas d'intitulé : on se rabat sur le titre saisi, et à défaut on ne met
 * RIEN — mieux vaut une ligne en moins qu'un mot qui n'a pas de sens pour le
 * destinataire.
 *
 * Chacun veut savoir avec QUI il a rendez-vous, et ce n'est pas la même personne des
 * deux côtés : le client veut le nom de l'entreprise qui sonne chez lui, l'artisan veut
 * le nom du client chez qui il se déplace.
 *
 * @param {{type_rdv?: string, titre?: string}} rdv
 * @param {'client'|'artisan'} pour
 * @param {string} [avec] entreprise (mail client) ou nom du client (mail artisan)
 * @returns {string|null} l'intitulé, ou null s'il n'y a rien de présentable
 */
export function libelleRdv(rdv, pour = 'client', avec = null) {
  const type = rdv?.type_rdv
  const nom = String(avec || '').trim()

  if (nom && (type === 'visite_technique_artisan' || type === 'visite_technique_client')) {
    // La préposition n'est pas la même des deux côtés : l'entreprise vient CHEZ le
    // client, donc l'artisan se déplace « chez M. et Mme Brunet », et le client reçoit
    // quelqu'un « avec MJ RENOVATION ». « Visite technique avec M. et Mme Brunet »
    // envoyé à l'artisan sonnait faux.
    return pour === 'artisan'
      ? `Visite technique chez ${nom}`
      : `Visite technique avec ${nom}`
  }

  const table = pour === 'artisan' ? LIBELLES_ARTISAN : LIBELLES_CLIENT
  const connu = table[type]
  if (connu) return connu

  const titre = String(rdv?.titre || '').trim()
  return titre || null
}

/**
 * Salutation d'un client, en tenant compte du second titulaire.
 *
 * La civilité (« M. et Mme ») porte déjà les deux personnes : seuls les patronymes
 * DIFFÉRENTS doivent apparaître. Comparaison insensible à la casse et aux espaces —
 * « Brunet » et « BRUNET » sont le même nom, et les deux se saisissent.
 *
 * @param {{civilite?: string, nom?: string, nom2?: string}} client
 * @returns {string} jamais vide : « Madame, Monsieur » en dernier recours
 */
export function salutationClient(client) {
  const civilite = String(client?.civilite || '').trim()
  const noms = [client?.nom, client?.nom2]
    .map(n => String(n || '').trim())
    .filter(Boolean)

  const vus = new Set()
  const distincts = noms.filter(n => {
    const cle = n.toLowerCase()
    if (vus.has(cle)) return false
    vus.add(cle)
    return true
  })

  const assemble = [civilite, distincts.join(', ')].filter(Boolean).join(' ').trim()
  return assemble || 'Madame, Monsieur'
}

/**
 * Le nom du client tel qu'on le montre à l'ARTISAN — « chez qui je vais demain ».
 *
 * Diffère de `salutationClient` sur un point qui compte : ici, pas de repli sur
 * « Madame, Monsieur ». Un intitulé « Visite technique avec Madame, Monsieur » serait
 * ridicule ; sans nom exploitable, mieux vaut ne rien mettre du tout.
 *
 * @returns {string|null}
 */
export function nomClientPourArtisan(client) {
  const noms = [client?.nom, client?.nom2]
    .map(n => String(n || '').trim())
    .filter(Boolean)
  if (noms.length === 0) return null

  const vus = new Set()
  const distincts = noms.filter(n => {
    const cle = n.toLowerCase()
    if (vus.has(cle)) return false
    vus.add(cle)
    return true
  })

  const civilite = String(client?.civilite || '').trim()
  return [civilite, distincts.join(', ')].filter(Boolean).join(' ').trim()
}

// ─────────────────────────────────────────────────────────────────────────────
// L'HEURE DU RENDEZ-VOUS — le défaut le plus grave des cinq (09/09)
//
// Les mails annonçaient « mercredi 9 septembre à 07:00 » pour un rendez-vous de 09:00.
// Deux heures d'avance, sur une pièce envoyée au client et à l'artisan.
//
// La cause : `rendez_vous.date_heure` est un `timestamptz`, renvoyé en UTC
// (« 2026-09-09T07:00:00+00:00 »). `toLocaleTimeString('fr-FR')` SANS option de fuseau
// utilise celui de la machine — et Vercel tourne en UTC. L'heure imprimée était donc
// l'heure UTC, soit deux heures de moins que Paris en été (une en hiver). En local,
// sur un poste réglé sur Paris, le bug est INVISIBLE : c'est ce qui l'a laissé passer.
//
// ⚠️ Ne pas généraliser ces helpers aux colonnes `date` PURES (date_echeance,
// decennale_expiration, date_paiement…) : ce sont des jours sans heure, les forcer en
// Europe/Paris n'apporte rien et risque de décaler le jour. Voir lib/dates.js.
// ─────────────────────────────────────────────────────────────────────────────
const FUSEAU = 'Europe/Paris'

/** Heure d'un timestamptz en heure de Paris — « 09:00 ». */
export function heureRdvFR(dateHeure) {
  if (!dateHeure) return ''
  return new Date(dateHeure).toLocaleTimeString('fr-FR', {
    hour: '2-digit', minute: '2-digit', timeZone: FUSEAU,
  })
}

/** Date longue d'un timestamptz en heure de Paris — « mercredi 9 septembre 2026 ». */
export function dateRdvFR(dateHeure) {
  if (!dateHeure) return ''
  return new Date(dateHeure).toLocaleDateString('fr-FR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: FUSEAU,
  })
}

/**
 * Comment on s'adresse à un ARTISAN dans un mail.
 *
 * Décision du 11/09 : « Bonjour M. MARCHAND », pas « Bonjour Julien MARCHAND ». On écrit à
 * un partenaire professionnel, pas à une connaissance — et le prénom d'un interlocuteur
 * qu'on croise deux fois par an sonne faux.
 *
 * TROIS REPLIS, dans cet ordre, parce qu'un mail ne doit jamais commencer par « Bonjour , » :
 *   1. civilité + NOM       → « M. MARCHAND »      (le cas normal)
 *   2. nom seul             → « MARCHAND »          (civilité pas encore renseignée)
 *   3. nom de l'entreprise  → « LS TRAVAUX »        (aucun contact nommé)
 * et si même l'entreprise manque, on renvoie null : l'appelant écrit alors « Bonjour, »
 * tout court, ce qui reste correct.
 *
 * La civilité n'est JAMAIS déduite d'un prénom : l'automatisme se trompe sur un prénom
 * mixte ou étranger, et il se trompe dans un mail signé de l'agence.
 */
export function adresseArtisan(artisan) {
  const civilite = String(artisan?.civilite || '').trim()
  const nom = String(artisan?.nom || '').trim()
  const entreprise = String(artisan?.entreprise || '').trim()
  if (civilite && nom) return `${civilite} ${nom.toUpperCase()}`
  if (nom) return nom.toUpperCase()
  return entreprise || null
}

/**
 * Où le client doit régler, selon qu'un RIB part OU NON en pièce jointe.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE FONCTION EXISTE SÉPARÉMENT
 *
 * Le 11/09, les relances de facture annonçaient « sur le RIB de X joint à ce message »
 * alors qu'AUCUNE pièce jointe ne partait : le texte avait été écrit, la pièce jointe
 * oubliée. Rien ne cassait, rien ne remontait dans les journaux, et le client cherchait
 * un fichier qui n'existait pas.
 *
 * La phrase est donc calculée À PARTIR de la pièce jointe réellement constituée, jamais
 * en parallèle. `ribJoint` n'est pas « y a-t-il un RIB en base », c'est « le fichier
 * est-il dans le mail ». Un RIB introuvable dans le stockage produit la même phrase
 * qu'un RIB jamais téléversé, parce que le client vit la même chose.
 *
 * Le repli restera nécessaire même quand tous les RIB seront collectés : un artisan est
 * toujours créé avant que son RIB n'arrive. L'état « pas encore de RIB » est permanent
 * dans le temps, même si chaque cas est temporaire.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * @param {boolean} ribJoint  le RIB est-il RÉELLEMENT dans les pièces jointes
 * @param {string}  nom       le bénéficiaire du virement (artisan ou société)
 */
export function mentionReglement(ribJoint, nom) {
  const beneficiaire = String(nom || '').trim()
  if (ribJoint && beneficiaire) return `sur le RIB de ${beneficiaire} joint à ce message`
  if (ribJoint) return 'sur le RIB joint à ce message'
  if (beneficiaire) return `aux coordonnées bancaires figurant sur la facture de ${beneficiaire}`
  return 'aux coordonnées bancaires figurant sur la facture'
}
