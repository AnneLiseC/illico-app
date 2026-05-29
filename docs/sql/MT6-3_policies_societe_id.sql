-- =============================================================================
-- MT6-3 — Bascule des policies racines sur societe_id (branche ADMIN)
-- =============================================================================
-- Remplace, dans la branche ADMIN des policies des 4 racines, le sous-SELECT
--   agence_id IN (SELECT id FROM agences WHERE societe_id = get_my_societe_id())
-- par la comparaison directe
--   societe_id = get_my_societe_id()
-- (plus rapide, plus juste sémantiquement ; societe_id en dur depuis MT6-1).
--
-- ⚠️ La branche AGENTE est INCHANGÉE : elle garde
--   referente(_id) = auth.uid() AND agence_id = get_my_agence_id()
-- (défense en profondeur au niveau AGENCE, plus fine que société ; et déjà rapide,
--  pas de sous-SELECT à optimiser). Le sous-SELECT coûteux n'était que côté admin.
--
-- Tables : dossiers, clients, artisans, redevances. NON touchées : profiles
-- (déjà societe_id), filles (EXISTS dossiers), factures_agente (agente_id IN profiles).
--
-- Méthode : table par table, DROP+CREATE de la policy, contrôle avant/après,
-- re-test du cloisonnement (chiffres de référence connus). Rollback par table.
-- Chiffres de référence (tests L5a, peuvent varier légèrement selon créations test) :
--   dossiers : admin 22, agente = ses dossiers ; clients : admin 23, agente ~8 ;
--   artisans : tous (53) admin ET agente ; redevances : agente ses 5.
-- =============================================================================


-- #############################################################################
-- MT6-3-A — dossiers
-- #############################################################################
-- CONTRÔLE AVANT
SELECT policyname, cmd, qual FROM pg_policies
WHERE schemaname='public' AND tablename='dossiers' ORDER BY cmd, policyname;

BEGIN;

DROP POLICY IF EXISTS dossiers_scope ON public.dossiers;

CREATE POLICY dossiers_scope ON public.dossiers
  FOR ALL
  TO authenticated
  USING (
    (
      (SELECT public.get_my_role()) = 'admin'
      AND societe_id = (SELECT public.get_my_societe_id())
    )
    OR (
      referente_id = (SELECT auth.uid())
      AND agence_id = (SELECT public.get_my_agence_id())
    )
  )
  WITH CHECK (
    (
      (SELECT public.get_my_role()) = 'admin'
      AND societe_id = (SELECT public.get_my_societe_id())
    )
    OR (
      referente_id = (SELECT auth.uid())
      AND agence_id = (SELECT public.get_my_agence_id())
    )
  );

COMMIT;

-- CONTRÔLE APRÈS
SELECT policyname, cmd, qual FROM pg_policies
WHERE schemaname='public' AND tablename='dossiers' ORDER BY cmd, policyname;
-- (dossiers_client_read NON touchée, reste telle quelle)

-- RE-TEST dossiers (app) : admin voit 22 ; agente voit ses dossiers (inchangé). Création OK.

-- ROLLBACK dossiers :
-- BEGIN;
--   DROP POLICY IF EXISTS dossiers_scope ON public.dossiers;
--   CREATE POLICY dossiers_scope ON public.dossiers FOR ALL TO authenticated
--     USING (((get_my_role()='admin') AND agence_id IN (SELECT id FROM agences WHERE societe_id=get_my_societe_id()))
--            OR (referente_id=auth.uid() AND agence_id=get_my_agence_id()))
--     WITH CHECK (((get_my_role()='admin') AND agence_id IN (SELECT id FROM agences WHERE societe_id=get_my_societe_id()))
--            OR (referente_id=auth.uid() AND agence_id=get_my_agence_id()));
-- COMMIT;


-- #############################################################################
-- MT6-3-B — clients  (referente SANS _id)
-- #############################################################################
SELECT policyname, cmd, qual FROM pg_policies
WHERE schemaname='public' AND tablename='clients' ORDER BY cmd, policyname;

