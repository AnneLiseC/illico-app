// app/lib/calendar/mapping.js
// Mapping métier calendrier PARTAGÉ (lot 7-mapping). Tronc commun à tous les fournisseurs :
// construction du summary, de la description, des bornes RDV et de la liste neutre des
// occurrences d'intervention. Renvoie des valeurs NEUTRES (string / Date / spec), JAMAIS
// du format (ni JSON Google, ni ICS, ni Graph). Chaque fournisseur (google.js, icloud.js,
// plus tard outlook.js) habille ensuite au format.
//
// ⚠️ Extraction À L'IDENTIQUE des copies inline de google.js et icloud.js : le contenu
//   produit (summaries, descriptions, dates) est strictement préservé. Les bornes temps des
//   interventions HORODATÉES restent rendues par chaque fournisseur (Google = wall-clock +
//   label Europe/Paris ; iCloud = instant UTC) — divergence PRÉEXISTANTE, hors périmètre :
//   ce module fournit la spec neutre du temps, pas l'instant formaté.

// ── RDV ──────────────────────────────────────────────────────────────────────
export function rdvSummary(rdv) {
  // Préfixes de type SANS tiret final : le « - » est inséré par le join entre le type et le
  // client (pas de tiret pendouillant sans client). 'autres' = titre seul.
  const typeLabels = {
    visite_technique_client: 'R1',
    visite_technique_artisan: 'R2',
    presentation_devis: 'R3',
  }
  const client = rdv.dossier?.client
  const nomClient = client ? `${client.civilite || ''} ${client.prenom} ${client.nom}`.trim() : ''
  const artisan = rdv.artisan?.entreprise || ''
  const base = [typeLabels[rdv.type_rdv] || rdv.type_rdv, nomClient].filter(Boolean).join(' - ')
  return rdv.type_rdv === 'autres'
    ? (rdv.titre || rdv.notes || 'Autre RDV')
    : `${base}${artisan ? ' x ' + artisan : ''}`
}

export function rdvDescription(rdv) {
  return [
    rdv.dossier?.reference ? `Chantier : ${rdv.dossier.reference}` : '',
    rdv.notes ? `Notes : ${rdv.notes}` : '',
  ].filter(Boolean).join('\n')
}

// Bornes RDV : date_heure (instant UTC) + durée → { start, end } (objets Date neutres).
export function rdvBounds(rdv) {
  const start = new Date(rdv.date_heure)
  const end = new Date(start.getTime() + (rdv.duree_minutes || 60) * 60000)
  return { start, end }
}

// ── Intervention ─────────────────────────────────────────────────────────────
export function interventionSummary(intervention) {
  const artisan = intervention.artisan?.entreprise || 'Artisan'
  const client = intervention.dossier?.client
  const nomClient = client ? `${client.prenom} ${client.nom}`.trim() : ''
  return `${artisan}${nomClient ? ' x ' + nomClient : ''}`
}

// baseDesc (référence chantier + notes) + marqueur d'occurrence → description.
export function interventionDescription(intervention, marker) {
  const baseDesc = [
    intervention.dossier?.reference ? `Chantier : ${intervention.dossier.reference}` : '',
    intervention.notes ? `Notes : ${intervention.notes}` : '',
  ].filter(Boolean)
  return [...baseDesc, marker].join('\n')
}

// Liste NEUTRE des occurrences à émettre (contrôle de flux période/jours partagé), ou []
// pour les cas à ignorer. Chaque occurrence : { marker, idSuffix, label, role, time }.
//   time  : spec neutre journée entière -> { kind:'allday', date }
//   label : préfixe de titre ('(début) ', '(fin) ' ou '')
//   role  : 'start' (début / jour unique) | 'end' (fin) | 'day' (jour spécifique)
//           -> pilote le stockage de l'id externe côté push (google_event_id vs
//              google_end_event_id ; 'day' = insert-only).
// marker = texte [illico-int:…] (identique Google/iCloud, sert aussi à l'anti-écho du pull) ;
// idSuffix = suffixe d'UID (utilisé par iCloud ; Google l'ignore).
//
// ⚠️ Une intervention est TOUJOURS en journée entière (jamais un créneau horaire) :
//    heure_debut / duree_minutes ne sont PAS utilisés pour l'affichage calendrier.
export function interventionOccurrences(intervention) {
  const { id } = intervention

  // PÉRIODE (plage continue) : plusieurs jours -> 2 marqueurs distincts (début 1er jour,
  // fin dernier jour) ; un seul jour (ou date_fin absente/identique) -> 1 marqueur.
  if (intervention.type_intervention === 'periode') {
    const debut = intervention.date_debut
    if (!debut) return []
    const fin = intervention.date_fin
    if (!fin || fin === debut) {
      return [{ marker: `[illico-int:${id}]`, idSuffix: '', label: '', role: 'start',
        time: { kind: 'allday', date: debut } }]
    }
    return [
      { marker: `[illico-int:${id}:debut]`, idSuffix: '-debut', label: '(début) ', role: 'start',
        time: { kind: 'allday', date: debut } },
      { marker: `[illico-int:${id}:fin]`, idSuffix: '-fin', label: '(fin) ', role: 'end',
        time: { kind: 'allday', date: fin } },
    ]
  }

  // JOURS SPÉCIFIQUES (jours non contigus cochés à la main) : 1 marqueur par jour
  // (comportement inchangé), en journée entière.
  const jours = [...(intervention.jours_specifiques || [])].sort()
  if (!jours.length) return []
  return jours.map((date, i) => ({
    marker: `[illico-int:${id}:${i}]`,
    idSuffix: `-${i}`,
    label: '',
    role: 'day',
    time: { kind: 'allday', date },
  }))
}

