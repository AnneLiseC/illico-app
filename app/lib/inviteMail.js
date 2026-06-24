// app/lib/inviteMail.js
// Construit un brouillon mailto pré-rempli pour inviter un client à son espace.
// Le référent l'envoie depuis SA propre boîte (pas d'envoi auto serveur).
// Body concis : la limite pratique d'un mailto est ~2000 chars ; l'action_link
// fait ~300, on reste large.
export function buildInviteMailto({ email, prenom, actionLink, loginUrl }) {
  const subject = 'Votre accès à votre espace client BATILIS'
  const body = [
    `Bonjour ${prenom || ''},`,
    '',
    'Vous pouvez accéder à votre espace client pour suivre votre projet.',
    '',
    'Pour créer votre mot de passe, cliquez sur ce lien :',
    actionLink,
    '',
    `Ensuite, vous vous connecterez à tout moment ici : ${loginUrl}`,
    '',
    'À bientôt,',
  ].join('\n')
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