BEGIN;

DROP POLICY IF EXISTS clients_scope ON public.clients;

CREATE POLICY clients_scope ON public.clients
  FOR ALL
  TO authenticated
  USING (
    (
      (SELECT public.get_my_role()) = 'admin'
      AND societe_id = (SELECT public.get_my_societe_id())
    )
    OR (
      referente = (SELECT auth.uid())
      AND agence_id = (SELECT public.get_my_agence_id())
    )
  )
  WITH CHECK (
    (
      (SELECT public.get_my_role()) = 'admin'
      AND societe_id = (SELECT public.get_my_societe_id())
    )
    OR (
      referente = (SELECT auth.uid())
      AND agence_id = (SELECT public.get_my_agence_id())
    )
  );

COMMIT;

SELECT policyname, cmd, qual FROM pg_policies
WHERE schemaname='public' AND tablename='clients' ORDER BY cmd, policyname;

-- RE-TEST clients (app) : admin 23 ; agente ~8 (ses clients). Création OK.

-- ROLLBACK clients :
-- BEGIN;
--   DROP POLICY IF EXISTS clients_scope ON public.clients;
--   CREATE POLICY clients_scope ON public.clients FOR ALL TO authenticated
--     USING (((get_my_role()='admin') AND agence_id IN (SELECT id FROM agences WHERE societe_id=get_my_societe_id()))
--            OR (referente=auth.uid() AND agence_id=get_my_agence_id()))
--     WITH CHECK (((get_my_role()='admin') AND agence_id IN (SELECT id FROM agences WHERE societe_id=get_my_societe_id()))
--            OR (referente=auth.uid() AND agence_id=get_my_agence_id()));
-- COMMIT;


-- #############################################################################
-- MT6-3-C — artisans  (annuaire société : tout le staff)
-- #############################################################################
SELECT policyname, cmd, qual FROM pg_policies
WHERE schemaname='public' AND tablename='artisans' ORDER BY cmd, policyname;

BEGIN;

DROP POLICY IF EXISTS artisans_scope ON public.artisans;

CREATE POLICY artisans_scope ON public.artisans
  FOR ALL
  TO authenticated
  USING (
    (SELECT public.get_my_role()) IN ('admin','agente')
    AND societe_id = (SELECT public.get_my_societe_id())
  )
  WITH CHECK (
    (SELECT public.get_my_role()) IN ('admin','agente')
    AND societe_id = (SELECT public.get_my_societe_id())
  );

COMMIT;

SELECT policyname, cmd, qual FROM pg_policies
WHERE schemaname='public' AND tablename='artisans' ORDER BY cmd, policyname;

-- RE-TEST artisans (app) : admin ET agente voient tous les artisans de la société (53). Création OK.

-- ROLLBACK artisans :
-- BEGIN;
--   DROP POLICY IF EXISTS artisans_scope ON public.artisans;
--   CREATE POLICY artisans_scope ON public.artisans FOR ALL TO authenticated
--     USING ((get_my_role() IN ('admin','agente')) AND agence_id IN (SELECT id FROM agences WHERE societe_id=get_my_societe_id()))
--     WITH CHECK ((get_my_role() IN ('admin','agente')) AND agence_id IN (SELECT id FROM agences WHERE societe_id=get_my_societe_id()));
-- COMMIT;


-- #############################################################################
-- MT6-3-D — redevances (4 policies : select/update branche admin -> societe_id ;
--           insert/delete -> societe_id)
-- #############################################################################
SELECT policyname, cmd, qual, with_check FROM pg_policies
WHERE schemaname='public' AND tablename='redevances' ORDER BY cmd, policyname;

BEGIN;

