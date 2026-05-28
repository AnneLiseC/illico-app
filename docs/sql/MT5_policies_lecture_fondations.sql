-- =============================================================================
-- MT5 — Policies de LECTURE sur societes + agences (anticipation L5a / Cas 6)
-- =============================================================================
-- Contexte : MT1 a créé societes/agences avec RLS activée mais SANS policy
--            (fermées par défaut). Le code applicatif côté navigateur (rôle
--            `authenticated`) ne peut donc PAS lire ces tables. L6-light a besoin
--            que l'admin puisse lire `agences` (pour déduire l'unique agence de
--            sa société à la création client/artisan) -> chemins 6 et 8 bloqués.
-- Objectif : créer les policies de LECTURE (SELECT) définitives sur ces 2 tables
--            (= "Cas 6" du pattern RLS, doc 07 §5.2). Anticipation propre d'une
--            brique de L5a (Phase 3), comme L6-light anticipe une partie de L6.
-- Périmètre : LECTURE uniquement. PAS de policy INSERT/UPDATE/DELETE -> ces tables
--            restent fermées en écriture (seul service_role/SQL écrit). La création
--            de société/agence par un franchisé viendra avec l'onboarding (L14b).
-- Pré-requis : MT4 appliqué (helper get_my_societe_id() existe, durci authenticated).
-- Méthode : appliquer MAIN dans le SQL editor Supabase. Contrôle avant/après + rollback.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- CONTRÔLE AVANT (lecture seule)
-- -----------------------------------------------------------------------------

-- a) Confirmer 0 policy actuelle sur les 2 tables
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('agences', 'societes');
-- Attendu : 0 ligne

-- b) Confirmer RLS activée
SELECT relname, relrowsecurity
FROM pg_class
WHERE relnamespace = 'public'::regnamespace AND relname IN ('agences', 'societes');
-- Attendu : relrowsecurity = true pour les deux

-- c) Confirmer que le helper get_my_societe_id() existe
SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'get_my_societe_id';
-- Attendu : 1 ligne


-- -----------------------------------------------------------------------------
-- APPLICATION
-- -----------------------------------------------------------------------------
BEGIN;

-- societes : un utilisateur authentifié lit SA société (celle de son profil).
CREATE POLICY societes_select_la_mienne ON public.societes
  FOR SELECT
  TO authenticated
  USING (id = (SELECT public.get_my_societe_id()));

-- agences : un utilisateur authentifié lit les agences de SA société.
-- (admin -> toutes les agences de sa société ; agente -> idem, mais en pratique
--  une agente a sa propre agence_id donc lit rarement cette table.)
CREATE POLICY agences_select_ma_societe ON public.agences
  FOR SELECT
  TO authenticated
  USING (societe_id = (SELECT public.get_my_societe_id()));

COMMIT;


-- -----------------------------------------------------------------------------
-- CONTRÔLE APRÈS (lecture seule)
-- -----------------------------------------------------------------------------

-- a) Les 2 policies SELECT existent
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('agences', 'societes')
ORDER BY tablename, policyname;
-- Attendu : 2 lignes, cmd = SELECT, roles = {authenticated}
--   agences  | agences_select_ma_societe  | SELECT | {authenticated}
--   societes | societes_select_la_mienne  | SELECT | {authenticated}

-- b) Toujours AUCUNE policy d'écriture (les tables restent fermées en écriture)
SELECT tablename, cmd, count(*)
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('agences', 'societes')
GROUP BY tablename, cmd;
-- Attendu : uniquement des lignes cmd = SELECT. Aucune INSERT/UPDATE/DELETE/ALL.

-- -----------------------------------------------------------------------------
-- TEST FONCTIONNEL (à faire APRÈS, côté application, connecté en ADMIN Marine)
-- -----------------------------------------------------------------------------
-- Re-tester les chemins 6 et 8 de L6-light :
--   6) Admin crée un client en se désignant elle-même référente -> doit réussir.
--   8) Admin crée un artisan -> doit réussir.
-- Si ça réussit, c'est que le code peut maintenant lire `agences`. Aucune
-- modification de code nécessaire (le code L6-light était correct, c'est la RLS
-- qui l'empêchait de lire).
--
-- NB : en SQL editor (owner, bypass RLS) on ne peut PAS reproduire le blocage.
-- Le vrai test est dans l'app, en tant qu'utilisateur authentifié.


-- =============================================================================
-- ROLLBACK MT5
-- =============================================================================
-- BEGIN;
--   DROP POLICY IF EXISTS societes_select_la_mienne ON public.societes;
--   DROP POLICY IF EXISTS agences_select_ma_societe  ON public.agences;
-- COMMIT;
-- -- Après rollback : les tables redeviennent fermées (CONTRÔLE AVANT = 0 policy).
-- -- ⚠️ Mais alors L6-light chemins 6/8 re-planteront. Ne rollback que si problème.