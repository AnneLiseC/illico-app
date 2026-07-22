// app/lib/super-admin.js
// Identité SUPER-ADMIN (éditrice Coordibat). Ce n'est PAS un rôle applicatif :
// l'éditrice n'a aucun profil, aucune société, aucune agence → l'RLS ne lui montre
// rien d'aucun tenant. Son seul pouvoir passe par les routes /api/super-admin/*
// qui tournent en service_role APRÈS avoir vérifié son email côté serveur.
//
// Deux variables d'env, deux usages :
//   - SUPER_ADMIN_EMAILS (serveur, AUTORITÉ) : gate des routes /api/super-admin/*.
//   - NEXT_PUBLIC_SUPER_ADMIN_EMAILS (client, ROUTAGE UI seulement) : sert à
//     rediriger vers /super-admin et à ne pas envoyer l'éditrice vers l'onboarding.
//     JAMAIS une barrière de sécurité — la vraie barrière est serveur.
// Valeur : liste d'emails séparés par des virgules (ex. anne-lise.caillet@outlook.com).

export function parseEmailList(raw) {
  return (raw || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
}

export function isSuperAdminEmail(email, raw) {
  if (!email || typeof email !== 'string') return false
  return parseEmailList(raw).includes(email.trim().toLowerCase())
}
