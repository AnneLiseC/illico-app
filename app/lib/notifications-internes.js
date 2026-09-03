// app/lib/notifications-internes.js
// Écriture d'une notification interne, côté SERVEUR (service_role).
//
// POURQUOI CE FICHIER EXISTE — audit du 03/09, réserves R5 et R22.
//
// L'application avait pris l'habitude de signaler ses pannes par courriel, en
// « best-effort », c'est-à-dire en avalant l'échec. Deux conséquences vécues :
//   · une demande d'ouverture de compte agent pouvait dormir en base sans que personne
//     ne soit prévenu, parce que le courriel n'était pas parti (R5) ;
//   · un Drive déconnecté renvoyait `200 skipped: reconnect`, personne ne lisait la
//     réponse, et le miroir documentaire pouvait être arrêté depuis des semaines sans
//     que l'utilisateur s'en doute (R22).
//
// La notification interne ne dépend d'aucune boîte d'envoi : elle est en base, elle
// s'affiche dans l'application. C'est le seul canal qui survit à une panne de courriel.
//
// LA DÉDUPLICATION EST LE POINT IMPORTANT. Un Drive déconnecté échoue à CHAQUE envoi :
// sans garde-fou, l'utilisateur reçoit quarante notifications identiques dans la journée
// et apprend à toutes les ignorer — ce qui revient exactement au silence qu'on essaie de
// corriger. Une seule notification par type et par fenêtre de temps.

import { createClient } from '@supabase/supabase-js'

let _admin
function db() {
  if (!_admin) _admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  return _admin
}

/**
 * Pose une notification interne pour un utilisateur.
 * Ne lève JAMAIS : prévenir est un service rendu en plus, jamais une raison d'échouer
 * l'opération en cours.
 *
 * @param userId   destinataire (auth.users.id)
 * @param type     identifiant court, sert aussi de clé de déduplication
 * @param titre    titre affiché
 * @param message  corps du message
 * @param dossierId  facultatif, pour lier la notification à un dossier
 * @param fenetreHeures  ne pas reposer la même notification si une NON LUE du même type
 *                       existe déjà dans cette fenêtre. 0 = pas de déduplication.
 * @returns {Promise<boolean>} true si une notification a été créée.
 */
export async function notifierUtilisateur({ userId, type, titre, message, dossierId = null, fenetreHeures = 24 }) {
  if (!userId || !type || !titre || !message) return false
  try {
    if (fenetreHeures > 0) {
      const depuis = new Date(Date.now() - fenetreHeures * 3600_000).toISOString()
      const { data: dejaLa } = await db().from('notifications')
        .select('id')
        .eq('user_id', userId).eq('type', type).eq('lu', false)
        .gte('created_at', depuis)
        .limit(1)
      if (dejaLa && dejaLa.length > 0) return false
    }

    const { error } = await db().from('notifications').insert({
      user_id: userId, type, titre, message, dossier_id: dossierId, lu: false,
    })
    return !error
  } catch {
    return false
  }
}

/**
 * Cas particulier assez fréquent pour mériter son raccourci : le compte Drive/agenda
 * d'un utilisateur demande une reconnexion. Une par jour, pas une par fichier.
 */
export async function signalerReconnexionDrive(userId, fournisseur = 'OneDrive') {
  return notifierUtilisateur({
    userId,
    type: 'drive_reconnexion',
    titre: `${fournisseur} déconnecté`,
    message: `Tes documents ne sont plus copiés vers ${fournisseur} : la connexion a expiré. `
      + `Reconnecte le compte depuis Paramètres pour reprendre l'archivage. `
      + `Les documents créés depuis la déconnexion seront rattrapés avec le bouton « Rattrapage ».`,
    fenetreHeures: 24,
  })
}
