-- perf_rls_initplan.sql
--
-- Date : 2026-06-16
-- Objet : corriger l'advisor Supabase auth_rls_initplan (lint 0003).
--   auth.uid() appelé PAR LIGNE dans une policy RLS → l'encapsuler en
--   (select auth.uid()) le fait évaluer UNE seule fois par requête (InitPlan).
--   Aucune modification de la logique de sécurité (même expression, même TO,
--   même cmd) — uniquement la performance.
--
-- Périmètre : 3 policies, toutes sur public.notifications.
--   ⚠️ Le reste des policies du schéma public est DÉJÀ encapsulé
--   (forme « ( SELECT get_my_role() ) » / « ( SELECT auth.uid() ) »), confirmé
--   par pg_policies + advisor (le « 32 » initial était obsolète). Rien d'autre
--   à corriger.
--   Policies storage (bucket documents/photos) non concernées (storage.foldername,
--   pas auth.uid()). admin_invitations : 0 policy (service_role only).
--
-- Idempotent (DROP POLICY IF EXISTS + CREATE), non destructif (pas de data).
RESET ROLE;

-- ── TABLE: notifications ──

-- 1) INSERT (TO authenticated) — chacun ne crée que SES notifications.
DROP POLICY IF EXISTS "Authenticated insert own notifications" ON public.notifications;
CREATE POLICY "Authenticated insert own notifications" ON public.notifications
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

-- 2) SELECT (TO public) — chacun voit SES notifications.
DROP POLICY IF EXISTS "Users see own notifications" ON public.notifications;
CREATE POLICY "Users see own notifications" ON public.notifications
  AS PERMISSIVE FOR SELECT TO public
  USING ((select auth.uid()) = user_id);

-- 3) UPDATE (TO public) — chacun marque SES notifications comme lues.
--    (with_check d'origine = NULL → défaut sur l'expression USING ; on conserve
--     ce comportement en ne spécifiant que USING.)
DROP POLICY IF EXISTS "Users mark own notifications read" ON public.notifications;
CREATE POLICY "Users mark own notifications read" ON public.notifications
  AS PERMISSIVE FOR UPDATE TO public
  USING ((select auth.uid()) = user_id);

-- ───────────────────────────────────────────────────────────────────────────
-- VÉRIF APRÈS — doit renvoyer 0 ligne (plus aucune policy notifications avec
-- un auth.uid() brut non encapsulé) :
-- ───────────────────────────────────────────────────────────────────────────
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname='public' AND tablename='notifications'
  AND (qual LIKE '%auth.uid()%' AND qual NOT LIKE '%( SELECT auth.uid()%'
    OR with_check LIKE '%auth.uid()%' AND with_check NOT LIKE '%( SELECT auth.uid()%');

-- ───────────────────────────────────────────────────────────────────────────
-- ROLLBACK (commenté) — restaure les policies d'origine (auth.uid() brut).
-- À exécuter manuellement si besoin de revenir en arrière :
-- ───────────────────────────────────────────────────────────────────────────
-- DROP POLICY IF EXISTS "Authenticated insert own notifications" ON public.notifications;
-- CREATE POLICY "Authenticated insert own notifications" ON public.notifications
--   AS PERMISSIVE FOR INSERT TO authenticated
--   WITH CHECK (auth.uid() = user_id);
--
-- DROP POLICY IF EXISTS "Users see own notifications" ON public.notifications;
-- CREATE POLICY "Users see own notifications" ON public.notifications
--   AS PERMISSIVE FOR SELECT TO public
--   USING (auth.uid() = user_id);
--
-- DROP POLICY IF EXISTS "Users mark own notifications read" ON public.notifications;
-- CREATE POLICY "Users mark own notifications read" ON public.notifications
--   AS PERMISSIVE FOR UPDATE TO public
--   USING (auth.uid() = user_id);
