-- ═══════════════════════════════════════════════════════════════════════════
-- AUTH — table reset_cooldown (anti-flood « mot de passe oublié »)
-- ═══════════════════════════════════════════════════════════════════════════
-- La route /api/reset-password envoie le lien de reset depuis NOTRE boîte Outlook
-- (Graph) au lieu de Supabase. On perd le rate-limit natif de Supabase → cette table
-- fournit un cooldown par email (1 envoi / minute) pour protéger la boîte d'envoi
-- d'un flood. 1 ligne = 1 email, mise à jour à chaque envoi réussi.
-- Accès service_role uniquement (routes serveur) : RLS activée, AUCUNE policy.
--
-- À exécuter dans Supabase AVANT déploiement de /api/reset-password.

CREATE TABLE IF NOT EXISTS public.reset_cooldown (
  email        text PRIMARY KEY,
  last_sent_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reset_cooldown ENABLE ROW LEVEL SECURITY;
-- Pas de policy → seul le service_role (qui bypass la RLS) peut lire/écrire.

-- ── ROLLBACK (commenté) ──
-- DROP TABLE IF EXISTS public.reset_cooldown;
