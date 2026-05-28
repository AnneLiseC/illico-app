-- =============================================================================
-- MT4 — Helpers get_my_societe_id / get_my_agence_id + REVOKE (Lot L4, Phase 2)
-- =============================================================================
-- Objectif : créer 2 fonctions helper (calquées EXACTEMENT sur get_my_role réel)
--            qui retournent la société / l'agence de l'utilisateur courant, et
--            durcir les EXECUTE (retirer anon + PUBLIC) sur les 3 helpers.
-- Ces helpers seront utilisés par les policies RLS de la Phase 3.
-- Pré-requis : MT3 appliqué (profiles.societe_id NOT NULL, agence_id nullable).
--
-- Modèle de référence (get_my_role réel, reconnaissance H) :
--   LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
--   corps : select role from profiles where id = auth.uid()
-- On reproduit ce style à l'identique pour cohérence et sécurité.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- CONTRÔLE AVANT (lecture seule)
-- -----------------------------------------------------------------------------

-- a) Les helpers societe/agence n'existent pas encore ; get_my_role existe
SELECT p.proname, p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('get_my_role', 'get_my_societe_id', 'get_my_agence_id')
ORDER BY p.proname;
-- Attendu : seulement get_my_role (security_definer = true)

-- b) GRANTs actuels sur get_my_role (référence avant durcissement)
SELECT routine_name, grantee, privilege_type
FROM information_schema.role_routine_grants
WHERE routine_schema = 'public'
  AND routine_name = 'get_my_role'
ORDER BY grantee;
-- Attendu : service_role, authenticated, anon, postgres, PUBLIC (EXECUTE)


-- -----------------------------------------------------------------------------
-- APPLICATION — Partie 1 : création des helpers
-- -----------------------------------------------------------------------------
BEGIN;

-- get_my_societe_id : la société de l'utilisateur courant (admin ET agente
-- portent societe_id ; le client aussi s'il a été rattaché).
CREATE OR REPLACE FUNCTION public.get_my_societe_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
  select societe_id from profiles where id = auth.uid()
$function$;

-- get_my_agence_id : l'agence de l'utilisateur courant.
-- NB : pour un admin, agence_id est NULL (D14) -> cette fonction renverra NULL
-- pour un admin, ce qui est correct (les policies admin filtrent par société,
-- pas par agence). Pour une agente, renvoie son agence.
CREATE OR REPLACE FUNCTION public.get_my_agence_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
  select agence_id from profiles where id = auth.uid()
$function$;

COMMIT;


-- -----------------------------------------------------------------------------
-- APPLICATION — Partie 2 : DURCISSEMENT des EXECUTE (les 3 helpers)
-- -----------------------------------------------------------------------------
-- Retirer anon et PUBLIC ; ne garder que authenticated (+ service_role implicite
-- via postgres/owner). Les policies RLS s'exécutent dans le contexte de
-- l'utilisateur authentifié, donc 'authenticated' suffit.
BEGIN;

-- get_my_role (durcissement de l'existant)
REVOKE EXECUTE ON FUNCTION public.get_my_role()        FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_role()        FROM PUBLIC;

-- get_my_societe_id (neuf : par défaut PUBLIC a EXECUTE -> on retire)
REVOKE EXECUTE ON FUNCTION public.get_my_societe_id()  FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_societe_id()  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_my_societe_id()  TO authenticated;

-- get_my_agence_id (idem)
REVOKE EXECUTE ON FUNCTION public.get_my_agence_id()   FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_agence_id()   FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_my_agence_id()   TO authenticated;

COMMIT;


-- -----------------------------------------------------------------------------
-- CONTRÔLE APRÈS (lecture seule)
-- -----------------------------------------------------------------------------

-- a) Les 3 helpers existent, tous SECURITY DEFINER
SELECT p.proname, p.prosecdef AS security_definer, pg_get_function_result(p.oid) AS retour
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('get_my_role', 'get_my_societe_id', 'get_my_agence_id')
ORDER BY p.proname;
-- Attendu : 3 lignes, security_definer = true, retour = text / uuid / uuid

-- b) GRANTs après durcissement : plus de anon ni PUBLIC sur les 3
SELECT routine_name, grantee, privilege_type
FROM information_schema.role_routine_grants
WHERE routine_schema = 'public'
  AND routine_name IN ('get_my_role', 'get_my_societe_id', 'get_my_agence_id')
ORDER BY routine_name, grantee;
-- Attendu : pour chacun, grantees = authenticated, postgres/owner, service_role.
--           ABSENCE de 'anon' et de 'PUBLIC'.

-- c) Test fonctionnel des helpers (exécuté en tant que postgres -> auth.uid() est
--    NULL hors contexte requête authentifiée, donc renvoie NULL : c'est normal).
--    Le vrai test se fera en Phase 3 via un compte authentifié.
SELECT public.get_my_role()       AS role_courant,
       public.get_my_societe_id() AS societe_courante,
       public.get_my_agence_id()  AS agence_courante;
-- Attendu (en SQL editor = pas de session auth) : 3 valeurs NULL. NORMAL.
-- (Ne PAS conclure à un bug : auth.uid() est NULL hors requête authentifiée.)


-- =============================================================================
-- ROLLBACK MT4
-- =============================================================================
-- BEGIN;
--   -- 1) supprimer les 2 nouveaux helpers
--   DROP FUNCTION IF EXISTS public.get_my_societe_id();
--   DROP FUNCTION IF EXISTS public.get_my_agence_id();
--   -- 2) restaurer les GRANTs d'origine sur get_my_role (re-ouvrir anon + PUBLIC)
--   --    ⚠️ ne le faire que si on veut vraiment revenir à l'état AVANT (faille connue).
--   GRANT EXECUTE ON FUNCTION public.get_my_role() TO anon;
--   GRANT EXECUTE ON FUNCTION public.get_my_role() TO PUBLIC;
-- COMMIT;
-- =============================================================================


-- =============================================================================
-- ÉTAT SÛR FIN DE PHASE 2 (après MT1->MT4)
-- -----------------------------------------------------------------------------
-- - Tables societes/agences créées, seedées (CTP/Martigues), RLS activée FERMÉE.
-- - Colonnes societe_id/agence_id sur profiles/dossiers/clients/artisans,
--   backfillées, NOT NULL (sauf profiles.agence_id nullable pour admin).
-- - 3 helpers prêts, EXECUTE durci (authenticated only).
-- - RLS des tables métier PAS ENCORE basculée -> Marine voit comme avant.
-- - Vérif finale recommandée : se connecter à l'app en admin ET en agente,
--   confirmer que tout s'affiche comme avant (aucune régression visible).
--   Le multi-tenant n'est pas encore "actif" tant que la Phase 3 (RLS) n'est pas faite.
-- =============================================================================
