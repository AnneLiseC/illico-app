// app/lib/rdvArtisans.js
// Les artisans conviés à un rendez-vous — écriture de la table de liaison.
//
// POURQUOI CETTE TABLE (migration du 09/09) — `rendez_vous.artisan_id` ne désignait
// QU'UN artisan. Une réunion de chantier à deux entreprises ne pouvait pas être
// représentée, et aucun rappel ne partait. Écrire les noms dans le titre ne servait à
// rien : le titre est du texte libre que le code ne lit jamais.
//
// LE PARTAGE DES RÔLES — `artisan_id` reste « l'artisan principal ». La synchronisation
// d'agenda, la poussée vers Google et les écrans existants s'appuient dessus, et on n'y
// touche pas. La liaison porte l'ENSEMBLE des conviés ; le premier de la liste est
// recopié dans `artisan_id` pour que les deux restent cohérents.

/**
 * Aligne la liaison sur la liste voulue, en ne touchant que ce qui change.
 *
 * Écrire par DIFFÉRENCE plutôt que « tout supprimer puis tout réinsérer » : une panne
 * au milieu d'un vide-puis-remplis laisserait le rendez-vous SANS aucun artisan, donc
 * sans aucun rappel. Le pire résultat possible pour une opération censée en ajouter un.
 *
 * Ne lève jamais : le rendez-vous lui-même est déjà enregistré quand on arrive ici.
 *
 * @param {object} supabase client (côté navigateur : la RLS s'applique)
 * @param {string} rdvId
 * @param {string[]} artisanIds liste voulue (doublons et valeurs vides tolérés)
 * @returns {Promise<{ok: boolean, erreur?: string}>}
 */
export async function synchroniserArtisansRdv(supabase, rdvId, artisanIds) {
  if (!rdvId) return { ok: false, erreur: 'rendez-vous inconnu' }
  const voulus = [...new Set((artisanIds || []).filter(Boolean))]

  try {
    const { data: actuels, error: errLecture } = await supabase
      .from('rendez_vous_artisans').select('artisan_id').eq('rendez_vous_id', rdvId)
    if (errLecture) return { ok: false, erreur: errLecture.message }

    const dejaLa = new Set((actuels || []).map(l => l.artisan_id))
    const aAjouter = voulus.filter(a => !dejaLa.has(a))
    const aRetirer = [...dejaLa].filter(a => !voulus.includes(a))

    if (aAjouter.length > 0) {
      const { error } = await supabase.from('rendez_vous_artisans')
        .insert(aAjouter.map(artisan_id => ({ rendez_vous_id: rdvId, artisan_id })))
      if (error) return { ok: false, erreur: error.message }
    }
    if (aRetirer.length > 0) {
      const { error } = await supabase.from('rendez_vous_artisans')
        .delete().eq('rendez_vous_id', rdvId).in('artisan_id', aRetirer)
      if (error) return { ok: false, erreur: error.message }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, erreur: e.message }
  }
}

/**
 * Ce qu'on écrit dans `rendez_vous.prevenir_client`.
 *
 * NULL quand le choix de l'agente COÏNCIDE avec le défaut du type : la ligne reste
 * gouvernée par la règle métier, et faire évoluer ce défaut plus tard s'appliquera aux
 * rendez-vous déjà saisis. Une valeur explicite n'est stockée que lorsqu'elle S'ÉCARTE
 * du défaut — c'est-à-dire quand l'agente a vraiment décidé quelque chose.
 *
 * @param {boolean|null|undefined} choix ce que montre la case
 * @param {boolean} defautDuType
 * @returns {boolean|null}
 */
export function valeurPrevenirClient(choix, defautDuType) {
  if (choix === null || choix === undefined) return null
  return choix === defautDuType ? null : choix
}

/** Les ids conviés, tels que renvoyés par un select avec `rendez_vous_artisans(artisan_id)`. */
export function idsArtisansDepuisRdv(rdv) {
  const lies = (rdv?.rendez_vous_artisans || []).map(l => l.artisan_id).filter(Boolean)
  // Repli sur l'artisan principal : un rendez-vous d'avant la migration, ou créé par un
  // chemin qui n'aurait pas rempli la liaison, ne doit pas s'afficher « sans artisan ».
  if (lies.length === 0 && rdv?.artisan_id) return [rdv.artisan_id]
  return [...new Set(lies)]
}
