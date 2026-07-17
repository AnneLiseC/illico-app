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
