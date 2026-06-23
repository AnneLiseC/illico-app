-- ============================================================================
-- C7-4 (B3a) — Retrait de la policy comptes_rendus_client_read
-- ----------------------------------------------------------------------------
-- OBJECTIF : rendre la TABLE public.comptes_rendus FAIL-CLOSED pour le client.
-- Le front lit désormais la vue public.client_comptes_rendus (bascule déployée
-- et testée à l'écran) ; la lecture directe de la table par le client n'a plus
-- de raison d'être. On la SUPPRIME → un client ne peut plus lire la table en
-- requête directe (donc plus de R1/R2/R3, ni notes_brutes / contenu_ia).
--
-- POURQUOI MAINTENANT : le front ne dépend plus de cette policy (il passe par la
-- vue). La vue (definer, colonnes limitées, valide + type NOT IN r1/r2/r3) reste
-- le SEUL point d'accès client aux CR.
--
-- CE QU'ON RETIRE : UNIQUEMENT la policy `comptes_rendus_client_read`.
-- CE QU'ON NE TOUCHE PAS :
--   - la policy STAFF `comptes_rendus_scope` (admin/agente) → INCHANGÉE ;
--   - la vue `client_comptes_rendus` → INCHANGÉE ;
--   - le realtime : l'abonnement front sur la table `comptes_rendus` ne recevra
--     plus d'événements pour le client (le realtime respecte la RLS, et le client
--     n'a plus de policy SELECT sur la table). PERTE ASSUMÉE (option a) : le CR se
--     recharge à l'ouverture de l'espace client. Le retrait de l'abonnement côté
--     front est une étape séparée (non bloquante : l'abonnement ne reçoit juste
--     plus rien, pas d'erreur).
--
-- À APPLIQUER MANUELLEMENT par Anne-Lise APRÈS le merge de la bascule front.
-- ============================================================================

RESET ROLE;

-- ── 1. VÉRIF AVANT (lecture seule) ──────────────────────────────────────────
-- Doit montrer : comptes_rendus_client_read (SELECT, à retirer) ET
--                comptes_rendus_scope (ALL, staff, à préserver).
SELECT policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'comptes_rendus'
ORDER BY policyname;

-- ── 2. RETRAIT (transaction unique) ─────────────────────────────────────────
BEGIN;

  DROP POLICY comptes_rendus_client_read ON public.comptes_rendus;

COMMIT;

-- ── 3. VÉRIF APRÈS — policies ───────────────────────────────────────────────
-- (a) comptes_rendus_client_read a DISPARU ; comptes_rendus_scope est TOUJOURS là.
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'comptes_rendus'
ORDER BY policyname;

-- ── 4. VÉRIF APRÈS — comportement (sous le rôle authenticated + JWT de A) ────
-- IMPORTANT : on passe en rôle `authenticated` pour que la RLS de la TABLE
-- s'applique réellement (postgres bypasse la RLS → un SELECT en postgres
-- renverrait toutes les lignes, ce qui ne testerait rien). Transaction en
-- ROLLBACK : aucun effet de bord, on ne fait que LIRE.
BEGIN;
  SET LOCAL request.jwt.claims TO '{"sub":"c6cadabd-b013-4554-a3f2-cdaede69b33e","role":"authenticated"}';
  SET LOCAL ROLE authenticated;

  -- (a) FAIL-CLOSED : le client ne lit plus la TABLE directement → doit être 0.
  SELECT count(*) AS table_comptes_rendus_doit_etre_0
  FROM public.comptes_rendus;

  -- (b) La VUE marche toujours pour A → doit être 2 (les CR visibles, inchangés).
  SELECT count(*) AS vue_client_comptes_rendus_doit_etre_2
  FROM public.client_comptes_rendus;

ROLLBACK;   -- restaure le rôle + le claim (lecture seule)

-- ============================================================================
-- ROLLBACK (recréer la policy à l'identique — définition EXACTE d'origine) :
-- ----------------------------------------------------------------------------
-- BEGIN;
--   CREATE POLICY comptes_rendus_client_read ON public.comptes_rendus
--     FOR SELECT TO authenticated
--     USING (
--       dossier_id IN (
--         SELECT d.id
--         FROM public.dossiers d
--         WHERE d.client_id IN (
--           SELECT profiles.client_id
--           FROM public.profiles
--           WHERE profiles.id = (SELECT auth.uid())
--         )
--       )
--     );
-- COMMIT;
-- ============================================================================
