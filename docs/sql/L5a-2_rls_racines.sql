-- =============================================================================
-- L5a-2 — RLS racines : dossiers, clients, artisans
-- =============================================================================
-- Phase 3, tables racines. Ajoute le cloisonnement société/agence au-dessus du
-- cloisonnement par référente existant. Helpers SECURITY DEFINER (bypass RLS).
--
-- 3 patterns DIFFÉRENTS (cf. règles métier tranchées) :
--   - dossiers : agente voit SES dossiers (referente_id = uid) + son agence ;
--                admin voit les dossiers des agences de SA société ;
--                client lit ses dossiers (par identité, inchangé).
--   - clients  : MÊME pattern que dossiers, mais colonne référente = "referente"
--                (SANS _id !). client lit son propre client (par identité).
--   - artisans : ANNUAIRE COMMUN À LA SOCIÉTÉ. Tout le staff (admin+agente) de la
--                société voit tous les artisans des agences de cette société.
--                Société B ne voit pas les artisans de société A. Pas de branche client.
--
-- Pattern admin / "ma société" : agence_id IN (SELECT id FROM agences WHERE
--   societe_id = get_my_societe_id()) — les tables portent agence_id, pas societe_id.
-- Défense en profondeur agente : referente = uid AND agence_id = get_my_agence_id().
--
-- ⚠️ DROP de TOUTES les anciennes policies avant CREATE (elles s'additionnent en OR :
--    en oublier une permissive = cloisonnement inutile).
--
-- Méthode : appliquer MAIN, 3 SOUS-ÉTAPES indépendantes (dossiers / clients /
--   artisans), contrôle avant/après + smoke test entre chaque, rollback par table.
-- =============================================================================


-- #############################################################################
-- L5a-2-A — dossiers
-- #############################################################################

-- CONTRÔLE AVANT
SELECT policyname, cmd, roles FROM pg_policies
WHERE schemaname='public' AND tablename='dossiers' ORDER BY cmd, policyname;
-- Attendu : dossiers_staff (ALL), client_read_own_dossier (SELECT).

-- Compteur de référence (pour smoke test après) : combien de dossiers au total.
SELECT count(*) AS total_dossiers FROM public.dossiers;
-- Attendu : 21 (ou 19 si les 2 dossiers test supprimés hier -> à confirmer).

-- APPLICATION
BEGIN;

DROP POLICY IF EXISTS dossiers_staff           ON public.dossiers;
DROP POLICY IF EXISTS client_read_own_dossier  ON public.dossiers;

-- Staff : admin (société) OU agente (ses dossiers + son agence)
CREATE POLICY dossiers_scope ON public.dossiers
  FOR ALL
  TO authenticated
  USING (
    (
      (SELECT public.get_my_role()) = 'admin'
      AND agence_id IN (SELECT id FROM public.agences WHERE societe_id = (SELECT public.get_my_societe_id()))
    )
    OR (
      referente_id = (SELECT auth.uid())
      AND agence_id = (SELECT public.get_my_agence_id())
    )
  )
  WITH CHECK (
    (
      (SELECT public.get_my_role()) = 'admin'
      AND agence_id IN (SELECT id FROM public.agences WHERE societe_id = (SELECT public.get_my_societe_id()))
    )
    OR (
      referente_id = (SELECT auth.uid())
      AND agence_id = (SELECT public.get_my_agence_id())
    )
  );

-- Client : lit ses propres dossiers (par identité, inchangé)
CREATE POLICY dossiers_client_read ON public.dossiers
  FOR SELECT
  TO authenticated
  USING (
    client_id IN (SELECT client_id FROM public.profiles WHERE id = (SELECT auth.uid()))
  );

COMMIT;

-- CONTRÔLE APRÈS
SELECT policyname, cmd, roles, qual, with_check FROM pg_policies
WHERE schemaname='public' AND tablename='dossiers' ORDER BY cmd, policyname;
-- Attendu : dossiers_scope (ALL, authenticated) + dossiers_client_read (SELECT, authenticated).

