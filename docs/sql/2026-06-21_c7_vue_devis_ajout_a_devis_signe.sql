-- ============================================================================
-- C7-3 (B1) — Ajout de a_devis_signe à la vue public.client_devis_acceptes
-- ----------------------------------------------------------------------------
-- OBJECTIF : exposer au client un booléen NON SENSIBLE indiquant si le devis
-- accepté possède un PDF signé (pour afficher/masquer le bouton « voir le PDF »).
--   a_devis_signe = (devis_artisans.devis_signe_path IS NOT NULL)
--
-- ON N'EXPOSE PAS devis_signe_path : c'est un chemin storage (interne, sensible).
-- Seule l'EXISTENCE (oui/non) est exposée. Le PDF lui-même reste servi par la
-- route /api/pdf en service_role (C7-3 B2), jamais via le bucket.
--
-- ⚠️ LA VUE EST SECURITY DEFINER (security_invoker = false) — point sensible
-- PERMANENT : la vue lit les tables avec les droits de son propriétaire et porte
-- tout le scoping dans son WHERE (auth.uid → mes_dossiers_client()). On NE CHANGE
-- RIEN au mécanisme : même security_invoker, même WHERE (statut='accepte' AND
-- dossier_id IN (SELECT mes_dossiers_client())), mêmes 4 colonnes existantes.
-- SEUL AJOUT = une 5e colonne booléenne, EN DERNIÈRE POSITION (CREATE OR REPLACE
-- VIEW interdit de réordonner/supprimer les colonnes existantes).
--
-- ⚠️ APRÈS APPLICATION : RELANCER le test d'étanchéité (docs/sql/
-- test_c7_vue_devis_client.sql) — toute modification d'une vue definer impose de
-- reprouver l'isolement inter-client.
--
-- PRÉREQUIS : C7-1 déjà appliqué (fonction public.mes_dossiers_client() + vue
-- public.client_devis_acceptes en version 4 colonnes). Une garde le vérifie.
--
-- À APPLIQUER MANUELLEMENT par Anne-Lise après relecture (SQL editor / psql).
-- ============================================================================

RESET ROLE;

-- ── 0. Garde : prérequis présents ───────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.client_devis_acceptes') IS NULL THEN
    RAISE EXCEPTION 'PREREQUIS MANQUANT : appliquer d''abord 2026-06-20_c7_vue_devis_client.sql (vue absente)';
  END IF;
  IF to_regprocedure('public.mes_dossiers_client()') IS NULL THEN
    RAISE EXCEPTION 'PREREQUIS MANQUANT : fonction mes_dossiers_client() absente';
  END IF;
END $$;

-- ── 1. VÉRIF AVANT (lecture seule) — doit montrer les 4 colonnes actuelles ───
--     {devis_id, dossier_id, statut, artisan_entreprise}, dans CET ordre.
SELECT ordinal_position, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'client_devis_acceptes'
ORDER BY ordinal_position;

-- ── 2. MODIFICATION (transaction unique) ────────────────────────────────────
BEGIN;

  -- CREATE OR REPLACE : on RÉÉCRIT la vue à l'identique + 1 colonne en fin.
  -- Les 4 premières colonnes restent dans le MÊME ordre (sinon le REPLACE échoue).
  -- security_invoker = false : INCHANGÉ. WHERE : INCHANGÉ.
  CREATE OR REPLACE VIEW public.client_devis_acceptes
  WITH (security_invoker = false) AS
    SELECT
      da.id                              AS devis_id,
      da.dossier_id                      AS dossier_id,
      da.statut                          AS statut,
      a.entreprise                       AS artisan_entreprise,
      (da.devis_signe_path IS NOT NULL)  AS a_devis_signe   -- 5e colonne, AJOUT
    FROM public.devis_artisans da
    JOIN public.artisans a ON a.id = da.artisan_id
    WHERE da.statut = 'accepte'
      AND da.dossier_id IN (SELECT public.mes_dossiers_client());

  COMMENT ON VIEW public.client_devis_acceptes IS
    'C7-1/C7-3 — Lecture client des devis ACCEPTES de SES dossiers + entreprise '
    'artisan + a_devis_signe (existence d''un PDF signe, sans exposer le chemin). '
    'security_invoker=false (definer) : scoping via mes_dossiers_client(). '
    'Tables devis_artisans/artisans restent fail-closed.';

  -- Droits : CREATE OR REPLACE conserve normalement les grants, mais on REVÉRIFIE
  -- (idempotent) que authenticated n'a que SELECT et anon/PUBLIC rien.
  REVOKE ALL ON public.client_devis_acceptes FROM PUBLIC, anon;
  REVOKE ALL ON public.client_devis_acceptes FROM authenticated;
  GRANT SELECT ON public.client_devis_acceptes TO authenticated;

COMMIT;

-- ── 3. VÉRIF APRÈS (lecture seule) ──────────────────────────────────────────
-- (a) Colonnes = {devis_id, dossier_id, statut, artisan_entreprise, a_devis_signe},
--     a_devis_signe de type boolean, et devis_signe_path ABSENT.
SELECT ordinal_position, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'client_devis_acceptes'
ORDER BY ordinal_position;

-- (b) Contrôle explicite : aucune colonne sensible (devis_signe_path) dans la vue.
SELECT count(*) AS doit_etre_zero
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'client_devis_acceptes'
  AND column_name = 'devis_signe_path';

-- (c) Droits : authenticated = SELECT seul ; rien à anon/PUBLIC.
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'client_devis_acceptes'
ORDER BY grantee, privilege_type;

-- ── 4. RAPPEL : relancer le test d'étanchéité ───────────────────────────────
--     Exécuter docs/sql/test_c7_vue_devis_client.sql (T1..T6) — l'isolement
--     inter-client doit rester PROUVÉ après cette modification de la vue definer.

-- ============================================================================
-- ROLLBACK (revenir à la vue 4 colonnes, sans a_devis_signe) :
-- ----------------------------------------------------------------------------
-- BEGIN;
--   CREATE OR REPLACE VIEW public.client_devis_acceptes
--   WITH (security_invoker = false) AS
--     SELECT
--       da.id          AS devis_id,
--       da.dossier_id  AS dossier_id,
--       da.statut      AS statut,
--       a.entreprise   AS artisan_entreprise
--     FROM public.devis_artisans da
--     JOIN public.artisans a ON a.id = da.artisan_id
--     WHERE da.statut = 'accepte'
--       AND da.dossier_id IN (SELECT public.mes_dossiers_client());
--   REVOKE ALL ON public.client_devis_acceptes FROM PUBLIC, anon, authenticated;
--   GRANT SELECT ON public.client_devis_acceptes TO authenticated;
-- COMMIT;
-- ============================================================================
