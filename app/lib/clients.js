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

// 🔹 Formatage du nom affiché d'un client (source UNIQUE).
// Gère la 2e personne optionnelle (prenom2/nom2) sans jamais produire « null » :
//   - 1 personne          → "Prénom Nom"
//   - 2 noms différents   → "Prénom1 Nom1 & Prénom2 Nom2"
//   - 2 personnes, même nom (nom2 vide) → "Prénom1 & Prénom2 Nom1" (Option A, mutualisé)
//   - client absent       → "—"
// Options : civilite (préfixe la civilité si présente), upper (NOM en majuscules pour les listes).
export function formatNomClient(client, { civilite = false, upper = false } = {}) {
  if (!client) return '—'
  const cap = s => (upper ? (s || '').toUpperCase() : (s || ''))
  const p1 = `${client.prenom || ''} ${cap(client.nom)}`.trim()
  const pre = civilite && client.civilite ? `${client.civilite} ` : ''
  if (!client.prenom2) return `${pre}${p1}`.trim()
  if (!client.nom2) return `${pre}${client.prenom || ''} & ${client.prenom2} ${cap(client.nom)}`.trim()
  return `${pre}${p1} & ${client.prenom2} ${cap(client.nom2)}`.trim()
}
