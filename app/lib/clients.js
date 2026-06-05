// app/lib/clients.js
//
// Actions d'archivage / suppression d'un client (Lot 2 — backend).
// La propagation archive → dossiers est assurée par le trigger DB
// `clients_propagate_archive` : ces helpers ne touchent QUE la table clients,
// jamais les dossiers (pas de propagation applicative à dupliquer).
//
// Helpers purs : reçoivent le client supabase + l'id, retournent { error }.
// Redirection et re-fetch restent à la charge de l'appelant (pages, Lot 4).

// 🔹 Archiver un client. Le trigger DB propage archive=true sur tous ses dossiers.
export async function archiverClient(supabase, clientId) {
  const { error } = await supabase.from('clients').update({ archive: true }).eq('id', clientId)
  return { error }
}

// 🔹 Désarchiver un client. Le trigger DB propage archive=false sur ses dossiers.
export async function desarchiverClient(supabase, clientId) {
  const { error } = await supabase.from('clients').update({ archive: false }).eq('id', clientId)
  return { error }
}

// 🔹 Supprimer définitivement un client SANS dossier.
// La FK dossiers.client_id (NO ACTION) bloque la suppression d'un client encore
// référencé par un dossier : Postgres renvoie alors le code 23503. On le traduit
// en message exploitable par l'UI ; toute autre erreur est propagée telle quelle.
export async function supprimerClient(supabase, clientId) {
  const { error } = await supabase.from('clients').delete().eq('id', clientId)
  if (error?.code === '23503') {
    return {
      error: {
        code: '23503',
        message: 'Ce client a des dossiers et ne peut pas être supprimé. Archivez-le plutôt.',
      },
    }
  }
  return { error }
}