DROP POLICY IF EXISTS redevances_select        ON public.redevances;
DROP POLICY IF EXISTS redevances_update        ON public.redevances;
DROP POLICY IF EXISTS redevances_insert_admin  ON public.redevances;
DROP POLICY IF EXISTS redevances_delete_admin  ON public.redevances;

-- SELECT : admin (société) OU agente (les siennes)
CREATE POLICY redevances_select ON public.redevances
  FOR SELECT
  TO authenticated
  USING (
    (
      (SELECT public.get_my_role()) = 'admin'
      AND societe_id = (SELECT public.get_my_societe_id())
    )
    OR agente_id = (SELECT auth.uid())
  );

-- UPDATE : idem (agente édite statut payé ; montant/agence/societe protégés par trigger)
CREATE POLICY redevances_update ON public.redevances
  FOR UPDATE
  TO authenticated
  USING (
    (
      (SELECT public.get_my_role()) = 'admin'
      AND societe_id = (SELECT public.get_my_societe_id())
    )
    OR agente_id = (SELECT auth.uid())
  )
  WITH CHECK (
    (
      (SELECT public.get_my_role()) = 'admin'
      AND societe_id = (SELECT public.get_my_societe_id())
    )
    OR agente_id = (SELECT auth.uid())
  );

-- INSERT : admin de la société (societe_id dérivé par trigger AVANT le WITH CHECK ?
--   ⚠️ NB : le trigger BEFORE INSERT pose NEW.societe_id ; le WITH CHECK est évalué
--   APRÈS les triggers BEFORE -> societe_id sera rempli au moment du check. OK.)
CREATE POLICY redevances_insert_admin ON public.redevances
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT public.get_my_role()) = 'admin'
    AND societe_id = (SELECT public.get_my_societe_id())
  );

-- DELETE : admin de la société
CREATE POLICY redevances_delete_admin ON public.redevances
  FOR DELETE
  TO authenticated
  USING (
    (SELECT public.get_my_role()) = 'admin'
    AND societe_id = (SELECT public.get_my_societe_id())
  );

COMMIT;

SELECT policyname, cmd, qual, with_check FROM pg_policies
WHERE schemaname='public' AND tablename='redevances' ORDER BY cmd, policyname;

-- RE-TEST redevances (app) : agente voit ses 5 redevances + statut payé OK ;
--   admin bascule F2 -> redevance créée (societe_id posé par trigger, WITH CHECK passe).

-- ROLLBACK redevances :
-- BEGIN;
--   DROP POLICY IF EXISTS redevances_select ON public.redevances;
--   DROP POLICY IF EXISTS redevances_update ON public.redevances;
--   DROP POLICY IF EXISTS redevances_insert_admin ON public.redevances;
--   DROP POLICY IF EXISTS redevances_delete_admin ON public.redevances;
--   CREATE POLICY redevances_select ON public.redevances FOR SELECT TO authenticated
--     USING (((get_my_role()='admin') AND agente_id IN (SELECT id FROM profiles WHERE societe_id=get_my_societe_id())) OR agente_id=auth.uid());
--   CREATE POLICY redevances_update ON public.redevances FOR UPDATE TO authenticated
--     USING (((get_my_role()='admin') AND agente_id IN (SELECT id FROM profiles WHERE societe_id=get_my_societe_id())) OR agente_id=auth.uid())
--     WITH CHECK (((get_my_role()='admin') AND agente_id IN (SELECT id FROM profiles WHERE societe_id=get_my_societe_id())) OR agente_id=auth.uid());
--   CREATE POLICY redevances_insert_admin ON public.redevances FOR INSERT TO authenticated
--     WITH CHECK ((get_my_role()='admin') AND agence_id IN (SELECT id FROM agences WHERE societe_id=get_my_societe_id()));
--   CREATE POLICY redevances_delete_admin ON public.redevances FOR DELETE TO authenticated
--     USING ((get_my_role()='admin') AND agence_id IN (SELECT id FROM agences WHERE societe_id=get_my_societe_id()));
-- COMMIT;