// ── Lieu de l'événement ──────────────────────────────────────────────────────
//
// AJOUT DU 14/09. Jusqu'ici AUCUN fournisseur ne remplissait le champ « lieu » d'un
// événement : ni `location` chez Google, ni chez Graph, ni `LOCATION` dans l'ICS. Un
// artisan ou une agente qui ouvrait le rendez-vous sur son téléphone n'avait pas l'adresse,
// donc pas de bouton « Itinéraire », et devait rouvrir BATILIS pour la chercher.
//
// ⚠️ FAUX AMI À CONNAÎTRE : `rendez_vous.lieu` n'est PAS une adresse, c'est un TYPE de lieu.
// En base au 14/09, deux valeurs seulement : 'client' (1 995 rendez-vous) et 'agence' (2).
// L'adresse réelle vit ailleurs, et c'est `lieu` qui dit où aller la chercher.
//
// RÈGLE (validée le 14/09) :
//   lieu = 'client'  → dossiers.adresse_chantier   (l'adresse du CHANTIER, pas du domicile)
//   lieu = 'agence'  → l'adresse de l'agence
//   intervention     → toujours l'adresse du chantier
//
// Couverture mesurée avant écriture : 49 dossiers sur 50 portent une adresse de chantier,
// et ZÉRO rendez-vous « client » n'en manque. Le repli ci-dessous est donc théorique.
//
// PAS DE REPLI DEVINÉ. Sans adresse, on renvoie '' et l'appelant omet le champ. Envoyer
// quelqu'un à l'agence pour un rendez-vous de chantier serait pire que ne rien afficher :
// un calendrier vide se complète à la main, un calendrier faux fait rouler pour rien.

function adresseChantier(dossier) {
  return String(dossier?.adresse_chantier || '').trim()
}

// Nom, rue, code postal et ville sur une ligne. Les morceaux manquants disparaissent sans
// laisser de virgule orpheline — une adresse à trous reste une adresse lisible.
function adresseAgence(agence) {
  if (!agence) return ''
  const cpVille = [agence.code_postal, agence.ville].filter(Boolean).map(String).map(s => s.trim()).filter(Boolean).join(' ')
  return [agence.nom, agence.adresse, cpVille]
    .map(v => String(v || '').trim()).filter(Boolean).join(', ')
}

// Lieu CALCULÉ à partir du type de rendez-vous. C'est la référence : c'est lui qui part
// dans les calendriers quand aucune adresse propre n'a été saisie, et c'est lui qui sert
// au pull à reconnaître une correction humaine (voir lieuRdv ci-dessous).
export function lieuRdvParDefaut(rdv) {
  return rdv?.lieu === 'agence'
    ? adresseAgence(rdv?.agence)
    : adresseChantier(rdv?.dossier)
}

// Lieu RÉEL du rendez-vous : l'exception saisie si elle existe, sinon le calcul.
//
// `rendez_vous.adresse` (14/09) couvre deux besoins qui n'en font qu'un : un rendez-vous
// qui ne se tient pas au chantier (showroom, notaire, mairie), et une adresse corrigée
// depuis l'agenda du téléphone et relue par le pull.
export function lieuRdv(rdv) {
  const propre = String(rdv?.adresse || '').trim()
  return propre || lieuRdvParDefaut(rdv)
}

// Une adresse venue d'un agenda externe est-elle une VRAIE correction humaine, ou le
// simple écho de ce qu'on a nous-même poussé ?
//
// Sans ce test, le premier pull figerait dans chaque rendez-vous une copie de l'adresse
// du chantier. Le jour où le chantier déménage, plus rien ne se propagerait : la colonne
// d'exception aurait silencieusement mangé le calcul qu'elle est censée compléter.
//
// La comparaison ignore la casse et les espaces superflus : un agenda qui renvoie
// « 12 Chemin Des Oliviers,  13500 Martigues » n'a rien corrigé du tout.
export function estAdresseCorrigee(rdv, adresseRecue) {
  const recue = String(adresseRecue || '').trim()
  if (!recue) return false                      // champ vidé : on ne déduit rien
  const normalise = (v) => String(v || '').toLowerCase().replace(/\s+/g, ' ').trim()
  if (normalise(recue) === normalise(lieuRdvParDefaut(rdv))) return false
  return normalise(recue) !== normalise(rdv?.adresse)   // déjà enregistrée -> rien à écrire
}

export function lieuIntervention(intervention) {
  return adresseChantier(intervention?.dossier)
}
