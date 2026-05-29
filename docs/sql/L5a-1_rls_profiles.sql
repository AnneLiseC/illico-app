-- =============================================================================
-- L5a-1 — RLS profiles : cloisonnement société + protection identité
-- =============================================================================
-- Phase 3, première table (la plus fondatrice : tous les helpers lisent profiles).
-- Les helpers get_my_role/get_my_societe_id/get_my_agence_id sont SECURITY DEFINER
-- (vérifié) -> ils bypassent la RLS, donc restreindre profiles ne les casse PAS.
--
-- Objectif :
--   - SELECT : un user se voit lui-même ; SEUL l'admin voit les profils de SA
--              société. Une agente ne voit QUE son propre profil. Un client ne
--              voit que lui-même. (Lectures du profil admin côté agente neutralisées
--              en amont par le lot code L5a-1-prep.)
--   - INSERT : inchangé (chacun crée son propre profil ; api/create-agente passe
--              en service_role donc bypass).
--   - UPDATE : un user modifie sa propre ligne (préférences notif) ; un admin
--              modifie les profils de SA société (USING = WITH CHECK, même condition).
--   - Le figeage de role ET societe_id est assuré par le TRIGGER (L5a-1b), pas par
--              le WITH CHECK (on évite un double mécanisme fragile dépendant de
--              get_my_societe_id()).
--   - Trigger : 2e barrière, interdit toute modif de role ET societe_id via l'app
--              (service_role/SQL direct non concerné -> Anne-Lise peut corriger).
--   - Passage des policies en TO authenticated (conforme plan §point A).
--
-- Méthode : appliquer MAIN. Contrôle AVANT/APRÈS + rollback. EN 2 SOUS-ÉTAPES :
--   L5a-1a = policies (appliquer, smoke test login + visibilité)
--   L5a-1b = trigger (appliquer, smoke test protection)
-- =============================================================================


-- #############################################################################
-- L5a-1a — POLICIES profiles
-- #############################################################################

-- -----------------------------------------------------------------------------
-- CONTRÔLE AVANT (lecture seule)
-- -----------------------------------------------------------------------------
-- Policies actuelles de profiles (attendu : profiles_select_all=true {public},
-- profiles_insert_own, profiles_update_own).
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies WHERE schemaname='public' AND tablename='profiles'
ORDER BY cmd, policyname;

-- Compteur de référence : combien de profils au total, par rôle.
SELECT role, count(*) FROM public.profiles GROUP BY role ORDER BY role;
-- Attendu : admin 1, agente 3, client 1.


-- -----------------------------------------------------------------------------
-- APPLICATION L5a-1a
-- -----------------------------------------------------------------------------
BEGIN;

-- 1) SELECT : remplacer "profiles_select_all : true" (tout le monde voit tout)
DROP POLICY IF EXISTS profiles_select_all ON public.profiles;

CREATE POLICY profiles_select_scope ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    id = (SELECT auth.uid())                              -- chacun voit SON profil
    OR (
      (SELECT public.get_my_role()) = 'admin'             -- SEUL l'admin
      AND societe_id = (SELECT public.get_my_societe_id()) -- voit les profils de SA société
    )
  );

-- 2) INSERT : inchangé dans la logique, mais on le recrée en TO authenticated
--    (l'ancien profiles_insert_own était {public} WITH CHECK (id = auth.uid())).
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;

CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = (SELECT auth.uid()));

-- 3) UPDATE : un user modifie SA ligne (préférences notif) ; un admin modifie
--    les profils de SA société. USING = WITH CHECK. Figeage role/societe_id = trigger.
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;

CREATE POLICY profiles_update_scope ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR (
      (SELECT public.get_my_role()) = 'admin'
      AND societe_id = (SELECT public.get_my_societe_id())
    )
  )
  WITH CHECK (
    -- Même condition que USING : on ne peut écrire que sa propre ligne, ou (admin)
    -- une ligne de SA société. Le figeage de societe_id/role est garanti par le
    -- trigger profiles_protege_identite (L5a-1b) -> pas de double mécanisme fragile ici.
    id = (SELECT auth.uid())
    OR (
      (SELECT public.get_my_role()) = 'admin'
      AND societe_id = (SELECT public.get_my_societe_id())
    )
  );

COMMIT;


-- -----------------------------------------------------------------------------
-- CONTRÔLE APRÈS L5a-1a (lecture seule)
-- -----------------------------------------------------------------------------
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies WHERE schemaname='public' AND tablename='profiles'
ORDER BY cmd, policyname;
-- Attendu : 3 policies, toutes TO {authenticated} :
--   profiles_insert_own   (INSERT)
--   profiles_select_scope (SELECT)
--   profiles_update_scope (UPDATE)