-- SMOKE TEST dossiers (DANS L'APP) :
-- 1) Admin (Marine) : liste chantiers -> voit TOUS les dossiers (21). KPI inchangés.
-- 2) Agente : liste chantiers -> voit UNIQUEMENT ses dossiers (referente = elle).
--    Ouvre un de ses dossiers -> OK. Crée un dossier -> OK (WITH CHECK : referente=elle, agence=la sienne).
-- 3) (si possible) compte client : voit son/ses dossiers seulement.

-- ROLLBACK dossiers :
-- BEGIN;
--   DROP POLICY IF EXISTS dossiers_scope        ON public.dossiers;
--   DROP POLICY IF EXISTS dossiers_client_read  ON public.dossiers;
--   CREATE POLICY dossiers_staff ON public.dossiers FOR ALL
--     USING ((get_my_role()='admin') OR (referente_id = auth.uid()))
--     WITH CHECK ((get_my_role()='admin') OR (referente_id = auth.uid()));
--   CREATE POLICY client_read_own_dossier ON public.dossiers FOR SELECT
--     USING (client_id IN (SELECT client_id FROM profiles WHERE id = auth.uid()));
-- COMMIT;



-- #############################################################################
-- L5a-2-B — clients  (⚠️ colonne référente = "referente" SANS _id)
-- #############################################################################

-- CONTRÔLE AVANT
SELECT policyname, cmd, roles FROM pg_policies
WHERE schemaname='public' AND tablename='clients' ORDER BY cmd, policyname;
-- Attendu : 5 policies (staff_all_clients ALL, Insertion/Lecture/Modification clients,
--           client_read_own_client SELECT). TOUTES à DROP.

SELECT count(*) AS total_clients FROM public.clients;
-- Attendu : ~15 (23 - 8 clients test supprimés hier -> à confirmer).

-- APPLICATION
BEGIN;

DROP POLICY IF EXISTS staff_all_clients       ON public.clients;
DROP POLICY IF EXISTS "Insertion clients"     ON public.clients;
DROP POLICY IF EXISTS "Lecture clients"       ON public.clients;
DROP POLICY IF EXISTS "Modification clients"  ON public.clients;
DROP POLICY IF EXISTS client_read_own_client  ON public.clients;

-- Staff : admin (société) OU agente (ses clients via "referente" + son agence)
CREATE POLICY clients_scope ON public.clients
  FOR ALL
  TO authenticated
  USING (
    (
      (SELECT public.get_my_role()) = 'admin'
      AND agence_id IN (SELECT id FROM public.agences WHERE societe_id = (SELECT public.get_my_societe_id()))
    )
    OR (
      referente = (SELECT auth.uid())
      AND agence_id = (SELECT public.get_my_agence_id())
    )
  )
  WITH CHECK (
    (
      (SELECT public.get_my_role()) = 'admin'
      AND agence_id IN (SELECT id FROM public.agences WHERE societe_id = (SELECT public.get_my_societe_id()))
    )
    OR (
      referente = (SELECT auth.uid())
      AND agence_id = (SELECT public.get_my_agence_id())
    )
  );

-- Client : se lit lui-même (par identité, inchangé)
CREATE POLICY clients_client_read ON public.clients
  FOR SELECT
  TO authenticated
  USING (
    id IN (SELECT client_id FROM public.profiles WHERE id = (SELECT auth.uid()))
  );

COMMIT;

-- CONTRÔLE APRÈS
SELECT policyname, cmd, roles, qual, with_check FROM pg_policies
WHERE schemaname='public' AND tablename='clients' ORDER BY cmd, policyname;
-- Attendu : clients_scope (ALL) + clients_client_read (SELECT), tous authenticated.

-- SMOKE TEST clients (DANS L'APP) :
-- 1) Admin : liste clients -> voit TOUS les clients. KPI/compteurs OK.
-- 2) Agente : liste clients -> voit UNIQUEMENT ses clients (referente = elle).
--    ⚠️ C'est le test du trou corrigé : avant, staff_all_clients laissait l'agente
--       voir TOUS les clients. Maintenant elle ne doit voir que les siens.
--    Crée un client -> OK. Ouvre un de ses clients -> OK.
-- 3) compte client : se voit lui-même.