-- -----------------------------------------------------------------------------
-- SMOKE TEST L5a-1a (DANS L'APP, pas en SQL editor)
-- PRÉ-REQUIS : le lot code L5a-1-prep doit être MERGÉ (sinon fiche chantier +
--              finances plantent côté agente sur les .single() admin).
-- -----------------------------------------------------------------------------
-- 1) Se DÉCONNECTER puis se RECONNECTER en admin (Marine). Le login doit marcher
--    (si KO -> un flux anon lisait profiles -> rollback ci-dessous).
-- 2) Connecté en admin : la liste des agentes / l'équipe s'affiche (Marine voit
--    les 5 profils de CTP). Les finances admin affichent le bon nomFranchisee.
-- 3) Se connecter en AGENTE :
--    a) l'app charge, l'agente se voit elle-même (dashboard/profil OK) ;
--    b) ouvrir une FICHE CHANTIER de l'agente -> doit charger SANS erreur
--       (le fetch profil admin ne s'exécute plus côté agente ; label part = 'CTP') ;
--    c) ouvrir les FINANCES -> doivent charger SANS erreur, périmètre = ses dossiers,
--       label part société = 'CTP' ;
--    d) modifier une préférence de notification -> doit réussir (UPDATE sa ligne).
-- 4) Vérifier qu'une agente ne voit AUCUN autre profil (ni autre agente ni admin)
--    dans les écrans accessibles.


-- =============================================================================
-- ROLLBACK L5a-1a (si le login casse ou visibilité KO)
-- =============================================================================
-- BEGIN;
--   DROP POLICY IF EXISTS profiles_select_scope ON public.profiles;
--   DROP POLICY IF EXISTS profiles_update_scope ON public.profiles;
--   DROP POLICY IF EXISTS profiles_insert_own   ON public.profiles;
--   -- Restaurer l'état d'origine :
--   CREATE POLICY profiles_select_all ON public.profiles FOR SELECT USING (true);
--   CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT WITH CHECK (id = auth.uid());
--   CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());
-- COMMIT;



-- #############################################################################
-- L5a-1b — TRIGGER de protection (role + societe_id figés via l'app)
-- #############################################################################
-- À appliquer SEULEMENT après que L5a-1a soit validé par le smoke test.

-- -----------------------------------------------------------------------------
-- CONTRÔLE AVANT (lecture seule) : pas déjà un trigger homonyme ?
-- -----------------------------------------------------------------------------
SELECT tgname FROM pg_trigger
WHERE tgrelid = 'public.profiles'::regclass AND NOT tgisinternal;

-- -----------------------------------------------------------------------------
-- APPLICATION L5a-1b
-- -----------------------------------------------------------------------------
BEGIN;

CREATE OR REPLACE FUNCTION public.profiles_protege_identite()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  -- service_role / SQL direct (postgres) ne sont pas soumis : on cible l'app.
  -- On bloque tout changement de role ou de societe_id quel que soit l'appelant
  -- applicatif. Pour corriger légitimement, passer par SQL direct (bypass trigger
  -- impossible -> voir note). Ici on protège contre l'usage via l'app.
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Modification du role interdite via l''application (contacter l''administrateur).';
  END IF;
  IF NEW.societe_id IS DISTINCT FROM OLD.societe_id THEN
    RAISE EXCEPTION 'Modification de la societe interdite via l''application.';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER profiles_protege_identite_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_protege_identite();

COMMIT;

-- -----------------------------------------------------------------------------
-- CONTRÔLE APRÈS L5a-1b
-- -----------------------------------------------------------------------------
SELECT tgname, tgenabled FROM pg_trigger
WHERE tgrelid = 'public.profiles'::regclass AND NOT tgisinternal;
-- Attendu : profiles_protege_identite_trg présent.

-- -----------------------------------------------------------------------------
-- SMOKE TEST L5a-1b
-- -----------------------------------------------------------------------------
-- 1) En agente : modifier une préférence de notif -> doit TOUJOURS marcher
--    (on ne touche ni role ni societe_id).
-- 2) (Test technique, en SQL via un contexte authentifié si possible, ou à vérifier
--    plus tard) : un UPDATE qui tenterait de changer role/societe_id échoue.
--    NB : en SQL editor (owner/postgres) le trigger LÈVE QUAND MÊME l'exception
--    car il teste les valeurs, pas le rôle appelant -> on peut donc le tester
--    directement (voir requête de test ci-dessous, à exécuter puis annuler).


-- =============================================================================
-- TEST TRIGGER (optionnel, en SQL editor — à exécuter dans une transaction annulée)
-- =============================================================================
-- BEGIN;
--   -- doit ÉCHOUER avec l'exception "Modification du role interdite..." :
--   UPDATE public.profiles SET role = role WHERE id = (SELECT id FROM profiles WHERE role='agente' LIMIT 1);
--   -- ^ NB : role = role est identique donc IS DISTINCT FROM = false -> NE lève PAS.
--   --   Pour vraiment tester, mettre une valeur différente, mais NE PAS COMMIT :
--   -- UPDATE public.profiles SET role = 'admin' WHERE id = (SELECT id FROM profiles WHERE role='agente' LIMIT 1);
-- ROLLBACK;


-- =============================================================================
-- ROLLBACK L5a-1b
-- =============================================================================
-- BEGIN;
--   DROP TRIGGER IF EXISTS profiles_protege_identite_trg ON public.profiles;
--   DROP FUNCTION IF EXISTS public.profiles_protege_identite();
-- COMMIT;