-- ROLLBACK clients :
-- BEGIN;
--   DROP POLICY IF EXISTS clients_scope        ON public.clients;
--   DROP POLICY IF EXISTS clients_client_read  ON public.clients;
--   CREATE POLICY staff_all_clients ON public.clients FOR ALL
--     USING (EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role=ANY(ARRAY['admin','agente'])))
--     WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role=ANY(ARRAY['admin','agente'])));
--   CREATE POLICY "Insertion clients" ON public.clients FOR INSERT
--     WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role=ANY(ARRAY['admin','agente'])));
--   CREATE POLICY "Lecture clients" ON public.clients FOR SELECT
--     USING (auth.uid() IN (SELECT id FROM profiles WHERE role=ANY(ARRAY['admin','agente'])));
--   CREATE POLICY "Modification clients" ON public.clients FOR UPDATE
--     USING (auth.uid() IN (SELECT id FROM profiles WHERE role=ANY(ARRAY['admin','agente'])));
--   CREATE POLICY client_read_own_client ON public.clients FOR SELECT
--     USING (id IN (SELECT client_id FROM profiles WHERE id = auth.uid()));
-- COMMIT;



-- #############################################################################
-- L5a-2-C — artisans  (ANNUAIRE COMMUN SOCIÉTÉ — pas de référente, pas de client)
-- #############################################################################

-- CONTRÔLE AVANT
SELECT policyname, cmd, roles FROM pg_policies
WHERE schemaname='public' AND tablename='artisans' ORDER BY cmd, policyname;
-- Attendu : 4 policies (staff_delete_artisans DELETE, Insertion/Lecture/Modification). TOUTES à DROP.

SELECT count(*) AS total_artisans FROM public.artisans;
-- Attendu : 53.

-- APPLICATION
BEGIN;

DROP POLICY IF EXISTS staff_delete_artisans    ON public.artisans;
DROP POLICY IF EXISTS "Insertion artisans"     ON public.artisans;
DROP POLICY IF EXISTS "Lecture artisans"       ON public.artisans;
DROP POLICY IF EXISTS "Modification artisans"  ON public.artisans;

-- Annuaire commun société : tout le staff (admin + agente) de la société voit
-- et gère tous les artisans des agences de SA société. Société B exclue.
CREATE POLICY artisans_scope ON public.artisans
  FOR ALL
  TO authenticated
  USING (
    (SELECT public.get_my_role()) IN ('admin','agente')
    AND agence_id IN (SELECT id FROM public.agences WHERE societe_id = (SELECT public.get_my_societe_id()))
  )
  WITH CHECK (
    (SELECT public.get_my_role()) IN ('admin','agente')
    AND agence_id IN (SELECT id FROM public.agences WHERE societe_id = (SELECT public.get_my_societe_id()))
  );

COMMIT;

-- CONTRÔLE APRÈS
SELECT policyname, cmd, roles, qual, with_check FROM pg_policies
WHERE schemaname='public' AND tablename='artisans' ORDER BY cmd, policyname;
-- Attendu : artisans_scope (ALL, authenticated) seul.

-- SMOKE TEST artisans (DANS L'APP) :
-- 1) Admin : liste artisans -> voit TOUS les artisans (53).
-- 2) Agente : liste artisans -> voit AUSSI tous les artisans de la société (annuaire
--    commun). C'est voulu : ce n'est PAS cloisonné par référente, contrairement à
--    dossiers/clients. Crée un artisan -> OK.
-- 3) (multi-société futur) une société B ne verrait pas ces artisans.

-- ROLLBACK artisans :
-- BEGIN;
--   DROP POLICY IF EXISTS artisans_scope ON public.artisans;
--   CREATE POLICY staff_delete_artisans ON public.artisans FOR DELETE
--     USING (EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role=ANY(ARRAY['admin','agente'])));
--   CREATE POLICY "Insertion artisans" ON public.artisans FOR INSERT
--     WITH CHECK (get_my_role()=ANY(ARRAY['admin','agente']));
--   CREATE POLICY "Lecture artisans" ON public.artisans FOR SELECT
--     USING (get_my_role()=ANY(ARRAY['admin','agente']));
--   CREATE POLICY "Modification artisans" ON public.artisans FOR UPDATE
--     USING (get_my_role()=ANY(ARRAY['admin','agente']));
-- COMMIT;
